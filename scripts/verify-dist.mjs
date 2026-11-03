import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2] || 'dist');
const read=relative=>fs.readFile(path.join(root,relative),'utf8');
const locs=xml=>[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].replaceAll('&amp;','&'));
async function main() {
  await read('index.html');
  const index=await read('sitemap-index.xml');
  assert(index.includes('<sitemapindex'),'Missing sitemap index');
  assert.equal(await read('sitemap.xml'),index,'Legacy sitemap alias must match the index');
  const children=locs(index);
  assert(children.length>0,'Sitemap index has no children');
  const urls=[];
  for(const child of children) {
    const pathname=decodeURIComponent(new URL(child).pathname).replace(/^\//,'');
    const target=path.resolve(root,pathname);
    assert(target.startsWith(root+path.sep),'Sitemap child is outside dist');
    const xml=await read(pathname);
    assert(xml.includes('<urlset'),'Invalid sitemap child: '+pathname);
    urls.push(...locs(xml));
  }
  assert(urls.length>0,'Sitemap contains no pages');
  for(const route of ['/','/tool/','/games/','/a/','/blog/']) {
    assert(urls.some(value=>new URL(value).pathname.replace(/\/$/,'')===route.replace(/\/$/,'')), 'Missing sitemap route: '+route);
  }
  const robots=await read('robots.txt');
  const declared=robots.match(/^Sitemap:\s*(\S+)/mi)?.[1];
  assert(declared,'robots.txt must declare a sitemap');
  await read(new URL(declared).pathname.replace(/^\//,''));
  const pages=JSON.parse(await read('json/site-pages.json'));
  assert(pages.length>0,'Search pages index is empty');
  console.log('verify-dist passed: sitemap index, '+children.length+' child file(s), '+urls.length+' URLs, legacy alias, robots and search index');
}
main().catch(error=>{console.error('verify-dist failed:',error);process.exitCode=1;});
