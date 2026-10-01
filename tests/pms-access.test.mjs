import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canUseProperty,canUseTask,canUseIssue,canEditTemplate,scopeHub} from '../supabase/functions/pms-operations/access.ts';
const host={id:'host',role:'host',property_ids:[1],permissions:{reservations:true,housekeeping:true,maintenance:true}};
const worker={id:'worker',role:'service_provider',property_ids:[1],permissions:{maintenance:true}};
test('host cannot access another property or edit global templates',()=>{
 assert.equal(canUseProperty(host,2),false);
 assert.equal(canEditTemplate(host,{property_id:null,task_type:'turnover'}),false);
 assert.equal(canEditTemplate(host,{property_id:2,task_type:'turnover'}),false);
 assert.equal(canEditTemplate(host,{property_id:1,task_type:'turnover'}),true);
});
test('worker needs both module permission and own assignment',()=>{
 assert.equal(canUseTask(worker,{property_id:1,task_type:'maintenance',assigned_user_id:'worker'}),true);
 for(const task of [{property_id:2,task_type:'maintenance',assigned_user_id:'worker'},{property_id:1,task_type:'maintenance',assigned_user_id:'other'},{property_id:1,task_type:'maintenance',assigned_user_id:null},{property_id:1,task_type:'turnover',assigned_user_id:'worker'}])assert.equal(canUseTask(worker,task),false);
 assert.equal(canUseIssue(worker,{property_id:2,created_by:'worker'}),false);
});
test('hub does not leak evidence, activity or financial amounts through nested reservations',()=>{
 const output=scopeHub(host,{tasks:[{id:'t2',property_id:2}],issues:[{id:'i2',property_id:2}],attachments:[{issue_id:'i2',storage_path:'secret'}],activity:[{task_id:'t2',details:{secret:1}}],notifications:[{message:'private'}],reservations:[{property_id:1,total_amount:100,experience_orders:[{experience_order_items:[{unit_price_cents:50}]}]},{property_id:2}]});
 assert.deepEqual(output.attachments,[]);assert.deepEqual(output.activity,[]);assert.deepEqual(output.notifications,[]);assert.equal(output.reservations.length,1);assert.equal(output.reservations[0].total_amount,null);assert.equal(output.reservations[0].experience_orders[0].experience_order_items[0].unit_price_cents,null);
});
