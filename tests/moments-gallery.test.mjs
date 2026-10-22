import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
import {galleryEligible,rankedGallery,publicGallery} from '../supabase/functions/_shared/villegram-gallery.ts';
import {galleryPage,watchPage} from '../scripts/moments-pages.mjs';import {momentsHandler} from '../api/moments.js';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',props=[{id:1,code:'CH1',active:true},{id:2,code:'CH2',active:true},{id:3,code:'CH3',active:true}];
const post={id,author_id:owner,title:'Café no chalé',caption:'Uma viagem a dois',source:'guest_submission',property_id:2,status:'published',published_at:'2026-10-01T10:00:00Z',created_at:'2026-09-30T10:00:00Z',expires_at:'2026-10-08T10:00:00Z',media:[{kind:'photo',url:'https://private.example/file'}]};const consent=[{user_id:owner,terms_version:'2026-10-22.1',accepted_at:'2026-09-29T10:00:00Z'}],people=[{id:owner,is_public:true}];
test('permanent eligibility survives feed expiry but excludes private, deleted, unapproved and nonconsenting content',()=>{
 assert.equal(galleryEligible(post,props[1],consent,people),true);
 for(const change of [{deleted_at:'2026-10-22'},{status:'pending_review'},{source:'automatic'},{property_id:null},{offer_id:id},{published_at:'2099-01-01'}])assert.equal(galleryEligible({...post,...change},props[1],consent,people),false);
 assert.equal(galleryEligible(post,props[1],[],people),false);assert.equal(galleryEligible(post,props[1],consent,[{id:owner,is_public:false}]),false);assert.equal(galleryEligible(post,props[1],[{...consent[0],accepted_at:'2026-10-22'}],people),false);
});
test('gallery picks six most-viewed guests and pools Essenza/Amore; fallback only fills vacancies',()=>{
 const guests=Array.from({length:9},(_,i)=>({...post,id:String(i),property_id:i%2?2:3})),counts=guests.map((p,i)=>({publication_id:p.id,views:i})),fallback=[{...post,id:'offer',property_id:2}];
 const a=rankedGallery(guests,fallback,'CH2',props,counts),b=rankedGallery(guests,fallback,'CH3',props,counts);assert.deepEqual(a.map(p=>p.id),['8','7','6','5','4','3']);assert.deepEqual(a,b);assert.equal(a.some(p=>p.id==='offer'),false);assert.equal(rankedGallery(guests.slice(0,2),fallback,'CH2',props,counts).length,3);assert.equal(rankedGallery(guests,fallback,'CH1',props,counts).length,0);
});
test('watch page renders real media and text server-side with stable canonical and video schema',()=>{
 const p={...post,is_guest:true,property_code:'CH2',author_name:'Nome público',caption:'</script><script>bad()</script>',media:[{kind:'video',url:'https://private.example/signed?token=private',poster:'https://private.example/poster?token=private',duration:9.5}],cover_index:0};
 const d=new JSDOM(watchPage(p,'https://chalezinhoville.com.br')).window.document;
 assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('video').getAttribute('preload'),'none');assert.equal(d.querySelector('video').getAttribute('src'),'/api/moments?trip='+id+'&media=0');assert.equal(d.querySelector('.moments-caption').textContent,p.caption);assert.equal(d.querySelectorAll('script:not([src]):not([type])').length,0);const schema=JSON.parse(d.querySelector('[type="application/ld+json"]').textContent);assert.equal(schema['@type'],'VideoObject');assert.equal(schema.duration,'PT9.5S');assert.match(schema.contentUrl,/api\/moments/);assert.equal(d.documentElement.outerHTML.includes('token=private'),false);
 assert.match(galleryPage('CH2',[],'https://chalezinhoville.com.br'),/noindex,follow/);
});
test('ranking RPC counts views once per view ID and denies direct client execution',async()=>{const db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role;create table villegram_signals(publication_id uuid,view_id uuid,kind text);');await db.exec(await readFile('supabase/migrations/20261022151339_moments_permanent_gallery.sql','utf8'));await db.query('insert into villegram_signals values($1,$2,$3),($1,$2,$3),($1,$2,$4)',[id,owner,'view','progress']);assert.equal(Number((await db.query('select views from villegram_gallery_views($1)',[[id]])).rows[0].views),1);for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'villegram_gallery_views(uuid[])','EXECUTE') p",[role])).rows[0].p,false)}finally{await db.close()}});
const env={VILLE_RELEASE_PROFILE:'whatsapp',VERCEL_ENV:'production',VILLE_PRODUCTION_RELEASE:'approved',VILLE_PUBLIC_SUPABASE_URL:'https://irxsaladqhbzhkoaclxy.supabase.co',VILLE_PUBLIC_SUPABASE_KEY:'sb_publishable_fixture'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},send(body){if(body!==undefined)this.body=body;return this},end(body){if(body!==undefined)this.body=body;return this},write(chunk){this.body=(this.body||'')+chunk.toString()}};}
test('media endpoint rejects missing/private trips and foreign media origins; upstream errors return 503',async()=>{
 for(const [request,status] of [[async()=>new Response('',{status:404}),404],[async()=>{throw Error('timeout')},503],[async()=>Response.json({ok:true,publications:[{id,media:[{kind:'video',url:'https://evil.example/secret'}]}]}),503]]){const res=response();await momentsHandler({method:'GET',url:'/api/moments?trip='+id+'&media=0',headers:{host:'chalezinhoville.com.br'}},res,{env,request});assert.equal(res.statusCode,status);}
});
test('range media requests recheck visibility and forward only a validated single range',async()=>{const calls=[],res=response(),request=async(url,opts)=>{calls.push({url:String(url),opts});return calls.length===1?Response.json({ok:true,publications:[{id,media:[{kind:'video',url:'https://irxsaladqhbzhkoaclxy.supabase.co/storage/v1/object/sign/villegram-media/file'}]}]}):new Response('bytes',{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-4/100','Content-Length':'5'}})};await momentsHandler({method:'GET',url:'/api/moments?trip='+id+'&media=0',headers:{host:'chalezinhoville.com.br',range:'bytes=0-4'}},res,{env,request});assert.equal(res.statusCode,206);assert.equal(calls[1].opts.headers.Range,'bytes=0-4');assert.equal(res.body,'bytes');assert.equal(res.headers['Cache-Control'],'private, no-store');});

test('temporary backend failure is retried once and a missing trip is never retried',async()=>{
 let calls=0;const res=response();await momentsHandler({method:'GET',url:'/api/moments?chale=CH2',headers:{host:'chalezinhoville.com.br'}},res,{env,request:async()=>{calls++;if(calls===1)throw Error('temporary timeout');return Response.json({ok:true,publications:[]})}});assert.equal(calls,2);assert.equal(res.statusCode,200);
 calls=0;await momentsHandler({method:'GET',url:'/api/moments?trip='+id,headers:{host:'chalezinhoville.com.br'}},response(),{env,request:async()=>{calls++;return new Response('',{status:404})}});assert.equal(calls,1);
});

test('owner-selected old Trips stay public only while published, undeleted and on public profiles',()=>{
 const legacy={...post,id:'0f124ca5-21c3-4bea-87c6-572ec6faacda'};
 assert.equal(galleryEligible(legacy,props[1],[],people),true);
 assert.equal(galleryEligible({...legacy,deleted_at:'2026-10-22'},props[1],[],people),false);
 assert.equal(galleryEligible({...legacy,status:'archived'},props[1],[],people),false);
 assert.equal(galleryEligible(legacy,props[1],[],[{id:owner,is_public:false}]),false);
 assert.equal(galleryEligible(post,props[1],[],people),false);
});
test('commercial fallback uses one card belonging to the current chalet even when guest Trips are shared',()=>{
 const fallback=props.flatMap(p=>[{...post,id:'offer:'+p.code,property_id:p.id},{...post,id:'property:'+p.code,property_id:p.id}]);
 for(const prop of props){const result=rankedGallery([],fallback,prop.code,props,[]);assert.equal(result.length,1);assert.equal(result[0].property_id,prop.id);assert.equal(result[0].id,'offer:'+prop.code);}
 const result=rankedGallery([post],fallback,'CH3',props,[]);assert.equal(result.length,2);assert.equal(result[0].id,post.id);assert.equal(result[1].property_id,3);
});
