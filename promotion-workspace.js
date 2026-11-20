(()=>{
  const C=window.CHALEZINHO_CONFIG,status=document.getElementById('promotion-access');
  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions);
  let data;
  async function boot(){
    const result=await sb.auth.getSession(),session=result.data.session;
    if(!session){location.href='auth.html?mode=login&return='+encodeURIComponent('promocoes.html'+location.search);return;}
    try{
      const r=await fetch(C.supabaseUrl+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json','X-Chalezinho-Env':C.environment,Authorization:'Bearer '+session.access_token},body:JSON.stringify({operation:'admin_list'}),signal:AbortSignal.timeout(30000)});
      data=await r.json();if(!r.ok||!data.ok)throw Error('Você precisa de acesso administrativo ao Ville Moments para criar promoções.');
      document.getElementById('pv-banners').hidden=false;status.hidden=true;
      const select=document.getElementById('promotion-publication');
      for(const p of data.publications||[]){
        if(p.source==='guest_submission'||!['draft','published'].includes(p.status))continue;
        const o=document.createElement('option');o.value=p.id;o.textContent=p.title+(p.status==='draft'?' · rascunho':'');select.append(o);
      }
      document.getElementById('promotion-use').onclick=async()=>{
        const note=document.getElementById('promotion-import-note'),p=data.publications.find(p=>p.id===select.value);
        if(!p){await window.PriceVilleBanners.usePublication({title:'Chalezinho Ville'},null);note.textContent='Nova promoção. Escolha as datas e consulte os preços.';return;}
        const property=data.properties.find(row=>Number(row.id)===Number(p.property_id));
        if(!property||!['CH1','CH2','CH3'].includes(property.code)){note.textContent='Esta publicação não está vinculada a um dos três chalés. Escolha uma promoção de chalé.';return;}
        await window.PriceVilleBanners.usePublication(p,property);
        note.textContent=p.stay_selection?'Datas e chalé da publicação carregados. Consulte o preço atual antes de baixar.':'Chalé e título carregados. Escolha as datas e consulte o preço atual antes de baixar.';
      };
      const id=new URLSearchParams(location.search).get('publication');
      if([...select.options].some(o=>o.value===id)){select.value=id;document.getElementById('promotion-use').click();}
      else await window.PriceVilleBanners.open();
    }catch(error){status.textContent=error.name==='TimeoutError'?'O PMS demorou a responder. Recarregue para tentar novamente.':error.message;}
  }
  boot();
})();
