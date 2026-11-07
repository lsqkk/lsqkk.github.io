import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const verifier=fileURLToPath(new URL('../scripts/verify-dist.mjs',import.meta.url));
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'quark-sitemap-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const index='<sitemapindex><sitemap><loc>https://example.test/sitemap-0.xml</loc></sitemap></sitemapindex>';
  await fs.mkdir(path.join(root,'json'));
  await fs.mkdir(path.join(root,'posts'));
  await fs.mkdir(path.join(root,'tool'));
  const canonical='https://example.test/posts/test';
  const article='<body class="post-layout-page"><link rel="canonical" href="'+canonical+'"><meta property="og:url" content="'+canonical+'"><script type="application/ld+json">'+JSON.stringify({'@type':'BlogPosting',headline:'Test article',mainEntityOfPage:{'@id':canonical}})+'</script></body>';
  await Promise.all(Object.entries({
    'index.html':'<!doctype html><title>Test</title>',
    'posts/test.html':article,
    'sitemap-index.xml':index,
    'sitemap.xml':index,
    'sitemap-0.xml':'<urlset>'+['/','/tool/','/games/','/a/','/blog/'].map(route=>'<url><loc>https://example.test'+route+'</loc></url>').join('')+'</urlset>',
    'robots.txt':'User-agent: *\nSitemap: https://example.test/sitemap-index.xml\n',
    'settings.html':'<section id="appearance"></section><section id="notifications"></section><section id="ai"></section>',
    'tool/index.html':'<title>Tools</title>',
    'json/site-pages.json':JSON.stringify([{path:'tool',href:'/tool/',title:'Tools'},{path:'settings',href:'/settings',title:'Settings'},{path:'posts/test',href:'/posts/test',title:'Test'}])
  }).map(([file,content])=>fs.writeFile(path.join(root,file),content)));
  return {root,run:()=>spawnSync(process.execPath,[verifier,root],{encoding:'utf8'})};
}
test('complete sitemap artifacts pass verification',async t=>{
  const f=await fixture(t);const result=f.run();assert.equal(result.status,0,result.stderr);
});
test('a missing child sitemap fails the build',async t=>{
  const f=await fixture(t);await fs.unlink(path.join(f.root,'sitemap-0.xml'));assert.notEqual(f.run().status,0);
});
test('stale legacy sitemap aliases fail the build',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'sitemap.xml'),'<urlset/>');assert.notEqual(f.run().status,0);
});
test('robots pointing at an absent sitemap fails the build',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'robots.txt'),'Sitemap: https://example.test/missing.xml');assert.notEqual(f.run().status,0);
});
test('an empty sitemap cannot pass verification',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'sitemap-0.xml'),'<urlset/>');assert.notEqual(f.run().status,0);
});
test('an index must not read child files outside the build directory',async t=>{
  const f=await fixture(t);const xml='<sitemapindex><loc>https://example.test/%2e%2e%2foutside.xml</loc></sitemapindex>';
  await fs.writeFile(path.join(f.root,'sitemap-index.xml'),xml);await fs.writeFile(path.join(f.root,'sitemap.xml'),xml);assert.notEqual(f.run().status,0);
});

test('article metadata rejects a malformed canonical route',async t=>{
  const f=await fixture(t),file=path.join(f.root,'posts/test.html');
  await fs.writeFile(file,(await fs.readFile(file,'utf8')).replaceAll('/posts/test','/test'));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Incorrect article canonical/);
});
test('article metadata rejects invalid JSON-LD',async t=>{
  const f=await fixture(t),file=path.join(f.root,'posts/test.html');
  await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace(/<script[^>]*>[\s\S]*?<\/script>/,'<script type="application/ld+json">{broken}</script>'));
  assert.notEqual(f.run().status,0);
});
test('article metadata rejects inconsistent share URLs',async t=>{
  const f=await fixture(t),file=path.join(f.root,'posts/test.html');
  await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('property="og:url" content="https://example.test/posts/test"','property="og:url" content="https://example.test/wrong"'));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Open Graph URL differs/);
});
test('the search index rejects a directory URL for a flat HTML page',async t=>{
  const f=await fixture(t),file=path.join(f.root,'json/site-pages.json');
  const pages=JSON.parse(await fs.readFile(file,'utf8'));
  pages.find(page=>page.path==='posts/test').href='/posts/test/';
  await fs.writeFile(file,JSON.stringify(pages));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/File route must omit trailing slash/);
});
