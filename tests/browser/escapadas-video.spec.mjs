import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url),offer='357cca8d-b0c2-4d68-ac72-d21ac7164e43';
const card={category:'weekday',offer_id:offer,offer_name:'Escapada',property_id:2,property_code:'CH2',property_name:'Ville Essenza',image:'/assets/essenza.webp',check_in:'2026-11-23',check_out:'2026-11-25',nights:2,guests:2,rate_code:'non_refundable',rate_name:'Escapada',total_cents:119440,gross_cents:124200,experiences:[]};
const cards=[card,{...card,property_id:1,property_code:'CH1',property_name:'Ville Signature',check_in:'2026-11-27',check_out:'2026-11-29'}, {...card,property_id:3,property_code:'CH3',property_name:'Ville Amore'}];
const properties=cards.map(c=>({id:c.property_id,code:c.property_code,name:c.property_name,active:true,cover_image:c.image,gallery:[{url:c.image,clip_duration:.65}]}));
async function fixture(page){
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('http://127.0.0.1:4173/**',async r=>{
  const url=new URL(r.request().url()),path=url.pathname;requests.push(path);
  const json=body=>r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/functions/v1/villegram-content')return json({ok:true,properties,offers:[],publications:[],products:[],settings:{templates:{}},rows:[]});
  if(path==='/api/stay-showcase')return json({ok:true,cards,properties,offers:[],window_end:'2026-12-11'});
  if(path==='/api/escapada-video')return json({ok:true,card:{...card,total_cents:118000},checked_at:new Date().toISOString()});
  if(path==='/app-config.js')return r.fulfill({contentType:'text/javascript',body:`window.CHALEZINHO_CONFIG={environment:'development',supabaseUrl:location.origin,supabaseKey:'fixture',features:{feelings:false}};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'fixture'}}}})}})};`});
  if(!/^\/[a-z0-9-]+\.(html|js|css)$/.test(path)&&!path.startsWith('/assets/'))return r.abort();
  try{const body=await readFile(new URL(path.slice(1),root));return r.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'}[extname(path)]||'application/octet-stream',body});}catch{return r.fulfill({status:404,body:'not found'});}
 });return {errors,requests};
}
test('filters, previews and downloads the moving escapada as an actual MP4',async({page},testInfo)=>{
 const {errors,requests}=await fixture(page);await page.goto('/promocoes.html');await expect(page.locator('.escape-card')).toHaveCount(3);
 await page.locator('#escape-property').selectOption('CH2');await page.locator('#escape-from').fill('2026-11-23');await page.locator('#escape-to').fill('2026-11-23');await expect(page.locator('.escape-card')).toHaveCount(1);
 await expect(page.locator('.escape-card')).toContainText('Ville Essenza');await expect(page.locator('.escape-card')).toContainText('1.194,40');
 await page.getByRole('button',{name:'Ver e baixar vídeo'}).click();await expect(page.locator('#escape-download')).toBeEnabled();
 await expect(page.locator('#escape-preview-title')).toContainText('Ville Essenza');await expect(page.locator('#escape-selected-dates')).toContainText('23');
 await page.screenshot({path:testInfo.outputPath('escapada-preview.png'),fullPage:true});
 const pending=page.waitForEvent('download');await page.locator('#escape-download').click();const download=await pending;
 expect(download.suggestedFilename()).toBe('escapada-ch2-2026-11-23-a-2026-11-25.mp4');
 const path=testInfo.outputPath('escapada.mp4');await download.saveAs(path);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'})),video=info.streams.find(s=>s.codec_type==='video');
 expect(video.codec_name).toBe('h264');expect(video.width).toBe(720);expect(video.height).toBe(1280);expect(Number(info.format.duration)).toBeGreaterThan(.3);expect(requests).toContain('/api/escapada-video');expect(errors).toEqual([]);
 await expect(page.locator('#escape-video-status')).toContainText('Vídeo baixado');
});
test('opens the existing editor with the exact chalet, stay and photos of the selected escapada',async({page})=>{
 await fixture(page);await page.goto('/promocoes.html');await expect(page.locator('.escape-card')).toHaveCount(3);await page.locator('#escape-property').selectOption('CH2');await page.getByRole('button',{name:'Ver e baixar vídeo'}).click();await expect(page.locator('#escape-download')).toBeEnabled();
 await page.locator('#escape-edit').click();await expect(page).toHaveURL(/villegram-admin\.html\?escapada=import/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ville-escape-draft-v1')||'null'));expect(draft.card.property_code).toBe('CH2');expect(draft.card.check_in).toBe('2026-11-23');expect(draft.card.check_out).toBe('2026-11-25');expect(draft.media[0].kind).toBe('photo');
});
