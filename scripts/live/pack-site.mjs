import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/live/pack-site.mjs <empty-output-directory>");

const source = path.resolve("dist");
const target = path.resolve(output);
if (target === source || target.startsWith(source + path.sep)) {
  throw new Error("The output directory must be outside dist.");
}

const pages = ["index.html", "assistant/index.html", "streamer/index.html"];
const assets = new Set();
for (const page of pages) {
  const relative = path.join("a", "live", page);
  let html = await readFile(path.join(source, relative), "utf8");
  // The ECS copy contains only the live room. GitHub Pages also has the site-wide widgets.
  for (const script of html.matchAll(/<script\b[^>]*src="(\/assets\/page\.[^"]+\.js)"[^>]*><\/script>/g)) {
    const code = await readFile(path.join(source, script[1]), "utf8");
    if (code.includes("/assets/js/site-services.mjs")) html = html.replace(script[0], "");
  }
  for (const match of html.matchAll(/(?:href|src)="\/(assets\/[^"]+)"/g)) assets.add(match[1]);
  const destination = path.join(target, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

for (const asset of assets) {
  const file = path.join(source, asset);
  if (asset.endsWith(".js")) {
    const code = await readFile(file, "utf8");
    for (const match of code.matchAll(/import\(["']\.\/([\w.-]+\.js)["']\)/g)) {
      assets.add(path.posix.join(path.posix.dirname(asset), match[1]));
    }
  }
  const destination = path.join(target, asset);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
}
