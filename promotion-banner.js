(() => {
  'use strict';
  const root=document.getElementById('pv-banners');
  const $=selector=>root.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const dateFormat=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
  const updatedFormat=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
  const short=date=>date.slice(8,10)+'/'+date.slice(5,7);
  const iso=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  const key='ville-pms-promotion-editor-v1';
  const textIds=['format','title','period','subtitle','in-time','out-time','price-label','stay-label','conditions','extras','green','background'];
  let properties=[], ready=false, opening, requestSequence=0, drawing=0, canDownload=false, recording=false;
  let contextKey='', fetchedSource='', previewReady=false;
  const images=new Map();
  const framing=window.PriceVilleBannerFraming;
  const framePhotos=new Map();
  let photoFrames=[], lastRows=[], lastPhotos=[], frameHeight=1536, animation=0, gesture=null, galleryRow=null, galleryIndex=0;
  const artboard=$('.pv-banner-artboard'), homeStage=$('.pv-banner-stage');
  function note(message,error=false) {
    $('#banner-query-note').textContent=message;
    $('#banner-query-note').dataset.error=String(error);
  }
  function selection() {
    return {from:$('#banner-from').value,to:$('#banner-to').value,guests:Number($('#banner-guests').value),
      source:$('#banner-source').value,rate:$('#banner-rate').value,offer:$('#banner-offer').value,property:$('#banner-property').value};
  }
  function fingerprint() { return JSON.stringify(selection()); }
  function readCents(value) {
    let text=String(value??'').trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
    if (text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const result=Math.round(Number(text)*100);
    return Number.isSafeInteger(result)&&result>0&&result<=999_999_999?result:null;
  }
  function serialize() {
    return {format:'priceville-banner',version:1,selection:selection(),texts:Object.fromEntries(textIds.map(id=>[id,$('#banner-'+id).value])),
      properties:properties.map(({code,name,description,enabled,cents,manual,photo,x,y,zoom,priceNote,observed,expiresAt})=>
        ({code,name,description,enabled,cents,manual,photo,x,y,zoom,priceNote,observed,expiresAt})),contextKey,fetchedSource};
  }
  function persist() { try { localStorage.setItem(key,JSON.stringify(serialize())); } catch {} }
  function apply(data) {
    if (data?.format!=='priceville-banner'||data.version!==1||!Array.isArray(data.properties)||!data.selection||!data.texts) throw Error('Arquivo de edição inválido.');
    const s=data.selection;
    if(s.source==='airbnb')throw Error('Esta edição usa cotações do PriceVille. Escolha Site ou digite os preços no PMS.');
    if (!iso(s.from)||!iso(s.to)||s.to<=s.from||!Number.isInteger(s.guests)||s.guests<1||s.guests>16||
      !['site','airbnb','manual'].includes(s.source)||!['lowest','non_refundable','refundable'].includes(s.rate)||
      data.properties.length>3||new Set(data.properties.map(row=>row.code)).size!==data.properties.length) throw Error('Os dados da edição estão inválidos.');
    const restored=[];
    for (const saved of data.properties) {
      const base=properties.find(row=>row.code===saved.code);
      if (!base) throw Error('Chalé não reconhecido no arquivo.');
      const photo=base.photos.some(item=>item.url===saved.photo||item.aliases?.includes(saved.photo))||/^data:image\/(png|jpeg|webp);base64,/.test(saved.photo??'') ? saved.photo : base.photo;
      restored.push({...base,name:String(saved.name??base.name).slice(0,90),description:String(saved.description??base.description).slice(0,220),
        enabled:saved.enabled!==false,cents:Number.isSafeInteger(saved.cents)&&saved.cents>0&&saved.cents<=999_999_999?saved.cents:null,
        manual:saved.manual===true,photo,x:Math.max(0,Math.min(100,Number(saved.x)||0)),y:Math.max(0,Math.min(100,Number(saved.y)||0)),
        zoom:Math.max(1,Math.min(2.5,Number(saved.zoom)||1)),priceNote:String(saved.priceNote??'').slice(0,400),
        observed:saved.observed,expiresAt:saved.expiresAt});
    }
    for (const row of properties) if (!restored.some(item=>item.code===row.code)) restored.push({...row,enabled:false});
    const texts={};
    for (const id of textIds) {
      const value=String(data.texts[id]??$('#banner-'+id).value);
      if(id==='format'&&!['story','feed','original'].includes(value))throw Error('Formato inválido.');
      if (id.endsWith('time')&&!/^\d{2}:\d{2}$/.test(value)) throw Error('Horário inválido.');
      if (['green','background'].includes(id)&&!/^#[a-f\d]{6}$/i.test(value)) throw Error('Cor inválida.');
      texts[id]=value.slice(0,600);
    }
    for (const id of ['from','to','guests','source','rate','offer','property']) $('#banner-'+id).value=s[id]||'';
    for (const id of textIds) $('#banner-'+id).value=texts[id];
    properties=restored;contextKey=String(data.contextKey??'');fetchedSource=String(data.fetchedSource??'');
    if (s.source!=='manual'&&contextKey!==fingerprint()) for (const row of properties) if (!row.manual) row.cents=null;
    $('#banner-rate-field').hidden=s.source!=='site';
    $('#banner-fetch').hidden=s.source==='manual';
  }
  function sourceNote(row) {
    if (row.manual) return 'Valor manual para este período.';
    let text=row.priceNote||'Consulte os preços ou informe o valor manualmente.';
    if (row.observed&&Number.isFinite(Date.parse(row.observed))) text+=' Consulta de '+updatedFormat.format(new Date(row.observed))+'.';
    return text;
  }
  function propertyMarkup(row,index) {
    const value=row.cents===null?'':(row.cents/100).toFixed(2).replace('.',',');
    return '<div class="pv-banner-property" data-code="'+row.code+'"><div class="pv-banner-compact-head">'+
      '<label class="pv-banner-compact-name"><input type="checkbox" data-edit="enabled"'+(row.enabled?' checked':'')+'><span data-property-name>'+escape(row.name)+'</span></label>'+
      '<label class="pv-banner-compact-price"><span aria-hidden="true">R$</span><input data-edit="price" inputmode="decimal" value="'+value+'" placeholder="Valor" aria-label="Preço '+escape(row.name)+'"></label></div>'+
      '<details class="pv-banner-property-details"><summary>Editar detalhes</summary><div class="pv-banner-property-body">'+
      '<div class="pv-banner-fields"><label class="pv-field">Nome<input data-edit="name" value="'+escape(row.name)+'" maxlength="90"></label></div>'+
      '<small data-price-note'+(!row.cents?' data-error="true"':'')+'>'+escape(sourceNote(row))+'</small>'+
      '<label class="pv-field">Destaque<textarea data-edit="description" maxlength="220" rows="2">'+escape(row.description)+'</textarea></label>'+
      '<button type="button" class="pv-button pv-banner-edit-photo" data-photo-editor="'+row.code+'"><img src="'+escape(row.photo)+'" alt=""><span>Foto e enquadramento<br><small>Editar direto na prévia</small></span></button>'+
      '<div class="pv-banner-property-order"><span>Ordem no banner</span><div class="pv-banner-move"><button type="button" class="pv-button" data-move="-1" aria-label="Mover '+escape(row.name)+' para cima"'+(index===0?' disabled':'')+'>↑</button><button type="button" class="pv-button" data-move="1" aria-label="Mover '+escape(row.name)+' para baixo"'+(index===properties.length-1?' disabled':'')+'>↓</button></div></div></div></details></div>';
  }
  function renderControls() { $('#banner-properties').innerHTML=properties.map(propertyMarkup).join(''); }
  function refreshNote(row) {
    const card=$('[data-code="'+row.code+'"]'), label=card.querySelector('[data-price-note]');
    label.textContent=sourceNote(row);label.dataset.error=String(!row.cents);
  }
  function invalidate() {
    ++requestSequence;
    $('#banner-fetch').disabled=false;
    $('#banner-fetch').textContent='Buscar preços';
    contextKey='';fetchedSource='';
    if ($('#banner-source').value!=='manual') {
      for (const row of properties) { row.cents=null;row.manual=false;row.priceNote='Datas, hóspedes ou fonte alterados. Consulte novamente.';row.observed=null;row.expiresAt=null; }
      renderControls();
    }
    note('');persist();void preview();
  }
  async function fetchPrices(event) {
    event?.preventDefault();
    if (!$('#pv-banner-form').reportValidity()) return;
    const selected=selection();
    if (!iso(selected.from)||!iso(selected.to)||selected.from>=selected.to) { note('A saída precisa ser depois da entrada.',true);return; }
    const seq=++requestSequence, scope=fingerprint();
    for (const row of properties) { row.cents=null;row.manual=false;row.expiresAt=null;row.priceNote='Consultando…'; }
    contextKey='';renderControls();void preview();
    $('#banner-fetch').disabled=true;$('#banner-fetch').textContent='Consultando…';note('');
    try {
      const response=await fetch('/api/promotion-banner?action=prices&'+new URLSearchParams(selected),{cache:'no-store',signal:AbortSignal.timeout(35_000)});
      const data=await response.json();
      if (!response.ok) throw Error(data.message??'Não foi possível consultar agora.');
      if (seq!==requestSequence||scope!==fingerprint()) return;
      for (const row of properties) {
        const price=data.properties.find(item=>item.code===row.code);
        row.cents=price?.status==='price'?price.cents:null;
        row.priceNote=price?.message??'Preço indisponível.';row.observed=price?.observed;row.expiresAt=price?.expiresAt;
        row.manual=false;
      }
      contextKey=scope;fetchedSource=selected.source;renderControls();persist();await preview();
      const found=properties.filter(row=>row.cents).length;
      note(found+' de '+properties.length+' preços encontrados. '+(found<properties.length?'Escolha outro período, retire o chalé sem oferta ou digite um valor manual.':''),found===0);
    } catch (error) {
      if (seq!==requestSequence) return;
      note(error.name==='TimeoutError'?'A consulta demorou. Tente novamente.':error.message,true);
      for (const row of properties) {row.priceNote='Consulta sem confirmação. Tente novamente ou digite manualmente.';refreshNote(row);}
      persist();void preview();
    } finally {
      if (seq===requestSequence) {$('#banner-fetch').disabled=false;$('#banner-fetch').textContent='Buscar preços';}
    }
  }
  function loadImage(url) {
    if (!images.has(url)) images.set(url,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(url);reject(Error('Não foi possível carregar uma foto. Escolha outra foto do site.'));};image.src=url;
    }));
    return images.get(url);
  }
  function rounded(ctx,x,y,w,h,r,fill) { ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill(); }
  function font(ctx,size,bold=false) {ctx.font=(bold?'700 ':'400 ')+size+'px Georgia, "Times New Roman", serif';}
  function fitText(ctx,text,x,y,maxWidth,size,{bold=false,align='left',color='#073b28'}={}) {
    font(ctx,size,bold);
    while (ctx.measureText(text).width>maxWidth&&size>8) font(ctx,--size,bold);
    ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y);ctx.textAlign='left';return size;
  }
  function wrap(ctx,text,width,size,bold=false) {
    font(ctx,size,bold);const result=[];
    for (const paragraph of String(text).split('\n')) {
      let line='';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next=line?line+' '+word:word;
        if (line&&ctx.measureText(next).width>width) {result.push(line);line=word;} else line=next;
      }
      result.push(line);
    }
    return result;
  }
  function blockText(ctx,text,x,y,width,maxHeight,size,{bold=false,align='left',color='#073b28',leading=1.1}={}) {
    let lines=wrap(ctx,text,width,size,bold);
    while ((lines.length*size*leading>maxHeight||lines.some(line=>ctx.measureText(line).width>width))&&size>8) lines=wrap(ctx,text,width,--size,bold);
    font(ctx,size,bold);ctx.fillStyle=color;ctx.textAlign=align;
    lines.forEach((line,index)=>ctx.fillText(line,x,y+index*size*leading));ctx.textAlign='left';return lines.length*size*leading;
  }
  function periodLabel(from,to) {
    if (from.slice(0,7)===to.slice(0,7)) return Number(from.slice(8))+' a '+dateFormat.format(new Date(to+'T12:00:00Z'));
    return dateFormat.format(new Date(from+'T12:00:00Z'))+' a '+dateFormat.format(new Date(to+'T12:00:00Z'));
  }
  function renderCanvas(rows,photos) {
    const selected=selection(), nights=(Date.parse(selected.to)-Date.parse(selected.from))/86_400_000;
    const canvas=$('#banner-canvas'), format=$('#banner-format').value, compact=format!=='original', height=compact?(format==='feed'?655:524*16/9):(rows.length===3?1536:234+rows.length*364+190);
    canvas.width=1080;canvas.height=format==='feed'?1350:format==='story'?1920:Math.round(height*1080/524);
    const ctx=canvas.getContext('2d'), scale=1080/524;ctx.scale(scale,scale);
    const green=$('#banner-green').value, cream=$('#banner-background').value;
    ctx.fillStyle=cream;ctx.fillRect(0,0,524,height);
    const wash=ctx.createRadialGradient(262,height*.7,20,262,height*.7,height);wash.addColorStop(0,'#ffffff70');wash.addColorStop(1,'#ffffff00');ctx.fillStyle=wash;ctx.fillRect(0,0,524,height);
    ctx.save();if(compact)ctx.scale(1,.62);
    rounded(ctx,0,-32,524,246,[0,0,34,34],green);
    fitText(ctx,$('#banner-title').value,262,65,440,57,{bold:true,align:'center',color:cream});
    ctx.strokeStyle=cream;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(50,101);ctx.lineTo(225,101);ctx.moveTo(299,101);ctx.lineTo(475,101);ctx.stroke();
    ctx.fillStyle=cream;
    for (const [x,rotation] of [[256,-.6],[267,.6],[262,0]]) {
      ctx.save();ctx.translate(x,96);ctx.rotate(rotation);ctx.beginPath();ctx.ellipse(0,0,4,10,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    fitText(ctx,$('#banner-period').value||periodLabel(selected.from,selected.to),262,145,458,31,{bold:true,align:'center',color:cream});
    fitText(ctx,$('#banner-subtitle').value||nights+' '+(nights===1?'noite':'noites')+' • '+selected.guests+' '+(selected.guests===1?'hóspede':'hóspedes'),262,182,460,27,{align:'center',color:cream});
    ctx.restore();
    let y=compact?154:234;
    const compactH=(height-154-132-14*(rows.length-1))/rows.length;
    photoFrames=[];frameHeight=height;lastRows=rows;lastPhotos=photos;
    rows.forEach((row,index)=>{
      const h=compact?compactH:rows.length===3&&index===0?380:350;
      ctx.save();ctx.shadowColor='#0000001c';ctx.shadowBlur=5;ctx.shadowOffsetY=2;rounded(ctx,5,y,514,h,17,'#fffdf7');ctx.restore();
      ctx.strokeStyle='#e4e0d6';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(5,y,514,h,17);ctx.stroke();
      const x=9,w=285,photoH=h-8;
      photoFrames.push({code:row.code,x,y:y+4,w,h:photoH});
      if(photos[index])framePhotos.set(row.code,photos[index]);
      ctx.save();ctx.beginPath();ctx.roundRect(x,y+4,w,photoH,13);ctx.clip();
      const image=photos[index];
      if (image) {
        const ratio=Math.max(w/image.naturalWidth,photoH/image.naturalHeight)*row.zoom;
        const dw=image.naturalWidth*ratio,dh=image.naturalHeight*ratio;
        ctx.drawImage(image,x-(dw-w)*row.x/100,y+4-(dh-photoH)*row.y/100,dw,dh);
      } else {ctx.fillStyle='#e7e3d9';ctx.fillRect(x,y+4,w,photoH);}
      ctx.restore();
      blockText(ctx,row.name,314,y+(compact?27:66),194,compact?h*.29:112,compact?Math.min(38,h*.17):48,{bold:true,color:green});
      ctx.strokeStyle=green;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(314,y+(compact?h*.34:132));ctx.lineTo(404,y+(compact?h*.34:132));ctx.stroke();
      blockText(ctx,row.description,314,y+(compact?h*.45:172),194,compact?h*.21:83,compact?Math.min(22,h*.1):25,{bold:true,color:green});
      const priceY=y+h-(compact?Math.min(77,h*.37):146),priceH=compact?Math.min(46,h*.22):64;
      rounded(ctx,302,priceY,211,priceH,10,green);
      fitText(ctx,row.cents?money.format(row.cents/100):'Definir valor',407.5,priceY+priceH*.72,193,compact?Math.min(32,h*.15):37,{bold:true,align:'center',color:cream});
      fitText(ctx,$('#banner-price-label').value,407.5,priceY+priceH+(compact?16:26),197,compact?Math.min(15,h*.08):18.5,{bold:true,align:'center',color:green});
      y+=h+14;
    });
    const footer=y+(compact?12:35);
    const times=value=>value.endsWith(':00')?value.slice(0,2)+'h':value.replace(':','h');
    const label=$('#banner-stay-label').value||'Entrada '+short(selected.from)+' às '+times($('#banner-in-time').value)+' • Saída '+short(selected.to)+' às '+times($('#banner-out-time').value);
    fitText(ctx,label,262,footer,455,compact?18:24,{bold:true,align:'center',color:green});
    ctx.strokeStyle=green;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(37,footer+18);ctx.lineTo(487,footer+18);ctx.stroke();
    blockText(ctx,$('#banner-conditions').value,262,footer+42,456,compact?43:65,compact?14:18,{align:'center',color:green,leading:1.25});
    blockText(ctx,$('#banner-extras').value,262,height-(compact?16:35),456,28,compact?14:18,{align:'center',color:green});
    syncPhotoTargets();
    canvas.setAttribute('aria-label',$('#banner-title').value+' · '+label+' · '+rows.map(row=>row.name+' '+(row.cents?money.format(row.cents/100):'sem preço')).join(', '));
  }
  async function preview() {
    if (!ready) return;
    const seq=++drawing, selected=selection(), rows=properties.filter(row=>row.enabled);
    canDownload=false;previewReady=false;setDownloads();
    const box=$('#banner-preview-note');
    if (!iso(selected.from)||!iso(selected.to)||selected.from>=selected.to||!Number.isInteger(selected.guests)||selected.guests<1||selected.guests>16) {
      box.textContent='Escolha datas e hóspedes válidos para visualizar.';box.dataset.error='true';return;
    }
    if (!rows.length) {box.textContent='Selecione pelo menos um chalé.';box.dataset.error='true';return;}
    let failed=false;
    const photos=await Promise.all(rows.map(row=>loadImage(row.photo).catch(()=>{failed=true;return null;})));
    if (seq!==drawing) return;
    renderCanvas(rows,photos);previewReady=true;
    const missing=rows.filter(row=>!Number.isSafeInteger(row.cents)||row.cents<=0);
    const stale=rows.some(row=>!row.manual&&contextKey!==fingerprint());
    const expired=rows.some(row=>!row.manual&&row.expiresAt&&Date.parse(row.expiresAt)<=Date.now());
    box.textContent=failed?'Uma foto não carregou. Escolha outra para baixar.':missing.length?'Informe o preço de '+missing.map(row=>row.name).join(', ')+'.':
      stale?'Consulte os preços para estas datas e hóspedes.':expired?'A consulta do site expirou. Busque os preços novamente.':'Confira os valores, textos e recortes antes de baixar.';
    box.dataset.error=String(failed||missing.length>0||stale||expired);
    canDownload=!failed&&!missing.length&&!stale&&!expired;setDownloads();
  }
  function setDownloads() {
    for (const id of ['download','jpeg','video']) $('#banner-'+id).disabled=!canDownload||recording;
    $('#banner-expand').disabled=!previewReady||recording;
  }
  function saveBlob(blob,name) {
    if (!blob) throw Error('Não foi possível gerar o arquivo.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
  }
  function filename(extension) {const s=selection();return 'chalezinho-ville-'+s.from+'-a-'+s.to+'.'+extension;}
  async function downloadImage(type) {
    await preview();if (!canDownload) return;
    const name=filename(type==='image/png'?'png':'jpg');
    $('#banner-canvas').toBlob(blob=>{try{saveBlob(blob,name);}catch(error){note(error.message,true);}},type,.96);
  }
  async function video() {
    await preview();if (!canDownload) return;
    if (!window.MediaRecorder||!$('#banner-canvas').captureStream) {note('Este navegador não oferece download de vídeo. Use PNG ou JPG.',true);return;}
    const mime=['video/mp4','video/mp4;codecs=avc1.420028','video/webm;codecs=vp9','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if (!mime) {note('Formato de vídeo indisponível neste navegador.',true);return;}
    recording=true;setDownloads();
    const target=document.createElement('canvas'), original=$('#banner-canvas'), snapshot=document.createElement('canvas');
    const motionFrames=photoFrames.map(frame=>({...frame,image:framePhotos.get(frame.code),state:{...properties.find(row=>row.code===frame.code)}}));
    snapshot.width=original.width;snapshot.height=original.height;snapshot.getContext('2d').drawImage(original,0,0);
    const name=filename(mime.startsWith('video/mp4')?'mp4':'webm'), sourceHeight=original.height*524/original.width;
    target.width=720;target.height=2*Math.round(original.height*720/original.width/2);
    const ctx=target.getContext('2d'),stream=target.captureStream(20),chunks=[];
    let timer,recorder;
    try {
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});
      const done=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('O navegador não conseguiu gerar o vídeo.'));});
      const started=performance.now();
      const draw=progress=>{
        ctx.drawImage(snapshot,0,0,target.width,target.height);
        ctx.save();ctx.scale(target.width/524,target.height/sourceHeight);
        framing.drawMotionPhotos(ctx,motionFrames,progress);ctx.restore();
      };
      draw(0);recorder.start(250);
      timer=setInterval(()=>draw((performance.now()-started)/8_000),50);
      $('#banner-video-note').textContent='Gerando vídeo de 8 segundos com movimento nas fotos…';
      await new Promise(resolve=>setTimeout(resolve,8_000));clearInterval(timer);draw(1);recorder.stop();await done;
      if (!chunks.length) throw Error('O vídeo ficou vazio. Tente baixar novamente.');
      saveBlob(new Blob(chunks,{type:mime}),name);
      $('#banner-video-note').textContent=mime.startsWith('video/mp4')?'Vídeo MP4 com fotos em movimento gerado.':'Vídeo WebM com fotos em movimento gerado. O formato depende do navegador.';
    } catch (error) {note(error.message,true);} finally {
      clearInterval(timer);for (const track of stream.getTracks())track.stop();recording=false;setDownloads();
    }
  }
  async function upload(input,row) {
    const file=input.files?.[0];if(!file)return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10_000_000) {note('Escolha uma foto JPG, PNG ou WebP de até 10 MB.',true);return;}
    const url=URL.createObjectURL(file);
    try {
      const image=await loadImage(url),canvas=document.createElement('canvas');
      const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      row.photo=canvas.toDataURL('image/jpeg',.92);row.x=row.y=50;row.zoom=1;
      renderControls();persist();await preview();
    } catch {note('Não foi possível abrir a foto.',true);} finally {URL.revokeObjectURL(url);images.delete(url);}
  }
  function syncPhotoTargets() {
    const layer=$('#banner-photo-targets'), signature=photoFrames.map(frame=>frame.code).join(',');
    if(layer.dataset.layout!==signature){
      layer.innerHTML=photoFrames.map(frame=>{
        const row=properties.find(row=>row.code===frame.code);
        return '<button type="button" class="pv-banner-photo-target" data-photo-code="'+frame.code+'" aria-label="Trocar foto e ajustar enquadramento de '+escape(row.name)+'"><span>Trocar foto</span></button>';
      }).join('');layer.dataset.layout=signature;
    }
    for(const frame of photoFrames){
      const button=layer.querySelector('[data-photo-code="'+frame.code+'"]');
      Object.assign(button.style,{left:frame.x/524*100+'%',top:frame.y/frameHeight*100+'%',width:frame.w/524*100+'%',height:frame.h/frameHeight*100+'%'});
    }
  }
  function redrawPhoto() {
    if(animation)return;
    animation=requestAnimationFrame(()=>{animation=0;if(lastRows.length)renderCanvas(lastRows,lastPhotos);});
  }
  async function expandPreview(code) {
    await preview();if(!previewReady||recording)return;
    $('#banner-expanded-stage').append(artboard);
    const dialog=$('#banner-preview-dialog');if(!dialog.open)dialog.showModal();
    if(code)$('#banner-photo-targets').querySelector('[data-photo-code="'+code+'"]')?.focus();
  }
  function openGallery(code) {
    if(recording)return;
    galleryRow=properties.find(row=>row.code===code);if(!galleryRow)return;
    galleryIndex=Math.max(0,galleryRow.photos.findIndex(photo=>photo.url===galleryRow.photo||photo.aliases?.includes(galleryRow.photo)));
    $('#banner-photo-title').textContent='Fotos · '+galleryRow.name;
    $('#banner-photo-sharing').textContent=['CH2','CH3'].includes(code)?'Galeria compartilhada por Amore e Essenza. A escolha altera apenas este chalé.':'';
    $('#banner-photo-strip').innerHTML=galleryRow.photos.map((photo,index)=>'<button type="button" class="pv-banner-thumbnail" data-photo-index="'+index+'" aria-label="Foto '+(index+1)+': '+escape(photo.label)+'"><img loading="lazy" src="'+escape(photo.url)+'" alt=""></button>').join('');
    showGalleryPhoto();$('#banner-photo-dialog').showModal();
  }
  function showGalleryPhoto() {
    const photo=galleryRow.photos[galleryIndex];
    $('#banner-photo-selected').src=photo.url;$('#banner-photo-selected').alt=photo.label;
    $('#banner-photo-caption').textContent=(galleryIndex+1)+' / '+galleryRow.photos.length+' · '+photo.label;
    for(const button of $('#banner-photo-strip').querySelectorAll('[data-photo-index]'))
      button.setAttribute('aria-pressed',String(Number(button.dataset.photoIndex)===galleryIndex));
    $('#banner-photo-prev').disabled=$('#banner-photo-next').disabled=galleryRow.photos.length<2;
    $('#banner-photo-use').disabled=false;
  }
  function bindPhotoEditing() {
    const layer=$('#banner-photo-targets');
    const locate=(g,points)=>{
      const rect=g.target.getBoundingClientRect(), list=[...points.values()];
      return {x:((list.reduce((sum,p)=>sum+p.x,0)/list.length)-rect.left)*g.frame.w/rect.width,
        y:((list.reduce((sum,p)=>sum+p.y,0)/list.length)-rect.top)*g.frame.h/rect.height,
        distance:list.length>1?Math.hypot(list[1].x-list[0].x,list[1].y-list[0].y):0};
    };
    const rebase=g=>{g.base={state:{x:g.row.x,y:g.row.y,zoom:g.row.zoom},point:locate(g,g.points)};};
    layer.addEventListener('pointerdown',event=>{
      const target=event.target.closest('[data-photo-code]');if(!target||recording||(event.pointerType==='mouse'&&event.button!==0))return;
      const row=properties.find(row=>row.code===target.dataset.photoCode),frame=photoFrames.find(frame=>frame.code===row.code),image=framePhotos.get(row.code);
      if(!image||(gesture&&gesture.target!==target))return;
      event.preventDefault();target.setPointerCapture(event.pointerId);
      if(!gesture)gesture={target,row,frame,image:{w:image.naturalWidth,h:image.naturalHeight},points:new Map(),moved:false,origin:{x:event.clientX,y:event.clientY},started:Date.now()};
      gesture.points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(gesture.points.size>1)gesture.moved=true;
      target.classList.add('is-adjusting');rebase(gesture);
    });
    layer.addEventListener('pointermove',event=>{
      const g=gesture;if(!g?.points.has(event.pointerId))return;event.preventDefault();
      g.points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(Math.hypot(event.clientX-g.origin.x,event.clientY-g.origin.y)>5)g.moved=true;
      if(!g.moved)return;
      const point=locate(g,g.points),factor=g.points.size>1&&g.base.point.distance>0?point.distance/g.base.point.distance:1;
      Object.assign(g.row,framing.transform(g.image,g.frame,g.base.state,g.base.point,point,factor));redrawPhoto();
    });
    const finish=event=>{
      const g=gesture;if(!g?.points.has(event.pointerId))return;event.preventDefault();
      const tap=event.type==='pointerup'&&!g.moved&&Date.now()-g.started<700;
      g.points.delete(event.pointerId);
      if(event.type==='pointercancel')g.points.clear();
      if(g.points.size){rebase(g);return;}
      g.target.classList.remove('is-adjusting');gesture=null;persist();
      if(tap)openGallery(g.row.code);
    };
    layer.addEventListener('pointerup',finish);layer.addEventListener('pointercancel',finish);
    layer.addEventListener('click',event=>{const button=event.target.closest('[data-photo-code]');if(button&&event.detail===0)openGallery(button.dataset.photoCode);});
    layer.addEventListener('keydown',event=>{
      const button=event.target.closest('[data-photo-code]');if(!button||recording)return;
      const row=properties.find(row=>row.code===button.dataset.photoCode),frame=photoFrames.find(frame=>frame.code===row.code),image=framePhotos.get(row.code);
      if(!image)return;
      const delta={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[event.key];
      if(!delta&&!['+','=','-','Home'].includes(event.key))return;event.preventDefault();
      if(event.key==='Home'){row.x=row.y=50;row.zoom=1;}else{
        const center={x:frame.w/2,y:frame.h/2},end={x:center.x+(delta?.[0]||0),y:center.y+(delta?.[1]||0)};
        Object.assign(row,framing.transform({w:image.naturalWidth,h:image.naturalHeight},frame,row,center,end,delta?1:event.key==='-'?.9:1.1));
      }
      persist();redrawPhoto();
    });
    layer.addEventListener('wheel',event=>{
      const button=event.target.closest('[data-photo-code]');if(!button||recording||!event.ctrlKey)return;event.preventDefault();
      const row=properties.find(row=>row.code===button.dataset.photoCode),frame=photoFrames.find(frame=>frame.code===row.code),image=framePhotos.get(row.code),rect=button.getBoundingClientRect();
      if(!image)return;const point={x:(event.clientX-rect.left)*frame.w/rect.width,y:(event.clientY-rect.top)*frame.h/rect.height};
      Object.assign(row,framing.transform({w:image.naturalWidth,h:image.naturalHeight},frame,row,point,point,Math.exp(-event.deltaY*.01)));persist();redrawPhoto();
    },{passive:false});
    $('#banner-photo-close').onclick=()=>$('#banner-photo-dialog').close();
    const step=delta=>{galleryIndex=(galleryIndex+delta+galleryRow.photos.length)%galleryRow.photos.length;showGalleryPhoto();};
    $('#banner-photo-prev').onclick=()=>step(-1);$('#banner-photo-next').onclick=()=>step(1);
    $('#banner-photo-strip').onclick=event=>{const button=event.target.closest('[data-photo-index]');if(button){galleryIndex=Number(button.dataset.photoIndex);showGalleryPhoto();}};
    $('#banner-photo-selected').onerror=()=>{$('#banner-photo-use').disabled=true;$('#banner-photo-caption').textContent='Esta foto não carregou. Escolha outra.';};
    $('#banner-photo-dialog').addEventListener('keydown',event=>{if(event.target.tagName==='INPUT')return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}});
    $('#banner-photo-use').onclick=()=>{
      const photo=galleryRow.photos[galleryIndex];if(galleryRow.photo!==photo.url){galleryRow.photo=photo.url;galleryRow.x=galleryRow.y=50;galleryRow.zoom=1;}
      $('#banner-photo-dialog').close();renderControls();persist();void preview();
    };
    $('#banner-photo-upload').onchange=event=>{if(!galleryRow)return;const row=galleryRow;$('#banner-photo-dialog').close();void upload(event.target,row);};
  }
  function bind() {
    $('#pv-banner-form').addEventListener('submit',fetchPrices);
    for (const id of ['from','to','guests','rate']) $('#banner-'+id).addEventListener('change',invalidate);
    $('#banner-source').addEventListener('change',()=>{
      const manual=$('#banner-source').value==='manual';$('#banner-fetch').hidden=manual;$('#banner-rate-field').hidden=$('#banner-source').value!=='site';
      if (manual) for (const row of properties) {row.manual=true;row.expiresAt=null;row.priceNote='Valor manual para este período.';}
      invalidate();renderControls();void preview();
    });
    for (const id of textIds) $('#banner-'+id).addEventListener('input',()=>{persist();void preview();});
    $('#banner-properties').addEventListener('input',event=>{
      const card=event.target.closest('[data-code]'), field=event.target.dataset.edit;
      const row=properties.find(row=>row.code===card?.dataset.code);if (!row||!field||field==='upload') return;
      if (field==='price') {row.cents=readCents(event.target.value);row.manual=true;row.expiresAt=null;refreshNote(row);}
      else if(field==='enabled')row.enabled=event.target.checked;
      else {row[field]=event.target.value;if(field==='name')card.querySelector('[data-property-name]').textContent=row.name;}
      persist();void preview();
    });
    $('#banner-properties').addEventListener('change',event=>{if(event.target.dataset.edit==='upload')void upload(event.target,properties.find(row=>row.code===event.target.closest('[data-code]').dataset.code));});
    $('#banner-properties').addEventListener('click',event=>{
      const photoButton=event.target.closest('[data-photo-editor]');
      if(photoButton){expandPreview(photoButton.dataset.photoEditor);return;}
      const button=event.target.closest('[data-move]');if(!button)return;
      const index=properties.findIndex(row=>row.code===button.closest('[data-code]').dataset.code),target=index+Number(button.dataset.move);
      if (target<0||target>=properties.length)return;
      [properties[index],properties[target]]=[properties[target],properties[index]];renderControls();persist();void preview();
    });
    $('#banner-download').onclick=()=>void downloadImage('image/png');$('#banner-jpeg').onclick=()=>void downloadImage('image/jpeg');$('#banner-video').onclick=()=>void video();
    $('#banner-expand').onclick=()=>expandPreview();
    $('#banner-close-preview').onclick=()=>$('#banner-preview-dialog').close();
    $('#banner-preview-dialog').addEventListener('close',()=>homeStage.append(artboard));
    bindPhotoEditing();
    $('#banner-save').onclick=()=>saveBlob(new Blob([JSON.stringify(serialize(),null,2)],{type:'application/json'}),filename('json'));
    $('#banner-open').onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try {
        if(file.size>12_000_000)throw Error('O arquivo de edição é muito grande.');
        const data=JSON.parse(await file.text());apply(data);renderControls();persist();await preview();note('Edição restaurada. Confira os preços antes de baixar.');
      } catch(error){note(error.message,true);} finally {event.target.value='';}
    };
    setInterval(()=>{if(!root.hidden&&!recording)void preview();},60_000);
  }
  async function open() {
    if (ready) {await preview();return;}
    if (opening) return opening;
    opening=(async()=>{
      note('Carregando as fotos originais do site…');
      const response=await fetch('/api/promotion-banner?action=catalog',{cache:'no-store',signal:AbortSignal.timeout(35_000)});
      const catalog=await response.json();if(!response.ok)throw Error(catalog.message??'Não foi possível carregar os chalés.');
      properties=framing.sharedPhotos(catalog.properties.map(row=>({...row,enabled:true,cents:null,manual:false,
        photo:row.photos[row.defaultPhoto]?.url??row.fallback,x:50,y:50,zoom:1,priceNote:''})));
      const date=new Date();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const start=new Date(Date.parse(today)+7*86_400_000).toISOString().slice(0,10);
      $('#banner-from').value=start;$('#banner-to').value=new Date(Date.parse(start)+2*86_400_000).toISOString().slice(0,10);
      try {const saved=localStorage.getItem(key);if(saved)apply(JSON.parse(saved));}catch{note('A edição anterior não pôde ser restaurada.');}
      ready=true;bind();renderControls();await preview();note('');
    })().catch(error=>{note(error.name==='TimeoutError'?'O site demorou a responder. Reabra Promoções para tentar.':error.message,true);})
      .finally(()=>{opening=null;});
    return opening;
  }
  async function usePublication(publication,property){
    await open();if(!ready)return;
    ++requestSequence;
    const stay=publication.stay_selection||{};
    $('#banner-offer').value=publication.offer_id||'';$('#banner-property').value=property?.code||'';
    if(iso(stay.check_in)&&iso(stay.check_out)){$('#banner-from').value=stay.check_in;$('#banner-to').value=stay.check_out;}
    $('#banner-guests').value=Number(stay.guests)||2;
    $('#banner-source').value='site';$('#banner-rate').value=['refundable','non_refundable'].includes(stay.rate_code)?stay.rate_code:'lowest';
    $('#banner-rate-field').hidden=false;$('#banner-fetch').hidden=false;
    $('#banner-title').value=String(publication.title||'Chalezinho Ville').slice(0,90);
    $('#banner-extras').value=publication.offer_id?'Confira os itens incluídos e as condições da promoção.':'Decoração e experiências extras não incluídas.';
    $('#banner-conditions').value='Preço total para estas datas e hóspedes.\nSujeito à disponibilidade até a reserva.';
    $('#banner-period').value='';$('#banner-subtitle').value='';$('#banner-stay-label').value='';
    for(const row of properties){row.enabled=property?row.code===property.code:true;row.cents=null;row.manual=false;row.expiresAt=null;row.priceNote='Consulte o preço atual desta promoção.';}
    const chosen=properties.find(row=>row.enabled&&row.code===property?.code);
    const urls=(publication.media||[]).flatMap(m=>[m.url,m.poster_url]);
    if(chosen){const photo=chosen.photos.find(p=>urls.includes(p.original));if(photo){chosen.photo=photo.url;chosen.x=chosen.y=50;chosen.zoom=1;}}
    contextKey='';renderControls();persist();await preview();
    note('Publicação carregada. Confira as datas e busque os preços atuais antes de baixar.');
  }
  window.PriceVilleBanners={open,usePublication};
})();
