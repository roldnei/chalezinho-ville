import {publicServiceTarget} from '../scripts/public-service-target.mjs';
import {chaletPages,galleryPage,watchPage,esc} from '../scripts/moments-pages.mjs';
export async function momentsHandler(req,res,{env=process.env,request=fetch}={}){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
 const host=String(req.headers.host||'');let release;try{release=publicServiceTarget(env,host)}catch{return res.status(404).end()}
 const input=new URL(req.url,'https://'+host),q=input.searchParams;for(const key of ['trip','chale','sitemap','media','poster','format'])if(!q.has(key)&&typeof req.query?.[key]==='string')q.set(key,req.query[key]);const id=q.get('trip'),code=q.get('chale'),isSitemap=q.get('sitemap')==='1',isMedia=q.has('media');
 if(id&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||code&&!Object.hasOwn(chaletPages,code)||!id&&!code&&!isSitemap)return res.status(400).end('Link inválido');
 if(isMedia&&(!id||!/^\d$/.test(q.get('media'))))return res.status(400).end('Mídia inválida');
 const origin=release.environment==='production'?'https://chalezinhoville.com.br':input.origin,backend=new URL('/functions/v1/villegram-content',release.endpoint);
 try{
  const response=await request(backend,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Chalezinho-Env':release.environment},body:JSON.stringify({operation:'public_gallery',...(id?{publication_id:id}:code?{property_code:code}:{})}),signal:AbortSignal.timeout(15000)});
  if(response.status===404||response.status===400){res.setHeader('X-Robots-Tag','noindex');return res.status(response.status).end('Momento indisponível');}
  const d=await response.json();if(!response.ok||!d.ok)throw Error('gallery_unavailable');const posts=d.publications;
  if(isMedia){
   const p=posts.find(p=>p.id===id),m=p?.media[Number(q.get('media'))],poster=q.get('poster')==='1',url=poster?m?.poster:m?.url;if(!url)return res.status(404).end();
   const source=new URL(url,origin+'/');if(source.protocol!=='https:'||![origin,backend.origin].includes(source.origin)||source.username||source.password)throw Error('invalid_media_origin');
   const range=req.headers.range;if(range&&!/^bytes=\d*-\d*$/.test(range))return res.status(416).end();
   const media=await request(source,{redirect:'error',headers:range?{Range:range}:{},signal:AbortSignal.timeout(20000)}),type=(media.headers.get('content-type')||'').split(';')[0];
   if(media.status===416)return res.status(416).end();if(!media.ok||!['image/webp','image/jpeg','image/png','image/avif','video/mp4','video/webm','video/quicktime'].includes(type))throw Error('media_unavailable');
   res.setHeader('Content-Type',type);res.setHeader('Accept-Ranges','bytes');for(const name of ['content-length','content-range']){const value=media.headers.get(name);if(value)res.setHeader(name,value)}res.status(media.status===206?206:200);if(req.method==='HEAD')return res.end();let bytes=0;for await(const chunk of media.body){bytes+=chunk.byteLength;if(bytes>64*1024*1024)throw Error('media_too_large');res.write(Buffer.from(chunk))}return res.end();
  }
  if(isSitemap){res.setHeader('Content-Type','application/xml; charset=utf-8');const guests=posts.filter(p=>p.is_guest),codes=[...new Set(guests.map(p=>p.property_code))];if(codes.includes('CH2')||codes.includes('CH3'))codes.push('CH2','CH3');const urls=[...new Set(codes)].map(c=>origin+'/galeria/'+c).concat(guests.map(p=>origin+'/momentos/'+p.id));return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+esc(u)+'</loc></url>').join('')+'</urlset>');}
  if(q.get('format')==='json'){res.setHeader('X-Robots-Tag','noindex');res.setHeader('Content-Type','application/json');return res.status(200).send(JSON.stringify({ok:true,publications:posts.map(p=>({id:p.id,title:p.title,is_guest:p.is_guest,property_code:p.property_code,link:p.link,thumb_url:p.thumb_url,author_name:p.author_name,cover_index:p.cover_index,media:p.media.map(m=>({kind:m.kind,alt:m.alt}))}))}));}
  res.setHeader('Content-Type','text/html; charset=utf-8');const html=id?watchPage(posts.find(p=>p.id===id),origin):galleryPage(code,posts,origin);res.status(200);return req.method==='HEAD'?res.end():res.send(html);
 }catch{if(res.headersSent)return res.end();res.setHeader('X-Robots-Tag','noindex');return res.status(503).end('Não foi possível carregar os momentos agora. Tente novamente em instantes.');}
}
export default (req,res)=>momentsHandler(req,res);
