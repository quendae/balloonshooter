import assert from 'node:assert/strict';
import {
  createSeededRng,
  evaluateObjective,
  calculateStars,
  scoreTurn,
  applyCampaignResult,
  isLevelUnlocked,
} from './src/sky-rescue-core.mjs';
import { LEVELS } from './src/levels.mjs';
import { normalizeProgress } from './src/save.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('seeded RNG returns the same sequence for the same seed', () => {
  const a = createSeededRng(12345);
  const b = createSeededRng(12345);
  assert.deepEqual([a(), a(), a(), a()], [b(), b(), b(), b()]);
});

test('clear objective completes only when no balloons remain', () => {
  assert.equal(evaluateObjective({ type: 'clear' }, { remainingBalloons: 1 }).complete, false);
  assert.equal(evaluateObjective({ type: 'clear' }, { remainingBalloons: 0 }).complete, true);
});

test('rescue, collect, anchors and survive objectives expose progress', () => {
  assert.deepEqual(
    evaluateObjective({ type: 'rescue', amount: 2 }, { rescued: 1 }),
    { complete: false, current: 1, target: 2 }
  );
  assert.equal(evaluateObjective({ type: 'collect', amount: 3 }, { collected: 3 }).complete, true);
  assert.equal(evaluateObjective({ type: 'anchors', amount: 2 }, { anchorsDestroyed: 2 }).complete, true);
  assert.equal(evaluateObjective({ type: 'survive', amount: 5 }, { turnsSurvived: 4 }).complete, false);
});

test('stars always award completion first, then score or optional challenge', () => {
  const thresholds = [0, 1400, 2200];
  assert.equal(calculateStars({ completed: false, score: 9999, thresholds }), 0);
  assert.equal(calculateStars({ completed: true, score: 700, thresholds }), 1);
  assert.equal(calculateStars({ completed: true, score: 1500, thresholds }), 2);
  assert.equal(calculateStars({ completed: true, score: 2300, thresholds }), 3);
  assert.equal(calculateStars({ completed: true, score: 1500, thresholds, optionalComplete: true }), 3);
});

test('turn scoring values dropped balloons more than normal pops', () => {
  const result = scoreTurn({ popped: 3, dropped: 4, combo: 2, objectiveBonus: 100, cascadeCount: 1 });
  assert.equal(result.normal, 30);
  assert.equal(result.dropped, 100);
  assert.equal(result.multiplier, 1.5);
  assert.equal(result.objectiveBonus, 100);
  assert.equal(result.cascadeBonus, 50);
  assert.equal(result.total, 345);
});

test('campaign progress keeps the best stars and best score', () => {
  let progress = { levels: {} };
  progress = applyCampaignResult(progress, 'meadow-01', 2, 900);
  progress = applyCampaignResult(progress, 'meadow-01', 1, 1200);
  assert.deepEqual(progress.levels['meadow-01'], { stars: 2, score: 1200, completed: true });
});

test('campaign unlocks levels sequentially', () => {
  const progress = { levels: { 'meadow-01': { stars: 1, score: 100, completed: true } } };
  assert.equal(isLevelUnlocked(LEVELS[0], LEVELS, progress), true);
  assert.equal(isLevelUnlocked(LEVELS[1], LEVELS, progress), true);
  assert.equal(isLevelUnlocked(LEVELS[2], LEVELS, progress), false);
});

test('campaign ships exactly three worlds with five authored levels each', () => {
  assert.equal(LEVELS.length, 15);
  const counts = LEVELS.reduce((acc, level) => {
    acc[level.world] = (acc[level.world] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { meadow: 5, clouds: 5, forest: 5 });
  assert.ok(LEVELS.some((level) => level.objective.type === 'rescue'));
  assert.ok(LEVELS.some((level) => level.objective.type === 'collect'));
  assert.ok(LEVELS.some((level) => level.objective.type === 'anchors'));
  assert.ok(LEVELS.some((level) => level.boss));
});

test('save normalization recovers safely from invalid or partial data', () => {
  assert.deepEqual(normalizeProgress(null), { version: 1, levels: {}, settings: { sound: true } });
  assert.deepEqual(normalizeProgress({ version: 1, levels: { 'meadow-01': { stars: 9, score: -5 } } }), {
    version: 1,
    levels: { 'meadow-01': { stars: 3, score: 0, completed: true } },
    settings: { sound: true },
  });
});
