import {recoverPositionedTotal} from '../cost-receipt-image.js';
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

test('confident fiscal words crop the paper even when textured background poisons line confidence and bounds',()=>{
 const word=(text,x,y)=>({text,confidence:90,bbox:{x0:x,y0:y,x1:x+80,y1:y+25}}),blocks=[{paragraphs:[{lines:[{text:'background CNPJ',confidence:25,bbox:{x0:0,y0:50,x1:2000,y1:700},words:[word('CNPJ:',600,500)]},{text:'VALOR TOTAL',confidence:40,bbox:{x0:0,y0:800,x1:2000,y1:1000},words:[word('Valor',450,900),word('total',650,900),word('VALOR',1250,950)]},{text:'NFC-e',confidence:35,bbox:{x0:0,y0:1100,x1:2000,y1:1400},words:[word('NFC-e',600,1200)]}]}]}];
 const b=receiptBounds(blocks,2000,2667);assert.ok(b);assert.ok(b.left>300);assert.ok(b.left+b.width>1400);assert.ok(b.width<1400);assert.ok(b.top<500);assert.ok(b.top+b.height>1225);
});

test('localized total recovers missing amount but never overrides conflicts or weak confidence',()=>{
 const base={fields:{document_number:'123'},evidence:{},warnings:[],confidence:40},reading={fields:{amount_cents:12345},evidence:{amount_cents:'VALOR TOTAL 123 45'},warnings:[],confidence:80};assert.equal(recoverPositionedTotal(base,reading).fields.amount_cents,12345);assert.equal(recoverPositionedTotal(base,{...reading,confidence:30}).fields.amount_cents,undefined);assert.equal(recoverPositionedTotal({...base,warnings:['Leituras divergentes em valor; confira no comprovante.']},reading).fields.amount_cents,undefined);assert.equal(recoverPositionedTotal({...base,fields:{amount_cents:9999}},reading).fields.amount_cents,9999);
});
