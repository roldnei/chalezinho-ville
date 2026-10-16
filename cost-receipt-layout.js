// Reconstruct receipt rows using their baseline, not screen Y alone. On a
// tilted receipt a right-hand price can be lower than the next left-hand label.
export function receiptRows(result){
 const good=(result.items||[]).filter(i=>i.score>=.65&&i.poly?.length===4&&i.poly.every(p=>p.length===2&&p.every(Number.isFinite))&&i.text?.trim());
 const slopes=good.filter(i=>Math.abs(i.poly[1][0]-i.poly[0][0])>80).map(i=>(i.poly[1][1]-i.poly[0][1])/(i.poly[1][0]-i.poly[0][0])).filter(s=>Math.abs(s)<.5).sort((a,b)=>a-b),slope=slopes[Math.floor(slopes.length/2)]||0;
 const items=good.map(i=>{const xs=i.poly.map(p=>p[0]),ys=i.poly.map(p=>p[1]),cx=xs.reduce((a,b)=>a+b)/4,cy=ys.reduce((a,b)=>a+b)/4;return {...i,x:Math.min(...xs),right:Math.max(...xs),y:cy-slope*cx,h:(Math.hypot(i.poly[3][0]-i.poly[0][0],i.poly[3][1]-i.poly[0][1])+Math.hypot(i.poly[2][0]-i.poly[1][0],i.poly[2][1]-i.poly[1][1]))/2};}).sort((a,b)=>a.y-b.y||a.x-b.x);
 const rows=[];
 for(const item of items){let row=rows.find(r=>Math.abs(r.y-item.y)<=Math.min(r.h,item.h)*.45&&r.items.every(a=>a.right<=item.x+3||item.right<=a.x+3));if(!row){row={y:item.y,h:item.h,items:[]};rows.push(row);}row.items.push(item);row.y=row.items.reduce((s,i)=>s+i.y,0)/row.items.length;}
 return rows.sort((a,b)=>a.y-b.y).map(r=>{const items=r.items.sort((a,b)=>a.x-b.x);let text=items.map(i=>i.text).join(' ');
  // OCR often substitutes a decimal point. Only a labelled monetary row may
  // interpret it, and exactly two trailing digits are required (never IDs).
  if(/(?:VALOR\s+(?:TOTAL|A\s+PAGAR)|TOTAL\s+A\s+PAGAR|VALOR\s+PAGO|CART[AÃ]O|DINHEIRO)/i.test(text)&&!/(?:PARCELA|VENC|ITENS|TRIBUT|UNIT)/i.test(text))text=text.replace(/(?<![\d.,])(\d{1,7})\.(\d{2})(?!\d)/g,'$1,$2');
  return {text,items,confidence:Math.min(...items.map(i=>i.score))*100};
 });
}
export function layoutPage(result,rows,page=1){
 const {width,height}=result.image;
 const bbox=items=>({x0:Math.max(0,Math.min(...items.flatMap(i=>i.poly.map(p=>p[0])))),y0:Math.max(0,Math.min(...items.flatMap(i=>i.poly.map(p=>p[1])))),x1:Math.min(width,Math.max(...items.flatMap(i=>i.poly.map(p=>p[0])))),y1:Math.min(height,Math.max(...items.flatMap(i=>i.poly.map(p=>p[1]))))});
 return {page,width,height,lines:rows.map(r=>({text:r.text,confidence:r.confidence,bbox:bbox(r.items),words:r.items.map(i=>({text:i.text,confidence:i.score*100,bbox:bbox([i])}))}))};
}
export const normalizedName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// A complete, highly confident corporate heading can stand alone. Otherwise
// compare an independently segmented line; confidence is not a probability.
export function trustedSupplier(result,rows,secondName){
 if(!result.fields.supplier)return false;
 const row=rows.find(r=>r.text===result.evidence.supplier);
 return Boolean(row&&row.confidence>=98&&/\b(?:LTDA|LTDAME|EIRELI|EPP)\b/i.test(result.fields.supplier)||secondName&&normalizedName(secondName)===normalizedName(result.fields.supplier));
}
