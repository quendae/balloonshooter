import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolveShotOnGrid } from './src/shot-resolution.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

const grid = new Map([[B.key(3, 0), 1], [B.key(4, 0), 1]]);
const result = resolveShotOnGrid({
  grid,
  shot: { type: 'normal', color: 1 },
  c: 5,
  r: 0,
  geometry: B,
  pickColor: () => 1,
  ceilRow: 0,
});
assert.equal(result.popped.length, 3);
assert.equal(grid.size, 0);

const rainbowGrid = new Map([[B.key(3, 0), 2], [B.key(4, 0), 2]]);
const rainbow = resolveShotOnGrid({
  grid: rainbowGrid,
  shot: { type: 'rainbow', color: 0 },
  c: 5,
  r: 0,
  geometry: B,
  pickColor: () => 1,
  ceilRow: 0,
});
assert.equal(rainbow.placedColor, 2);
assert.equal(rainbowGrid.size, 0);

const gameSource = await fs.readFile(new URL('./src/game.mjs', import.meta.url), 'utf8');
assert.ok(gameSource.includes("import { resolveShotOnGrid } from './shot-resolution.mjs'"));
assert.ok(gameSource.includes('resolveShotOnGrid({'));

console.log('✓ shared shot resolver');
