import {costAnalytics} from './costs-analytics-model.js';
const names=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const money=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthLabel=value=>names[Number(value.slice(5,7))-1]+'/'+value.slice(0,4);
const basisLabels={competence:'Mês de referência',paid_on:'Mês do pagamento',fiscal_month:'Mês da exclusão fiscal'};
export function createCostAnalytics(root,{onMonth,onProperty}){
 let latest,period='year';
 function horizontal(rows,attribute,selected){const max=Math.max(1,...rows.map(r=>r.value));return rows.map(r=>`<button type="button" class="cost-chart-row${r.key===selected?' is-selected':''}" data-chart-${attribute}="${esc(r.key)}" aria-label="${esc(r.label||r.key)}: ${esc(money(r.value))}" aria-pressed="${r.key===selected}"><span class="cost-chart-row-label">${esc(r.label||r.key)}</span><strong>${money(r.value)}</strong><span class="cost-chart-track" aria-hidden="true"><span style="width:${r.value/max*100}%"></span></span></button>`).join('');}
 function render(data){latest=data;const a=costAnalytics(data.entries,data.properties,{...data,period}),max=Math.max(1,...a.months.map(r=>r.value));
  const selectedName=a.property==='all'?'Todos os imóveis':a.property==='shared'?'Compartilhado / geral':data.properties.find(p=>String(p.id)===a.property)?.name||'Imóvel #'+a.property;
  const comparisonLabel=period==='month'?monthLabel(a.month):a.year;
  root.innerHTML=`<div class="cost-analysis-heading"><div><h2>${a.fiscal?'Análise das exclusões revisadas':'Análise de custos'}</h2><p>${esc(basisLabels[data.basis])} · ${esc(selectedName)}</p></div><label>Ano<select data-chart-year-select aria-label="Ano da análise">${a.years.map(y=>`<option value="${y.key}" ${y.key===a.year?'selected':''}>${y.key}</option>`).join('')}</select></label></div>
   <div class="cost-analysis-summary"><div><span>${monthLabel(a.month)}</span><strong data-analysis-month>${money(a.monthTotal)}</strong></div><div><span>${a.year} · no filtro</span><strong data-analysis-year>${money(a.yearTotal)}</strong></div><div><span>${a.year} · total geral</span><strong data-analysis-general>${money(a.generalYearTotal)}</strong><small>Todos os imóveis + compartilhado</small></div></div>
   <div class="cost-analysis-grid"><section class="cost-chart cost-chart-months"><h3>Evolução mensal · ${a.year}</h3><p class="cost-chart-caption">${a.count} lançamento(s) no ano · valores em reais</p><div class="cost-month-chart" role="group" aria-label="${a.fiscal?'Exclusões':'Custos'} dos doze meses de ${a.year}">${a.months.map((r,i)=>`<button type="button" data-chart-month="${r.key}" class="cost-month-bar${r.key===a.month?' is-selected':''}" aria-pressed="${r.key===a.month}" aria-label="${names[i]} ${a.year}: ${money(r.value)}" title="${names[i]}: ${money(r.value)}"><span class="cost-month-column" aria-hidden="true"><span style="height:${r.value/max*100}%"></span></span><span>${names[i]}</span></button>`).join('')}</div>${a.yearTotal===0?'<p class="cost-chart-empty">Sem lançamentos neste ano e filtro.</p>':''}<details class="cost-chart-table"><summary>Ver valores por mês</summary><table><thead><tr><th>Mês</th><th>Valor</th></tr></thead><tbody>${a.months.map(r=>`<tr><td>${monthLabel(r.key)}</td><td>${money(r.value)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total do ano</th><td>${money(a.yearTotal)}</td></tr></tfoot></table></details></section>
   <section class="cost-chart"><h3>Comparação anual</h3><p class="cost-chart-caption">${esc(selectedName)}</p><div class="cost-chart-rows">${horizontal(a.years,'year',a.year)}</div></section>
   <section class="cost-chart cost-chart-properties"><div class="cost-chart-heading"><h3>${a.fiscal?'Exclusões por imóvel':'Custos por imóvel'}</h3><div class="cost-chart-period" role="group" aria-label="Período da comparação dos imóveis"><button type="button" data-chart-period="month" aria-pressed="${period==='month'}">Mês</button><button type="button" data-chart-period="year" aria-pressed="${period==='year'}">Ano</button></div></div><p class="cost-chart-caption">${comparisonLabel} · total ${money(a.comparisonTotal)}</p><div class="cost-chart-rows">${horizontal(a.byProperty,'property',a.property)}</div>${a.property!=='all'?'<button type="button" class="cost-chart-reset" data-chart-property="all">Ver total de todos os imóveis</button>':''}</section></div>`;
 }
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||!root.contains(button)||!latest)return;
  if(button.dataset.chartMonth)onMonth(button.dataset.chartMonth);
  else if(button.dataset.chartYear)onMonth(button.dataset.chartYear+latest.month.slice(4));
  else if(button.dataset.chartProperty)onProperty(button.dataset.chartProperty);
  else if(button.dataset.chartPeriod){period=button.dataset.chartPeriod;render(latest);root.querySelector(`[data-chart-period="${period}"]`).focus({preventScroll:true});}
 });
 root.addEventListener('change',event=>{if(event.target.matches('[data-chart-year-select]'))onMonth(event.target.value+latest.month.slice(4));});
 return {render};
}
