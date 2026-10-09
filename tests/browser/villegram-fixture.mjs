import {expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
let videoReady=false;
const root=new URL('../../',import.meta.url),id='4069a585-7cc6-48ad-9263-567358a45c0c';
const photos=['assets/03-banheira-cama-opt-w1200.webp','assets/04-banheira-petalas-opt-w640.webp','assets/ch1-09-quarto-romantico.webp','assets/ch1-08-spa-piscina-chale-noite-opt-w1152.webp','assets/01-cantinho-cafe-opt-w640.webp','assets/experiencia-vinho-deck-1-opt-w710.webp'];
async function mediaResponse(route,body,contentType){const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/),headers={'Accept-Ranges':'bytes'};if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;return route.fulfill({status:206,contentType,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${body.length}`,'Content-Length':String(end-start+1)},body:body.subarray(start,end+1)})}return route.fulfill({contentType,headers:{...headers,'Content-Length':String(body.length)},body})}
export async function fixture(page,{mixed=false,eight=false}={}){
 if(!videoReady){const r=spawnSync('ffmpeg',['-v','error','-y','-loop','1','-i',new URL('assets/01-cantinho-cafe-opt-w640.webp',root).pathname,'-f','lavfi','-i','sine=frequency=330:sample_rate=44100','-t','8','-vf','scale=320:480:force_original_aspect_ratio=increase,crop=320:480','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','/tmp/ville-feelings-fixture.mp4']);if(r.status!==0)throw Error(r.stderr.toString());videoReady=true;}

 const uploads=new Map();let uploadId=0;const saved=[],post={id,source:'guest_submission',type:'trust',status:'draft',title:'Um momento a dois',caption:'Nossa viagem',property_id:1,cover_index:0,media:photos.map(url=>({kind:'photo',url,fit:'cover'}))};
 if(mixed)post.media.splice(1,0,{kind:'video',url:'/qa-video.mp4',path:id+'/'+id+'.mp4',poster:photos[1],poster_path:id+'/'+id+'.webp',duration:8,bytes:10000,fit:'cover'});
 if(eight)post.media.push({kind:'photo',url:photos[0],fit:'cover'});
 const bootstrap=`window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'local-fixture'};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-fixture',user:{id:'${id}'}}}})}})};`;
 await page.context().route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4173')return route.abort();
  if(u.pathname==='/qa-bootstrap.js')return route.fulfill({contentType:'text/javascript',body:bootstrap});
  if(u.pathname.startsWith('/storage/v1/upload/')){const req=route.request(),method=req.method();if(method==='POST'){const key=String(++uploadId);uploads.set(key,0);return route.fulfill({status:201,headers:{Location:'http://127.0.0.1:4173/storage/v1/upload/'+key}});}const key=u.pathname.split('/').pop();if(method==='HEAD')return route.fulfill({status:200,headers:{'Upload-Offset':String(uploads.get(key)||0)}});if(method==='PATCH'){uploads.set(key,(uploads.get(key)||0)+(req.postDataBuffer()?.length||0));return route.fulfill({status:204,headers:{'Upload-Offset':String(uploads.get(key))}});}}
  if(route.request().method()==='POST'){
   const b=route.request().postDataJSON();let data={};
   if(['guest_list','admin_list'].includes(b.operation))data={profile:{display_name:'Hóspede QA'},suggested_property_id:1,publications:[post],properties:[{id:1,name:'Ville Signature',gallery:photos}],products:[],offers:[],settings:{enabled:true,auto_publish:false,frequency_hours:24,max_offers:3,templates:{}}};
   if(['guest_preview','preview'].includes(b.operation)){await page.evaluate(p=>window.__qaLastPreview=p,b.publication);data={publication:{...b.publication,id,source:'guest_submission'},properties:[{id:1,name:'Ville Signature',code:'CH1',slug:'chale-premium'}],products:[],offers:[]};}
   if(['guest_save','save'].includes(b.operation)){saved.push(b);Object.assign(post,b.publication);data={publication:{...b.publication,id,updated_at:'qa-revision'}};}
   return route.fulfill({json:{ok:true,...data}});
  }
  if(u.pathname==='/qa-video.mp4')return mediaResponse(route,await readFile('/tmp/ville-feelings-fixture.mp4'),'video/mp4');
  if(!/^\/(villegram[\w-]*\.(?:js|css|html)|styles\.css|stay-offers\.css|ui-controls\.css|assets\/[\w./-]+\.(?:webp|jpg|png|json|mp3|bin|js))$/.test(u.pathname))return route.abort();
  try{let body=await readFile(new URL('./'+u.pathname.slice(1),root));if(u.pathname==='/villegram-admin.html'){const scripts=['villegram-media.js','villegram-upload.js','villegram-text.js','villegram-audio-dsp.js','villegram-feelings.js','villegram-timeline.js','villegram-effects.js','villegram.js','villegram-content.js','villegram-timeline-editor.js','villegram-admin.js'];body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<script src="qa-bootstrap.js"></script>'+scripts.map(name=>'<script src="'+name+'" defer></script>').join('')+'</head>'));}
   const ext=u.pathname.split('.').pop(),contentType=({css:'text/css',js:'text/javascript',html:'text/html',json:'application/json',mp3:'audio/mpeg',bin:'application/octet-stream'})[ext]||'image/webp';return ['mp3'].includes(ext)?mediaResponse(route,body,contentType):route.fulfill({body,contentType});
  }catch{return route.abort();}
 });
 await page.goto('/villegram-admin.html?mode=guest&edit='+id);
 await expect(page.locator('.vg-media-strip button')).toHaveCount((mixed?7:6)+(eight?1:0));
 await page.locator('[data-step=\"0\"]').click();
 saved.uploads=uploads;return saved;
}
