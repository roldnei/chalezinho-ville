import {REVIEW_FIELDS,validRegion} from './cost-receipt-regions.js';
const assets=new URL('./assets/receipt-ocr/pdf/',import.meta.url);
export function createReceiptViewer(root,{getValue,onChange,onReviewChange}){
 const doc=root.ownerDocument,win=doc.defaultView,$=s=>root.querySelector(s);let item=null,url=null,pdf=null,loading=null,renderTask=null,version=0,page=1,zoom=1,mark=null,dragLayer=10,cancelGesture=()=>{};
 root.innerHTML=`<div class="receipt-viewer-bar"><strong data-filename></strong><button type="button" data-expand>Ampliar</button><button type="button" data-toggle>Ocultar caixas</button><button type="button" data-zoom-out aria-label="Diminuir zoom">−</button><output data-zoom>100%</output><button type="button" data-zoom-in aria-label="Aumentar zoom">+</button><button type="button" data-prev aria-label="Página anterior">←</button><output data-page></output><button type="button" data-next aria-label="Próxima página">→</button></div><p data-viewer-status role="status"></p><div class="receipt-viewport" tabindex="0" aria-label="Comprovante com campos editáveis"><div class="receipt-sheet"><div data-document></div><div class="receipt-overlay"></div></div></div><p class="receipt-help">Toque no valor para editar. Segure e arraste a caixa para ler a nota.</p><div class="receipt-unplaced"></div>`;
 const sheet=$('.receipt-sheet'),overlay=$('.receipt-overlay'),viewport=$('.receipt-viewport');
 function cleanup(){cancelGesture();version++;renderTask?.cancel();renderTask=null;if(loading)void loading.destroy().catch(()=>{});loading=null;pdf=null;if(url)win.URL.revokeObjectURL(url);url=null;$('[data-document]').replaceChildren();overlay.replaceChildren();$('.receipt-unplaced').replaceChildren();root.classList.remove('receipt-expanded');$('[data-expand]').textContent='Ampliar';mark=null;sheet.classList.remove('receipt-marking');overlay.hidden=false;$('[data-toggle]').textContent='Ocultar caixas';}
 function status(text){$('[data-viewer-status]').textContent=text;}
 const shortLabels={amount:'Valor',supplier_document:'CNPJ',supplier:'Nome',document_date:'Data',document_number:'Nota'};
 function cardPosition(card,x,y,persist=false){
  const bounds=sheet.getBoundingClientRect(),size=card.getBoundingClientRect();
  const left=Math.max(0,Math.min(Math.max(0,bounds.width-size.width),x)),top=Math.max(0,Math.min(Math.max(0,bounds.height-size.height),y));
  card.style.left=left+'px';card.style.top=top+'px';
  if(persist&&item){item.cardPositions||={};item.cardPositions[card.dataset.field]={page,x:left/bounds.width,y:top/bounds.height,layer:Number(card.style.zIndex)||0};}
  return {left,top,width:size.width,height:size.height};
 }
 function makeDraggable(card,input,handle){
  let gesture=null,ignoreClick=false;
  const stop=()=>{if(!gesture)return;clearTimeout(gesture.timer);try{card.releasePointerCapture(gesture.id);}catch{}card.classList.remove('receipt-dragging');gesture=null;};
  const previousCancel=cancelGesture;cancelGesture=()=>{stop();previousCancel();};
  card.addEventListener('contextmenu',e=>e.preventDefault());
  card.addEventListener('pointerdown',e=>{
   if(!e.isPrimary||e.button!==0||e.target.closest('[data-locate]')||input.disabled)return;
   stop();e.preventDefault();card.style.zIndex=String(++dragLayer);cardPosition(card,parseFloat(card.style.left)||0,parseFloat(card.style.top)||0,true);
   gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:parseFloat(card.style.left)||0,top:parseFloat(card.style.top)||0,active:false,moved:false,focus:e.target===input};
   const current=gesture;
   current.timer=win.setTimeout(()=>{if(gesture!==current)return;current.active=true;ignoreClick=true;card.classList.add('receipt-dragging');if(card.contains(doc.activeElement))doc.activeElement.blur();status('Arraste a caixa. A marcação verde permanece no dado original.');},350);
   try{card.setPointerCapture(e.pointerId);}catch{}
  });
  card.addEventListener('pointermove',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;
   const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
   if(!gesture.active){if(Math.hypot(dx,dy)>9){clearTimeout(gesture.timer);gesture.moved=true;}return;}
   e.preventDefault();gesture.moved=true;cardPosition(card,gesture.left+dx,gesture.top+dy,true);
  });
  card.addEventListener('pointerup',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;const current=gesture;
   if(current.active){cardPosition(card,parseFloat(card.style.left)||0,parseFloat(card.style.top)||0,true);status('Caixa movida. Toque no valor para editar.');}
   else if(!current.moved){input.focus({preventScroll:true});if(input.type==='text')input.select();else if(input.type==='date'){try{input.showPicker?.();}catch{}}}
   ignoreClick=true;stop();win.setTimeout(()=>{ignoreClick=false;},500);
  });
  for(const type of ['pointercancel','lostpointercapture'])card.addEventListener(type,e=>{if(gesture?.id===e.pointerId)stop();});
  card.addEventListener('click',e=>{if(ignoreClick){e.preventDefault();e.stopPropagation();}},true);
  handle.addEventListener('keydown',e=>{const d={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(!d)return;e.preventDefault();card.style.zIndex=String(++dragLayer);cardPosition(card,(parseFloat(card.style.left)||0)+d[0],(parseFloat(card.style.top)||0)+d[1],true);});
 }
 function refresh(){
  if(!item)return;cancelGesture();cancelGesture=()=>{};overlay.replaceChildren();$('.receipt-unplaced').replaceChildren();const placed=[];
  const bounds=sheet.getBoundingClientRect(),height=bounds.height||1000,width=bounds.width||500;
  for(const [name,label] of Object.entries(REVIEW_FIELDS).sort(([a],[b])=>(item.regions?.[a]?.y??2)-(item.regions?.[b]?.y??2))){
   const region=item.regions?.[name],located=validRegion(region);if(located&&region.page!==page)continue;
   const card=doc.createElement('div');card.className='receipt-field';card.dataset.field=name;
   const title=doc.createElement('label'),caption=doc.createElement('span'),fieldLabel=name==='supplier_document'&&getValue(name).replace(/[.\s/-]/g,'').length===11?'CPF':shortLabels[name];caption.textContent=fieldLabel+':';
   const input=doc.createElement('input');input.setAttribute('aria-label',label+' na nota');input.dataset.reviewField=name;input.type=name==='document_date'?'date':'text';if(name==='amount')input.inputMode='decimal';input.maxLength=name==='supplier'?160:name==='document_number'?100:32;input.value=getValue(name);title.append(caption,input);
   if(located){
    const handle=doc.createElement('button');handle.type='button';handle.className='receipt-drag-handle';handle.textContent='⠿';handle.title='Segure e arraste';handle.setAttribute('aria-label','Mover caixa de '+shortLabels[name]+'. Segure e arraste ou use as setas.');card.append(handle,title);
    const box=doc.createElement('span');box.className='receipt-region';box.dataset.region=name;box.style.cssText=`left:${region.x*100}%;top:${region.y*100}%;width:${region.width*100}%;height:${region.height*100}%;`;
    const tag=doc.createElement('span');tag.className='receipt-region-label';tag.textContent=fieldLabel;box.append(tag);overlay.append(box,card);
    const saved=item.cardPositions?.[name];let x=region.x*width,y=(region.y+region.height)*height+5;
    if(saved?.page===page){x=saved.x*width;y=saved.y*height;card.style.zIndex=String(saved.layer||0);dragLayer=Math.max(dragLayer,saved.layer||0);}
    else{for(const other of placed)if(y<other.top+other.height+4&&y+40>other.top&&x<other.left+other.width+4&&x+card.getBoundingClientRect().width>other.left)y=other.top+other.height+4;}
    placed.push(cardPosition(card,x,y));makeDraggable(card,input,handle);
   }else{
    card.append(title);const locate=doc.createElement('button');locate.type='button';locate.dataset.locate=name;locate.textContent='Localizar';locate.setAttribute('aria-label','Marcar '+shortLabels[name]+' na nota');locate.onclick=()=>{mark=name;overlay.hidden=false;$('[data-toggle]').textContent='Ocultar caixas';sheet.classList.add('receipt-marking');status(`Toque na posição de “${shortLabels[name]}” na página ${page}.`);viewport.scrollIntoView?.({block:'nearest'});};card.append(locate);$('.receipt-unplaced').append(card);
   }
   input.addEventListener('input',()=>{const error=onChange(name,input.value);input.setCustomValidity(error||'');input.setAttribute('aria-invalid',String(!!error));if(error)status(error);else{status('Correção aplicada ao formulário.');onReviewChange();}});
   input.addEventListener('blur',()=>{if(!input.validationMessage)input.value=getValue(name);});
  }
  $('[data-page]').textContent=pdf?`${page} / ${pdf.numPages}`:'Foto';$('[data-prev]').disabled=!pdf||page<=1;$('[data-next]').disabled=!pdf||page>=pdf.numPages;
 }
 async function renderPage(){
  const token=++version;renderTask?.cancel();renderTask=null;overlay.replaceChildren();status('Abrindo página…');
  try{const source=await pdf.getPage(page);if(token!==version)return;const original=source.getViewport({scale:1}),view=source.getViewport({scale:Math.min(2,1800/original.width,3500/original.height)}),canvas=doc.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);$('[data-document]').replaceChildren(canvas);renderTask=source.render({canvasContext:canvas.getContext('2d'),viewport:view});await renderTask.promise;if(token!==version)return;renderTask=null;source.cleanup();status('Confira os dados nas caixas editáveis.');refresh();}catch(e){if(token===version&&e.name!=='RenderingCancelledException')status('Não foi possível mostrar esta página. Você pode baixar o arquivo e conferir os campos abaixo.');}
 }
 async function setItem(next){
  cleanup();item=next;root.hidden=!item;if(!item)return;page=1;zoom=1;sheet.style.width='100%';$('[data-zoom]').textContent='100%';$('[data-filename]').textContent=item.file.name;item.regions||={};const token=version;status('Abrindo comprovante…');refresh();
  try{if(item.file.type==='application/pdf'){
    const js=await import('./assets/receipt-ocr/pdf/pdf.mjs');if(token!==version)return;js.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',assets).href;
    const bytes=new Uint8Array(await next.file.arrayBuffer());if(token!==version)return;loading=js.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,wasmUrl:new URL('wasm/',assets).href,standardFontDataUrl:new URL('standard_fonts/',assets).href,cMapUrl:new URL('cmaps/',assets).href,cMapPacked:true});const loaded=await loading.promise;if(token!==version){void loaded.destroy();return;}pdf=loaded;if(pdf.numPages>6)throw Error('A visualização aceita até 6 páginas. Baixe o PDF para conferir.');await renderPage();
   }else{url=win.URL.createObjectURL(item.file);const image=doc.createElement('img');image.alt='Comprovante para conferência';image.src=url;image.onload=()=>{if(token===version){status('Confira os dados nas caixas editáveis.');refresh();}};image.onerror=()=>{if(token===version)status('Não foi possível abrir a imagem. Anexe outra foto.');};$('[data-document]').replaceChildren(image);}
  }catch(e){if(token===version)status(e.name==='PasswordException'?'PDF protegido por senha. Envie uma versão sem senha.':e.message||'Não foi possível abrir o comprovante.');}
 }
 function changeZoom(delta){zoom=Math.max(1,Math.min(3,zoom+delta));sheet.style.width=`${zoom*100}%`;$('[data-zoom]').textContent=Math.round(zoom*100)+'%';refresh();}
 $('[data-toggle]').onclick=()=>{overlay.hidden=!overlay.hidden;$('[data-toggle]').textContent=overlay.hidden?'Mostrar caixas':'Ocultar caixas';};
 $('[data-zoom-in]').onclick=()=>changeZoom(.25);$('[data-zoom-out]').onclick=()=>changeZoom(-.25);
 $('[data-expand]').onclick=()=>{const expanded=root.classList.toggle('receipt-expanded');$('[data-expand]').textContent=expanded?'Voltar':'Ampliar';win.requestAnimationFrame(refresh);};
 $('[data-prev]').onclick=()=>{if(pdf&&page>1){page--;mark=null;sheet.classList.remove('receipt-marking');void renderPage();}};$('[data-next]').onclick=()=>{if(pdf&&page<pdf.numPages){page++;mark=null;sheet.classList.remove('receipt-marking');void renderPage();}};
 sheet.addEventListener('click',e=>{if(!mark||e.target.closest('.receipt-field'))return;const bounds=sheet.getBoundingClientRect();if(!bounds.width||!bounds.height)return;const name=mark,x=Math.max(0,Math.min(.97,(e.clientX-bounds.left)/bounds.width)),y=Math.max(0,Math.min(.98,(e.clientY-bounds.top)/bounds.height));if(item.cardPositions)delete item.cardPositions[name];item.regions[name]={page,x,y,width:Math.min(.25,1-x),height:Math.min(.025,1-y),source:'manual'};mark=null;sheet.classList.remove('receipt-marking');onReviewChange();refresh();status('Posição marcada. Confira e corrija o valor da caixa.');overlay.querySelector(`[data-review-field="${name}"]`)?.focus({preventScroll:true});});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&(mark||root.classList.contains('receipt-expanded'))){e.preventDefault();e.stopPropagation();mark=null;sheet.classList.remove('receipt-marking');root.classList.remove('receipt-expanded');$('[data-expand]').textContent='Ampliar';refresh();}});
 return {setItem,refresh,setResult(result){if(item){for(const [name,region] of Object.entries(result.regions||{}))if(item.regions[name]?.source!=='manual'&&validRegion(region))item.regions[name]=region;refresh();}},clear(){cleanup();item=null;root.hidden=true;}};
}
