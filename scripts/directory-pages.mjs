import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function directoryPages() {
  return {
    name: 'directory-pages',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const moves = [];
        async function collect(directory) {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const source = path.join(directory, entry.name);
            if (entry.isDirectory()) await collect(source);
            else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html'
              && source !== path.join(root, '404.html')) {
              moves.push([source, path.join(source.slice(0, -5), 'index.html')]);
            }
          }
        }
        await collect(root);
        for (const [, target] of moves) {
          const exists = await fs.stat(target).then(() => true, (error) => {
            if (error.code !== 'ENOENT') throw error;
            return false;
          });
          if (exists) throw new Error(`Directory page conflicts with ${path.relative(root, target)}`);
        }
        for (const [source, target] of moves) {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.rename(source, target);
        }
        logger.info(`Moved ${moves.length} flat pages to directory indexes`);
      },
    },
  };
}
