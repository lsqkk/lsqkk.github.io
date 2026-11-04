const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
let playwright;
try { playwright=require('playwright'); } catch {
  const root=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['root','-g'],{encoding:'utf8',shell:process.platform==='win32'}).trim();
  playwright=createRequire(path.join(root,'package.json'))('playwright');
}
const base=process.env.BASE_URL || 'http://127.0.0.1:4321';
const out=path.resolve(process.env.UI_SCREENSHOT_DIR || 'test-results/ui-polish');
fs.mkdirSync(out,{recursive:true});
let passed=0;
const check=(name,value)=>{assert(value,name); passed++;};
const routes=['/','/posts/','/posts/about','/posts/2026/2615','/search?q=高考','/tool/','/games/','/a/','/blog/','/blog/dt/','/blog/log/','/blog/friends/','/blog/lyb/','/login/','/settings/','/tool/ref/','/tool/ocr/','/tool/typeflow/','/tool/audio2txt/','/tool/image-emoji/','/tool/calculator/','/tool/pomodoro/','/a/oj/','/404'];
(async()=>{
  const browser=await playwright.chromium.launch();
  try {
    // Block external services only in the geometry matrix: no network-dependent content claims.
    if (!process.env.UI_SKIP_MATRIX) for(const theme of ['light','dark']) {
      await Promise.all([320,390,768,1100,1440].map(async width=>{
        const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce'});
        await ctx.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:') ? route.continue() : route.abort());
        const page=await ctx.newPage();
        for(const route of routes) {
          await page.goto(base+route,{waitUntil:'domcontentloaded'});
          await page.waitForTimeout(140);
          const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
          check(`${route} fits ${width}px ${theme}`,geometry.scroll<=geometry.width+1);
          if(route==='/') {
            const result=await page.locator('.main-layout').evaluate(el=>({left:el.getBoundingClientRect().left+parseFloat(getComputedStyle(el).paddingLeft),rows:[...document.querySelectorAll('.index-log-item')].map(row=>{const badge=row.querySelector('.index-log-tag').getBoundingClientRect();const text=row.querySelector('.index-log-detail').getBoundingClientRect();return Math.abs(badge.top-text.top)<10 && badge.width<80;})}));
            check(`home has breathing room ${width} ${theme}`,result.left>=21);
            check(`update type stays beside description ${width} ${theme}`,result.rows.every(Boolean));
          }
          if(route==='/posts/about') {
            check(`hero title has no plate ${width} ${theme}`,await page.locator('.post-hero-title').evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'));
          }
          if(route==='/posts/2026/2615') {
            const rect=await page.locator('.post-content').boundingBox();
            check(`article gutter ${width} ${theme}`,rect.x>=21 && rect.x+rect.width<=width-21);
            check(`article has no gray wrapper ${width} ${theme}`,await page.locator('.post-main-column > .morenpost').evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'));
            if(width>1100) {
              const side=await page.locator('.post-sidebar-group').boundingBox();
              check(`TOC has own column ${width} ${theme}`,side.x>=rect.x+rect.width+25&&side.x+side.width<=width-21);
            }
          }
          if([390,1440].includes(width)&&['/','/posts/2026/2615','/posts/about','/tool/','/search?q=高考','/blog/dt/'].includes(route)) {
            await page.screenshot({path:path.join(out,route.replace(/[^a-z0-9]/gi,'_')+`-${width}-${theme}.png`)});
          }
        }
        await ctx.close();
      }));
      console.log('Geometry passed: '+theme);
    }

    const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
    await ctx.route('**/*',route=>route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page=await ctx.newPage(); const errors=[]; page.on('pageerror',err=>errors.push(err.message));
    await page.goto(base+'/posts/2026/2615');
    await page.waitForSelector('.chapter-tick');
    check('fresh reading has no spurious resume prompt',await page.locator('.reading-seam').count()===0);
    check('hidden back-to-top is removed from tab order',await page.locator('.back-to-top').getAttribute('tabindex')==='-1');
    await page.locator('.chapter-tick').nth(2).click();
    await page.waitForTimeout(250);
    check('chapter ruler moves to intended heading',await page.locator('.post-content h2').nth(2).evaluate(el=>Math.abs(el.getBoundingClientRect().top-88)<8));
    check('one active chapter',await page.locator('.chapter-tick[aria-current]').count()===1);
    await page.waitForTimeout(1700);
    await page.evaluate(()=>history.replaceState(null,'',location.pathname));
    await page.goto(base+'/tool/');
    await page.goto(base+'/posts/2026/2615');
    await page.waitForSelector('.reading-seam');
    check('return stitch does not jump automatically',await page.evaluate(()=>scrollY<100));
    await page.locator('.reading-seam button').first().click();
    check('return stitch resumes reading',await page.evaluate(()=>scrollY>240));
    check('return stitch dismisses after use',await page.locator('.reading-seam').count()===0);

    await page.locator('.sidebar-toggle').click();
    check('drawer opens with opaque surface',await page.locator('.post-sidebar-group').evaluate(el=>el.classList.contains('active')&&getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)'));
    check('drawer receives focus',await page.locator('.post-sidebar-close').evaluate(el=>el===document.activeElement));
    await page.keyboard.press('Shift+Tab');
    check('drawer traps reverse tab',await page.locator('.post-sidebar-group').evaluate(el=>el.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    check('Escape closes drawer and restores focus',await page.locator('.sidebar-toggle').evaluate(el=>el===document.activeElement&&el.getAttribute('aria-expanded')==='false'));
    await page.locator('.sidebar-toggle').click();
    await page.locator('.toc-item a').nth(1).click();
    check('choosing a heading closes drawer',await page.locator('.sidebar-toggle').getAttribute('aria-expanded')==='false');
    await page.locator('.sidebar-toggle').click();
    await page.setViewportSize({width:1440,height:900});
    await page.waitForTimeout(150);
    check('resizing releases scroll lock',await page.evaluate(()=>!document.body.classList.contains('sidebar-open')));
    const before=await page.locator('.post-content').boundingBox();
    await page.locator('.reading-measure').click();
    const after=await page.locator('.post-content').boundingBox();
    check('reading measure shortens lines',after.width<before.width-40);
    await page.locator('.reading-measure').click();
    check('reading measure restores lines',Math.abs((await page.locator('.post-content').boundingBox()).width-before.width)<2);
    await page.evaluate(()=>window.scrollTo(0,700)); await page.waitForTimeout(150);
    check('desktop back-to-top text fits',await page.locator('.back-to-top').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.clientWidth>80));
    await page.locator('.back-to-top').click();
    check('reduced motion back-to-top is immediate',await page.evaluate(()=>scrollY===0));
    await page.evaluate(()=>{
      const pre=document.createElement('pre'),code=document.createElement('code');code.textContent='long_column '.repeat(200);pre.append(code);document.querySelector('.post-content').append(pre);
    });
    await page.waitForTimeout(150);
    const overflow=page.locator('.post-content pre').last();
    check('overflow is keyboard focusable',await overflow.getAttribute('tabindex')==='0');
    check('overflow gets directional guidance',await overflow.evaluate(el=>!el.nextElementSibling.hidden&&el.nextElementSibling.textContent.includes('向右')));
    await overflow.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(100);
    check('overflow cue responds at far edge',await overflow.evaluate(el=>el.nextElementSibling.textContent.includes('右端')));

    // A stored signed-in profile exercises the actual avatar renderer without contacting auth.
    await page.evaluate(()=>{localStorage.setItem('github_user',JSON.stringify({login:'ui-review',name:'UI Review',avatar_url:location.origin+'/assets/img/touxiang.png'}));localStorage.setItem('nickname','UI Review');});
    await page.setViewportSize({width:390,height:844}); await page.goto(base+'/');
    await page.waitForSelector('.header-user .nav-user-trigger');
    check('avatar has circular transparent hit target',await page.locator('.header-user .user-pill').evaluate(el=>{const s=getComputedStyle(el);return parseFloat(s.borderTopWidth)===0&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.borderRadius==='50%'&&el.clientWidth>=44;}));
    await page.locator('.header-user .nav-user-trigger').click();
    await page.locator('.nav-user-menu').waitFor({state:'visible'});
    check('avatar tap opens menu',await page.locator('.nav-user-menu').isVisible());
    await page.keyboard.press('Escape');
    check('avatar menu closes with Escape',await page.locator('.header-user .nav-user-trigger').getAttribute('aria-expanded')==='false');
    await page.locator('#hamburgerMenu').click();
    await page.keyboard.press('Escape');
    check('mobile nav Escape restores focus',await page.locator('#hamburgerMenu').evaluate(el=>document.activeElement===el&&el.getAttribute('aria-expanded')==='false'));
    await page.goto(base+'/posts/OrangePi/4');
    await page.waitForSelector('.code-header');
    check('code controls work without CDN highlighter',await page.locator('.copy-code-btn').count()>0);
    check('code tokens keep monospace typography',await page.locator('pre code span').first().evaluate(el=>getComputedStyle(el).fontFamily.includes('monospace')));
    check('code tokens keep a distinct syntax color',await page.locator('pre code span[style]').first().evaluate(el=>getComputedStyle(el).color!==getComputedStyle(el.closest('pre')).color));
    await ctx.grantPermissions(['clipboard-read','clipboard-write']);
    await page.locator('.copy-code-btn').first().click();
    await page.waitForTimeout(100);
    check('code copy works without CDN highlighter',await page.locator('.copy-code-btn').first().innerText()==='已复制');
    await page.screenshot({path:path.join(out,'code-mobile-dark.png')});
    check('new reading and navigation workflows have no uncaught errors',errors.length===0);
    await ctx.close();
    console.log(`UI polish passed: ${passed} assertions. Screenshots: ${out}`);
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
