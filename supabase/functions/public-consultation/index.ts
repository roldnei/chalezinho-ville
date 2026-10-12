import {consultationAction,releaseTarget} from '../_shared/release-policy.ts';
const project=Deno.env.get('SUPABASE_URL')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-chalezinho-env','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method))return json({ok:false,error:'method_not_allowed'},405);
 try{
  const target=releaseTarget(project),url=new URL(req.url),body=req.method==='POST'?await req.json():{},raw=url.searchParams.get('action')||body.action||'config';
  // Legacy offer cards share the social service, never the payment engine.
  if(raw==='villegram'&&req.method==='POST'){
   const operation=body.operation||'list';
   if(!['list','like','comment','remove'].includes(operation))return json({ok:false,error:'consultation_operation_not_allowed'},403);
   const r=await fetch(project+'/functions/v1/villegram-content',{method:'POST',headers:{'Content-Type':'application/json',...(req.headers.get('authorization')?{Authorization:req.headers.get('authorization')!}:{})},body:JSON.stringify({operation:operation==='list'?'social':operation==='remove'?'remove_comment':operation,offer_id:body.offer_id,liked:body.liked,text:body.text,request_id:body.request_id,comment_id:body.comment_id}),signal:AbortSignal.timeout(15000)});
   return json(await r.json(),r.status);
  }
  let action;try{action=consultationAction(raw)}catch{return json({ok:false,error:'consultation_operation_not_allowed'},403)}
  url.searchParams.set('action',action);
  // Only the fixed allowlist above can reach the shared engine. Client-supplied
  // mode, URL, origin, method and persist flags cannot enable writes/payments.
  const r=await fetch(project+'/functions/v1/booking-engine?'+url.searchParams,{method:req.method,headers:{'Content-Type':'application/json','X-Chalezinho-Env':target},body:req.method==='POST'?JSON.stringify({...body,action}):undefined,signal:AbortSignal.timeout(60000)});
  const data=await r.json();return json(data,r.status);
 }catch{return json({ok:false,error:'consultation_unavailable'},503)}
});
