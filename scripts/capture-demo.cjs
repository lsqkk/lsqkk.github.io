const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
let chromium;
try{({chromium}=require('playwright'));}catch{
  const root=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['root','-g'],{encoding:'utf8',shell:process.platform==='win32'}).trim();
  ({chromium}=createRequire(path.join(root,'package.json'))('playwright'));
}
const base=process.env.BASE_URL||'http://127.0.0.1:4321';
const output=path.resolve('docs/demo');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch();
 try{
  for(const [name,route,theme] of [['home','/','light'],['article','/posts/2026/2604','light'],['tools','/tool/','dark'],['games','/games/','light']]){
   const context=await browser.newContext({viewport:{width:1360,height:950},colorScheme:theme,reducedMotion:'reduce',deviceScaleFactor:1});
   // Capture the actual local build without sending authentication, analytics or media requests to external services.
   await context.route('**/*',request=>request.request().url().startsWith(base)||request.request().url().startsWith('data:')?request.continue():request.abort());
   const page=await context.newPage();
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
   if(response.status()!==200)throw new Error('Preview route failed: '+route);
   await page.waitForSelector(name==='article'?'.post-content':name==='home'?'.main-layout':'.catalog-grid');
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);
   await page.screenshot({path:path.join(output,name+'.jpg'),type:'jpeg',quality:85,fullPage:false});
   await context.close();
  }
  console.log('Captured 4 README demos in docs/demo');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
