import {recoverReceiptDetails} from './cost-receipt-local-fields.js';
import {receiptRegions,ocrPage} from './cost-receipt-regions.js';
import {extractReceiptFields} from './cost-receipt-fields.js';
import {readReceiptQR} from './cost-receipt-qr.js';
import {receiptBounds,enhanceReceipt,combineReceiptReadings,recoverPositionedTotal} from './cost-receipt-image.js';
const root=new URL('./assets/receipt-ocr/',import.meta.url),url=path=>new URL(path,root).href;
let loadingScript=null,loadingQR=null;
async function loadEngine(){
 if(window.Tesseract)return window.Tesseract;
 if(!loadingScript)loadingScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url('tesseract.min.js');script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{loadingScript=null;script.remove();reject(Error('Não foi possível carregar o leitor. Tente novamente.'));};document.head.append(script);});
 return loadingScript;
}
async function loadQRDecoder(){
 if(window.jsQR)return window.jsQR;
 if(!loadingQR)loadingQR=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url('jsQR.js');script.onload=()=>resolve(window.jsQR);script.onerror=()=>{loadingQR=null;script.remove();reject(Error('QR indisponível'));};document.head.append(script);});
 return loadingQR;
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
export async function readReceipt(file,{signal,onProgress=()=>{},onPartialResult=()=>{}}={}){
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size>10485760||!file.size)throw Error('Use uma foto ou PDF de até 10 MB.');
 checkAbort(signal);let worker=null,pdf=null,loadingPDF=null;
 const stop=()=>{if(worker)void worker.terminate().catch(()=>{});if(loadingPDF)void loadingPDF.destroy().catch(()=>{});};signal?.addEventListener('abort',stop,{once:true});
 async function recognize(canvas,label,{focused=false,positionOnly=false}={}){
  checkAbort(signal);
  if(!worker){onProgress('Preparando leitor…');const engine=await loadEngine();checkAbort(signal);worker=await engine.createWorker('por',1,{workerPath:url('worker.min.js'),corePath:url('core/'),langPath:url('lang/'),workerBlobURL:false,gzip:true,logger:message=>{if(message.status==='recognizing text')onProgress(`${label} ${Math.round(message.progress*100)}%`);}});checkAbort(signal);}
  await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
  const result=await worker.recognize(canvas,{rotateAuto:!positionOnly},{blocks:!focused});checkAbort(signal);return result.data;
 }
 async function positioned(result,data,canvas,layoutCanvas=canvas,transform=null,originalData=null){
  // Deskewed OCR coordinates do not belong to the original photo. Locate text
  // once without deskew, preserving the existing extraction decisions.
  const layout=Math.abs(data.rotateRadians||0)>=.005?await recognize(layoutCanvas,'Localizando campos…',{positionOnly:true}):data;
  result=recoverPositionedTotal(result,extractReceiptFields(layout.text,{confidence:layout.confidence}));
  result=recoverReceiptDetails(result,[...new Set([originalData,data,layout].filter(Boolean))]);
  const page=ocrPage(layout,layoutCanvas);if(transform){const map=b=>({x0:transform.left+b.x0*transform.width/layoutCanvas.width,y0:transform.top+b.y0*transform.height/layoutCanvas.height,x1:transform.left+b.x1*transform.width/layoutCanvas.width,y1:transform.top+b.y1*transform.height/layoutCanvas.height});page.width=canvas.width;page.height=canvas.height;page.lines=page.lines.map(l=>({...l,bbox:map(l.bbox),words:(l.words||[]).map(w=>({...w,bbox:map(w.bbox)}))}));}
  const pages=[page];if(originalData&&Math.abs(originalData.rotateRadians||0)<.005)pages.push(ocrPage(originalData,canvas));
  return {...result,regions:receiptRegions(result,pages)};
 }
 try{
  let text='',confidence=null;const positions=[];
  if(file.type==='application/pdf'){
   onProgress('Abrindo PDF…');const pdfjs=await import('./assets/receipt-ocr/pdf/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=url('pdf/pdf.worker.mjs');checkAbort(signal);
   loadingPDF=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,wasmUrl:url('pdf/wasm/'),standardFontDataUrl:url('pdf/standard_fonts/'),cMapUrl:url('pdf/cmaps/'),cMapPacked:true});pdf=await loadingPDF.promise;checkAbort(signal);
   if(pdf.numPages>6)throw Error('A leitura automática aceita PDFs de até 6 páginas. Você pode manter o anexo e preencher os campos.');
   const pages=[],scores=[];for(let n=1;n<=pdf.numPages;n++){checkAbort(signal);onProgress(`Lendo página ${n} de ${pdf.numPages}…`);const page=await pdf.getPage(n);try{const content=await page.getTextContent(),native=pdfTextLines(content.items);if(native.replace(/\s/g,'').length>=40){pages.push(native);
    const v=page.getViewport({scale:1});positions.push({page:n,width:v.width,height:v.height,lines:content.items.filter(i=>i.str?.trim()).map(i=>{const p=v.convertToViewportPoint(i.transform[4],i.transform[5]),h=Math.abs(i.height)||Math.hypot(i.transform[2],i.transform[3])||10;return {text:i.str,confidence:100,bbox:{x0:p[0],y0:Math.max(0,p[1]-h),x1:Math.min(v.width,p[0]+i.width),y1:Math.min(v.height,p[1])}};})});continue;}
    const original=page.getViewport({scale:1}),scale=Math.min(2.5,2000/original.width,3000/original.height),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const data=await recognize(canvas,`Página ${n} de ${pdf.numPages} ·`);pages.push(data.text);scores.push(data.confidence);const layout=Math.abs(data.rotateRadians||0)>=.005?await recognize(canvas,'Localizando campos…',{positionOnly:true}):data;positions.push(ocrPage(layout,canvas,n));}finally{canvas.width=canvas.height=0;}
   }finally{page.cleanup();}}
   text=pages.join('\n');if(scores.length)confidence=Math.min(...scores);
  }else{const canvas=await photoCanvas(file,signal);try{
   let qr=null;try{onProgress('Lendo QR code da nota…');const decode=await loadQRDecoder();checkAbort(signal);qr=await readReceiptQR(canvas,{decode,createCanvas:()=>document.createElement('canvas'),signal});if(qr){checkAbort(signal);onPartialResult({...qr,regions:{},text:''});}}catch(error){checkAbort(signal);}
   const data=await recognize(canvas,'Lendo nota…'),first=extractReceiptFields(data.text,{confidence:data.confidence});text=data.text;confidence=data.confidence;
   if(!first.evidence.document_number?.startsWith('Chave de acesso validada:')||!first.fields.supplier_document||!first.fields.amount_cents||data.confidence<75){
    onProgress('Melhorando a leitura do cupom…');const bounds=receiptBounds(data.blocks,canvas.width,canvas.height)||{left:0,top:0,width:canvas.width,height:canvas.height},focused=enhanceReceipt(canvas,data.blocks,()=>document.createElement('canvas'),bounds);
    try{checkAbort(signal);const reread=await recognize(focused,'Conferindo dados…'),second=extractReceiptFields(reread.text,{confidence:reread.confidence});
     const result=combineReceiptReadings(first,second);return await positioned({... (qr?combineReceiptReadings(result,qr):result),text:data.text+'\n\n— Segunda leitura —\n'+reread.text},reread,canvas,focused,bounds,data);
    }finally{focused.width=focused.height=0;}
   }
   return await positioned({... (qr?combineReceiptReadings(first,qr):first),text},data,canvas);
  }finally{canvas.width=canvas.height=0;}}
  checkAbort(signal);const result=extractReceiptFields(text,{confidence});return {...result,text,regions:receiptRegions(result,positions)};
 }catch(error){if(signal?.aborted)throw abortError();if(error?.name==='PasswordException')throw Error('O PDF tem senha. Envie uma versão sem senha ou uma foto.');throw error;}
 finally{signal?.removeEventListener('abort',stop);if(worker)await worker.terminate().catch(()=>{});if(loadingPDF)await loadingPDF.destroy().catch(()=>{});}
}
