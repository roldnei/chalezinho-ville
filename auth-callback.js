(()=>{
 const box=document.getElementById('callback-status'),button=document.getElementById('callback-confirm');
 const qs=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const safeNext=v=>{try{const u=new URL(v||'conta.html',location.origin);return u.origin===location.origin?(u.pathname+u.search+u.hash).replace(/^\//,''):'conta.html'}catch{return 'conta.html'}};
 const next=safeNext(qs.get('next')),cleaning=next==='faxinas.html'||next.startsWith('faxinas/'),login=document.getElementById('callback-login')||box.appendChild(document.createElement('a'));login.href=cleaning?next:'auth.html?mode=login&return='+encodeURIComponent(next);
 try{
  if(!window.supabase?.createClient||!window.CHALEZINHO_CONFIG)throw Error('dependency');
  const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,{...C.authOptions,auth:{...C.authOptions?.auth,detectSessionInUrl:false}});
  const failure=()=>{box.textContent='Não foi possível confirmar este link. Ele pode ter expirado ou já ter sido usado. Se já confirmou, entre na sua conta; caso contrário, solicite um novo e-mail.';login.hidden=false;};
  async function finish(){
   if(qs.get('error_description')||hash.get('error_description')){failure();return}
   const token_hash=qs.get('token_hash'),type=qs.get('type');
   if(token_hash){
    if(!['email','signup','recovery','invite','email_change'].includes(type)){failure();return}
    box.textContent='Toque abaixo para confirmar seu e-mail e abrir sua conta.';button.hidden=false;
    button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{const {data,error}=await sb.auth.verifyOtp({token_hash,type});if(error||!data?.session){failure();return}button.hidden=true;history.replaceState(null,'',location.pathname);box.textContent='E-mail confirmado. Abrindo sua conta…';location.href=next}catch{box.textContent='Não foi possível conectar. Tente confirmar novamente.'}finally{button.disabled=false}};
    return;
   }
   if(qs.get('code')){const {error}=await sb.auth.exchangeCodeForSession(qs.get('code'));if(error){failure();return}}
   else if(hash.get('access_token')&&hash.get('refresh_token')){const {error}=await sb.auth.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});if(error){failure();return}history.replaceState(null,'',location.pathname+location.search)}
   const {data:{session}}=await sb.auth.getSession();
   if(session){box.textContent='Tudo certo. Abrindo sua conta…';location.href=next;return}
   box.textContent='Abra o link recebido por e-mail para confirmar seu acesso. Se já confirmou, entre na sua conta.';login.hidden=false;
  }
  finish().catch(failure);
 }catch{box.textContent='Não foi possível carregar a confirmação. Recarregue esta página ou abra o link no navegador.';login.hidden=false;}
})();
