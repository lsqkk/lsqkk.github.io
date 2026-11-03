import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transform as minifyJs} from 'esbuild';
import {transform as minifyCss} from 'lightningcss';
export default function optimizeStatic() {
  return {name:'optimize-static',hooks:{'astro:build:done':async ({dir,logger})=>{
    const root=fileURLToPath(dir);
    const assets=path.join(root,'assets');
    const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]))).flat();
    let before=0,after=0,count=0;
    // Flatten the shared CSS imports so base tokens and fonts need no request waterfall.
    const expand=async (text,seen=new Set())=>{
      const matches=[...text.matchAll(/@import\s+url\(['"]?(\/assets\/css\/[^'"\)]+)['"]?\);/g)];
      for(const match of matches){
        const file=path.join(root,match[1]);
        if(seen.has(file)){text=text.replace(match[0],'');continue;}
        seen.add(file);
        text=text.replace(match[0],await expand(await fs.readFile(file,'utf8'),seen));
      }
      return text;
    };
    for(const file of await walk(assets)) {
      if(!/\.(css|js)$/.test(file)||/\.min\.(css|js)$/.test(file))continue;
      const input=await fs.readFile(file,'utf8');
      let output;
      try {
        if(file.endsWith('.css')) {
          const source=await expand(input);
          output=Buffer.from(minifyCss({filename:file,code:Buffer.from(source),minify:true}).code).toString();
        } else output=(await minifyJs(input,{minify:true,target:'es2020',legalComments:'none',loader:'js'})).code;
      } catch(error) { throw new Error('Static optimization failed for '+path.relative(root,file)+': '+error.message); }
      before+=Buffer.byteLength(input);after+=Buffer.byteLength(output);count++;
      await fs.writeFile(file,output);
    }
    logger.info(count+' static CSS/JS files optimized: '+Math.round(before/1024)+' → '+Math.round(after/1024)+' KiB');
  }}};
}
