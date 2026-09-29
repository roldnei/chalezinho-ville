import {test,expect} from '@playwright/test';
// Actual browser + actual UI, synthetic HTTP fixture. This is NOT PagBank homologation.
test('reservation financial detail and pending refund remain accurate at each viewport',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin.html?view=reservations');
 await page.locator('[data-reservation]').first().click();
 await expect(page.locator('#reservation-finance-summary')).toContainText('Recebido líquido');
 await page.locator('#reservation-detail [data-guarantee]').click();
 await expect(page.getByRole('heading',{name:'Caução da reserva'})).toBeVisible();
 await page.locator('[name="refund_amount"]').fill('100');
 await page.locator('[name="refund_reason"]').fill('Devolução fictícia para QA local');
 await page.getByRole('button',{name:'Solicitar estorno'}).click();
 await expect(page.locator('#guarantee-form .admin-form-message')).toContainText('Estorno pendente');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});


test('new experience credit dialog keeps service decision and payment confirmation separate',async({page},testInfo)=>{
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')calls.push(r.postDataJSON());});
 await page.goto('/admin.html?view=reservations');await page.locator('[data-reservation]').first().click();
 await page.getByRole('button',{name:'Retirar e calcular crédito'}).click();
 await expect(page.getByRole('heading',{name:'Retirar Experiência Romântica'})).toBeVisible();
 await page.locator('[name="reason"]').fill('Serviço não prestado ao hóspede');
 await page.getByRole('button',{name:'Calcular crédito',exact:true}).click();
 expect(calls.some(c=>c.action==='experience_credit')).toBe(false);
 await page.locator('[name="not_provided"]').check();
 await page.getByRole('button',{name:'Calcular crédito',exact:true}).click();
 await expect(page.locator('#admin-modal-content')).toContainText('499,00 a devolver');
 await expect(page.locator('#admin-modal-content')).toContainText('experiência não prestada');
 expect(calls.some(c=>c.action==='reservation_refund_action'&&c.operation==='approve')).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
 await page.screenshot({path:`docs/finance/qa/experience-credit-${testInfo.project.name}.png`,fullPage:true});
});
test('new policy editor saves commercial hours independently of accepted legacy window',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin.html?view=settings');
 const form=page.locator('.cancellation-policy-form');
 await expect(form.locator('[name="commercial_free_cancellation_hours"]')).toHaveValue('24');
 await expect(form.locator('[name="withdrawal_days"]')).toHaveValue('7');
 const request=page.waitForRequest(r=>r.method()==='POST'&&r.postDataJSON()?.action==='admin_cancellation_policy_action');
 await form.getByRole('button',{name:'Salvar nova versão'}).click();
 const data=(await request).postDataJSON();expect(data.commercial_free_cancellation_hours).toBe(24);expect(data.withdrawal_days).toBe(7);
 await expect(page.locator('.cancellation-policy-form .admin-form-message')).toContainText('Nova versão salva');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:`docs/finance/qa/commercial-policy-${testInfo.project.name}.png`,fullPage:true});
});
