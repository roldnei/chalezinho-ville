(() => {
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const discountOptions = [
  ['weekly', 'Estadia semanal', 7, 1125, 7], ['monthly', 'Estadia mensal', 28, 1125, 28],
  ['advance', 'Reserva antecipada', 1, 365, 30], ['last_minute', 'Última hora', 0, 365, 3],
];
const shift = (day, delta) => new Date(Date.parse(day + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();
const decimal = cents => cents == null ? '' : (cents / 100).toFixed(2);
function parseCents(raw) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(value) && value > 0 && value <= 10000000 ? value : null;
}
const amount = (name, label, cents) => `<label>${label}<input name="${name}" inputmode="decimal" value="${decimal(cents)}" placeholder="0,00" maxlength="12"></label>`;
const baseFields = pricing => `<div class="admin-form-grid">${amount('base_price', 'Diária padrão (R$)', pricing?.weekdays_cents[0])}
  ${amount('weekend_price', 'Sexta e sábado (opcional)', pricing?.weekdays_cents[5] !== pricing?.weekdays_cents[0] ? pricing?.weekdays_cents[5] : null)}</div>
  <details ${pricing ? 'open' : ''}><summary>Personalizar por dia da semana</summary><p>Campos em branco usam a diária padrão ou a de fim de semana.</p>
  <div class="price-weekdays">${weekdays.map((day, i) => {
    const value = pricing?.weekdays_cents[i], base = pricing?.weekdays_cents[i === 5 || i === 6 ? 5 : 0];
    return amount('price_' + i, day, value !== base ? value : null);
  }).join('')}</div></details>`;
function readBase(elements) {
  const base = parseCents(elements.base_price.value);
  const weekend = elements.weekend_price.value.trim() ? parseCents(elements.weekend_price.value) : base;
  const values = weekdays.map((_, i) => {
    const field = elements['price_' + i].value;
    return field.trim() ? parseCents(field) : i === 5 || i === 6 ? weekend : base;
  });
  if (!base || !weekend || values.some(value => !value)) throw Error('invalid_own_pricing');
  return values;
}

// Replace only the selected nights and compact adjacent nights with the same price.
function editPeriods(periods, start, end, days, valueFor) {
  const unchanged = periods.filter(period => period.end < start || period.start > end);
  const overlaps = periods.filter(period => period.end >= start && period.start <= end);
  for (const period of overlaps) {
    if (period.start < start) unchanged.push({...period, end: shift(start, -1)});
    if (period.end > end) unchanged.push({...period, start: shift(end, 1)});
  }
  for (let day = start; day <= end; day = shift(day, 1)) {
    const previous = overlaps.find(period => period.start <= day && period.end >= day)?.cents;
    const cents = days.includes(weekday(day)) ? valueFor(day, previous) : previous;
    if (cents) unchanged.push({start: day, end: day, cents});
  }
  const merged = [];
  for (const period of unchanged.sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged.at(-1);
    if (last && last.cents === period.cents && shift(last.end, 1) === period.start) last.end = period.end;
    else merged.push({...period});
  }
  return merged;
}

function mount(host, {property, api, block, back, availability, esc, brl, formatDate, today, initialMonth, initialSelection, onContext, onSaved}) {
  host.innerHTML = `<div class="pricing-calendar"><button type="button" class="workspace-back" data-price-back>← ${esc(property.name)}</button>
    <h2>Preços e calendário</h2><p class="price-context">${esc(property.code || property.name)} · <span data-price-context-month></span></p><div class="price-toolbar"><button type="button" data-prev aria-label="Mês anterior">‹</button>
      <input type="month" aria-label="Mês do calendário" data-price-month min="1900-01" max="9998-12" value="${initialMonth || today.slice(0, 7)}">
      <button type="button" data-next aria-label="Próximo mês">›</button><button type="button" data-today>Hoje</button>
      <button type="button" data-rules>Regras de disponibilidade</button></div>
    <p data-price-origin></p><div class="price-legend"><span>Hoje</span><span>Selecionado</span><span>Ocupado</span><span>Bloqueado</span><span>Sem preço</span></div><div class="price-grid" data-price-grid role="group" aria-label="Diárias e disponibilidade"></div>
    <form class="admin-form price-selection" data-selection><h3>Editar noites</h3><p>Clique em uma data e depois na última noite do período, ou informe as datas abaixo.</p>
      <div class="admin-form-grid"><label>Primeira noite<input name="start" type="date" required value="${initialSelection?.start || today}"></label>
      <label>Última noite (inclusive)<input name="end" type="date" required value="${initialSelection?.end || today}"></label></div><p data-selection-summary role="status"></p>
      <fieldset class="price-filter"><legend>Aplicar nestes dias da semana</legend>${weekdays.map((day,i) => `<label><input type="checkbox" value="${i}" name="weekday" checked> ${day}</label>`).join('')}</fieldset>
      <div class="admin-form-grid"><label>Alteração<select name="change"><option value="fixed">Definir diária manual</option><option value="percent">Ajustar tabela própria (%)</option><option value="restore">Remover diária manual</option></select></label>
        ${amount('value', 'Valor (R$)', null)}</div>
      <div class="price-toolbar"><button type="submit" class="admin-primary">Revisar alteração</button><button type="button" data-block>Bloquear período</button></div><label>Motivo do bloqueio<input data-block-reason maxlength="160" value="Uso do proprietário"></label>
      <div class="price-review" data-price-review hidden role="status"><strong>Confira antes de salvar</strong><p data-review-summary></p><button type="button" class="admin-primary" data-review-confirm>Confirmar alteração</button><button type="button" data-review-cancel>Voltar à edição</button></div>
      <div data-price-events></div></form>
    <form class="admin-form" data-defaults><h3>Tabela própria</h3><div data-base-fields></div>
      <label>Origem das diárias<select name="mode"><option value="auto">PriceLabs quando conectado, com diárias manuais e tabela de reserva</option><option value="own">Usar somente a tabela própria</option></select></label><p data-mode-help></p>
      <details><summary>Descontos da tabela própria</summary><p>Vale o maior desconto elegível nas estadias com todas as diárias próprias. Deixe a porcentagem em branco para desativar.</p><div data-discounts></div></details>
      <button type="submit" class="admin-primary">Salvar tabela própria</button></form>
    <p data-price-status role="status" aria-live="polite"></p></div>`;
  const root = host.firstElementChild, $ = selector => root.querySelector(selector);
  const month = $('[data-price-month]'), grid = $('[data-price-grid]');
  const selection = $('[data-selection]'), settings = $('[data-defaults]'), status = $('[data-price-status]');
  let pricing, calendar, anchor = null, version = 0, busy = false, pendingChange = null;
  const context = () => ({month:month.value,selection:{start:selection.elements.start.value,end:selection.elements.end.value}});
  const rememberContext = () => onContext?.(context());
  const review = (summary,action) => {pendingChange=action;$('[data-review-summary]').textContent=summary;$('[data-price-review]').hidden=false;$('[data-review-confirm]').focus()};
  const clearReview = () => {pendingChange=null;$('[data-price-review]').hidden=true};
  $('[data-review-confirm]').onclick=()=>{if(!pendingChange)return;const action=pendingChange;clearReview();change(action,'Alteração salva.').then(()=>{if(root.isConnected)selection.querySelector('[type=submit]').focus()})};
  $('[data-review-cancel]').onclick=()=>{clearReview();selection.elements.start.focus()};
  settings.elements.mode.onchange=()=>{const own=settings.elements.mode.value==='own';$('[data-mode-help]').textContent=own?'Somente a tabela própria será usada nas novas cotações. PriceLabs conectado não altera este modo.':'PriceLabs é usado quando houver diária sincronizada; se faltar preço, a tabela própria assume. Diárias manuais têm prioridade.'};

  function settingsFields() {
    $('[data-base-fields]').innerHTML = baseFields(pricing);
    settings.elements.mode.value = pricing?.mode || 'auto';
    settings.elements.mode.onchange();
    $('[data-discounts]').innerHTML = discountOptions.map(([kind, label, min, max, fallback]) => {
      const rule = pricing?.discounts?.find(item => item.kind === kind);
      return `<fieldset><legend>${label}</legend><div class="admin-form-grid"><label>${kind === 'last_minute' ? 'Até quantos dias antes' : kind === 'advance' ? 'A partir de quantos dias antes' : 'A partir de quantas noites'}
        <input type="number" name="${kind}_days" min="${min}" max="${max}" value="${rule?.days ?? fallback}"></label>
        ${amount(kind + '_discount', 'Desconto (%)', rule?.bps)}</div></fieldset>`;
    }).join('');
  }
  function showSelection() {
    const {start, end} = selection.elements;
    grid.querySelectorAll('[data-day]').forEach(button => {
      const day = button.dataset.day;
      button.setAttribute('aria-pressed', String(day >= start.value && day <= end.value));
    });
    const valid=start.value&&end.value&&end.value>=start.value;
    const count=valid?Math.round((Date.parse(end.value)-Date.parse(start.value))/86400000)+1:0;
    $('[data-selection-summary]').textContent=valid?`${count} noite${count===1?'':'s'} selecionada${count===1?'':'s'} · ${formatDate(start.value)} a ${formatDate(end.value)}`:'Escolha uma primeira e uma última noite válidas.';
    rememberContext();
    const events = (calendar?.events || []).filter(event => event.start <= end.value && event.end > start.value);
    const detail = $('[data-price-events]');
    detail.innerHTML = events.map(event => `<p>${esc(event.label)} · ${formatDate(event.start)} a ${formatDate(shift(event.end, -1))}
      ${event.block_id ? `<button type="button" data-release="${esc(event.block_id)}">Remover este bloqueio</button>` : ''}</p>`).join('');
  }
  function showCalendar() {
    const offset = weekday(month.value + '-01');
    const labels = {own: 'PMS', pricelabs: 'PriceLabs'};
    $('[data-price-context-month]').textContent=new Date(month.value+'-01T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
    grid.innerHTML = weekdays.map(day => `<strong>${day}</strong>`).join('') + '<span></span>'.repeat(offset) +
      calendar.days.map(day => {
        const events=calendar.events.filter(event => event.start <= day.date && event.end > day.date);
        const blocked=events.some(event=>event.block_id),occupied=events.length>0&&!blocked;
        const price = day.price_cents == null ? 'Sem preço' : brl(day.price_cents);
        const manual = pricing?.periods?.some(period => period.start <= day.date && period.end >= day.date);
        const source = manual ? 'Manual' : day.fallback_reason ? 'PMS reserva' : labels[day.source] || '';
        const state=blocked?'Bloqueado':occupied?'Ocupado':day.price_cents==null?'Sem preço':source;
        return `<button type="button" data-day="${day.date}" class="${blocked?'price-blocked':occupied?'price-occupied':day.price_cents==null?'price-missing':''}" ${day.date === today ? 'aria-current="date"' : ''}
          aria-label="${formatDate(day.date)}${day.date===today?', hoje':''}, ${price}${source ? ', ' + source : ''}, ${state}"><b>${Number(day.date.slice(-2))}${day.date===today?'<em>Hoje</em>':''}</b><span>${price}</span><small>${state}</small></button>`;
      }).join('');
    showSelection();
  }
  async function load() {
    if (!/^\d{4}-\d{2}$/.test(month.value)) return;
    const request = ++version, start = month.value + '-01';
    const end = shift(start.slice(0, 8) + '28', 4).slice(0, 7) + '-01';
    grid.textContent = 'Carregando…';
    try {
      const data = await api('admin_property_action', {operation:'pricing_calendar', id:property.id, start, end});
      if (!root.isConnected || request !== version) return;
      calendar = data;
      pricing = data.property.own_pricing;
      settingsFields();
      onSaved?.(data.property);
      $('[data-price-origin]').textContent = [
        pricing?.mode==='own'?'Fonte ativa: somente tabela própria.':data.pricelabs_connected?'Fonte ativa: PriceLabs; tabela própria usada quando faltar preço.':'Fonte ativa: tabela própria.',
        'Os valores no calendário são diárias antes das taxas e dos descontos por estadia.',
        data.calendar_unavailable ? 'Há um calendário externo indisponível.' : '',
      ].filter(Boolean).join(' ');
      showCalendar();rememberContext();
    } catch {
      if (root.isConnected && request === version) grid.textContent = 'Não foi possível carregar o mês. Tente trocar de mês ou clique em Hoje.';
    }
  }
  async function change(action, message) {
    if (busy || !calendar) return;
    busy = true;
    status.textContent = 'Salvando…';
    try {
      await action();
      await load();
      if (!root.isConnected) return;
      status.textContent = message;
      delete host.dataset.dirty;
    } catch (err) {
      status.textContent = ({
        invalid_own_pricing: 'Confira os valores, os descontos e o limite de 1.000 períodos.',
        property_pricing_conflict: 'Outra edição foi salva. Confira os valores atualizados e tente novamente.',
        period_occupied: 'O período já tem uma reserva ou um bloqueio.',
        invalid_range: 'Selecione de 1 a 366 noites e ao menos um dia da semana.',
        missing_pricing: 'Salve a tabela própria antes de editar datas.',
        invalid_block: 'Confira o intervalo e informe um motivo com pelo menos duas letras.',
      })[err.message] || (err.message === 'block_cancelled' ? '' : 'Não foi possível concluir a alteração.');
      if (err.message === 'property_pricing_conflict') await load();
    } finally {
      busy = false;
    }
  }
  const save = own_pricing => api('admin_property_action', {
    operation:'save_pricing', id:property.id, own_pricing, updated_at:calendar.property.updated_at,
  });
  function range(requireDays) {
    const {start, end} = selection.elements;
    const days = [...selection.querySelectorAll('[name=weekday]:checked')].map(input => Number(input.value));
    if (!start.value || !end.value || end.value < start.value || end.value > shift(start.value, 365) || requireDays && !days.length)
      throw Error('invalid_range');
    return {start:start.value, end:end.value, days};
  }
  settings.onsubmit = event => {
    event.preventDefault();
    change(() => {
      const x = settings.elements;
      const discounts = discountOptions.flatMap(([kind]) => {
        const input = x[kind + '_discount'].value;
        if (!input.trim()) return [];
        const bps = parseCents(input);
        if (!bps || bps > 9900) throw Error('invalid_own_pricing');
        return [{kind, days:Number(x[kind + '_days'].value), bps}];
      });
      return save({mode:x.mode.value, weekdays_cents:readBase(x), periods:pricing?.periods || [], discounts});
    }, 'Tabela própria salva.');
  };
  selection.onsubmit = event => {
    event.preventDefault();
    try {
      if (!pricing) throw Error('missing_pricing');
      const {start, end, days} = range(true), x = selection.elements;
      const raw = x.value.value.trim().replace(',', '.');
      const percent = /^-?\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
      const fixed = parseCents(raw);
      if (x.change.value === 'fixed' && !fixed || x.change.value === 'percent' && (!Number.isFinite(percent) || percent <= -100 || percent > 1000))
        throw Error('invalid_own_pricing');
      const count=Array.from({length:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1},(_,i)=>shift(start,i)).filter(day=>days.includes(weekday(day))).length;
      const title=x.change.value==='fixed'?`Definir ${brl(fixed)} por noite`:x.change.value==='percent'?`Ajustar ${percent}% sobre a tabela própria`:'Remover diárias manuais';
      review(`${title} em ${count} noite${count===1?'':'s'}, de ${formatDate(start)} a ${formatDate(end)}. Confira os dias da semana selecionados.`,() => {
      const periods = editPeriods(pricing.periods, start, end, days, (day, previous) => {
        if (x.change.value === 'restore') return null;
        if (x.change.value === 'fixed') return fixed;
        const bps = Math.round(percent * 100);
        return Math.max(1, Math.round((previous ?? pricing.weekdays_cents[weekday(day)]) * (10000 + bps) / 10000));
      });
      return save({...pricing, periods});
      });
    } catch(err){status.textContent=err.message==='missing_pricing'?'Salve a tabela própria antes de editar datas.':err.message==='invalid_range'?'Selecione de 1 a 366 noites e ao menos um dia da semana.':'Confira o valor informado.'}
  };
  selection.elements.change.onchange = () => {
    const mode = selection.elements.change.value;
    const input = selection.elements.value;
    input.disabled = mode === 'restore';
    input.parentElement.firstChild.textContent = mode === 'percent' ? 'Ajuste (%)' : 'Valor (R$)';
  };
  selection.onchange = event => {
    clearReview();
    if (['start','end'].includes(event.target.name)) { anchor = null; showSelection(); }
  };
  grid.onclick = event => {
    const day = event.target.closest('[data-day]')?.dataset.day;
    if (!day) return;
    const x = selection.elements;
    x.start.value = anchor && anchor < day ? anchor : day;
    x.end.value = anchor && anchor > day ? anchor : day;
    anchor = anchor ? null : day;
    clearReview();
    showSelection();
  };
  $('[data-block]').onclick = () => {try{const {start,end}=range(false),reason=$('[data-block-reason]').value.trim();if(reason.length<2)throw Error('invalid_block');review(`Bloquear todas as noites de ${formatDate(start)} a ${formatDate(end)}. Motivo: ${reason}.`,()=>block({operation:'create',property_id:property.id,start_date:start,end_date:shift(end,1),reason,block_type:'owner_use'}))}catch{status.textContent='Confira o intervalo e informe um motivo com pelo menos duas letras.'}};
  $('[data-price-events]').onclick = event => {
    const id = event.target.closest('[data-release]')?.dataset.release;
    if (id) {const item=calendar.events.find(row=>String(row.block_id)===String(id));review(`Remover o bloqueio inteiro${item?` de ${formatDate(item.start)} a ${formatDate(shift(item.end,-1))}`:''}?`,()=>block({operation:'cancel',block_id:id}))}
  };
  month.onchange = () => {clearReview();rememberContext();load()};
  function navigate(delta) {
    const [year, value] = month.value.split('-').map(Number);
    if (!year || !value) return;
    month.value = new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
    clearReview();rememberContext();load();
  }
  $('[data-prev]').onclick = () => navigate(-1);
  $('[data-next]').onclick = () => navigate(1);
  $('[data-today]').onclick = () => {month.value = today.slice(0, 7);clearReview();rememberContext();load();};
  $('[data-price-back]').onclick = back;
  $('[data-rules]').onclick = () => availability(context());
  load();
}
window.VillePropertyPricing = {mount, baseFields, readBase, editPeriods};
})();
