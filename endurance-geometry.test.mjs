import assert from 'node:assert/strict';
import {
  createEnduranceGeometry,
  shiftGridForNewRow,
  failureLineReached,
} from './src/endurance-geometry.mjs';
import {
  generateEnduranceRow,
  generateInitialEnduranceGrid,
} from './src/endurance-core.mjs';

const g0 = createEnduranceGeometry({ rowPhase: 0 });
assert.equal(g0.rowCols(0), 11);
assert.equal(g0.rowCols(1), 10);
assert.ok(Math.abs(g0.RAD - (240 / 22)) < 1e-9);
assert.ok(Math.abs(g0.rowY(0) - g0.RAD) < 1e-9, 'top orb body must touch the y=0 ceiling');
assert.ok(g0.MAXROW >= 12, 'fixed board needs enough logical pressure depth');

const g1 = createEnduranceGeometry({ rowPhase: 1 });
assert.equal(g1.rowCols(0), 10);
assert.equal(g1.rowCols(1), 11);
assert.equal(g1.RAD, g0.RAD);

for (const g of [g0, g1]) {
  for (let r = 0; r <= g.MAXROW; r += 1) {
    for (let c = 0; c < g.rowCols(r); c += 1) {
      const x = g.colX(c, r);
      assert(x - g.RAD >= -0.001);
      assert(x + g.RAD <= g.LW + 0.001);
      for (const [nc, nr] of g.neighbors(c, r)) {
        assert(g.neighbors(nc, nr).some(([cc, rr]) => cc === c && rr === r), 'hex neighbors must be symmetric');
      }
    }
  }
}

const before = new Map([[g0.key(0, 0), 1], [g0.key(4, 2), 2], [g0.key(8, 3), 3]]);
const shifted = shiftGridForNewRow(before, g0);
assert.equal(shifted.nextRowPhase, 1);
assert.equal(shifted.grid.size, before.size);
assert.equal(shifted.overflowed, false);
for (const [key] of before) {
  const [c, r] = g0.split(key);
  const shiftedKey = g1.key(c, r + 1);
  assert(shifted.grid.has(shiftedKey));
  assert.ok(Math.abs(g0.colX(c, r) - g1.colX(c, r + 1)) < 1e-9, 'row shift must preserve horizontal alignment');
}

const bottom = new Map([[g0.key(4, g0.MAXROW), 1]]);
const overflow = shiftGridForNewRow(bottom, g0);
assert.equal(overflow.overflowed, true, 'cells may never silently disappear beyond fixed capacity');
assert.equal(failureLineReached(bottom, g0), false, 'valid last logical row is still above the failure line');

let i = 0;
const values = [.1, .1, .1, .7, .7, .2, .2, .9, .9, .3];
const row = generateEnduranceRow({
  geometry: g0,
  targetRow: 0,
  palette: [1, 2, 3, 4],
  rng: () => values[(i++) % values.length],
});
assert.equal(row.length, 11);
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
assert.equal(initial.size, 42);

console.log('✓ Endurance fixed 11/10 geometry and row generation');
