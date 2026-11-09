import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {checkoutCaptchaSettings,verifyCheckoutCaptcha} from '../supabase/functions/_shared/checkout-recaptcha.ts';

const env={
 RECAPTCHA_PROJECT_ID:'fixture-project',
 RECAPTCHA_SITE_KEY:'test_site_key_123456789',
 RECAPTCHA_API_KEY:'test_api_key_1234567890',
 RECAPTCHA_ALLOWED_HOSTS:'checkout.example.test, another.example.test',
};
const settings=checkoutCaptchaSettings(name=>env[name]);
const origin='https://checkout.example.test';
const action='checkout_payment';
const assessment=(tokenProperties={},score=0.5)=>Response.json({
 tokenProperties:{valid:true,action,hostname:'checkout.example.test',...tokenProperties},riskAnalysis:{score},
});

test('checkout requires complete provider settings, allowed HTTPS origin and token before requesting Google',async()=>{
 const unused=async()=>assert.fail('Google must not be called');
 assert.equal(checkoutCaptchaSettings(name=>name==='RECAPTCHA_API_KEY'?undefined:env[name]),null);
 assert.equal(await verifyCheckoutCaptcha(null,origin,'token',action,unused),'checkout_captcha_unavailable');
 for(const untrusted of [null,'http://checkout.example.test','https://checkout.example.test.attacker.test',origin+'/unexpected']){
  assert.equal(await verifyCheckoutCaptcha(settings,untrusted,'token',action,unused),'checkout_captcha_rejected');
 }
 for(const token of [null,'','a b','x'.repeat(8193)]){
  assert.equal(await verifyCheckoutCaptcha(settings,origin,token,action,unused),'checkout_captcha_required');
 }
});

test('checkout verifies an assessment using the action and hostname and a score of at least 0.5',async()=>{
 const allowed=await verifyCheckoutCaptcha(settings,origin,'fresh-token',action,async(url,options)=>{
  assert.equal(url,'https://recaptchaenterprise.googleapis.com/v1/projects/fixture-project/assessments');
  assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');
  assert.equal(options.headers['X-Goog-Api-Key'],env.RECAPTCHA_API_KEY);
  assert.deepEqual(JSON.parse(options.body),{event:{token:'fresh-token',siteKey:env.RECAPTCHA_SITE_KEY,expectedAction:action}});
  return assessment();
 });
 assert.equal(allowed,null);
 for(const response of [assessment({valid:false,invalidReason:'EXPIRED'}),assessment({valid:false,invalidReason:'DUPE'}),assessment({action:'post_booking_payment'}),assessment({hostname:'another.example.test'}),assessment({},0.49),assessment({},null),assessment({},1.1)]){
  assert.equal(await verifyCheckoutCaptcha(settings,origin,'token',action,async()=>response),'checkout_captcha_rejected');
 }
 assert.equal(await verifyCheckoutCaptcha(settings,origin,'token','post_booking_payment',async()=>assessment({action:'post_booking_payment'})),null);
});

test('assessment service or network errors block the payment safely',async()=>{
 for(const handler of [async()=>new Response('',{status:429}),async()=>new Response('invalid json'),async()=>{throw Error('network failure')} ]){
  assert.equal(await verifyCheckoutCaptcha(settings,origin,'token',action,handler),'checkout_captcha_unavailable');
 }
});

test('browser loads the SDK once and obtains a fresh token for each payment attempt',async()=>{
 const dom=new JSDOM('',{url:origin,runScripts:'outside-only'}), w=dom.window;
 try{
  w.eval(await readFile(new URL('../checkout-recaptcha.js',import.meta.url),'utf8'));
  await assert.rejects(w.VilleCheckoutCaptcha.token(null,action),/checkout_captcha_unavailable/);
  assert.equal(w.document.scripts.length,0);
  let calls=0;
  w.grecaptcha={enterprise:{ready:fn=>fn(),execute:async(key,options)=>[key,options.action,++calls].join(':')}};
  const first=w.VilleCheckoutCaptcha.token({site_key:env.RECAPTCHA_SITE_KEY},action);
  assert.equal(w.document.scripts.length,1);
  assert.match(w.document.scripts[0].src,/^https:\/\/www\.google\.com\/recaptcha\/enterprise\.js\?render=/);
  w.document.scripts[0].dispatchEvent(new w.Event('load'));
  assert.equal(await first,env.RECAPTCHA_SITE_KEY+':checkout_payment:1');
  assert.equal(await w.VilleCheckoutCaptcha.token({site_key:env.RECAPTCHA_SITE_KEY},'post_booking_payment'),env.RECAPTCHA_SITE_KEY+':post_booking_payment:2');
  assert.equal(w.document.scripts.length,1);
 }finally{dom.window.close()}
});
