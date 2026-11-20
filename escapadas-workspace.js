(()=>{
 'use strict';
 const C=window.CHALEZINHO_CONFIG,V=window.VilleEscapadaVideo,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let catalog={cards:[],properties:[],offers:[]},selected,selectedMedia=[],player=null,controller=null,loading=false,previewRevision=0,exporting=false;
 const status=text=>$('#escape-video-status').textContent=text;
 function render(){
  const from=$('#escape-from').value,to=$('#escape-to').value;if(from&&to&&from>to){$('#escape-list-status').textContent='A data final do filtro precisa ser igual ou posterior à inicial.';return;}
  const cards=V.filter(catalog.cards,{property:$('#escape-property').value,from,to});
  $('#escape-list-status').textContent=cards.length+' escapada(s) encontrada(s).'+(catalog.window_end?' Geração automática até '+catalog.window_end.slice(8)+'/'+catalog.window_end.slice(5,7)+'.':'');
  $('#escape-cards').innerHTML=cards.map(c=>'<article class="escape-card">'+(c.image?'<img src="'+esc(c.showcase_image||c.image)+'" alt="'+esc(c.property_name)+'" loading="lazy">':'')+'<div class="escape-card-body"><small>ESCAPADA AUTOMÁTICA · '+esc(c.property_code)+'</small><h2>'+esc(c.property_name)+'</h2><p>'+esc(V.range(c))+'</p><p>'+c.nights+' noites · '+c.guests+' hóspedes</p><p class="escape-price">'+V.installmentHTML(c.total_cents)+'</p><small>10 parcelas em reais · acréscimo de 7%</small><button type="button" data-escape-key="'+esc(V.key(c))+'">Ver e baixar vídeo</button></div></article>').join('');
  if(!cards.length)$('#escape-cards').innerHTML='<p>Nenhuma escapada automática nesse filtro. Escolha outras datas ou use Criar nova escapada no editor do Ville Moments.</p>';
 }
 async function load(){
  if(loading)return;loading=true;$('#escape-refresh').disabled=true;$('#escape-list-status').textContent='Carregando as escapadas automáticas do Ville Moments…';
  try{const r=await fetch('/api/stay-showcase',{cache:'no-store',signal:AbortSignal.timeout(55000)}),d=await r.json();if(!r.ok||!d.ok||!Array.isArray(d.cards))throw Error('Não foi possível atualizar as escapadas. Tente novamente.');catalog=d;
   const old=$('#escape-property').value;$('#escape-property').replaceChildren(new Option('Todos os chalés',''));for(const p of d.properties||[])if(d.cards.some(c=>c.property_id===p.id))$('#escape-property').append(new Option(p.name,p.code));$('#escape-property').value=old;render();
  }catch(e){$('#escape-list-status').textContent=e.name==='TimeoutError'?'As escapadas demoraram a carregar. Toque em Atualizar escapadas para tentar novamente.':e.message;}finally{loading=false;$('#escape-refresh').disabled=false;}
 }
 function controls(value){exporting=value;for(const id of ['close','download','edit','play','pause','seek'])$('#escape-'+id).disabled=value;$('#escape-cancel').hidden=!value;$('#escape-progress').hidden=!value;}
 async function show(card){
  const revision=++previewRevision;player?.destroy();player=null;selected={...card};selectedMedia=V.mediaFor(selected,catalog);$('#escape-preview-title').textContent=card.property_name+' · '+(card.offer_name||'Escapada');$('#escape-selected-dates').textContent=V.range(card)+' · '+card.nights+' noites · '+card.guests+' hóspedes';$('#escape-download').disabled=true;status('Carregando a prévia do vídeo…');$('#escape-preview').showModal();
  try{const current=await V.preview($('#escape-canvas'),selected,selectedMedia,{onError:status,onTime:(t,total)=>{$('#escape-seek').max=total;$('#escape-seek').value=t;$('#escape-time').textContent=Math.floor(t)+' / '+Math.ceil(total)+' s';}});if(revision!==previewRevision){current.destroy();return;}player=current;$('#escape-download').disabled=false;status('Confira o chalé, as datas e o preço no vídeo antes de baixar.');}catch(e){if(revision===previewRevision)status(e.message);}
 }
 $('#escape-cards').onclick=e=>{const button=e.target.closest('[data-escape-key]');if(button){const card=catalog.cards.find(c=>V.key(c)===button.dataset.escapeKey);if(card)show(card);}};
 $('#escape-filters').onsubmit=e=>{e.preventDefault();render();};$('#escape-property').onchange=render;$('#escape-from').onchange=render;$('#escape-to').onchange=render;
 $('#escape-clear').onclick=()=>{$('#escape-filters').reset();render();};$('#escape-refresh').onclick=load;
 $('#escape-preview').addEventListener('cancel',e=>{if(exporting)e.preventDefault();});$('#escape-close').onclick=()=>$('#escape-preview').close();$('#escape-preview').onclose=()=>{++previewRevision;player?.destroy();player=null;controller?.abort();};
 $('#escape-play').onclick=()=>player?.play();$('#escape-pause').onclick=()=>player?.pause();$('#escape-seek').oninput=e=>player?.seek(Number(e.target.value));
 $('#escape-edit').onclick=()=>{if(!selected)return;location.href=V.dateToolURL(selected);};
 $('#escape-download').onclick=async()=>{
  if(!selected||exporting)return;controller=new AbortController();controls(true);player?.pause();$('#escape-progress').value=0;status('Reconfirmando o preço e a disponibilidade desta escapada…');
  try{const fresh=await V.refresh(selected,{signal:controller.signal});Object.assign(selected,fresh);status('Gerando o vídeo MP4. Mantenha esta tela aberta…');const blob=await V.exportVideo(selected,selectedMedia,{signal:controller.signal,progress:n=>{$('#escape-progress').value=n;status('Gerando vídeo da '+selected.property_name+' · '+n+'%');}});V.download(blob,selected);$('#escape-progress').value=100;status('Vídeo baixado: '+selected.property_name+' · '+V.range(selected)+'.');}
  catch(e){status(e.name==='AbortError'?'Geração cancelada.':({mp4_unavailable:'Este navegador não consegue gerar MP4. Abra o PMS no Chrome atualizado ou Safari para baixar o vídeo.',export_unavailable:'Este navegador não permite gerar vídeo. Abra o PMS no Chrome atualizado ou Safari.',audio_unavailable:'O navegador não liberou o processamento do vídeo. Tente novamente.'}[e.message]||e.message));}finally{controller=null;controls(false);}
 };
 $('#escape-cancel').onclick=()=>controller?.abort();
 async function boot(){
  try{const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),r=await sb.auth.getSession(),session=r.data.session;if(!session){location.href='auth.html?mode=login&return='+encodeURIComponent('promocoes.html');return;}
   const response=await fetch(C.supabaseUrl+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,'X-Chalezinho-Env':C.environment},body:JSON.stringify({operation:'admin_list'}),signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok||!data.ok)throw Error('Entre com uma conta administradora do PMS para baixar as escapadas.');
   $('#escape-access').hidden=true;$('#escape-library').hidden=false;await load();
  }catch(e){$('#escape-access').textContent=e.name==='TimeoutError'?'O PMS demorou para responder. Recarregue para tentar novamente.':e.message;}
 }
 boot();
})();
