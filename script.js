document.addEventListener('DOMContentLoaded',()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});els.forEach(e=>io.observe(e));});

document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-carousel]').forEach(box=>{
  const slides=[...box.querySelectorAll('.chalet-slide')],dots=[...box.querySelectorAll('.chalet-dots button')]; let i=0,x=null;
  const show=n=>{i=(n+slides.length)%slides.length;slides.forEach((s,k)=>s.classList.toggle('active',k===i));dots.forEach((d,k)=>d.classList.toggle('active',k===i))};
  box.querySelector('.prev').addEventListener('click',()=>show(i-1)); box.querySelector('.next').addEventListener('click',()=>show(i+1));
  dots.forEach((d,k)=>d.addEventListener('click',()=>show(k)));
  box.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});
  box.addEventListener('touchend',e=>{if(x===null)return;const d=e.changedTouches[0].clientX-x;if(Math.abs(d)>45)show(i+(d<0?1:-1));x=null},{passive:true});
 });
});
