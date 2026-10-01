/* Local variants and photos uploaded through the property editor share one renderer. */
window.VilleImages=(()=>{
 const manifest=window.VILLE_IMAGE_MANIFEST||{};
 function variants(url){
  const path=String(url||'').split('?')[0],local=manifest[path];
  if(local)return local;
  const match=path.match(/\/responsive-[a-f0-9-]+-w(\d+)\.webp$/);
  if(match){const width=Number(match[1]);return [...new Set([Math.min(640,width),width])].map(w=>({url:path.replace(/-w\d+\.webp$/,'-w'+w+'.webp'),width:w}))}
  return [];
 }
 function set(img,url,{defer=false,sizes='(max-width: 800px) 100vw, 60vw'}={}){
  const list=variants(url),src=list.at(-1)?.url||url,srcset=list.map(x=>x.url+' '+x.width+'w').join(', ');
  img.decoding='async';img.sizes=sizes;
  if(defer){img.dataset.src=src;if(srcset)img.dataset.srcset=srcset;return}
  if(srcset)img.srcset=srcset;img.src=src;
 }
 function activate(img){if(img.dataset.srcset){img.srcset=img.dataset.srcset;delete img.dataset.srcset}if(img.dataset.src){img.src=img.dataset.src;delete img.dataset.src}}
 function background(el,url,lazy=false){
  const list=variants(url),gradient='linear-gradient(0deg,rgba(8,6,4,.78),rgba(8,6,4,.08)),',media=matchMedia('(max-width: 800px)');
  const paint=()=>{el.style.backgroundImage=gradient+'url("'+(list.length?(media.matches?list[0].url:list.at(-1).url):url)+'")'};
  const start=()=>{paint();media.addEventListener('change',paint)};
  if(lazy&&'IntersectionObserver'in window){el.style.backgroundImage='none';const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){start();io.disconnect()}},{rootMargin:'300px'});io.observe(el)}else start();
 }
 async function compress(file){
  const bitmap=await createImageBitmap(file);
  try{
   if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>60000000)throw Error('Imagem muito grande para processar. Use uma foto de até 60 megapixels.');
   const widths=[...new Set([Math.min(640,bitmap.width),Math.min(1600,bitmap.width)])],result=[];
   for(const width of widths){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(bitmap.height*width/bitmap.width);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    let blob;
    for(const quality of [.82,.76,.70]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(!blob||blob.type!=='image/webp')throw Error('Este navegador não conseguiu converter a foto em WebP.');if(blob.size<=550000)break}
    if(blob.size>1500000)throw Error('A foto ainda está muito pesada. Escolha uma imagem menor.');
    result.push({width,blob});canvas.width=canvas.height=1;
   }
   return result;
  }finally{bitmap.close()}
 }
 return {variants,set,activate,background,compress};
})();
