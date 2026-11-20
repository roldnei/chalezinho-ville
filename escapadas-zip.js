(()=>{'use strict';
 const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 const check=signal=>{if(signal?.aborted)throw new DOMException('Cancelado','AbortError')};
 async function create(files,{signal,progress=()=>{}}={}){
  if(!files.length||files.length>200)throw Error('Selecione de 1 a 200 vídeos.');const names=new Set(),parts=[],centers=[],encoder=new TextEncoder();let offset=0;
  for(let i=0;i<files.length;i++){
   check(signal);const {name,blob}=files[i];if(!/^[a-zA-Z0-9_.-]+\.mp4$/.test(name)||names.has(name)||!blob?.size||blob.size>0xffffffff)throw Error('Arquivo inválido no pacote.');names.add(name);
   const bytes=new Uint8Array(await blob.arrayBuffer()),n=encoder.encode(name);let crc=0xffffffff;
   for(let j=0;j<bytes.length;j++){crc=table[(crc^bytes[j])&255]^(crc>>>8);if(j&&j%2000000===0){await new Promise(r=>setTimeout(r,0));check(signal)}}crc=(crc^0xffffffff)>>>0;
   const h=new Uint8Array(30+n.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,n.length,true);h.set(n,30);parts.push(h,blob);
   const d=new Uint8Array(46+n.length),w=new DataView(d.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,blob.size,true);w.setUint32(24,blob.size,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);d.set(n,46);centers.push(d);offset+=h.length+blob.size;if(offset>0xffffffff)throw Error('O pacote está muito grande. Selecione menos vídeos.');progress(i+1,files.length);
  }
  check(signal);const size=centers.reduce((a,b)=>a+b.length,0),e=new Uint8Array(22),v=new DataView(e.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...centers,e],{type:'application/zip'});
 }
 function download(blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='escapadas-selecionadas-'+new Date().toISOString().slice(0,10)+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 window.VilleEscapadaZip={create,download};
})();
