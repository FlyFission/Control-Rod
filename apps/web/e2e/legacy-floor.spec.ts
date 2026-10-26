import {test,expect} from '@playwright/test';
import {mockFloorApi} from './floor-fixtures.js';
test('feature-off build preserves legacy navigation without mutations',async({page})=>{
 test.skip(process.env.THEME_TEST_LEGACY!=='true','Run with THEME_TEST_LEGACY=true');
 const api=await mockFloorApi(page);await page.goto('/floor');
 await expect(page.getByRole('heading',{name:'Floor',exact:true})).toBeVisible();
 await expect(page.locator('.floor-workbench')).toHaveCount(0);
 await page.getByRole('button',{name:/WP-101 AUT/}).click();await expect(page).toHaveURL(/\/packages\/WP-101/);
 expect(api.mutations).toEqual([]);
});
