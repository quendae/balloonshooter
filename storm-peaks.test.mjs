import assert from 'node:assert/strict';
import {
  SHOT_SPEED,
  shortTrajectoryPreview,
  stepProjectile,
  trajectoryPoints,
  velocityFromAngle,
} from './src/game-physics.mjs';
import { windForResolvedShot } from './src/storm-core.mjs';

const bounds = { minX: 12, maxX: 228 };

{
  const start = { x: 120, y: 270, vx: 0, vy: -SHOT_SPEED };
  const next = stepProjectile(start, 0.1, bounds, { forceX: 180, forceY: 0 });
  assert(next.vx > 0, 'whole-board wind must accelerate a projectile regardless of x/y');
}

{
  const velocity = velocityFromAngle(-Math.PI / 2, SHOT_SPEED);
  const points = shortTrajectoryPreview({
    x: 120, y: 270, ...velocity,
    bounds,
    ceilingY: 20,
    collides: () => false,
    wind: { forceX: 220, forceY: 0 },
    maxDistance: 40,
  });
  assert(points.length >= 2, 'limited aim needs more than one simulated point');
  assert(points.at(-1).x > points[0].x, 'limited aim must visibly curve with rightward wind');
  const distance = Math.hypot(points.at(-1).x - 120, points.at(-1).y - 270);
  assert(distance <= 40.001, `limited aim must stay short, got ${distance}`);
}

{
  const velocity = velocityFromAngle(-2.75, SHOT_SPEED);
  const short = shortTrajectoryPreview({
    x: 18, y: 270, ...velocity,
    bounds,
    ceilingY: 20,
    collides: () => false,
    wind: { forceX: 0, forceY: 0 },
    maxDistance: 40,
  });
  assert(short.every((point) => point.x > bounds.minX), 'normal short preview must stop before first rebound');

  const full = trajectoryPoints({
    x: 18, y: 270, ...velocity,
    bounds,
    ceilingY: 20,
    collides: () => false,
    wind: { forceX: 0, forceY: 0 },
  });
  assert(full.some((point, i) => i > 0 && point.x > full[i - 1].x), 'Guide/full simulator must still include post-rebound travel');
}

{
  const level = {
    wind: { forceX: 100, forceY: 0 },
    windSequence: [
      { forceX: 120, forceY: 0 },
      { forceX: 120, forceY: 0 },
      { forceX: -140, forceY: 0 },
      { forceX: -140, forceY: 0 },
    ],
  };
  assert.deepEqual(windForResolvedShot(level, 0), { forceX: 120, forceY: 0 });
  assert.deepEqual(windForResolvedShot(level, 1), { forceX: 120, forceY: 0 });
  assert.deepEqual(windForResolvedShot(level, 2), { forceX: -140, forceY: 0 });
  assert.deepEqual(windForResolvedShot(level, 6), { forceX: -140, forceY: 0 });
}

{
  const frozen = { forceX: 90, forceY: -10 };
  const changedLevelWind = { forceX: -250, forceY: 0 };
  const start = { x: 120, y: 270, vx: 0, vy: -SHOT_SPEED, wind: frozen };
  const live = stepProjectile(start, .1, bounds, start.wind);
  const wrong = stepProjectile(start, .1, bounds, changedLevelWind);
  assert.notEqual(live.vx, wrong.vx, 'launched projectile must remain bound to its frozen wind');
}

console.log('✓ Storm Peaks Tasks 1-2: wind physics, limited aim, and frozen sequences');
