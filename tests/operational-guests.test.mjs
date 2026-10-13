import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {operationalGuests} from '../supabase/functions/_shared/operational-guests.ts';
const stay={id:'stay',property_id:2,channel:'airbnb',check_in:'2026-10-09',check_out:'2026-10-13',guest_name:null,guest_phone:null};
const event={stay_id:'stay',property_id:2,source_id:'source',start_date:stay.check_in,end_date:stay.check_out};
const link={stay_key:'calendar:source:2026-10-09:2026-10-13',guest_id:'guest',property_id:2,source:'airbnb',check_in:stay.check_in,check_out:stay.check_out};
const contacts=[{id:'guest',name:'Hóspede vinculado',phone:'+5527999990000',notes:'private note'}];
const read=(s=stay,e=[event],l=[link],c=contacts)=>operationalGuests([s],e,l,c)[0];
test('reads the existing exact calendar link without changing stored stay or leaking notes',()=>{
 assert.deepEqual(read(),{...stay,guest_name:contacts[0].name,guest_phone:contacts[0].phone});
 assert.equal(stay.guest_name,null);
 assert.equal(read().notes,undefined);
});
test('does not guess across property, channel, source, dates or unlinked events',()=>{
 for(const change of [{property_id:3},{source:'booking'},{stay_key:'calendar:other:2026-10-09:2026-10-13'},{check_out:'2026-10-14'}])assert.equal(read(stay,[event],[{...link,...change}]).guest_name,null);
 assert.equal(read(stay,[{...event,stay_id:'other'}]).guest_name,null);
 assert.equal(read(stay,[]).guest_name,null);
});
test('edits and unlinking take effect on the next read with no copied contact data',()=>{
 assert.equal(read(stay,[event],[link],[{...contacts[0],name:'Atualizado',phone:null}]).guest_name,'Atualizado');
 assert.equal(read(stay,[event],[link],[{...contacts[0],phone:null}]).guest_phone,null);
 assert.equal(read(stay,[event],[]).guest_name,null);
 assert.equal(read(stay,[event],[link],[]).guest_name,null);
});
test('supports native reservation and legacy exact keys; conflicting links do not choose a guest',()=>{
 assert.equal(read({...stay,reservation_id:'reservation'},[],[{...link,reservation_id:'reservation',stay_key:'reservation:reservation'}]).guest_name,contacts[0].name);
 const legacy={...link,stay_key:'airbnb:2:2026-10-09:2026-10-13'};
 assert.equal(read(stay,[event],[legacy]).guest_name,contacts[0].name);
 assert.equal(read(stay,[event],[link,{...legacy,guest_id:'different'}]).guest_name,null);
});
test('contact enrichment remains inside guest permission gate and after stay scope filtering',()=>{
 const source=readFileSync(new URL('../supabase/functions/multichannel-operations/index.ts',import.meta.url),'utf8');
 assert.match(source,/if\(guestAccess\)\{[\s\S]*?visibleStays=operationalGuests\(visibleStays,events,links,contacts\)/);
 assert.match(source,/let visibleStays=stays.filter\(s=>!s.is_test&&propertyAccess/);
});
