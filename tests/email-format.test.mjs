import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDate,formatMoney} from '../supabase/functions/_shared/email-format.ts';
test('lodging dates do not move to the previous Brazilian day in email',()=>{
 assert.equal(formatDate('2026-11-10'),'10/11/2026');
 assert.equal(formatDate('2027-01-01'),'01/01/2027');
 assert.match(formatDate('2026-11-10T02:00:00Z',true),/09\/11\/2026.*23:00/);
});
test('email currency renders cents consistently including zero',()=>{
 assert.equal(formatMoney(164235).replace(/\s/g,''),'R$1.642,35');
 assert.equal(formatMoney(0).replace(/\s/g,''),'R$0,00');
});
