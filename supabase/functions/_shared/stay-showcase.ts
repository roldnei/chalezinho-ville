import {offerIssues} from './stay-offers.ts';
// Verified against Portaria MGI 11.460/2025, calendar 2026. Local dates belong in PMS.
const nationalHolidays2026=['2026-01-01','2026-04-03','2026-04-21','2026-05-01','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25'];
type Row = Record<string, any>;
let cached: {key: string; until: number; result: Promise<Row>} | null = null;
/** Short isolate-local cache avoids repeatedly fetching calendars on the home page.
 * Catalog edits change the key immediately; checkout always performs a fresh search. */
export async function cachedWeekdayShowcase(deps: Row) {
  const data = await deps.catalog();
  const key = deps.today + ':' + JSON.stringify(data);
  if (cached?.key === key && cached.until > Date.now()) return cached.result;
  const result = weekdayShowcase({...deps, catalog: async () => data});
  const entry = {key, until: Date.now() + 60000, result}; cached = entry;
  try { return await result; } catch (error) { if (cached === entry) cached = null; throw error; }
}
export function showcaseSettings(input: Row = {}) {
  const nights = [...new Set(input.nights ?? [2, 3])] as number[];
  const horizon_days = Number(input.horizon_days ?? 60);
  if (!nights.length || nights.length > 4 || nights.some(n => !Number.isInteger(n) || n < 1 || n > 7)
    || !Number.isInteger(horizon_days) || horizon_days < 14 || horizon_days > 90) throw Error('invalid_showcase');
  const holidays=Array.isArray(input.holidays)?input.holidays:[];if(holidays.length>100||holidays.some((d:any)=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw Error('invalid_showcase');
  return {enabled: input.enabled === true, nights, horizon_days,celebrations:input.celebrations===true,celebration_discount:input.celebration_discount===true,holidays};
}
export function isCelebration(start:string,end:string,settings:Row={}){for(let d=start;d<end;d=shift(d,1)){const day=new Date(d+'T12:00:00Z').getUTCDay();if(day<1||day>4||nationalHolidays2026.includes(d)||settings.holidays?.includes(d))return true}return false}
function shift(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function weekdayWindows(today: string, settings: Row, offer: Row) {
  const result: {check_in: string; check_out: string; nights: number}[] = [];
  for (let offset = 1; offset <= settings.horizon_days; offset++) {
    for (const nights of settings.nights) {
      const check_in = shift(today, offset), check_out = shift(check_in, nights);
      if (nights < offer.min_nights || offer.max_nights && nights > offer.max_nights
        || offer.start_date && check_in < offer.start_date || offer.end_date && check_out > offer.end_date) continue;
      // Every occupied night must be Monday–Thursday. Friday checkout is allowed.
      const celebration=isCelebration(check_in,check_out,settings);if(celebration&&!settings.celebrations)continue;
      result.push({check_in, check_out, nights,...(celebration?{category:'celebration'}:{})});
    }
  }
  return result;
}
/** Read-only merchandising: the booking engine rechecks and contracts on selection. */
export async function weekdayShowcase({catalog, today, sources, search, quote}: Row) {
  const data = await catalog();
  const offers = data.offers.filter((o: Row) => o.status === 'active' && o.showcase?.enabled).slice(0, 10);
  const checked_at = new Date().toISOString();
  if (!offers.length) return {cards: [], offers: [], properties: [], checked_at};
  const horizon = Math.max(...offers.map((o: Row) => showcaseSettings(o.showcase).horizon_days));
  const input = await sources(shift(today, 1), shift(today, horizon + 8));
  const candidates: Row[] = [];
  const searches = new Map<string, Promise<Row[]>>();
  for (const offer of offers) {
    const grouped = new Map<string, Row[]>();
    for (const window of weekdayWindows(today, showcaseSettings(offer.showcase), offer)) {
      const key = window.check_in + ':' + window.check_out;
      if (!searches.has(key)) searches.set(key, search(window.check_in, window.check_out, input));
      for (const property of await searches.get(key)!) {
        if (!property.available || !offer.property_ids.map(Number).includes(Number(property.id))) continue;
        const groupKey = property.id + ':' + window.nights+':'+(window as Row).category;
        const rows = grouped.get(groupKey) || [];
        const reservations=Array.isArray(input)?input[1]?.data||[]:[];const gap=reservations.some((r:Row)=>r.property_id===property.id&&r.status==='confirmed'&&r.check_out===window.check_in)&&reservations.some((r:Row)=>r.property_id===property.id&&r.status==='confirmed'&&r.check_in===window.check_out);
        rows.push({offer, property,gap, ...window}); grouped.set(groupKey, rows);
      }
    }
    // Check backup windows too: an inexpensive date can have no preparation capacity.
    for (const rows of grouped.values()) candidates.push(...rows.sort((a, b) => Number(b.gap)-Number(a.gap)||a.property.base_price - b.property.base_price || a.check_in.localeCompare(b.check_in)).slice(0, 2));
  }
  const cards: Row[] = [];
  const bounded = candidates.slice(0, 60);
  for (let i = 0; i < bounded.length; i += 4) {
    const results = await Promise.all(bounded.slice(i, i + 4).map(async c => {
      try {
        const q = await quote({property_id: c.property.id, check_in: c.check_in, check_out: c.check_out, guests: 2, stay_offer_id: c.offer.id}, [c.property], data);
        const rate = q.rate_options.filter((r: Row) => r.selectable && Number.isSafeInteger(r.total_amount_cents))
          .sort((a: Row, b: Row) => a.total_amount_cents - b.total_amount_cents)[0];
        if (!rate) return null;
        const media=c.offer.villegram?.photos?.filter((m:Row)=>m.property_id===Number(c.property.id));
        const reservations=Array.isArray(input)?input[1]?.data||[]:[];const gap=reservations.some((r:Row)=>r.property_id===c.property.id&&r.status==='confirmed'&&r.check_out===c.check_in)&&reservations.some((r:Row)=>r.property_id===c.property.id&&r.status==='confirmed'&&r.check_in===c.check_out);
        return {category:c.category||'weekday',gap, demand_reason:gap?'Intervalo livre entre reservas confirmadas. Avaliação por calendário, sem histórico suficiente de procura.':'Sugestão por regras de calendário. Não representa previsão de baixa demanda; histórico de procura insuficiente.',offer_id: c.offer.id, offer_name: c.offer.name, property_id: c.property.id, property_code: c.property.code,
          property_name: c.property.name, image: media?.[0]?.url || c.offer.media?.[0] || c.property.cover_image,
          check_in: c.check_in, check_out: c.check_out, nights: c.nights, guests: 2,
          rate_code: rate.code, rate_name: rate.name, total_cents: rate.total_amount_cents,
          gross_cents: rate.contract_snapshot.gross_cents, discount_cents: rate.contract_snapshot.discount_cents,
          experiences: q.experiences.map((p: Row) => p.composition), cancellation_policy: rate.cancellation_policy};
      } catch { return null; }
    }));
    cards.push(...results.filter(Boolean));
  }
  // Keep two- and three-night choices visible, rather than letting one duration dominate.
  const groups = new Map<string, Row[]>();
  for (const c of cards.sort((a, b) => Number(b.gap)-Number(a.gap)||Number(a.category==='celebration')-Number(b.category==='celebration')||a.total_cents - b.total_cents || a.check_in.localeCompare(b.check_in))) {
    const key=c.property_id+':'+c.offer_id+':'+c.nights+':'+c.category;const rows = groups.get(key) || []; rows.push(c); groups.set(key, rows);
  }
  const selected: Row[] = [];
  while (selected.length < 18 && [...groups.values()].some(rows => rows.length)) {
    for (const rows of groups.values()) { if (rows.length && selected.length < 18) selected.push(rows.shift()!); }
  }
  const publicOffers=data.offers.map((o:Row)=>({...o,issues_by_property:Object.fromEntries(o.property_ids.map((id:number)=>[id,offerIssues(o,data.products||[],id)])),packages:(data.products||[]).filter((p:Row)=>o.product_ids?.includes(p.id))}));
  const properties=(Array.isArray(input)?input[0]?.data||[]:[]).map((p:Row)=>({id:p.id,code:p.code,name:p.name,cover_image:p.cover_image,gallery:p.gallery||[]}));
  return {cards: selected,offers:publicOffers,properties, checked_at, horizon_days: horizon};
}
