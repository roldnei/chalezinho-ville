import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';

const reference='f897a5b486b329b277cdc7834c71ef40913b468d';
test('capture issue 14 reference UI with the same synthetic data',async({page},testInfo)=>{
 for(const name of ['admin.js','property-pricing-calendar.js','property-pricing-calendar.css','admin-workspace.css']){
  const body=execFileSync('git',['show',`${reference}:${name}`],{encoding:'utf8'});
  await page.route(`**/${name}*`,route=>route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'application/javascript',body}));
 }
 await mkdir('docs/ux/issue-14',{recursive:true});
 await page.goto('/admin.html?view=properties');
 await expect(page.locator('[data-property-edit="2"]')).toBeVisible();
 await page.screenshot({path:`docs/ux/issue-14/properties-before-${testInfo.project.name}.png`,fullPage:true});
 await page.locator('[data-property-edit="2"]').click();
 await page.locator('[data-workspace="prices"]').click();
 await expect(page.locator('[data-price-grid] [data-day]').first()).toBeVisible();
 await page.locator('.admin-modal').evaluate(element=>element.scrollTop=0);
 await page.screenshot({path:`docs/ux/issue-14/prices-before-${testInfo.project.name}.png`,fullPage:true});
 await page.locator('[data-rules]').click();
 await expect(page.locator('[data-availability-tab="rules"]')).toBeVisible();
 await page.screenshot({path:`docs/ux/issue-14/rules-before-${testInfo.project.name}.png`,fullPage:true});
});
