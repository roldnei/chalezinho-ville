import {extractReceiptFields} from './cost-receipt-fields.js';
import {receiptRows,layoutPage,trustedSupplier} from './cost-receipt-layout.js';
import {receiptRegions} from './cost-receipt-regions.js';
import {combineReceiptReadings} from './cost-receipt-image.js';
const assets=new URL('./assets/receipt-ocr/neural/',import.meta.url),asset=name=>new URL(name,assets).href;
const check=signal=>{if(signal?.aborted)throw new DOMException('Leitura cancelada.','AbortError');};
// Affine rectification of an individual detected line. No new recognition is
// attributed to a guessed box: this uses the detector's original polygon.
export function lineCanvas(source,item,image,createCanvas=()=>document.createElement('canvas')){
 const [a,b,,d]=item.poly.map(([x,y])=>[x*source.width/image.width,y*source.height/image.height]);
 const width=Math.hypot(b[0]-a[0],b[1]-a[1]),height=Math.hypot(d[0]-a[0],d[1]-a[1]);
 if(width<1||height<1)throw Error('Região inválida');
 const scale=Math.min(3,Math.max(1,48/height)),padding=10,canvas=createCanvas();canvas.width=Math.ceil(width*scale)+2*padding;canvas.height=Math.ceil(height*scale)+2*padding;
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
 const ux=(b[0]-a[0])/width,uy=(b[1]-a[1])/width,vx=(d[0]-a[0])/height,vy=(d[1]-a[1])/height,det=ux*vy-uy*vx;
 if(Math.abs(det)<.1)throw Error('Região inválida');
 const A=vy/det*scale,B=-uy/det*scale,C=-vx/det*scale,D=ux/det*scale;
 ctx.setTransform(A,B,C,D,padding-A*a[0]-C*a[1],padding-B*a[0]-D*a[1]);ctx.drawImage(source,0,0);ctx.resetTransform();return canvas;
}
export async function readNeuralReceipt(file,{canvas,signal,onProgress=()=>{},verifyLine,qr=null}={}){
 check(signal);onProgress('Preparando leitura por regiões… O primeiro carregamento pode demorar.');
 const {PaddleOCR}=await import('./assets/receipt-ocr/neural/paddle.mjs');check(signal);
 let browserWorker,rejectAbort;
 const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
 const engine=await PaddleOCR.create({initialize:false,worker:{createWorker:()=>{browserWorker=new Worker(asset('worker.js'),{type:'module'});return browserWorker;}},textDetectionModelName:'PP-OCRv6_small_det',textDetectionModelAsset:{url:asset('PP-OCRv6_small_det.tar')},textRecognitionModelName:'PP-OCRv6_small_rec',textRecognitionModelAsset:{url:asset('PP-OCRv6_small_rec.tar')},ortOptions:{backend:'wasm',wasmPaths:asset('ort/'),numThreads:1}});
 const stop=()=>{browserWorker?.terminate();rejectAbort(new DOMException('Leitura cancelada.','AbortError'));};signal?.addEventListener('abort',stop,{once:true});let raw;
 try{check(signal);await Promise.race([engine.initialize(),aborted]);check(signal);onProgress('Localizando e lendo os textos da nota…');[raw]=await Promise.race([engine.predict(file),aborted]);check(signal);}
 finally{signal?.removeEventListener('abort',stop);if(signal?.aborted)browserWorker?.terminate();else await engine.dispose().catch(()=>{});}
 if(!raw?.items?.length||!raw.image?.width||!raw.image?.height)throw Error('Não foi possível localizar texto.');
 const rows=receiptRows(raw),text=rows.map(r=>r.text).join('\n'),confidence=rows.length?rows.reduce((s,r)=>s+r.confidence,0)/rows.length:0;
 const result=extractReceiptFields(text,{confidence});
 if(result.fields.supplier&&!trustedSupplier(result,rows)){
  onProgress('Conferindo o nome do estabelecimento…');let secondName;
  const row=rows.find(r=>r.text===result.evidence.supplier);
  if(row&&verifyLine){const index=rows.indexOf(row),transcripts=[];
   // One issuer row plus a short corporate suffix on the following row.
   const selected=[row];if(rows[index+1]&&/^(?:S\s+)?(?:LTDA\s*ME|LTDA|S[.\s/]*A|ME|EPP)\.?$/i.test(rows[index+1].text))selected.push(rows[index+1]);
   for(const r of selected){for(const item of r.items){check(signal);const crop=lineCanvas(canvas,item,raw.image);try{const data=await verifyLine(crop);transcripts.push(data.text);}finally{crop.width=crop.height=0;}}}
   secondName=extractReceiptFields(transcripts.join('\n'),{confidence:90}).fields.supplier;
  }
  if(!trustedSupplier(result,rows,secondName)){delete result.fields.supplier;delete result.fields.description;delete result.evidence.supplier;result.warnings.push('Nome do estabelecimento com leituras divergentes; confira e preencha na nota.');}
 }
 check(signal);const merged=qr?combineReceiptReadings(result,qr):result;
 return {...merged,text,engine:'paddle-v6-small+tesseract-por',regions:receiptRegions(merged,[layoutPage(raw,rows)])};
}
