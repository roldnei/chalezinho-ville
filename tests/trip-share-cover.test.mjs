import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import handler from '../api/villegram.js';
import {publicPublicationShare} from '../supabase/functions/_shared/villegram-share.ts';
const id='9b46bcbd-6209-4637-b210-ca82656cb24d',origin='https://chalezinhoville.com.br';
const post={id,author_id:'guest',source:'guest_submission',status:'published',title:'Seu próximo respiro 🌿',caption:'Um vídeo do chalé',published_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),cover_index:1,updated_at:'2026-10-20T16:08:23Z',media:[{kind:'photo',path:'guest/first.webp'},{kind:'video',path:'guest/movie.mp4',poster_path:'guest/chosen.jpg',alt:'Capa do meu Trip'}]};
function ctx(changes={},profilePublic=true){let signed=[];const row={...post,...changes};return {get signed(){return signed},production:true,catalog:async()=>({properties:[],products:[],offers:[]}),resolveMedia:async rows=>{signed.push(...rows.flatMap(r=>r.media));return [{media:[{url:'https://irxsaladqhbzhkoaclxy.supabase.co/storage/v1/object/sign/villegram-media/guest/chosen.jpg?token=fresh'}]}];},db:{from(table){const rows=table==='villegram_publications'?row:table==='villegram_profiles'?(profilePublic?[{id:'guest',is_public:true}]:[]):[];return {select(){return this},eq(){return this},in(){return this},maybeSingle:async()=>({data:row.status==='published'?rows:null}),then(fn){return Promise.resolve({data:rows}).then(fn)}}}}};}
test('public share uses only the selected video poster and returns no author, storage paths or full media',async()=>{
 const context=ctx(),r=await publicPublicationShare(context,id);assert.equal(r.status,200);assert.equal(r.body.publication.title,post.title);assert.equal(r.body.publication.description,post.caption);assert.equal(r.body.publication.cover_alt,'Capa do meu Trip');assert.deepEqual(context.signed,[{kind:'photo',path:'guest/chosen.jpg'}]);assert.equal(r.body.publication.author_id,undefined);assert.equal(r.body.publication.media,undefined);
 const photo=ctx({cover_index:0});await publicPublicationShare(photo,id);assert.equal(photo.signed[0].path,'guest/first.webp');
});
test('private, draft, archived, expired, future and disabled property Trips never get signed public covers',async()=>{
 const cases=[ctx({},false),ctx({status:'draft'}),ctx({status:'archived'}),ctx({expires_at:new Date(Date.now()-1000).toISOString()}),ctx({published_at:new Date(Date.now()+86400000).toISOString()}),ctx({property_id:99})];
 for(const context of cases){const r=await publicPublicationShare(context,id);assert.equal(r.status,404);assert.equal(context.signed.length,0);assert.equal(r.body.publication,undefined);}
 const context=ctx();assert.equal((await publicPublicationShare(context,'bad')).status,400);assert.equal(context.signed.length,0);
});
function res(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},send(body){this.body=body;return this},end(body){this.body=body;return this}};}
async function apiTest(fn){const previous=global.fetch,vars=['VERCEL_ENV','VILLE_RELEASE_PROFILE','VILLE_PRODUCTION_RELEASE','VILLE_PUBLIC_SUPABASE_URL','VILLE_PUBLIC_SUPABASE_KEY'],saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));Object.assign(process.env,{VERCEL_ENV:'production',VILLE_RELEASE_PROFILE:'whatsapp',VILLE_PRODUCTION_RELEASE:'approved',VILLE_PUBLIC_SUPABASE_URL:'https://irxsaladqhbzhkoaclxy.supabase.co',VILLE_PUBLIC_SUPABASE_KEY:'sb_publishable_test'});try{await fn()}finally{global.fetch=previous;for(const k of vars)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
const req=(query='')=>({method:'GET',headers:{host:'chalezinhoville.com.br'},url:'/api/villegram?publication='+id+query});
test('WhatsApp metadata contains the Trip title and stable own cover URL, then redirects visitors to the same Trip',async()=>apiTest(async()=>{
 global.fetch=async(url,options)=>{assert.match(String(url),/irxsaladqhbzhkoaclxy\.supabase\.co\/functions\/v1\/villegram-content/);assert.equal(JSON.parse(options.body).publication_id,id);return {ok:true,json:async()=>({ok:true,publication:{id,title:'Trip <script> 🌿',description:'Café & descanso',cover_url:'signed-cover',cover_alt:'Meu Trip',updated_at:'v2'}})};};
 const response=res();await handler(req(),response);assert.equal(response.statusCode,200);const doc=new JSDOM(response.body).window.document;
 assert.equal(doc.querySelector('[property="og:title"]').content,'Trip <script> 🌿');assert.equal(doc.querySelector('script'),null);assert.match(doc.querySelector('[property="og:image"]').content,/api\/villegram\?publication=.*image=1.*v=v2/);assert.equal(doc.querySelector('[property="og:image"]').content.includes('signed-cover'),false);assert.match(doc.querySelector('[http-equiv=refresh]').content,new RegExp('index.html\\?publication='+id));assert.equal(response.headers['Cache-Control'],'no-store');assert.doesNotMatch(response.body,/hero-signature/);
}));
test('cover image refreshes signed storage URLs, streams real bytes and blocks off-site or private redirects',async()=>apiTest(async()=>{
 const bytes=Buffer.from([255,216,255,1]);let cover='https://irxsaladqhbzhkoaclxy.supabase.co/storage/v1/object/sign/villegram-media/cover.jpg?token=fresh',calls=0;
 global.fetch=async(url)=>{calls++;if(String(url).includes('/functions/'))return {ok:true,json:async()=>({ok:true,publication:{id,cover_url:cover}})};return new Response(bytes,{headers:{'content-type':'image/jpeg'}});};
 const response=res();await handler(req('&image=1'),response);assert.equal(response.statusCode,200);assert.equal(response.headers['Content-Type'],'image/jpeg');assert.deepEqual(response.body,bytes);assert.equal(calls,2);
 for(const bad of ['http://127.0.0.1/a.jpg','https://private.example/a.jpg','javascript:alert(1)']){cover=bad;calls=0;const denied=res();await handler(req('&image=1'),denied);assert.equal(denied.statusCode,503);assert.equal(calls,1);}
}));
test('unpublished and unavailable metadata never fall back to a misleading home cover',async()=>apiTest(async()=>{
 global.fetch=async()=>({ok:false,status:404});const response=res();await handler(req(),response);assert.equal(response.statusCode,404);assert.doesNotMatch(response.body,/og:image|hero-signature/);
}));
test('sharing a Trip generates the metadata link for WhatsApp and clipboard with its revision',()=>{
 const w=new JSDOM('',{url:origin+'/index.html',runScripts:'outside-only'}).window;
 try{const source=readFileSync('villegram.js','utf8'),line=source.match(/ const shareURL=c=>[^\n]+/)[0];w.eval(line+'\nwindow.shareURL=shareURL;');const link=new URL(w.shareURL({publication_id:id,publication:post}));assert.equal(link.pathname,'/api/villegram');assert.equal(link.searchParams.get('publication'),id);assert.equal(link.searchParams.get('v'),post.updated_at);assert.equal(new URL(w.shareURL({intro:true})).pathname,'/index.html');}finally{w.close();}
});
