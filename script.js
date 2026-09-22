document.addEventListener('DOMContentLoaded',()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});els.forEach(e=>io.observe(e));});

document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-carousel]').forEach(box=>{
  const slides=Array.from(box.querySelectorAll('.chalet-slide'));
  const dots=Array.from(box.querySelectorAll('.chalet-dots button'));
  let i=0,startX=null,startY=null;
  function show(n){
   i=(n+slides.length)%slides.length;
   slides.forEach((s,k)=>s.classList.toggle('active',k===i));
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
