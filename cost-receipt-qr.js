import {extractReceiptKey} from './cost-receipt-fields.js';
// Never open the decoded URL. Scanning overlapping regions preserves QR detail
// that a whole-photo resize can lose, especially on high-resolution phone photos.
export async function readReceiptQR(source,{decode,createCanvas,signal}={}){
 const lower=Math.round(source.height*.55),upper=Math.ceil(source.height*.6);
 const plans=[
  {top:0,height:source.height,widthLimit:1800,zoom:1,filters:['raw','contrast']},
  {top:lower,height:source.height-lower,widthLimit:2400,zoom:1,filters:['contrast','binary']},
  {top:lower,height:source.height-lower,widthLimit:3000,zoom:1.5,filters:['contrast']},
  {top:0,height:upper,widthLimit:2400,zoom:1,filters:['contrast','binary']}
 ];
 for(const plan of plans){
  if(signal?.aborted)throw new DOMException('Leitura cancelada.','AbortError');
  const scale=Math.min(plan.zoom,plan.widthLimit/source.width,4000/plan.height,Math.sqrt(5000000/(source.width*plan.height))),canvas=createCanvas();canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(plan.height*scale));
  try{const ctx=canvas.getContext('2d');ctx.drawImage(source,0,plan.top,source.width,plan.height,0,0,canvas.width,canvas.height);const original=ctx.getImageData(0,0,canvas.width,canvas.height);
   for(const filter of plan.filters){
    if(signal?.aborted)throw new DOMException('Leitura cancelada.','AbortError');
    const pixels=filter==='raw'?original.data:new Uint8ClampedArray(original.data);
    if(filter!=='raw')for(let i=0;i<pixels.length;i+=4){const gray=pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114,v=filter==='binary'?(gray<150?0:255):Math.max(0,Math.min(255,(gray-100)*255/100));pixels[i]=pixels[i+1]=pixels[i+2]=v;}
    const code=decode(pixels,canvas.width,canvas.height,{inversionAttempts:'dontInvert'}),result=extractReceiptKey(code?.data);
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{canvas.width=canvas.height=0;}
 }
 return null;
}
