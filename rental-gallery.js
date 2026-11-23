// Shared, touch-native carousels for the catalog and the enlarged property gallery.
(()=>{
 'use strict';
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const photos=p=>[...new Set([p.cover_image,...(Array.isArray(p.gallery)?p.gallery:[]).map(x=>typeof x==='string'?x:x?.url)])].filter(x=>typeof x==='string'&&x);
 const smallImage=src=>/^assets\/rental-[a-z-]+-\d{2}\.webp$/.test(src)?' srcset="'+escape(src.replace('.webp','-640.webp'))+' 640w, '+escape(src)+' 1440w" sizes="(max-width:600px) calc(100vw - 40px), 550px"':'';
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function move(track,index){track.scrollTo?.({left:index*track.clientWidth,behavior:reduce()?'auto':'smooth'})}
 let dialog,track,current=0,images=[],property=null,opener=null,timer;
 function count(){dialog.querySelector('[data-photo-count]').textContent=(current+1)+' / '+images.length;dialog.querySelectorAll('[data-viewer-step]').forEach(b=>b.disabled=images.length<2)}
 function go(index){current=(index+images.length)%images.length;move(track,current);count()}
 function ensureDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='photo-dialog';dialog.className='rental-lightbox';dialog.setAttribute('aria-label','Galeria de fotos');
  dialog.innerHTML='<div class="lightbox-heading"><strong data-photo-title></strong><button type="button" data-close-photo aria-label="Fechar galeria">Fechar</button></div><div class="lightbox-track" tabindex="0" aria-label="Fotos do imóvel; deslize para navegar"></div><div class="lightbox-controls"><button type="button" data-viewer-step="-1" aria-label="Foto anterior">Anterior</button><p data-photo-count role="status" aria-live="polite"></p><button type="button" data-viewer-step="1" aria-label="Próxima foto">Próxima</button></div>';
  document.body.append(dialog);track=dialog.querySelector('.lightbox-track');
  dialog.querySelector('[data-close-photo]').onclick=()=>dialog.close();
  dialog.querySelectorAll('[data-viewer-step]').forEach(b=>b.onclick=()=>go(current+Number(b.dataset.viewerStep)));
  dialog.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();go(current+(event.key==='ArrowRight'?1:-1))}});
  track.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(track.clientWidth){current=Math.max(0,Math.min(images.length-1,Math.round(track.scrollLeft/track.clientWidth)));count()}},100)},{passive:true});
  dialog.addEventListener('close',()=>{document.body.classList.remove('rental-gallery-open');if(opener?.isConnected)opener.focus()});
  window.addEventListener('resize',()=>{if(dialog.open)move(track,current)});
 }
 function open(p,index=0,trigger=document.activeElement){
  const next=photos(p);if(!next.length)return;
  ensureDialog();images=next;property=p;opener=trigger;current=Math.max(0,Math.min(index,images.length-1));
  dialog.querySelector('[data-photo-title]').textContent=p.name;
  track.innerHTML=images.map((src,i)=>'<figure class="lightbox-slide"><img src="'+escape(src)+'" alt="'+escape(p.name)+' — foto '+(i+1)+'" draggable="false" '+(Math.abs(i-current)>1?'loading="lazy"':'loading="eager"')+'></figure>').join('');
  document.body.classList.add('rental-gallery-open');dialog.showModal();count();
  // The dialog gets its viewport only after showModal. Position the requested
  // photo without animation; subsequent navigation uses native snap scrolling.
  track.scrollTo?.({left:current*track.clientWidth,behavior:'auto'});
 }
 function cardMarkup(p){
  const images=photos(p);
  return '<div class="rental-card-media" data-carousel-property="'+Number(p.id)+'"><div class="rental-card-image rental-carousel" role="group" aria-roledescription="carrossel" aria-label="Fotos de '+escape(p.name)+'" tabindex="0">'+images.map((src,i)=>'<button class="rental-carousel-slide" type="button" data-carousel-photo="'+i+'" aria-label="Ampliar foto '+(i+1)+' de '+escape(p.name)+'"><img src="'+escape(src)+'"'+smallImage(src)+' alt="'+escape(p.name)+' — foto '+(i+1)+'" width="1440" height="1080" loading="lazy" draggable="false"></button>').join('')+'</div><span class="bf-stamp bf-stamp-full"><span>BLACK</span><strong>FRIDAY</strong><b>-15%</b></span><span class="rental-photo-label">'+escape(p.listing.location_label)+'</span>'+(images.length>1?'<div class="rental-carousel-controls"><button type="button" data-card-step="-1" aria-label="Foto anterior de '+escape(p.name)+'">Anterior</button><span data-card-count aria-live="polite">1 / '+images.length+'</span><button type="button" data-card-step="1" aria-label="Próxima foto de '+escape(p.name)+'">Próxima</button></div>':'')+'</div>';
 }
 function mountCards(host,properties){
  host.querySelectorAll('[data-carousel-property]').forEach(card=>{
   const p=properties.find(x=>Number(x.id)===Number(card.dataset.carouselProperty));if(!p)return;
   const images=photos(p),track=card.querySelector('.rental-carousel');let current=0,timer;
   const update=()=>{const count=card.querySelector('[data-card-count]');if(count)count.textContent=(current+1)+' / '+images.length};
   const go=index=>{current=(index+images.length)%images.length;move(track,current);update()};
   card.querySelectorAll('[data-card-step]').forEach(b=>b.onclick=()=>go(current+Number(b.dataset.cardStep)));
   card.querySelectorAll('[data-carousel-photo]').forEach(b=>b.onclick=()=>open(p,Number(b.dataset.carouselPhoto),b));
   track.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(track.clientWidth){current=Math.max(0,Math.min(images.length-1,Math.round(track.scrollLeft/track.clientWidth)));update()}},100)},{passive:true});
   track.addEventListener('keydown',e=>{if(e.target===track&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();go(current+(e.key==='ArrowRight'?1:-1))}});
  });
 }
 window.VilleRentalGallery=Object.freeze({photos,cardMarkup,mountCards,open});
})();
