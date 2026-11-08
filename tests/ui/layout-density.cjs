const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(require('node:child_process').execFileSync('npm.cmd',['root','-g'],{encoding:'utf8',shell:true}).trim(),'playwright'))}
const base=process.env.BASE_URL||'http://127.0.0.1:4321';
const out=path.resolve('test-results/layout-density');fs.mkdirSync(out,{recursive:true});
const totalPosts=JSON.parse(fs.readFileSync(path.resolve('posts/posts.json'),'utf8')).length;
let count=0;const check=(label,ok)=>{assert(ok,label);count++};
async function capture(page,name,width,theme){if([390,1440].includes(width))await page.screenshot({path:path.join(out,`${name}-${width}-${theme}.png`)});}
(async()=>{const browser=await playwright.chromium.launch();try{
for(const theme of ['light','dark'])for(const width of [320,390,768,1100,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/tool/','/games/','/a/','/blog/']){
    await p.goto(base+route);
    await p.waitForSelector('[data-pocket-pin]:not([hidden])');
    check('no overflow '+route+width+theme,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const first=await p.locator('[data-catalog-card]').first().boundingBox();
    check('first destination reaches first screen '+route+width+theme,first&&first.y<600);
    if(width>1000){
      const rail=await p.locator('.catalog-rail').boundingBox();
      check('search and shelf beside destinations '+route+width,rail.x>=first.x+first.width&&rail.y<first.y);
    }else{
      check('pocket initially collapsed '+route+width,await p.locator('[data-pocket-disclosure]').getAttribute('open')===null);
      const before=first.y;
      await p.locator('[data-pocket-disclosure] > summary').click();
      check('pocket opens accessibly',await p.locator('[data-pocket-shelf]').isVisible());
      check('pocket does not push destinations down',Math.abs((await p.locator('[data-catalog-card]').first().boundingBox()).y-before)<1);
      await p.keyboard.press('Escape');
      check('Escape closes and restores focus',await p.locator('[data-pocket-disclosure] > summary').evaluate(el=>el===document.activeElement)&&!await p.locator('[data-pocket-shelf]').isVisible());
    }
    if(width>768){
      const fonts=await p.evaluate(()=>({lang:getComputedStyle(document.querySelector('.header .language-trigger')).fontSize,search:getComputedStyle(document.querySelector('[data-site-search-open]')).fontSize}));
      check('shared header typography '+route,fonts.lang==='12px'&&fonts.search==='12.5px');
    }
    if(route==='/tool/')await capture(p,'catalogue',width,theme);
  }
  await p.goto(base+'/posts/2026/2604');await p.waitForSelector('.desk-post-bar');
  check('article fits '+width+theme,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('article begins earlier '+width+theme,(await p.locator('.post-content').boundingBox()).y<550);
  check('article operations use side rail on desktop',await p.locator('[data-post-reading-tools]').evaluate((el,wide)=>wide?!!el.closest('.post-sidebar-scroll'):!!el.closest('.post-main-column'),width>1100));
  if(width<=640)check('mobile reading tools stay on one row',await p.locator('.desk-post-bar').evaluate(el=>{const boxes=[...el.children].map(c=>c.getBoundingClientRect());return Math.max(...boxes.map(r=>r.top))-Math.min(...boxes.map(r=>r.top))<8}));
  await capture(p,'article',width,theme);
  await p.goto(base+'/posts/');await p.waitForSelector('#posts .post-item');
  check('article list starts above fold '+width+theme,(await p.locator('#posts .post-item').first().boundingBox()).y<400);
  check('article index fits '+width+theme,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<=1000)await p.locator('[data-post-filters] > summary').click();
  await p.locator('[data-target="tagFilterWrap"]').click();
  check('filter control announces expansion',await p.locator('[data-target="tagFilterWrap"]').getAttribute('aria-expanded')==='true');
  await p.locator('#tagFilter .tag-btn').nth(1).click();
  check('tag filter result has context',!(await p.locator('#postsResetFilters').getAttribute('hidden'))&&!(await p.locator('#postsResetFilters').evaluate(el=>el.hidden)));
  if(width<=1000)await p.keyboard.press('Escape');
  await p.locator('#postsResetFilters').click();
  check('reset restores all posts',await p.locator('#postsListStatus').innerText().then(t=>t.includes(String(totalPosts))));
  await capture(p,'posts',width,theme);
  for(const route of ['/search?q=学习','/blog/friends/','/settings','/desk/','/tool/decision/']){
    await p.goto(base+route);
    check('supporting page fits '+route+width+theme,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(route==='/blog/friends/'){
      await p.waitForSelector('.friend-card');
      check('friend cards start on first screen',(await p.locator('.friend-card').first().boundingBox()).y<350);
      check('copy info is keyboard accessible',await p.locator('.my-info-item').first().getAttribute('role')==='button');
      if(width===1440&&theme==='light') {
        await p.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}},configurable:true});document.execCommand=()=>false;});
        await p.locator('.my-info-item').first().focus();await p.keyboard.press('Enter');
        await p.waitForFunction(()=>document.querySelector('#copyToastText').textContent.includes('未成功'));
        check('clipboard failure reports an honest result',await p.locator('#copyToastText').innerText().then(t=>t.includes('未成功')));
      }
      await capture(p,'friends',width,theme);
    }
  }
  check('core pages have no uncaught errors '+width+theme,errors.length===0);
  await ctx.close();
}
// Resizing must move controls without duplication or losing functionality.
const ctx=await browser.newContext({viewport:{width:1440,height:900}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const page=await ctx.newPage();
await page.goto(base+'/posts/2026/2604');await page.waitForSelector('.desk-post-bar');await page.setViewportSize({width:390,height:900});
await page.waitForFunction(()=>!!document.querySelector('.post-main-column [data-post-reading-tools]'));
await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>!!document.querySelector('.post-sidebar-scroll [data-post-reading-tools]'));
check('responsive reading controls remain unique',await page.locator('.desk-post-bar').count()===1&&await page.locator('.reading-compass').count()===1);await ctx.close();
console.log(`Layout density passed: ${count} assertions. Screenshots: ${out}`);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
