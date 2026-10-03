(function(){
 const categories=['Banheiro','Quarto e lavanderia','Entretenimento','Climatização','Segurança','Internet e escritório','Cozinha e sala de jantar','Lazer e área externa','Estacionamento e serviços','Outras comodidades'];
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const priority=['wi-fi','hidromassagem','piscina aquecida','spa aquecido','ar-condicionado','piscina privativa','cozinha equipada','estacionamento','aceita pets'];
 const category=name=>{const s=normalize(name);return /hidro|spa|piscina|fogueira|rede|varanda|praia|churras|balanco|jardim/.test(s)?categories[7]:/wifi|wi-fi|internet|ethernet|escritorio/.test(s)?categories[5]:/ar.condicionado|ventilador|aquecimento/.test(s)?categories[3]:/cozinha|fogao|geladeira|micro.ondas|cafe|talher|prato|taca|liquidificador|forno/.test(s)?categories[6]:/cama|toalha|lavar|secadora|enxoval|cabide|ferro/.test(s)?categories[1]:/banheira|chuveiro|agua quente|xampu|shampoo|condicionador|sabonete|secador/.test(s)?categories[0]:/camera|detector|extintor|seguranca/.test(s)?categories[4]:/televisao|tv|som|jogo/.test(s)?categories[2]:/estacionamento|pet|check.in/.test(s)?categories[8]:categories[9]};
 const list=f=>[...new Set((Array.isArray(f)?f:f?.amenities||[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
 const defaults=items=>[...items].sort((a,b)=>{const rank=x=>{let i=priority.indexOf(normalize(x));return i<0?99:i};return rank(a)-rank(b)}).slice(0,8);
 const highlights=f=>{const items=list(f);return Array.isArray(f?.amenity_highlights)?[...new Set(f.amenity_highlights)].filter(x=>items.includes(x)).slice(0,8):defaults(items)};
 function render(parent,features){
  parent.querySelector('[data-public-amenities]')?.remove();const items=list(features);if(!items.length)return;
  const section=document.createElement('section');section.dataset.publicAmenities='';section.className='public-amenities';
  const heading=document.createElement('h2');heading.textContent='O que esse lugar oferece';section.append(heading);
  const row=name=>{const li=document.createElement('li'),icon=document.createElement('span');icon.className='amenity-mark';icon.setAttribute('aria-hidden','true');icon.textContent='✓';li.append(icon,document.createTextNode(name));return li};
  const top=document.createElement('ul');top.className='amenity-highlights';highlights(features).forEach(x=>top.append(row(x)));section.append(top);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Mostrar mais comodidades (${items.length})`;details.append(summary);
  categories.forEach(cat=>{const names=items.filter(x=>(categories.includes(features?.amenity_categories?.[x])?features.amenity_categories[x]:category(x))===cat);if(!names.length)return;const h=document.createElement('h3'),ul=document.createElement('ul');h.textContent=cat;names.forEach(x=>ul.append(row(x)));details.append(h,ul)});section.append(details);
  const target=parent.querySelector('.detail-closing');if(target)parent.insertBefore(section,target);else parent.append(section);
 }
 window.VilleAmenities={categories,category,list,defaults,highlights,render};
})();
