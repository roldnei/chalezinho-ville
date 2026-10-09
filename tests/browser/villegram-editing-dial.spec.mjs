import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url),id='4069a585-7cc6-48ad-9263-567358a45c0c';
const photos=['assets/03-banheira-cama-opt-w1200.webp','assets/04-banheira-petalas-opt-w640.webp','assets/ch1-09-quarto-romantico.webp','assets/ch1-08-spa-piscina-chale-noite-opt-w1152.webp','assets/01-cantinho-cafe-opt-w640.webp','assets/experiencia-vinho-deck-1-opt-w710.webp'];
async function fixture(page){
 const saved=[],post={id,source:'guest_submission',type:'trust',status:'draft',title:'Um momento a dois',caption:'Nossa viagem',property_id:1,cover_index:0,media:photos.map(url=>({kind:'photo',url,fit:'cover'}))};
 const bootstrap=`window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'local-fixture'};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-fixture',user:{id:'${id}'}}}})}})};`;
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4173')return route.abort();
  if(u.pathname==='/qa-bootstrap.js')return route.fulfill({contentType:'text/javascript',body:bootstrap});
  if(route.request().method()==='POST'){
   const b=route.request().postDataJSON();let data={};
   if(['guest_list','admin_list'].includes(b.operation))data={profile:{display_name:'Hóspede QA'},suggested_property_id:1,publications:[post],properties:[{id:1,name:'Ville Signature',gallery:photos}],products:[],offers:[],settings:{enabled:true,auto_publish:false,frequency_hours:24,max_offers:3,templates:{}}};
   if(['guest_save','save'].includes(b.operation)){saved.push(b);data={publication:{...b.publication,id,updated_at:'qa-revision'}};}
   return route.fulfill({json:{ok:true,...data}});
  }
  if(!/^\/(villegram[\w-]*\.(?:js|css|html)|styles\.css|stay-offers\.css|ui-controls\.css|assets\/[\w.-]+\.(?:webp|jpg|png))$/.test(u.pathname))return route.abort();
  try{let body=await readFile(new URL('.'+u.pathname,root));if(u.pathname==='/villegram-admin.html'){body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<script src="qa-bootstrap.js"></script><script src="villegram-text.js" defer></script><script src="villegram-effects.js" defer></script><script src="villegram-admin.js" defer></script></head>'));}
   return route.fulfill({body,contentType:u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.html')?'text/html':'image/webp'});
  }catch{return route.abort();}
 });
 await page.goto('/villegram-admin.html?mode=guest&edit='+id);
 await expect(page.locator('.vg-media-strip button')).toHaveCount(6);
 await page.locator('[data-step=\"0\"]').click();
 return saved;
}
async function checkDial(page){
 await page.locator('.vg-wheel').scrollIntoViewIfNeeded();
 const scene=await page.locator('#vg-composer-screen').boundingBox();
 const controls=await page.locator('.vg-wheel button').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect(),pos=el.dataset.position;const x=pos==='left'?r.x+8:pos==='right'?r.right-8:r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {label:el.getAttribute('aria-label'),pos,x:r.x,y:r.y,w:r.width,h:r.height,opacity:Number(getComputedStyle(el).opacity),blocked:!hit||!el.contains(hit)};}));
 for(const b of controls){expect(b.w,b.label).toBeGreaterThanOrEqual(44);expect(b.h,b.label).toBeGreaterThanOrEqual(44);expect(b.x,b.label+' left').toBeGreaterThanOrEqual(scene.x);expect(b.x+b.w,b.label+' right').toBeLessThanOrEqual(scene.x+scene.width);expect(b.blocked,b.label+' exposed target').toBe(false);}
 const current=controls.find(b=>b.pos==='current'),sides=controls.filter(b=>['left','right'].includes(b.pos));expect(sides).toHaveLength(2);expect(current.w).toBeGreaterThanOrEqual(90);for(const side of sides){expect(side.w).toBeLessThan(current.w);expect(side.opacity).toBeLessThan(current.opacity);}
 await expect(page.locator('.vg-wheel-current')).toBeVisible();await expect(page.locator('.vg-wheel-surface')).toHaveCount(0);
}
test('carousel has larger central previews, transparent sides and preserved edits at every viewport',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const saved=await fixture(page);
 await expect(page.locator('[data-strip-next]')).toHaveCount(0);await expect(page.locator('[data-strip-prev]')).toHaveCount(0);
 await page.locator('[data-effects-toggle]').click();await page.waitForTimeout(380);await checkDial(page);await page.locator('#vg-composer-screen').screenshot({path:'/tmp/ville-carousel-'+testInfo.project.name+'-root.png'});
 await page.locator('[data-effects-tab=filter]').click();await page.waitForTimeout(380);await checkDial(page);await expect(page.locator('.vg-wheel-inner img')).toHaveCount(5);await expect(page.locator('.vg-wheel-inner button:visible')).toHaveCount(3);
 if(testInfo.project.name==='mobile'){await page.setViewportSize({width:320,height:740});await page.waitForTimeout(380);await checkDial(page);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(380);await checkDial(page);}
 await page.locator('[data-filter=warm]').click();await expect(page.locator('#vg-composer-visual img')).toHaveCSS('filter',/sepia/);await page.locator('#vg-composer-screen').screenshot({path:'/tmp/ville-carousel-'+testInfo.project.name+'-filter.png'});
 await page.locator('[data-effects-tab=effect]').click();await page.waitForTimeout(380);await checkDial(page);await expect(page.locator('.vg-mode-demo')).toHaveCount(4);await expect(page.locator('[data-preview-mode=breathe] img')).toHaveCSS('animation-name','vg-demo-breathe');await expect(page.locator('[data-preview-mode=pulse] img')).toHaveCSS('animation-name','vg-demo-pulse');await page.locator('[data-template=cinema]').click();await expect(page.locator('#vg-composer-visual img')).toHaveAttribute('data-mode','cinema');await page.locator('#vg-composer-screen').screenshot({path:'/tmp/ville-carousel-'+testInfo.project.name+'-mode.png'});
 await page.locator('.vg-wheel-close').click();await expect(page.locator('.vg-wheel')).toBeHidden();
 const strip=page.locator('.vg-media-strip');await strip.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.locator('[data-select="5"]').click();await expect(page.locator('[data-select="5"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-select="5"]').focus();await page.keyboard.press('Alt+ArrowLeft');await expect(page.locator('[data-select="4"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#vg-step-next').click();await page.locator('#vg-step-next').click();await page.locator('[name=draft]').click();await expect.poll(()=>saved.length).toBe(1);
 expect(saved[0].publication.media).toHaveLength(6);expect(saved[0].publication.media[0].filter).toBe('warm');expect(saved[0].publication.media.every(m=>m.mode==='cinema')).toBe(true);expect(saved[0].publication.media[4].url).toBe(photos[5]);expect(saved[0].publication.cover_index).toBe(0);expect(errors).toEqual([]);
});

test('narrow mobile keeps the dial inside the photo and scrolls the six thumbnails by touch',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='mobile','Mobile touch layout');await page.setViewportSize({width:320,height:740});await fixture(page);
 await page.locator('#vg-composer-screen').scrollIntoViewIfNeeded();const first=await page.locator('[data-select="0"]').boundingBox(),strip=page.locator('.vg-media-strip');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const touch={x:first.x+first.width/2,y:first.y+first.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,x:touch.x-100}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 await page.locator('[data-effects-toggle]').click();await page.locator('[data-effects-tab=filter]').click();await page.waitForTimeout(380);await checkDial(page);
 const card=await page.locator('[data-position=current]').boundingBox(),start={x:card.x+card.width/2,y:card.y+card.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,x:start.x-70}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(page.locator('[data-filter=warm]')).toHaveAttribute('data-position','current');await expect(page.locator('.vg-wheel-current')).toHaveText('Aconchego');await page.waitForTimeout(400);await checkDial(page);await page.locator('#vg-composer-screen').screenshot({path:'/tmp/ville-carousel-narrow-filter.png'});
});

test('animated carousel previews respect reduced motion',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='mobile','Motion preference');await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);await page.locator('[data-effects-toggle]').click();await page.locator('[data-effects-tab=effect]').click();await checkDial(page);
 await expect(page.locator('[data-preview-mode=breathe] img')).toHaveCSS('animation-name','none');await expect(page.locator('[data-preview-mode=pulse] img')).toHaveCSS('animation-name','none');await expect(page.locator('.vg-glyph-frame')).toHaveCSS('animation-name','none');
});
