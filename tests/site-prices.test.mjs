import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../site-prices.js',import.meta.url),'utf8'),scope={window:{},Intl};vm.runInNewContext(source,scope);const P=scope.window.VillePrices;
test('public prices and export use seven percent once, with ten equal installments and a matching total',()=>{
 assert.equal(P.text(163000),'10x R$174,41');assert.equal(P.installment(163000).total_cents,174410);
 for(const cents of [10000,119440,123456,131340,194600,207200]){
  const row=P.installment(cents);assert.equal(row.value_cents,Math.round(cents*1.07/10));assert.equal(row.total_cents,row.value_cents*10);assert.equal(P.text(cents),P.text(cents));assert.match(P.html(cents),/site-installment-count">10x<.*site-installment-value">R\$/);
 }
 assert.equal(P.installment(119440).total_cents,127800);assert.equal(P.text(119440),'10x R$127,80');
 for(const invalid of [null,NaN,0,-1,1.2,'10000'])assert.throws(()=>P.installment(invalid));
});
test('every page with a guest price renderer loads the shared formatter before it',async()=>{
 for(const name of ['index.html','reservar.html','chale-premium.html','chale-com-hidro.html','chale-romantico.html','imovel.html','promocoes.html','villemoments-escapadas.html']){
  const html=await readFile(new URL('../'+name,import.meta.url),'utf8'),dom=new JSDOM(html);
  const scripts=[...dom.window.document.scripts].map(s=>s.getAttribute('src')?.split('?')[0]);const dependency=scripts.indexOf('site-prices.js');assert.ok(dependency>=0,name);
  for(const renderer of ['booking.js','villegram.js','stay-showcase.js','stay-offers.js','escapada-video.js','consultation-summary.js'])if(scripts.includes(renderer))assert.ok(dependency<scripts.indexOf(renderer),name+' '+renderer);
  dom.window.close();
 }
});
test('home dates pulse is scoped, gentle and disabled for reduced-motion; new experiment enrollments are disabled',async()=>{
 const css=await readFile(new URL('../site-prices.css',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8'),config=await readFile(new URL('../app-config.js',import.meta.url),'utf8');
 const dom=new JSDOM(html);assert.equal(dom.window.document.querySelector('.home-hero-dates').getAttribute('href'),'#buscar-datas');assert.match(css,/3\.2s ease-in-out infinite/);assert.match(css,/prefers-reduced-motion:reduce.*animation:none/s);assert.match(config,/mobileEntryExperimentEnabled:false/);dom.window.close();
});
test('public page prices and prepared WhatsApp totals agree without mutating the original quote',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.CHALEZINHO_CONFIG={releaseProfile:'whatsapp'};w.eval(source);w.eval(await readFile(new URL('../consultation-summary.js',import.meta.url),'utf8'));
 const rate={total_amount_cents:119440,contract_snapshot:{property_name:'Ville Essenza',check_in:'2026-12-01',check_out:'2026-12-03',guests:2}},quote={consultation_pricing:{profile:'lodging-airbnb-base-v1'},consulted_at:'2026-11-21T12:00:00Z'};
 const value=w.VilleConsultationSummary.summary({quote,rate});assert.match(value,/10x R\$127,80/);assert.match(value,/Total no cartão: R\$\s1\.278,00/);assert.match(value,/À vista: R\$\s1\.194,40/);assert.equal(rate.total_amount_cents,119440);assert.equal(w.VilleConsultationSummary.message({quote,rate}),'Olá! Gostaria de finalizar esta hospedagem pelo atendimento.\n\n'+value);dom.window.close();
});
