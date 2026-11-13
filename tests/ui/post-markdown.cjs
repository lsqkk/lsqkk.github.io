const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");
const { inflateRawSync } = require("node:zlib");
const { pathToFileURL } = require("node:url");

let playwright;
try {
  playwright = require("playwright");
} catch {
  const windows = process.platform === "win32";
  const root = execFileSync(windows ? "npm.cmd" : "npm", ["root", "-g"], {
    encoding: "utf8",
    shell: windows,
  }).trim();
  playwright = createRequire(path.join(root, "package.json"))("playwright");
}

const base = process.env.BASE_URL || "http://127.0.0.1:4321";
const article = "/posts/2023/2204/";
const longLine = `const answer = "${"long text ".repeat(30)}";`;
const plantSource = "读者 -> 文章 : 查看图表";
const markdown = `
## Markdown

1001. 第一项，${"测试长段落".repeat(25)}
      - 子项
        - [x] 已完成
1002. 第二项

~~~javascript
${longLine}
~~~

~~~mermaid
flowchart LR
  A[Start] --> B[Finish]
~~~

~~~mermaid
not a diagram
~~~

~~~puml
${plantSource}
~~~

~~~plantuml
invalid diagram
~~~
`;

async function main() {
  const { createMarkdownProcessor } = await import("@astrojs/markdown-remark");
  const { default: config } = await import("../../astro.config.mjs");
  const processor = await createMarkdownProcessor(config.markdown);
  const fixture = (await processor.render(markdown, {
    fileURL: pathToFileURL(path.resolve("posts/fixture.md")),
  })).code;

  const browser = await playwright.chromium.launch();
  try {
    for (const width of [320, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: "dark",
        permissions: ["clipboard-read", "clipboard-write"],
      });
      let renderedPlantSource;
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (url === base + article + "?fixture") {
          const response = await route.fetch();
          const original = await response.text();
          const body = original.replace(/<div id="content" class="post-content">/, (tag) => tag + fixture);
          assert.notEqual(body, original);
          return route.fulfill({ response, body });
        }
        if (url.startsWith("https://www.plantuml.com/plantuml/svg/")) {
          const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
          const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
          const encoded = url.split("/").at(-1).replace(/./g, (char) => base64[alphabet.indexOf(char)]);
          const source = inflateRawSync(Buffer.from(encoded, "base64")).toString();
          const valid = source.includes(plantSource);
          if (valid) renderedPlantSource = source;
          return route.fulfill({
            status: valid ? 200 : 400,
            contentType: "image/svg+xml",
            headers: { "access-control-allow-origin": "*" },
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="100"><rect width="600" height="100" fill="blue"/></svg>',
          });
        }
        return url.startsWith(base + "/") ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(base + article, { waitUntil: "domcontentloaded" });
      await page.locator(".post-code-block pre[data-language=cpp] .line").first().waitFor();
      assert.equal(await page.locator('script[src*="highlight.js"],script[src*="mermaid"]').count(), 0);
      await page.goto(base + article + "?fixture", { waitUntil: "domcontentloaded" });

      const block = page.locator(".post-code-block").first();
      const wrap = block.getByRole("button", { name: "自动换行" });
      await wrap.waitFor();
      const pre = block.locator("pre");
      const toolbar = block.locator(".post-code-toolbar");
      const toolbarX = (await toolbar.boundingBox()).x;
      assert(await pre.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        return node.scrollLeft > 0;
      }));
      assert.equal((await toolbar.boundingBox()).x, toolbarX);
      await wrap.click();
      assert.equal(await wrap.getAttribute("aria-pressed"), "true");
      assert(await pre.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
      const copy = block.getByRole("button", { name: "复制", exact: true });
      await copy.click();
      await block.getByRole("button", { name: "已复制" }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), longLine);

      const list = page.locator('.post-content ol[start="1001"]');
      assert(await list.evaluate((node) => {
        const indent = parseFloat(getComputedStyle(node).paddingInlineStart);
        return indent >= 44 && node.querySelector("ul ul input:checked");
      }));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

      const mermaid = page.locator('[data-post-diagram="mermaid"]').first();
      await mermaid.scrollIntoViewIfNeeded();
      const svg = mermaid.locator(".post-diagram-preview svg");
      await svg.waitFor();
      const darkId = await svg.getAttribute("id");
      const token = pre.locator(".line span").first();
      const darkColor = await token.evaluate((node) => getComputedStyle(node).color);
      await page.evaluate(() => {
        document.documentElement.dataset.siteTheme = "light";
        document.documentElement.dataset.siteResolvedTheme = "light";
        document.body.classList.remove("dark-mode");
      });
      await svg.locator(`xpath=self::*[@id != "${darkId}"]`).waitFor();
      assert.notEqual(await token.evaluate((node) => getComputedStyle(node).color), darkColor);
      await mermaid.getByText("图表源码").click();
      assert.match(await mermaid.locator("pre:visible").textContent(), /A\[Start\] --> B\[Finish\]/);

      const brokenMermaid = page.locator('[data-post-diagram="mermaid"]').last();
      await brokenMermaid.scrollIntoViewIfNeeded();
      await brokenMermaid.getByText("图表渲染失败，已展开源码。").waitFor();
      assert.equal(await brokenMermaid.locator("pre:visible").textContent(), "not a diagram");

      const plant = page.locator('[data-post-diagram="plantuml"]').first();
      await plant.scrollIntoViewIfNeeded();
      const image = plant.locator(".post-diagram-preview img");
      await image.waitFor();
      assert.equal(await image.evaluate((node) => node.naturalWidth), 600);
      assert.equal(renderedPlantSource, `@startuml\n${plantSource}\n@enduml`);
      if (width === 320) assert(await plant.locator(".post-diagram-preview").evaluate((node) => node.scrollWidth > node.clientWidth));
      const brokenPlant = page.locator('[data-post-diagram="plantuml"]').last();
      await brokenPlant.scrollIntoViewIfNeeded();
      await brokenPlant.getByText("图表渲染失败，已展开源码。").waitFor();
      assert.equal(await brokenPlant.locator("pre:visible").textContent(), "invalid diagram");
      assert.deepEqual(pageErrors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("Article Markdown UI passed at 320px and 1440px");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
