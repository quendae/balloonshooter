import assert from 'node:assert/strict';
import { ENDURANCE_CONFIG } from './src/endurance-core.mjs';
import {
  PROFILE,
  candidateConfigs,
  classifyCandidate,
  frostCandidateConfigs,
  runFrostMatrix,
  runMatrix,
  simulateRun,
  summarizeResults,
} from './tools/endurance-balance.mjs';

assert.deepEqual(Object.keys(PROFILE), ['casual', 'average', 'strong']);
assert.equal(candidateConfigs().some((item) => item.id === 'baseline-60-120'), true);

const baselineBefore = JSON.stringify(ENDURANCE_CONFIG);
const a = simulateRun({ seed: 12345, profile: 'average', config: ENDURANCE_CONFIG, maxSeconds: 240 });
const b = simulateRun({ seed: 12345, profile: 'average', config: ENDURANCE_CONFIG, maxSeconds: 240 });
assert.deepEqual(a, b, 'fixed seed/profile/config must produce byte-for-byte deterministic results');
assert.equal(a.profile, 'average');
assert.ok(a.survivalMs > 0);
assert.ok(a.resolvedShots > 0);
assert.ok(a.missRate >= 0 && a.missRate <= 1);
assert.ok(a.rowsAdded >= 0);
assert.ok(a.bestCombo >= 0);
assert.ok(a.specials && typeof a.specials === 'object');
assert.equal(JSON.stringify(ENDURANCE_CONFIG), baselineBefore, 'simulator must never mutate production config');

const configs = candidateConfigs().slice(0, 2);
const matrixA = runMatrix({ runs: 4, seed: 777, configs, profiles: ['casual', 'average'], maxSeconds: 180 });
const matrixB = runMatrix({ runs: 4, seed: 777, configs, profiles: ['casual', 'average'], maxSeconds: 180 });
assert.deepEqual(matrixA, matrixB, 'matrix runner must be deterministic');
assert.equal(matrixA.runs.length, 16);

const summary = summarizeResults(matrixA);
assert.equal(summary.length, configs.length * 2);
for (const row of summary) {
  assert.ok(['casual', 'average'].includes(row.profile));
  assert.ok(Number.isFinite(row.medianSurvivalMs));
  assert.ok(Number.isFinite(row.p25SurvivalMs));
  assert.ok(Number.isFinite(row.p75SurvivalMs));
  assert.ok(Number.isFinite(row.medianScore));
  assert.ok(Number.isFinite(row.missRate));
}

const frostConfigs = frostCandidateConfigs();
assert.deepEqual(frostConfigs.map((item) => item.frostCollisionScale), [.76, .82, .88, 1]);
const frostA = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
const frostB = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
assert.deepEqual(frostA, frostB, 'Frost study must be deterministic');
assert.equal(frostA.runs.length, frostConfigs.length * 3);
for (const run of frostA.runs) {
  assert.ok(run.frostShare >= 0 && run.frostShare <= .401);
  assert.ok(run.scorePerMinute >= 0);
  assert.ok(run.frostShots >= 0);
  assert.ok(run.frostOnlyGapShots >= 0 && run.frostOnlyGapShots <= run.frostShots);
}
const frostSummary = summarizeResults(frostA);
for (const row of frostSummary) {
  assert.ok(Number.isFinite(row.medianScorePerMinute));
  assert.ok(row.meanFrostShare >= 0 && row.meanFrostShare <= .401);
  assert.ok(row.meanFrostOnlyGapRate >= 0 && row.meanFrostOnlyGapRate <= 1);
}

assert.equal(classifyCandidate({ casualMedianMs: 40_000, averageMedianMs: 80_000, strongMedianMs: 100_000 }), 'TOO HARD');
assert.equal(classifyCandidate({ casualMedianMs: 100_000, averageMedianMs: 180_000, strongMedianMs: 300_000 }), 'KEEP');
assert.equal(classifyCandidate({ casualMedianMs: 190_000, averageMedianMs: 320_000, strongMedianMs: 500_000 }), 'TOO EASY');

console.log('✓ deterministic Endurance balance harness');
