const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validId=id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'');
export async function publicationShare(req,res,release,input){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
 const id=input.searchParams.get('publication');if(!validId(id))return res.status(400).end('Link inválido');
 const origin=release.environment==='production'?'https://chalezinhoville.com.br':input.origin,target='/index.html?publication='+encodeURIComponent(id);
 try{
  const backend=new URL('/functions/v1/villegram-content',release.endpoint);
  const response=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Chalezinho-Env':release.environment},body:JSON.stringify({operation:'public_share',publication_id:id}),signal:AbortSignal.timeout(8000)});
  if(response.status===404||response.status===400)return res.status(response.status).end('Trip indisponível');
  const data=await response.json();if(!response.ok||!data.ok||data.publication?.id!==id)throw Error('share_unavailable');
  const p=data.publication;
  if(input.searchParams.get('image')==='1'){
   if(!p.cover_url)return res.status(404).end('Capa indisponível');
   const cover=new URL(p.cover_url,origin+'/');
   if(cover.protocol!=='https:'||![origin,backend.origin].includes(cover.origin)||cover.username||cover.password)throw Error('invalid_cover');
   // The image address stays stable; signed storage URLs are refreshed only on
   // the server, with the same publication/consent checks on every request.
   const image=await fetch(cover,{redirect:'error',signal:AbortSignal.timeout(8000)}),type=(image.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!image.ok||!['image/jpeg','image/png','image/webp','image/avif'].includes(type)||Number(image.headers.get('content-length'))>10485760)throw Error('cover_unavailable');
   const chunks=[];let size=0;for await(const chunk of image.body){size+=chunk.byteLength;if(size>10485760)throw Error('cover_too_large');chunks.push(chunk);}
   res.setHeader('Content-Type',type);res.setHeader('X-Content-Type-Options','nosniff');res.status(200);return req.method==='HEAD'?res.end():res.send(Buffer.concat(chunks));
  }
  const canonical=new URL('/api/villegram?publication='+encodeURIComponent(id),origin),image=new URL(canonical);image.searchParams.set('image','1');if(p.updated_at)image.searchParams.set('v',String(p.updated_at));
  const imageMeta=p.cover_url?`<meta property="og:image" content="${esc(image.href)}"><meta property="og:image:alt" content="${esc(p.cover_alt)}"><meta name="twitter:image" content="${esc(image.href)}">`:'';
  res.setHeader('Content-Type','text/html; charset=utf-8');res.status(200);
  if(req.method==='HEAD')return res.end();
  return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(p.title)} · Ville Moments</title><link rel="canonical" href="${esc(canonical.href)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Ville Moments · Chalezinho Ville"><meta property="og:url" content="${esc(canonical.href)}"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">${imageMeta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(p.title)}"><meta name="twitter:description" content="${esc(p.description)}"><meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">Abrir este Trip no Ville Moments</a></body></html>`);
 }catch{return res.status(503).end('Não foi possível consultar este Trip agora.');}
}
