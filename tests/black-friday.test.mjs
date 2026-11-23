import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const code=await readFile(new URL('../black-friday.js',import.meta.url),'utf8');
const scope={};vm.runInNewContext(code,scope);const campaign=scope.VilleBlackFriday;

test('the countdown ends at midnight after 27 November in Brasilia, without restarting on reload',()=>{
 const end=Date.parse('2026-11-28T03:00:00Z');
 assert.equal(Date.parse(campaign.terms.endsAt),end);
 assert.equal(campaign.active(end-1),true);assert.equal(campaign.active(end),false);
 assert.deepEqual({...campaign.remaining(end-90061000)},{days:1,hours:1,minutes:1,seconds:1});
 assert.deepEqual({...campaign.remaining(end+1000)},{days:0,hours:0,minutes:0,seconds:0});
 const fresh={};vm.runInNewContext(code,fresh);assert.equal(fresh.VilleBlackFriday.active(end+1),false);
});

test('the gift requires two nights and timely booking, without restricting future stay dates or property types',()=>{
 const now=Date.parse('2026-11-27T23:59:59-03:00');
 assert.equal(campaign.eligible(1,now),false);assert.equal(campaign.eligible(2,now),true);assert.equal(campaign.eligible(30,now),true);
 for(const nights of [NaN,-1,1.5,'2'])assert.equal(campaign.eligible(nights,now),false);
 assert.match(campaign.message(2,now),/experiência romântica exclusiva/);assert.match(campaign.message(2,now),/confirmadas até 27\/11\/2026/);
 assert.equal(campaign.message(2,Date.parse(campaign.terms.endsAt)), '');
});

test('expired banners remove the discount and gift and expose an ended message',()=>{
 const dom=new JSDOM('<body><a data-bf-countdown><span data-bf-active>BLACK FRIDAY -15%</span><span data-bf-active>Presente</span><span data-bf-digit="seconds">10</span><span data-bf-ended hidden>Black Friday encerrada</span></a></body>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.Date.now=()=>Date.parse('2026-11-28T00:00:00-03:00');w.eval(code);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(w.document.querySelector('[data-bf-countdown]').dataset.bfState,'ended');
  assert.ok([...w.document.querySelectorAll('[data-bf-active]')].every(node=>node.hidden));
  assert.equal(w.document.querySelector('[data-bf-ended]').hidden,false);assert.equal(w.document.querySelector('[data-bf-digit]').textContent,'00');assert.ok(w.document.body.classList.contains('bf-ended'));
 }finally{w.close();}
});
