import {publicServiceTarget} from '../scripts/public-service-target.mjs';
import {createPromotionService,selection} from '../scripts/promotion-banner-service.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).end();
  let target;try{target=publicServiceTarget(process.env,String(req.headers.host||''));}catch{return res.status(404).end();}
  const service=createPromotionService(target),params=new URL(req.url,'https://'+req.headers.host).searchParams;
  try{
    if(params.get('action')==='catalog')return res.status(200).json({properties:await service.catalog()});
    if(params.get('action')==='prices')return res.status(200).json({properties:await service.prices(selection(params))});
    if(params.get('action')==='photo'){const photo=await service.photo(params.get('url'));res.setHeader('Content-Type',photo.type);res.setHeader('Cache-Control','public,max-age=3600');return res.status(200).send(photo.body);}
    return res.status(404).json({message:'Consulta não encontrada.'});
  }catch(error){return res.status(error.status||502).json({message:error.status?error.message:'Não foi possível consultar o site agora. Tente novamente.'});}
}
