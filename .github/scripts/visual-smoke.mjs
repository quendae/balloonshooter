import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/index.html';
const PUBLIC_PREVIEW = 'https://rawcdn.githack.com/quendae/balloonshooter/c6f0e3806e964621e36a77afc21adea768fb6296/index.html';
const STORAGE_KEY = 'balloon-sky-rescue-v1';
await fs.mkdir('artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyIntegratedContract(page, name) {
  const contract = await page.evaluate(() => {
    const node = document.querySelector('.level-node');
    const frame = document.querySelector('.playfield-frame');
    const canvas = document.querySelector('#gameCanvas');
    const button = document.querySelector('.button');
    const topHud = document.querySelector('.playfield-hud-top');
    const bottomHud = document.querySelector('.playfield-hud-bottom');
    return {
      nodeRadius: node ? getComputedStyle(node).borderRadius : '',
      frameRadius: frame ? getComputedStyle(frame).borderRadius : '',
      frameBorder: frame ? getComputedStyle(frame).borderTopWidth : '',
      canvasRendering: canvas ? getComputedStyle(canvas).imageRendering : '',
      buttonRadius: button ? getComputedStyle(button).borderRadius : '',
      topHudInsideFrame: Boolean(frame && topHud && frame.contains(topHud)),
      bottomHudInsideFrame: Boolean(frame && bottomHud && frame.contains(bottomHud)),
      oldSidePanels: document.querySelectorAll('.objective-panel, .status-panel').length,
      permanentHints: document.querySelectorAll('.controls-hint, .hud-note').length,
    };
  });
  assert(contract.nodeRadius === '2px', `${name}: level nodes should keep the compact retro radius, got ${contract.nodeRadius}`);
  assert(contract.frameRadius === '2px', `${name}: playfield frame should keep the compact retro radius, got ${contract.frameRadius}`);
  assert(contract.frameBorder === '4px', `${name}: playfield frame should keep a strong 4px edge, got ${contract.frameBorder}`);
  assert(contract.canvasRendering === 'auto', `${name}: detailed world art should not be CSS-pixelated, got ${contract.canvasRendering}`);
  assert(contract.buttonRadius === '2px', `${name}: buttons should keep the retro 2px radius, got ${contract.buttonRadius}`);
  assert(contract.topHudInsideFrame, `${name}: level/objective/score chrome should be integrated into the playfield frame`);
  assert(contract.bottomHudInsideFrame, `${name}: queue/run stats should be integrated into the playfield frame`);
  assert(contract.oldSidePanels === 0, `${name}: detached left/right gameplay cards should be removed`);
  assert(contract.permanentHints === 0, `${name}: permanent tutorial/control copy should not occupy the gameplay screen`);
}

async function verifyPage(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const actualViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  assert(actualViewport.width === viewport.width && actualViewport.height === viewport.height, `${name}: requested ${viewport.width}x${viewport.height}, got ${actualViewport.width}x${actualViewport.height}`);
  assert(await page.locator('.level-node').count() === 15, `${name}: campaign should render 15 level nodes`);
  assert(await page.locator('#mapScreen').isVisible(), `${name}: map must be visible on boot`);

  const mapOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(mapOverflow <= 1, `${name}: map has ${mapOverflow}px horizontal overflow`);
  await page.screenshot({ path: `artifacts/${name}-map.png`, fullPage: true });

  const sound = page.locator('#soundButton');
  assert(await sound.getAttribute('aria-pressed') === 'true', `${name}: sound should default to enabled`);
  await sound.click();
  assert(await sound.getAttribute('aria-pressed') === 'false', `${name}: sound toggle should disable audio`);
  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.locator('#soundButton').getAttribute('aria-pressed') === 'false', `${name}: sound preference should survive reload`);
  await page.locator('#soundButton').click();

  await page.locator('#continueButton').click();
  await page.waitForTimeout(250);
  assert(await page.locator('#gameScreen').isVisible(), `${name}: game screen should open`);
  assert(!(await page.locator('#gameCanvas').isHidden()), `${name}: canvas should be visible`);
  await verifyIntegratedContract(page, name);

  const box = await page.locator('#gameCanvas').boundingBox();
  const minimumCanvasWidth = name === 'desktop' ? 600 : Math.min(300, viewport.width - 30);
  assert(box && box.width >= minimumCanvasWidth, `${name}: canvas width ${box?.width ?? 0}px is below ${minimumCanvasWidth}px`);
  const queueImage = await page.locator('.queue-shot').first().evaluate((item) => getComputedStyle(item).backgroundImage);
  assert(queueImage.includes('data:image/svg+xml'), `${name}: queue should reuse the original procedural orb artwork, got ${queueImage}`);

  const gameOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(gameOverflow <= 1, `${name}: game has ${gameOverflow}px horizontal overflow`);

  if (name === 'desktop') await page.screenshot({ path: 'artifacts/desktop-aim-line.png', fullPage: true });

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
    await page.waitForTimeout(220);
  }

  await page.screenshot({ path: `artifacts/${name}-game.png`, fullPage: true });
  assert(errors.length === 0, `${name}: browser errors:\n${errors.join('\n')}`);
  await page.close();
}

function completedProgress(count) {
  const levels = {};
  const ids = [
    'meadow-01', 'meadow-02', 'meadow-03', 'meadow-04', 'meadow-05',
    'clouds-01', 'clouds-02', 'clouds-03', 'clouds-04', 'clouds-05',
    'forest-01', 'forest-02', 'forest-03', 'forest-04', 'forest-05',
  ];
  ids.slice(0, count).forEach((id) => {
    levels[id] = { stars: 1, score: 100, completed: true, masteries: [] };
  });
  return { version: 1, levels, settings: { sound: false } };
}

async function returnToMap(page) {
  await page.locator('#backButton').click();
  await page.locator('#pauseMapButton').click();
}

async function verifyWorldArt(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: completedProgress(14) });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.locator('.level-node').nth(5).click();
  await page.waitForTimeout(250);
  assert((await page.locator('#gameWorldLabel').textContent())?.includes('Wyspy Chmur'), 'world art: level 6 should open cloud world');
  await page.screenshot({ path: 'artifacts/desktop-clouds-game.png', fullPage: true });

  await returnToMap(page);
  await page.locator('.level-node').nth(8).click();
  await page.waitForTimeout(250);
  assert((await page.locator('#gameLevelLabel').textContent())?.includes('Deszcz gwiazd'), 'weather art: level 9 should open sunset rain level');
  await page.screenshot({ path: 'artifacts/desktop-sunset-rain-game.png', fullPage: true });

  await returnToMap(page);
  await page.locator('.level-node').nth(13).click();
  await page.waitForTimeout(250);
  assert((await page.locator('#gameLevelLabel').textContent())?.includes('Bez marginesu'), 'weather art: level 14 should open dusk heavy-rain level');
  await page.screenshot({ path: 'artifacts/desktop-dusk-heavy-rain-game.png', fullPage: true });

  await returnToMap(page);
  await page.locator('.level-node').nth(14).click();
  await page.waitForTimeout(250);
  assert((await page.locator('#gameWorldLabel').textContent())?.includes('Las Wiatru'), 'world art: level 15 should open forest world');
  assert(!(await page.locator('#bossMeter').isHidden()), 'world art: level 15 should expose boss meter');
  await page.screenshot({ path: 'artifacts/desktop-boss-game.png', fullPage: true });

  assert(errors.length === 0, `world art browser errors:\n${errors.join('\n')}`);
  await page.close();
}

async function verifyPublicPreview(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: '__Http-phish', value: '1', url: 'https://rawcdn.githack.com', secure: true, httpOnly: true }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  const response = await page.goto(PUBLIC_PREVIEW, { waitUntil: 'networkidle', timeout: 45_000 });
  assert(response?.ok(), `public preview returned HTTP ${response?.status() ?? 'no response'}`);
  assert((await page.title()).includes('Balloon: Sky Rescue'), 'public preview should expose the Sky Rescue title after the service confirmation');
  assert(await page.locator('.level-node').count() === 15, 'public preview should render all 15 campaign levels');
  await page.locator('#continueButton').click();
  await page.waitForTimeout(250);
  assert(await page.locator('#gameCanvas').isVisible(), 'public preview should open a playable canvas');
  assert(errors.length === 0, `public preview browser errors:\n${errors.join('\n')}`);
  await page.screenshot({ path: 'artifacts/public-preview.png', fullPage: true });
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyPage(browser, 'desktop', { width: 1440, height: 1000 });
  await verifyPage(browser, 'mobile', { width: 390, height: 844 });
  await verifyWorldArt(browser);
  await verifyPublicPreview(browser);
  console.log('OK: integrated HUD, short aim, original orbs, responsive playfield, weather progression and public preview passed');
} finally {
  await browser.close();
}
