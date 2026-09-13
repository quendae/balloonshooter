import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ENDURANCE_CONFIG } from './src/endurance-core.mjs';
import { EnduranceGame } from './src/endurance-game.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');
globalThis.BALLOON = B;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: true });

function fakeContext() {
  const gradient = { addColorStop() {} };
  const base = {
    imageSmoothingEnabled: true,
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

const callbacks = { states: 0, rows: 0, palettes: [] };
const game = new EnduranceGame(fakeCanvas(), {
  onState: () => { callbacks.states += 1; },
  onEnduranceRow: () => { callbacks.rows += 1; },
  onEndurancePalette: (event) => { callbacks.palettes.push(event); },
}, { config: ENDURANCE_CONFIG });

game.start('test-seed');
const start = game.getSnapshot();
assert.equal(start.colorCount, 4);
assert.equal(start.combo, 0);
assert.equal(start.bestCombo, 0);
assert.equal(start.rowsAdded, 0);
assert.equal(new Set([...game.grid.keys()].map((key) => game.B.split(key)[1])).size, 4);
assert.equal(game.status, 'playing');
assert.equal('round' in start, false);
assert.equal('shotsUntilRow' in start, false);
assert.equal('spatialStage' in start, false);

const rowsBefore = callbacks.rows;
game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
assert.equal(callbacks.rows, rowsBefore);
assert.equal(game.combo, 1);
assert.equal(game.bestCombo, 1);
assert.equal(game.score, 30);

game.afterResolvedEnduranceShot({ popped: 0, dropped: 4, turnScore: 100 });
assert.equal(callbacks.rows, rowsBefore, 'drop-only success must not add pressure');
assert.equal(game.combo, 2);
assert.equal(game.bestCombo, 2);
assert.equal(game.score, 140, 'second success uses the 1.1x Endurance combo multiplier');

const lowest = game.B.lowestRow(game.grid);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(callbacks.rows, rowsBefore + 1);
assert.equal(game.rowsAdded, 1);
assert.equal(game.misses, 1);
assert.equal(game.combo, 0);
assert.equal(game.B.lowestRow(game.grid), lowest + 1);

const paletteGame = new EnduranceGame(fakeCanvas(), {
  onEndurancePalette: (event) => callbacks.palettes.push(event),
}, { config: ENDURANCE_CONFIG });
paletteGame.start('palette-seed');
paletteGame.elapsedMs = 59_999;
paletteGame.update(.001);
assert.equal(paletteGame.getSnapshot().colorCount, 5);
assert.equal(paletteGame.paletteStage, 1);
paletteGame.setPaused(true);
const frozen = paletteGame.elapsedMs;
paletteGame.update(10);
assert.equal(paletteGame.elapsedMs, frozen, 'pause freezes active time');
paletteGame.setPaused(false);
paletteGame.elapsedMs = 119_999;
paletteGame.update(.001);
assert.equal(paletteGame.getSnapshot().colorCount, 6);
paletteGame.elapsedMs = 500_000;
assert.equal(paletteGame.getSnapshot().colorCount, 6, 'palette never grows beyond six colors');

const weatherEvents = [];
const weatherGame = new EnduranceGame(fakeCanvas(), {
  onEnduranceWeather: (event) => weatherEvents.push(event),
}, { config: ENDURANCE_CONFIG });
weatherGame.start('weather-seed');
const weatherStart = weatherGame.getSnapshot();
assert.equal(weatherStart.weather, 'clear');
assert.ok(weatherStart.weatherPhaseEndsMs >= 25_000 && weatherStart.weatherPhaseEndsMs <= 35_000);
weatherGame.elapsedMs = weatherStart.weatherPhaseEndsMs - 1;
weatherGame.update(.001);
assert.equal(weatherEvents.length, 1);
assert.notEqual(weatherGame.getSnapshot().weather, 'clear');
weatherGame.setPaused(true);
const pausedWeather = weatherGame.getSnapshot();
weatherGame.update(30);
assert.equal(weatherGame.getSnapshot().weatherPhaseEndsMs, pausedWeather.weatherPhaseEndsMs);
weatherGame.setPaused(false);
weatherGame.weatherState.current = 'frost';
const frozenMeta = weatherGame.projectileMetadataForShot({ type: 'normal', color: 2 });
assert.deepEqual(frozenMeta, { weatherType: 'frost', collisionScale: .82 });
weatherGame.queue = [{ type: 'guide', color: 3 }, ...weatherGame.queue.slice(1)];
assert.equal(weatherGame.collisionScaleForAimShot(weatherGame.queue[0]), .82);
weatherGame.shoot();
assert.equal(weatherGame.projectile.weatherType, 'frost');
assert.equal(weatherGame.projectile.collisionScale, .82);
weatherGame.weatherState.current = 'clear';
assert.equal(weatherGame.projectile.collisionScale, .82, 'mid-flight thaw must not mutate projectile collision scale');

const clearGame = new EnduranceGame(fakeCanvas(), {}, { config: ENDURANCE_CONFIG });
clearGame.start('clear-seed');
const beforeClear = clearGame.score;
clearGame.clearBonusArmed = true;
clearGame.grid.clear();
assert.equal(clearGame.applyEnduranceClearBonus(), true);
assert.equal(clearGame.score, beforeClear + 1000);
const once = clearGame.score;
assert.equal(clearGame.applyEnduranceClearBonus(), false);
assert.equal(clearGame.score, once);
assert.equal(clearGame.status, 'playing', 'empty board is a bonus state, not a terminal state');

const doomed = new EnduranceGame(fakeCanvas(), {}, { config: ENDURANCE_CONFIG });
doomed.start('doomed');
const bottom = doomed.B.MAXROW;
doomed.grid = new Map([[doomed.B.key(0, bottom), 1]]);
doomed.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(doomed.status, 'lost', 'a miss that overflows fixed capacity ends Endurance');

const queueGame = new EnduranceGame(fakeCanvas(), {}, { config: ENDURANCE_CONFIG });
queueGame.start('special-seed');
assert.equal(queueGame.queue.some((shot) => shot.type !== 'normal'), false);
while (queueGame.issuedShots < 13) queueGame.nextShot();
const scheduled = queueGame.nextShot();
assert.ok(['normal', 'guide', 'bomb', 'rainbow'].includes(scheduled.type));

const snapshot = game.getSnapshot();
assert.equal(snapshot.resolvedShots, 3);
assert.equal(snapshot.rowsAdded, 1);
assert.equal(snapshot.bestCombo, 2);
assert.equal(snapshot.colorCount, 4);

console.log('✓ Endurance v2 miss-pressure runtime');
