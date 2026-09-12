import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/index.html';
await fs.mkdir('artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openEndurance(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  assert(await page.locator('#enduranceButton').isVisible(), 'Endurance button should be visible on the campaign map');
  await page.locator('#enduranceButton').click();
  assert(await page.locator('#enduranceDialog').evaluate((dialog) => dialog.open), 'Endurance intro dialog should open');
  assert((await page.locator('.endurance-rule').textContent())?.includes('3 strzały = nowy rząd'), 'Endurance intro should explain the 3-shot row rule');
  await page.screenshot({ path: 'artifacts/endurance-intro.png', fullPage: true });
  await page.locator('#enduranceStartButton').click();
  await page.waitForSelector('#gameScreen:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.dataset.mode === 'endurance');
}

async function fireShot(page, xFraction) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  assert(box, 'Endurance canvas must have a bounding box');
  await page.mouse.click(box.x + box.width * xFraction, box.y + box.height * .24);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await openEndurance(page);
  assert((await page.locator('#statOneLabel').textContent()) === 'Runda', 'Endurance HUD should show round label');
  assert((await page.locator('#statTwoLabel').textContent()) === 'Do rzędu', 'Endurance HUD should show row countdown label');
  assert((await page.locator('#statThreeLabel').textContent()) === 'Czas', 'Endurance HUD should show active time label');
  assert((await page.locator('#shotsValue').textContent()) === '1', 'Endurance should start at round 1');
  assert((await page.locator('#dropValue').textContent()) === '3', 'Endurance should start with three shots until next row');
  await page.screenshot({ path: 'artifacts/endurance-start.png', fullPage: true });

  const aimXs = [.46, .57, .38];
  for (let index = 0; index < 3; index += 1) {
    await fireShot(page, aimXs[index]);
    if (index < 2) {
      const expected = String(2 - index);
      await page.waitForFunction((value) => document.querySelector('#dropValue')?.textContent === value, expected, { timeout: 5000 });
    }
  }
  await page.waitForFunction(() => document.querySelector('#shotsValue')?.textContent === '2', { timeout: 6000 });
  assert((await page.locator('#dropValue').textContent()) === '3', 'new round should reset row countdown to three shots');
  await page.screenshot({ path: 'artifacts/endurance-round-2.png', fullPage: true });

  await page.waitForFunction(() => document.querySelector('#gameScreen')?.dataset.spatialStage === '1', { timeout: 70_000 });
  await page.screenshot({ path: 'artifacts/endurance-zoom-stage-1.png', fullPage: true });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await page.locator('#resultDialog').evaluate((dialog) => dialog.open)) break;
    await fireShot(page, [.32, .5, .68, .43, .58][attempt % 5]);
    await page.waitForTimeout(620);
  }

  await page.waitForFunction(() => document.querySelector('#resultDialog')?.open === true, { timeout: 8000 });
  assert((await page.locator('#resultKicker').textContent())?.includes('Endurance') || (await page.locator('#resultKicker').textContent())?.includes('rekord'), 'Endurance loss should use the Endurance result state');
  assert(await page.locator('#resultStars').isHidden(), 'Endurance result should not show campaign stars');
  await page.screenshot({ path: 'artifacts/endurance-result.png', fullPage: true });

  await page.locator('#retryButton').click();
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.dataset.mode === 'endurance' && document.querySelector('#shotsValue')?.textContent === '1', { timeout: 5000 });
  assert((await page.locator('#dropValue').textContent()) === '3', 'Endurance retry should start a fresh run');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `Endurance desktop has ${overflow}px horizontal overflow`);
  assert(errors.length === 0, `Endurance browser errors:\n${errors.join('\n')}`);
  console.log('OK: Endurance UI entry, 3-shot rounds, timed zoom, loss and retry passed');
  await page.close();
} finally {
  await browser.close();
}
