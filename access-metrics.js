(()=>{
 const C=window.CHALEZINHO_CONFIG;
 if(!C?.bookingEngine||navigator.webdriver||navigator.globalPrivacyControl||navigator.doNotTrack==="1")return;
 const page=location.pathname.split("/").pop()||"index.html";
 const pages=["index.html","reservar.html","imovel.html","chale-premium.html","chale-com-hidro.html","chale-romantico.html"];
 if(!pages.includes(page))return;
 try{
  const now=Date.now();let visit;
  try{visit=JSON.parse(sessionStorage.getItem("ville-access-session"))}catch{}
  if(!visit||typeof visit.id!=="string"||now-visit.last>30*60*1000)visit={id:"access:"+crypto.randomUUID()};
  visit.last=now;sessionStorage.setItem("ville-access-session",JSON.stringify(visit));
  const property_code=page==="imovel.html"?new URLSearchParams(location.search).get("codigo"):null;
  fetch(C.bookingEngine+"?action=track_access",{method:"POST",keepalive:true,
   headers:{"Content-Type":"application/json","X-Chalezinho-Env":C.environment},
   body:JSON.stringify({page,property_code,session_id:visit.id})}).catch(()=>{});
 }catch{/* Metrics never block browsing when storage or network is unavailable. */}
})();
