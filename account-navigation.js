(()=>{
 const buttons=[...document.querySelectorAll('[data-account-mode]')],toggle=document.querySelector('#account-menu-toggle'),menu=document.querySelector('#account-menu');
 let publicIdentity=null,accountIdentity=null;
 function identity(value,source='account'){
  if(source==='social')publicIdentity=value;else accountIdentity=value;
  const person=publicIdentity||accountIdentity||{},name=person.display_name?.trim()||accountIdentity?.display_name?.trim()||'Seu perfil',heading=document.querySelector('#account-name'),avatar=document.querySelector('#account-avatar'),handle=document.querySelector('#account-handle');
  if(!heading||!avatar||!handle)return;
  heading.textContent=name;heading.title=name;
  avatar.replaceChildren(document.createTextNode(name==='Seu perfil'?'V':name.slice(0,1).toUpperCase()));
  if(publicIdentity?.avatar_url){const image=document.createElement('img');image.alt='';image.src=publicIdentity.avatar_url;image.onerror=()=>avatar.replaceChildren(document.createTextNode(name.slice(0,1).toUpperCase()));avatar.replaceChildren(image)}
  handle.textContent=publicIdentity?.handle?'@'+publicIdentity.handle+' · '+(publicIdentity.is_public?'Perfil público':'Perfil desativado'):'';handle.hidden=!handle.textContent;
 }
 window.VillegramAccount={identity};
 function closeMenu(restoreFocus=false){if(!menu||!toggle)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menu da conta');if(restoreFocus)toggle.focus()}
 function choose(mode){
  document.querySelector('#account-private').hidden=mode!=='private';document.querySelector('#community-root').hidden=mode==='private';
  document.dispatchEvent(new CustomEvent('account-mode-change',{detail:mode}));
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.accountMode===mode)));
 }
 buttons.forEach(b=>b.onclick=()=>{
  choose(b.dataset.accountMode);closeMenu();
  const target=b.dataset.accountTarget?document.getElementById(b.dataset.accountTarget):document.querySelector(b.dataset.accountMode==='private'?'#account-private':'#community-root');
  history.replaceState(null,'',b.dataset.accountTarget?'#dados':b.dataset.accountMode==='private'?'#reservas':'#villegram');
  if(target){target.scrollIntoView?.({block:'start'});const focus=b.dataset.accountTarget?target.querySelector('input'):document.querySelector('#account-name');if(focus){if(focus.tagName==='H1')focus.tabIndex=-1;focus.focus({preventScroll:true})}}
 });
 if(toggle&&menu){
  toggle.onclick=()=>{if(!menu.hidden){closeMenu(true);return}menu.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Fechar menu da conta');menu.querySelector('button:not([hidden]),a:not([hidden])')?.focus()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();closeMenu(true)}});
  document.addEventListener('click',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!toggle.contains(e.target))closeMenu()});
  document.addEventListener('focusin',e=>{if(!menu.hidden&&!menu.contains(e.target)&&e.target!==toggle)closeMenu()});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
 }
 const q=new URLSearchParams(location.search),social=window.CHALEZINHO_CONFIG.features?.guestPublications!==false;
 buttons.filter(b=>b.dataset.accountMode==='social').forEach(b=>b.hidden=!social);
 choose(!social||['#reservas','#dados'].includes(location.hash)||q.has('charge')?'private':'social');
})();
