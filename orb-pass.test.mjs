import assert from 'node:assert/strict';
import * as physics from './src/game-physics.mjs';
import * as art from './src/pixel-art.mjs';
import { LEVELS } from './src/levels.mjs';

const classicPalette = [
  { base: '#ff4455', dark: '#9c1422', light: '#ff9aa5' },
  { base: '#a05cf0', dark: '#5a2a9c', light: '#cfa8ff' },
  { base: '#ffd93d', dark: '#b09000', light: '#fff0a0' },
  { base: '#4cc94c', dark: '#157d2a', light: '#a8f0a0' },
  { base: '#4da3ff', dark: '#164e9c', light: '#a8d8ff' },
  { base: '#ff6fb3', dark: '#a32a68', light: '#ffb3d8' },
];

assert.equal(physics.SHOT_SPEED, 460, 'campaign shot speed should match the original Balloon tempo');
assert.equal(typeof physics.shouldShowTrajectory, 'function', 'trajectory visibility should be a gameplay policy');
if (typeof physics.shouldShowTrajectory === 'function') {
  assert.equal(physics.shouldShowTrajectory({ type: 'normal' }), false, 'normal shots must not expose a trajectory');
  assert.equal(physics.shouldShowTrajectory({ type: 'bomb' }), false, 'bomb shots must not expose a trajectory');
  assert.equal(physics.shouldShowTrajectory({ type: 'rainbow' }), false, 'rainbow shots must not expose a trajectory');
  assert.equal(physics.shouldShowTrajectory({ type: 'guide' }), true, 'guide power-up should expose the trajectory for that shot only');
}

assert.deepEqual(art.CLASSIC_ORB_PALETTE, classicPalette, 'campaign orbs should reuse the exact original procedural palette');
assert.ok(LEVELS.some((level) => level.specials?.includes('guide')), 'authored campaign should introduce the guide power-up');
assert.ok(LEVELS.filter((level) => level.specials?.includes('guide')).length < LEVELS.length, 'guide must remain occasional rather than always available');

console.log('orb gameplay pass tests passed');
