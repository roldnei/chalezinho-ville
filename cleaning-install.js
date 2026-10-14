// Only /faxinas/ is controlled. No PMS, checkout, API or private evidence cache.
const button=document.querySelector('#install-app'),help=document.querySelector('#install-help');
let pending;
if(button){
 if(window.matchMedia?.('(display-mode: standalone)').matches){button.hidden=true;}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;button.hidden=false;button.textContent='Instalar este aplicativo';});
 window.addEventListener('appinstalled',()=>{pending=null;button.hidden=true;help.hidden=true;});
 button.onclick=async()=>{if(!pending){help.hidden=!help.hidden;return;}const prompt=pending;pending=null;button.disabled=true;try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')button.hidden=true;else help.hidden=false;}catch{help.hidden=false;}finally{button.disabled=false;}};
}
if('serviceWorker' in navigator&&location.pathname.startsWith('/faxinas/')){
 navigator.serviceWorker.register('/faxinas/sw.js',{scope:'/faxinas/'}).catch(()=>{if(help)help.textContent='A instalação não ficou disponível agora. Você pode continuar usando este aplicativo pelo navegador.';});
}
