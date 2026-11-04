const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require('playwright')}catch{const {execFileSync}=require('node:child_process');const root=execFileSync('npm.cmd',['root','-g'],{encoding:'utf8',shell:true}).trim();playwright=require(path.join(root,'playwright'))}
const base=process.env.BASE_URL||'http://127.0.0.1:4323';
(async()=>{const browser=await playwright.chromium.launch();let count=0;const check=(name,ok)=>{assert(ok,name);count++};try{
for(const theme of ['light','dark'])for(const width of [320,390,768,1440]){
const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce'});
await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const page=await ctx.newPage();
await page.goto(base+'/a/360/',{waitUntil:'domcontentloaded'});await page.waitForTimeout(300);
if(width<=768)await page.locator('#panelToggleBtn').click();
const rect=await page.locator('#leftPanel').boundingBox();check('360 panel fits '+width+' '+theme,rect&&rect.x>=15&&rect.x+rect.width<=width-15);
await page.locator('#collapseLeft').click();check('panel closes',!(await page.locator('#leftPanel').isVisible()));check('toggle state closes',await page.locator('#panelToggleBtn').getAttribute('aria-expanded')==='false');
await page.locator('#panelToggleBtn').click();check('panel reopens',await page.locator('#leftPanel').isVisible());check('toggle state opens',await page.locator('#panelToggleBtn').getAttribute('aria-expanded')==='true');
await page.locator('#mapToggleBtn').click();check('map expands',await page.locator('.map-card.expanded').count()===1);await page.locator('#mapToggleBtn').click();
if([390,1440].includes(width))await page.screenshot({path:path.resolve('test-results/ui-polish/360-'+width+'-'+theme+'.png')});
await page.goto(base+'/a/360/manage',{waitUntil:'domcontentloaded'});await page.waitForTimeout(150);check('manage fits '+width+' '+theme,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check('manage shares background',await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor===getComputedStyle(el).getPropertyValue('--page-bg').trim()||getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)'));
if([390,1440].includes(width))await page.screenshot({path:path.resolve('test-results/ui-polish/360-manage-'+width+'-'+theme+'.png'),fullPage:true});await ctx.close();
}
// Use the real local translation engine with deterministic service responses.
const ctx=await browser.newContext({viewport:{width:1440,height:900}});let attempts=0;
await ctx.route('**/*',async r=>{const u=r.request().url();if(u.startsWith(base))return r.continue();if(u.includes('/translate.json')){attempts++;const d=new URLSearchParams(r.request().postData());const texts=JSON.parse(d.get('text'));return r.fulfill({contentType:'application/json',body:JSON.stringify(attempts===1?{result:0,info:'rate limit',from:d.get('from'),to:d.get('to')}:{result:1,info:'SUCCESS',from:d.get('from'),to:d.get('to'),text:texts.map((_,i)=>'Translated passage '+i)})})}return r.abort()});
const page=await ctx.newPage();await page.goto(base+'/posts/about?lan=en',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.translate?.executeNumber>0,{},{timeout:40000});check('URL language retained',await page.locator('html').getAttribute('lang')==='en');check('actual article text replaced',await page.locator('.post-content').innerText().then(t=>t.includes('Translated passage')));check('throttled request retried',attempts>=2);check('code ignored by engine',await page.evaluate(()=>translate.ignore.tag.includes('code')));
await page.locator('.language-trigger:visible').click();await page.locator('[data-lang="chinese_simplified"]:visible').click();await page.waitForFunction(()=>document.documentElement.lang==='zh-CN'&&document.querySelector('.post-content')?.textContent.includes('我是蓝色奇夸克'));check('Chinese source restored',await page.locator('.post-content').innerText().then(t=>t.includes('我是蓝色奇夸克')));check('Chinese clears language parameter',!new URL(page.url()).searchParams.has('lan'));await ctx.close();
console.log('UI follow-up passed: '+count+' assertions');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
