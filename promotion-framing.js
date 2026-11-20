(function(root){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function geometry(image,frame,state){
    const scale=Math.max(frame.w/image.w,frame.h/image.h)*state.zoom;
    const w=image.w*scale,h=image.h*scale;
    return {w,h,ox:(w-frame.w)*state.x/100,oy:(h-frame.h)*state.y/100};
  }
  function transform(image,frame,state,start,end,factor=1){
    const zoom=clamp(state.zoom*factor,1,2.5),old=geometry(image,frame,state);
    const next=geometry(image,frame,{...state,zoom}),ratio=zoom/state.zoom;
    const ox=clamp((old.ox+start.x)*ratio-end.x,0,Math.max(0,next.w-frame.w));
    const oy=clamp((old.oy+start.y)*ratio-end.y,0,Math.max(0,next.h-frame.h));
    return {x:next.w>frame.w+.001?ox/(next.w-frame.w)*100:50,
      y:next.h>frame.h+.001?oy/(next.h-frame.h)*100:50,zoom};
  }
  function sharedPhotos(properties){
    const shared=[];
    for(const row of properties.filter(row=>['CH2','CH3'].includes(row.code)))
      for(const photo of row.photos){
        const found=shared.find(other=>(other.original||other.url)===(photo.original||photo.url));
        if(found)found.aliases.push(photo.url);else shared.push({...photo,aliases:[photo.url]});
      }
    return properties.map(row=>['CH2','CH3'].includes(row.code)?{...row,photos:shared,allowedPhotos:shared.flatMap(photo=>photo.aliases)}:row);
  }
  function motionState(state,progress,index=0){
    const phase=clamp(progress,0,1),wave=(1-Math.cos(2*Math.PI*phase))/2,direction=index%2===0?1:-1;
    return {...state,x:clamp(state.x+3*wave*direction,0,100),y:clamp(state.y-2*wave*direction,0,100),zoom:state.zoom*(1+.065*wave)};
  }
  function drawMotionPhotos(ctx,frames,progress){
    frames.forEach((frame,index)=>{
      if(!frame.image)return;
      const image=frame.image,state=motionState(frame.state,progress,index);
      const crop=geometry({w:image.naturalWidth||image.width,h:image.naturalHeight||image.height},frame,state);
      ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.w,frame.h,13);ctx.clip();
      ctx.drawImage(image,frame.x-crop.ox,frame.y-crop.oy,crop.w,crop.h);ctx.restore();
    });
  }
  root.PriceVilleBannerFraming={geometry,transform,sharedPhotos,motionState,drawMotionPhotos};
})(typeof window==='undefined'?globalThis:window);
