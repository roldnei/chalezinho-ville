import {releaseProfile,DEV} from './release-profile.mjs';
export function publicServiceTarget(env,host){
 if(env.VILLE_RELEASE_PROFILE==='whatsapp'){
  const release=releaseProfile(env);
  if(!['preview','production'].includes(env.VERCEL_ENV))throw Error('release_environment_required');
  return {endpoint:`https://${release.ref}.supabase.co/functions/v1/public-consultation`,environment:release.environment};
 }
 if(env.VERCEL_ENV!=='preview'||!(host==='chalezinho-ville-git-feature-romantic-fdde70-roldneicosta-4140.vercel.app'||/^chalezinho-ville-[a-z0-9]{9}-roldneicosta-4140\.vercel\.app$/.test(host)))throw Error('development_only');
 return {endpoint:`https://${DEV}.supabase.co/functions/v1/booking-engine`,environment:'development'};
}
