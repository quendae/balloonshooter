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

const callbacks = { states: 0, rows: 0 };
const game = new EnduranceGame(fakeCanvas(), {
  onState: () => { callbacks.states += 1; },
  onEnduranceRow: () => { callbacks.rows += 1; },
}, { config: ENDURANCE_CONFIG });

game.start('test-seed');
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 0);
assert.equal(new Set([...game.grid.keys()].map((key) => game.B.split(key)[1])).size, 4);
assert.equal(game.status, 'playing');
assert([1, 2, 3, 4].includes(game.pickColor()));
assert.equal(game.getSnapshot().shotsUntilRow, 3);

game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 2);
assert.equal(game.getSnapshot().shotsUntilRow, 1);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 2);
assert.equal(game.shotsInRound, 0);
assert.equal(callbacks.rows, 1);
assert.equal(game.getSnapshot().shotsUntilRow, 3);

const before = game.score;
game.clearBonusArmed = true;
game.grid.clear();
game.applyEnduranceClearBonus();
assert(game.score > before);
const once = game.score;
game.applyEnduranceClearBonus();
assert.equal(game.score, once);
assert.equal(game.status, 'playing', 'empty Endurance board is a bonus state, not a win/loss');

const doomed = new EnduranceGame(fakeCanvas(), {}, { config: ENDURANCE_CONFIG });
doomed.start('doomed');
const bottom = doomed.B.MAXROW;
doomed.grid = new Map([[doomed.B.key(0, bottom), 1]]);
doomed.shotsInRound = 2;
doomed.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(doomed.status, 'lost', 'row overflow should end Endurance exactly at pressure limit');

console.log('✓ Endurance round runtime');
