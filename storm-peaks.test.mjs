import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  SHOT_SPEED,
  shortTrajectoryPreview,
  stepProjectile,
  trajectoryPoints,
  velocityFromAngle,
} from './src/game-physics.mjs';
import {
  chooseDeepObjectiveKeys,
  deepObjectiveCandidates,
  lightningSpawnPlan,
  shouldTriggerLightning,
  windForResolvedShot,
} from './src/storm-core.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');
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

{
  const storm = { firstStrikeAfterShots: 4, intervalShots: 3, spawnCount: [2, 3] };
  assert.equal(shouldTriggerLightning(storm, 3, 0), false);
  assert.equal(shouldTriggerLightning(storm, 4, 0), true);
  assert.equal(shouldTriggerLightning(storm, 5, 1), false);
  assert.equal(shouldTriggerLightning(storm, 7, 1), true);

  const tightened = { firstStrikeAfterShots: 3, intervalShots: 2, spawnCount: [3, 4] };
  assert.equal(
    shouldTriggerLightning(tightened, 6, 1),
    true,
    'a cadence tightened after its exact threshold must catch up on the next resolved shot',
  );
}

{
  const grid = new Map([
    [B.key(3, 0), 1], [B.key(4, 0), 3], [B.key(5, 0), 1],
    [B.key(3, 1), 3], [B.key(4, 1), 1],
    [B.key(4, 2), 3],
  ]);
  const plan = lightningSpawnPlan({
    grid,
    objects: new Map(),
    B,
    palette: [1, 3],
    rng: () => 0.25,
    spawnCount: [2, 3],
    failureY: B.LAUNCH_Y - 17,
  });
  assert(plan.strikeKey && grid.has(plan.strikeKey), 'lightning should strike an occupied carrier cell');
  assert(plan.additions.length >= 2 && plan.additions.length <= 3, 'lightning should add the configured number of orbs');
  const grown = new Map(grid);
  for (const item of plan.additions) {
    assert(B.inGrid(item.c, item.r), `spawn ${item.c},${item.r} must fit the board`);
    assert(!grid.has(B.key(item.c, item.r)), 'lightning must not overwrite existing orbs');
    assert([1, 3].includes(item.color), 'lightning color must come from active palette');
    grown.set(B.key(item.c, item.r), item.color);
  }
  assert.equal(B.topConnected(grown, 0).size, grown.size, 'lightning additions must stay connected to the ceiling structure');
}

{
  const grid = new Map();
  for (let r = 0; r <= 4; r += 1) {
    for (let c = 3; c <= 5; c += 1) {
      if (B.inGrid(c, r)) grid.set(B.key(c, r), 1 + ((c + r) % 3));
    }
  }
  const deepKey = B.key(4, 2);
  const exposedKey = B.key(4, 4);
  const candidates = deepObjectiveCandidates({ grid, B, eligibleKeys: [deepKey, exposedKey] });
  assert(candidates.some((item) => item.key === deepKey), 'a protected middle carrier should qualify as a deep target');
  assert(!candidates.some((item) => item.key === exposedKey), 'a lowest-row carrier must not qualify while deep choices exist');
  assert.deepEqual(
    chooseDeepObjectiveKeys({ grid, B, eligibleKeys: [exposedKey, deepKey], count: 1, rng: () => 0 }),
    [deepKey],
    'objective selection should prefer the protected carrier over an exposed front cell',
  );
}

{
  const renderer = await fs.readFile(new URL('./src/game-renderer.mjs', import.meta.url), 'utf8');
  const windRenderer = await fs.readFile(new URL('./src/wind-renderer.mjs', import.meta.url), 'utf8');
  const audio = await fs.readFile(new URL('./src/audio.mjs', import.meta.url), 'utf8');
  assert(renderer.includes('drawCloudBand'), 'renderer should expose layered natural cloud bands');
  assert(renderer.includes('drawLightningBolt'), 'renderer should draw the gameplay lightning strike');
  assert(renderer.includes('segment.points'), 'short aim should draw simulated curved points, not just a straight chord');
  assert(windRenderer.includes('drawGlobalWind'), 'wind renderer should expose whole-board wind feedback');
  assert(!windRenderer.includes('zone.width'), 'global wind presentation should not paint rectangular corridor zones');
  assert(audio.includes('lightning()'), 'audio should have a dedicated procedural lightning cue');
}

console.log('✓ Storm Peaks Tasks 1-5 contracts');
