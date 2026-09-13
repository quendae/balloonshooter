import assert from 'node:assert/strict';
import {
  createSeededRng,
  evaluateObjective,
  calculateStars,
  scoreTurn,
  applyCampaignResult,
  isLevelUnlocked,
  chooseRainbowColor,
  bombAffectedKeys,
  isOptionalComplete,
  evaluateMasteries,
} from './src/sky-rescue-core.mjs';
import { LEVELS } from './src/levels.mjs';
import { normalizeProgress } from './src/save.mjs';
import { clampAimAngle, stepProjectile, toLogicalPoint } from './src/game-physics.mjs';

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
  assert.deepEqual(evaluateObjective({ type: 'rescue', amount: 2 }, { rescued: 1 }), { complete: false, current: 1, target: 2 });
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

test('mastery awards reward trick shots, avalanches and perfect aim', () => {
  assert.deepEqual(evaluateMasteries({ successfulBankShots: 1, largestDrop: 8, misses: 0 }), ['bank-shot', 'avalanche', 'perfect-aim']);
  assert.deepEqual(evaluateMasteries({ successfulBankShots: 0, largestDrop: 5, misses: 2 }), []);
  assert.deepEqual(evaluateMasteries({ successfulBankShots: 3, largestDrop: 6, misses: 1 }), ['bank-shot', 'avalanche']);
});

test('campaign progress keeps the best stars, score and union of masteries', () => {
  let progress = { levels: {} };
  progress = applyCampaignResult(progress, 'meadow-01', 2, 900, ['bank-shot']);
  progress = applyCampaignResult(progress, 'meadow-01', 1, 1200, ['perfect-aim']);
  assert.deepEqual(progress.levels['meadow-01'], {
    stars: 2,
    score: 1200,
    completed: true,
    masteries: ['bank-shot', 'perfect-aim'],
  });
});

test('campaign unlocks levels sequentially', () => {
  const progress = { levels: { 'meadow-01': { stars: 1, score: 100, completed: true } } };
  assert.equal(isLevelUnlocked(LEVELS[0], LEVELS, progress), true);
  assert.equal(isLevelUnlocked(LEVELS[1], LEVELS, progress), true);
  assert.equal(isLevelUnlocked(LEVELS[2], LEVELS, progress), false);
});

test('campaign ships exactly four worlds with five authored levels each', () => {
  assert.equal(LEVELS.length, 20);
  const counts = LEVELS.reduce((acc, level) => {
    acc[level.world] = (acc[level.world] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { meadow: 5, clouds: 5, forest: 5, storm: 5 });
  assert.ok(LEVELS.some((level) => level.objective.type === 'rescue'));
  assert.ok(LEVELS.some((level) => level.objective.type === 'collect'));
  assert.ok(LEVELS.some((level) => level.objective.type === 'anchors'));
  assert.ok(LEVELS.some((level) => level.boss));
});

test('authored level objects are attached to valid occupied cells', () => {
  for (const level of LEVELS) {
    const occupied = new Set(level.grid.map(({ c, r }) => `${c},${r}`));
    assert.equal(occupied.size, level.grid.length, `${level.id} has duplicate cells`);
    for (const object of level.objects) assert.ok(occupied.has(object.at.join(',')), `${level.id} object ${object.id} is not attached to a balloon`);
  }
});

test('all authored cells fit the alternating 10/9-column hex board', () => {
  for (const level of LEVELS) {
    for (const { c, r } of level.grid) {
      assert.ok(r >= 0 && r <= 9, `${level.id} row ${r} is outside the board`);
      const cols = r & 1 ? 9 : 10;
      assert.ok(c >= 0 && c < cols, `${level.id} cell ${c},${r} is outside a ${cols}-column row`);
    }
  }
});

test('save normalization recovers safely from invalid or partial data', () => {
  const emptyEndurance = { bestScore: 0, bestTimeMs: 0, bestCombo: 0 };
  assert.deepEqual(normalizeProgress(null), {
    version: 1,
    levels: {},
    endurance: emptyEndurance,
    settings: { sound: true },
  });
  assert.deepEqual(normalizeProgress({ version: 1, levels: { 'meadow-01': { stars: 9, score: -5, masteries: ['bank-shot', 'garbage', 'bank-shot'] } } }), {
    version: 1,
    levels: { 'meadow-01': { stars: 3, score: 0, completed: true, masteries: ['bank-shot'] } },
    endurance: emptyEndurance,
    settings: { sound: true },
  });
});

test('rainbow chooses the most represented adjacent color', () => {
  const grid = new Map([['2,2', 1], ['3,2', 2], ['2,3', 2]]);
  const neighbors = () => [[2, 2], [3, 2], [2, 3]];
  assert.equal(chooseRainbowColor(grid, 2, 1, neighbors), 2);
});

test('bomb affects its landing cell and unique immediate neighbors', () => {
  const neighbors = () => [[1, 0], [0, 1], [1, 1], [1, 1]];
  assert.deepEqual(bombAffectedKeys(0, 0, neighbors).sort(), ['0,0', '0,1', '1,0', '1,1']);
});

test('optional challenge supports accuracy and shots-left rules', () => {
  assert.equal(isOptionalComplete({ type: 'accuracy', maxMisses: 2 }, { misses: 2, shotsRemaining: 0 }), true);
  assert.equal(isOptionalComplete({ type: 'accuracy', maxMisses: 2 }, { misses: 3, shotsRemaining: 9 }), false);
  assert.equal(isOptionalComplete({ type: 'shots-left', amount: 4 }, { misses: 10, shotsRemaining: 4 }), true);
});

test('aim angle is clamped to the playable upper arc', () => {
  assert.equal(clampAimAngle(0), -0.18);
  assert.equal(clampAimAngle(-Math.PI), -Math.PI + 0.18);
  assert.equal(clampAimAngle(-Math.PI / 2), -Math.PI / 2);
});

test('projectile step reflects from left and right walls without changing vertical speed', () => {
  const left = stepProjectile({ x: 5, y: 100, vx: -20, vy: -50 }, 0.1, { minX: 12, maxX: 228 });
  assert.equal(left.x, 12);
  assert.equal(left.vx, 20);
  assert.equal(left.vy, -50);
  const right = stepProjectile({ x: 235, y: 100, vx: 20, vy: -50 }, 0.1, { minX: 12, maxX: 228 });
  assert.equal(right.x, 228);
  assert.equal(right.vx, -20);
  assert.equal(right.vy, -50);
});

test('client coordinates map into logical canvas coordinates', () => {
  assert.deepEqual(toLogicalPoint(150, 260, { left: 50, top: 100, width: 400, height: 400 }, 240, 320), { x: 60, y: 128 });
});
