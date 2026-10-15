import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../villegram-content.js',import.meta.url),'utf8');
function mixer(){
 const window={CHALEZINHO_CONFIG:{supabaseUrl:'https://example.test'}};
 const document={querySelector:()=>null};
 vm.runInNewContext(source,{window,document,Date,URLSearchParams,location:{search:''}});
 return window.VillegramContent.mix;
}
const posts=n=>Array.from({length:n},(_,i)=>({publication:{id:'post-'+i,type:'property',source:'guest_submission',created_at:new Date().toISOString()},property_id:i%3+1}));
const offers=()=>Array.from({length:24},(_,i)=>({id:'offer-'+i,property_id:i%3+1}));
test('small feeds preserve every distinct offer and every guest publication',()=>{
 const mix=mixer();
 for(const size of [0,1,4,12]){
  const pool=[...posts(size),...offers()],out=Array.from(mix(pool));
  assert.equal(out.length,pool.length);
  assert.equal(new Set(out).size,pool.length);
  assert.ok(pool.every(card=>out.includes(card)));
  assert.equal(pool.length,size+24,'ranking must not mutate the input');
 }
});
test('larger feeds retain every guest post while offers appear occasionally',()=>{
 const mix=mixer();
 for(const size of [13,25,50]){
  const editorial=posts(size),out=Array.from(mix([...editorial,...offers()]));
  assert.equal(out.filter(c=>c.publication).length,size);
  assert.ok(editorial.every(card=>out.includes(card)));
  const commercial=out.filter(c=>!c.publication);
  assert.equal(commercial.length,Math.floor(size/5));
  assert.equal(new Set(commercial).size,commercial.length);
  for(let i=0;i<out.length;i++)if(!out[i].publication)assert.equal(out.slice(0,i).filter(c=>c.publication).length%5,0);
 }
});
test('published offer Trips remain visible in small feeds',()=>{
 const mix=mixer(),authored=offers().map(c=>({...c,publication:{id:c.id,type:'offer',cta:'offer'}}));
 assert.equal(mix([...posts(1),...authored]).length,25);
});
