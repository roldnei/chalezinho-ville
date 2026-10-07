(()=>{
 const host=document.querySelector('#villegram-review-notice'),C=window.CHALEZINHO_CONFIG;
 if(!host||!C||!window.supabase)return;
 const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions);
 host.innerHTML='<a href="villegram-admin.html?review=pending"><span class="vg-review-bell" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><b></b></span><span><strong></strong><small>Revisar momentos dos hóspedes</small></span><span aria-hidden="true">›</span></a><p class="vg-review-live" role="status" aria-live="polite"></p>';
 let timer,inFlight=false,refreshAgain=false,epoch=0,lastUser=null,lastCount=null,lastCheck=0,allowed=false;
 const live=host.querySelector('[role=status]');
 function clear(){epoch++;allowed=false;lastCount=null;host.hidden=true;live.textContent='';clearTimeout(timer)}
 async function refresh(force=false){
  if(inFlight){if(force)refreshAgain=true;return}if(document.hidden||!force&&Date.now()-lastCheck<5000)return;
  clearTimeout(timer);inFlight=true;const version=epoch;lastCheck=Date.now();
  try{
   const {data:{session}}=await sb.auth.getSession();if(version!==epoch)return;
   if(!session){clear();lastUser=null;return}
   if(session.user.id!==lastUser){host.hidden=true;lastCount=null;allowed=false;lastUser=session.user.id}
   const response=await fetch(C.supabaseUrl+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({operation:'community_review_status'}),signal:AbortSignal.timeout(15000)}),data=await response.json();
   if(version!==epoch)return;
   if(!response.ok||!data.ok){if(response.status===401||response.status===403)clear();throw Error('review_unavailable')}
   allowed=data.can_moderate===true;if(!allowed){clear();return}
   const count=Number(data.pending_count);if(!Number.isSafeInteger(count)||count<0)throw Error('invalid_count');
   const label=count===1?'1 momento aguardando aprovação':count+' momentos aguardando aprovação';
   host.hidden=count===0;host.dataset.pending=String(count);host.querySelector('b').textContent=String(count);host.querySelector('strong').textContent=label;host.querySelector('small').textContent='Revisar momentos dos hóspedes';
   if(count!==lastCount)live.textContent=count?label:'';lastCount=count;
  }catch{if(version===epoch&&allowed&&!host.hidden)host.querySelector('small').textContent='Atualização indisponível · abrir fila'}
  finally{inFlight=false;if(refreshAgain){refreshAgain=false;timer=setTimeout(()=>refresh(true),0)}else if(allowed)timer=setTimeout(()=>refresh(true),30000)}
 }
 host.querySelector('a').addEventListener('click',e=>{const request=new CustomEvent('villegram-review-open',{cancelable:true});if(!document.dispatchEvent(request))e.preventDefault()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh(true)});
 window.addEventListener('focus',()=>refresh());document.addEventListener('villegram-review-changed',()=>refresh(true));
 sb.auth.onAuthStateChange?.((event,session)=>{if(event==='SIGNED_OUT'||!session){lastUser=null;clear()}else if(session.user.id!==lastUser){clear();setTimeout(()=>refresh(true),0)}});
 refresh(true);
})();
