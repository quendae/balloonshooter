import assert from 'node:assert/strict';
import {
  SHOT_SPEED,
  shortTrajectoryPreview,
  stepProjectile,
  trajectoryPoints,
  velocityFromAngle,
} from './src/game-physics.mjs';

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
  assert(distance <= 44, `limited aim must stay short, got ${distance}`);
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

console.log('✓ Storm Peaks Task 1: whole-board wind and limited aim contract');
