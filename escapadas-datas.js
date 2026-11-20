(()=>{
 'use strict';
 const C=window.CHALEZINHO_CONFIG,V=window.VilleEscapadaVideo,$=s=>document.querySelector(s),query=new URLSearchParams(location.search);
 let catalog={properties:[],offers:[]},loaded=null,media=[],player=null,revision=0,controller=null,exporting=false,ready=false;
 const note=text=>$('#date-status').textContent=text;
 const values=()=>({chalet:$('#date-chalet').value,check_in:$('#date-in').value,check_out:$('#date-out').value,guests:Number($('#date-guests').value),offer_id:query.get('offer_id')||'',rate_code:query.get('rate_code')||'non_refundable'});
 const signature=()=>JSON.stringify(values());
 function destroyPreview(){player?.destroy();player=null;loaded=null;$('#date-download').disabled=true;$('#date-result').hidden=true;}
 function invalidate(){++revision;controller?.abort();destroyPreview();if(ready)note('Datas ou chalé alterados. Toque em Carregar escapada para consultar esta seleção.');}
 function selectionLocked(value){exporting=value;for(const el of $('#date-form').elements)el.disabled=value;for(const id of ['download','play','pause'])$('#date-'+id).disabled=value||!loaded;$('#date-stop').hidden=!value;$('#date-stop').disabled=false;$('#date-progress').hidden=!value;}
 async function load(event){
  event?.preventDefault();if(!ready||exporting||!$('#date-form').reportValidity())return;
  const selection=values();if(selection.check_out<=selection.check_in){invalidate();note('A saída precisa ser depois da entrada.');return;}
  const request=++revision,scope=signature();controller?.abort();controller=new AbortController();destroyPreview();$('#date-load').disabled=true;note('Carregando a escapada para estas datas…');
  try{
   const input=V.dateSelection(selection,catalog);
   const card=await V.refresh(input,{signal:controller.signal});if(request!==revision||scope!==signature())return;
   const rows=V.mediaFor(card,catalog);loaded={card,scope};media=rows;
   $('#date-result-title').textContent=card.property_name+' · '+(card.offer_name||'Escapada');$('#date-selection').textContent=V.range(card)+' · '+card.nights+' noites · '+card.guests+' hóspedes';$('#date-price').innerHTML=V.installmentHTML(card.total_cents);$('#date-quote-time').textContent='Oferta e limpeza incluídas.';$('#date-result').hidden=false;
   const current=await V.preview($('#date-canvas'),card,rows,{onError:text=>{if(request===revision){$('#date-download').disabled=true;note(text);}}});
   if(request!==revision||scope!==signature()){current.destroy();return;}player=current;$('#date-download').disabled=false;note('Escapada carregada. Confira a prévia e baixe o vídeo.');
  }catch(e){if(request===revision){destroyPreview();note(e.name==='AbortError'?'Consulta cancelada.':e.message);}}
  finally{if(request===revision){controller=null;$('#date-load').disabled=false;}}
 }
 $('#date-form').onsubmit=load;for(const id of ['chalet','in','out','guests'])$('#date-'+id).addEventListener('change',()=>{invalidate();$('#date-load').disabled=false;});
 $('#date-play').onclick=()=>player?.play();$('#date-pause').onclick=()=>player?.pause();$('#date-stop').onclick=()=>controller?.abort();
 $('#date-download').onclick=async()=>{
  if(!loaded||exporting||loaded.scope!==signature()){invalidate();return;}
  const current=loaded;controller=new AbortController();selectionLocked(true);player?.pause();$('#date-progress').value=0;note('Reconfirmando o valor da escapada…');
  try{const fresh=await V.refresh(current.card,{signal:controller.signal});Object.assign(current.card,fresh);$('#date-price').innerHTML=V.installmentHTML(fresh.total_cents);const blob=await V.exportVideo(current.card,media,{signal:controller.signal,progress:n=>{$('#date-progress').value=n;note('Gerando vídeo da '+current.card.property_name+' · '+n+'%');}});V.download(blob,current.card);note('Vídeo baixado: '+current.card.property_name+' · '+V.range(current.card)+'.');}
  catch(e){note(e.name==='AbortError'?'Geração cancelada.':e.message==='mp4_unavailable'?'Este navegador não consegue gerar MP4. Abra o PMS no Chrome atualizado ou Safari.':e.message);}
  finally{controller=null;selectionLocked(false);}
 };
 async function boot(){
  try{
   const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions),session=(await sb.auth.getSession()).data.session;
   if(!session){location.href='auth.html?mode=login&return='+encodeURIComponent('villemoments-escapadas.html'+location.search);return;}
   const r=await fetch(C.supabaseUrl+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,'X-Chalezinho-Env':C.environment},body:JSON.stringify({operation:'admin_list'}),signal:AbortSignal.timeout(30000)}),data=await r.json();
   if(!r.ok||!data.ok)throw Error('Entre com uma conta administradora do PMS para carregar as escapadas.');
   const offersResponse=await fetch(C.supabaseUrl+'/functions/v1/public-consultation?action=stay_offers',{headers:{'X-Chalezinho-Env':C.environment},cache:'no-store',signal:AbortSignal.timeout(30000)}),offers=await offersResponse.json();
   if(!offersResponse.ok||!offers.ok||!Array.isArray(offers.offers))throw Error('Não foi possível carregar as regras atuais da Escapada. Recarregue para tentar novamente.');
   catalog={properties:data.properties||[],offers:offers.offers};for(const p of catalog.properties)if(p.active!==false&&['CH1','CH2','CH3'].includes(p.code))$('#date-chalet').append(new Option(p.name,p.code));
   for(const [id,key] of [['chalet','chalet'],['in','check_in'],['out','check_out'],['guests','guests']])if(query.get(key))$('#date-'+id).value=query.get(key);
   $('#date-access').hidden=true;$('#date-workspace').hidden=false;ready=true;
   if(query.has('chalet')&&query.has('check_in')&&query.has('check_out'))await load();
  }catch(e){$('#date-access').textContent=e.name==='TimeoutError'?'O Ville Moments demorou para responder. Recarregue para tentar novamente.':e.message;}
 }
 boot();
})();
