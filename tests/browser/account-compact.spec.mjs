import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const source=name=>readFile(new URL('../../'+name,import.meta.url),'utf8');
test.use({hasTouch:true,isMobile:true});
async function fixture(page,{admin=false,publicProfile=true,query=''}={}){
 await page.addInitScript(({admin,publicProfile})=>{
  const profile=publicProfile?{id:'qa',display_name:'Ana Clara',handle:'ana_clara',is_public:true,bio:'Compartilho os pequenos momentos que fazem uma viagem valer a pena. ✨',avatar_url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="teal"/></svg>'}:null;
  window.fixtureState={profile,allowed:true,publications:[],notifications:[],mentions:[],invites:[],signOuts:0};
  window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'qa',bookingEngine:location.origin+'/engine',environment:'production',releaseProfile:'whatsapp',features:{guestPublications:true}};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'qa',user:{id:'qa',email:'qa@example.test',user_metadata:{full_name:'Nome da conta'}}}}}),signOut:async()=>{window.fixtureState.signOuts++}},from:table=>{
   const result={data:table==='profiles'?{full_name:'Nome da conta',role:admin?'admin':'guest',phone:''}:[]};
   const chain={select(){return this},update(){return this},eq(){return this},order(){return this},maybeSingle:async()=>result,then:resolve=>Promise.resolve(result).then(resolve)};return chain;
  }})};
 },{admin,publicProfile});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice(1);
  if(url.hostname!=='127.0.0.1'||path==='app-config.js')return route.fulfill({contentType:'application/javascript',body:''});
  if(path==='engine'||path==='functions/v1/villegram-content'){
   const input=route.request().postDataJSON();
   if(input.operation==='community_me')return route.fulfill({json:{ok:true,...await page.evaluate(()=>window.fixtureState)}});
   if(input.operation==='community_save_profile')await page.evaluate(value=>{window.fixtureState.profile={...window.fixtureState.profile,...value}},input.profile);
   return route.fulfill({json:{ok:true,requests:[],payment_settings:{},purposes:[],products:[],offers:[],properties:[]}});
  }
  if(path==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>Feed de teste</body></html>'});
  if(!/^[a-zA-Z0-9._/-]+$/.test(path))return route.fulfill({status:404,body:''});
  try{return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':'text/html',body:await source(path)})}catch{return route.fulfill({status:404,body:''})}
 });
 await page.goto('http://127.0.0.1:4173/conta.html'+query);
 await expect(page.locator('#account-name')).toHaveText(publicProfile?'Ana Clara':'Nome da conta');
 await expect(page.locator('#community-status')).toBeEmpty();
}
test('one personal header fits narrow phones and brings the profile into the first screen',async({page})=>{
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await fixture(page);
  await expect(page.locator('h1:visible')).toHaveCount(1);await expect(page.locator('#account-avatar img')).toHaveCount(1);
  await expect(page.locator('.account-hero')).toHaveCount(0);await expect(page.locator('.account-mode-nav')).toHaveCount(0);
  await expect(page.locator('#account-menu')).toBeHidden();await expect(page.locator('#account-email')).toBeHidden();
  const top=await page.locator('.account-topbar').boundingBox(),bio=await page.locator('.community-bio').boundingBox(),tabs=await page.locator('.community-tabs').boundingBox();
  expect(top.y).toBe(0);expect(top.height).toBeLessThanOrEqual(88);expect(bio.y-top.height).toBeLessThanOrEqual(20);expect(tabs.y+tabs.height).toBeLessThan(400);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('account menu keeps reservations, personal data, public profile editing and logout usable',async({page})=>{
 await fixture(page);
 const menu=page.locator('#account-menu'),toggle=page.locator('#account-menu-toggle');
 await toggle.tap();await expect(menu).toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#ops-link')).toBeHidden();await expect(page.locator('#experience-admin-link')).toBeHidden();
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(toggle).toBeFocused();
 await toggle.tap();await menu.getByRole('button',{name:'Minhas reservas',exact:true}).tap();
 await expect(page.locator('#account-private')).toBeVisible();await expect(page.locator('#community-root')).toBeHidden();await expect(menu).toBeHidden();expect(new URL(page.url()).hash).toBe('#reservas');
 await toggle.tap();await menu.getByRole('button',{name:'Dados da conta',exact:true}).tap();await expect(page.locator('#profile-name')).toBeFocused();expect(new URL(page.url()).hash).toBe('#dados');
 await toggle.tap();await menu.getByRole('button',{name:'Meu Ville Moments',exact:true}).tap();await expect(page.locator('#community-root')).toBeVisible();
 await page.locator('#community-edit-profile').tap();await page.locator('[name=display_name]').fill('Novo nome');await page.locator('#community-profile-form button[type=submit]').tap();await expect(page.locator('#account-name')).toHaveText('Novo nome');
 await toggle.tap();await menu.getByRole('button',{name:'Sair',exact:true}).tap();await page.waitForURL('**/auth.html');
});
test('administrator links remain in the menu and direct reservation links keep their entry point',async({page})=>{
 await fixture(page,{admin:true,query:'?charge=example'});await expect(page.locator('#account-private')).toBeVisible();
 await page.locator('#account-menu-toggle').tap();await expect(page.locator('#ops-link')).toBeVisible();await expect(page.locator('#experience-admin-link')).toBeVisible();
 await page.locator('#account-menu-toggle').tap();await expect(page.locator('#ops-link')).toBeHidden();
});
test('a guest without a public profile uses the account name and can create a profile',async({page})=>{
 await fixture(page,{publicProfile:false});await expect(page.locator('#account-handle')).toBeHidden();
 await page.locator('#community-edit-profile').tap();await expect(page.locator('#community-profile-form')).toBeVisible();
 await page.locator('#account-menu-toggle').tap();await page.locator('#account-menu').getByRole('button',{name:'Dados da conta',exact:true}).tap();
 await page.locator('#profile-name').fill('Nome atualizado');await page.locator('#profile-form button').tap();await expect(page.locator('#account-name')).toHaveText('Nome atualizado');
 await page.evaluate(()=>window.VillegramAccount.identity({display_name:'<script>alert(1)</script>'},'social'));
 await expect(page.locator('#account-name')).toHaveText('<script>alert(1)</script>');await expect(page.locator('#account-name script')).toHaveCount(0);
});
