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
  // Article metadata must be parseable and point at the actual post route.
  async function postFiles(directory) {
    const result=[];
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const name=path.join(directory,entry.name);
      if(entry.isDirectory())result.push(...await postFiles(name));
      else if(entry.name.endsWith(".html"))result.push(name);
    }
    return result;
  }
  let articleCount=0;
  for(const file of await postFiles(path.join(root,"posts"))) {
    const html=await fs.readFile(file,"utf8");
    if(!html.includes("post-layout-page"))continue;
    const canonicalTag=(html.match(/<link\b[^>]*\brel="canonical"[^>]*>/)||[])[0]||"";
    const canonical=(canonicalTag.match(/\bhref="([^"]+)"/)||[])[1];
    const openGraph=(html.match(/property="og:url"\s+content="([^"]+)"/)||[])[1];
    assert(canonical,"Missing article canonical: "+file);
    const expected="/"+path.relative(root,file).split(path.sep).join("/").replace(/\.html$/,"");
    assert.equal(new URL(canonical).origin,new URL(urls[0]).origin,"Article origin differs from sitemap: "+file);
    assert.equal(decodeURI(new URL(canonical).pathname),decodeURI(expected),"Incorrect article canonical: "+file);
    assert.equal(openGraph,canonical,"Open Graph URL differs from canonical: "+file);
    const json=(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)||[])[1];
    assert(json,"Missing article structured data: "+file);
    const data=JSON.parse(json);
    assert.equal(data["@type"],"BlogPosting");
    assert.equal(data.mainEntityOfPage?.["@id"],canonical,"Structured data URL differs from canonical: "+file);
    assert.equal(typeof data.headline,"string");
    articleCount++;
  }
  assert(articleCount>0,"No articles were validated");
  console.log("Article metadata verified: "+articleCount+" pages");
  const robots=await read('robots.txt');
  const declared=robots.match(/^Sitemap:\s*(\S+)/mi)?.[1];
  assert(declared,'robots.txt must declare a sitemap');
  await read(new URL(declared).pathname.replace(/^\//,''));
  const pages=JSON.parse(await read('json/site-pages.json'));
  assert(pages.length>0,'Search pages index is empty');
  const settings = await read('settings.html');
  for (const id of ['appearance', 'notifications', 'ai']) {
    assert(settings.includes(`id="${id}"`), 'Missing settings section: '+id);
  }
  const routes = new Map(pages.map(({path,href}) => [path,href]));
  assert.equal(routes.get('settings'),'/settings','Settings search link must target settings.html');
  assert.equal(routes.get('tool'),'/tool/','Tool directory search link must target its index.html');
  const exists = (relative) => fs.stat(path.join(root,relative)).then(stat => stat.isFile(), () => false);
  for (const {path: slug, href} of pages) {
    assert(href === '/'+slug || href === '/'+slug+'/', 'Invalid indexed route: '+slug);
    const file = decodeURI(slug);
    if (await exists(file+'/index.html')) assert.equal(href,'/'+slug+'/','Directory route must end in a slash: '+slug);
    else if (await exists(file+'.html')) assert.equal(href,'/'+slug,'File route must omit trailing slash: '+slug);
  }
  console.log('verify-dist passed: sitemap index, '+children.length+' child file(s), '+urls.length+' URLs, legacy alias, robots and search index');
}
main().catch(error=>{console.error('verify-dist failed:',error);process.exitCode=1;});
