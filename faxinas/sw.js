// Offline navigation only. Private data and every API request stay on the network.
const CACHE='ville-cleaning-offline-v1',OFFLINE='/faxinas/offline.html';
self.addEventListener('install',event=>event.waitUntil((async()=>{const response=await fetch(OFFLINE,{cache:'reload'});if(!response.ok||response.redirected)throw Error('offline_shell_unavailable');const cache=await caches.open(CACHE);await cache.put(OFFLINE,response);})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ville-cleaning-offline-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||!url.pathname.startsWith('/faxinas/'))return;
 event.respondWith(fetch(request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(OFFLINE)||new Response('Sem conexão. Tente novamente quando a internet voltar.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});}));
});
