(()=>{
 const videoTypes={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-quicktime':'mov'};
 function videoFormat(file){const mime=String(file.type||'').toLowerCase(),ext=String(file.name||'').split('.').pop().toLowerCase();if(videoTypes[mime])return {extension:videoTypes[mime],type:videoTypes[mime]==='mov'?'video/quicktime':mime};if((!mime||mime==='application/octet-stream')&&['mov','mp4','webm','m4v'].includes(ext))return {extension:ext==='m4v'?'mp4':ext,type:ext==='mov'?'video/quicktime':ext==='webm'?'video/webm':'video/mp4'};return null;}

 async function inspect(file){const format=videoFormat(file);if(!format)throw Error('Use um vídeo MOV do iPhone, MP4 ou WebM.');if(file.size>50*1024*1024)throw Error('O vídeo ultrapassa 50 MB. Escolha um trecho menor ou exporte em resolução mais baixa.');const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{video.onloadedmetadata=video.onerror=null;reject(Error('Não foi possível ler este vídeo. Tente um trecho menor.'))},15000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('Este navegador não consegue ler a codificação do vídeo. Abra no Safari do iPhone ou exporte em MP4/H.264.'))};video.src=url;});if(!Number.isFinite(video.duration)||video.duration>120||video.duration<=0)throw Error('Use um vídeo de até 2 minutos.');return {video,url,...format};}catch(e){URL.revokeObjectURL(url);throw e;}}
 async function poster(video,seconds){
  const wait=(event,message,action)=>new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',failed)};const done=()=>{cleanup();resolve()},failed=()=>{cleanup();reject(Error(message))};video.addEventListener(event,done,{once:true});video.addEventListener('error',failed,{once:true});timer=setTimeout(failed,15000);try{action?.()}catch{failed()}});
  const target=Math.min(seconds===undefined?Math.min(.5,video.duration/4):seconds,Math.max(0,video.duration-.1));
  // Seek before waiting for loadeddata: iOS may not decode a detached,
  // paused video until explicitly asked for a frame.
  if(Math.abs(video.currentTime-target)>.01||video.readyState<2)await wait('seeked','Não foi possível criar a capa automática. Seu vídeo está selecionado; tente novamente ou escolha uma foto de capa.',()=>{video.currentTime=target});
  if(video.readyState<2)await wait('loadeddata','Não foi possível criar a capa automática. Escolha uma foto de capa.');
  if(!video.videoWidth||!video.videoHeight)throw Error('O vídeo ainda não foi decodificado. Tente novamente.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const sample=document.createElement('canvas');sample.width=16;sample.height=16;const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;
  if(!pixels.some((value,i)=>i%4!==3&&value>2))throw Error('A capa ficou preta. Escolha outro instante; se continuar, use um vídeo MP4/H.264 sem HDR.');
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao criar a capa.')),'image/jpeg',.88));
 }

 // TUS's 6 MiB chunks resume after a failed PATCH. No file is overwritten.
 async function upload(sb,file,path,onProgress=()=>{}){
  const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sua sessão expirou. Entre novamente.');const C=window.CHALEZINHO_CONFIG,base=C.supabaseUrl+'/storage/v1/upload/resumable',fingerprint='villegram-upload:'+path;
  const headers={Authorization:'Bearer '+session.access_token,apikey:C.supabaseKey,'Tus-Resumable':'1.0.0'};let target;try{target=sessionStorage.getItem(fingerprint)}catch{}
  if(target&&!target.startsWith(C.supabaseUrl+'/storage/'))target=null;
  const metadata=Object.entries({bucketName:'villegram-media',objectName:path,contentType:videoFormat(file)?.type||file.type,cacheControl:'31536000'}).map(([k,v])=>k+' '+btoa(v)).join(',');
  if(!target){const r=await fetch(base,{signal:AbortSignal.timeout(60000),method:'POST',headers:{...headers,'Upload-Length':String(file.size),'Upload-Metadata':metadata}});if(!r.ok)throw Error('Não foi possível iniciar o upload. Tente novamente.');target=new URL(r.headers.get('Location'),base).href;if(!target.startsWith(C.supabaseUrl+'/storage/'))throw Error('Destino de upload inválido.');try{sessionStorage.setItem(fingerprint,target)}catch{}}
  let offset=0;const head=await fetch(target,{signal:AbortSignal.timeout(60000),method:'HEAD',headers});if(head.status===404||head.status===410){try{sessionStorage.removeItem(fingerprint)}catch{}throw Error('O upload expirou. Tente novamente.')}if(!head.ok)throw Error('Não foi possível retomar o upload.');offset=Number(head.headers.get('Upload-Offset'));
  if(!Number.isSafeInteger(offset)||offset<0||offset>file.size)throw Error('Posição de upload inválida.');
  while(offset<file.size){const end=Math.min(file.size,offset+6*1024*1024),r=await fetch(target,{signal:AbortSignal.timeout(60000),method:'PATCH',headers:{...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body:file.slice(offset,end)});if(!r.ok)throw Error('Upload interrompido. Use Tentar upload novamente para retomar.');const next=Number(r.headers.get('Upload-Offset'));if(next!==end)throw Error('Upload incompleto. Tente novamente.');offset=next;onProgress(Math.round(100*offset/file.size));}
  try{sessionStorage.removeItem(fingerprint)}catch{}return path;
 }
 window.VillegramUpload={inspect,poster,upload,videoFormat};
})();
