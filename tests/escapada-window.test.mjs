import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekdayWindows,showcaseSettings} from '../supabase/functions/_shared/stay-showcase.ts';
import {offerExpired,offerIssues} from '../supabase/functions/_shared/stay-offers.ts';
const offer={status:'active',property_ids:[1],product_ids:[],min_nights:2,max_nights:3,showcase:{enabled:true,nights:[2,3],horizon_days:21,celebrations:true,commercial_condition:'cash'}};
const now=Date.parse('2026-10-11T12:30:00Z');
test('rolling three-week window includes weekdays, weekends, two and three nights',()=>{
 const rows=weekdayWindows('2026-10-11',showcaseSettings(offer.showcase),offer);
 assert.equal(rows.length,42);assert.equal(rows[0].check_in,'2026-10-12');assert.equal(rows.at(-1).check_in,'2026-11-01');
 assert.deepEqual(new Set(rows.map(r=>r.nights)),new Set([2,3]));
 assert.ok(rows.some(r=>r.category==='celebration'));assert.ok(rows.some(r=>!r.category));
 const tomorrow=weekdayWindows('2026-10-12',showcaseSettings(offer.showcase),offer);
 assert.ok(!tomorrow.some(r=>r.check_in==='2026-10-12'));assert.equal(tomorrow.at(-1).check_in,'2026-11-02');
 assert.throws(()=>showcaseSettings({...offer.showcase,commercial_condition:'pix_fake'}),/invalid_showcase/);
});
test('expired dated offers and past or out-of-window links cannot be quoted',()=>{
 assert.equal(offerExpired({...offer,end_date:'2026-10-12',min_nights:2},'2026-10-11'),true);
 assert.equal(offerExpired({...offer,end_date:'2026-10-13',min_nights:2},'2026-10-11'),false);
 assert.equal(offerExpired(offer,'2026-10-11'),false);
 assert.ok(offerIssues(offer,[],1,{check_in:'2026-10-10',check_out:'2026-10-12'},now).includes('offer_expired'));
 assert.ok(offerIssues(offer,[],1,{check_in:'2026-11-02',check_out:'2026-11-04'},now).includes('offer_period'));
 assert.deepEqual(offerIssues(offer,[],1,{check_in:'2026-11-01',check_out:'2026-11-04'},now),[]);
});
