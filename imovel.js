(async()=>{
 const code=new URLSearchParams(location.search).get('codigo');const main=document.querySelector('#property-detail');
 try{
  const res=await fetch(window.CHALEZINHO_CONFIG.bookingEngine+'?action=property_media',{headers:{'X-Chalezinho-Env':'development'}});
  if(!res.ok)throw Error('unavailable');const data=await res.json();const p=data.properties?.find(item=>item.code===code);
  if(!p)throw Error('missing');document.title=p.name+' | Chalezinho Ville';main.replaceChildren();
  const images=(Array.isArray(p.gallery)?p.gallery:[]).map(x=>typeof x==='string'?{url:x,alt:p.name}:x).filter(x=>x?.url&&(x.url.startsWith(window.CHALEZINHO_CONFIG.supabaseUrl+'/storage/v1/object/public/property-media/')||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)(\?v=[0-9]+)?$/.test(x.url)));
  if(p.cover_image){const cover=images.find(x=>x.url===p.cover_image);if(cover)images.splice(images.indexOf(cover),1),images.unshift(cover)}
  const hero=document.createElement('section');hero.className='detail-hero';if(images.length)VilleImages.background(hero,images[0].url);
  const copy=document.createElement('div'),small=document.createElement('small');small.textContent='CHALEZINHO VILLE';const title=document.createElement('h1');title.textContent=p.name;const summary=document.createElement('p');summary.textContent=p.tagline||p.summary||'';const action=document.createElement('a');action.href='reservar.html?chalet='+encodeURIComponent(p.code);action.className='detail-consult';action.textContent='Ver disponibilidade e preços →';copy.append(small,title,summary,action);hero.append(copy);main.append(hero);
  const section=document.createElement('section');section.className='detail-moments';const intro=document.createElement('div'),h2=document.createElement('h2');h2.textContent='Conheça os espaços.';const description=document.createElement('p');description.textContent=p.summary||'';intro.append(h2,description);section.append(intro);
  const gallery=document.createElement('div');gallery.className='detail-gallery editorial';for(const item of images){const figure=document.createElement('figure'),img=document.createElement('img');VilleImages.set(img,item.url);img.alt=item.alt||p.name;img.loading='lazy';figure.append(img);gallery.append(figure)}section.append(gallery);main.append(section);
 }catch{main.textContent='Imóvel indisponível no momento.'}
})();
