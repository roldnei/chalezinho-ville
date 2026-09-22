document.addEventListener('DOMContentLoaded',()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});els.forEach(e=>io.observe(e));});
document.addEventListener('DOMContentLoaded',()=>{
 const box=document.querySelector('.reviews-marquee'),track=box?.querySelector('.reviews-track'),cards=track?[...track.querySelectorAll('.review-card')]:[];
 if(!box||!track||!cards.length)return;
 let i=0; const dots=box.querySelector('.review-dots');
 cards.forEach((_,n)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Ver avaliação '+(n+1));b.onclick=()=>show(n);dots.appendChild(b)});
 function show(n){i=(n+cards.length)%cards.length;track.style.transform='translate3d('+(-i*100)+'%,0,0)';[...dots.children].forEach((d,k)=>d.classList.toggle('active',k===i))}
 box.querySelector('.review-prev').onclick=()=>show(i-1); box.querySelector('.review-next').onclick=()=>show(i+1);
 let x=null;box.addEventListener('touchstart',e=>{x=e.touches[0].clientX},{passive:true});box.addEventListener('touchend',e=>{if(x===null)return;const d=e.changedTouches[0].clientX-x;if(Math.abs(d)>45)show(i+(d<0?1:-1));x=null},{passive:true});show(0);
});
