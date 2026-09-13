import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  paletteStageAt,
  paletteForElapsed,
  enduranceComboMultiplier,
  classifyEnduranceResolution,
  scheduledSpecialType,
  specialShotLabel,
  generateEnduranceRow,
  generateInitialEnduranceGrid,
  updateEnduranceRecords,
} from './src/endurance-core.mjs';

assert.equal(ENDURANCE_CONFIG.initialRows, 4);
assert.equal(ENDURANCE_CONFIG.initialEvenCols, 11);
assert.equal(ENDURANCE_CONFIG.initialOddCols, 10);
assert.deepEqual(ENDURANCE_CONFIG.paletteThresholdMs, [60_000, 120_000]);

assert.equal(paletteStageAt(0), 0);
assert.equal(paletteStageAt(59_999), 0);
assert.equal(paletteStageAt(60_000), 1);
assert.equal(paletteStageAt(119_999), 1);
assert.equal(paletteStageAt(120_000), 2);
assert.equal(paletteStageAt(999_999), 2);
assert.deepEqual(paletteForElapsed(0), [1, 2, 3, 4]);
assert.deepEqual(paletteForElapsed(60_000), [1, 2, 3, 4, 5]);
assert.deepEqual(paletteForElapsed(120_000), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(paletteForElapsed(999_999), [1, 2, 3, 4, 5, 6]);

assert.deepEqual(classifyEnduranceResolution({ popped: 0, dropped: 0 }), { successful: false, removed: 0 });
assert.deepEqual(classifyEnduranceResolution({ popped: 3, dropped: 0 }), { successful: true, removed: 3 });
assert.deepEqual(classifyEnduranceResolution({ popped: 0, dropped: 4 }), { successful: true, removed: 4 });
assert.equal(enduranceComboMultiplier(1), 1);
assert.equal(enduranceComboMultiplier(2), 1.1);
assert.equal(enduranceComboMultiplier(11), 2);
assert.equal(enduranceComboMultiplier(99), 2);

assert.equal(scheduledSpecialType({ resolvedShots: 11, previousWasSpecial: false }), null);
assert.equal(scheduledSpecialType({ resolvedShots: 12, previousWasSpecial: false }), 'guide');
assert.equal(scheduledSpecialType({ resolvedShots: 20, previousWasSpecial: false }), 'bomb');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: false }), 'rainbow');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: true }), null);
assert.equal(specialShotLabel('bomb'), 'BOMB — niszczy obszar');
assert.equal(specialShotLabel('rainbow'), 'RAINBOW — dopasowuje kolor');
assert.equal(specialShotLabel('guide'), 'GUIDE — pokazuje pełną trajektorię');
assert.equal(specialShotLabel('normal'), '');

const fakeGeometry = {
  MAXROW: 4,
  rowCols: (r) => r % 2 ? 10 : 11,
  key: (c, r) => `${c},${r}`,
};
let i = 0;
const values = [.1, .1, .1, .7, .7, .2, .2, .9, .9, .3];
const row = generateEnduranceRow({
  geometry: fakeGeometry,
  targetRow: 0,
  palette: [1, 2, 3, 4],
  rng: () => values[(i++) % values.length],
});
assert.equal(row.length, 11);
for (let c = 2; c < row.length; c += 1) {
  assert(!(row[c - 2].color === row[c - 1].color && row[c - 1].color === row[c].color));
}
const initial = generateInitialEnduranceGrid({ geometry: fakeGeometry, palette: [1, 2, 3, 4], rng: () => .25, rows: 4 });
assert.equal(initial.size, 42);

const migrated = updateEnduranceRecords(
  { bestScore: 900, bestTimeMs: 50_000, bestRound: 8 },
  { score: 1200, elapsedMs: 45_000, bestCombo: 7 },
);
assert.deepEqual(migrated.records, { bestScore: 1200, bestTimeMs: 50_000, bestCombo: 7 });
assert.deepEqual(migrated.newRecords, { score: true, time: false, combo: true });

console.log('✓ Endurance v2 core rules');
