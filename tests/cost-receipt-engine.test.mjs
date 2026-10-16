import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createWorker} from 'tesseract.js';import {extractReceiptFields} from '../cost-receipt-fields.js';import {pdfTextLines,readReceipt} from '../cost-receipt-ocr.js';
test('real Portuguese OCR reads receipt image and keeps payable total distinct from tender and change',async()=>{
 const worker=await createWorker('por',1,{langPath:new URL('../node_modules/@tesseract.js-data/por/4.0.0_best_int',import.meta.url).pathname,cacheMethod:'none'});
 try{const {data}=await worker.recognize(new URL('./fixtures/receipts/synthetic-receipt.png',import.meta.url).pathname);const r=extractReceiptFields(data.text,{confidence:data.confidence});assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.amount_cents,14000);assert.equal(r.fields.document_date,'2026-10-16');assert.equal(r.fields.document_number,'000123');assert.ok(data.confidence>65);}finally{await worker.terminate();}
});
test('real PDF.js extracts document text with the same invoice fields',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(await readFile(new URL('./fixtures/receipts/synthetic-receipt.pdf',import.meta.url))),isEvalSupported:false,useSystemFonts:true});
 try{const pdf=await task.promise,page=await pdf.getPage(1),content=await page.getTextContent(),r=extractReceiptFields(pdfTextLines(content.items));assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.amount_cents,14000);assert.equal(r.fields.document_date,'2026-10-16');}finally{await task.destroy();}
});
test('unsupported files and cancelled requests do not initialize recognition',async()=>{await assert.rejects(readReceipt({type:'text/html',size:10}),/foto ou PDF/);const controller=new AbortController();controller.abort();await assert.rejects(readReceipt({type:'image/jpeg',size:10},{signal:controller.signal}),{name:'AbortError'});});
test('scanned PDF with no text layer renders locally and its image can be recognized',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const task=pdfjs.getDocument({data:new Uint8Array(await readFile(new URL('./fixtures/receipts/synthetic-scanned-receipt.pdf',import.meta.url))),isEvalSupported:false,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});let worker;
 try{const pdf=await task.promise,page=await pdf.getPage(1);assert.equal((await page.getTextContent()).items.length,0);const viewport=page.getViewport({scale:2}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 worker=await createWorker('por',1,{langPath:new URL('../node_modules/@tesseract.js-data/por/4.0.0_best_int',import.meta.url).pathname,cacheMethod:'none'});const {data}=await worker.recognize(canvas.toBuffer('image/png'));const r=extractReceiptFields(data.text);assert.equal(r.fields.amount_cents,14000);assert.equal(r.fields.supplier_document,'11.222.333/0001-81');
 }finally{if(worker)await worker.terminate();await task.destroy();}
});
test('receipt on a textured background uses fiscal anchors for a second local reading',async()=>{
 const {createCanvas,loadImage}=await import('@napi-rs/canvas'),{enhanceReceipt,combineReceiptReadings}=await import('../cost-receipt-image.js');
 const image=await loadImage(new URL('./fixtures/receipts/synthetic-receipt.png',import.meta.url).pathname),photo=createCanvas(image.width+500,image.height+400),ctx=photo.getContext('2d');ctx.fillStyle='#777';ctx.fillRect(0,0,photo.width,photo.height);ctx.strokeStyle='#999';for(let n=0;n<photo.width;n+=29){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n+70,photo.height);ctx.stroke();}ctx.drawImage(image,250,200);
 const worker=await createWorker('por',1,{langPath:new URL('../node_modules/@tesseract.js-data/por/4.0.0_best_int',import.meta.url).pathname,cacheMethod:'none'});
 try{await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const {data}=await worker.recognize(photo.toBuffer('image/png'),{rotateAuto:true},{blocks:true});const focused=enhanceReceipt(photo,data.blocks,()=>createCanvas(1,1)),{data:reread}=await worker.recognize(focused.toBuffer('image/png'),{rotateAuto:true});const result=combineReceiptReadings(extractReceiptFields(data.text,{confidence:data.confidence}),extractReceiptFields(reread.text,{confidence:reread.confidence}));assert.equal(result.fields.supplier_document,'11.222.333/0001-81');assert.equal(result.fields.amount_cents,14000);assert.equal(result.fields.document_date,'2026-10-16');assert.ok(focused.width<photo.width*1.5);
 }finally{await worker.terminate();}
});
