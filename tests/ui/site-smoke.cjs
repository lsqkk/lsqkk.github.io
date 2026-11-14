const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
let playwright;
try { playwright=require('playwright'); } catch {
  const globalRoot=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['root','-g'],{encoding:'utf8',shell:process.platform==='win32'}).trim();
  playwright=createRequire(path.join(globalRoot,'package.json'))('playwright');
}
const base=process.env.BASE_URL || 'http://127.0.0.1:4321';
const out=path.resolve(process.env.UI_SCREENSHOT_DIR || 'test-results/site-ui');
fs.mkdirSync(out,{recursive:true});
let passed=0;
function check(name,value){assert(value,name);passed++;}
(async()=>{
  const browser=await playwright.chromium.launch();
  try {
    // Catalogues remain useful before scripts run, including on slow/disabled JS.
    for(const route of ['/tool/','/games/','/a/','/blog/']){
      const context=await browser.newContext({javaScriptEnabled:false});
      const page=await context.newPage();await page.goto(base+route);
      check(route+' has pre-rendered usable links',await page.locator('a.catalog-card').count()>0);
      check(route+' hides nonfunctional search without JS',!await page.locator('[data-catalog-toolbar]').isVisible());
      await context.close();
    }
    const context=await browser.newContext();const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/tool/',{waitUntil:'domcontentloaded'});
    check('deferred navigation mounts',await page.locator('.header').count()===1);
    await page.locator('[data-catalog-search]').fill('番茄');
    check('search returns the intended tool',await page.locator('[data-catalog-card]:visible').count()===1);
    await page.locator('[data-category="category-1"]').click();
    check('category combines with keyword',await page.locator('[data-catalog-empty]').isVisible());
    await page.locator('[data-catalog-reset]').click();
    const toolData=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/pages/tool/tool.json'),'utf8'));
    check('reset restores the catalogue',await page.locator('[data-catalog-card]:visible').count()===toolData.categories.reduce((sum,group)=>sum+group.tools.length,0));
    await page.goto(base+'/tool/?q=计算&category=category-1');
    check('shared filter URL restores the result',await page.locator('[data-catalog-card]:visible').count()===1);
    await page.locator('[data-catalog-search]').blur();await page.keyboard.press('/');
    check('keyboard shortcut focuses search',await page.locator('[data-catalog-search]').evaluate(el=>document.activeElement===el));
    await page.keyboard.press('Escape');
    check('Escape clears search',await page.locator('[data-catalog-search]').inputValue()==='');

    await page.goto(base+'/tool/calculator/',{waitUntil:'domcontentloaded'});
    await page.locator('#main-input').fill('2+3*4');
    await page.locator('button[onclick="calculate()"]').click();
    check('basic arithmetic works',await page.locator('#main-input').inputValue()==='14');
    await page.locator('#modeSelect').selectOption('derivative');
    check('advanced mode is visible',await page.locator('#derivativePanel').isVisible());
    await page.locator('#derivativeExpr').fill('x^3');
    await page.locator('button[onclick="calculateDerivative()"]').click();
    check('derivative calculation returns a result',(await page.locator('#result').innerText()).includes('3'));

    await page.goto(base+'/tool/pomodoro/');
    await page.locator('[data-time="3000"]').click();
    check('timer preset updates',await page.locator('#timer').innerText()==='50:00');
    await page.locator('#start').click();await page.waitForTimeout(1100);await page.locator('#stop').click();
    check('timer runs and pauses',await page.locator('#timer').innerText()==='49:59');
    await page.locator('#reset').click();check('timer resets',await page.locator('#timer').innerText()==='50:00');
    await context.close();

    const retired=JSON.parse(fs.readFileSync(path.join(__dirname,'../../src/config/retired-pages.json'),'utf8'));
    for(const item of retired){const response=await fetch(base+item.path+'/');const html=await response.text();check('retired route resolves '+item.path,response.ok&&html.includes('noindex')&&html.includes(item.to));}
    const sitemap=await (await fetch(base+'/sitemap-0.xml')).text();
    for(const item of retired)check('retired route excluded from sitemap '+item.path,!sitemap.includes(item.path+'</loc>')&&!sitemap.includes(item.path+'/</loc>'));

    for(const theme of ['light','dark'])for(const width of [390,1440]){
      const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:theme});const p=await ctx.newPage();
      for(const route of ['/','/tool/','/games/','/a/','/blog/','/tool/calculator/','/tool/pomodoro/','/tool/ref/','/tool/ocr/','/tool/test/','/tool/typeflow/','/games/xjtx/','/games/dati/']){
        await p.goto(base+route,{waitUntil:'domcontentloaded'});
        await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{timeout:3000});
        check(route+' fits '+width+' '+theme,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(width===390&&route==='/tool/'){
          const toggle=p.locator('#hamburgerMenu');
          const menu=p.locator('#mobilenavsidebar');
          await toggle.click();
          await menu.waitFor({state:'visible'});
          check('mobile navigation indicates the current page in '+theme,await menu.locator('[aria-current="page"]').count()===1);
          check('settings and login stay in the top bar',await menu.locator('a[href*="/settings"], a[href*="/login"]').count()===0);
          await p.evaluate(()=>window.scrollTo(0,250));
          await p.waitForFunction(()=>scrollY>=150);
          await toggle.click();
          await menu.waitFor({state:'hidden'});
          check('top bar toggle still closes the menu after scrolling',await toggle.getAttribute('aria-expanded')==='false');
        }
        if(['/tool/','/games/'].includes(route)) await p.screenshot({path:path.join(out,route.replaceAll('/','_')+'-'+width+'-'+theme+'.png')});
      }
      await ctx.close();
    }
    check('primary workflows have no uncaught errors',errors.length===0);
    console.log('UI smoke passed: '+passed+' assertions. Screenshots: '+out);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
