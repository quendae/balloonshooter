import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/index.html';
await fs.mkdir('artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installEnduranceProbe(page) {
  await page.evaluate(async () => {
    const { EnduranceGame } = await import('/src/endurance-game.mjs');
    if (EnduranceGame.prototype.__browserProbeInstalled) return;
    const originalStart = EnduranceGame.prototype.start;
    Object.defineProperty(EnduranceGame.prototype, '__browserProbeInstalled', { value: true });
    EnduranceGame.prototype.start = function patchedStart(...args) {
      window.__enduranceGame = this;
      return originalStart.apply(this, args);
    };
  });
}

async function openEndurance(page, screenshot = null) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await installEnduranceProbe(page);
  assert(await page.locator('#enduranceButton').isVisible(), 'Endurance button should be visible on the campaign map');
  await page.locator('#enduranceButton').click();
  assert(await page.locator('#enduranceDialog').evaluate((dialog) => dialog.open), 'Endurance intro dialog should open');
  assert((await page.locator('.endurance-rule').textContent())?.includes('Pudło = nowy rząd'), 'Endurance intro should explain miss pressure');
  assert((await page.locator('#enduranceDialog').textContent())?.includes('Best Combo'), 'Endurance intro should expose Best Combo');
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  await page.locator('#enduranceStartButton').click();
  await page.waitForSelector('#gameScreen:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.dataset.mode === 'endurance' && Boolean(window.__enduranceGame));
}

async function runtimeSnapshot(page) {
  return page.evaluate(() => {
    const game = window.__enduranceGame;
    const snapshot = game.getSnapshot();
    return {
      ...snapshot,
      board: {
        evenCols: game.B.evenCols,
        oddCols: game.B.oddCols,
        radius: game.B.RAD,
        topY: game.B.rowY(0),
        maxRow: game.B.MAXROW,
        lowestRow: game.B.lowestRow(game.grid),
        topCount: game.B.rowCount(game.grid, 0),
      },
      atmosphere: game.renderState().enduranceAtmosphere,
    };
  });
}

async function verifyDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await openEndurance(page, 'artifacts/endurance-v2-intro.png');
  assert((await page.locator('#statOneLabel').textContent()) === 'Czas', 'Endurance HUD should show time');
  assert((await page.locator('#statTwoLabel').textContent()) === 'Kolory', 'Endurance HUD should show color count');
  assert((await page.locator('#statThreeLabel').textContent()) === '', 'Endurance HUD should not expose a third run stat');
  assert((await page.locator('#dropValue').textContent()) === '4', 'Endurance should start with four colors');

  const start = await runtimeSnapshot(page);
  assert(start.board.evenCols === 11 && start.board.oddCols === 10, `expected fixed 11/10 geometry, got ${start.board.evenCols}/${start.board.oddCols}`);
  assert(Math.abs(start.board.topY - start.board.radius) < .001, 'top row should touch the logical ceiling');
  assert(start.board.topCount === 11, 'initial top pressure row should be full');
  assert(start.board.radius < 12, 'Endurance orb radius should be smaller than campaign base radius');
  await page.screenshot({ path: 'artifacts/endurance-v2-start.png', fullPage: true });

  const beforeMiss = await runtimeSnapshot(page);
  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
    game.emitState();
  });
  await page.waitForFunction((rows) => window.__enduranceGame?.rowsAdded === rows + 1, beforeMiss.rowsAdded);
  const afterMiss = await runtimeSnapshot(page);
  assert(afterMiss.rowsAdded === beforeMiss.rowsAdded + 1, 'one miss must add exactly one pressure row');
  assert(afterMiss.board.lowestRow === beforeMiss.board.lowestRow + 1, 'miss pressure should shift the board down exactly one row');
  await page.screenshot({ path: 'artifacts/endurance-v2-miss-row.png', fullPage: true });

  const rowsBeforeSuccess = afterMiss.rowsAdded;
  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.afterResolvedEnduranceShot({ popped: 0, dropped: 4, turnScore: 100 });
    game.emitState();
  });
  const afterSuccess = await runtimeSnapshot(page);
  assert(afterSuccess.rowsAdded === rowsBeforeSuccess, 'drop-only success must not add a pressure row');
  assert(afterSuccess.combo === 1, 'successful resolution should build combo');

  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.elapsedMs = 59_999;
    game.update(.001);
  });
  await page.waitForFunction(() => document.querySelector('#dropValue')?.textContent === '5');
  assert((await page.locator('.combo-callout').textContent()) === 'NOWY KOLOR', '60s threshold should announce a new color');
  assert(await page.locator('.combo-callout').evaluate((node) => getComputedStyle(node).pointerEvents === 'none'), 'palette callout must not block pointer input');
  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.elapsedMs = 60_750;
    game.emitState();
  });
  await page.waitForTimeout(60);
  let stage = await runtimeSnapshot(page);
  assert(stage.colorCount === 5 && stage.paletteStage === 1, '60s stage should use five colors');
  assert(stage.atmosphere.stage === 1 && stage.atmosphere.progress > 0 && stage.atmosphere.progress < 1, 'late-day crossfade should still be active around +750ms');
  await page.screenshot({ path: 'artifacts/endurance-v2-five-colors.png', fullPage: true });

  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.elapsedMs = 119_999;
    game.update(.001);
  });
  await page.waitForFunction(() => document.querySelector('#dropValue')?.textContent === '6');
  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.elapsedMs = 120_750;
    game.emitState();
  });
  await page.waitForTimeout(60);
  stage = await runtimeSnapshot(page);
  assert(stage.colorCount === 6 && stage.paletteStage === 2, '120s stage should use six colors');
  assert(stage.atmosphere.stage === 2 && stage.atmosphere.progress > 0 && stage.atmosphere.progress < 1, 'sunset crossfade should still be active around +750ms');
  await page.screenshot({ path: 'artifacts/endurance-v2-six-colors.png', fullPage: true });

  await page.evaluate(() => {
    const game = window.__enduranceGame;
    game.elapsedMs = 400_000;
    game.advancePaletteStage();
    game.emitState();
  });
  assert((await runtimeSnapshot(page)).colorCount === 6, 'Endurance difficulty must stay capped at six colors after 120s');

  const specialCases = [
    ['guide', 2, 'GUIDE — pokazuje pełną trajektorię', 'artifacts/endurance-v2-guide.png'],
    ['bomb', 1, 'BOMB — niszczy obszar', 'artifacts/endurance-v2-bomb.png'],
    ['rainbow', 0, 'RAINBOW — dopasowuje kolor', 'artifacts/endurance-v2-rainbow.png'],
  ];
  for (const [type, color, label, path] of specialCases) {
    await page.evaluate(({ type, color }) => {
      const game = window.__enduranceGame;
      game.lastSpecialCalloutAt.delete(type);
      game.queue = [{ type, color }, ...game.queue.slice(1)];
      game.maybeAnnounceActiveSpecial();
      game.emitState();
    }, { type, color });
    await page.waitForFunction((expected) => document.querySelector('.combo-callout')?.textContent === expected, label);
    assert(await page.locator('.combo-callout').evaluate((node) => node.classList.contains('is-special-ready')), `${type} should use the special-ready callout`);
    assert(await page.locator('.combo-callout').evaluate((node) => getComputedStyle(node).pointerEvents === 'none'), `${type} callout must not block pointer input`);
    await page.waitForTimeout(80);
    await page.screenshot({ path, fullPage: true });
  }

  await page.evaluate(() => {
    const game = window.__enduranceGame;
    for (let i = 0; i < 20 && game.status === 'playing'; i += 1) {
      game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
    }
    game.emitState();
  });
  await page.waitForFunction(() => document.querySelector('#resultDialog')?.open === true, null, { timeout: 3000 });
  assert(await page.locator('#resultStars').isHidden(), 'Endurance result should not show campaign stars');
  assert(await page.locator('#resultMasteries').isHidden(), 'Endurance result should not show campaign mastery');
  assert(await page.locator('#nextButton').isHidden(), 'Endurance result should not show Next');
  assert(!(await page.locator('#resultDialog').textContent()).includes('Runda'), 'Endurance v2 result should not mention rounds');
  await page.screenshot({ path: 'artifacts/endurance-v2-result.png', fullPage: true });

  await page.locator('#retryButton').click();
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.dataset.mode === 'endurance' && window.__enduranceGame?.status === 'playing');
  const retry = await runtimeSnapshot(page);
  assert(retry.rowsAdded === 0 && retry.colorCount === 4 && retry.combo === 0, 'retry should start a clean Endurance v2 run');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `Endurance desktop has ${overflow}px horizontal overflow`);
  assert(errors.length === 0, `Endurance desktop browser errors:\n${errors.join('\n')}`);
  await page.close();
}

async function verifyMobile(browser) {
  const viewport = { width: 390, height: 844 };
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await openEndurance(page, 'artifacts/mobile-endurance-v2-intro.png');
  const canvasBox = await page.locator('#gameCanvas').boundingBox();
  const minimumCanvasWidth = Math.min(300, viewport.width - 30);
  assert(canvasBox && canvasBox.width >= minimumCanvasWidth, `Endurance mobile canvas width ${canvasBox?.width ?? 0}px is below ${minimumCanvasWidth}px`);
  assert((await page.locator('#statOneLabel').textContent()) === 'Czas', 'mobile Endurance HUD should preserve time label');
  assert((await page.locator('#statTwoLabel').textContent()) === 'Kolory', 'mobile Endurance HUD should preserve color label');
  assert((await page.locator('#statThreeLabel').textContent()) === '', 'mobile Endurance HUD should not expose removed round stats');
  const state = await runtimeSnapshot(page);
  assert(state.board.evenCols === 11 && state.board.oddCols === 10, 'mobile Endurance should use the same fixed 11/10 board');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `Endurance mobile has ${overflow}px horizontal overflow`);
  await page.screenshot({ path: 'artifacts/mobile-endurance-v2.png', fullPage: true });
  assert(errors.length === 0, `Endurance mobile browser errors:\n${errors.join('\n')}`);
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyDesktop(browser);
  await verifyMobile(browser);
  console.log('OK: Endurance v2 fixed geometry, miss pressure, palette stages, specials, loss/retry and mobile layout passed');
} finally {
  await browser.close();
}
