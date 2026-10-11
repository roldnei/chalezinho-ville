export const DEV='pxfqmnhqodqyaaqeyjgr',PROD='irxsaladqhbzhkoaclxy';
// Guest publishing stays available for DEV homologation independently of payments
// and Feelings. Production requires a separate reviewed social release.
export function releaseFeatures(release){
 return {feelings:release.profile==='checkout-development',guestPublications:release.environment==='development',social:release.environment==='development'};
}
export function releaseProfile(env){
 const profile=env.VILLE_RELEASE_PROFILE||'checkout-development';
 if(!['whatsapp','checkout-development'].includes(profile))throw Error('unknown_release_profile');
 const production=env.VERCEL_ENV==='production';
 if(production&&(profile!=='whatsapp'||env.VILLE_PRODUCTION_RELEASE!=='approved'))throw Error('Production requires an explicitly approved WhatsApp release');
 const ref=production?PROD:DEV;
 if(production&&new URL(env.VILLE_PUBLIC_SUPABASE_URL||'http://invalid').hostname!==PROD+'.supabase.co')throw Error('Production Supabase target mismatch');
 if(production){
  const key=env.VILLE_PUBLIC_SUPABASE_KEY||'';
  let publicKey=key.startsWith('sb_publishable_');
  if(!publicKey&&key.split('.').length===3){try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'}catch{}}
  if(!publicKey)throw Error('Production publishable or anon key required; server secrets cannot enter browser assets');
 }
 return {profile,ref,environment:production?'production':'development'};
}
