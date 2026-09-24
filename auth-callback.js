(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),box=document.getElementById("callback-status");
const qs=new URLSearchParams(location.search),nextRaw=qs.get("next")||"conta.html";
const safeNext=v=>{try{const u=new URL(v,location.origin);return u.origin===location.origin?(u.pathname+u.search+u.hash).replace(/^\//,""):"conta.html"}catch{return "conta.html"}};
const next=safeNext(nextRaw);
async function finish(){
 const err=qs.get("error_description")||new URLSearchParams(location.hash.replace(/^#/,"")).get("error_description");if(err){box.textContent="Não foi possível confirmar o acesso: "+decodeURIComponent(err);return}
 const code=qs.get("code");if(code){const {error}=await sb.auth.exchangeCodeForSession(code);if(error){box.textContent="O link foi reconhecido, mas não foi possível concluir a sessão. Volte ao login.";return}}
 const {data:{session}}=await sb.auth.getSession();if(session){box.textContent="Tudo certo. Abrindo sua conta…";setTimeout(()=>location.href=next,300);return}
 box.innerHTML='E-mail confirmado. <a href="auth.html?mode=login&return='+encodeURIComponent(next)+'">Entrar na sua conta →</a>';
}
finish();
})();