import {eligiblePublication} from './villegram-publications.ts';
import {communityPublic} from './villegram-community.ts';
import {commercialItem} from './release-policy.ts';

// Resolve one public Trip, including guest expiry and profile consent, before
// signing only its selected image/video poster. Never expose private media.
export async function publicPublicationShare(ctx:any,id:unknown){
 const fail=(status:number)=>({status,body:{ok:false,error:'publication_unavailable'}});
 if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return fail(400);
 const r=await ctx.db.from('villegram_publications').select('*').eq('id',id).eq('status','published').maybeSingle();
 if(r.error)throw Error('share_unavailable');if(!r.data)return fail(404);
 const p=r.data,c=await ctx.catalog(true);
 if(ctx.production&&!commercialItem(p)||!eligiblePublication(p,c.properties,c.products,c.offers))return fail(404);
 if(!(await communityPublic(ctx.db,[p])).length)return fail(404);
 const cover=p.media?.[p.cover_index||0];
 if(!cover)return fail(404);
 const image=cover.kind==='video'?{kind:'photo',path:cover.poster_path}:{kind:'photo',path:cover.path,url:cover.url};
 let cover_url=null;
 if(image.path||image.url){const signed=await ctx.resolveMedia([{media:[image]}]);cover_url=signed[0]?.media[0]?.url||null;}
 return {status:200,body:{ok:true,publication:{id:p.id,title:p.title,description:p.caption,cover_url,cover_alt:cover.alt||p.title,updated_at:p.updated_at}}};
}
