import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LEVELS } from './src/levels.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('every authored cell fits the production hex geometry', () => {
  for (const level of LEVELS) {
    for (const { c, r } of level.grid) {
      assert.equal(B.inGrid(c, r), true, `${level.id}: ${c},${r} is outside the board`);
    }
  }
});

test('every authored level starts as one ceiling-connected structure', () => {
  for (const level of LEVELS) {
    const grid = new Map(level.grid.map(({ c, r, color }) => [B.key(c, r), color]));
    const connected = B.topConnected(grid, 0);
    assert.equal(
      connected.size,
      grid.size,
      `${level.id}: ${grid.size - connected.size} balloons start detached from the ceiling`,
    );
  }
});

test('every mission object is attached to a real balloon', () => {
  for (const level of LEVELS) {
    const occupied = new Set(level.grid.map(({ c, r }) => B.key(c, r)));
    for (const object of level.objects) {
      assert.equal(occupied.has(B.key(...object.at)), true, `${level.id}: ${object.id} has no carrier balloon`);
    }
  }
});
