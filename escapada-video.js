(()=>{
 'use strict';
 const money=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 // Compute from the original quote on every render; never mark up the stored price.
 function installment(cents){
  if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Preço inválido para parcelamento.');
  const total=Math.round(cents*107/100),value=Math.round(total/10);
  return {count:10,total_cents:total,value_cents:value,value:(value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})};
 }
 const installmentText=cents=>'10xR$'+installment(cents).value;
 const installmentHTML=cents=>'<span class="escape-installments"><span class="escape-installment-count">10x</span><span class="escape-installment-value">R$'+installment(cents).value+'</span></span>';
 const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const date=v=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
 const range=c=>date(c.check_in)+' a '+date(c.check_out);
 const key=c=>[c.offer_id||'',c.property_id,c.check_in,c.check_out,c.guests||2,c.rate_code||''].join(':');
 function dateToolURL(card){return 'villemoments-escapadas.html?'+new URLSearchParams({chalet:card.property_code,check_in:card.check_in,check_out:card.check_out,guests:String(card.guests||2),offer_id:card.offer_id||'',rate_code:card.rate_code||'non_refundable'});}
 function dateSelection(selection,catalog){
  const property=(catalog.properties||[]).find(p=>p.code===selection.chalet&&p.active!==false);
  if(!property)throw Error('Escolha um chalé ativo.');
  if(!validDate(selection.check_in)||!validDate(selection.check_out)||selection.check_out<=selection.check_in||!Number.isInteger(selection.guests)||selection.guests<1||selection.guests>2)throw Error('Confira a entrada, a saída e os hóspedes.');
  const offers=(catalog.offers||[]).filter(o=>o.status==='active'&&o.showcase?.enabled&&(o.property_ids||[]).some(id=>Number(id)===Number(property.id)));
  const offer=selection.offer_id?offers.find(o=>o.id===selection.offer_id):offers.length===1?offers[0]:offers.find(o=>/^escapada$/i.test(o.name));
  if(!offer)throw Error('Este chalé não tem uma Escapada automática ativa para carregar.');
  return {property_id:Number(property.id),property_code:property.code,property_name:property.name,image:property.cover_image,offer_id:offer.id,offer_name:offer.name,check_in:selection.check_in,check_out:selection.check_out,guests:selection.guests,rate_code:['refundable','non_refundable'].includes(selection.rate_code)?selection.rate_code:'non_refundable'};
 }
 function filter(cards,{property='',from='',to=''}={}){
  return cards.filter(c=>(!property||c.property_code===property)&&(!from||c.check_in>=from)&&(!to||c.check_in<=to)).sort((a,b)=>a.check_in.localeCompare(b.check_in)||String(a.property_code).localeCompare(String(b.property_code)));
 }
 function mediaFor(card,catalog){
  if(card.publication?.media?.length)return card.publication.media.map(m=>({...m}));
  const offer=(catalog.offers||[]).find(o=>o.id===card.offer_id)||{},property=(catalog.properties||[]).find(p=>Number(p.id)===Number(card.property_id))||{};
  const configured=(offer.villegram?.photos||[]).filter(m=>Number(m.property_id)===Number(card.property_id)),gallery=(property.gallery||[]).map(p=>typeof p==='string'?{url:p,alt:property.name}:p);
  const photos=configured.length?configured:gallery.length?gallery:[{url:card.image||property.cover_image,alt:card.property_name}];
  const rows=card.showcase_image?[{url:card.showcase_image},...photos.filter(m=>m.url!==card.showcase_image)]:photos;
  return rows.filter(m=>m.url).slice(0,8).map(m=>({...m,kind:'photo',fit:m.fit||'cover',mode:m.mode||'breathe',clip_duration:m.clip_duration||6.5,transition:m.transition||'fade',alt:m.alt||card.property_name}));
 }
 function assertCard(c){if(!validDate(c.check_in)||!validDate(c.check_out)||c.check_out<=c.check_in||!c.property_name||!Number.isInteger(c.guests)||!Number.isSafeInteger(c.total_cents)||c.total_cents<=0)throw Error('Confira chalé, datas, hóspedes e preço antes de baixar.');}
 function label(ctx,text,x,y,width,size,{serif=false,bold=false,color='#fff'}={}){
  let n=size;const font=()=>{ctx.font=(bold?'600 ':'400 ')+n+'px '+(serif?'Georgia,serif':'"DM Sans",Arial,sans-serif');};font();
  while(ctx.measureText(text).width>width&&n>14){n--;font();}ctx.fillStyle=color;ctx.fillText(text,x,y);return n;
 }
 function drawOverlay(ctx,card){
  const w=ctx.canvas.width,h=ctx.canvas.height;ctx.save();ctx.scale(w/720,h/1280);ctx.textBaseline='alphabetic';ctx.textAlign='left';
  const top=ctx.createLinearGradient(0,0,0,245);top.addColorStop(0,'#000a');top.addColorStop(1,'#0000');ctx.fillStyle=top;ctx.fillRect(0,0,720,245);
  const shade=ctx.createLinearGradient(0,430,0,1280);shade.addColorStop(0,'#0000');shade.addColorStop(.4,'#0007');shade.addColorStop(1,'#000e');ctx.fillStyle=shade;ctx.fillRect(0,430,720,850);
  label(ctx,'Chalezinho Ville',42,78,620,29,{bold:true});label(ctx,'Chalés românticos em Guarapari',42,112,620,22);label(ctx,'V I L L E  M O M E N T S',42,151,620,21,{color:'#eddcad'});
  label(ctx,card.property_name,42,691,620,25);label(ctx,(card.video_title||card.offer_name||'Escapada').split(' · ')[0],42,750,620,57,{serif:true});
  label(ctx,range(card),42,801,620,29,{bold:true});label(ctx,card.nights+' noites · '+card.guests+' hóspedes',42,838,620,23);
  const before=Number.isSafeInteger(card.gross_cents)&&card.gross_cents>card.total_cents?installmentText(card.gross_cents):'';
  if(before){label(ctx,before,42,887,620,27,{color:'#ecddb9'});const width=ctx.measureText(before).width;ctx.strokeStyle='#ecddb9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(42,877);ctx.lineTo(42+width,877);ctx.stroke();}
  const priceY=before?955:917,price=installment(card.total_cents);
  label(ctx,'10x',42,priceY,620,29,{bold:true});const priceX=42+ctx.measureText('10x').width+2;
  label(ctx,'R$'+price.value,priceX,priceY,662-priceX,64,{bold:true});label(ctx,'Hospedagem e limpeza incluídas',42,before?991:957,620,21);
  const inclusions=(card.experiences||[]).flatMap(e=>e.components||[]).map(c=>c.name).filter(Boolean);
  label(ctx,inclusions.length?'Inclui '+inclusions.join(' · '):'Consulte disponibilidade e condições',42,1041,620,21);
  ctx.textAlign='center';
  label(ctx,'@chalezinhoville · chalezinhoville.com.br',360,1204,638,21);label(ctx,'Preço e disponibilidade sujeitos à confirmação.',360,1238,638,17,{color:'#e8dfcb'});ctx.restore();
 }
 async function refresh(card,{signal}={}){
  const q=new URLSearchParams(Object.fromEntries(['property_id','offer_id','check_in','check_out','guests','rate_code'].map(k=>[k,card[k]??''])));
  const r=await fetch('/api/escapada-video?'+q,{cache:'no-store',signal:signal||AbortSignal.timeout(45000)}),d=await r.json();
  if(!r.ok||!d.ok||!d.card)throw Error('Esta escapada não está disponível para as mesmas datas e condições. Atualize a lista ou ajuste a seleção.');
  const fresh={...card,...d.card,checked_at:d.checked_at};assertCard(fresh);return fresh;
 }
 function fileName(card){return 'escapada-'+String(card.property_code||card.property_name).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+card.check_in+'-a-'+card.check_out+'.mp4';}
 async function exportVideo(card,media,options={}){
  assertCard(card);if(!media?.length)throw Error('Escolha pelo menos uma foto ou vídeo.');
  return window.VillegramTimeline.exportSequence(media,{...options,guest:false,sound:media.some(m=>m.sound||m.kind==='video'&&m.original_volume!==0),overlay:ctx=>drawOverlay(ctx,card)});
 }
 function download(blob,card){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName(card);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function preview(canvas,card,media,{onError=()=>{},onTime=()=>{}}={}){
  assertCard(card);if(!media.length)throw Error('Nenhuma mídia disponível para esta escapada.');
  canvas.width=720;canvas.height=1280;const layer=document.createElement('canvas');layer.width=720;layer.height=1280;
  const host=document.createElement('div');host.className='escape-media-host';document.body.append(host);let dead=false,frame;
  const engine=window.VillegramTimeline.player({host,media,preloadAll:true,onError,onTime,onComplete:()=>engine.setActive(false)}),clips=window.VillegramTimeline.sequence(media);
  const destroy=()=>{dead=true;cancelAnimationFrame(frame);engine.destroy();host.remove();};
  try{
   await Promise.all(engine.elements.map(el=>new Promise((yes,no)=>{if(el.tagName==='IMG'&&el.complete&&el.naturalWidth||el.tagName==='VIDEO'&&el.readyState>=2)return yes();const timer=setTimeout(()=>no(Error('A mídia demorou para carregar. Tente novamente.')),20000);el.addEventListener(el.tagName==='VIDEO'?'loadeddata':'load',()=>{clearTimeout(timer);yes()},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);no(Error('Uma foto ou vídeo não carregou.'));},{once:true});if(el.tagName==='VIDEO'){el.preload='auto';el.load();}})));
   if(dead)return {destroy};const ctx=canvas.getContext('2d'),scratch=layer.getContext('2d');
   const paint=()=>{if(dead)return;try{window.VillegramTimeline.renderSequenceFrame(ctx,scratch,clips,engine.elements,engine.time,{overlay:ctx=>drawOverlay(ctx,card)});}catch(e){destroy();onError(e.message);return;}frame=requestAnimationFrame(paint);};
   engine.setActive(true);paint();return {destroy,seek:t=>engine.seek(t),pause:()=>engine.setActive(false),play:()=>{if(engine.time>=engine.total-.05)engine.seek(0);engine.setActive(true);},get total(){return engine.total;},get time(){return engine.time;}};
  }catch(e){destroy();throw e;}
 }
 async function openDownloadDialog(card,media){
  const dialog=document.createElement('dialog');dialog.className='escape-editor-dialog';dialog.setAttribute('aria-label','Prévia e download da escapada em vídeo');
  dialog.innerHTML='<header><div><small>VÍDEO DA ESCAPADA</small><h2></h2><p data-dates></p><p data-price class="escape-dialog-price"></p></div><button type="button" data-close>Fechar</button></header><div class="escape-editor-canvas"><canvas width="720" height="1280" role="img" aria-label="Prévia do vídeo da escapada"></canvas></div><p data-status role="status" aria-live="polite">Carregando a prévia…</p><progress max="100" value="0" hidden aria-label="Geração do vídeo"></progress><div class="escape-editor-actions"><button type="button" data-play>Reproduzir</button><button type="button" data-pause>Pausar</button><button type="button" class="escape-editor-primary" data-download disabled>Baixar vídeo MP4</button><button type="button" data-cancel hidden>Cancelar geração</button></div>';
  const $=s=>dialog.querySelector(s);$('h2').textContent=card.property_name+' · '+(card.video_title||card.offer_name||'Escapada');$('[data-dates]').textContent=range(card);$('[data-price]').innerHTML=installmentHTML(card.total_cents);
  document.body.append(dialog);dialog.showModal();let player,controller,busy=false,closed=false;
  const close=new Promise(resolve=>dialog.onclose=()=>{closed=true;player?.destroy();controller?.abort();dialog.remove();resolve();});
  dialog.oncancel=e=>{if(busy)e.preventDefault();};$('[data-close]').onclick=()=>dialog.close();$('[data-play]').onclick=()=>player?.play();$('[data-pause]').onclick=()=>player?.pause();$('[data-cancel]').onclick=()=>controller?.abort();
  try{player=await preview($('canvas'),card,media,{onError:t=>$('[data-status]').textContent=t});if(closed){player.destroy();return close;}$('[data-download]').disabled=false;$('[data-status]').textContent='Confira o chalé, os dias e o valor das parcelas da escapada. Este é o vídeo que será baixado.';}
  catch(e){$('[data-status]').textContent=e.message;}
  $('[data-download]').onclick=async()=>{
   if(busy)return;busy=true;controller=new AbortController();player?.pause();for(const b of dialog.querySelectorAll('button:not([data-cancel])'))b.disabled=true;$('[data-cancel]').hidden=false;$('progress').hidden=false;
   try{Object.assign(card,await refresh(card,{signal:controller.signal}));$('[data-dates]').textContent=range(card);$('[data-price]').innerHTML=installmentHTML(card.total_cents);const blob=await exportVideo(card,media,{signal:controller.signal,progress:n=>{$('progress').value=n;$('[data-status]').textContent='Gerando vídeo… '+n+'%';}});download(blob,card);$('[data-status]').textContent='Vídeo baixado: '+fileName(card);}
   catch(e){$('[data-status]').textContent=e.name==='AbortError'?'Geração cancelada.':e.message==='mp4_unavailable'?'Este navegador não permite gerar MP4. Use o Chrome atualizado ou Safari.':e.message;}
   finally{busy=false;controller=null;for(const b of dialog.querySelectorAll('button'))b.disabled=false;$('[data-cancel]').hidden=true;}
  };
  return close;
 }
 window.VilleEscapadaVideo={money,installment,installmentText,installmentHTML,range,key,dateToolURL,dateSelection,filter,mediaFor,assertCard,drawOverlay,refresh,fileName,exportVideo,download,preview,openDownloadDialog};
})();
