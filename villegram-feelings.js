(()=>{
 'use strict';
 const base='assets/feelings/',cache=new Map();let catalog=[],ready;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),db=n=>20*Math.log10(Math.max(1e-7,n)),round=n=>Math.round(n*1000)/1000;
 const abort=()=>new DOMException('Cancelado','AbortError');
 async function load(){if(!ready)ready=fetch(base+'catalog.json',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('catalog_unavailable');return r.json()}).then(items=>catalog=items).catch(e=>{ready=null;throw e});return ready;}
 async function assetURL(id){await load();const item=catalog.find(x=>x.id===id);if(!item)throw Error('sound_unavailable');return new URL(item.url,location.href).href;}
 function search(text=''){const norm=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();return catalog.filter(x=>norm(x.label+' '+x.tags).includes(norm(text)));}
 // Summaries only are cached. Decoded PCM is released after each clip, limiting mobile memory.
 // 50 ms windows keep real pauses and transients; channel power avoids stereo cancellation.
 async function measure(buffer,{cancelled=()=>false,progress=()=>{}}={}){
  const sr=buffer.sampleRate,channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),size=Math.max(1,Math.round(sr*.05)),envelope=[],peaks=[];
  let power=0,peak=0,clipped=0,hpPower=0,hpPrevious=channels.map(()=>0),hpInput=channels.map(()=>0);
  const alpha=1/(1+2*Math.PI*90/sr);
  for(let start=0;start<buffer.length;start+=size){let sum=0,p=0;
   for(let c=0;c<channels.length;c++)for(let j=start;j<Math.min(buffer.length,start+size);j++){const v=channels[c][j],a=Math.abs(v);sum+=v*v;p=Math.max(p,a);if(a>.995)clipped++;const h=alpha*(hpPrevious[c]+v-hpInput[c]);hpPrevious[c]=h;hpInput[c]=v;hpPower+=h*h;}
   const count=Math.min(size,buffer.length-start)*channels.length;power+=sum;peak=Math.max(peak,p);envelope.push(Math.sqrt(sum/count));peaks.push(p);
   if(envelope.length%40===0){if(cancelled())throw abort();progress(start/buffer.length);await new Promise(r=>setTimeout(r,0));}
  }
  const sorted=envelope.slice().sort((a,b)=>a-b),rms=Math.sqrt(power/(buffer.length*channels.length)),floor=sorted[Math.floor(sorted.length*.2)]||0,body=sorted[Math.floor(sorted.length*.9)]||0;
  // Narrow, persistent mains hum only. Never treat broad water/rain/wind textures as noise.
  let humHz=0,humRatio=0;
  if(rms>.0003)for(const hz of [50,60]){const ratios=[];for(let k=0;k<6;k++){const start=Math.max(0,Math.floor((buffer.length-sr*.2)*k/5)),n=Math.min(Math.round(sr*.2),buffer.length-start);let re=0,im=0,energy=0;
    for(let j=0;j<n;j++){const v=channels[0][start+j];re+=v*Math.cos(2*Math.PI*hz*j/sr);im+=v*Math.sin(2*Math.PI*hz*j/sr);energy+=v*v;}
    ratios.push(2*(re*re+im*im)/Math.max(1e-12,n*energy));}
   const ratio=Math.min(...ratios);if(ratio>.35&&ratio>humRatio){humHz=hz;humRatio=ratio;}}
  const waveform=Array.from({length:Math.min(240,envelope.length)},(_,i)=>{const a=Math.floor(i*envelope.length/Math.min(240,envelope.length)),b=Math.ceil((i+1)*envelope.length/Math.min(240,envelope.length));return round(Math.min(1,Math.max(...peaks.slice(a,b))));});
  return {duration:buffer.duration,envelope,peaks,waveform,rmsDb:db(rms),peakDb:db(peak),floorDb:db(floor),bodyDb:db(body),clipped:clipped/(buffer.length*channels.length),lowRatio:power?1-hpPower/power:0,humHz};
 }
 function profile(a){
  const quiet=a.rmsDb<-55,damaged=a.clipped>.005,stationary=a.bodyDb-a.floorDb<4;
  // Never lift near-silence or a steady noise bed. +6 dB is the maximum boost.
  const gainDb=quiet||damaged?Math.min(0,-3-a.peakDb):clamp(-23-a.rmsDb,-18,stationary?0:6);
  const compress=!quiet&&!damaged&&!stationary&&a.peakDb+gainDb>-4;
  return {version:1,enabled:!quiet&&!damaged,gain_db:round(Math.min(gainDb,-1-a.peakDb)),highpass_hz:!quiet&&!damaged&&a.lowRatio>.65?35:0,hum_hz:!quiet&&!damaged?a.humHz:0,compress,fade_ms:80,status:quiet?'quiet':damaged?'clipped':'ready',waveform:a.waveform};
 }
 async function motion(m,{signal,cancelled=()=>false}={}){
  if(m.kind!=='video')return [];const video=document.createElement('video');video.muted=true;video.playsInline=true;video.crossOrigin='anonymous';video.preload='auto';
  const wait=(event,action)=>new Promise((resolve,reject)=>{const finish=e=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);signal?.removeEventListener('abort',cancel);e?reject(e):resolve();},ok=()=>finish(),bad=()=>finish(Error('motion_unavailable')),cancel=()=>finish(abort()),timer=setTimeout(bad,6000);video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',cancel,{once:true});action();});
  try{await wait('loadeddata',()=>video.src=m.url);const canvas=document.createElement('canvas');canvas.width=32;canvas.height=18;const ctx=canvas.getContext('2d',{willReadFrequently:true}),count=Math.min(12,Math.max(3,Math.ceil(m.duration/2))),samples=[];let previous;
   for(let i=0;i<count;i++){if(signal?.aborted||cancelled())throw abort();const at=Math.max(0,(m.duration-.1)*i/(count-1));if(Math.abs(video.currentTime-at)>.02)await wait('seeked',()=>video.currentTime=at);ctx.drawImage(video,0,0,32,18);const pixels=ctx.getImageData(0,0,32,18).data;let change=0;if(previous)for(let j=0;j<pixels.length;j+=4)change+=(Math.abs(pixels[j]-previous[j])+Math.abs(pixels[j+1]-previous[j+1])+Math.abs(pixels[j+2]-previous[j+2]))/(255*3*32*18);samples.push({at,change});previous=pixels;}
   return samples;
  }finally{video.pause();video.removeAttribute('src');video.load();}
 }
 async function analyze(m,{signal,cancelled=()=>false,progress=()=>{}}={}){
  if(signal?.aborted||cancelled())throw abort();const key=(m.path||m.url)+'|'+(m.bytes||'')+'|'+(m.duration||'');if(cache.has(key)){progress(1);return cache.get(key)}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('audio_unavailable');
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,30000);let context;
  try{if(signal?.aborted||cancelled())throw abort();const res=await fetch(m.url,{signal:controller.signal});if(!res.ok)throw Error('audio_fetch_failed');const data=await res.arrayBuffer();if(data.byteLength>50*1024*1024)throw Error('audio_too_large');progress(.2);if(signal?.aborted||cancelled())throw abort();context=new AC();const buffer=await context.decodeAudioData(data);progress(.4);if(buffer.duration>121||buffer.numberOfChannels>8)throw Error('audio_too_large');const result=await measure(buffer,{cancelled:()=>signal?.aborted||cancelled(),progress:p=>progress(.4+p*.4)});if(signal?.aborted||cancelled())throw abort();try{result.motion=await motion(m,{signal,cancelled})}catch(e){if(e.name==='AbortError')throw e;result.motion=[];}if(signal?.aborted||cancelled())throw abort();cache.set(key,result);if(cache.size>12)cache.delete(cache.keys().next().value);progress(1);return result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);await context?.close();}
 }
 function suggestTrim(m,a){
  // Existing manual trims are authoritative. No arbitrary cut for silence or a flat ambience.
  if(m.trim_start!==undefined||m.trim_end!==undefined||a.rmsDb<-55||a.bodyDb-a.floorDb<4)return {};
  const length=Math.min(8*(m.speed||1),m.duration);if(m.duration<=length)return {};
  let best=0,score=-Infinity;const windows=Math.round(length/.05);
  for(let i=0;i+windows<=a.envelope.length;i+=4){let s=0;for(let j=i;j<i+windows;j++){const prev=a.envelope[Math.max(0,j-1)];s+=a.envelope[j]+Math.max(0,a.envelope[j]-prev)*2;}const movement=(a.motion||[]).filter(p=>p.at>=i*.05&&p.at<(i+windows)*.05);if(movement.length)s*=1-Math.min(.15,movement.reduce((n,p)=>n+p.change,0)/movement.length*.3);if(s>score){score=s;best=i;}}
  // Include the onset and a short breath before it, not just the loudest sample.
  const start=clamp(best*.05-.3,0,m.duration-length);return {trim_start:round(start),trim_end:round(start+length)};
 }
 async function compose(media,{onProgress=()=>{},cancelled=()=>false,signal}={}){
  const plans=[];for(let i=0;i<media.length;i++){if(signal?.aborted||cancelled())throw abort();const m=media[i],plan={transition:m.transition||'fade'},result={plan,failed:false};
   if(m.kind==='photo'){plan.clip_duration=m.clip_duration||4;onProgress(i+1,media.length,0);plans.push(result);continue;}
   try{const a=await analyze(m,{signal,cancelled,progress:p=>onProgress(i,media.length,p)});plan.audio_treatment=profile(a);Object.assign(plan,suggestTrim(m,a));result.analysis=a;}
   catch(e){if(e.name==='AbortError')throw e;result.failed=true;}
   plans.push(result);onProgress(i+1,media.length,0);
  }if(signal?.aborted||cancelled())throw abort();return plans;
 }
 // Exactly the same graph is used for live playback, offline verification and export.
 function graph(context,source,destination,m){
  const input=context.createGain(),output=context.createGain(),dry=context.createGain(),wet=context.createGain(),gain=context.createGain(),high=context.createBiquadFilter(),hum=context.createBiquadFilter(),compress=context.createDynamicsCompressor();
  high.type='highpass';high.Q.value=.5;hum.type='notch';hum.Q.value=18;compress.threshold.value=-16;compress.knee.value=12;compress.attack.value=.006;compress.release.value=.18;
  source.connect(input);input.connect(dry);dry.connect(output);input.connect(high);high.connect(hum);hum.connect(gain);gain.connect(compress);compress.connect(wet);wet.connect(output);output.connect(destination);
  let initialized=false;
  function update(original=false){const p=m.audio_treatment,enabled=p?.version===1&&p.enabled&&!original;if(!initialized){dry.gain.value=enabled?0:1;wet.gain.value=enabled?1:0;initialized=true;}else{dry.gain.setTargetAtTime(enabled?0:1,context.currentTime,.012);wet.gain.setTargetAtTime(enabled?1:0,context.currentTime,.012);}gain.gain.value=10**((p?.gain_db||0)/20);high.frequency.value=p?.highpass_hz||1;hum.frequency.value=p?.hum_hz||20000;hum.Q.value=p?.hum_hz?18:1000;compress.ratio.value=p?.compress?2:1;}
  update();return {update,volume(value){output.gain.setTargetAtTime(value,context.currentTime,.008)},disconnect(){[source,input,output,dry,wet,gain,high,hum,compress].forEach(n=>n.disconnect())}};
 }
 window.VillegramFeelings={load,assetURL,search,analyze,measure,profile,suggestTrim,compose,graph,get catalog(){return catalog}};
})();
