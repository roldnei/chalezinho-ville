import {test} from 'node:test';import assert from 'node:assert/strict';import {receiptBounds,combineReceiptReadings,enhanceReceipt} from '../cost-receipt-image.js';import {createCanvas} from '@napi-rs/canvas';
const line=(text,x0,y0,x1,y1,confidence=90)=>({text,bbox:{x0,y0,x1,y1},confidence});
test('fiscal anchors isolate receipt while low confidence background and unsupported regions are ignored',()=>{
 const blocks=[{paragraphs:[{lines:[line('oo A RED',0,0,800,60,20),line('CNPJ 11.222.333/0001-81',200,200,600,230),line('TOTAL A PAGAR 40,94',210,700,590,730)]}]}];const bounds=receiptBounds(blocks,1000,1500);assert.ok(bounds.left>150);assert.ok(bounds.top>150);assert.ok(bounds.left+bounds.width<650);assert.equal(receiptBounds([],1000,1500),null);
 const source=createCanvas(1000,1500),ctx=source.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,1000,1500);const enhanced=enhanceReceipt(source,blocks,()=>createCanvas(1,1));assert.ok(enhanced.width<1000);assert.ok(enhanced.height<1500);
});
test('second reading recovers absent CNPJ but conflicting money/date/IDs stay pending',()=>{
 const a={fields:{amount_cents:4094,document_date:'2026-10-16',supplier_document:'11.222.333/0001-81'},evidence:{},warnings:[]};const b={fields:{amount_cents:4095,document_date:'2026-10-15',supplier_document:'12.ABC.345/01DE-35'},evidence:{},warnings:[],confidence:90};const r=combineReceiptReadings(a,b);assert.equal(r.fields.amount_cents,undefined);assert.equal(r.fields.document_date,undefined);assert.equal(r.fields.supplier_document,undefined);assert.equal(r.warnings.length,3);
 const recovered=combineReceiptReadings({fields:{},evidence:{},warnings:['CNPJ do estabelecimento não identificado.']},{fields:{supplier_document:'11.222.333/0001-81'},evidence:{},warnings:[]});assert.equal(recovered.fields.supplier_document,'11.222.333/0001-81');assert.deepEqual(recovered.warnings,[]);
});
test('validated key outranks an unverified printed invoice number; zero padding is harmless',()=>{
 const a={fields:{document_number:'00069628'},evidence:{document_number:'NFC-e: 00069628'},warnings:[]},b={fields:{document_number:'000089628'},evidence:{document_number:'Chave de acesso validada: synthetic'},warnings:[]};assert.equal(combineReceiptReadings(a,b).fields.document_number,'000089628');assert.equal(combineReceiptReadings({...a,fields:{document_number:'00089628'}},b).fields.document_number,'000089628');
});
