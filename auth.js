(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),DEV_BASE="https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app";
window.ChalezinhoAuth={sb};
const qs=new URLSearchParams(location.search),mode=qs.get("mode")||"login",ret=qs.get("return")||"conta.html";
const safeReturn=v=>{try{const u=new URL(v,location.origin);return u.origin===location.origin?(u.pathname+u.search+u.hash).replace(/^\//,""):"conta.html"}catch{return "conta.html"}};
const returnTarget=safeReturn(ret),by=id=>document.getElementById(id),msg=(t,ok=false)=>{const e=by("auth-message");if(e){e.textContent=t;e.className="auth-message "+(ok?"ok":"error")}};
const panes={login:by("pane-login"),signup:by("pane-signup"),recover:by("pane-recover"),reset:by("pane-reset")};
function show(name){Object.values(panes).forEach(x=>x&&(x.hidden=true));if(panes[name])panes[name].hidden=false;document.querySelectorAll("[data-auth-mode]").forEach(b=>b.classList.toggle("active",b.dataset.authMode===name))}
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.authMode)));show(mode);

by("pane-login")?.addEventListener("submit",async e=>{e.preventDefault();msg("Entrando…");const {error}=await sb.auth.signInWithPassword({email:by("login-email").value.trim(),password:by("login-password").value});if(error)return msg(error.message);location.href=returnTarget});
by("pane-signup")?.addEventListener("submit",async e=>{e.preventDefault();msg("Criando sua conta…");const email=by("signup-email").value.trim(),password=by("signup-password").value,name=by("signup-name").value.trim(),phone=by("signup-phone").value.trim();if(password.length<8)return msg("Use uma senha com pelo menos 8 caracteres.");
 const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent(returnTarget);
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,phone},emailRedirectTo:callback}});
 if(error)return msg(error.message);msg(data.session?"Conta criada.":"Conta criada. Enviamos um link de confirmação para seu e-mail. Ao confirmar, você volta para o Chalezinho Ville.",true);
});
by("pane-recover")?.addEventListener("submit",async e=>{e.preventDefault();msg("Enviando instruções…");const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent("auth.html?mode=reset&return="+encodeURIComponent(returnTarget));const {error}=await sb.auth.resetPasswordForEmail(by("recover-email").value.trim(),{redirectTo:callback});if(error)return msg(error.message);msg("Se o e-mail estiver cadastrado, enviaremos o link de recuperação.",true)});
by("pane-reset")?.addEventListener("submit",async e=>{e.preventDefault();const p=by("reset-password").value;if(p.length<8)return msg("Use pelo menos 8 caracteres.");const {error}=await sb.auth.updateUser({password:p});if(error)return msg(error.message);msg("Senha alterada.",true);setTimeout(()=>location.href=returnTarget,700)});
sb.auth.getSession().then(({data})=>{if(data.session&&mode==="login")location.href=returnTarget});
})();