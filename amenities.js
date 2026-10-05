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
 Object.assign(paths,{
 fire:'M12 2c2 6 7 7 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 3 5 3 5s3-3 0-10ZM9 18l3-5 3 5M3 22l18-2M3 20l18 2',
 hammock:'M2 3v19M22 3v19M2 7q10 18 20 0M2 7q10 9 20 0',
 swing:'M3 22V2h18v20M8 2v14M16 2v14M6 16h12v3H6Z',
 sauna:'M3 14h18v5H3ZM5 19v3M19 19v3M7 11c-4-3 4-5 0-8M12 11c-4-3 4-5 0-8M17 11c-4-3 4-5 0-8',
 shampoo:'M8 2h8v4H8ZM7 6h10l1 3v13H6V9ZM9 11h6M10 15h4',
 conditioner:'M7 2h10l-1 16H8ZM8 18h8v4H8ZM10 7h4M10 11h4',
 soap:'M7 9h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4ZM8 14h8M7 4h.01M12 2h.01M18 5h.01',
 dispenser:'M8 9h8v13H8ZM12 9V4M8 4h10v3M10 2h4M10 14h4',
 shower:'M3 3c0-2 6-2 8 1l2 3M9 10l8-6 3 4-8 6ZM12 17v2M17 13v2M20 17v2M8 20v2',
 drop:'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13ZM8 15c0 3 2 4 4 4',
 dryer:'M3 4h12v8H3ZM15 5l6-2v10l-6-2M8 12l3 8H7L5 12M8 20v2',
 towel:'M3 4h18M6 4v17h12V4M6 17h12M9 8v5',
 paper:'M5 5a4 4 0 0 1 8 0v14H5ZM5 5h8M13 1h5a4 4 0 0 1 4 4v14H13M8 5h2M13 15h9',
 hanger:'M9 5a3 3 0 1 1 4 3v3l9 6v3H2v-3l11-6',
 wardrobe:'M3 2h18v20H3ZM12 2v20M9 11v3M15 11v3',
 curtain:'M2 3h20M4 3v19l6-2V3M14 3v17l6 2V3M6 7v9M18 7v9',
 iron:'M3 19h18l-3-9H9c-3 0-5 4-6 9ZM9 10V6h9l2 4M6 16h10',
 fan:'M12 12c-9-1-8-9-2-10 5-1 5 5 2 10Zm0 0c4-8 11-5 10 1-1 5-7 4-10-1Zm0 0c6 7 0 12-5 8-4-3-1-8 5-8Z',
 fridge:'M5 2h14v20H5ZM5 10h14M8 5v2M8 14v4',
 oven:'M3 3h18v19H3ZM3 8h18M6 11h12v8H6ZM6 5h.01M11 5h.01M16 5h.01',
 microwave:'M2 5h20v15H2ZM5 8h11v9H5ZM19 9h.01M19 13h.01',
 coffee:'M3 9h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM17 10h2a3 3 0 0 1 0 6h-2M6 6V2M10 6V2M14 6V2',
 kettle:'M6 9h12l2 12H4ZM8 9V6a4 4 0 0 1 8 0v3M18 11l4-3-2 9M9 4h6',
 wine:'M7 2h10l1 6a6 6 0 0 1-12 0ZM12 14v8M7 22h10M6 7h12',
 pot:'M4 8h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3ZM2 12h2M20 12h2M3 8h18M9 5h6M12 5V3',
 table:'M2 7h20v4H2ZM5 11v11M19 11v11',
 chair:'M7 2h10v11H7ZM5 13h14v4H5ZM7 17v5M17 17v5',
 grill:'M3 10h18a9 9 0 0 1-18 0ZM8 18l-2 4M16 18l2 4M7 7V2M12 7V2M17 7V2',
 beach:'M2 12a10 10 0 0 1 20 0ZM12 2v20M7 22h10M7 12c0-7 3-10 5-10s5 3 5 10',
 mountain:'M2 21 9 5l5 9 3-5 5 12ZM6 12l3 2 3-2',
 camera:'M3 7h13v12H3ZM16 11l6-4v12l-6-4M6 19v3M6 4h7',
 extinguisher:'M8 8h8v14H8ZM12 8V3h6M9 3h3M16 8c5 0 6 4 6 7M9 13h6',
 firstaid:'M3 6h18v16H3ZM8 6V2h8v4M12 10v8M8 14h8',
 detector:'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM8 9h8M8 12h8M10 15h4',
 books:'M3 3h5v19H3ZM8 6h5v16H8ZM15 4l4-1 4 18-4 1Z',
 game:'M3 7h18v14H3ZM6 12h6M9 9v6M16 11h.01M18 16h.01',
 speaker:'M5 2h14v20H5ZM12 10a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM11 5h2',
 laptop:'M4 3h16v13H4ZM2 20l2-4h16l2 4Z',
 plug:'M8 2v5M16 2v5M5 7h14v5a7 7 0 0 1-14 0ZM12 19v3',
 baby:'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM9 2c-2 5 6 5 4 0M8 10h.01M16 10h.01M8 15q4 4 8 0',
 crib:'M3 5v17M21 5v17M3 9h18M3 18h18M7 9v9M12 9v9M17 9v9',
 access:'M12 2h.01M12 6v8h7l3 7M12 10H8a6 6 0 1 0 8 8',
 paw:'M8 13q4-6 8 0l3 5c2 6-7 2-7 2s-9 4-7-2ZM3 8h.01M8 4h.01M16 4h.01M21 8h.01',
 luggage:'M5 6h14v14H5ZM9 6V2h6v4M8 20v2M16 20v2M9 9v8M15 9v8',
 gate:'M3 3v19M21 3v19M3 8h18M3 18h18M7 8v10M12 8v10M17 8v10',
 garden:'M12 22V10M12 16C2 16 2 7 2 7s10 0 10 9ZM12 12C22 12 22 3 22 3s-10 0-10 9Z',
 deck:'M3 9h18v12H3ZM3 15h18M7 15v6M12 15v6M17 15v6M5 9V3M12 9V3M19 9V3',
 pergola:'M3 22V6M21 22V6M1 6h22M4 2v7M9 2v7M15 2v7M20 2v7',
 safe:'M3 3h18v18H3ZM15 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM6 7v10M15 9v6',
 bulb:'M9 18h6M9 22h6M9 18c0-4-4-4-4-9a7 7 0 0 1 14 0c0 5-4 5-4 9',
 boat:'M2 14h20l-4 7H6ZM12 2v12M12 2l8 9h-8'
 });
 const iconRules=[[/xampu|shampoo/,'shampoo'],[/condicionador/,'conditioner'],[/sabonete.*maos/,'dispenser'],[/sabonete/,'soap'],[/papel higienico/,'paper'],[/secador de cabelo|^secador$/,'dryer'],[/chuveiro/,'shower'],[/agua quente|filtro de agua/,'drop'],[/toalha|roupao/,'towel'],[/fogueira|lareira/,'fire'],[/^rede$/,'hammock'],[/balanco/,'swing'],[/sauna/,'sauna'],[/cabide/,'hanger'],[/guarda.roupa/,'wardrobe'],[/cortina/,'curtain'],[/ferro|tabua de passar/,'iron'],[/varal/,'hanger'],[/ventilador/,'fan'],[/geladeira|freezer/,'fridge'],[/micro.ondas|air fryer/,'microwave'],[/fogao|forno|lava.loucas/,'oven'],[/cafe/,'coffee'],[/chaleira/,'kettle'],[/taca|vinho|copos/,'wine'],[/panela|liquidificador|torradeira/,'pot'],[/mesa/,'table'],[/cadeira|espreguicadeira|moveis/,'chair'],[/churras/,'grill'],[/praia|mar/,'beach'],[/montanha/,'mountain'],[/camera/,'camera'],[/extintor/,'extinguisher'],[/primeiros socorros/,'firstaid'],[/detector/,'detector'],[/cofre de chaves|check.in|fechadura/,'key'],[/cofre/,'safe'],[/livro/,'books'],[/jogo|bilhar/,'game'],[/som/,'speaker'],[/trabalho|escritorio/,'laptop'],[/tomada|carregador/,'plug'],[/berco/,'crib'],[/bebe/,'baby'],[/degrau|barras de apoio|acessivel/,'access'],[/pet/,'paw'],[/bagagem/,'luggage'],[/portao|terreno/,'gate'],[/jardim/,'garden'],[/deck|varanda/,'deck'],[/pergolado/,'pergola'],[/lago/,'boat'],[/wi.fi|ethernet|internet/,'wifi'],[/piscina/,'pool'],[/spa|hidro|banheira/,'bath'],[/lavar|secadora|lava e seca/,'laundry'],[/ar.condicionado|aquecedor/,'snow'],[/cama|travesseiro/,'bed'],[/cozinha|talheres|pratos/,'kitchen'],[/televisao|tv/,'tv'],[/estacionamento|garagem/,'car'],[/elevador/,'gate']];
 const icon=name=>{const n=normalize(name),type=iconRules.find(([pattern])=>pattern.test(n))?.[1]||'star';return '<svg class="amenity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+paths[type]+'"/></svg>'};

 const priority=['wi-fi','hidromassagem','piscina aquecida','spa aquecido','ar-condicionado','piscina privativa','cozinha equipada','estacionamento','aceita pets'];
 const category=name=>{const known=catalog.find(x=>normalize(x.name)===normalize(name));if(known)return known.category;const s=normalize(name);return /hidro|spa|piscina|fogueira|rede|varanda|praia|churras|balanco|jardim/.test(s)?categories[7]:/wifi|wi-fi|internet|ethernet|escritorio/.test(s)?categories[5]:/ar.condicionado|ventilador|aquecimento/.test(s)?categories[3]:/cozinha|fogao|geladeira|micro.ondas|cafe|talher|prato|taca|liquidificador|forno/.test(s)?categories[6]:/cama|toalha|lavar|secadora|enxoval|cabide|ferro/.test(s)?categories[1]:/banheira|chuveiro|agua quente|xampu|shampoo|condicionador|sabonete|secador/.test(s)?categories[0]:/camera|detector|extintor|seguranca/.test(s)?categories[4]:/televisao|tv|som|jogo/.test(s)?categories[2]:/estacionamento|pet|check.in/.test(s)?categories[8]:categories[9]};
 const list=f=>{const items=[...new Set((Array.isArray(f)?f:f?.amenities||[]).filter(x=>typeof x==='string'&&x.trim()&&!/^\d+\s+h[oó]spedes?$/i.test(x.trim())).map(x=>x.trim()))];return items.filter(x=>!(normalize(x)==='spa'&&items.some(y=>normalize(y)==='spa aquecido')))};
 const defaults=items=>[...items].sort((a,b)=>{const rank=x=>{let i=priority.indexOf(normalize(x));return i<0?99:i};return rank(a)-rank(b)}).slice(0,8);
 const highlights=f=>{const items=list(f);return Array.isArray(f?.amenity_highlights)?[...new Set(f.amenity_highlights)].filter(x=>items.includes(x)).slice(0,8):defaults(items)};
 function render(parent,features){
  if(!features)return;
  const previous=parent.querySelector('[data-public-amenities]')||parent.querySelector('.detail-comfort:has(.amenity-cloud)');const items=list(features);if(!items.length){previous?.remove();return}
  const section=document.createElement('section');section.dataset.publicAmenities='';section.className='public-amenities';
  const heading=document.createElement('h2');heading.textContent='O que esse lugar oferece';section.append(heading);
  const row=name=>{const li=document.createElement('li'),icon=document.createElement('span');icon.className='amenity-mark';icon.setAttribute('aria-hidden','true');icon.innerHTML=window.VilleAmenities.icon(name);li.append(icon,document.createTextNode(name));return li};
  const top=document.createElement('ul');top.className='amenity-highlights';highlights(features).forEach(x=>top.append(row(x)));section.append(top);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Mostrar mais comodidades (${items.length})`;details.append(summary);
  categories.forEach(cat=>{const names=items.filter(x=>(categories.includes(features?.amenity_categories?.[x])?features.amenity_categories[x]:category(x))===cat);if(!names.length)return;const h=document.createElement('h3'),ul=document.createElement('ul');h.textContent=cat;names.forEach(x=>ul.append(row(x)));details.append(h,ul)});section.append(details);
  const target=parent.querySelector('.detail-closing');if(previous)previous.replaceWith(section);else if(target)parent.insertBefore(section,target);else parent.append(section);
 }
 window.VilleAmenities={categories,category,list,defaults,highlights,render,catalog,icon,normalize};
})();
