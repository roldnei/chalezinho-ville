import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const source=name=>readFile(new URL('../../'+name,import.meta.url),'utf8');
test.use({hasTouch:true,isMobile:true});
async function fixture(page,{escape=false}={}){
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main></main></body></html>'}));
 await page.goto('http://127.0.0.1:4173/index.html?view=site');
 for(const file of ['styles.css','villegram.css'])await page.addStyleTag({content:await source(file)});
 await page.evaluate(()=>{
  window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,bookingEngine:location.origin+'/engine',releaseProfile:'whatsapp',features:{social:false}};
  window.VilleOffers={label:i=>i.name};
  window.fetch=async()=>({ok:true,json:async()=>({ok:true,likes:0,comments:[]})});
  // Freeze automatic playback so only the user's gestures change the Trip.
  window.setInterval=()=>0;
 });
 await page.addScriptTag({content:await source('villegram.js')});
 await page.evaluate(escape=>{
  const cards=Array.from({length:3},(_,i)=>({publication_id:escape?undefined:'post-'+i,publication:escape?null:{id:'post-'+i,type:'property',source:'guest_submission',author_name:'QA',title:'Trip '+i,caption:'Legenda '+i,cta:'property',media:[{kind:'photo',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="teal"/></svg>'}]},offer_id:'offer-'+i,property_id:1,property_code:'CH1',property_name:'Ville Signature',property_url:'chale-premium.html',image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',offer_name:'Escapada',check_in:'2026-11-16',check_out:'2026-11-18',nights:2,guests:2,total_cents:140000,experiences:[]}));
  window.Villegram.configurePublications(cards,[],[]);window.Villegram.openHome(cards[0]);
 },escape);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const swipe=async(x,y,dy,dx=0)=>{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
  // A slow start reproduces native scrolling taking over before the old 6px threshold.
  for(const progress of [.03,.1,.3,.65,1]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+dx*progress,y:y+dy*progress}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('.vg-reel').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))).then(()=>null));
 };
 return {swipe,cdp,position:page.locator('.vg-progress>span')};
}
test('short vertical swipes on the picture advance and return exactly once',async({page})=>{
 const {swipe,position}=await fixture(page);
 await swipe(100,300,-32);await expect(position).toHaveText('2 de 3');
 await swipe(100,300,32);await expect(position).toHaveText('1 de 3');
 await swipe(100,300,80);await expect(position).toHaveText('1 de 3');
 await swipe(100,300,-260);await expect(position).toHaveText('2 de 3');
 await swipe(100,300,-260);await expect(position).toHaveText('3 de 3');
 await swipe(100,300,-260);await expect(position).toHaveText('3 de 3');
});
test('a swipe beginning on the price works despite a very small initial movement',async({page})=>{
 const {swipe,position}=await fixture(page,{escape:true});
 const p=await page.locator('.vg-price').boundingBox();
 await swipe(p.x+p.width/2,p.y+p.height/2,-90);await expect(position).toHaveText('2 de 3');
 const q=await page.locator('.vg-price').boundingBox();
 await swipe(q.x+q.width/2,q.y+q.height/2,90);await expect(position).toHaveText('1 de 3');
});
test('taps, horizontal drags, multitouch and reading panels never switch Trips',async({page})=>{
 const {swipe,cdp,position}=await fixture(page);
 await swipe(100,300,-12);await expect(position).toHaveText('1 de 3');
 await swipe(100,300,-35,100);await expect(position).toHaveText('1 de 3');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:100,y:300}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:100,y:280}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:100,y:280},{id:2,x:200,y:280}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:1,x:100,y:240}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(position).toHaveText('1 de 3');
 await page.locator('[data-action=caption]').tap();await expect(page.locator('.vg-sheet')).toBeVisible();
 await page.locator('.vg-sheet-body').evaluate(e=>e.innerHTML='<p>'+('Texto para leitura. '.repeat(400))+'</p>');
 await swipe(160,400,-140);await expect(position).toHaveText('1 de 3');
 await expect.poll(()=>page.locator('.vg-sheet').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 await page.locator('[data-sheet-close]').tap();await swipe(100,300,-80);await expect(position).toHaveText('2 de 3');
});
test('open inclusion details still scroll and mouse dragging still navigates',async({page})=>{
 const {swipe,cdp,position}=await fixture(page,{escape:true});
 await page.locator('summary').tap();
 await page.locator('details').evaluate(e=>e.insertAdjacentHTML('beforeend','<p>'+('Inclusão de exemplo. '.repeat(400))+'</p>'));
 const box=await page.locator('details').boundingBox();await swipe(box.x+40,box.y+box.height*.7,-90);
 await expect(position).toHaveText('1 de 3');await expect.poll(()=>page.locator('details').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 await page.locator('details').evaluate(e=>e.open=false);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await page.mouse.move(100,300);await page.mouse.down();await page.mouse.move(100,220,{steps:5});await page.mouse.up();
 await expect(position).toHaveText('2 de 3');
});
test('overflowing inline text scrolls without changing the Trip',async({page})=>{
 const {swipe,position}=await fixture(page);
 await page.locator('.vg-purchase').evaluate(e=>{e.style.maxHeight='120px';e.style.overflow='auto';e.querySelector('.vg-caption-short').textContent='Texto longo. '.repeat(400)});
 await expect(page.locator('.vg-purchase')).toHaveClass(/vg-reading-scroll/);
 const box=await page.locator('.vg-purchase').boundingBox();await swipe(box.x+40,box.y+90,-65);
 await expect(position).toHaveText('1 de 3');await expect.poll(()=>page.locator('.vg-purchase').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
});
