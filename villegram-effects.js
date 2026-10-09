(()=>{
 const filters={original:{label:'Original',css:'none'},warm:{label:'Aconchego',css:'sepia(.18) saturate(1.12) brightness(1.04)'},soft:{label:'Suave',css:'saturate(.8) contrast(.92) brightness(1.08)'},gold:{label:'Dourado',css:'sepia(.3) saturate(1.15) contrast(1.05)'},mono:{label:'P&B',css:'grayscale(1) contrast(1.08)'}};
 const modes={original:{label:'Original',duration:6500,description:'Enquadramento livre'},breathe:{label:'Respirar',duration:8000,description:'Tela cheia · dissolve suave · zoom entra e sai'},pulse:{label:'Pulso',duration:3200,description:'Tela cheia · corte rápido · zoom alternado'},cinema:{label:'Cinema',duration:6000,description:'Moldura vertical · transição lateral · movimento amplo'}};
 modes.feelings={label:'Feelings',duration:6000,description:'Seus sons, equilibrados · montagem suave'};
 const templates=modes;
 const css=m=>filters[m?.filter||'original']?.css||'none';
 function applyTemplate(m,key){if(!modes[key])return;m.mode=key;}
 function controls(host,getMedia,changed,locked=()=>false,getCollection=()=>[getMedia()]){
  const svg=p=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
  const glyphs={
   filter:'<path d="M5 3v3m0 5v10M12 3v10m0 5v3M19 3v5m0 5v8"/><circle class="vg-glyph-color" cx="5" cy="8.5" r="2.5"/><circle cx="12" cy="15.5" r="2.5"/><circle cx="19" cy="10.5" r="2.5"/>',
   effect:'<rect x="3" y="6" width="12" height="15" rx="3" opacity=".35"/><g class="vg-glyph-frame"><rect x="8" y="3" width="13" height="16" rx="3"/><path d="m12 8 5 3-5 3Z"/></g>',
   speed:'<path d="M4 17a9 9 0 1 1 16 0M12 12l5-5M6 17h12"/>',
   original:'<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 15l3-4 3 4"/>',
   breathe:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8l-5-5m13 5 5-5M8 16l-5 5m13-5 5 5"/>',
   pulse:'<rect x="8" y="4" width="12" height="16" rx="3"/><path d="M4 7h1M2 12h3m-1 5h1m8-9 4 4-4 4"/>',
   cinema:'<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M6 7h12M6 17h12m-4-7 3 2-3 2"/>'
  };
  host.innerHTML='<button type="button" class="vg-wheel-launch" data-effects-toggle aria-label="Abrir filtros e modos" aria-expanded="false">'+svg('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>')+'</button><div class="vg-wheel" hidden aria-label="Editar visual"><div class="vg-wheel-outer" role="group" aria-label="Categorias de edição"></div><div class="vg-wheel-inner" role="group" aria-roledescription="carrossel" aria-label="Deslize para escolher o filtro"></div><span class="vg-wheel-current" aria-hidden="true"></span><button type="button" class="vg-wheel-close" aria-label="Concluir edição">'+svg('<path d="m5 12 4 4L19 6"/>')+'</button><span class="vg-wheel-feedback vg-visually-hidden" role="status" aria-live="polite"></span></div>';
  const wheel=host.querySelector('.vg-wheel'),launch=host.querySelector('[data-effects-toggle]'),outer=host.querySelector('.vg-wheel-outer'),inner=host.querySelector('.vg-wheel-inner');
  let active='filter',categoryKind,choicesKey,gesture,suppressClickUntil=0;
  function announce(text){host.querySelector('.vg-wheel-feedback').textContent=text;}
  function options(){const m=getMedia();if(!m)return [];return active==='filter'?Object.entries(filters).map(([key,v])=>[key,v.label,(m.filter||'original')===key]):active==='effect'?Object.entries(modes).map(([key,v])=>[key,v.label,(m.mode||'original')===key]):[.5,.75,1].map(v=>[String(v),v===1?'Normal':String(v).replace('.',',')+'×',(m.speed||1)===v]);}
  function choose(value){if(locked())return;const m=getMedia();if(!m)return;if(active==='filter')m.filter=value;else if(active==='speed')m.speed=Number(value);else if(value==='feelings'){host.dispatchEvent(new CustomEvent('villegram-feelings',{bubbles:true}));return}else getCollection().forEach(item=>applyTemplate(item,value));changed();draw();announce(options().find(([key])=>key===value)?.[1]||'');}
  function advance(direction){const items=options();if(!items.length)return;const index=Math.max(0,items.findIndex(item=>item[2]));choose(items[(index+direction+items.length)%items.length][0]);}
  function draw(){
   const m=getMedia();if(!m)return;
   const categories=m.kind==='video'?[['filter','Filtro'],['speed','Velocidade']]:[['filter','Filtro'],['effect','Modo']];if(!categories.some(c=>c[0]===active))active='filter';
   wheel.dataset.category=active;inner.setAttribute('aria-label','Deslize para escolher '+(active==='filter'?'o filtro':active==='effect'?'o modo':'a velocidade'));
   if(categoryKind!==m.kind){categoryKind=m.kind;outer.replaceChildren();categories.forEach(([key,name])=>{const b=document.createElement('button');b.type='button';b.dataset.effectsTab=key;b.setAttribute('aria-label',name);b.innerHTML=svg(glyphs[key])+'<span class="vg-wheel-category-name">'+name+'</span>';b.onclick=()=>{if(locked())return;resetGesture();active=key;draw();announce(name)};outer.append(b)});}
   categories.forEach(([key])=>{const b=outer.querySelector('[data-effects-tab="'+key+'"]');b.setAttribute('aria-pressed',String(active===key));b.disabled=locked();});
   const items=options(),preview=m.kind==='video'?m.poster:m.url,key=m.kind+'|'+active+'|'+preview;
   if(choicesKey!==key){choicesKey=key;inner.replaceChildren();items.forEach(([value,name])=>{
    const b=document.createElement('button');b.type='button';b.dataset[active==='filter'?'filter':active==='effect'?'template':'speed']=value;b.setAttribute('aria-label',name);b.title=active==='effect'?name+' · '+modes[value].description:name;
    const visual=document.createElement('span');visual.className='vg-wheel-visual';
    if(active==='filter'&&preview){const img=document.createElement('img');img.alt='';img.src=preview;img.draggable=false;img.style.filter=filters[value].css;visual.append(img);}
    else if(active==='effect'&&preview){const frame=document.createElement('span');frame.className='vg-mode-demo';frame.dataset.previewMode=value;const img=document.createElement('img');img.src=preview;img.alt='';img.draggable=false;frame.append(img);visual.append(frame);}
    else visual.innerHTML=active==='speed'?'<span class="vg-wheel-speed-value">'+name+'</span>':svg(glyphs[value]||glyphs.filter);
    b.append(visual);b.onclick=()=>choose(value);inner.append(b);
   });}
   const selected=Math.max(0,items.findIndex(item=>item[2]));host.querySelector('.vg-wheel-current').textContent=items[selected]?.[1]||'';
   items.forEach(([value,,isSelected],i)=>{
    const b=inner.querySelector('[data-'+(active==='filter'?'filter':active==='effect'?'template':'speed')+'="'+value+'"]');let delta=(i-selected+items.length)%items.length;if(delta>items.length/2)delta-=items.length;
    b.dataset.position=delta===0?'current':delta===-1?'left':delta===1?'right':'away';b.style.setProperty('--vg-card-x',(delta*72)+'px');b.style.setProperty('--vg-card-scale',delta===0?'1':'.84');b.style.setProperty('--vg-card-turn',delta===0?'0deg':delta<0?'18deg':'-18deg');b.hidden=Math.abs(delta)>1;b.tabIndex=delta===0?0:-1;b.setAttribute('aria-pressed',String(isSelected));b.disabled=locked();
   });
  }
  function resetGesture(){gesture=null;wheel.dataset.dragging='false';inner.style.setProperty('--vg-drag-x','0px');}
  inner.onpointerdown=e=>{if(locked()||e.button!==undefined&&e.button!==0)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,moving:false};};
  inner.onpointermove=e=>{if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.moving&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){resetGesture();return;}if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){gesture.moving=true;inner.setPointerCapture?.(e.pointerId);}if(!gesture.moving)return;e.preventDefault();wheel.dataset.dragging='true';inner.style.setProperty('--vg-drag-x',Math.max(-48,Math.min(48,dx))+'px');};
  inner.onpointerup=e=>{if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,moved=gesture.moving;resetGesture();if(moved){suppressClickUntil=Date.now()+300;if(Math.abs(dx)>24)advance(dx<0?1:-1);}};
  inner.onpointercancel=resetGesture;inner.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation()}},true);
  function open(){if(locked()||!getMedia())return;active='filter';wheel.hidden=false;launch.setAttribute('aria-expanded','true');draw();}
  function close(){resetGesture();wheel.hidden=true;launch.setAttribute('aria-expanded','false');}
  launch.onclick=()=>wheel.hidden?open():close();host.querySelector('.vg-wheel-close').onclick=()=>{close();launch.focus()};host.onkeydown=e=>{if(e.key==='Escape'){close();launch.focus()}else if(!wheel.hidden&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();advance(e.key==='ArrowRight'?1:-1);inner.querySelector('[data-position=current]')?.focus()}};
  return {open,close,render(){host.hidden=!getMedia();if(!getMedia())close();else if(!wheel.hidden)draw()}};
 }
 // Share frame: only authored layers, media framing and a discreet brand handle.
 function watermark(layers=[]){const corners=[{x:6,y:90},{x:72,y:90},{x:6,y:10},{x:72,y:10}];return corners.find(c=>!layers.some(t=>Math.abs(t.y-c.y)<14&&Math.abs(t.x-(c.x+11))<32))||null;}
 function geometry(m,sw,sh,w,h){const scale=(m.fit==='contain'?Math.min:Math.max)(w/sw,h/sh)*(m.zoom||1),dw=sw*scale,dh=sh*scale;return {x:(w-dw)*(m.position_x??50)/100+w*(m.offset_x||0)/100,y:(h-dh)*(m.position??50)/100+h*(m.offset_y||0)/100,w:dw,h:dh};}
 function draw(ctx,source,m,layers){const w=ctx.canvas.width,h=ctx.canvas.height;ctx.fillStyle='#17130f';ctx.fillRect(0,0,w,h);const g=geometry(m,source.videoWidth||source.naturalWidth,source.videoHeight||source.naturalHeight,w,h);ctx.save();if(m.mode==='cinema'){ctx.beginPath();ctx.roundRect(w*.05,h*.05,w*.9,h*.9,16*w/720);ctx.clip();}ctx.filter=css(m);ctx.drawImage(source,g.x,g.y,g.w,g.h);ctx.restore();
 for(const t of layers){const size=t.size*w/100,chars=[];const font=v=>(v.italic?'italic ':'')+(v.bold===false?'400 ':'600 ')+size+'px "DM Sans",sans-serif';for(const part of new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(t.text)){const i=part.index,c=part.segment,style={...t};for(const r of t.runs||[])if(i>=r.start&&i<r.end)Object.assign(style,r);ctx.font=font(style);chars.push({c,style,width:ctx.measureText(c).width,index:i});}
 const lines=[[]];let length=0;for(const ch of chars){if(ch.c==='\n'){lines.push([]);length=0;continue}if(length+ch.width>w*.9&&lines.at(-1).length){lines.push([]);length=0}lines.at(-1).push(ch);length+=ch.width;}
 let y=t.y*h/100-lines.length*size*.625;ctx.textBaseline='top';for(const line of lines){const total=line.reduce((a,c)=>a+c.width,0);let x=t.x*w/100-total/2;for(const ch of line){ctx.font=font(ch.style);if(ch.style.background!=='transparent'){ctx.fillStyle=ch.style.background||'#17130f';ctx.fillRect(x-1,y-2,ch.width+2,size*1.25)}ctx.fillStyle=ch.style.color||'#fff';ctx.fillText(ch.c,x,y);if(ch.style.strike){ctx.fillRect(x,y+size*.55,ch.width,Math.max(1,size/18))}x+=ch.width;}y+=size*1.25;}}
 const mark=watermark(layers);if(mark){ctx.font='500 18px "DM Sans",sans-serif';ctx.fillStyle='#ffffff';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText('@chalezinhoville',mark.x*w/100,mark.y*h/100);ctx.shadowBlur=0;}
 }
 async function exportMedia(blob,m,{guest=true,progress=()=>{},signal}={}){
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;const ctx=canvas.getContext('2d');if(!ctx)throw Error('export_unavailable');const layers=guest?(m.text_layers||[]):[],url=URL.createObjectURL(blob);let source,stream,recorder,audioContext,frame,timeout;
 const check=()=>{if(signal?.aborted)throw new DOMException('Cancelado','AbortError')};
 try{check();await document.fonts?.ready;
 source=document.createElement(m.kind==='video'?'video':'img');if(m.kind==='video'){source.playsInline=true;source.preload='auto';source.style.cssText='position:fixed;left:-2px;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';document.body.append(source)}
 await new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('media_timeout')),20000);source.addEventListener(m.kind==='video'?'loadeddata':'load',resolve,{once:true});source.addEventListener('error',()=>reject(Error('media_unavailable')),{once:true});source.src=url});clearTimeout(timeout);check();draw(ctx,source,m,layers);
 if(m.kind!=='video')return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('export_unavailable')),'image/jpeg',.92));
 if(!window.MediaRecorder||!canvas.captureStream)throw Error('export_unavailable');
 // MP4 is required for the Instagram export; never silently discard the edits.
 const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E,opus','video/mp4;codecs=avc1','video/mp4'].find(v=>MediaRecorder.isTypeSupported(v));if(!mime)throw Error('mp4_unavailable');
 source.playbackRate=m.speed||1;source.preservesPitch=true;stream=canvas.captureStream(30);
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('audio_unavailable');audioContext=new AC();const audioSource=audioContext.createMediaElementSource(source),dest=audioContext.createMediaStreamDestination();audioSource.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));await audioContext.resume();
 const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
 return await new Promise((resolve,reject)=>{const stopError=e=>{if(recorder.state!=='inactive')recorder.stop();reject(e)};const abort=()=>stopError(new DOMException('Cancelado','AbortError'));signal?.addEventListener('abort',abort,{once:true});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=()=>stopError(Error('export_failed'));recorder.onstop=()=>{signal?.removeEventListener('abort',abort);const result=new Blob(chunks,{type:'video/mp4'});result.size?resolve(result):reject(Error('export_failed'))};source.onended=()=>recorder.stop();source.onerror=()=>stopError(Error('export_failed'));timeout=setTimeout(()=>stopError(Error('export_timeout')),(source.duration/(m.speed||1)+20)*1000);
 const paint=()=>{if(recorder.state==='inactive')return;draw(ctx,source,m,layers);progress(Math.min(99,Math.round(source.currentTime/source.duration*100)));frame=requestAnimationFrame(paint)};recorder.start(1000);source.play().then(paint).catch(stopError);});
 }finally{clearTimeout(timeout);cancelAnimationFrame(frame);source?.pause?.();source?.remove();stream?.getTracks().forEach(t=>t.stop());if(recorder&&recorder.state!=='inactive')recorder.stop();await audioContext?.close();URL.revokeObjectURL(url);}
 }
 window.VillegramEffects={filters,modes,templates,css,applyTemplate,controls,geometry,watermark,renderFrame:draw,exportMedia};
})();
