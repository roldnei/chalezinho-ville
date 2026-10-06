import {test} from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/stay-showcase.js';
test('storefront cache is preview-only, and forwards only the public dev feed',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldFetch=globalThis.fetch;
 const make=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.body=d;return this}});
 try{
  process.env.VERCEL_ENV='production';let res=make();await handler({method:'GET',headers:{host:'chalezinhoville.com.br'}},res);assert.equal(res.code,403);
  process.env.VERCEL_ENV='preview';res=make();await handler({method:'POST',headers:{}},res);assert.equal(res.code,405);
  let forwarded;globalThis.fetch=async(url,options)=>{forwarded={url,options};return new Response(JSON.stringify({ok:true,cards:[{total_cents:123456}]}),{headers:{'Server-Timing':'showcase;dur=12'}})};
  res=make();await handler({method:'GET',headers:{host:'chalezinho-ville-123456789-roldneicosta-4140.vercel.app'}},res);
  assert.equal(res.code,200);assert.match(res.headers['Cache-Control'],/s-maxage=60/);assert.match(forwarded.url,/pxfqmnhqodqyaaqeyjgr/);assert.equal(forwarded.options.headers['X-Chalezinho-Env'],'development');assert.equal(res.body.cards[0].total_cents,123456);
  assert.equal(res.headers['Server-Timing'],'showcase;dur=12');
  res=make();await handler({method:'GET',headers:{host:'chalezinho-ville-git-feature-romantic-fdde70-roldneicosta-4140.vercel.app'}},res);assert.equal(res.code,200);
  res=make();await handler({method:'GET',headers:{host:'unrelated.vercel.app'}},res);assert.equal(res.code,403);
  globalThis.fetch=async()=>{throw Error('unavailable')};res=make();await handler({method:'GET',headers:{host:'chalezinho-ville-123456789-roldneicosta-4140.vercel.app'}},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');
 }finally{if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;globalThis.fetch=oldFetch}
});
