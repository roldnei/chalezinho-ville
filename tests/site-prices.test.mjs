import {configurePrices} from './fixtures/public-price-terms.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../site-prices.js',import.meta.url),'utf8'),scope={window:{},Intl};vm.runInNewContext(source,scope);const P=scope.window.VillePrices;
test('fee and installment count are supplied per property and changing them never changes the cash quote',()=>{
 P.configure([{property_id:1,credit_fee_bps:700,installments_count:10,cash_price_source:'quote'},{property_id:2,credit_fee_bps:500,installments_count:6,cash_price_source:'quote'}]);
 assert.equal(P.text(163000,1),'10x R$174,41');assert.equal(P.installment(163000,1).total_cents,174410);
 assert.equal(P.text(163000,2),'6x R$285,25');assert.match(P.heading(2),/6 PARCELAS/);
 assert.match(P.cashHTML(163000),/1\.630,00.*<small.*no Pix/);
 P.configure([{property_id:1,credit_fee_bps:300,installments_count:4,cash_price_source:'quote'}]);
 assert.equal(P.text(163000,1),'4x R$419,73');assert.match(P.html(163000,1),/>4x<.*>R\$419,73/);
 assert.match(P.text(163000,2),/1\.630,00 no Pix/);assert.throws(()=>P.installment(163000,2),/Configure/);
 for(const invalid of [null,NaN,0,-1,1.2,'10000'])assert.throws(()=>P.installment(invalid,1));
});
test('public REST reload uses persisted values, refreshes after edits, and never keeps stale terms on failure',async()=>{
 let response=[{property_id:2,credit_fee_bps:500,installments_count:6,cash_price_source:'quote'}],fail=false,calls=0;
 const context={window:{CHALEZINHO_CONFIG:{supabaseUrl:'https://test.example',supabaseKey:'fixture'}},Intl,AbortSignal,fetch:async(url,options)=>{calls++;assert.match(url,/property_commercial_payment_terms/);assert.equal(options.headers.apikey,'fixture');return {ok:!fail,json:async()=>response};}};
 vm.runInNewContext(source,context);const p=context.window.VillePrices;await p.load();assert.equal(p.text(120000,2),'6x R$210,00');await p.load();assert.equal(calls,1);
 response=[{property_id:2,credit_fee_bps:200,installments_count:3,cash_price_source:'quote'}];await p.load({force:true});assert.equal(p.text(120000,2),'3x R$408,00');
 fail=true;await p.load({force:true});assert.equal(p.terms(2),null);assert.match(p.text(120000,2),/no Pix/);
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
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.CHALEZINHO_CONFIG={releaseProfile:'whatsapp'};w.eval(source);configurePrices(w);w.eval(await readFile(new URL('../consultation-summary.js',import.meta.url),'utf8'));
 const rate={total_amount_cents:119440,contract_snapshot:{property_id:2,property_name:'Ville Essenza',check_in:'2026-12-01',check_out:'2026-12-03',guests:2}},quote={consultation_pricing:{profile:'lodging-airbnb-base-v1'},consulted_at:'2026-11-21T12:00:00Z'};
 const value=w.VilleConsultationSummary.summary({quote,rate});assert.match(value,/10x R\$127,80/);assert.match(value,/Total no cartão: R\$\s1\.278,00/);assert.match(value,/Total à vista: R\$\s1\.194,40/);assert.equal(rate.total_amount_cents,119440);assert.equal(w.VilleConsultationSummary.message({quote,rate}),'Olá! Gostaria de finalizar esta hospedagem pelo atendimento.\n\n'+value);dom.window.close();
});
