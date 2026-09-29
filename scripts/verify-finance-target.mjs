import {readFile} from 'node:fs/promises';
import {assertFinanceDevelopment} from '../supabase/functions/_shared/finance/environment.ts';
if(process.env.VERCEL_ENV==='production')throw new Error('Production deployment is prohibited for this refactor');
const config=await readFile(new URL('../app-config.js',import.meta.url),'utf8');
const url=/supabaseUrl:\s*"([^"]+)"/.exec(config)?.[1];
assertFinanceDevelopment(url||'',process.env.FINANCE_ENVIRONMENT);
for(const endpoint of ['bookingEngine','refundEngine','guaranteeEngine']){
 const value=new RegExp(endpoint+':\\s*"([^"]+)"').exec(config)?.[1];
 if(!value||new URL(value).origin!==new URL(url).origin)throw new Error('Financial endpoints must use the isolated database');
}
console.log('Isolated development target verified.');
