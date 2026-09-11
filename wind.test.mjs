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

test('windAtPoint sums only wind zones that contain the projectile', () => {
  const zones = [
    { x: 40, y: 60, width: 100, height: 120, forceX: 30, forceY: 0 },
    { x: 60, y: 80, width: 40, height: 40, forceX: -10, forceY: -4 },
    { x: 180, y: 20, width: 30, height: 50, forceX: 99, forceY: 99 },
  ];
  assert.deepEqual(windAtPoint(zones, 70, 100), { x: 20, y: -4 });
  assert.deepEqual(windAtPoint(zones, 10, 10), { x: 0, y: 0 });
});

test('projectile receives deterministic wind acceleration inside a corridor', () => {
  const zones = [{ x: 40, y: 40, width: 120, height: 160, forceX: 40, forceY: 0 }];
  const next = stepProjectile({ x: 80, y: 120, vx: 20, vy: -100 }, 0.25, bounds, zones);
  assert.equal(next.vx, 30);
  assert.equal(next.vy, -100);
  assert.equal(next.x, 87.5);
  assert.equal(next.y, 95);
});

test('projectile flight remains unchanged outside wind corridors', () => {
  const zones = [{ x: 150, y: 20, width: 50, height: 50, forceX: 80, forceY: 0 }];
  assert.deepEqual(
    stepProjectile({ x: 80, y: 120, vx: 20, vy: -100 }, 0.25, bounds, zones),
    { x: 85, y: 95, vx: 20, vy: -100 },
  );
});

test('authored wind corridors stay inside the logical board and are introduced after the meadow tutorial', () => {
  const windy = LEVELS.filter((level) => (level.windZones || []).length > 0);
  assert.ok(windy.length >= 5, 'campaign should contain several authored wind levels');
  assert.ok(windy.every((level) => level.world !== 'meadow'), 'meadow should remain the no-wind tutorial world');
  assert.ok(LEVELS.filter((level) => level.world === 'forest').every((level) => (level.windZones || []).length > 0), 'every forest level should teach or combine wind');

  for (const level of windy) {
    for (const zone of level.windZones) {
      assert.ok(zone.x >= 0 && zone.y >= 0, `${level.id}: wind starts outside board`);
      assert.ok(zone.width > 0 && zone.height > 0, `${level.id}: wind zone has no area`);
      assert.ok(zone.x + zone.width <= 240, `${level.id}: wind exceeds board width`);
      assert.ok(zone.y + zone.height <= 320, `${level.id}: wind exceeds board height`);
      assert.ok(Math.abs(zone.forceX || 0) + Math.abs(zone.forceY || 0) > 0, `${level.id}: wind has no force`);
    }
  }
});
