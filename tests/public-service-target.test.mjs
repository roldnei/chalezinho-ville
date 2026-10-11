import {test} from 'node:test';import assert from 'node:assert/strict';import {publicServiceTarget} from '../scripts/public-service-target.mjs';
test('public proxies use fixed consultation target and require production approval',()=>{
 const preview=publicServiceTarget({VERCEL_ENV:'preview',VILLE_RELEASE_PROFILE:'whatsapp'},'preview.example');assert.match(preview.endpoint,/pxfqmnhqodqyaaqeyjgr.*public-consultation$/);
 assert.throws(()=>publicServiceTarget({VERCEL_ENV:'production',VILLE_RELEASE_PROFILE:'whatsapp'},'chalezinhoville.com.br'));
 const production=publicServiceTarget({VERCEL_ENV:'production',VILLE_RELEASE_PROFILE:'whatsapp',VILLE_PRODUCTION_RELEASE:'approved',VILLE_PUBLIC_SUPABASE_URL:'https://irxsaladqhbzhkoaclxy.supabase.co',VILLE_PUBLIC_SUPABASE_KEY:'sb_publishable_fixture'},'chalezinhoville.com.br');assert.match(production.endpoint,/irxsaladqhbzhkoaclxy.*public-consultation$/);
 assert.throws(()=>publicServiceTarget({VERCEL_ENV:'production',VILLE_RELEASE_PROFILE:'checkout-development'},'chalezinhoville.com.br'));
});
