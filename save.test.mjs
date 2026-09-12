import assert from 'node:assert/strict';
import { normalizeProgress } from './src/save.mjs';

const migrated = normalizeProgress({
  version: 1,
  levels: {
    'meadow-01': { stars: 2, score: 500, completed: true, masteries: [] },
  },
  settings: { sound: false },
});
assert.deepEqual(migrated.endurance, { bestScore: 0, bestTimeMs: 0, bestRound: 0 });
assert.equal(migrated.levels['meadow-01'].stars, 2);
assert.equal(migrated.settings.sound, false);

const normalized = normalizeProgress({
  endurance: { bestScore: 1234, bestTimeMs: 65_000, bestRound: 9 },
});
assert.deepEqual(normalized.endurance, { bestScore: 1234, bestTimeMs: 65_000, bestRound: 9 });

const sanitized = normalizeProgress({
  endurance: { bestScore: -5, bestTimeMs: '70000', bestRound: 7.9 },
});
assert.deepEqual(sanitized.endurance, { bestScore: 0, bestTimeMs: 70_000, bestRound: 7 });

console.log('✓ Endurance save migration');
