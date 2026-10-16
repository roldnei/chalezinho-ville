import {extractReceiptKey} from './cost-receipt-fields.js';
// The decoded URL is data only: never navigate to it or request its contents.
// A contrast pass helps thermal QR printing without sending the photo away.
export async function readReceiptQR(source,{decode,createCanvas,signal}={}){
 const scale=Math.min(1,1800/source.width,4000/source.height,Math.sqrt(5000000/(source.width*source.height))),canvas=createCanvas();canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
 try{const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let attempt=0;attempt<2;attempt++){
   if(signal?.aborted)throw new DOMException('Leitura cancelada.','AbortError');
   if(attempt)for(let i=0;i<pixels.data.length;i+=4){const gray=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114,v=Math.max(0,Math.min(255,(gray-100)*255/100));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
   const code=decode(pixels.data,canvas.width,canvas.height,{inversionAttempts:'dontInvert'}),result=extractReceiptKey(code?.data);
   if(result)return result;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  return null;
 }finally{canvas.width=canvas.height=0;}
}
