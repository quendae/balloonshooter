import assert from 'node:assert/strict';
import * as core from './src/sky-rescue-core.mjs';
import * as physics from './src/game-physics.mjs';
import { LEVELS } from './src/levels.mjs';

assert.equal(typeof core.activeGridColors, 'function', 'core should expose activeGridColors');
assert.equal(typeof core.reconcileShotQueue, 'function', 'core should expose reconcileShotQueue');
assert.equal(typeof core.impactFeedback, 'function', 'core should expose impactFeedback');
assert.equal(typeof physics.shortAimSegment, 'function', 'physics should expose shortAimSegment');

const grid = new Map([['0,0', 1], ['1,0', 3], ['2,0', 3], ['3,0', 6]]);
assert.deepEqual(core.activeGridColors(grid), [1, 3, 6], 'active colors should be unique and sorted');

const queue = [
  { type: 'normal', color: 2 },
  { type: 'bomb', color: 3 },
  { type: 'rainbow', color: 0 },
  { type: 'guide', color: 5 },
];
const reconciled = core.reconcileShotQueue(queue, [1, 3, 6], () => 6);
assert.deepEqual(reconciled.map((shot) => shot.color), [6, 3, 0, 6], 'removed colors in queued shots should be replaced immediately');
assert.equal(reconciled[2].type, 'rainbow', 'rainbow should remain colorless');

const segment = physics.shortAimSegment({ x: 120, y: 288, angle: -Math.PI / 2, length: 36 });
assert.deepEqual(segment.start, { x: 120, y: 276 }, 'short aim guide should begin just above the current orb');
assert.ok(Math.abs(segment.end.x - 120) < 1e-9, 'vertical aim should stay centered');
assert.equal(segment.end.y, 240, 'short aim guide should be short and non-predictive');

const small = core.impactFeedback({ popped: 3, dropped: 0, special: 'normal', boss: false });
const avalanche = core.impactFeedback({ popped: 4, dropped: 8, special: 'normal', boss: false });
const bomb = core.impactFeedback({ popped: 5, dropped: 2, special: 'bomb', boss: false });
assert.ok(small.shake > 0 && small.shake < avalanche.shake, 'avalanches should shake more than small pops');
assert.ok(bomb.flash >= small.flash, 'bomb feedback should be at least as strong as a normal pop');
assert.ok(avalanche.particlesPerOrb > small.particlesPerOrb, 'large cascades should emit more particles');

assert.equal(LEVELS.length, 15, 'campaign should still ship 15 levels');
assert.ok(LEVELS.every((level) => level.atmosphere?.timeOfDay && level.atmosphere?.weather), 'every level needs explicit time-of-day and weather');
const times = new Set(LEVELS.map((level) => level.atmosphere.timeOfDay));
const weather = new Set(LEVELS.map((level) => level.atmosphere.weather));
assert.ok(times.has('morning') && times.has('day') && times.has('sunset') && times.has('night'), 'campaign should visibly travel through the day');
assert.ok(weather.size >= 5, 'campaign should contain several distinct weather moods');
assert.equal(LEVELS.at(-1).atmosphere.timeOfDay, 'night', 'storm boss should happen at night');
assert.equal(LEVELS.at(-1).atmosphere.weather, 'storm', 'storm boss should use storm weather');

console.log('OK: gameplay polish contracts passed');
