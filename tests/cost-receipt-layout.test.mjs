import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptRows,layoutPage,trustedSupplier} from '../cost-receipt-layout.js';
import {extractReceiptFields} from '../cost-receipt-fields.js';
import {receiptRegions,reviewExample} from '../cost-receipt-regions.js';
const item=(text,x,y,w=180,score=.99)=>({text,score,poly:[[x,y+x*.12],[x+w,y+(x+w)*.12],[x+w,y+(x+w)*.12+20],[x,y+x*.12+20]]});
test('sloping labels and right-hand prices are paired with their own row',()=>{
 const raw={image:{width:800,height:1000},items:[item('VALOR TOTAL R$',20,400),item('7',620,370,60),item('123.45',620,400,90),item('QTD TOTAL DE ITENS',20,370),item('VALOR A PAGAR R$',20,430),item('123,45',620,430,90),item('TROCO',20,460),item('900,00',620,460,90)]};
 const rows=receiptRows(raw),r=extractReceiptFields(rows.map(r=>r.text).join('\n'),{confidence:95});
 assert.equal(r.fields.amount_cents,12345);assert.equal(rows[0].text,'QTD TOTAL DE ITENS 7');assert.equal(rows[1].text,'VALOR TOTAL R$ 123,45');
 const page=layoutPage(raw,rows);const region=receiptRegions(r,[page]).amount;assert.ok(region);assert.ok(region.y>.4&&region.y<.5);assert.ok(region.width>.8);
});
test('decimal repair requires a monetary label and two cents; no guessed integer',()=>{
 const texts=['CNPJ 12.345.678/0001-99','TOTAL A PAGAR R$ 12345','VALOR TOTAL R$ 123.456','PARCELA CARTAO 123.45','VALOR TOTAL R$ 123.45'];
 const rows=receiptRows({items:texts.map((t,i)=>item(t,0,30*i))});
 assert.deepEqual(rows.map(r=>r.text),[...texts.slice(0,4),'VALOR TOTAL R$ 123,45']);
 assert.equal(extractReceiptFields(rows[1].text,{confidence:95}).fields.amount_cents,undefined);
});
test('corporate name requires strong evidence or agreement; disagreement is pending',()=>{
 const r={fields:{supplier:'LOJA EXEMPLO LTDA'},evidence:{supplier:'CNPJ: … LOJA EXEMPLO LTDA'}};
 const rows=[{text:r.evidence.supplier,confidence:94}];assert.equal(trustedSupplier(r,rows),false);assert.equal(trustedSupplier(r,rows,'LOJA EXENPLO LTDA'),false);assert.equal(trustedSupplier(r,rows,'Loja Exemplo Ltda.'),true);
 assert.equal(trustedSupplier(r,[{...rows[0],confidence:99}]),true);
});
test('empty/invalid detector polygons cannot create source boxes',()=>{
 assert.deepEqual(receiptRows({items:[{text:'TOTAL 999,99',score:1,poly:[[NaN,0],[0,0],[1,1],[0,1]]}]}),[]);
 assert.deepEqual(receiptRegions({fields:{}},[layoutPage({image:{width:800,height:1000}},[])]),{});
});
test('reviewed examples retain the recognition engine that made the prediction',()=>{
 const r=reviewExample({id:'receipt',readResult:{fields:{amount_cents:12345},engine:'paddle-v6-small+tesseract-por'}},{amount_cents:12345});assert.equal(r.engine,'paddle-v6-small+tesseract-por');
});
