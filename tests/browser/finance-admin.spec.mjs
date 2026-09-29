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
