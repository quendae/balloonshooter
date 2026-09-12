import assert from 'node:assert/strict';
import { stepProjectile, windAtPoint } from './src/game-physics.mjs';
import { LEVELS } from './src/levels.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const bounds = { minX: 12, maxX: 228 };

test('legacy windAtPoint compatibility still sums matching zones during migration', () => {
  const zones = [
    { x: 40, y: 60, width: 100, height: 120, forceX: 30, forceY: 0 },
    { x: 60, y: 80, width: 40, height: 40, forceX: -10, forceY: -4 },
    { x: 180, y: 20, width: 30, height: 50, forceX: 99, forceY: 99 },
  ];
  assert.deepEqual(windAtPoint(zones, 70, 100), { x: 20, y: -4 });
  assert.deepEqual(windAtPoint(zones, 10, 10), { x: 0, y: 0 });
});

test('whole-board wind accelerates a projectile everywhere', () => {
  const wind = { forceX: 40, forceY: -8 };
  const a = stepProjectile({ x: 80, y: 120, vx: 20, vy: -100 }, 0.25, bounds, wind);
  const b = stepProjectile({ x: 180, y: 220, vx: 20, vy: -100 }, 0.25, bounds, wind);
  assert.equal(a.vx, 30);
  assert.equal(a.vy, -102);
  assert.equal(b.vx, 30);
  assert.equal(b.vy, -102);
});

test('zero whole-board wind leaves projectile velocity unchanged', () => {
  assert.deepEqual(
    stepProjectile({ x: 80, y: 120, vx: 20, vy: -100 }, 0.25, bounds, { forceX: 0, forceY: 0 }),
    { x: 85, y: 95, vx: 20, vy: -100 },
  );
});

test('authored Forest and Storm content uses whole-board wind instead of rectangular zones', () => {
  const windyWorlds = LEVELS.filter((level) => level.world === 'forest' || level.world === 'storm');
  assert.equal(windyWorlds.length, 10);
  assert.ok(windyWorlds.every((level) => level.wind || level.windSequence), 'every Forest/Storm level should expose global wind');
  assert.ok(windyWorlds.every((level) => !(level.windZones || []).length), 'Forest/Storm should not author rectangle wind zones');
  assert.ok(LEVELS.filter((level) => level.world === 'meadow').every((level) => !level.wind && !level.windSequence), 'meadow remains the no-wind tutorial world');

  for (const level of windyWorlds) {
    const vectors = level.windSequence || [level.wind];
    assert.ok(vectors.length > 0, `${level.id}: wind vector list is empty`);
    assert.ok(vectors.every((wind) => Math.abs(wind?.forceX || 0) + Math.abs(wind?.forceY || 0) > 0), `${level.id}: wind must carry force`);
  }
});
