import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
  await page.locator('#continueButton').click();
  await page.waitForTimeout(180);

  if (await page.locator('.shot-queue-wrap').isVisible()) throw new Error('next orbs must not live in a separate HUD queue panel');
  if (!(await page.locator('#gameCanvas').isVisible())) throw new Error('game canvas must stay visible');

  const canvasBox = await page.locator('#gameCanvas').boundingBox();
  if (!canvasBox || canvasBox.width < 600) throw new Error(`playfield became too small: ${canvasBox?.width ?? 0}px`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`game has ${overflow}px horizontal overflow`);
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  await page.screenshot({ path: 'artifacts/desktop-orb-rack.png', fullPage: true });
  console.log('OK: next-orb rack is integrated into the playfield');
} finally {
  await browser.close();
}
