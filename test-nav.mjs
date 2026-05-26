import { chromium } from 'C:/nvm4w/nodejs/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const logs = [];
page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
page.on('pageerror', err => logs.push('PAGE_ERROR: ' + err.message));

await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('=== Console Logs ===');
logs.forEach(l => console.log(l));

const items = await page.locator('.nav-hover-item').all();
console.log('Nav hover items found:', items.length);

if (items.length > 0) {
  const firstItem = items[0];
  const box = await firstItem.boundingBox();
  console.log('First item position:', JSON.stringify(box));

  const menuLocator = firstItem.locator('.nav-hover-menu');
  let menuBox = await menuLocator.boundingBox();
  console.log('Menu box BEFORE hover:', JSON.stringify(menuBox));

  await firstItem.hover();
  await page.waitForTimeout(500);

  menuBox = await menuLocator.boundingBox();
  console.log('Menu box AFTER hover:', JSON.stringify(menuBox));

  const isVisible = await menuLocator.evaluate(el => {
    const style = window.getComputedStyle(el);
    return {
      position: style.position,
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      inlinePosition: el.style.position,
      inlineTop: el.style.top,
      inlineLeft: el.style.left,
      cssTop: style.top,
      cssLeft: style.left
    };
  });
  console.log('Menu style:', JSON.stringify(isVisible, null, 2));
}

const container = page.locator('.header-nav-container');
if (container) {
  const overflow = await container.evaluate(el => window.getComputedStyle(el).overflow);
  console.log('Container overflow:', overflow);
}

await browser.close();
