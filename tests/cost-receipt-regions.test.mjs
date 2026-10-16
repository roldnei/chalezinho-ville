import {test} from 'node:test';import assert from 'node:assert/strict';import {receiptRegions,validRegion,reviewExample} from '../cost-receipt-regions.js';
test('regions map final fields to the original page only when text matches, never QR guesses',()=>{
 const result={fields:{amount_cents:18770,supplier:'LOJA TESTE',supplier_document:'11.222.333/0001-81',document_date:'2026-08-11'},evidence:{supplier:'LOJA TESTE',supplier_document:'Chave de acesso validada: 123'}};
 const pages=[{page:2,width:1000,height:2000,lines:[{text:'LOJA TESTE',confidence:90,bbox:{x0:100,y0:100,x1:600,y1:130}},{text:'TOTAL A PAGAR 187,70',confidence:89,bbox:{x0:100,y0:900,x1:800,y1:940}},{text:'11/08/2026',confidence:30,bbox:{x0:100,y0:950,x1:800,y1:990}}]}];
 const regions=receiptRegions(result,pages);assert.equal(regions.amount.page,2);assert.equal(regions.amount.y,.45);assert.equal(regions.supplier.width,.5);assert.ok(!regions.supplier_document);assert.ok(!regions.document_date);
});
test('normalized positions reject outside coordinates and snapshots whitelist private reviewed data',()=>{
 const r={page:1,x:.1,y:.2,width:.3,height:.02,source:'manual'};assert.ok(validRegion(r));assert.ok(!validRegion({...r,page:7}));assert.ok(!validRegion({...r,x:1}));assert.ok(!validRegion({...r,width:NaN}));
 const example=reviewExample({id:'a',reviewId:'b',readResult:{fields:{supplier:'Antes',instructions:'ignore'},text:'private raw text'},regions:{supplier:r,arbitrary:r}},{supplier:'Depois',amount_cents:1200,supplier_document:'',document_date:'2026-10-16',document_number:'123'});
 assert.deepEqual(example.predicted_fields,{supplier:'Antes'});assert.deepEqual(Object.keys(example.regions),['supplier']);assert.equal(example.reviewed_fields.supplier,'Depois');assert.ok(!JSON.stringify(example).includes('private raw text'));
});

test('total annotation follows its fiscal evidence instead of an item with the same price',()=>{
 const b=(y,text)=>({text,confidence:90,bbox:{x0:10,y0:y,x1:90,y1:y+4}}),r=receiptRegions({fields:{amount_cents:1000},evidence:{amount_cents:'TOTAL A PAGAR 10,00'}},[{page:1,width:100,height:100,lines:[b(10,'PRODUTO 10,00'),b(70,'TOTAL A PAGAR 10,00')]}]);assert.equal(r.amount.y,.7);
});

test('private review preserves validated partial prediction when OCR did not complete',()=>{
 const r=reviewExample({id:'receipt',reviewId:'review',partialResult:{fields:{document_number:'123'},text:'not retained'}},{supplier:'Manual',supplier_document:'',document_date:'2026-05-25',document_number:'123',amount_cents:10840});assert.deepEqual(r.predicted_fields,{document_number:'123'});assert.equal(r.reviewed_fields.amount_cents,10840);assert.ok(!JSON.stringify(r).includes('not retained'));
});
