document.addEventListener('DOMContentLoaded',()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});els.forEach(e=>io.observe(e));});

document.addEventListener('DOMContentLoaded',async()=>{
 try{
  const endpoint=window.CHALEZINHO_CONFIG.bookingEngine+'?action=property_media';
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(8000),headers:{'X-Chalezinho-Env':'development'}});
  if(response.ok){const payload=await response.json();if(payload.ok)applyPropertyMedia(payload.properties||[])}
 }catch(error){console.warn('Galeria indisponível; exibindo fotos atuais.',error)}
 document.querySelectorAll('[data-carousel]').forEach(box=>{
  const slides=Array.from(box.querySelectorAll('.chalet-slide'));
  const dots=Array.from(box.querySelectorAll('.chalet-dots button'));
  let i=0,startX=null,startY=null;
  function show(n){
   i=(n+slides.length)%slides.length;
   slides.forEach((s,k)=>{s.classList.toggle('active',k===i);if(k===i)VilleImages.activate(s)});
   dots.forEach((d,k)=>d.classList.toggle('active',k===i));
  }
  const prev=box.querySelector('.chalet-arrow.prev'),next=box.querySelector('.chalet-arrow.next');
  if(prev) prev.onclick=e=>{e.preventDefault();e.stopPropagation();show(i-1)};
  if(next) next.onclick=e=>{e.preventDefault();e.stopPropagation();show(i+1)};
  dots.forEach((d,k)=>d.onclick=e=>{e.preventDefault();e.stopPropagation();show(k)});
  box.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;startX=e.clientX;startY=e.clientY});
  box.addEventListener('pointerup',e=>{
   if(startX===null)return;
   const dx=e.clientX-startX,dy=e.clientY-startY;
   if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))show(i+(dx<0?1:-1));
   startX=startY=null;
  });
  box.addEventListener('pointercancel',()=>{startX=startY=null});
  show(0);
 });
});

document.addEventListener('DOMContentLoaded',()=>{
 const phone='5593991592266';
 const today=new Date(); today.setMinutes(today.getMinutes()-today.getTimezoneOffset());
 const min=today.toISOString().slice(0,10);
 document.querySelectorAll('.availability-box').forEach(box=>{
  const toggle=box.querySelector('.availability-toggle'),form=box.querySelector('.availability-form');
  const din=box.querySelector('.date-in'),dout=box.querySelector('.date-out'),send=box.querySelector('.whatsapp-check'),err=box.querySelector('.date-error');
  din.min=min; dout.min=min;
  if(toggle) toggle.addEventListener('click',()=>box.classList.toggle('open'));
  din.addEventListener('change',()=>{dout.min=din.value||min;if(dout.value&&dout.value<=din.value)dout.value=''});
  send.addEventListener('click',()=>{
   if(!din.value||!dout.value){err.textContent='Selecione as datas de check-in e check-out.';return}
   if(dout.value<=din.value){err.textContent='O check-out deve ser depois do check-in.';return}
   err.textContent='';
   const fmt=v=>{const [y,m,d]=v.split('-');return d+'/'+m+'/'+y};
   const msg='Olá! Gostaria de verificar a disponibilidade do '+box.dataset.chalet+' para o período de '+fmt(din.value)+' a '+fmt(dout.value)+'.';
   window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank','noopener');
  });
 });
});

function applyPropertyMedia(properties){
 const list=new Map(properties.map(p=>[p.code,p]));
 const cards=document.querySelector('.collection .cards');
 if(cards)properties.filter(p=>(p.cover_image||(Array.isArray(p.gallery)&&p.gallery.length))&&!cards.querySelector(`[data-property-code="${CSS.escape(p.code)}"]`)).forEach(p=>{
  const article=document.createElement('article');article.dataset.propertyCode=p.code;
  const photo=document.createElement('div');photo.className='chalet-photo chalet-carousel';photo.dataset.carousel='';
  const badge=document.createElement('span');badge.className='type-badge';badge.textContent=p.property_type==='chalet'?'Chalé':p.property_type==='apartment'?'Apartamento':'Hospedagem';photo.append(badge);
  for(const [klass,label] of [['prev','Foto anterior'],['next','Próxima foto']]){const b=document.createElement('button');b.className='chalet-arrow '+klass;b.type='button';b.textContent=klass==='prev'?'‹':'›';b.setAttribute('aria-label',label);photo.append(b)}
  const dots=document.createElement('div');dots.className='chalet-dots';photo.append(dots);article.append(photo);
  const heading=document.createElement('div');heading.className='chalet-heading';const title=document.createElement('h3'),link=document.createElement('a');link.className='chalet-detail-link';link.href='imovel.html?codigo='+encodeURIComponent(p.code);link.textContent=p.name;title.append(link);heading.append(title);article.append(heading);const actions=document.createElement('div');actions.className='chalet-booking-actions';const reserve=document.createElement('a');reserve.className='booking-cta';reserve.href='reservar.html?chalet='+encodeURIComponent(p.code);reserve.textContent='Ver disponibilidade e preços →';const learn=document.createElement('a');learn.className='chalet-learn';learn.href=link.href;learn.textContent='Conhecer o imóvel';actions.append(reserve,learn);article.append(actions);
  const description=document.createElement('div'),summary=document.createElement('p');summary.textContent=p.summary||p.tagline||'Conheça este imóvel e consulte as datas disponíveis.';description.append(summary);const details=document.createElement('a');details.href=link.href;details.textContent='Conhecer o imóvel →';description.append(details);article.append(description);cards.append(article)
 });
 const usable=p=>{const gallery=(Array.isArray(p.gallery)?p.gallery:[]).map(x=>typeof x==='string'?{url:x,alt:p.name}:x).filter(x=>x&&isPropertyImage(x.url));const cover=p.cover_image&&isPropertyImage(p.cover_image)?p.cover_image:null;if(cover&&!gallery.some(x=>x.url===cover))gallery.unshift({url:cover,alt:p.name});return cover?[...gallery.filter(x=>x.url===cover),...gallery.filter(x=>x.url!==cover)]:gallery};
 document.querySelectorAll('[data-property-code]').forEach(container=>{
  const p=list.get(container.dataset.propertyCode);if(!p)return;const images=usable(p);if(!images.length)return;
  const carousel=container.querySelector('[data-carousel]');
  if(carousel){carousel.querySelectorAll('.chalet-slide').forEach(el=>el.remove());const dots=carousel.querySelector('.chalet-dots');dots.replaceChildren();images.forEach((item,i)=>{const img=document.createElement('img');img.className='chalet-slide'+(i===0?' active':'');VilleImages.set(img,item.url,{defer:i>0,sizes:'(max-width: 800px) 100vw, 33vw'});img.alt=item.alt||p.name;img.loading='lazy';carousel.insertBefore(img,carousel.querySelector('.chalet-arrow'));const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','Foto '+(i+1));dots.append(dot)});}
  const hero=container.querySelector('.detail-hero');if(hero){VilleImages.background(hero,images[0].url);const closing=container.querySelector('.detail-closing');if(closing)VilleImages.background(closing,images[0].url,true);const gallery=container.querySelector('.detail-gallery');if(gallery){gallery.replaceChildren();images.forEach(item=>{const figure=document.createElement('figure'),img=document.createElement('img');VilleImages.set(img,item.url);img.alt=item.alt||p.name;img.loading='lazy';figure.append(img);gallery.append(figure)})}}
 });
}
function isPropertyImage(url){return typeof url==='string' && (/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)(\?v=[0-9]+)?$/.test(url)||url.startsWith(window.CHALEZINHO_CONFIG.supabaseUrl+'/storage/v1/object/public/property-media/'))}
