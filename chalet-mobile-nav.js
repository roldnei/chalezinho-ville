// Keep the same mobile shortcuts available after opening a chalet page.
(()=>{
 function mount(){
  const page=document.querySelector('main[data-property-code],#property-detail');
  if(!page||document.querySelector('.villegram-mobile-nav'))return;
  const query=new URLSearchParams(location.search),candidate=page.dataset.propertyCode||query.get('codigo')||query.get('chalet')||'',code=/^CH\d{1,6}$/.test(candidate)?candidate:null;
  const nav=document.createElement('nav');nav.className='villegram-mobile-nav chalet-mobile-nav';nav.setAttribute('aria-label','Navegação principal no celular');
  const links=[['feed','Ville Moments','index.html?view=moments'],['chalets','Chalés','index.html?view=site#chales'],['dates','Escolher datas','reservar.html'+(code?'?chalet='+encodeURIComponent(code):'')],['account','Minha conta','conta.html']];
  for(const [icon,label,href] of links){const a=document.createElement('a');a.href=href;a.innerHTML=window.Villegram?.navLabel?window.Villegram.navLabel(icon,label):label;if(icon==='chalets')a.setAttribute('aria-current','page');nav.append(a)}
  document.body.append(nav);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 document.addEventListener('ville:property-ready',mount);
})();
