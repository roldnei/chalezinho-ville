import {test} from 'node:test';import assert from 'node:assert/strict';import {compare} from '../scripts/receipt-training/compare.mjs';
const expected={supplier:'LOJA EXEMPLO LTDA',supplier_document:'11.222.333/0001-81',document_number:'12',amount:'10,20',document_date:'2026-07-22'};
const output=changes=>({rows:[{file:'synthetic.png',expected,actual:{...expected,...changes}}]});
test('release comparison counts missing and wrong fields separately',()=>{const r=compare(output({supplier:'',amount:''}),output({supplier:''}));assert.equal(r.approved,true);assert.equal(r.baseline.pending,2);assert.equal(r.candidate.pending,1);assert.equal(r.candidate.wrong,0);});
test('higher total score cannot hide a new wrong financial field',()=>{assert.equal(compare(output({supplier:'',document_date:'',amount:''}),output({amount:'10,21'})).approved,false);});
test('changing the evaluation cases or labels is not a model improvement',()=>{const b=output({});b.rows[0].expected={...expected,amount:'20,00'};assert.throws(()=>compare(output({}),b),/same photos/);});
