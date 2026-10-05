(async()=>{
 const host=document.querySelector('#legal-content'),type=new URLSearchParams(location.search).get('type')||'hosting_terms',C=window.CHALEZINHO_CONFIG;
 try{
  const r=await fetch(C.bookingEngine+'?action=legal_documents',{cache:'no-store',headers:{'X-Chalezinho-Env':C.environment},signal:AbortSignal.timeout(10000)}),data=await r.json();
  const doc=data.documents?.find(d=>d.document_type===type);if(!r.ok||!data.ok||!doc)throw new Error();
  host.textContent='';const title=document.createElement('h1');title.textContent=doc.title;
  const meta=document.createElement('p');meta.textContent='Versão '+doc.version+(doc.effective_at?' · publicada em '+new Date(doc.effective_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília)':'');
  const body=document.createElement('p');body.className='legal-body';body.textContent=doc.body;
  const download=document.createElement('button');download.textContent='Baixar esta versão';download.onclick=()=>{const url=URL.createObjectURL(new Blob([doc.title+'\nVersão '+doc.version+'\n\n'+doc.body],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=doc.code+'-v'+doc.version+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  host.append(title,meta,download,body);document.title=doc.title+' | Chalezinho Ville';
 }catch{host.textContent='Não foi possível consultar o documento. Atualize a página ou fale com atendimento@chalezinhoville.com.br.'}
})();
