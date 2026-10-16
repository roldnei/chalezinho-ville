import {extractReceiptFields} from './cost-receipt-fields.js';
import {enhanceReceipt,combineReceiptReadings} from './cost-receipt-image.js';
const root=new URL('./assets/receipt-ocr/',import.meta.url),url=path=>new URL(path,root).href;
let loadingScript=null;
async function loadEngine(){
 if(window.Tesseract)return window.Tesseract;
 if(!loadingScript)loadingScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url('tesseract.min.js');script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{loadingScript=null;script.remove();reject(Error('Não foi possível carregar o leitor. Tente novamente.'));};document.head.append(script);});
 return loadingScript;
}
function abortError(){return new DOMException('Leitura cancelada.','AbortError');}
function checkAbort(signal){if(signal?.aborted)throw abortError();}
async function photoCanvas(file,signal){
 const src=URL.createObjectURL(file);try{const image=new Image();image.src=src;await image.decode();checkAbort(signal);if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)throw Error('A foto é grande demais para a leitura. Use uma foto menor e nítida.');
  const scale=Math.min(2,2000/image.naturalWidth,6000/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
 }finally{URL.revokeObjectURL(src);}
}
// Preserve PDF line layout so labels and values stay associated. No remote URL,
// document script, external link, or service receives the uploaded document.
export function pdfTextLines(items){
 const rows=[];for(const item of items){if(!('str' in item)||!item.str.trim())continue;const y=item.transform?.[5]||0;let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x:item.transform?.[4]||0,text:item.str});}
 return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
}
export async function readReceipt(file,{signal,onProgress=()=>{}}={}){
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size>10485760||!file.size)throw Error('Use uma foto ou PDF de até 10 MB.');
 checkAbort(signal);let worker=null,pdf=null,loadingPDF=null;
 const stop=()=>{if(worker)void worker.terminate().catch(()=>{});if(loadingPDF)void loadingPDF.destroy().catch(()=>{});};signal?.addEventListener('abort',stop,{once:true});
 async function recognize(canvas,label,{focused=false}={}){
  checkAbort(signal);
  if(!worker){onProgress('Preparando leitor…');const engine=await loadEngine();checkAbort(signal);worker=await engine.createWorker('por',1,{workerPath:url('worker.min.js'),corePath:url('core/'),langPath:url('lang/'),workerBlobURL:false,gzip:true,logger:message=>{if(message.status==='recognizing text')onProgress(`${label} ${Math.round(message.progress*100)}%`);}});checkAbort(signal);}
  await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
  const result=await worker.recognize(canvas,{rotateAuto:true},{blocks:!focused});checkAbort(signal);return result.data;
 }
 try{
  let text='',confidence=null;
  if(file.type==='application/pdf'){
   onProgress('Abrindo PDF…');const pdfjs=await import('./assets/receipt-ocr/pdf/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=url('pdf/pdf.worker.mjs');checkAbort(signal);
   loadingPDF=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,wasmUrl:url('pdf/wasm/'),standardFontDataUrl:url('pdf/standard_fonts/'),cMapUrl:url('pdf/cmaps/'),cMapPacked:true});pdf=await loadingPDF.promise;checkAbort(signal);
   if(pdf.numPages>6)throw Error('A leitura automática aceita PDFs de até 6 páginas. Você pode manter o anexo e preencher os campos.');
   const pages=[],scores=[];for(let n=1;n<=pdf.numPages;n++){checkAbort(signal);onProgress(`Lendo página ${n} de ${pdf.numPages}…`);const page=await pdf.getPage(n);try{const content=await page.getTextContent(),native=pdfTextLines(content.items);if(native.replace(/\s/g,'').length>=40){pages.push(native);continue;}
    const original=page.getViewport({scale:1}),scale=Math.min(2.5,2000/original.width,3000/original.height),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const data=await recognize(canvas,`Página ${n} de ${pdf.numPages} ·`);pages.push(data.text);scores.push(data.confidence);}finally{canvas.width=canvas.height=0;}
   }finally{page.cleanup();}}
   text=pages.join('\n');if(scores.length)confidence=Math.min(...scores);
  }else{const canvas=await photoCanvas(file,signal);try{
   const data=await recognize(canvas,'Lendo nota…'),first=extractReceiptFields(data.text,{confidence:data.confidence});text=data.text;confidence=data.confidence;
   if(!first.evidence.document_number?.startsWith('Chave de acesso validada:')||!first.fields.supplier_document||!first.fields.amount_cents||data.confidence<75){
    onProgress('Melhorando a leitura do cupom…');const focused=enhanceReceipt(canvas,data.blocks,()=>document.createElement('canvas'));
    try{checkAbort(signal);const reread=await recognize(focused,'Conferindo dados…',{focused:true}),second=extractReceiptFields(reread.text,{confidence:reread.confidence});
     return {...combineReceiptReadings(first,second),text:data.text+'\n\n— Segunda leitura —\n'+reread.text};
    }finally{focused.width=focused.height=0;}
   }
  }finally{canvas.width=canvas.height=0;}}
  checkAbort(signal);return {...extractReceiptFields(text,{confidence}),text};
 }catch(error){if(signal?.aborted)throw abortError();if(error?.name==='PasswordException')throw Error('O PDF tem senha. Envie uma versão sem senha ou uma foto.');throw error;}
 finally{signal?.removeEventListener('abort',stop);if(worker)await worker.terminate().catch(()=>{});if(loadingPDF)await loadingPDF.destroy().catch(()=>{});}
}
