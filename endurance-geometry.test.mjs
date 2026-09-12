import assert from 'node:assert/strict';
import {
  createEnduranceGeometry,
  canExpandSpatially,
  remapGridForExpansion,
  shiftGridForNewRow,
  failureLineReached,
} from './src/endurance-geometry.mjs';
import {
  generateEnduranceRow,
  generateInitialEnduranceGrid,
} from './src/endurance-core.mjs';

const g0 = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
assert.equal(g0.rowCols(0), 10);
assert.equal(g0.rowCols(1), 9);
assert.equal(g0.MAXROW, 9);
assert.equal(g0.RAD, 12);

const g1 = createEnduranceGeometry({ spatialStage: 1, rowPhase: 0 });
assert.equal(g1.rowCols(0), 12);
assert.equal(g1.rowCols(1), 11);
assert.equal(g1.MAXROW, 11);
assert(g1.RAD < g0.RAD);
assert(g1.RAD >= 6.5);

for (const g of [g0, g1, createEnduranceGeometry({ spatialStage: 4, rowPhase: 0 })]) {
  for (let r = 0; r <= g.MAXROW; r += 1) {
    for (let c = 0; c < g.rowCols(r); c += 1) {
      const x = g.colX(c, r);
      assert(x - g.RAD >= -0.001);
      assert(x + g.RAD <= g.LW + 0.001);
      for (const [nc, nr] of g.neighbors(c, r)) {
        assert(g.neighbors(nc, nr).some(([cc, rr]) => cc === c && rr === r));
      }
    }
  }
}

assert.equal(canExpandSpatially(4), false);

const before = new Map([[g0.key(0, 0), 1], [g0.key(4, 2), 2], [g0.key(8, 3), 3]]);
const expanded = remapGridForExpansion(before);
assert.deepEqual([...expanded.keys()], ['1,0', '5,2', '9,3']);
assert.equal(expanded.size, before.size);

const shifted = shiftGridForNewRow(before, g0);
assert.equal(shifted.nextRowPhase, 1);
assert.equal(shifted.grid.size, before.size);
assert.equal(shifted.overflowed, false);

const bottom = new Map([[g0.key(4, g0.MAXROW), 1]]);
const overflow = shiftGridForNewRow(bottom, g0);
assert.equal(overflow.overflowed, true, 'cells may never silently disappear beyond max row capacity');
assert.equal(failureLineReached(new Map([[g0.key(4, g0.MAXROW), 1]]), g0), false);

let i = 0;
const values = [.1, .1, .1, .7, .7, .2, .2, .9, .9, .3];
const row = generateEnduranceRow({
  geometry: g0,
  targetRow: 0,
  palette: [1, 2, 3, 4],
  rng: () => values[(i++) % values.length],
});
assert.equal(row.length, g0.rowCols(0));
for (let c = 2; c < row.length; c += 1) {
  assert(!(row[c - 2].color === row[c - 1].color && row[c - 1].color === row[c].color));
}

const initial = generateInitialEnduranceGrid({
  geometry: g0,
  palette: [1, 2, 3, 4],
  rng: () => .25,
  rows: 4,
});
assert.equal(new Set([...initial.keys()].map((key) => g0.split(key)[1])).size, 4);

console.log('✓ Endurance geometry and row generation');
