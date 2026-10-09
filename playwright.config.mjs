import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:4173',screenshot:'only-on-failure',trace:'retain-on-failure',...(process.env.VILLE_TEST_BROWSER?{launchOptions:{executablePath:process.env.VILLE_TEST_BROWSER}}:{})},
 projects:[{name:'mobile',use:{viewport:{width:390,height:844}}},
  {name:'notebook',use:{viewport:{width:1366,height:768}}},
  {name:'desktop',use:{viewport:{width:1920,height:1080}}}],
 webServer:{command:'node scripts/finance-preview.mjs',url:'http://127.0.0.1:4173/admin.html',reuseExistingServer:true},
});
