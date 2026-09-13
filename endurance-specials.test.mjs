import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ENDURANCE_CONFIG } from './src/endurance-core.mjs';
import { EnduranceGame } from './src/endurance-game.mjs';
import * as pixelArt from './src/pixel-art.mjs';

const require = createRequire(import.meta.url);
globalThis.BALLOON = require('./balloon.js');
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: true });

function fakeContext() {
  const gradient = { addColorStop() {} };
  const base = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return target[prop];
      target[prop] = () => {};
      return target[prop];
    },
  });
}

function recordingContext() {
  const calls = { fill: 0, stroke: 0, fillRect: 0 };
  const ctx = fakeContext();
  ctx.fill = () => { calls.fill += 1; };
  ctx.stroke = () => { calls.stroke += 1; };
  ctx.fillRect = () => { calls.fillRect += 1; };
  return { ctx, calls };
}

const spriteContext = fakeContext();
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => spriteContext }),
};

function fakeCanvas() {
  const ctx = fakeContext();
  return {
    width: 0,
    height: 0,
    tabIndex: 0,
    getContext: () => ctx,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 960 }),
  };
}

assert.equal(typeof pixelArt.drawSpecialOrb, 'function', 'specials need a dedicated full-orb renderer');
const pixelSource = await fs.readFile(new URL('./src/pixel-art.mjs', import.meta.url), 'utf8');
for (const marker of ['drawBombOrb', 'drawRainbowOrb', 'drawGuideOrb']) {
  assert.ok(pixelSource.includes(marker), `missing distinct special treatment: ${marker}`);
}
assert.ok(pixelSource.includes('drawSpecialOrb(ctx, type, x, y, 1, time)'), 'legacy special hook should delegate to the full-orb renderer');

const guideRecording = recordingContext();
pixelArt.drawSpecialOrb(guideRecording.ctx, 'guide', 0, 0, 1, 0);
assert.equal(guideRecording.calls.fill, 0, 'Guide must not paint an opaque filled body over the shot color');
assert.ok(guideRecording.calls.stroke >= 2, 'Guide should stay recognizable through ring/crosshair strokes');

const rendererSource = await fs.readFile(new URL('./src/game-renderer.mjs', import.meta.url), 'utf8');
assert.ok(rendererSource.includes('drawPixelSpecial'), 'shared shot path must render the delegated special body in launcher, queue and flight');
assert.ok(rendererSource.includes('this.animationTime'), 'renderer keeps a frame clock for animated shot presentation');

const events = [];
const game = new EnduranceGame(fakeCanvas(), {
  onEnduranceSpecialReady: (event) => events.push(event),
}, { config: ENDURANCE_CONFIG });
game.start('special-readability');

game.queue = [{ type: 'bomb', color: 1 }];
game.elapsedMs = 1_000;
assert.equal(game.maybeAnnounceActiveSpecial(), true);
assert.deepEqual(events.at(-1), { type: 'bomb', label: 'BOMB — niszczy obszar' });
assert.equal(game.maybeAnnounceActiveSpecial(), false, 'same special should not spam inside cooldown');
assert.equal(events.length, 1);

game.elapsedMs += ENDURANCE_CONFIG.specialCalloutCooldownMs - 1;
assert.equal(game.maybeAnnounceActiveSpecial(), false);
game.elapsedMs += 1;
assert.equal(game.maybeAnnounceActiveSpecial(), true, 'same type may explain again after cooldown');
assert.equal(events.length, 2);

game.queue = [{ type: 'rainbow', color: 0 }];
assert.equal(game.maybeAnnounceActiveSpecial(), true, 'cooldown is per special type');
assert.deepEqual(events.at(-1), { type: 'rainbow', label: 'RAINBOW — dopasowuje kolor' });

game.queue = [{ type: 'guide', color: 2 }];
assert.equal(game.maybeAnnounceActiveSpecial(), true);
assert.deepEqual(events.at(-1), { type: 'guide', label: 'GUIDE — pokazuje pełną trajektorię' });

console.log('✓ Endurance special readability, Guide color visibility and callout cooldown');