// A public Moments invitation never grants staff, reservation or payment access.
(()=>{
 function setupAdmin(){
  const panel=document.getElementById('vg-invite-tools');if(!panel)return;
  const target=new URL('conta.html',location.href);target.searchParams.set('moments_invite','1');
  const invitation=new URL('auth.html',location.href);invitation.searchParams.set('mode','signup');invitation.searchParams.set('return',target.pathname+target.search);
  const text='Você está convidado para o Ville Moments do Chalezinho Ville! Compartilhe suas lembranças e descubra novos momentos. Abra o link e crie sua conta ou entre com seu e-mail.\n'+invitation.href;
  const whatsapp=new URL('https://wa.me/');whatsapp.searchParams.set('text',text);
  const field=document.getElementById('vg-invite-link');field.value=invitation.href;
  document.getElementById('vg-invite-whatsapp').href=whatsapp.href;
  document.getElementById('vg-invite-copy').onclick=async()=>{
   const feedback=document.getElementById('vg-invite-feedback');
   try{await navigator.clipboard.writeText(text);feedback.textContent='Convite copiado. Cole na conversa de sua escolha.'}
   catch{field.focus();field.select();feedback.textContent='Selecione e copie o link acima para enviar.'}
  };
  panel.hidden=false;const open=document.getElementById('vg-invite-open');if(open)open.hidden=false;
 }
 window.VilleMomentsInvites={setupAdmin};
})();
