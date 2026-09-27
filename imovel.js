(async()=>{
 const code=new URLSearchParams(location.search).get('codigo');const main=document.querySelector('#property-detail');
 try{
  const res=await fetch('https://irxsaladqhbzhkoaclxy.supabase.co/functions/v1/booking-engine?action=property_media',{headers:{'X-Chalezinho-Env':'development'}});
  if(!res.ok)throw Error('unavailable');const data=await res.json();const p=data.properties?.find(item=>item.code===code);
  if(!p)throw Error('missing');document.title=p.name+' | Chalezinho Ville';main.replaceChildren();
  const images=(Array.isArray(p.gallery)?p.gallery:[]).map(x=>typeof x==='string'?{url:x,alt:p.name}:x).filter(x=>x?.url&&(/^(https:\/\/irxsaladqhbzhkoaclxy\.supabase\.co\/storage\/v1\/object\/public\/property-media\/|assets\/)/.test(x.url)));
  if(p.cover_image){const cover=images.find(x=>x.url===p.cover_image);if(cover)images.splice(images.indexOf(cover),1),images.unshift(cover)}
  const hero=document.createElement('section');hero.className='detail-hero';if(images.length)hero.style.backgroundImage=`linear-gradient(0deg,rgba(8,6,4,.78),rgba(8,6,4,.08)),url("${images[0].url}")`;
  const copy=document.createElement('div'),small=document.createElement('small');small.textContent='CHALEZINHO VILLE';const title=document.createElement('h1');title.textContent=p.name;const summary=document.createElement('p');summary.textContent=p.tagline||p.summary||'';const action=document.createElement('a');action.href='reservar.html?chalet='+encodeURIComponent(p.code);action.className='detail-consult';action.textContent='Consultar datas e reservar →';copy.append(small,title,summary,action);hero.append(copy);main.append(hero);
  const section=document.createElement('section');section.className='detail-moments';const intro=document.createElement('div'),h2=document.createElement('h2');h2.textContent='Conheça os espaços.';const description=document.createElement('p');description.textContent=p.summary||'';intro.append(h2,description);section.append(intro);
  const gallery=document.createElement('div');gallery.className='detail-gallery editorial';for(const item of images){const figure=document.createElement('figure'),img=document.createElement('img');img.src=item.url;img.alt=item.alt||p.name;img.loading='lazy';figure.append(img);gallery.append(figure)}section.append(gallery);main.append(section);
 }catch{main.textContent='Imóvel indisponível no momento.'}
})();
