// This refactor is not approved for any shared or production database.
const protectedProject='irxsaladqhbzhkoaclxy';
export function assertFinanceDevelopment(projectUrl:string,environment:string|undefined){
 let url:URL;try{url=new URL(projectUrl)}catch{throw new Error('isolated_finance_environment_required')}
 if(environment!=='development'||url.hostname===`${protectedProject}.supabase.co`||
    !(['localhost','127.0.0.1','kong'].includes(url.hostname)||url.protocol==='https:'))
  throw new Error('isolated_finance_environment_required');
}
