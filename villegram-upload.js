(()=>{
 const videoTypes=['video/mp4','video/webm'];
 async function inspect(file){if(!videoTypes.includes(file.type)||file.size>50*1024*1024)throw Error('Use MP4 ou WebM de até 50 MB.');const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.src=url;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Não foi possível ler este vídeo.')),15000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('Formato de vídeo não reconhecido.'))}});if(!Number.isFinite(video.duration)||video.duration>120||video.duration<=0){URL.revokeObjectURL(url);throw Error('Use um vídeo de até 2 minutos.')}return {video,url};}
 async function poster(video,seconds){
  const wait=(event,message,action)=>new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',failed)};const done=()=>{cleanup();resolve()},failed=()=>{cleanup();reject(Error(message))};video.addEventListener(event,done,{once:true});video.addEventListener('error',failed,{once:true});timer=setTimeout(failed,15000);try{action?.()}catch{failed()}});
  if(video.readyState<2)await wait('loadeddata','Não foi possível criar a capa. Tente novamente.');
  const target=Math.min(seconds===undefined?Math.min(.5,video.duration/4):seconds,Math.max(0,video.duration-.1));
  if(Math.abs(video.currentTime-target)>.01)await wait('seeked','Não foi possível escolher esta capa.',()=>{video.currentTime=target});
  if(!video.videoWidth||!video.videoHeight)throw Error('O vídeo ainda não foi decodificado. Tente novamente.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const sample=document.createElement('canvas');sample.width=16;sample.height=16;const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;
  if(!pixels.some((value,i)=>i%4!==3&&value>2))throw Error('A capa ficou preta. Escolha outro instante; se continuar, use um vídeo MP4/H.264 sem HDR.');
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao criar a capa.')),'image/webp',.88));
 }

 // TUS's 6 MiB chunks resume after a failed PATCH. No file is overwritten.
 async function upload(sb,file,path,onProgress=()=>{}){
  const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sua sessão expirou. Entre novamente.');const C=window.CHALEZINHO_CONFIG,base=C.supabaseUrl+'/storage/v1/upload/resumable',fingerprint='villegram-upload:'+path;
  const headers={Authorization:'Bearer '+session.access_token,apikey:C.supabaseKey,'Tus-Resumable':'1.0.0'};let target;try{target=sessionStorage.getItem(fingerprint)}catch{}
  if(target&&!target.startsWith(C.supabaseUrl+'/storage/'))target=null;
  const metadata=Object.entries({bucketName:'villegram-media',objectName:path,contentType:file.type,cacheControl:'31536000'}).map(([k,v])=>k+' '+btoa(v)).join(',');
  if(!target){const r=await fetch(base,{signal:AbortSignal.timeout(60000),method:'POST',headers:{...headers,'Upload-Length':String(file.size),'Upload-Metadata':metadata}});if(!r.ok)throw Error('Não foi possível iniciar o upload. Tente novamente.');target=new URL(r.headers.get('Location'),base).href;if(!target.startsWith(C.supabaseUrl+'/storage/'))throw Error('Destino de upload inválido.');try{sessionStorage.setItem(fingerprint,target)}catch{}}
  let offset=0;const head=await fetch(target,{signal:AbortSignal.timeout(60000),method:'HEAD',headers});if(head.status===404||head.status===410){try{sessionStorage.removeItem(fingerprint)}catch{}throw Error('O upload expirou. Tente novamente.')}if(!head.ok)throw Error('Não foi possível retomar o upload.');offset=Number(head.headers.get('Upload-Offset'));
  if(!Number.isSafeInteger(offset)||offset<0||offset>file.size)throw Error('Posição de upload inválida.');
  while(offset<file.size){const end=Math.min(file.size,offset+6*1024*1024),r=await fetch(target,{signal:AbortSignal.timeout(60000),method:'PATCH',headers:{...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body:file.slice(offset,end)});if(!r.ok)throw Error('Upload interrompido. Use Tentar upload novamente para retomar.');const next=Number(r.headers.get('Upload-Offset'));if(next!==end)throw Error('Upload incompleto. Tente novamente.');offset=next;onProgress(Math.round(100*offset/file.size));}
  try{sessionStorage.removeItem(fingerprint)}catch{}return path;
 }
 window.VillegramUpload={inspect,poster,upload};
})();
