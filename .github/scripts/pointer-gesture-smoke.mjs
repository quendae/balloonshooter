import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/index.html';
await fs.mkdir('artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installGameProbe(page) {
  await page.evaluate(async () => {
    const { SkyRescueGame } = await import('/src/game.mjs');
    if (SkyRescueGame.prototype.__pointerGestureProbeInstalled) return;
    const originalStart = SkyRescueGame.prototype.start;
    Object.defineProperty(SkyRescueGame.prototype, '__pointerGestureProbeInstalled', { value: true });
    SkyRescueGame.prototype.start = function patchedStart(...args) {
      const result = originalStart.apply(this, args);
      window.__gestureGame = this;
      window.__gestureShots = 0;
      const originalShot = this.callbacks.onShot;
      this.callbacks.onShot = (shot) => {
        window.__gestureShots += 1;
        originalShot?.(shot);
      };
      return result;
    };
  });
}

async function canvasPoint(page, logicalX, logicalY) {
  const box = await page.locator('#gameCanvas').boundingBox();
  if (!box) throw new Error('game canvas has no bounding box');
  return {
    x: box.x + (logicalX / 240) * box.width,
    y: box.y + (logicalY / 320) * box.height,
  };
}

async function dispatchPointer(page, type, {
  pointerId,
  pointerType,
  logicalX,
  logicalY,
  buttons = type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
}) {
  await page.locator('#gameCanvas').evaluate((canvas, payload) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (payload.logicalX / 240) * rect.width;
    const clientY = rect.top + (payload.logicalY / 320) * rect.height;
    canvas.dispatchEvent(new PointerEvent(payload.type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: payload.pointerId,
      pointerType: payload.pointerType,
      button: 0,
      buttons: payload.buttons,
      clientX,
      clientY,
    }));
  }, { type, pointerId, pointerType, logicalX, logicalY, buttons });
}

async function shotCount(page) {
  return page.evaluate(() => window.__gestureShots || 0);
}

async function verifyDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await installGameProbe(page);
  await page.locator('#continueButton').click();
  await page.waitForFunction(() => Boolean(window.__gestureGame) && !document.querySelector('#gameScreen')?.hidden);

  const start = await canvasPoint(page, 178, 244);
  const shallow = await canvasPoint(page, 230, 270);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(30);

  assert(await shotCount(page) === 0, 'desktop pointerdown must start aiming without firing');
  assert(await page.evaluate(() => !window.__gestureGame.projectile), 'desktop projectile must stay parked while mouse is held');

  await page.mouse.move(shallow.x, shallow.y, { steps: 4 });
  const held = await page.evaluate(() => ({
    aimAngle: window.__gestureGame.aimAngle,
    shots: window.__gestureShots,
    hasProjectile: Boolean(window.__gestureGame.projectile),
  }));
  assert(Math.abs(held.aimAngle - (-.18)) < .04, `desktop hold-drag should reach shallow aim clamp, got ${held.aimAngle}`);
  assert(held.shots === 0 && !held.hasProjectile, 'desktop drag while held must not fire');
  await page.screenshot({ path: 'artifacts/pointer-gesture-desktop-held.png', fullPage: true });

  await page.mouse.up();
  await page.waitForTimeout(20);
  assert(await shotCount(page) === 1, 'desktop pointerup should fire exactly once');

  await page.evaluate(() => { window.__gestureGame.projectile = null; });
  await dispatchPointer(page, 'pointerdown', { pointerId: 77, pointerType: 'mouse', logicalX: 72, logicalY: 250 });
  assert(await shotCount(page) === 1, 'second desktop pointerdown should still only aim');
  await dispatchPointer(page, 'pointercancel', { pointerId: 77, pointerType: 'mouse', logicalX: 72, logicalY: 250 });
  assert(await shotCount(page) === 1, 'pointercancel must end desktop aim without firing');

  assert(errors.length === 0, `desktop pointer gesture console errors: ${errors.join(' | ')}`);
  await page.close();
}

async function verifyMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await installGameProbe(page);
  await page.locator('#enduranceButton').click();
  await page.locator('#enduranceStartButton').click();
  await page.waitForFunction(() => Boolean(window.__gestureGame) && document.querySelector('#gameScreen')?.dataset.mode === 'endurance');

  const idle = await page.evaluate(() => {
    const state = window.__gestureGame.renderState();
    return {
      aimSegment: Boolean(state.aimSegment),
      trajectory: state.trajectory?.length || 0,
      touchPoints: navigator.maxTouchPoints,
    };
  });
  assert(idle.touchPoints > 0, 'mobile smoke should expose a coarse/touch pointer environment');
  assert(!idle.aimSegment && idle.trajectory === 0, 'mobile aim guide should stay hidden until the player holds the canvas');

  await dispatchPointer(page, 'pointerdown', { pointerId: 11, pointerType: 'touch', logicalX: 176, logicalY: 250 });
  await page.waitForTimeout(20);
  const pressed = await page.evaluate(() => {
    const state = window.__gestureGame.renderState();
    return {
      shots: window.__gestureShots,
      hasProjectile: Boolean(window.__gestureGame.projectile),
      hasGuide: Boolean(state.aimSegment) || Boolean(state.trajectory?.length),
    };
  });
  assert(pressed.shots === 0 && !pressed.hasProjectile, 'touch pointerdown must aim without firing');
  assert(pressed.hasGuide, 'holding on mobile should reveal the aim guide');

  await dispatchPointer(page, 'pointermove', { pointerId: 11, pointerType: 'touch', logicalX: 230, logicalY: 270 });
  const moved = await page.evaluate(() => ({
    angle: window.__gestureGame.aimAngle,
    shots: window.__gestureShots,
  }));
  assert(Math.abs(moved.angle - (-.18)) < .04, `touch drag should reach shallow aim clamp, got ${moved.angle}`);
  assert(moved.shots === 0, 'touch drag must not fire before release');
  await page.screenshot({ path: 'artifacts/pointer-gesture-mobile-held.png', fullPage: true });

  await dispatchPointer(page, 'pointerup', { pointerId: 11, pointerType: 'touch', logicalX: 230, logicalY: 270 });
  await page.waitForTimeout(20);
  assert(await shotCount(page) === 1, 'touch pointerup should fire exactly once');

  await page.evaluate(() => { window.__gestureGame.projectile = null; });
  await dispatchPointer(page, 'pointerdown', { pointerId: 12, pointerType: 'touch', logicalX: 64, logicalY: 248 });
  await dispatchPointer(page, 'pointercancel', { pointerId: 12, pointerType: 'touch', logicalX: 64, logicalY: 248 });
  assert(await shotCount(page) === 1, 'touch pointercancel must never fire');

  const cancelled = await page.evaluate(() => {
    const state = window.__gestureGame.renderState();
    return Boolean(state.aimSegment) || Boolean(state.trajectory?.length);
  });
  assert(cancelled === false, 'mobile guide should hide again after pointercancel');
  assert(errors.length === 0, `mobile pointer gesture console errors: ${errors.join(' | ')}`);

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyDesktop(browser);
  await verifyMobile(browser);
  console.log('OK: hold-to-aim pointer gesture works on desktop and mobile');
} finally {
  await browser.close();
}
