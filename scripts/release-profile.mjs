export const DEV='pxfqmnhqodqyaaqeyjgr',PROD='irxsaladqhbzhkoaclxy';
export function releaseProfile(env){
 const profile=env.VILLE_RELEASE_PROFILE||'checkout-development';
 if(!['whatsapp','checkout-development'].includes(profile))throw Error('unknown_release_profile');
 const production=env.VERCEL_ENV==='production';
 if(production&&(profile!=='whatsapp'||env.VILLE_PRODUCTION_RELEASE!=='approved'))throw Error('Production requires an explicitly approved WhatsApp release');
 const ref=production?PROD:DEV;
 if(production&&new URL(env.VILLE_PUBLIC_SUPABASE_URL||'http://invalid').hostname!==PROD+'.supabase.co')throw Error('Production Supabase target mismatch');
 if(production&&!env.VILLE_PUBLIC_SUPABASE_KEY)throw Error('Production publishable key required');
 return {profile,ref,environment:production?'production':'development'};
}
