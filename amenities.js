(function(){
 const categories=['Banheiro','Quarto e lavanderia','Entretenimento','Climatização','Segurança','Internet e escritório','Cozinha e sala de jantar','Lazer e área externa','Estacionamento e serviços','Outras comodidades'];
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const groups=[
 ['Banheiro','Banheira|Chuveiro|Água quente|Secador de cabelo|Xampu|Condicionador|Sabonete para o corpo|Sabonete para as mãos|Papel higiênico|Toalhas|Roupão'],
 ['Quarto e lavanderia','Roupa de cama|Travesseiros e cobertores extras|Cama de casal|Cama queen|Cama king|Sofá-cama|Cortinas blackout|Cabides|Guarda-roupa|Máquina de lavar|Secadora|Lava e seca|Ferro de passar|Tábua de passar|Varal'],
 ['Entretenimento','Televisão|Smart TV|TV a cabo|Sistema de som|Jogos de tabuleiro|Livros|Mesa de bilhar'],
 ['Climatização','Ar-condicionado|Ventilador de teto|Ventilador portátil|Aquecedor|Lareira'],
 ['Segurança','Detector de fumaça|Detector de monóxido de carbono|Extintor de incêndio|Kit de primeiros socorros|Câmeras de segurança externas|Cofre'],
 ['Internet e escritório','Wi-Fi|Conexão Ethernet|Espaço de trabalho|Mesa de trabalho|Cadeira de escritório|Tomada perto da cama'],
 ['Cozinha e sala de jantar','Cozinha equipada|Geladeira|Freezer|Fogão|Forno|Micro-ondas|Air fryer|Lava-louças|Cafeteira|Chaleira elétrica|Liquidificador|Torradeira|Panelas e utensílios|Pratos e talheres|Copos|Taças de vinho|Abridor de vinho|Mesa de jantar|Café|Filtro de água'],
 ['Lazer e área externa','Piscina privativa|Piscina compartilhada|Piscina aquecida|Hidromassagem|Spa aquecido|Sauna|Fogueira|Rede|Balanço|Varanda|Deck privativo|Pergolado privativo|Jardim|Terreno exclusivo|Móveis externos|Mesa externa|Espreguiçadeiras|Churrasqueira|Utensílios para churrasco|Acesso à praia|Acesso ao lago|Vista para o mar|Vista para a montanha'],
 ['Estacionamento e serviços','Estacionamento|Estacionamento gratuito|Garagem coberta|Carregador para carro elétrico|Elevador|Self check-in|Fechadura eletrônica|Cofre de chaves|Aceita pets|Tigelas para pets|Café da manhã incluído|Guarda de bagagem'],
 ['Outras comodidades','Berço|Berço portátil|Cadeira alta para crianças|Banheira para bebê|Portão de segurança para bebês|Entrada sem degraus|Barras de apoio no banheiro|Estacionamento acessível']
 ];
 const catalog=groups.flatMap(([category,names])=>names.split('|').map(name=>({name,category})));
 const paths={
 wifi:'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01',
 pool:'M3 18q3-3 6 0t6 0t6 0M3 22q3-3 6 0t6 0t6 0M7 15V5a2 2 0 0 1 4 0M15 15V5a2 2 0 0 1 4 0M7 8h8M7 12h8',
 bath:'M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM6 12V5a2 2 0 0 1 4 0M6 20v2M18 20v2M14 3v4M18 3v4',
 snow:'M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1',
 bed:'M3 20V7M21 20V12H3M6 12V6h12v6M3 17h18',
 kitchen:'M5 2v7m-3-7v5a3 3 0 0 0 6 0V2M5 10v12M18 2v20M18 2c-6 3-6 10 0 10',
 tv:'M3 6h18v13H3ZM8 2l4 4 4-4M8 22h8',
 shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6',
 car:'M4 11l2-7h12l2 7M3 11h18v8H3ZM5 19v3M19 19v3M6 15h2M16 15h2',
 tree:'M12 2 5 10h3l-5 7h7v5h4v-5h7l-5-7h3Z',
 laundry:'M4 2h16v20H4ZM4 6h16M7 4h.01M10 4h.01M17 14a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 key:'M14 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM13 11l8 8M17 15l-2 2M20 18l-2 2',
 star:'m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z'
 };
 const icon=name=>{const n=normalize(name),c=category(name);const type=/wi.fi|ethernet|internet/.test(n)?'wifi':/piscina/.test(n)?'pool':/spa|hidro|banheir|chuveiro/.test(n)?'bath':/lavar|secadora|lava e seca/.test(n)?'laundry':/check.in|chave|fechadura/.test(n)?'key':c===categories[3]?'snow':c===categories[1]?'bed':c===categories[6]?'kitchen':c===categories[2]?'tv':c===categories[4]?'shield':/estacionamento|garagem|carro/.test(n)?'car':c===categories[7]?'tree':'star';return '<svg class="amenity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+paths[type]+'"/></svg>'};
 const priority=['wi-fi','hidromassagem','piscina aquecida','spa aquecido','ar-condicionado','piscina privativa','cozinha equipada','estacionamento','aceita pets'];
 const category=name=>{const known=catalog.find(x=>normalize(x.name)===normalize(name));if(known)return known.category;const s=normalize(name);return /hidro|spa|piscina|fogueira|rede|varanda|praia|churras|balanco|jardim/.test(s)?categories[7]:/wifi|wi-fi|internet|ethernet|escritorio/.test(s)?categories[5]:/ar.condicionado|ventilador|aquecimento/.test(s)?categories[3]:/cozinha|fogao|geladeira|micro.ondas|cafe|talher|prato|taca|liquidificador|forno/.test(s)?categories[6]:/cama|toalha|lavar|secadora|enxoval|cabide|ferro/.test(s)?categories[1]:/banheira|chuveiro|agua quente|xampu|shampoo|condicionador|sabonete|secador/.test(s)?categories[0]:/camera|detector|extintor|seguranca/.test(s)?categories[4]:/televisao|tv|som|jogo/.test(s)?categories[2]:/estacionamento|pet|check.in/.test(s)?categories[8]:categories[9]};
 const list=f=>[...new Set((Array.isArray(f)?f:f?.amenities||[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
 const defaults=items=>[...items].sort((a,b)=>{const rank=x=>{let i=priority.indexOf(normalize(x));return i<0?99:i};return rank(a)-rank(b)}).slice(0,8);
 const highlights=f=>{const items=list(f);return Array.isArray(f?.amenity_highlights)?[...new Set(f.amenity_highlights)].filter(x=>items.includes(x)).slice(0,8):defaults(items)};
 function render(parent,features){
  parent.querySelector('[data-public-amenities]')?.remove();const items=list(features);if(!items.length)return;
  const section=document.createElement('section');section.dataset.publicAmenities='';section.className='public-amenities';
  const heading=document.createElement('h2');heading.textContent='O que esse lugar oferece';section.append(heading);
  const row=name=>{const li=document.createElement('li'),icon=document.createElement('span');icon.className='amenity-mark';icon.setAttribute('aria-hidden','true');icon.innerHTML=window.VilleAmenities.icon(name);li.append(icon,document.createTextNode(name));return li};
  const top=document.createElement('ul');top.className='amenity-highlights';highlights(features).forEach(x=>top.append(row(x)));section.append(top);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Mostrar mais comodidades (${items.length})`;details.append(summary);
  categories.forEach(cat=>{const names=items.filter(x=>(categories.includes(features?.amenity_categories?.[x])?features.amenity_categories[x]:category(x))===cat);if(!names.length)return;const h=document.createElement('h3'),ul=document.createElement('ul');h.textContent=cat;names.forEach(x=>ul.append(row(x)));details.append(h,ul)});section.append(details);
  const target=parent.querySelector('.detail-closing');if(target)parent.insertBefore(section,target);else parent.append(section);
 }
 window.VilleAmenities={categories,category,list,defaults,highlights,render,catalog,icon,normalize};
})();
