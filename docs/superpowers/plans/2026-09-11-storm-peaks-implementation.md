# Storm Peaks (Levels 16–20) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Sky Rescue from 15 to 20 levels with whole-board wind, wind-aware limited aiming, deterministic lightning pressure, deep objective placement, improved clouds, and the new Burzowe Szczyty world.

**Architecture:** Keep projectile integration in `src/game-physics.mjs`, move deterministic storm/deep-target rules into a new pure module `src/storm-core.mjs`, and let `src/game.mjs` orchestrate frozen-per-shot wind plus lightning events. Rendering remains in `src/game-renderer.mjs`, while `src/wind-renderer.mjs` becomes the compact whole-board wind visualizer instead of drawing rectangular corridors. Authored data stays in `src/levels.mjs`.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Node 22 assertion tests, Playwright browser smoke, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-storm-peaks-design.md`

## Global Constraints

- Campaign grows from exactly 15 to exactly 20 levels and from 3 to 4 worlds.
- New world ID is `storm`; display name is `Burzowe Szczyty`.
- Wind acts on the projectile only; attached board orbs remain static.
- Wind is frozen for the entire lifetime of one launched projectile.
- Wind may change only after a resolved shot.
- Normal aim preview shows only the first ~40 logical pixels and must stop before a rebound.
- `Guide` remains the only full trajectory predictor and may show rebounds.
- Lightning is turn-based, deterministic, and adds connected orbs instead of deleting orbs.
- Lightning spawn colors must come from the active board palette.
- Rescue/collect targets in levels 16–20 must use deep slots.
- Existing saves keyed by level ID remain valid without destructive migration.
- No economy, real-time timer, moving wind zones, random mid-flight gusts, or procedural whole-level generation.
- Preserve classic orb rendering, in-playfield current/next rack, dynamic color pruning, reduced-motion behavior, and mobile responsiveness.

---

### Task 1: Whole-board wind and wind-aware limited aim

**Files:**
- Modify: `src/game-physics.mjs`
- Modify: `src/game.mjs`
- Create: `storm-peaks.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `normalizeWind(wind) -> { forceX, forceY }`
- Produces: `stepProjectile(projectile, dt, bounds, wind) -> projectile`
- Produces: `trajectoryPoints({... , wind}) -> Array<{x,y}>`
- Produces: `shortTrajectoryPreview({... , wind, maxDistance}) -> Array<{x,y}>`
- `game.mjs` stores the launch-time vector on `projectile.wind` so live physics cannot drift if the level wind changes later.

- [ ] **Step 1: Write failing physics tests**

Add to `storm-peaks.test.mjs`:

```js
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
```

- [ ] **Step 2: Register the test and verify RED**

In `.github/workflows/ci.yml`, add after `Gameplay polish tests`:

```yaml
      - name: Storm Peaks tests
        run: node storm-peaks.test.mjs
```

Run in CI or locally:

```bash
node storm-peaks.test.mjs
```

Expected: FAIL because `shortTrajectoryPreview` does not exist and `stepProjectile` still consumes rectangular `windZones`.

- [ ] **Step 3: Implement the minimal whole-board physics**

In `src/game-physics.mjs`, replace zone lookup for the new path with:

```js
export function normalizeWind(wind = null) {
  return {
    forceX: Number(wind?.forceX) || 0,
    forceY: Number(wind?.forceY) || 0,
  };
}

export function stepProjectile(projectile, dt, bounds, wind = null) {
  const force = normalizeWind(wind);
  const next = {
    ...projectile,
    vx: projectile.vx + force.forceX * dt,
    vy: projectile.vy + force.forceY * dt,
  };
  next.x = projectile.x + next.vx * dt;
  next.y = projectile.y + next.vy * dt;

  if (next.x <= bounds.minX) {
    next.x = bounds.minX;
    next.vx = Math.abs(next.vx);
  } else if (next.x >= bounds.maxX) {
    next.x = bounds.maxX;
    next.vx = -Math.abs(next.vx);
  }
  return next;
}
```

Update `trajectoryPoints()` to accept `wind` and call `stepProjectile(..., wind)`.

Add:

```js
export function shortTrajectoryPreview({
  x, y, vx, vy, bounds, ceilingY, collides, wind = null,
  maxDistance = 40, step = 0.012, maxSteps = 40,
}) {
  const points = [];
  let projectile = { x, y, vx, vy };
  const origin = { x, y };

  for (let i = 0; i < maxSteps; i += 1) {
    const previousVx = projectile.vx;
    const next = stepProjectile(projectile, step, bounds, wind);
    const rebounded = Math.sign(previousVx) !== Math.sign(next.vx)
      && (next.x === bounds.minX || next.x === bounds.maxX);
    if (rebounded) break;
    projectile = next;
    points.push({ x: projectile.x, y: projectile.y });
    if (projectile.y <= ceilingY || collides(projectile.x, projectile.y)) break;
    if (Math.hypot(projectile.x - origin.x, projectile.y - origin.y) >= maxDistance) break;
  }
  return points;
}
```

- [ ] **Step 4: Freeze wind at launch in `game.mjs`**

Use the current level wind when the projectile is created:

```js
const wind = { ...(this.currentWind || this.level?.wind || { forceX: 0, forceY: 0 }) };
this.projectile = {
  ...shot,
  x: this.B.LW / 2,
  y: this.B.LAUNCH_Y,
  ...velocity,
  wind,
};
```

Use `this.projectile.wind` in live `stepProjectile()`. Use `this.currentWind` in both `shortTrajectoryPreview()` and `trajectoryPoints()` before launch. Remove `shortAimSegment()` from the gameplay rendering path.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
node storm-peaks.test.mjs
node wind.test.mjs
node orb-pass.test.mjs
node orb-rack.test.mjs
```

Expected: PASS.

Commit:

```bash
git add storm-peaks.test.mjs src/game-physics.mjs src/game.mjs .github/workflows/ci.yml
git commit -m "feat: add whole-board wind-aware aiming"
```

---

### Task 2: Deterministic wind sequences between shots

**Files:**
- Create: `src/storm-core.mjs`
- Modify: `src/game.mjs`
- Modify: `storm-peaks.test.mjs`

**Interfaces:**
- Produces: `windForResolvedShot(level, resolvedShots) -> {forceX, forceY}`
- Consumes level data shape:

```js
wind: { forceX, forceY }
windSequence: [{ forceX, forceY }, ...]
```

- [ ] **Step 1: Add failing sequence/frozen-shot tests**

Append to `storm-peaks.test.mjs`:

```js
import { windForResolvedShot } from './src/storm-core.mjs';

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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node storm-peaks.test.mjs
```

Expected: FAIL because `src/storm-core.mjs` / `windForResolvedShot` does not exist.

- [ ] **Step 3: Implement pure sequence resolver**

Create `src/storm-core.mjs`:

```js
export function windForResolvedShot(level = {}, resolvedShots = 0) {
  const sequence = Array.isArray(level.windSequence) ? level.windSequence : [];
  if (sequence.length) {
    const index = Math.min(sequence.length - 1, Math.max(0, Number(resolvedShots) || 0));
    const item = sequence[index] || sequence.at(-1);
    return { forceX: Number(item?.forceX) || 0, forceY: Number(item?.forceY) || 0 };
  }
  return {
    forceX: Number(level.wind?.forceX) || 0,
    forceY: Number(level.wind?.forceY) || 0,
  };
}
```

In `SkyRescueGame.start()` set:

```js
this.currentWind = windForResolvedShot(level, 0);
```

After a shot fully resolves in `land()`, update only for the next shot:

```js
this.currentWind = windForResolvedShot(this.level, this.shotsUsed);
```

Do this after `this.shotsUsed += 1`, never from `update(dt)`.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node storm-peaks.test.mjs
node sky-rescue.test.mjs
```

Expected: PASS.

Commit:

```bash
git add src/storm-core.mjs src/game.mjs storm-peaks.test.mjs
git commit -m "feat: freeze deterministic wind per shot"
```

---

### Task 3: Deterministic lightning schedule and connected spawn pressure

**Files:**
- Modify: `src/storm-core.mjs`
- Modify: `src/game.mjs`
- Modify: `src/sky-rescue-core.mjs`
- Modify: `storm-peaks.test.mjs`

**Interfaces:**
- Produces: `shouldTriggerLightning(storm, resolvedShots, strikesSoFar) -> boolean`
- Produces: `lightningSpawnPlan({ grid, objects, B, palette, rng, spawnCount, failureY }) -> { strikeKey, additions }`
- `additions` is `Array<{ c, r, color }>` and every addition must touch the current connected structure or a prior addition from the same plan.

- [ ] **Step 1: Add failing schedule tests**

Append:

```js
import {
  lightningSpawnPlan,
  shouldTriggerLightning,
} from './src/storm-core.mjs';

{
  const storm = { firstStrikeAfterShots: 4, intervalShots: 3, spawnCount: [2, 3] };
  assert.equal(shouldTriggerLightning(storm, 3, 0), false);
  assert.equal(shouldTriggerLightning(storm, 4, 0), true);
  assert.equal(shouldTriggerLightning(storm, 5, 1), false);
  assert.equal(shouldTriggerLightning(storm, 7, 1), true);
}
```

Add a small board fixture using `globalThis.BALLOON` or the same board helpers already used by `level-integrity.test.mjs`, then assert:

```js
const plan = lightningSpawnPlan({
  grid,
  objects: new Map(),
  B,
  palette: [1, 3],
  rng: () => 0.25,
  spawnCount: [2, 3],
  failureY: B.LAUNCH_Y - 17,
});
assert(plan.additions.length >= 2 && plan.additions.length <= 3);
for (const item of plan.additions) {
  assert(B.inGrid(item.c, item.r));
  assert(!grid.has(B.key(item.c, item.r)));
  assert([1, 3].includes(item.color));
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node storm-peaks.test.mjs
```

Expected: FAIL because lightning helpers do not exist.

- [ ] **Step 3: Implement schedule**

In `src/storm-core.mjs`:

```js
export function shouldTriggerLightning(storm, resolvedShots, strikesSoFar = 0) {
  if (!storm) return false;
  const first = Math.max(1, Number(storm.firstStrikeAfterShots) || 0);
  const interval = Math.max(1, Number(storm.intervalShots) || 1);
  if (resolvedShots < first) return false;
  return resolvedShots === first + Math.max(0, strikesSoFar) * interval;
}
```

- [ ] **Step 4: Implement deterministic connected spawn planning**

Implement `lightningSpawnPlan()` with this exact strategy:

1. Build `occupied = new Set(grid.keys())`.
2. Candidate strike cells are occupied rows 1–6; if none, use any occupied cell.
3. Sort candidates by row ascending, then key; rotate the list using one deterministic `rng()` draw.
4. Start from the chosen `strikeKey`.
5. Gather empty valid neighbors around strike/frontier cells.
6. Reject cells occupied by `grid`, covered by `objects`, outside `B.inGrid`, or with `B.rowY(r)+B.RAD >= failureY` when a safer candidate exists.
7. Pick the requested count from `[min,max]` using `rng()`.
8. For each accepted addition, add its key to the temporary frontier before choosing the next one, guaranteeing connected growth.
9. Choose colors only from `palette` using `rng()`.

Return:

```js
return { strikeKey, additions };
```

- [ ] **Step 5: Orchestrate strikes in `game.mjs`**

State added in `start()`:

```js
this.lightningStrikes = 0;
this.lightningFx = null;
```

After the shot's pop/drop/object resolution and after incrementing `shotsUsed`, call `maybeStrikeLightning()` before final fail-line checks.

`maybeStrikeLightning()` must:

```js
if (!shouldTriggerLightning(this.level.storm, this.shotsUsed, this.lightningStrikes)) return;
const palette = activeGridColors(this.grid);
const plan = lightningSpawnPlan({
  grid: this.grid,
  objects: this.objects,
  B: this.B,
  palette,
  rng: this.rng,
  spawnCount: this.level.storm.spawnCount,
  failureY: this.B.LAUNCH_Y - 17,
});
for (const { c, r, color } of plan.additions) this.B.setBalloon(this.grid, c, r, color);
this.lightningStrikes += 1;
this.lightningFx = { key: plan.strikeKey, life: .32, maxLife: .32 };
this.reconcileQueueColors();
this.callbacks.onLightning?.({ ...plan, strike: this.lightningStrikes });
```

Update `updateEffects(dt)` to age and clear `lightningFx`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node storm-peaks.test.mjs
node level-integrity.test.mjs
node gameplay-polish.test.mjs
```

Expected: PASS.

Commit:

```bash
git add src/storm-core.mjs src/game.mjs src/sky-rescue-core.mjs storm-peaks.test.mjs
git commit -m "feat: add deterministic lightning pressure"
```

---

### Task 4: Deep objective placement contract

**Files:**
- Modify: `src/storm-core.mjs`
- Modify: `src/levels.mjs`
- Modify: `storm-peaks.test.mjs`
- Modify: `level-integrity.test.mjs`

**Interfaces:**
- Produces: `deepObjectiveCandidates({ grid, B, eligibleKeys }) -> string[]`
- Produces: `chooseDeepObjectiveKeys({ grid, B, eligibleKeys, count, rng }) -> string[]`
- Level definitions may supply `objectiveSlots: [[c,r], ...]` instead of hard-coding rescue/collect object `at` positions.

- [ ] **Step 1: Add failing deep-slot tests**

Append to `storm-peaks.test.mjs`:

```js
import {
  chooseDeepObjectiveKeys,
  deepObjectiveCandidates,
} from './src/storm-core.mjs';

{
  const candidates = deepObjectiveCandidates({ grid: deepFixture, B, eligibleKeys: null });
  const lowestRow = Math.max(...[...deepFixture.keys()].map((key) => B.split(key)[1]));
  assert(candidates.length > 0);
  for (const key of candidates) {
    const [c, r] = B.split(key);
    assert(r <= lowestRow - 2, `deep target ${key} must not live in the lowest two occupied rows`);
    const occupiedNeighbors = B.neighbors(c, r).filter(([nc, nr]) => deepFixture.has(B.key(nc, nr))).length;
    assert(occupiedNeighbors >= 2, `deep target ${key} needs at least two occupied neighbors`);
  }
}

{
  const picked = chooseDeepObjectiveKeys({
    grid: deepFixture,
    B,
    eligibleKeys: null,
    count: 2,
    rng: () => 0.2,
  });
  assert.equal(picked.length, 2);
  assert.equal(new Set(picked).size, 2);
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node storm-peaks.test.mjs
```

Expected: FAIL because deep-target helpers do not exist.

- [ ] **Step 3: Implement scoring and deterministic selection**

In `src/storm-core.mjs`, score occupied cells by:

```js
score += r <= lowestRow - 2 ? 4 : 0;
score += occupiedNeighbors >= 2 ? 3 : 0;
score += hasOccupiedBelow ? 2 : 0;
score += ceilingPathDepth >= 2 ? 2 : 0;
```

Only return candidates scoring at least 7. If `eligibleKeys` is provided, intersect with it before scoring. Sort by score descending, row ascending, key ascending; choose unique entries using deterministic `rng()` rotation.

- [ ] **Step 4: Add level materialization helper in `levels.mjs`**

Keep patterns authored. Extend `level(config)` so after `grid = cells(config.pattern)` it materializes rescue/collect objects from `objectiveSlots` when present:

```js
const selected = chooseDeepObjectiveKeys({
  grid: new Map(grid.map(({ c, r, color }) => [`${c},${r}`, color])),
  B: LEVEL_GEOMETRY,
  eligibleKeys: config.objectiveSlots?.map(([c, r]) => `${c},${r}`) || null,
  count: Number(config.objective?.amount) || 1,
  rng: createSeededRng(hashLevelId(config.id)),
});
```

If importing browser-only `BALLOON` geometry into `levels.mjs` is undesirable, put a small data-only hex neighbor/row helper in `storm-core.mjs` and reuse it from tests and level materialization. Do not duplicate the deep-slot algorithm in `levels.mjs`.

- [ ] **Step 5: Extend integrity checks**

In `level-integrity.test.mjs`, assert for every rescue/collect object in levels 16–20:

```js
assert(deepObjectiveCandidates({ grid, B, eligibleKeys: [objectKey] }).includes(objectKey));
```

Also retain top-connectivity and in-grid checks.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node storm-peaks.test.mjs
node level-integrity.test.mjs
```

Expected: PASS.

Commit:

```bash
git add src/storm-core.mjs src/levels.mjs storm-peaks.test.mjs level-integrity.test.mjs
git commit -m "feat: place storm objectives in deep slots"
```

---

### Task 5: Natural cloud bands, global wind indicator, and lightning presentation

**Files:**
- Modify: `src/game-renderer.mjs`
- Modify: `src/wind-renderer.mjs`
- Modify: `src/game.mjs`
- Modify: `src/audio.mjs`
- Modify: `storm-peaks.test.mjs`

**Interfaces:**
- `GameRenderer.draw(state,time)` consumes `state.currentWind` and `state.lightningFx`.
- `drawGlobalWind(ctx, wind, time, B)` renders subtle whole-board direction feedback and no rectangles.
- `SkyAudio.lightning()` provides a dedicated strike cue.

- [ ] **Step 1: Add rendering contract tests**

Add source-contract assertions in `storm-peaks.test.mjs` using `fs.readFile`:

```js
import fs from 'node:fs/promises';

const rendererSource = await fs.readFile('src/game-renderer.mjs', 'utf8');
const windSource = await fs.readFile('src/wind-renderer.mjs', 'utf8');
assert(rendererSource.includes('drawCloudBand'), 'renderer should use layered cloud bands');
assert(rendererSource.includes('drawLightningBolt'), 'renderer should render a bolt from lightningFx');
assert(windSource.includes('drawGlobalWind'), 'wind renderer should expose whole-board wind visualization');
assert(!windSource.includes('zone.width'), 'wind visualization must not depend on rectangular zones');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node storm-peaks.test.mjs
```

Expected: FAIL on missing `drawCloudBand`, `drawLightningBolt`, or `drawGlobalWind`.

- [ ] **Step 3: Replace round-puff clouds with layered bands**

In `src/game-renderer.mjs`, add a helper with no per-frame blur filter:

```js
function drawCloudBand(ctx, {
  x, y, width, height, alpha = 1,
  top = '#f7fbff', underside = '#b8cad6', lobes = 5,
}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const base = ctx.createLinearGradient(0, y - height, 0, y + height);
  base.addColorStop(0, top);
  base.addColorStop(.72, top);
  base.addColorStop(1, underside);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(x, y + height * .18, width * .5, height * .38, 0, 0, Math.PI * 2);
  for (let i = 0; i < lobes; i += 1) {
    const t = lobes === 1 ? .5 : i / (lobes - 1);
    const lx = x - width * .38 + width * .76 * t;
    const ly = y - height * (.08 + .2 * Math.sin(t * Math.PI));
    const rx = width * (.13 + .05 * Math.sin((i + 1) * 1.7));
    const ry = height * (.42 + .12 * Math.cos(i * 1.3));
    ctx.ellipse(lx, ly, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
```

Use 2–3 depth layers with different drift speeds. Storm variants use darker underside/top colors and lower opacity overlap, not just a single tint.

- [ ] **Step 4: Replace corridor renderer with global wind visual**

In `src/wind-renderer.mjs`, export:

```js
export function drawGlobalWind(ctx, wind, time, B) {
  const forceX = Number(wind?.forceX) || 0;
  const forceY = Number(wind?.forceY) || 0;
  const magnitude = Math.hypot(forceX, forceY);
  if (magnitude < 1) return;
  const ux = forceX / magnitude;
  const uy = forceY / magnitude;
  const drift = (time * .03) % 34;

  ctx.save();
  ctx.strokeStyle = 'rgba(232,247,252,.28)';
  ctx.lineWidth = .8;
  for (let row = 0; row < 4; row += 1) {
    for (let i = -1; i < 8; i += 1) {
      const x = i * 38 + drift * ux;
      const y = 80 + row * 42 + drift * uy;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ux * 14, y + uy * 14);
      ctx.stroke();
    }
  }
  ctx.restore();
}
```

Draw a compact direction indicator near a playfield edge using the same vector.

- [ ] **Step 5: Render lightning FX and audio**

Add `drawLightningBolt(lightningFx, time)` in the renderer. Resolve `strikeKey` through `B.split` and draw a short jagged white-blue bolt from the upper cloud layer to the strike cell, plus spark particles from `game.mjs`.

Add to `src/audio.mjs`:

```js
lightning() {
  if (!this.enabled) return;
  // low thunder body + short high crack using the module's existing oscillator/gain helpers
}
```

Wire `onLightning` in `src/app.mjs` to `audio.lightning()` and a concise callout such as `LIGHTNING`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node storm-peaks.test.mjs
node --check src/game-renderer.mjs
node --check src/wind-renderer.mjs
node --check src/audio.mjs
node --check src/app.mjs
```

Expected: PASS.

Commit:

```bash
git add src/game-renderer.mjs src/wind-renderer.mjs src/game.mjs src/audio.mjs src/app.mjs storm-peaks.test.mjs
git commit -m "feat: add storm cloud wind and lightning presentation"
```

---

### Task 6: Author Burzowe Szczyty levels 16–20 and migrate Forest wind

**Files:**
- Modify: `src/levels.mjs`
- Modify: `sky-rescue.test.mjs`
- Modify: `wind.test.mjs`
- Modify: `level-integrity.test.mjs`
- Modify: `storm-peaks.test.mjs`

**Interfaces:**
- `WORLDS` contains four entries; fourth is `{ id: 'storm', name: 'Burzowe Szczyty', ... }`.
- Forest and Storm windy levels use `wind` / `windSequence`, not `windZones`.
- Storm levels may use `storm` and `objectiveSlots` data.

- [ ] **Step 1: Change campaign-count tests first**

In `sky-rescue.test.mjs`, replace hard-coded 3/15 expectations with exact new requirements:

```js
assert.equal(WORLDS.length, 4);
assert.equal(LEVELS.length, 20);
assert.equal(LEVELS.filter((level) => level.world === 'storm').length, 5);
assert.equal(LEVELS.at(-1).number, 20);
```

In `wind.test.mjs`, add:

```js
for (const level of LEVELS.filter((item) => item.world === 'forest' || item.world === 'storm')) {
  if (level.wind || level.windSequence) assert.equal(level.windZones?.length || 0, 0);
}
```

Expected RED: campaign still has 3 worlds / 15 levels and Forest still uses `windZones`.

- [ ] **Step 2: Author the fourth world**

Add:

```js
{ id: 'storm', name: 'Burzowe Szczyty', subtitle: 'Wiatr i burze', icon: '⚡', atmosphere: 'storm' }
```

Author these five layouts with top-connected patterns and no detached islands:

```js
// 16 — Crosswind
{
  id: 'storm-01', number: 16, world: 'storm', name: 'Boczny wiatr',
  objective: { type: 'clear' },
  wind: { forceX: 150, forceY: 0 },
  maxShots: 23, shotsPerDrop: 6,
  atmosphere: { timeOfDay: 'day', weather: 'windy', intensity: .55 },
  pattern: [
    '1112223334',
    '111222333',
    '.11223344.',
    '..223344..',
    '...3344...',
  ],
}

// 17 — Turning Weather
{
  id: 'storm-02', number: 17, world: 'storm', name: 'Zmiana frontu',
  objective: { type: 'rescue', amount: 1 },
  windSequence: [
    { forceX: 150, forceY: 0 },
    { forceX: 150, forceY: 0 },
    { forceX: -170, forceY: 0 },
    { forceX: -170, forceY: 0 },
  ],
  objectiveSlots: [[4,1], [5,2], [3,2]],
  maxShots: 24, shotsPerDrop: 6,
  atmosphere: { timeOfDay: 'sunset', weather: 'windy', intensity: .62 },
  pattern: [
    '1122334455',
    '112233445',
    '.12233445.',
    '..223344..',
    '...3344...',
  ],
}

// 18 — First Strike
{
  id: 'storm-03', number: 18, world: 'storm', name: 'Pierwszy piorun',
  objective: { type: 'collect', amount: 2 },
  wind: { forceX: 125, forceY: 28 },
  storm: { firstStrikeAfterShots: 4, intervalShots: 4, spawnCount: [2,3] },
  objectiveSlots: [[2,1], [6,1], [3,2], [5,2]],
  maxShots: 26, shotsPerDrop: 6,
  atmosphere: { timeOfDay: 'dusk', weather: 'heavy-rain', intensity: .72 },
  pattern: [
    '1122334455',
    '112233445',
    '.12233445.',
    '..223344..',
    '..555666..',
  ],
}

// 19 — Thunder Run
{
  id: 'storm-04', number: 19, world: 'storm', name: 'Bieg przez burzę',
  objective: { type: 'survive', amount: 10 },
  wind: { forceX: -215, forceY: 12 },
  storm: { firstStrikeAfterShots: 3, intervalShots: 3, spawnCount: [3,4] },
  specials: ['guide'],
  maxShots: 18, shotsPerDrop: 5,
  atmosphere: { timeOfDay: 'dusk', weather: 'heavy-rain', intensity: .85 },
  pattern: [
    '1122334455',
    '122334455',
    '1122334455',
    '.22334455',
    '..334455..',
  ],
}

// 20 — Eye of the Storm
{
  id: 'storm-05', number: 20, world: 'storm', name: 'Oko burzy',
  objective: { type: 'anchors', amount: 3 },
  boss: true,
  windSequence: [
    { forceX: 190, forceY: 10 },
    { forceX: -210, forceY: 14 },
    { forceX: 230, forceY: -8 },
    { forceX: -240, forceY: 0 },
  ],
  storm: { firstStrikeAfterShots: 3, intervalShots: 3, spawnCount: [3,4] },
  specials: ['guide', 'bomb', 'rainbow'],
  objects: [
    { id: 'storm-anchor-left', type: 'anchor', at: [1,0] },
    { id: 'storm-anchor-mid', type: 'anchor', at: [4,0] },
    { id: 'storm-anchor-right', type: 'anchor', at: [7,0] },
  ],
  maxShots: 30, shotsPerDrop: 4,
  atmosphere: { timeOfDay: 'night', weather: 'storm', intensity: 1 },
  pattern: [
    '1112223334',
    '511223344',
    '5511223344',
    '.56622334',
    '..666555..',
    '...6555...',
  ],
}
```

If integrity tests reject a pattern because of 9-column odd-row geometry or connectivity, adjust the pattern only enough to satisfy the existing board contract; do not weaken the tests.

- [ ] **Step 3: Migrate Forest to global wind**

Translate each current scaled Forest zone effect into one authored whole-board vector. Preserve increasing difficulty and direction identity:

```js
forest-01: { forceX: 120, forceY: 0 }
forest-02: { forceX: -145, forceY: 0 }
forest-03: { forceX: -165, forceY: -12 }
forest-04: { forceX: 190, forceY: 0 }
forest-05: windSequence with alternating ±210..240 forceX
```

Delete `FOREST_WINDS`, `WIND_FORCE_SCALE`, and `windZonesFor()` once all authored Forest levels use `wind` / `windSequence`.

- [ ] **Step 4: Tighten final-boss lightning after anchor phases**

In `game.mjs`, do not mutate the authored level. Add runtime `stormInterval` initialized from `level.storm.intervalShots`. On `onBossPhase` progression for `storm-05`, set:

```js
this.stormInterval = Math.max(2, this.stormInterval - 1);
```

Pass runtime cadence into `shouldTriggerLightning` via a shallow runtime storm object:

```js
{ ...this.level.storm, intervalShots: this.stormInterval }
```

- [ ] **Step 5: Run all content tests and commit**

Run:

```bash
node sky-rescue.test.mjs
node wind.test.mjs
node storm-peaks.test.mjs
node level-integrity.test.mjs
```

Expected: PASS with exactly 4 worlds / 20 levels and all authored layouts top-connected.

Commit:

```bash
git add src/levels.mjs src/game.mjs sky-rescue.test.mjs wind.test.mjs storm-peaks.test.mjs level-integrity.test.mjs
git commit -m "feat: add Burzowe Szczyty levels 16 to 20"
```

---

### Task 7: Campaign totals, browser smoke, screenshots, and exact-head verification

**Files:**
- Modify: `src/app.mjs`
- Modify: `.github/scripts/visual-smoke.mjs`
- Modify: `.github/scripts/queue-smoke.mjs` only if selectors/count assumptions require it
- Modify: `.github/workflows/ci.yml` only if new syntax file/check needs adding

**Interfaces:**
- Campaign UI derives count from `LEVELS.length` and total stars from `LEVELS.length * 3` where copy requires a maximum.
- Browser smoke captures Storm Peaks states without bypassing normal unlock logic except through seeded localStorage progress.

- [ ] **Step 1: Update hard-coded campaign totals**

In `src/app.mjs`, replace copy equivalent to `45 gwiazdek` with a derived maximum:

```js
const maxStars = LEVELS.length * 3;
refs.campaignProgressBank.setAttribute(
  'aria-label',
  `${stars} z ${maxStars} gwiazdek i ${masteries} z ${LEVELS.length * 3} odznak mastery`,
);
```

Do not change stored save format.

- [ ] **Step 2: Update browser smoke to expect 20 nodes**

In `.github/scripts/visual-smoke.mjs`:

```js
assert(await page.locator('.level-node').count() === 20, `${name}: campaign should render 20 level nodes`);
```

Expand `completedProgress()` IDs with:

```js
'storm-01', 'storm-02', 'storm-03', 'storm-04', 'storm-05'
```

- [ ] **Step 3: Add Storm Peaks screenshot cases**

Add a `verifyStormPeaks(browser)` helper that seeds completion through level 19 and captures:

```text
artifacts/desktop-storm-16-aim.png
artifacts/desktop-storm-18-lightning.png
artifacts/desktop-storm-19-heavy.png
artifacts/desktop-storm-20-finale.png
artifacts/mobile-storm-18.png
```

For level 16, move the mouse off-center without clicking and wait 150 ms so the wind-bent short aim is visible.

For level 18 lightning, perform enough legal canvas clicks to resolve at least 4 shots; if deterministic gameplay makes exact placement brittle, expose a test-only `data-lightning-strikes` snapshot attribute from `updateHud()` and loop until it becomes `>=1`, with a hard cap of 8 shots. Do not trigger lightning by directly mutating internal game state from Playwright.

For level 20 assert boss meter visible and world label includes `Burzowe Szczyty`.

- [ ] **Step 4: Preserve layout constraints**

Run desktop 1440×1000 and mobile 390×844 smoke and keep these assertions:

```js
assert(document.documentElement.scrollWidth - window.innerWidth <= 1);
assert(frame.contains(topHud));
assert(frame.contains(bottomHud));
assert(document.querySelectorAll('.objective-panel, .status-panel').length === 0);
```

Also verify the next-orb rack remains in the Canvas and no detached queue panel returns.

- [ ] **Step 5: Run the full suite**

Run:

```bash
node balloon.test.js
node sky-rescue.test.mjs
node wind.test.mjs
node pixel-art.test.mjs
node orb-pass.test.mjs
node orb-rack.test.mjs
node gameplay-polish.test.mjs
node storm-peaks.test.mjs
node level-integrity.test.mjs
node --check src/storm-core.mjs
node --check src/game-physics.mjs
node --check src/game.mjs
node --check src/game-renderer.mjs
node --check src/wind-renderer.mjs
node --check src/levels.mjs
node --check src/app.mjs
```

Then let GitHub Actions run Playwright.

Expected: all unit/contract/syntax jobs and browser-smoke green on the exact same head SHA.

- [ ] **Step 6: Review screenshot artifacts manually**

Check all five Storm screenshots for:
- natural layered clouds rather than circular puffs,
- readable original orbs against rain/night backgrounds,
- short aim visibly curving but remaining short,
- no rectangular wind corridors,
- lightning-spawned orbs visibly connected to the existing cluster,
- no objectives exposed on the front row in levels 17/18,
- no horizontal overflow on 390 px mobile.

If a screenshot fails a visual criterion, fix the responsible renderer/data and rerun exact-head CI before moving `playable`.

- [ ] **Step 7: Final branch/PR handoff**

Only after exact-head CI and screenshot review are green:

1. Fast-forward `playable` to the final `feat/sky-rescue-v1` head.
2. Add a PR #1 comment summarizing Storm Peaks, exact head SHA, unit/browser verification, and screenshot review.
3. Leave PR #1 open and unmerged unless the user explicitly asks to merge.

Commit any final smoke changes:

```bash
git add src/app.mjs .github/scripts/visual-smoke.mjs .github/scripts/queue-smoke.mjs .github/workflows/ci.yml
git commit -m "test: verify Storm Peaks campaign pass"
```

---

## Self-review

- Spec coverage: whole-board wind, frozen-per-shot behavior, wind-aware short aim, Guide full path, lightning cadence/spawns, deep objectives, cloud bands, levels 16–20, Forest migration, campaign totals, reduced-motion compatibility, and browser screenshots are all assigned to tasks.
- Non-goals preserved: no timers, moving wind zones, board-orb physics, economy, random mid-flight gusts, or procedural whole-level generation.
- Type consistency: `wind` is consistently `{ forceX, forceY }`; `windForResolvedShot`, `shortTrajectoryPreview`, `shouldTriggerLightning`, `lightningSpawnPlan`, `deepObjectiveCandidates`, and `chooseDeepObjectiveKeys` are defined before downstream use.
- Exact-head rule: `playable` moves only after the final SHA has green unit + Playwright CI and screenshot review.
