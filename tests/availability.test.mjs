import {test} from 'node:test';import assert from 'node:assert/strict';
import {availabilityRules,availabilityDecision as decide,preparationOverlap,brazilClock} from '../supabase/functions/_shared/availability.ts';
const now=new Date('2026-10-03T13:59:00Z');
test('Brazil cutoff is enforced exactly at 11h and past dates cannot be sold',()=>{
 assert.equal(decide({weekend_min_nights:1},'2026-10-03','2026-10-04',1,now).reason,null);
 assert.equal(decide({},'2026-10-03','2026-10-05',1,new Date('2026-10-03T14:00:00Z')).reason,'same_day_cutoff');
 assert.equal(brazilClock(new Date('2026-10-04T01:00Z')).date,'2026-10-03');
 assert.equal(decide({},'2026-10-02','2026-10-05',1,now).reason,'past_date');
});
test('minimum, maximum, weekend and PriceLabs rules have defined precedence',()=>{
 assert.equal(decide({},'2026-10-09','2026-10-10',1,now).min_stay,2);
 assert.equal(decide({min_nights:3},'2026-10-12','2026-10-14',1,now).reason,'minimum_stay');
 assert.equal(decide({max_nights:3},'2026-10-12','2026-10-16',1,now).reason,'maximum_stay');
 assert.equal(decide({},'2026-10-12','2026-10-15',4,now).min_stay,4);
 assert.equal(decide({use_pricelabs_min:false},'2026-10-12','2026-10-15',4,now).min_stay,1);
});
test('lead days, arrival/departure days and availability horizon apply per property',()=>{
 assert.equal(decide({lead_days:3},'2026-10-05','2026-10-07',1,now).reason,'advance_notice');
 assert.equal(decide({checkin_days:[5]},'2026-10-12','2026-10-15',1,now).reason,'checkin_day');
 assert.equal(decide({checkout_days:[0]},'2026-10-12','2026-10-15',1,now).reason,'checkout_day');
 assert.equal(decide({window_months:1},'2026-11-03','2026-11-05',1,now).reason,'availability_window');
 assert.equal(decide({window_months:2},'2026-11-03','2026-11-05',1,now).reason,null);
});
test('custom arrival periods override base stay lengths, optionally retaining PriceLabs',()=>{
 const r={custom_stays:[{start:'2026-10-09',end:'2026-10-12',min_nights:1,max_nights:3}]};
 assert.equal(decide(r,'2026-10-09','2026-10-10',1,now).reason,null);
 assert.equal(decide(r,'2026-10-09','2026-10-13',1,now).reason,'maximum_stay');
 assert.equal(decide(r,'2026-10-09','2026-10-10',2,now).reason,'minimum_stay');
});
test('preparation blocks before and after stay with exclusive checkout',()=>{
 assert.equal(preparationOverlap('2026-10-08','2026-10-09','2026-10-10','2026-10-12',1),false);
 assert.equal(preparationOverlap('2026-10-09','2026-10-10','2026-10-10','2026-10-12',1),true);
 assert.equal(preparationOverlap('2026-10-12','2026-10-13','2026-10-10','2026-10-12',1),true);
 assert.equal(preparationOverlap('2026-10-12','2026-10-13','2026-10-10','2026-10-12',0),false);
});
test('invalid settings and overlapping custom periods are rejected',()=>{
 for(const r of [{lead_days:-1},{max_nights:1},{same_day_cutoff:'24:00'},{checkin_days:[]},{checkout_days:[7]},{preparation_days:8},{window_months:0},{min_nights:1.5}])assert.throws(()=>availabilityRules(r));
 assert.throws(()=>availabilityRules({custom_stays:[{start:'2026-10-10',end:'2026-10-12',min_nights:1,max_nights:3},{start:'2026-10-12',end:'2026-10-13',min_nights:1,max_nights:3}]}));
 assert.equal(decide({},'bad','2026-10-05',1,now).reason,'invalid_dates');
});
