import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default function sitemapCompat() {
  return {name:'sitemap-compat',hooks:{'astro:build:done':async ({dir})=>{
    const root=fileURLToPath(dir);
    const index=await fs.readFile(path.join(root,'sitemap-index.xml'),'utf8');
    if(!index.includes('<sitemapindex') || !index.includes('<loc>')) throw new Error('Sitemap index is empty or invalid.');
    await fs.writeFile(path.join(root,'sitemap.xml'),index,'utf8');
  }}};
}
