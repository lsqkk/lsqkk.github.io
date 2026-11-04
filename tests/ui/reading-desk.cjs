const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
let chromium;
try{({chromium}=require('playwright'));}catch{const root=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['root','-g'],{encoding:'utf8',shell:process.platform==='win32'}).trim();({chromium}=createRequire(path.join(root,'package.json'))('playwright'));}
const base=process.env.BASE_URL||'http://127.0.0.1:4321',out=path.resolve('test-results/reading-desk');
fs.mkdirSync(out,{recursive:true});let passed=0;
const check=(name,value)=>{assert(value,name);passed++;};
(async()=>{
 const browser=await chromium.launch();
 try{
  const block=ctx=>ctx.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  for(const theme of ['light','dark'])for(const width of [320,390,768,1100,1440]){
   const ctx=await browser.newContext({viewport:{width,height:960},colorScheme:theme,reducedMotion:'reduce'});await block(ctx);const page=await ctx.newPage();
   for(const route of ['/desk/','/','/posts/2025/2514','/posts/']){
    await page.goto(base+route);await page.waitForTimeout(180);
    check('fits '+route+' '+width+' '+theme,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(route==='/desk/')check('discovery renders '+width+' '+theme,await page.locator('.desk-match').count()>0);
    if([390,1440].includes(width)&&['/desk/','/'].includes(route))await page.screenshot({path:path.join(out,(route==='/desk/'?'desk':'home')+'-'+width+'-'+theme+'.png'),fullPage:true});
   }
   await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await block(ctx);const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>{if(/reading-desk|post-reading-desk/.test(error.stack||''))errors.push(error.message);});
  await page.goto(base+'/desk/?time=15');
  check('time query initializes slider',await page.locator('#desk-time').inputValue()==='15');
  check('recommendations fit the budget',await page.locator('.desk-match-time').evaluateAll(els=>els.every(el=>Number(el.firstChild.textContent)<=15)));
  const before=await page.locator('.desk-match h3').allTextContents();await page.locator('#desk-shuffle').click();
  check('shuffle offers another group',JSON.stringify(before)!==JSON.stringify(await page.locator('.desk-match h3').allTextContents()));
  await page.locator('.desk-match button').first().focus();await page.keyboard.press('Enter');check('keyboard focus remains on toggled bookmark',await page.locator('.desk-match button').first().evaluate(el=>el===document.activeElement));check('queue adds',await page.locator('.desk-queue-item').count()===1);
  await page.reload();check('queue persists',await page.locator('.desk-queue-item').count()===1);
  await page.locator('[data-add-path="make"]').click();const added=await page.locator('.desk-queue-item').count();
  await page.locator('[data-add-path="make"]').click();check('path add is idempotent',await page.locator('.desk-queue-item').count()===added);
  await page.locator('.desk-queue-controls button').first().click();check('read state updates',await page.locator('.desk-queue-item.is-complete').count()===1);
  const firstTitle=await page.locator('.desk-queue-item>a').first().textContent();await page.locator('.desk-queue-item').first().getByRole('button',{name:'下移：'+firstTitle,exact:true}).click();
  check('queue order changes',await page.locator('.desk-queue-item>a').nth(1).textContent()===firstTitle);
  await page.goto(base+'/posts/2025/2514');await page.waitForSelector('.desk-post-bar');
  check('article exposes its reading path',await page.locator('.desk-context li').count()===3);
  check('article saves without login',await page.locator('.desk-post-bar button').first().isVisible());
  await page.locator('.desk-post-bar button').first().click();
  check('article save changes state',await page.locator('.desk-post-bar button').first().getAttribute('aria-pressed')==='true');
  await page.locator('.post-content p').first().scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const p=[...document.querySelectorAll('.post-content p')].find(p=>p.firstChild?.nodeType===Node.TEXT_NODE&&p.firstChild.length>60);
    const range=document.createRange();range.setStart(p.firstChild,0);range.setEnd(p.firstChild,60);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.waitForSelector('.post-annotation-popover button[data-action="desk"]',{state:'visible'});
  await page.keyboard.press('Tab');check('selection menu accepts keyboard entry',await page.locator('.post-annotation-popover').evaluate(el=>el.contains(document.activeElement)));
  await page.locator('.post-annotation-popover button[data-action="desk"]').focus();await page.keyboard.press('Enter');
  check('local clip works while external services blocked',await page.locator('.desk-post-toast').textContent().then(text=>text.includes('摘录已留')));
  await page.goto(base+'/desk/#notes');check('clip appears on desk',await page.locator('.desk-note').count()===1);
  await page.locator('.desk-note textarea').fill('这段文字让我想到 <自己的经历>。');
  await page.reload();check('private thought persists',await page.locator('.desk-note textarea').inputValue()==='这段文字让我想到 <自己的经历>。');
  await page.screenshot({path:path.join(out,'desk-with-notes.png'),fullPage:true});
  await page.locator('.desk-note-bottom button').click();check('clip removal works',await page.locator('.desk-note').count()===0);
  await page.locator('#desk-status button').click();check('undo retains thought',await page.locator('.desk-note textarea').inputValue()==='这段文字让我想到 <自己的经历>。');
  const [md]=await Promise.all([page.waitForEvent('download'),page.locator('#desk-export-md').click()]);
  const content=fs.readFileSync(await md.path(),'utf8');
  check('Markdown exports source and note',content.includes(base+'/posts/2025/2514')&&content.includes('<自己的经历>'));
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#desk-export-json').click()]);
  const backupBuffer=fs.readFileSync(await backup.path());
  const other=await browser.newContext({viewport:{width:390,height:844}});await block(other);const restored=await other.newPage();await restored.goto(base+'/desk/');
  await restored.locator('#desk-import').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backupBuffer});
  check('backup restores queue and thought',await restored.locator('.desk-queue-item').count()>0&&await restored.locator('.desk-note textarea').inputValue()==='这段文字让我想到 <自己的经历>。');
  await restored.locator('#desk-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":2}')});
  await restored.waitForFunction(()=>document.getElementById('desk-status').textContent.includes('格式不正确'));
  check('invalid backup has useful feedback',await restored.locator('#desk-status').textContent().then(text=>text.includes('格式不正确')));
  check('invalid import preserves notes',await restored.locator('.desk-note').count()===1);
  await restored.locator('#desk-import').setInputFiles({name:'untrusted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,queue:[{url:'javascript:alert(1)',title:'unsafe'}],clips:[{url:'/posts/2025/2514',title:'<img src=x>',text:'<script>alert(1)</script>',note:'<img src=x>'}]}))});
  await restored.waitForFunction(()=>document.getElementById('desk-status').textContent.includes('已合并'));
  check('imported markup is rendered as text',await restored.locator('#desk-notes-list script,#desk-notes-list img').count()===0);
  const denied=await browser.newContext();await block(denied);
  await denied.addInitScript(()=>Storage.prototype.setItem=function(){throw new DOMException('denied','QuotaExceededError');});
  const failed=await denied.newPage();await failed.goto(base+'/desk/');await failed.locator('.desk-match button').first().click();
  check('storage denial is visible',await failed.locator('#desk-status').textContent().then(text=>text.includes('未能保存')));
  check('storage denial does not fake success',await failed.locator('.desk-queue-item').count()===0);
  await page.goto(base+'/');await page.waitForSelector('[data-desk-home-summary]:not([hidden])');check('home offers the next saved article',await page.locator('[data-desk-home-summary] a').getAttribute('href').then(href=>href.startsWith('/posts/')));
  check('new scripts have no uncaught errors',errors.length===0);
  await ctx.close();await other.close();await denied.close();
  const nojs=await browser.newContext({javaScriptEnabled:false});await block(nojs);const staticPage=await nojs.newPage();await staticPage.goto(base+'/desk/');check('reading paths work without scripts',await staticPage.locator('.desk-path li a').count()===9);check('no-script page hides inactive controls',!await staticPage.locator('.desk-workspace').isVisible());await nojs.close();
  console.log('Reading desk UI: '+passed+' checks passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
