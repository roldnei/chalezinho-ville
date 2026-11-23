(function(root){
 'use strict';
 const terms=Object.freeze({startsAt:'2026-11-23T00:00:00-03:00',endsAt:'2026-11-28T00:00:00-03:00',minNights:2,gift:'Experiência romântica exclusiva'});
 const active=(now=Date.now())=>now>=Date.parse(terms.startsAt)&&now<Date.parse(terms.endsAt);
 function remaining(now=Date.now()){
  let seconds=Math.max(0,Math.ceil((Date.parse(terms.endsAt)-now)/1000));
  const days=Math.floor(seconds/86400);seconds%=86400;
  const hours=Math.floor(seconds/3600);seconds%=3600;
  return {days,hours,minutes:Math.floor(seconds/60),seconds:seconds%60};
 }
 const eligible=(nights,now=Date.now())=>Number.isInteger(nights)&&nights>=terms.minNights&&active(now);
 const message=(nights,now=Date.now())=>eligible(nights,now)?'Black Friday: experiência romântica exclusiva de presente para reservas de 2 noites ou mais confirmadas até 27/11/2026, às 23h59 (Brasília).':'';
 root.VilleBlackFriday=Object.freeze({terms,active,remaining,eligible,message});
 if(!root.document)return;
 let timer;
 function render(){
  const now=Date.now(),live=active(now),digits=remaining(now);
  root.document.body?.classList.toggle('bf-ended',!live);
  root.document.querySelectorAll('[data-bf-countdown]').forEach(banner=>{
   banner.dataset.bfState=live?'active':'ended';
   banner.querySelectorAll('[data-bf-active]').forEach(node=>node.hidden=!live);
   banner.querySelectorAll('[data-bf-ended]').forEach(node=>node.hidden=live);
   banner.querySelectorAll('[data-bf-digit]').forEach(node=>node.textContent=String(digits[node.dataset.bfDigit]).padStart(2,'0'));
  });
  if(!live&&timer){clearInterval(timer);timer=null;}
 }
 function start(){render();if(active()&&!timer)timer=setInterval(render,1000);}
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 root.addEventListener('pageshow',start);
 root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden)start();});
})(typeof window==='undefined'?globalThis:window);
