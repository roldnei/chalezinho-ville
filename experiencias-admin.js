(()=>{
const C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),ENGINE=C.bookingEngine;
const $=s=>document.querySelector(s),brlC=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let session=null,data=null,current=null,mediaItems=[],draftKey=crypto.randomUUID();

async function api(action,body=null){
  const headers={"Content-Type":"application/json","X-Chalezinho-Env":"development","Authorization":"Bearer "+session.access_token};
  const r=await fetch(ENGINE+"?action="+action,{method:body?"POST":"GET",headers,body:body?JSON.stringify({action,...body}):undefined});
  const d=await r.json().catch(()=>({ok:false,error:"invalid_response"}));
  if(!r.ok||!d.ok) throw Object.assign(new Error(d.error||"request_failed"),{data:d,status:r.status});
  return d;
}
const statusText=s=>s==="active"?"Ativa":s==="archived"?"Arquivada":"Pausada";
const typeText=t=>({romantic:"Romântico",beach:"Praia",breakfast:"Café da manhã",celebration:"Comemoração",wellness:"Bem-estar",other:"Outros"}[t]||"Outros");
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

async function boot(){
  const {data:{session:s}}=await sb.auth.getSession();session=s;
  if(!session)return location.href="auth.html?mode=login&return=experiencias-admin.html";
  const {data:p}=await sb.from("profiles").select("role").eq("id",session.user.id).single();
  if(p?.role!=="admin"){$("#experience-admin-root").innerHTML='<div class="empty-state">Acesso restrito à administração.</div>';return}
  bind();await load();
}
function bind(){
  $("#experience-picker").addEventListener("change",()=>selectExperience($("#experience-picker").value||null));
  $("#new-experience").addEventListener("click",()=>selectExperience(null));
  $("#experience-form").addEventListener("submit",save);
  $("#photo-upload").addEventListener("change",uploadPhotos);
  $("#toggle-status").addEventListener("click",toggleStatus);
  $("#delete-experience").addEventListener("click",deleteExperience);
}
async function load(selectId=current?.id||null){
  data=await api("experience_admin");
  renderPicker();
  if(selectId && data.products.some(p=>p.id===selectId)) selectExperience(selectId);
  else if(!current) selectExperience(null);
}
function renderPicker(){
  const products=(data.products||[]).filter(p=>p.status!=="archived");
  $("#experience-picker").innerHTML='<option value="">Nova experiência</option>'+products.map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+statusText(p.status)+'</option>').join("");
  if(current?.id) $("#experience-picker").value=current.id;
}
function selectExperience(id){
  current=id?(data.products||[]).find(p=>p.id===id)||null:null;
  draftKey=current?.id||crypto.randomUUID();
  mediaItems=(current?.experience_media||[]).slice().sort((a,b)=>a.display_order-b.display_order).map(m=>({id:m.id||null,media_url:m.media_url,alt_text:m.alt_text||current?.name||"",display_order:m.display_order||0}));
  $("#experience-picker").value=current?.id||"";
  $("#exp-type").value=current?.package_type||"romantic";
  $("#exp-name").value=current?.name||"";
  $("#exp-price").value=current?Number(current.price_cents||0)/100:"";
  $("#exp-description").value=current?.description||"";
  $("#exp-upsell-yes").checked=current?.upsell_enabled===true;
  $("#exp-upsell-no").checked=current?.upsell_enabled!==true;
  renderStatus();renderPhotos();renderActions();
  $("#admin-message").textContent="";
  $("#experience-form").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderStatus(){
  const badge=$("#experience-status");
  const status=current?.status||"new";
  badge.textContent=status==="new"?"Nova experiência":statusText(status);
  badge.className="simple-status "+(status==="active"?"is-active":"is-paused");
}
function renderActions(){
  $("#save-experience").textContent=current?"Salvar alterações":"Salvar experiência";
  $("#toggle-status").hidden=!current;
  $("#delete-experience").hidden=!current;
  if(current) $("#toggle-status").textContent=current.status==="active"?"Pausar experiência":"Ativar experiência";
}
function renderPhotos(){
  const count=mediaItems.length;
  $("#photo-count").textContent=count+"/5 fotos";
  $("#photo-count").className="photo-count "+(count>=5?"ok":"warn");
  $("#photo-help").textContent=count>=5?"Galeria pronta para o carrossel.":"Adicione pelo menos "+(5-count)+" foto"+(5-count===1?"":"s")+" para completar o carrossel.";
  const box=$("#photo-grid");
  box.innerHTML=mediaItems.map((m,i)=>'<figure class="simple-photo"><img src="'+esc(m.media_url)+'" alt="'+esc(m.alt_text||"Foto da experiência")+'"><button type="button" data-remove-photo="'+i+'" aria-label="Excluir foto">×</button><span>'+(i+1)+'</span></figure>').join("");
  box.querySelectorAll("[data-remove-photo]").forEach(b=>b.onclick=()=>{mediaItems.splice(Number(b.dataset.removePhoto),1);normalizeMedia();renderPhotos()});
}
function normalizeMedia(){mediaItems=mediaItems.map((m,i)=>({...m,display_order:(i+1)*10}))}
async function uploadPhotos(e){
  const files=[...(e.target.files||[])];if(!files.length)return;
  $("#admin-message").textContent="Enviando fotos…";
  for(let i=0;i<files.length;i++){
    const file=files[i];
    if(file.size>10*1024*1024){$("#admin-message").textContent="Uma das imagens ultrapassa 10 MB.";continue}
    const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,"-"),path=draftKey+"/"+Date.now()+"-"+i+"-"+safe;
    const {error}=await sb.storage.from("experience-media").upload(path,file,{upsert:false});
    if(error){$("#admin-message").textContent="Falha ao enviar "+file.name+": "+error.message;continue}
    const {data:u}=sb.storage.from("experience-media").getPublicUrl(path);
    mediaItems.push({id:null,media_url:u.publicUrl,alt_text:$("#exp-name").value.trim()||"Experiência Chalezinho Ville",display_order:(mediaItems.length+1)*10});
  }
  e.target.value="";normalizeMedia();renderPhotos();
  if(!$("#admin-message").textContent.startsWith("Falha")) $("#admin-message").textContent="Fotos adicionadas. Clique em Salvar no final para confirmar as alterações.";
}
async function save(e){
  e.preventDefault();
  const name=$("#exp-name").value.trim(),price=Math.round(Number($("#exp-price").value||0)*100);
  if(!name){$("#admin-message").textContent="Informe o nome da experiência.";return}
  if(price<=0){$("#admin-message").textContent="Informe o preço.";return}
  if(mediaItems.length<5){$("#admin-message").textContent="Adicione pelo menos 5 fotos antes de salvar.";return}
  $("#save-experience").disabled=true;$("#admin-message").textContent=current?"Salvando alterações…":"Salvando experiência…";
  try{
    const r=await api("experience_admin_action",{
      operation:"save_simple_product",id:current?.id||null,
      package_type:$("#exp-type").value,name,
      price_cents:price,description:$("#exp-description").value.trim(),
      upsell_enabled:$("#exp-upsell-yes").checked,
      media_items:mediaItems.map((m,i)=>({media_url:m.media_url,alt_text:m.alt_text||name,display_order:(i+1)*10}))
    });
    $("#admin-message").textContent=current?"Alterações salvas.":"Experiência criada.";
    await load(r.product.id);
  }catch(err){
    $("#admin-message").textContent=err.message==="experience_requires_five_photos"?"São necessárias pelo menos 5 fotos.":"Não foi possível salvar: "+err.message;
  }finally{$("#save-experience").disabled=false}
}
async function toggleStatus(){
  if(!current)return;
  const action=current.status==="active"?"pausar":"ativar";
  if(!confirm("Deseja "+action+" esta experiência?"))return;
  try{
    const r=await api("experience_admin_action",{operation:"toggle_product_status",id:current.id});
    $("#admin-message").textContent=r.product.status==="active"?"Experiência ativada.":"Experiência pausada.";
    await load(current.id);
  }catch(err){$("#admin-message").textContent=err.message==="experience_requires_five_photos"?"Adicione pelo menos 5 fotos antes de ativar.":"Não foi possível alterar o status: "+err.message}
}
async function deleteExperience(){
  if(!current)return;
  if(!confirm('Excluir "'+current.name+'"? Esta ação remove a experiência da operação.'))return;
  try{
    const r=await api("experience_admin_action",{operation:"delete_product",id:current.id});
    $("#admin-message").textContent=r.archived?"A experiência tinha histórico e foi retirada da operação, preservando os registros antigos.":"Experiência excluída.";
    current=null;await load();
  }catch(err){$("#admin-message").textContent="Não foi possível excluir: "+err.message}
}
boot();
})();