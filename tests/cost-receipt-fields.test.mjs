import {test} from 'node:test';import assert from 'node:assert/strict';
import {extractReceiptFields,validCNPJ} from '../cost-receipt-fields.js';import {pdfTextLines} from '../cost-receipt-ocr.js';
const receipt=`CASA DA PISCINA TESTE LTDA
CNPJ: 11.222.333/0001-81
Rua Exemplo, 123
DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRONICA
NFC-e N. 000123
Emissão: 16/10/2026 14:22
Cloro para piscina 100,00
SUBTOTAL 150,00
DESCONTO 10,00
VALOR TOTAL A PAGAR R$ 140,00
VALOR PAGO R$ 200,00
TROCO R$ 60,00
CONSUMIDOR CNPJ 12.ABC.345/01DE-35`;
test('CNPJ supports numeric and official alphanumeric check digits without repairing guessed characters',()=>{assert.equal(validCNPJ('11.222.333/0001-81'),true);assert.equal(validCNPJ('12.ABC.345/01DE-35'),true);assert.equal(validCNPJ('11.222.333/0001-82'),false);assert.equal(validCNPJ('00.000.000/0000-00'),false);});
test('extracts issuer, issue date, invoice and payable total without using change or subtotal',()=>{const {fields,warnings}=extractReceiptFields(receipt);assert.equal(fields.supplier,'CASA DA PISCINA TESTE LTDA');assert.equal(fields.supplier_document,'11.222.333/0001-81');assert.equal(fields.amount_cents,14000);assert.equal(fields.document_date,'2026-10-16');assert.equal(fields.competence,'2026-10');assert.equal(fields.document_number,'000123');assert.equal(fields.category,'pool');assert.deepEqual(warnings,[]);});
test('does not replace missing issuer CNPJ with consumer CNPJ',()=>{const r=extractReceiptFields(receipt.replace('11.222.333/0001-81','11.222.333/0001-82'));assert.equal(r.fields.supplier_document,undefined);assert.ok(r.warnings.some(w=>w.includes('inválido')));});
test('never guesses largest number; conflicting totals and absent or impossible dates stay pending',()=>{const r=extractReceiptFields('LOJA TESTE\nCNPJ 11222333000181\nTOTAL A PAGAR 40,00\nTOTAL A PAGAR 50,00\nTROCO 500,00\nEmissão 31/02/2026');assert.equal(r.fields.amount_cents,undefined);assert.equal(r.fields.document_date,undefined);assert.ok(r.warnings.some(w=>w.includes('Mais de um total')));const missing=extractReceiptFields('LOJA TESTE\nSUBTOTAL 800,00\nTROCO 900,00');assert.equal(missing.fields.amount_cents,undefined);});
test('emission outranks other dates and total label can precede amount on next line',()=>{const r=extractReceiptFields('LOJA TESTE\nCNPJ 11222333000181\nVencimento 30/10/2026\nEmissão 15/10/2026\nTOTAL A PAGAR\nR$ 1.234,50');assert.equal(r.fields.amount_cents,123450);assert.equal(r.fields.document_date,'2026-10-15');});
test('blank/low confidence readings stay reviewable and never infer payment or tax exclusion',()=>{assert.deepEqual(extractReceiptFields('').fields,{});const r=extractReceiptFields(receipt,{confidence:40});assert.ok(r.warnings.some(w=>w.includes('baixa nitidez')));assert.equal(r.fields.exclusion_cents,undefined);assert.equal(r.fields.paid_on,undefined);});
test('PDF text positions retain row order and associate amount with its label',()=>{const text=pdfTextLines([{str:'140,00',transform:[1,0,0,1,200,100]},{str:'LOJA TESTE',transform:[1,0,0,1,10,200]},{str:'TOTAL A PAGAR',transform:[1,0,0,1,10,100]}]);assert.equal(text,'LOJA TESTE\nTOTAL A PAGAR 140,00');assert.equal(extractReceiptFields(text).fields.amount_cents,14000);});
