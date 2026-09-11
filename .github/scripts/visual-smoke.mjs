import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/index.html';
await fs.mkdir('artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyPage(browser, name, viewport) {
  const page = await browser.newPage({ viewportSize: viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  assert(await page.locator('.level-node').count() === 15, `${name}: campaign should render 15 level nodes`);
  assert(await page.locator('#mapScreen').isVisible(), `${name}: map must be visible on boot`);

  const mapOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(mapOverflow <= 1, `${name}: map has ${mapOverflow}px horizontal overflow`);
  await page.screenshot({ path: `artifacts/${name}-map.png`, fullPage: true });

  await page.locator('#continueButton').click();
  await page.waitForTimeout(250);
  assert(await page.locator('#gameScreen').isVisible(), `${name}: game screen should open`);
  assert(!(await page.locator('#gameCanvas').isHidden()), `${name}: canvas should be visible`);

  const box = await page.locator('#gameCanvas').boundingBox();
  assert(box && box.width >= Math.min(300, viewport.width - 30), `${name}: canvas is unexpectedly small`);
  const gameOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(gameOverflow <= 1, `${name}: game has ${gameOverflow}px horizontal overflow`);

  await page.locator('#pauseButton').click();
  assert(await page.locator('#pauseDialog').evaluate((dialog) => dialog.open), `${name}: pause dialog should open`);
  await page.locator('#resumeButton').click();
  assert(!(await page.locator('#pauseDialog').evaluate((dialog) => dialog.open)), `${name}: pause dialog should close`);

  const canvas = page.locator('#gameCanvas');
  const canvasBox = await canvas.boundingBox();
  if (canvasBox) {
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.72, canvasBox.y + canvasBox.height * 0.45);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(350);
  }

  await page.screenshot({ path: `artifacts/${name}-game.png`, fullPage: true });
  assert(errors.length === 0, `${name}: browser errors:\n${errors.join('\n')}`);
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyPage(browser, 'desktop', { width: 1440, height: 1000 });
  await verifyPage(browser, 'mobile', { width: 390, height: 844 });
  console.log('OK: desktop and mobile browser smoke passed');
} finally {
  await browser.close();
}
