// Account-bound persistent drafts and upload queue; no access instructions or
// private signed photo URLs are cached. Server is the source of completed work.
export async function offline(operation,key,value){
 return new Promise((resolve,reject)=>{const open=indexedDB.open('ville-cleaning-v1',1);open.onupgradeneeded=()=>open.result.createObjectStore('pending',{keyPath:'key'});open.onerror=()=>reject(Error('offline_storage_unavailable'));open.onsuccess=()=>{const db=open.result,tx=db.transaction('pending',operation==='get'||operation==='list'?'readonly':'readwrite'),s=tx.objectStore('pending');const req=operation==='get'?s.get(key):operation==='list'?s.getAll():operation==='delete'?s.delete(key):s.put({key,value});let result;req.onsuccess=()=>result=operation==='get'?req.result?.value:operation==='list'?req.result:undefined;tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(Error('offline_storage_unavailable'))}}});
}
export async function compressPhoto(file){
 if(!file||!file.type.startsWith('image/')||file.size>25000000)throw Error('invalid_photo');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 for(const quality of [.8,.65,.5,.35]){const data=canvas.toDataURL('image/jpeg',quality),base64=data.split(',')[1];if(base64.length<=699052)return {base64,content_type:'image/jpeg',preview:data};}throw Error('photo_too_large');
}
