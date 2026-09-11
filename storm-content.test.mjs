import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LEVELS, WORLDS } from './src/levels.mjs';
import { deepObjectiveCandidates } from './src/storm-core.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

assert.equal(WORLDS.length, 4, 'campaign should expose four worlds');
assert.equal(LEVELS.length, 20, 'campaign should expose exactly twenty levels');
assert.deepEqual(LEVELS.slice(-5).map((level) => level.id), [
  'storm-01', 'storm-02', 'storm-03', 'storm-04', 'storm-05',
]);
assert.equal(WORLDS.at(-1)?.id, 'storm');
assert.equal(WORLDS.at(-1)?.name, 'Burzowe Szczyty');

for (const level of LEVELS.filter((item) => item.world === 'forest' || item.world === 'storm')) {
  assert.ok(level.wind || level.windSequence, `${level.id}: windy content should use a whole-board wind vector or sequence`);
  assert.equal((level.windZones || []).length, 0, `${level.id}: legacy rectangular wind zones should be removed`);
}

const sixteen = LEVELS.find((level) => level.id === 'storm-01');
assert.equal(sixteen.objective.type, 'clear');
assert.ok((sixteen.wind?.forceX || 0) > 0, 'level 16 should teach a readable rightward crosswind');
assert.equal(sixteen.storm, undefined, 'level 16 should not introduce lightning yet');

const seventeen = LEVELS.find((level) => level.id === 'storm-02');
assert.equal(seventeen.objective.type, 'rescue');
assert.equal(seventeen.objective.amount, 1);
assert.ok(Array.isArray(seventeen.windSequence) && seventeen.windSequence.some((wind) => wind.forceX > 0) && seventeen.windSequence.some((wind) => wind.forceX < 0), 'level 17 should reverse wind between shots');

const eighteen = LEVELS.find((level) => level.id === 'storm-03');
assert.equal(eighteen.objective.type, 'collect');
assert.equal(eighteen.objective.amount, 2);
assert.deepEqual(eighteen.storm?.spawnCount, [2, 3]);
assert.ok(eighteen.storm?.firstStrikeAfterShots >= 3, 'first lightning lesson needs a readable grace period');

const nineteen = LEVELS.find((level) => level.id === 'storm-04');
assert.equal(nineteen.objective.type, 'survive');
assert.ok(nineteen.specials.includes('guide'), 'extreme wind lesson should provide one Guide special');
assert.deepEqual(nineteen.storm?.spawnCount, [3, 4]);

const twenty = LEVELS.find((level) => level.id === 'storm-05');
assert.equal(twenty.objective.type, 'anchors');
assert.equal(twenty.objective.amount, 3);
assert.equal(twenty.boss, true);
assert.deepEqual(twenty.specials, ['guide', 'bomb', 'rainbow']);
assert.equal(twenty.atmosphere?.timeOfDay, 'night');
assert.equal(twenty.atmosphere?.weather, 'storm');

for (const level of [seventeen, eighteen]) {
  const grid = new Map(level.grid.map(({ c, r, color }) => [B.key(c, r), color]));
  const eligibleKeys = (level.objectiveSlots || []).map(([c, r]) => B.key(c, r));
  const candidates = deepObjectiveCandidates({ grid, B, eligibleKeys });
  assert.ok(candidates.length >= level.objective.amount, `${level.id}: authored objective slots must contain enough genuinely deep carriers`);
}

console.log('✓ Storm Peaks content contract: four worlds, twenty levels, global wind and deep targets');
