// Register before external dependencies: never allow a native form reload.
(()=>{
 let ready=false;
 const message=document.getElementById('auth-message');
 const buttons=()=>document.querySelectorAll('.auth-card button[type="submit"]');
 const show=text=>{message.textContent=text;message.className='auth-message error'};
 const fail=code=>{
  if(ready)return;
  clearTimeout(timer);
  buttons().forEach(button=>button.disabled=true);
  show('Não foi possível iniciar o acesso. Seus dados não foram enviados. Recarregue a página para tentar novamente.');
  console.error('Ville auth initialization failed:',code==='dependency'?'dependency':'initialization');
 };
 document.querySelectorAll('.auth-card form').forEach(form=>form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!ready){event.stopImmediatePropagation();show('Aguarde o carregamento do acesso. Seus dados não foram enviados.')}
 },true));
 const timer=setTimeout(()=>fail('dependency'),15000);
 window.VilleAuthBoot={fail,ready(){ready=true;clearTimeout(timer);buttons().forEach(button=>button.disabled=false);message.textContent=''}};
})();
