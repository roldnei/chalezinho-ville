import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const source=name=>readFile(new URL('../../'+name,import.meta.url),'utf8');
test.use({hasTouch:true,isMobile:true});
async function setup(page,{mode='signup',response='success'}={}){
 await page.addInitScript(({response})=>{
  window.authCalls=[];window.authResponse=response;
  const invoke=async(method,input)=>{
   window.authCalls.push({method});
   await new Promise(resolve=>setTimeout(resolve,120));
   if(window.authResponse==='network')throw {name:'AuthRetryableFetchError',message:'Failed to fetch'};
   if(window.authResponse==='server')return {error:{name:'AuthRetryableFetchError',status:500,message:'Database error saving new user'}};
   if(window.authResponse==='rate')return {error:{status:429,code:'over_email_send_rate_limit'}};
   if(window.authResponse==='credentials')return {error:{code:'invalid_credentials'}};
   if(window.authResponse==='expired')return {error:{code:'otp_expired'}};
   return {data:{session:null},error:null};
  };
  window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'fixture',bookingEngine:location.origin+'/engine',environment:'production',releaseProfile:'whatsapp'};
  window.VilleSession={remembered:()=>false,choose(){}};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signUp:input=>invoke('signup',input),signInWithPassword:input=>invoke('login',input),resetPasswordForEmail:input=>invoke('recover',input),updateUser:input=>invoke('reset',input),verifyOtp:input=>invoke('otp',input),resend:input=>invoke('resend',input)}})};
 },{response});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice(1);
  if(url.hostname!=='127.0.0.1'||path==='app-config.js')return route.fulfill({contentType:'application/javascript',body:''});
  if(path==='engine')return route.fulfill({json:{ok:true}});
  if(!['auth.html','auth.js','auth-bootstrap.js','styles.css','ui-controls.css'].includes(path))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html',body:await source(path)});
 });
 await page.goto('http://127.0.0.1:4173/auth.html?mode='+mode+'&return=conta.html');
 await expect(page.locator('#pane-'+mode+' button[type=submit]')).toBeEnabled();
}
async function validSignup(page){for(const[id,value]of Object.entries({'signup-name':'Pessoa Teste','signup-phone':'(27) 90000-0000','signup-document-number':'11144477735','signup-email':'qa@example.test','signup-password':'only-fixture-123'}))await page.locator('#'+id).fill(value)}
const calls=page=>page.evaluate(()=>window.authCalls.length);
test('invalid signup fields never reach the authentication service',async({page})=>{
 await setup(page);const submit=page.locator('#pane-signup button[type=submit]');
 await submit.click();expect(await calls(page)).toBe(0);await expect(page.locator('#auth-message')).toContainText('obrigatórios');
 for(const[id,value,notice]of [
  ['signup-name','   ','nome completo'],['signup-phone','abcdef','WhatsApp válido'],['signup-phone','123','WhatsApp válido'],['signup-phone','00000000000','WhatsApp válido'],
  ['signup-document-number','11111111111','CPF'],['signup-document-number','11144477734','CPF'],['signup-document-number','abc11144477735','CPF'],
  ['signup-email','nao-email','e-mail válido'],['signup-email','pessoa@localhost','e-mail válido'],['signup-email','pessoa @exemplo.com','e-mail válido'],['signup-password','123','8 caracteres']]){
  await validSignup(page);await page.locator('#'+id).fill(value);await submit.click();expect(await calls(page)).toBe(0);await expect(page.locator('#auth-message')).toContainText(notice);
 }
});
test('passport and issuing country are checked before signup',async({page})=>{
 await setup(page);await validSignup(page);await page.locator('#signup-document-type').selectOption('passport');await page.locator('#signup-document-number').fill('ABC');await page.locator('#signup-country').fill('US');await page.locator('#pane-signup button[type=submit]').click();expect(await calls(page)).toBe(0);await expect(page.locator('#auth-message')).toContainText('passaporte');
 await page.locator('#signup-document-number').fill('AB123456');await page.locator('#signup-country').fill('1!');await page.locator('#pane-signup button[type=submit]').click();expect(await calls(page)).toBe(0);
 await page.locator('#signup-country').fill('US');await page.locator('#pane-signup button[type=submit]').click();await expect(page.locator('#pane-confirm')).toBeVisible();expect(await calls(page)).toBe(1);
});
test('repeated signup submits once and opens confirmation without losing the return destination',async({page})=>{
 await setup(page);await validSignup(page);await page.locator('#pane-signup button[type=submit]').dblclick();await expect(page.locator('#pane-confirm')).toBeVisible();expect(await calls(page)).toBe(1);await expect(page.locator('#confirmation-state')).toContainText('enviado');await expect(page.locator('#confirmation-resend')).toBeDisabled();
 await page.reload();await expect(page.locator('#pane-confirm')).toBeVisible();expect(await calls(page)).toBe(0);expect(page.url()).toContain('return=conta.html');
});
test('server rejection is not shown as a network error and retry retains the form',async({page})=>{
 await setup(page,{response:'server'});await validSignup(page);await page.locator('#pane-signup button[type=submit]').click();await expect(page.locator('#auth-message')).toContainText('e-mail ou documento');await expect(page.locator('#auth-message')).not.toContainText('conexão');await expect(page.locator('#signup-email')).toHaveValue('qa@example.test');await expect(page.locator('#pane-signup button[type=submit]')).toBeEnabled();
 await page.locator('[data-auth-mode=login]').first().click();await expect(page.locator('#auth-message')).toBeEmpty();await expect(page.locator('#pane-login')).toBeVisible();
});
test('rate limiting does not falsely claim a confirmation email was sent',async({page})=>{
 await setup(page,{response:'rate'});await validSignup(page);await page.locator('#pane-signup button[type=submit]').click();await expect(page.locator('#pane-confirm')).toBeVisible();await expect(page.locator('#confirmation-state')).toContainText('temporariamente limitado');await expect(page.locator('#confirmation-state')).not.toContainText('enviado');
 await page.locator('#confirmation-code').fill('123');await page.locator('#confirmation-code-form button').click();expect(await calls(page)).toBe(1);
 await page.evaluate(()=>window.authResponse='expired');await page.locator('#confirmation-code').fill('123456');await page.locator('#confirmation-code-form button').click();await expect(page.locator('#confirmation-feedback')).toContainText('não foi confirmado');
});
test('login separates invalid input, rejected credentials and connection failure',async({page})=>{
 await setup(page,{mode:'login',response:'credentials'});await page.locator('#login-email').fill('bad');await page.locator('#login-password').fill('fixture');await page.locator('#pane-login button[type=submit]').click();expect(await calls(page)).toBe(0);
 await page.locator('#login-email').fill('qa@example.test');await page.locator('#pane-login button[type=submit]').click();await expect(page.locator('#auth-message')).toContainText('E-mail ou senha incorretos');
 await page.evaluate(()=>window.authResponse='network');await page.locator('#pane-login button[type=submit]').click();await expect(page.locator('#auth-message')).toContainText('senha ainda não foi validada');await expect(page.locator('#login-password')).toHaveValue('fixture');
});
test('password recovery prevents duplicates, catches network failures and permits retry',async({page})=>{
 await setup(page,{mode:'recover',response:'network'});await page.locator('#recover-email').fill('invalid');await page.locator('#pane-recover button[type=submit]').click();expect(await calls(page)).toBe(0);
 await page.locator('#recover-email').fill('qa@example.test');await page.locator('#pane-recover button[type=submit]').dblclick();await expect(page.locator('#auth-message')).toContainText('Confira sua conexão');expect(await calls(page)).toBe(1);await expect(page.locator('#pane-recover button[type=submit]')).toBeEnabled();
 await page.evaluate(()=>window.authResponse='success');await page.locator('#pane-recover button[type=submit]').click();await expect(page.locator('#auth-message')).toContainText('Se o e-mail estiver cadastrado');
});
test('reset catches failures and blocks short passwords and duplicate requests',async({page})=>{
 await setup(page,{mode:'reset',response:'network'});await page.locator('#reset-password').fill('123');await page.locator('#pane-reset button[type=submit]').click();expect(await calls(page)).toBe(0);
 await page.locator('#reset-password').fill('only-fixture-123');await page.locator('#pane-reset button[type=submit]').dblclick();await expect(page.locator('#auth-message')).toContainText('Confira sua conexão');expect(await calls(page)).toBe(1);await expect(page.locator('#pane-reset button[type=submit]')).toBeEnabled();
});
test('all authentication panels fit phones and production has no development or payment warning',async({page})=>{
 await setup(page);for(const width of [320,390,430]){await page.setViewportSize({width,height:844});for(const mode of ['login','signup','recover']){await page.locator('[data-auth-mode=login]').first().click();if(mode!=='login')await page.locator('[data-auth-mode='+mode+']').first().click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('body')).not.toContainText('ÁREA DO HÓSPEDE · DESENVOLVIMENTO');await expect(page.locator('[data-online-payment-note]:visible')).toHaveCount(0)}}
});

test('repeated phone digits, numeric names and invalid passport are rejected',async({page})=>{
 await setup(page);const button=page.locator('#pane-signup button[type=submit]');
 for(const [id,value] of [['signup-phone','00000000000'],['signup-phone','11111111111'],['signup-name','123456']]){
  await validSignup(page);await page.locator('#'+id).fill(value);await button.click();expect(await calls(page)).toBe(0);
 }
 await validSignup(page);await page.locator('#signup-document-type').selectOption('passport');
 await page.locator('#signup-country').fill('1!');await page.locator('#signup-document-number').fill('ABC12345');await button.click();expect(await calls(page)).toBe(0);
 await page.locator('#signup-country').fill('US');await page.locator('#signup-document-number').fill('@@@');await button.click();expect(await calls(page)).toBe(0);
});

test('login and recovery reject invalid email before reaching authentication',async({page})=>{
 for(const mode of ['login','recover']){
  await setup(page,{mode});const button=page.locator('#pane-'+mode+' button[type=submit]');
  if(mode==='login')await page.locator('#login-password').fill('fixture-only-123');
  for(const value of ['', 'invalid', 'a@b', 'a@@example.com']){
   await page.locator('#'+mode+'-email').fill(value);await button.click();expect(await calls(page)).toBe(0);
  }
 }
});
