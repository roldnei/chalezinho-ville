(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),DEV_BASE="https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app";
window.ChalezinhoAuth={sb};
let anonymousId="";
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
function track(event_name,metadata={}){fetch(C.bookingEngine+"?action=track",{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development"},body:JSON.stringify({action:"track",event_name,anonymous_id:anonymousId,metadata})}).catch(()=>{})}
const qs=new URLSearchParams(location.search),mode=qs.get("mode")||"login",ret=qs.get("return")||"conta.html";
const safeReturn=v=>{try{const u=new URL(v,location.origin);return u.origin===location.origin?(u.pathname+u.search+u.hash).replace(/^\//,""):"conta.html"}catch{return "conta.html"}};
const returnTarget=safeReturn(ret),by=id=>document.getElementById(id),msg=(t,ok=false)=>{const e=by("auth-message");if(e){e.textContent=t;e.className="auth-message "+(ok?"ok":"error")}};
const authMessage=(error,context="")=>{const code=String(error?.code||"").toLowerCase(),raw=String(error?.message||"").toLowerCase();if(code.includes("invalid_credentials")||raw.includes("invalid login credentials"))return "E-mail ou senha incorretos.";if(code.includes("email_not_confirmed")||raw.includes("email not confirmed"))return "Confirme seu e-mail antes de entrar.";if(code.includes("user_already_exists")||raw.includes("already registered"))return "Este e-mail já possui uma conta. Entre ou recupere sua senha.";if(code.includes("over_email_send_rate_limit")||raw.includes("rate limit"))return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";if(code.includes("weak_password"))return "Não foi possível usar essa senha. Escolha outra com pelo menos 8 caracteres.";return context==="recover"?"Não foi possível enviar as instruções agora. Tente novamente.":"Não foi possível concluir esta ação agora. Tente novamente.";};
const panes={login:by("pane-login"),signup:by("pane-signup"),recover:by("pane-recover"),reset:by("pane-reset")};
function show(name){Object.values(panes).forEach(x=>x&&(x.hidden=true));if(panes[name])panes[name].hidden=false;document.querySelectorAll("[data-auth-mode]").forEach(b=>b.classList.toggle("active",b.dataset.authMode===name))}
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.authMode)));show(mode);

by("pane-login")?.addEventListener("submit",async e=>{e.preventDefault();msg("Entrando…");track("login_started",{source:"auth_page"});const {error}=await sb.auth.signInWithPassword({email:by("login-email").value.trim(),password:by("login-password").value});if(error)return msg(authMessage(error,"login"));location.href=returnTarget});
by("pane-signup")?.addEventListener("submit",async e=>{e.preventDefault();msg("Criando sua conta…");const email=by("signup-email").value.trim(),password=by("signup-password").value,name=by("signup-name").value.trim(),phone=by("signup-phone").value.trim();if(password.length<8)return msg("Use uma senha com pelo menos 8 caracteres.");
 const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent(returnTarget);
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,phone},emailRedirectTo:callback}});
 if(error)return msg(authMessage(error,"signup"));track("account_created",{source:"auth_page",email_confirmation_required:!data.session});msg(data.session?"Conta criada.":"Conta criada. Enviamos um link de confirmação para seu e-mail. Ao confirmar, você volta para o Chalezinho Ville.",true);
});
by("pane-recover")?.addEventListener("submit",async e=>{e.preventDefault();msg("Enviando instruções…");const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent("auth.html?mode=reset&return="+encodeURIComponent(returnTarget));const {error}=await sb.auth.resetPasswordForEmail(by("recover-email").value.trim(),{redirectTo:callback});if(error)return msg(authMessage(error,"recover"));msg("Se o e-mail estiver cadastrado, enviaremos o link de recuperação.",true)});
by("pane-reset")?.addEventListener("submit",async e=>{e.preventDefault();const p=by("reset-password").value;if(p.length<8)return msg("Use pelo menos 8 caracteres.");const {error}=await sb.auth.updateUser({password:p});if(error)return msg(authMessage(error,"reset"));msg("Senha alterada.",true);setTimeout(()=>location.href=returnTarget,700)});
sb.auth.getSession().then(({data})=>{if(data.session&&mode==="login")location.href=returnTarget});
})();