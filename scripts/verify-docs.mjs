import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
async function walk(directory) {
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await walk(full));
    else if(entry.name.endsWith('.md'))result.push(full);
  }
  return result;
}
const documents=[path.join(root,'readme.md'),path.join(root,'posts/copyright.md'),...await walk(path.join(root,'src/docs'))];
const errors=[];let links=0,apiRefs=0;
function report(file,message){errors.push(path.relative(root,file)+': '+message);}
for(const file of documents) {
  const original=await fs.readFile(file,'utf8');
  const text=original.replace(/^\s*(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1[ \t]*$/gm,'');
  for(const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    let target=match[1].replace(/^<|>$/g,'');
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target))continue;
    target=target.split('#')[0].split('?')[0];if(!target)continue;
    // Root-relative page routes are production URLs, not repository files.
    if(target.startsWith('/')&&!target.startsWith('/assets/'))continue;
    try {target=decodeURIComponent(target);}catch{report(file,'Invalid URL encoding: '+target);continue;}
    const resolved=target.startsWith('/')?path.join(root,target.slice(1)):path.resolve(path.dirname(file),target);
    try {const stat=await fs.stat(resolved);if(!stat.isFile()&&!stat.isDirectory())throw new Error();links++;}
    catch{report(file,'Missing local link: '+target);}
  }
  for(const match of text.matchAll(/(?:^|[\s\x60(])api\/([a-z_-]+\.js)(?=[\s\x60),]|$)/g)) {
    apiRefs++;
    try{await fs.access(path.join(root,'api',match[1]));}catch{report(file,'Missing API source: api/'+match[1]);}
  }
}
const license=await fs.readFile(path.join(root,'LICENSE'),'utf8');
const readme=await fs.readFile(path.join(root,'readme.md'),'utf8');
const copyright=await fs.readFile(path.join(root,'posts/copyright.md'),'utf8');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(!license.includes('GNU AFFERO GENERAL PUBLIC LICENSE')||!readme.includes('AGPLv3')||!copyright.includes('AGPLv3')||pkg.license!=='AGPL-3.0-only')errors.push('License metadata and documentation must match LICENSE.');
for(const file of ['home.jpg','article.jpg','tools.jpg','games.jpg']){
  try {if((await fs.stat(path.join(root,'docs/demo',file))).size===0)throw new Error();}
  catch{errors.push('Missing or empty README demo: docs/demo/'+file);}
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log('Documentation check passed: '+documents.length+' documents, '+links+' local links, '+apiRefs+' API references and 4 demo images.');
