import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  createEnduranceState,
  advanceRoundState,
  pressureAdjustmentSeconds,
  baseExpansionTimeSeconds,
  adjustedExpansionTimeSeconds,
  enduranceMultiplier,
  survivalBonus,
  clearBonus,
  paletteForStage,
  scheduledSpecialType,
  updateEnduranceRecords,
} from './src/endurance-core.mjs';

assert.equal(ENDURANCE_CONFIG.shotsPerRound, 3);
assert.deepEqual(createEnduranceState(), {
  round: 1,
  shotsInRound: 0,
  resolvedShots: 0,
  difficultyStage: 0,
  spatialStage: 0,
});

let state = createEnduranceState();
({ state } = advanceRoundState(state));
({ state } = advanceRoundState(state));
assert.equal(state.round, 1);
assert.equal(state.shotsInRound, 2);
({ state } = advanceRoundState(state));
assert.equal(state.round, 2);
assert.equal(state.shotsInRound, 0);
assert.equal(state.resolvedShots, 3);

assert.equal(pressureAdjustmentSeconds(.45), -8);
assert.equal(pressureAdjustmentSeconds(.60), 0);
assert.equal(pressureAdjustmentSeconds(.75), 8);
assert.equal(pressureAdjustmentSeconds(0), -8);
assert.equal(pressureAdjustmentSeconds(1), 8);
assert.equal(baseExpansionTimeSeconds(1), 55);
assert.equal(baseExpansionTimeSeconds(5), 205);
assert.equal(baseExpansionTimeSeconds(6), 232);
assert.equal(adjustedExpansionTimeSeconds(1, .45), 47);
assert.equal(adjustedExpansionTimeSeconds(1, .75), 63);

assert.equal(enduranceMultiplier(1), 1);
assert.equal(enduranceMultiplier(6), 1.25);
assert.equal(enduranceMultiplier(41), 3);
assert.equal(survivalBonus(6), 125);
assert.equal(clearBonus(6), 1250);

assert.deepEqual(paletteForStage(0), [1, 2, 3, 4]);
assert.deepEqual(paletteForStage(2), [1, 2, 3, 4]);
assert.deepEqual(paletteForStage(3), [1, 2, 3, 4, 5]);

assert.equal(scheduledSpecialType({ round: 3, resolvedShots: 12, previousWasSpecial: false }), null);
assert.equal(scheduledSpecialType({ round: 4, resolvedShots: 12, previousWasSpecial: false }), 'guide');
assert.equal(scheduledSpecialType({ round: 6, resolvedShots: 18, previousWasSpecial: false }), 'bomb');
assert.equal(scheduledSpecialType({ round: 8, resolvedShots: 24, previousWasSpecial: false }), 'rainbow');
assert.equal(scheduledSpecialType({ round: 8, resolvedShots: 24, previousWasSpecial: true }), null);

const updated = updateEnduranceRecords(
  { bestScore: 900, bestTimeMs: 50_000, bestRound: 8 },
  { score: 1200, elapsedMs: 45_000, round: 10 },
);
assert.deepEqual(updated.records, { bestScore: 1200, bestTimeMs: 50_000, bestRound: 10 });
assert.deepEqual(updated.newRecords, { score: true, time: false, round: true });

console.log('✓ Endurance core rules');
