(()=>{
try{
if(!window.supabase?.createClient||!window.CHALEZINHO_CONFIG||!window.VilleSession)throw new Error('auth_dependencies_unavailable');
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),DEV_BASE=location.origin;
const accountHeading=document.querySelector('.auth-card > small');
if(accountHeading)accountHeading.textContent='ÁREA DO HÓSPEDE'+(C.environment==='development'?' · DESENVOLVIMENTO':'');
document.querySelectorAll('[data-online-payment-note]').forEach(e=>e.hidden=C.releaseProfile==='whatsapp');
window.ChalezinhoAuth={sb};
let anonymousId="";
try{anonymousId=localStorage.getItem("chalezinho_anon_id")||crypto.randomUUID();localStorage.setItem("chalezinho_anon_id",anonymousId)}
catch{anonymousId=crypto.randomUUID()}
function track(event_name,metadata={}){fetch(C.bookingEngine+"?action=track",{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development"},body:JSON.stringify({action:"track",event_name,anonymous_id:anonymousId,metadata})}).catch(()=>{})}
const qs=new URLSearchParams(location.search),mode=qs.get("mode")||"login",ret=qs.get("return")||"conta.html";
const safeReturn=v=>{try{const u=new URL(v,location.origin);return u.origin===location.origin?(u.pathname+u.search+u.hash).replace(/^\//,""):"conta.html"}catch{return "conta.html"}};
const returnTarget=safeReturn(ret),returnURL=new URL(returnTarget,location.origin),momentsSignup=returnURL.pathname==='/conta.html'&&(returnURL.searchParams.get('moments_invite')==='1'||/^[a-f0-9-]{72}$/i.test(returnURL.searchParams.get('convite')||'')),by=id=>document.getElementById(id),msg=(t,ok=false)=>{const e=by("auth-message");if(e){e.textContent=t;e.className="auth-message "+(ok?"ok":"error");e.scrollIntoView?.({block:"nearest",behavior:"smooth"})}};
if(momentsSignup){
 document.title='Convite | Ville Moments';
 if(accountHeading)accountHeading.textContent='VILLE MOMENTS'+(C.environment==='development'?' · DESENVOLVIMENTO':'');
 document.body.classList.add('moments-invitation');
 document.querySelector('.auth-card h1').innerHTML='Compartilhe<br><em>seus momentos.</em>';
 by('moments-invite-note').hidden=false;
 by('signup-stay-details').hidden=true;by('signup-stay-details').disabled=true;
 document.querySelector('.back-home').href='index.html?view=moments';document.querySelector('.back-home').textContent='← Ville Moments';
}
const authMessage=(error,context="")=>{const code=String(error?.code||"").toLowerCase(),raw=String(error?.message||"").toLowerCase();if(Number(error?.status)>=500)return context==="signup"?"Não foi possível criar sua conta. Se você já se cadastrou com este e-mail ou documento, toque em Entrar ou recupere sua senha. Se for seu primeiro cadastro, tente novamente em instantes ou fale com o atendimento.":"O serviço de login está temporariamente indisponível. Tente novamente em instantes.";if(error?.name==="AuthRetryableFetchError"||raw.includes("failed to fetch")||raw.includes("network")||raw.includes("load failed"))return ["recover","reset"].includes(context)?"Não foi possível conectar. Confira sua conexão e tente novamente.":context==="signup"?"Não foi possível conectar ao serviço de cadastro. Confira sua conexão e tente novamente.":context==="login"?"Não foi possível conectar ao serviço de login. Confira sua conexão e tente novamente. Sua senha ainda não foi validada.":"Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.";if(code.includes("validation_failed"))return "Confira o formato do e-mail informado.";if(code.includes("invalid_credentials")||raw.includes("invalid login credentials"))return "E-mail ou senha incorretos.";if(code.includes("email_not_confirmed")||raw.includes("email not confirmed"))return "Confirme seu e-mail antes de entrar.";if(code.includes("user_already_exists")||raw.includes("already registered"))return "Este e-mail já possui uma conta. Entre ou recupere sua senha.";if(Number(error?.status)===429||code.includes("rate_limit")||raw.includes("rate limit"))return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";if(code==="same_password"||raw.includes("new password should be different"))return "A nova senha precisa ser diferente da senha atual. Escolha outra senha e tente novamente.";if(code.includes("weak_password"))return "Não foi possível usar essa senha. Escolha outra com pelo menos 8 caracteres.";return context==="recover"?"Não foi possível enviar as instruções agora. Tente novamente.":"Não foi possível concluir esta ação agora. Tente novamente.";};
const panes={login:by("pane-login"),signup:by("pane-signup"),recover:by("pane-recover"),reset:by("pane-reset"),identify:by("pane-identify"),confirm:by("pane-confirm")};
function show(name){msg("");Object.values(panes).forEach(x=>x&&(x.hidden=true));if(panes[name])panes[name].hidden=false;document.querySelectorAll("[data-auth-mode]").forEach(b=>b.classList.toggle("active",b.dataset.authMode===name))}
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.authMode)));show(panes[mode]?mode:"login");

const pendingKey='ville-signup-confirmation';let signupBusy=false,pendingConfirmation=null,resendAt=0;
try{const saved=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(saved&&typeof saved.email==='string'&&Date.now()-saved.at<86400000&&(!saved.returnTarget||saved.returnTarget===returnTarget))pendingConfirmation=saved}catch{}
function confirmation(email,sent=true){pendingConfirmation={email,at:Date.now(),sent,returnTarget};try{sessionStorage.setItem(pendingKey,JSON.stringify(pendingConfirmation))}catch{}show('confirm');msg('');by('confirmation-email').textContent=email;by('confirmation-state').textContent=sent?'E-mail de confirmação enviado. Falta confirmar para acessar sua conta.':'O envio está temporariamente limitado. Se você já recebeu a mensagem, use o link ou o código dela. Caso contrário, aguarde para reenviar.';resendAt=Date.now()+60000;by('confirmation-resend').disabled=true;by('confirmation-feedback').textContent='Aguarde um minuto antes de reenviar.';setTimeout(()=>{if(by('confirmation-resend')){by('confirmation-resend').disabled=false;by('confirmation-feedback').textContent=''}},60000);by('confirmation-heading').tabIndex=-1;by('confirmation-heading').focus();by('pane-confirm').scrollIntoView?.({block:'start'})}
by('confirmation-change')?.addEventListener('click',()=>{pendingConfirmation=null;try{sessionStorage.removeItem(pendingKey)}catch{}show('signup');by('signup-email').focus()});
by('confirmation-resend')?.addEventListener('click',async()=>{const b=by('confirmation-resend');if(b.disabled||Date.now()<resendAt||!pendingConfirmation)return;b.disabled=true;try{const {error}=await sb.auth.resend({type:'signup',email:pendingConfirmation.email,options:{emailRedirectTo:DEV_BASE+'/auth-callback.html?next='+encodeURIComponent(returnTarget)}});if(error){by('confirmation-feedback').textContent=authMessage(error,'signup');return}confirmation(pendingConfirmation.email,true)}catch(e){by('confirmation-feedback').textContent=authMessage(e,'signup')}finally{if(Date.now()>=resendAt)b.disabled=false}});
by('confirmation-code-form')?.addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');if(b.disabled||!pendingConfirmation)return;b.disabled=true;try{const {data,error}=await sb.auth.verifyOtp({email:pendingConfirmation.email,token:by('confirmation-code').value.trim(),type:'email'});if(error){by('confirmation-feedback').textContent='O código não foi confirmado. Confira os 6 dígitos ou solicite um novo e-mail.';return}if(!data?.session){by('confirmation-feedback').textContent='Não foi possível concluir a confirmação. Use o link do e-mail.';return}try{sessionStorage.removeItem(pendingKey)}catch{}location.href=returnTarget}catch{by('confirmation-feedback').textContent='Não foi possível conectar. Tente novamente.'}finally{b.disabled=false}});

if(by("remember-session"))by("remember-session").checked=window.VilleSession.remembered();
by("pane-login")?.addEventListener("submit",async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');if(button.disabled||!validateForm(e.currentTarget))return;button.disabled=true;
 try{
  window.VilleSession.choose(by("remember-session").checked);msg("Entrando…");track("login_started",{source:"auth_page"});
  const {data,error}=await sb.auth.signInWithPassword({email:by("login-email").value.trim(),password:by("login-password").value});
  if(error)return msg(authMessage(error,"login"));
  if(!data?.session)return msg("O login não retornou uma sessão. Tente entrar novamente.");
  location.href=returnTarget;
 }catch(error){msg(error?.name==='SecurityError'||error?.name==='QuotaExceededError'?"O navegador não permitiu guardar a sessão. Verifique as configurações de armazenamento deste site.":authMessage(error,"login"))}
 finally{button.disabled=false}
});
function validateForm(form){
 const email=form.querySelector('input[type="email"]');
 if(email){email.value=email.value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)){msg("Informe um e-mail válido, como nome@exemplo.com.");email.focus();return false}}
 if(!form.reportValidity())return false;
 return true;
}
document.querySelectorAll('.auth-card form').forEach(form=>form.addEventListener('invalid',e=>{
 const input=e.target;if(input.id==='confirmation-code'){by('confirmation-feedback').textContent='Digite os 6 dígitos do código recebido por e-mail.';input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby','confirmation-feedback');return}msg(input.validity.valueMissing?"Preencha os campos obrigatórios.":input.type==='email'?"Informe um e-mail válido, como nome@exemplo.com.":input.type==='password'?"Use uma senha com pelo menos 8 caracteres.":"Confira o formato do campo indicado.");
},true));
by('confirmation-code')?.addEventListener('input',()=>{by('confirmation-code').removeAttribute('aria-invalid');by('confirmation-feedback').textContent=''});
const digits=v=>String(v||"").replace(/\D/g,"");
function validCpf(v){if(!/^[\d.\s-]+$/.test(String(v||"")))return false;const s=digits(v);if(s.length!==11||/^(\d)\1{10}$/.test(s))return false;for(let n=9;n<11;n++){const sum=[...s.slice(0,n)].reduce((a,x,i)=>a+Number(x)*(n+1-i),0),check=(sum*10)%11;if(Number(s[n])!==(check===10?0:check))return false}return true}
by("signup-document-type")?.addEventListener("change",()=>{const passport=by("signup-document-type").value==="passport";by("signup-country-label").hidden=!passport;by("signup-country").required=passport;by("signup-document-number").inputMode=passport?"text":"numeric";by("signup-document-number").placeholder=passport?"Número do passaporte":"000.000.000-00"});
by("identity-type")?.addEventListener("change",()=>{const passport=by("identity-type").value==="passport";by("identity-country-label").hidden=!passport;by("identity-country").required=passport;by("identity-number").inputMode=passport?"text":"numeric";by("identity-number").placeholder=passport?"Número do passaporte":"000.000.000-00"});
by("pane-identify")?.addEventListener("submit",async e=>{e.preventDefault();const {data:{session}}=await sb.auth.getSession();if(!session)return msg("Entre na sua conta antes de salvar o documento.");const documentType=by("identity-type").value,documentNumber=documentType==="cpf"?digits(by("identity-number").value):by("identity-number").value.trim().toUpperCase().replace(/[ -]/g,""),issuingCountry=documentType==="cpf"?"BR":by("identity-country").value.trim().toUpperCase();if(documentType==="cpf"&&!validCpf(by("identity-number").value))return msg("Confira os dígitos do CPF.");if(documentType==="passport"&&(!/^[A-Z0-9]{5,20}$/.test(documentNumber)||!/^[A-Z]{2}$/.test(issuingCountry)))return msg("Confira passaporte e país emissor.");msg("Salvando sua identificação…");try{const r=await fetch(C.bookingEngine+"?action=complete_identity",{method:"POST",headers:{"Content-Type":"application/json","X-Chalezinho-Env":"development",Authorization:"Bearer "+session.access_token},body:JSON.stringify({document_type:documentType,document_number:documentNumber,issuing_country:issuingCountry})});const d=await r.json();if(!r.ok){msg(d.error==="identity_conflict"?"Este documento já está vinculado a outra conta. Entre na conta original ou fale com o atendimento.":"Não foi possível salvar a identificação. Verifique os dados e tente novamente.");return}location.href=returnTarget}catch{msg("Não foi possível salvar agora. Tente novamente.")}});
by("pane-signup")?.addEventListener("submit",async e=>{e.preventDefault();if(signupBusy)return;const button=e.currentTarget.querySelector('[type="submit"]');if(button.disabled||!validateForm(e.currentTarget))return;const email=by("signup-email").value.trim(),password=by("signup-password").value,name=by("signup-name").value.trim(),phone=by("signup-phone").value.trim();if(!/[\p{L}]/u.test(name)||name.length<2)return msg("Informe seu nome completo.");
 if(!momentsSignup&&(!/^\+?[\d\s().-]+$/.test(phone)||digits(phone).length<10||digits(phone).length>15||/^(\d)\1+$/.test(digits(phone))))return msg("Informe um WhatsApp válido com DDD; para outro país, inclua o código internacional.");
 if(password.length<8)return msg("Use uma senha com pelo menos 8 caracteres.");
 const documentType=by("signup-document-type").value,documentNumber=(documentType==="cpf"?digits(by("signup-document-number").value):by("signup-document-number").value.trim().toUpperCase().replace(/[ -]/g,"")),issuingCountry=documentType==="passport"?by("signup-country").value.trim().toUpperCase():"BR";
 if(!momentsSignup&&documentType==="cpf"&&!validCpf(by("signup-document-number").value))return msg("Confira os dígitos do CPF.");
 if(!momentsSignup&&documentType==="passport"&&(!/^[A-Z0-9]{5,20}$/.test(documentNumber)||!/^[A-Z]{2}$/.test(issuingCountry)))return msg("Confira o número do passaporte e o código de duas letras do país emissor.");
 const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent(returnTarget);
 signupBusy=true;button.disabled=true;msg("Criando sua conta…");try{
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,...(momentsSignup?{onboarding:"moments"}:{phone,document_type:documentType,document_number:documentNumber,issuing_country:issuingCountry}),terms_version:"2026-10-22.1",terms_acceptance_source:"signup_create_account",marketing_opt_in:by("signup-promotions")?.checked===true,marketing_preference_at:new Date().toISOString()},emailRedirectTo:callback}});
 if(error){if(Number(error.status)===429||String(error.code||'').includes('rate_limit')){confirmation(email,pendingConfirmation?.email===email&&pendingConfirmation.sent===true);return}msg(authMessage(error,'signup'));return}
 track('account_signup_submitted',{source:'auth_page',email_confirmation_required:!data.session});
 if(data.session){msg('Conta criada.',true);location.href=returnTarget}else confirmation(email,true);
 }catch(error){msg(authMessage(error,'signup'))}finally{signupBusy=false;button.disabled=false}
});
by("pane-recover")?.addEventListener("submit",async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');if(button.disabled||!validateForm(e.currentTarget))return;button.disabled=true;
 try{msg("Enviando instruções…");const callback=DEV_BASE+"/auth-callback.html?next="+encodeURIComponent("auth.html?mode=reset&return="+encodeURIComponent(returnTarget));const {error}=await sb.auth.resetPasswordForEmail(by("recover-email").value.trim(),{redirectTo:callback});if(error)return msg(authMessage(error,"recover"));msg("Se o e-mail estiver cadastrado, enviaremos o link de recuperação.",true)}
 catch(error){msg(authMessage(error,"recover"))}finally{button.disabled=false}
});
by("pane-reset")?.addEventListener("submit",async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');if(button.disabled||!validateForm(e.currentTarget))return;button.disabled=true;
 try{const p=by("reset-password").value;if(p.length<8)return msg("Use pelo menos 8 caracteres.");const {error}=await sb.auth.updateUser({password:p});if(error)return msg(authMessage(error,"reset"));msg("Senha alterada.",true);setTimeout(()=>location.href=returnTarget,700)}
 catch(error){msg(authMessage(error,"reset"))}finally{button.disabled=false}
});
window.VilleAuthBoot?.ready();
if(mode==='signup'&&pendingConfirmation)confirmation(pendingConfirmation.email,pendingConfirmation.sent);
sb.auth.getSession().then(({data})=>{if(data.session&&(mode==="login"||momentsSignup&&mode==="signup")&&qs.get("reauthenticate")!=="1")location.href=returnTarget;if(!data.session&&mode==="identify")show("login")}).catch(()=>msg("Não foi possível recuperar a sessão. Entre novamente."));
}catch{window.VilleAuthBoot?.fail("initialization")}
})();
