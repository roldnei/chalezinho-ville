import {brazilClock, shiftDate} from './availability.ts';

const MAX_NIGHT_CENTS = 10_000_000;
const MAX_PERIODS = 1000;
const discountLimits = {weekly: [7, 1125], monthly: [28, 1125], advance: [1, 365], last_minute: [0, 365]} as const;
type DiscountKind = keyof typeof discountLimits;
type Discount = {kind: DiscountKind; days: number; bps: number};
type PricePeriod = {start: string; end: string; cents: number};
type OwnPricing = {weekdays_cents: number[]; periods: PricePeriod[]; mode: "auto" | "own"; discounts: Discount[]};
type Night = {date: string; price_cents: number; price: number; source: "own" | "pricelabs"};
type Listing = {id: string; pms: string};
type RemotePrices = {ok: boolean; listings: Map<string, any>};

const validCents = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_NIGHT_CENTS;
const validDay = (day: unknown): day is string =>
  typeof day === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day)) && shiftDate(day, 0) === day;

export function normalizeOwnPricing(input: any): OwnPricing {
  if (!Array.isArray(input?.weekdays_cents) || input.weekdays_cents.length !== 7 ||
      !input.weekdays_cents.every(validCents) || !Array.isArray(input.periods) ||
      input.periods.length > MAX_PERIODS) throw Error('invalid_own_pricing');
  const periods: PricePeriod[] = input.periods.map((period: any) => {
    if (!validDay(period?.start) || !validDay(period?.end) || period.end < period.start ||
        !validCents(period.cents)) throw Error('invalid_own_pricing');
    return {start: period.start, end: period.end, cents: period.cents};
  }).sort((a: PricePeriod, b: PricePeriod) => a.start.localeCompare(b.start));
  if (periods.some((period, i) => i > 0 && period.start <= periods[i - 1].end))
    throw Error('overlapping_own_pricing');
  const mode = input.mode === undefined ? 'auto' : input.mode;
  const rules = input.discounts === undefined ? [] : input.discounts;
  if (!['auto', 'own'].includes(mode) || !Array.isArray(rules) || rules.length > 4)
    throw Error('invalid_own_pricing');
  const discounts: Discount[] = rules.map((rule: any) => {
    const limits = Object.hasOwn(discountLimits, rule?.kind) && discountLimits[rule.kind as DiscountKind];
    if (!limits || !Number.isInteger(rule.days) || rule.days < limits[0] || rule.days > limits[1] ||
        !Number.isInteger(rule.bps) || rule.bps < 1 || rule.bps > 9900) throw Error('invalid_own_pricing');
    return {kind: rule.kind, days: rule.days, bps: rule.bps};
  });
  if (new Set(discounts.map(rule => rule.kind)).size !== discounts.length) throw Error('invalid_own_pricing');
  return {weekdays_cents: [...input.weekdays_cents], periods, mode, discounts};
}

export function priceLabsListing(integration: any): Listing | null {
  const id = String(integration?.external_listing_id ?? '').trim();
  const pms = String(integration?.pms ?? '').trim().toLowerCase();
  if (!integration?.active || integration.provider !== 'pricelabs' || !id || !pms) return null;
  return {id, pms};
}

const listingKey = ({id, pms}: Listing) => JSON.stringify([id, pms]);

export async function loadPropertyPriceLabs(
  integrations: any[], start: string, end: string,
  load: (listings: Listing[], start: string, end: string) => Promise<unknown>,
): Promise<RemotePrices> {
  const requested = new Map<string, Listing>();
  for (const integration of integrations) {
    const listing = priceLabsListing(integration);
    if (listing) requested.set(listingKey(listing), listing);
  }
  const listings = new Map<string, any>();
  if (!requested.size) return {ok: true, listings};
  try {
    const rows = await load([...requested.values()], start, end);
    if (!Array.isArray(rows)) return {ok: false, listings};
    const duplicates = new Set<string>();
    for (const row of rows) {
      const id = String(row?.id ?? '');
      const explicitPms = String(row?.pms ?? '').toLowerCase();
      const candidates = [...requested.values()].filter(x => x.id === id && (!explicitPms || x.pms === explicitPms));
      if (candidates.length !== 1) continue;
      const key = listingKey(candidates[0]);
      if (listings.has(key)) duplicates.add(key);
      listings.set(key, row);
    }
    for (const key of duplicates) listings.delete(key);
    return {ok: true, listings};
  } catch {
    return {ok: false, listings};
  }
}

// Round each provider night once, including exact half cents, before adding.
function providerCents(value: unknown): number | null {
  const match = /^(\d{1,8})(?:\.(\d+))?$/.exec(String(value ?? ''));
  if (!match) return null;
  const fractional = (match[2] ?? '').padEnd(3, '0');
  const cents = Number(match[1]) * 100 + Number(fractional.slice(0, 2)) + (Number(fractional[2]) >= 5 ? 1 : 0);
  return validCents(cents) ? cents : null;
}

export function resolvePropertyPricing(
  own: OwnPricing | null, integration: any, remote: RemotePrices, start: string, end: string,
  now = new Date(), applyDiscount = true,
) {
  const dates: string[] = [];
  for (let date = start; date < end; date = shiftDate(date, 1)) dates.push(date);
  const listing = priceLabsListing(integration);
  const row = listing && remote.listings.get(listingKey(listing));
  const rows = row?.days ?? row?.data;
  const daily = new Map<string, any>();
  if (Array.isArray(rows) && (!row.currency || row.currency === 'BRL')) {
    for (const day of rows) {
      if (!day?.date || day.date < start || day.date >= end) continue;
      daily.set(day.date, daily.has(day.date) ? null : day);
    }
  }

  const options = dates.map(date => ({
    date,
    manual: own?.periods.find(period => date >= period.start && date <= period.end),
    provider: providerCents(daily.get(date)?.price ?? daily.get(date)?.user_price),
    weekday: new Date(date + 'T12:00:00Z').getUTCDay(),
  }));
  const useProvider = integration?.active && own?.mode !== 'own';
  const complete = useProvider && options.every(day => day.manual || day.provider !== null);
  const fallbackReason = !useProvider || complete ? null : !listing ? 'pricelabs_mapping_invalid' :
    !remote.ok ? 'pricelabs_unavailable' : 'pricelabs_incomplete';
  const days: Night[] = [];
  for (const day of options) {
    const external = complete && !day.manual && day.provider !== null;
    const price = external ? day.provider : day.manual?.cents ?? own?.weekdays_cents[day.weekday];
    if (price == null) return {source: null, fallbackReason, days: null, totalCents: null, minStay: 1, discountBps: 0};
    days.push({date: day.date, price_cents: price, price: price / 100, source: external ? 'pricelabs' : 'own'});
  }
  const hasExternal = days.some(day => day.source === 'pricelabs');
  const source = !days.length ? null : !hasExternal ? 'own' :
    days.every(day => day.source === 'pricelabs') ? 'pricelabs' : 'mixed';
  const min = useProvider ? Number(daily.get(start)?.min_stay ?? 1) : 1;
  const lead = (Date.parse(start) - Date.parse(brazilClock(now).date)) / 86400000;
  const discountBps = applyDiscount && source === 'own' ? Math.max(0, ...(own?.discounts ?? [])
    .filter(rule => rule.kind === 'advance' ? lead >= rule.days :
      rule.kind === 'last_minute' ? lead >= 0 && lead <= rule.days : dates.length >= rule.days)
    .map(rule => rule.bps)) : 0;
  for (const day of days) {
    day.price_cents = Math.max(1, Math.round(day.price_cents * (10000 - discountBps) / 10000));
    day.price = day.price_cents / 100;
  }
  return {source, fallbackReason, days, totalCents: days.length ? days.reduce((sum, day) => sum + day.price_cents, 0) : null,
    minStay: Number.isInteger(min) && min > 0 ? min : 1, discountBps};
}
