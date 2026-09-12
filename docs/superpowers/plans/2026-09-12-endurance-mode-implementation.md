# Endurance Mode + Empty-Board Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the campaign empty-board dead state and add a score-focused Endurance mode with a new row every three resolved shots, progressive logical board expansion, smooth zoom-out, records, and responsive UI.

**Architecture:** Keep authored campaign geometry unchanged. Add a pure Endurance core, a geometry-compatible dynamic board object, a thin `EnduranceGame` subclass of `SkyRescueGame`, and a narrow shared shot resolver so campaign and Endurance use the same pop/drop semantics. The renderer accepts an injected board geometry per frame and a transition cell list for the 0.6 s zoom; the app owns which game controller is active.

**Tech Stack:** Vanilla JavaScript ES modules, Canvas 2D, existing `BALLOON` hex engine for campaign, Node `assert` contract/unit tests, Playwright browser smoke, localStorage persistence, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-endurance-mode-design.md`

## Global Constraints

- Endurance uses **3 resolved shots per round**.
- A run starts at **Round 1**, `shotsInRound = 0`, with **4 generated occupied rows**.
- Spatial stages add **1 column per side** and **2 rows capacity**; campaign geometry stays untouched.
- Expansion animation duration is **0.6 seconds**.
- Orb radius must never shrink below **6.5 logical pixels**.
- Base expansion thresholds are **55, 100, 140, 175, 205 seconds**, then **+27 seconds** per later difficulty stage.
- Adaptive expansion adjustment is clamped to **[-8 s, +8 s]**.
- Endurance starts with **4 colors**; the fifth color appears at difficulty stage **3**.
- Endurance multiplier increases **+0.25x every 5 rounds**, capped at **3.00x**.
- Survival bonus is **100 × multiplier**; clear bonus is **1000 × multiplier**.
- First special is no earlier than **Round 4**; after that, one special slot is eligible every **6 resolved shots**, cycling Guide → Bomb → Rainbow.
- Endurance has no max-shot failure and no Storm lightning in this pass.
- Wind remains visual-only; it never affects projectile or aim physics.
- `main` is not updated or merged by this plan. Work stays on `feat/sky-rescue-v1`; move `playable` only after exact-head verification is green.

---

### Task 1: Campaign empty-board terminal reconciliation

**Files:**
- Modify: `src/sky-rescue-core.mjs`
- Modify: `src/game.mjs`
- Modify: `sky-rescue.test.mjs`

**Interfaces:**
- Consumes: existing `evaluateObjective(objective, state)`.
- Produces: `campaignTerminalDecision(objective, state) -> { complete: boolean, fallbackEmptyBoard: boolean, evaluation: object }`.

- [ ] **Step 1: Write failing campaign terminal tests**

Append to `sky-rescue.test.mjs`:

```js
import { campaignTerminalDecision } from './src/sky-rescue-core.mjs';

{
  const clear = campaignTerminalDecision({ type: 'clear' }, { remainingBalloons: 0 });
  assert.equal(clear.complete, true);
  assert.equal(clear.fallbackEmptyBoard, false);
}

{
  const rescue = campaignTerminalDecision(
    { type: 'rescue', amount: 2 },
    { remainingBalloons: 0, rescued: 1 },
  );
  assert.equal(rescue.complete, true, 'empty rescue board must never remain playable');
  assert.equal(rescue.fallbackEmptyBoard, true);
}

{
  const live = campaignTerminalDecision(
    { type: 'collect', amount: 2 },
    { remainingBalloons: 5, collected: 1 },
  );
  assert.equal(live.complete, false);
  assert.equal(live.fallbackEmptyBoard, false);
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
node sky-rescue.test.mjs
```

Expected: FAIL because `campaignTerminalDecision` is not exported.

- [ ] **Step 3: Implement the pure terminal decision**

Add to `src/sky-rescue-core.mjs`:

```js
export function campaignTerminalDecision(objective = { type: 'clear' }, state = {}) {
  const evaluation = evaluateObjective(objective, state);
  const remaining = Math.max(0, Number(state.remainingBalloons) || 0);
  const empty = remaining === 0;
  return {
    complete: Boolean(evaluation.complete || empty),
    fallbackEmptyBoard: Boolean(empty && !evaluation.complete),
    evaluation,
  };
}
```

This deliberately applies the empty-board safety fallback to every campaign objective, including `survive`, because the approved acceptance rule is that a campaign run cannot stay active on an empty board and an empty campaign board is never a loss.

- [ ] **Step 4: Wire the decision after normal campaign object resolution**

In `src/game.mjs`, import `campaignTerminalDecision` and replace the direct completion check:

```js
const terminal = campaignTerminalDecision(this.level.objective, this.objectiveState());
if (terminal.complete) return this.complete();
```

Keep this check **after** `resolveObjects(...)`, score/effects, and boss-phase updates, but **before** lightning, ceiling pressure, max-shot failure, or launcher-line failure.

- [ ] **Step 5: Run campaign regressions**

Run:

```bash
node sky-rescue.test.mjs
node storm-peaks.test.mjs
node storm-runtime.test.mjs
node storm-feedback.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sky-rescue-core.mjs src/game.mjs sky-rescue.test.mjs
git commit -m "fix: resolve empty campaign boards"
```

---

### Task 2: Pure Endurance rules, timing, scoring, palette, specials, and records

**Files:**
- Create: `src/endurance-core.mjs`
- Create: `endurance-core.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - `ENDURANCE_CONFIG`
  - `createEnduranceState() -> { round, shotsInRound, resolvedShots, difficultyStage, spatialStage }`
  - `advanceRoundState(state) -> { state, completedRound: boolean }`
  - `pressureAdjustmentSeconds(pressure) -> number`
  - `baseExpansionTimeSeconds(difficultyStage) -> number`
  - `adjustedExpansionTimeSeconds(difficultyStage, pressure) -> number`
  - `enduranceMultiplier(round) -> number`
  - `survivalBonus(round) -> number`
  - `clearBonus(round) -> number`
  - `paletteForStage(difficultyStage) -> number[]`
  - `scheduledSpecialType({ round, resolvedShots, previousWasSpecial }) -> 'guide'|'bomb'|'rainbow'|null`
  - `updateEnduranceRecords(records, result) -> { records, newRecords }`.

- [ ] **Step 1: Write failing pure-rule tests**

Create `endurance-core.test.mjs` with at least these exact assertions:

```js
import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  createEnduranceState,
  advanceRoundState,
  pressureAdjustmentSeconds,
  baseExpansionTimeSeconds,
  enduranceMultiplier,
  survivalBonus,
  clearBonus,
  paletteForStage,
  scheduledSpecialType,
  updateEnduranceRecords,
} from './src/endurance-core.mjs';

assert.equal(ENDURANCE_CONFIG.shotsPerRound, 3);
assert.deepEqual(createEnduranceState(), {
  round: 1,
  shotsInRound: 0,
  resolvedShots: 0,
  difficultyStage: 0,
  spatialStage: 0,
});

let s = createEnduranceState();
({ state: s } = advanceRoundState(s));
assert.equal(s.round, 1);
assert.equal(s.shotsInRound, 1);
({ state: s } = advanceRoundState(s));
({ state: s } = advanceRoundState(s));
assert.equal(s.round, 2);
assert.equal(s.shotsInRound, 0);
assert.equal(s.resolvedShots, 3);

assert.equal(pressureAdjustmentSeconds(.45), -8);
assert.equal(pressureAdjustmentSeconds(.60), 0);
assert.equal(pressureAdjustmentSeconds(.75), 8);
assert.equal(pressureAdjustmentSeconds(0), -8);
assert.equal(pressureAdjustmentSeconds(1), 8);

assert.equal(baseExpansionTimeSeconds(1), 55);
assert.equal(baseExpansionTimeSeconds(5), 205);
assert.equal(baseExpansionTimeSeconds(6), 232);
assert.equal(baseExpansionTimeSeconds(7), 259);

assert.equal(enduranceMultiplier(1), 1);
assert.equal(enduranceMultiplier(6), 1.25);
assert.equal(enduranceMultiplier(41), 3);
assert.equal(survivalBonus(6), 125);
assert.equal(clearBonus(6), 1250);

assert.deepEqual(paletteForStage(0), [1, 2, 3, 4]);
assert.deepEqual(paletteForStage(2), [1, 2, 3, 4]);
assert.deepEqual(paletteForStage(3), [1, 2, 3, 4, 5]);

assert.equal(scheduledSpecialType({ round: 3, resolvedShots: 12, previousWasSpecial: false }), null);
assert.equal(scheduledSpecialType({ round: 4, resolvedShots: 12, previousWasSpecial: false }), 'guide');
assert.equal(scheduledSpecialType({ round: 6, resolvedShots: 18, previousWasSpecial: false }), 'bomb');
assert.equal(scheduledSpecialType({ round: 8, resolvedShots: 24, previousWasSpecial: false }), 'rainbow');
assert.equal(scheduledSpecialType({ round: 8, resolvedShots: 24, previousWasSpecial: true }), null);

const updated = updateEnduranceRecords(
  { bestScore: 900, bestTimeMs: 50_000, bestRound: 8 },
  { score: 1200, elapsedMs: 45_000, round: 10 },
);
assert.deepEqual(updated.records, { bestScore: 1200, bestTimeMs: 50_000, bestRound: 10 });
assert.deepEqual(updated.newRecords, { score: true, time: false, round: true });

console.log('✓ Endurance pure rules');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-core.test.mjs
```

Expected: module-not-found for `src/endurance-core.mjs`.

- [ ] **Step 3: Implement centralized config and helpers**

Create `src/endurance-core.mjs` with this configuration:

```js
export const ENDURANCE_CONFIG = Object.freeze({
  shotsPerRound: 3,
  initialRows: 4,
  initialEvenCols: 10,
  initialOddCols: 9,
  initialMaxRows: 10,
  rowsAddedPerExpansion: 2,
  colsAddedPerSidePerExpansion: 1,
  minOrbRadius: 6.5,
  expansionTimesSeconds: [55, 100, 140, 175, 205],
  laterExpansionIntervalSeconds: 27,
  adaptiveExpansionWindowSeconds: 8,
  zoomDurationSeconds: 0.6,
  initialColorCount: 4,
  fifthColorStage: 3,
  roundMultiplierStepRounds: 5,
  roundMultiplierStep: 0.25,
  maxEnduranceMultiplier: 3,
  survivalBonus: 100,
  clearBonus: 1000,
  firstSpecialRound: 4,
  specialEveryResolvedShots: 6,
});
```

Implement the helpers without DOM, Canvas, timers, or localStorage. Use linear interpolation for pressure:

```js
export function pressureAdjustmentSeconds(pressure) {
  const p = Math.max(0, Math.min(1, Number(pressure) || 0));
  if (p <= .45) return -8;
  if (p >= .75) return 8;
  if (p <= .60) return -8 + ((p - .45) / .15) * 8;
  return ((p - .60) / .15) * 8;
}
```

Use `Math.min(3, 1 + Math.floor((round - 1) / 5) * .25)` for the multiplier.

For special cadence, treat `resolvedShots` as 1-based eligibility points at 12, 18, 24... and derive the cycle index from `(resolvedShots / 6) - 2`.

- [ ] **Step 4: Run GREEN**

```bash
node endurance-core.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add the test to CI**

Add before syntax checks in `.github/workflows/ci.yml`:

```yaml
      - name: Endurance core tests
        run: node endurance-core.test.mjs
```

Also add:

```yaml
          node --check src/endurance-core.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/endurance-core.mjs endurance-core.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance core rules"
```

---

### Task 3: Dynamic Endurance hex geometry and deterministic row generation

**Files:**
- Create: `src/endurance-geometry.mjs`
- Create: `endurance-geometry.test.mjs`
- Modify: `src/endurance-core.mjs`
- Modify: `endurance-core.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `ENDURANCE_CONFIG`, `paletteForStage`.
- Produces:
  - `createEnduranceGeometry({ spatialStage, rowPhase }) -> geometry`
  - geometry fields `LW`, `LH`, `RAD`, `PH`, `PV`, `LAUNCH_Y`, `MAXROW`, `stage`, `rowPhase`
  - geometry methods `rowCols`, `colX`, `rowY`, `inGrid`, `key`, `split`, `neighbors`, `setBalloon`, `settle`, `findSnap`, `topConnected`, `lowestRow`
  - `canExpandSpatially(spatialStage) -> boolean`
  - `remapGridForExpansion(grid) -> Map`
  - `shiftGridForNewRow(grid, geometry) -> { grid: Map, nextRowPhase: 0|1 }`
  - `generateEnduranceRow({ geometry, palette, rng }) -> Array<{c,r,color}>`
  - `generateInitialEnduranceGrid({ geometry, palette, rng, rows }) -> Map`
  - `failureLineReached(grid, geometry) -> boolean`.

- [ ] **Step 1: Write geometry RED tests**

Create `endurance-geometry.test.mjs`:

```js
import assert from 'node:assert/strict';
import {
  createEnduranceGeometry,
  canExpandSpatially,
  remapGridForExpansion,
  shiftGridForNewRow,
  failureLineReached,
} from './src/endurance-geometry.mjs';

const g0 = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
assert.equal(g0.rowCols(0), 10);
assert.equal(g0.rowCols(1), 9);
assert.equal(g0.MAXROW, 9);
assert.equal(g0.RAD, 12);

const g1 = createEnduranceGeometry({ spatialStage: 1, rowPhase: 0 });
assert.equal(g1.rowCols(0), 12);
assert.equal(g1.rowCols(1), 11);
assert.equal(g1.MAXROW, 11);
assert(g1.RAD < g0.RAD);
assert(g1.RAD >= 6.5);

for (const g of [g0, g1, createEnduranceGeometry({ spatialStage: 4, rowPhase: 0 })]) {
  for (let r = 0; r <= g.MAXROW; r += 1) {
    for (let c = 0; c < g.rowCols(r); c += 1) {
      const x = g.colX(c, r);
      assert(x - g.RAD >= -0.001);
      assert(x + g.RAD <= g.LW + 0.001);
      for (const [nc, nr] of g.neighbors(c, r)) {
        assert(g.neighbors(nc, nr).some(([cc, rr]) => cc === c && rr === r));
      }
    }
  }
}

assert.equal(canExpandSpatially(4), false, 'stage 5 would fall below the 6.5px radius floor');

const before = new Map([[g0.key(0, 0), 1], [g0.key(4, 2), 2], [g0.key(8, 3), 3]]);
const expanded = remapGridForExpansion(before);
assert.deepEqual([...expanded.keys()], ['1,0', '5,2', '9,3']);
assert.equal(expanded.size, before.size);

const shifted = shiftGridForNewRow(before, g0);
assert.equal(shifted.nextRowPhase, 1);
assert.equal(shifted.grid.size, before.size, 'rowPhase flip must preserve edge cells on downward shift');

const danger = new Map([[g0.key(4, 9), 1]]);
assert.equal(failureLineReached(danger, g0), false);

console.log('✓ Endurance geometry');
```

- [ ] **Step 2: Write row-generation RED tests**

Append to `endurance-core.test.mjs`:

```js
import { createEnduranceGeometry } from './src/endurance-geometry.mjs';
import { generateEnduranceRow, generateInitialEnduranceGrid } from './src/endurance-core.mjs';

const geometry = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
const rngValues = [.1, .1, .1, .7, .7, .2, .2, .9, .9, .3];
let i = 0;
const row = generateEnduranceRow({
  geometry,
  palette: [1, 2, 3, 4],
  rng: () => rngValues[(i++) % rngValues.length],
});
assert.equal(row.length, geometry.rowCols(0));
for (let c = 2; c < row.length; c += 1) {
  assert(!(row[c - 2].color === row[c - 1].color && row[c - 1].color === row[c].color));
}

const initial = generateInitialEnduranceGrid({
  geometry,
  palette: [1, 2, 3, 4],
  rng: () => .25,
  rows: 4,
});
assert.equal(new Set([...initial.keys()].map((key) => geometry.split(key)[1])).size, 4);
```

- [ ] **Step 3: Run RED**

```bash
node endurance-geometry.test.mjs
node endurance-core.test.mjs
```

Expected: FAIL because geometry and row helpers do not exist.

- [ ] **Step 4: Implement geometry descriptor and operations**

In `src/endurance-geometry.mjs`, derive dimensions from stage:

```js
const LW = 240;
const LH = 320;
const LAUNCH_Y = 288;
const Y0 = 48;

export function geometryDescriptor(spatialStage = 0) {
  const stage = Math.max(0, Math.floor(Number(spatialStage) || 0));
  const evenCols = 10 + stage * 2;
  const oddCols = evenCols - 1;
  const maxRows = 10 + stage * 2;
  const radius = Math.min(12, LW / (2 * evenCols));
  return { stage, evenCols, oddCols, maxRows, radius };
}

export function canExpandSpatially(spatialStage = 0) {
  return geometryDescriptor(spatialStage + 1).radius >= 6.5;
}
```

`createEnduranceGeometry({ spatialStage, rowPhase })` uses:

```js
const PH = radius * 2;
const PV = Math.sqrt(3) * radius;
const leftMargin = (LW - evenCols * PH) / 2;
const firstCenterX = leftMargin + radius;
const phase = rowPhase ? 1 : 0;
const rowCols = (r) => (((r + phase) & 1) ? oddCols : evenCols);
const colX = (c, r) => firstCenterX + (((r + phase) & 1) ? radius : 0) + c * PH;
const rowY = (r) => Y0 + r * PV;
```

Port the existing `BALLOON` algorithms for neighbors, same-color cluster, top-connected, settle, lowest row, and snap, but use the injected dynamic functions/limits above. Preserve the campaign snap threshold semantics by using `PH * 1.6` from the current geometry.

Use `rowPhase` to preserve width/parity when adding a row: `shiftGridForNewRow` maps `[c,r] -> [c,r+1]` and returns `nextRowPhase = phase ^ 1`; validating against a geometry rebuilt with that next phase must keep the same cell count.

`failureLineReached` is:

```js
export function failureLineReached(grid, geometry) {
  for (const key of grid.keys()) {
    const [, r] = geometry.split(key);
    if (geometry.rowY(r) + geometry.RAD >= geometry.LAUNCH_Y - 17) return true;
  }
  return false;
}
```

- [ ] **Step 5: Implement deterministic generated rows**

In `src/endurance-core.mjs`:

```js
function pickIndex(rng, length) {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(.999999, rng())) * length));
}

export function generateEnduranceRow({ geometry, palette, rng = Math.random }) {
  const colors = palette.length ? [...palette] : [1, 2, 3, 4];
  const row = [];
  for (let c = 0; c < geometry.rowCols(0); c += 1) {
    let color = colors[pickIndex(rng, colors.length)];
    if (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) {
      const start = colors.indexOf(color);
      color = colors[(start + 1) % colors.length];
    }
    row.push({ c, r: 0, color });
  }
  return row;
}

export function generateInitialEnduranceGrid({ geometry, palette, rng = Math.random, rows = 4 }) {
  const grid = new Map();
  for (let r = 0; r < rows; r += 1) {
    const rowGeometry = { ...geometry, rowCols: (rr) => geometry.rowCols(rr + r) };
    const generated = generateEnduranceRow({ geometry: rowGeometry, palette, rng });
    generated.forEach(({ c, color }) => grid.set(geometry.key(c, r), color));
  }
  return grid;
}
```

If the `rowGeometry` shortcut makes tests show a parity mismatch, replace it with an explicit `targetRow` argument; do not weaken the test.

- [ ] **Step 6: Run GREEN and syntax checks**

```bash
node endurance-geometry.test.mjs
node endurance-core.test.mjs
node --check src/endurance-geometry.mjs
node --check src/endurance-core.mjs
```

Expected: PASS.

- [ ] **Step 7: Add geometry test to CI and commit**

Add:

```yaml
      - name: Endurance geometry tests
        run: node endurance-geometry.test.mjs
```

and syntax check `node --check src/endurance-geometry.mjs`.

Commit:

```bash
git add src/endurance-core.mjs src/endurance-geometry.mjs endurance-core.test.mjs endurance-geometry.test.mjs .github/workflows/ci.yml
git commit -m "feat: add dynamic Endurance geometry"
```

---

### Task 4: Shared shot resolver and renderer geometry injection

**Files:**
- Create: `src/shot-resolution.mjs`
- Create: `shot-resolution.test.mjs`
- Modify: `src/game.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `gameplay-polish.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: a geometry object with `setBalloon`, `settle`, `neighbors`.
- Produces:
  - `resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor }) -> { popped, dropped, placedColor }`.
- Renderer consumes optional `state.geometry` and optional `state.transitionCells`.

- [ ] **Step 1: Write failing shared resolver tests**

Create `shot-resolution.test.mjs` and compare normal/bomb/rainbow semantics on standard geometry:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolveShotOnGrid } from './src/shot-resolution.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

{
  const grid = new Map([[B.key(3, 0), 1], [B.key(4, 0), 1]]);
  const result = resolveShotOnGrid({
    grid,
    shot: { type: 'normal', color: 1 },
    c: 5,
    r: 0,
    geometry: B,
    pickColor: () => 1,
  });
  assert.equal(result.popped.length, 3);
  assert.equal(grid.size, 0);
}

{
  const grid = new Map([[B.key(4, 0), 2], [B.key(4, 1), 3]]);
  const result = resolveShotOnGrid({
    grid,
    shot: { type: 'bomb', color: 1 },
    c: 3,
    r: 1,
    geometry: B,
    pickColor: () => 1,
  });
  assert(result.popped.length >= 2);
}

console.log('✓ shared shot resolution');
```

- [ ] **Step 2: Run RED**

```bash
node shot-resolution.test.mjs
```

Expected: module-not-found.

- [ ] **Step 3: Extract shot settlement from campaign**

Create `src/shot-resolution.mjs`:

```js
import { bombAffectedKeys, chooseRainbowColor } from './sky-rescue-core.mjs';

export function resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor }) {
  let popped = [];
  let dropped = [];
  let placedColor = shot.color || pickColor();

  if (shot.type === 'bomb') {
    geometry.setBalloon(grid, c, r, placedColor);
    popped = bombAffectedKeys(c, r, geometry.neighbors).filter((key) => grid.has(key));
    popped.forEach((key) => grid.delete(key));
    const connected = geometry.topConnected(grid, 0);
    dropped = [...grid.keys()].filter((key) => !connected.has(key));
    dropped.forEach((key) => grid.delete(key));
  } else {
    placedColor = shot.type === 'rainbow'
      ? chooseRainbowColor(grid, c, r, geometry.neighbors) || pickColor()
      : shot.color;
    geometry.setBalloon(grid, c, r, placedColor);
    const settled = geometry.settle(grid, c, r, 0);
    popped = settled.popped;
    dropped = settled.dropped;
  }

  return { popped, dropped, placedColor };
}
```

Because campaign can have `ceilRow > 0`, immediately generalize the signature before integration to accept `ceilRow = 0` and pass it to `topConnected`/`settle`:

```js
resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor, ceilRow = 0 })
```

- [ ] **Step 4: Replace duplicated settlement inside `SkyRescueGame.land()`**

After snap is found:

```js
const { popped, dropped } = resolveShotOnGrid({
  grid: this.grid,
  shot,
  c,
  r,
  geometry: this.B,
  pickColor: () => this.pickColor(),
  ceilRow: this.ceilRow,
});
```

Delete only the old bomb/rainbow/normal mutation block. Keep scoring, objects, FX, campaign terminal logic, ceiling pressure, lightning, and failure checks unchanged.

- [ ] **Step 5: Add renderer contract RED assertions**

In `gameplay-polish.test.mjs`, load `src/game-renderer.mjs` as text and assert:

```js
assert.ok(renderer.includes('state.geometry || this.B'), 'renderer should accept injected board geometry');
assert.ok(renderer.includes('state.transitionCells'), 'renderer should accept zoom transition cells');
```

Run `node gameplay-polish.test.mjs`; expected FAIL.

- [ ] **Step 6: Parameterize the renderer without changing campaign visuals**

In `GameRenderer.draw(state, time)`:

```js
const board = state.geometry || this.B;
```

Use `board.split/colX/rowY/RAD` for grid balls. Scale board balls and the current projectile with:

```js
const boardScale = board.RAD / 12;
```

Keep the two upcoming queue preview orbs at their existing UI size; only the current launcher orb/projectile follows `boardScale`.

If `state.transitionCells` is an array, render those cells instead of iterating `state.grid`:

```js
for (const cell of state.transitionCells) {
  this.drawOrb(cell.color, cell.x, cell.y, cell.radius / 12);
}
```

Do not render campaign objects during Endurance transition; campaign never supplies `transitionCells`.

For Endurance (`state.mode === 'endurance'`), draw a subtle danger line at `board.LAUNCH_Y - 17` instead of the campaign ceiling marker. Campaign rendering must remain pixel-for-pixel behaviorally unchanged outside this injected geometry path.

- [ ] **Step 7: Run shared/campaign/renderer tests**

```bash
node shot-resolution.test.mjs
node sky-rescue.test.mjs
node gameplay-polish.test.mjs
node storm-peaks.test.mjs
node --check src/shot-resolution.mjs
node --check src/game-renderer.mjs
node --check src/game.mjs
```

Expected: PASS.

- [ ] **Step 8: Add resolver test to CI and commit**

Add `node shot-resolution.test.mjs` and syntax check for `src/shot-resolution.mjs` to CI.

```bash
git add src/shot-resolution.mjs src/game.mjs src/game-renderer.mjs shot-resolution.test.mjs gameplay-polish.test.mjs .github/workflows/ci.yml
git commit -m "refactor: share shot resolution with Endurance"
```

---

### Task 5: Endurance runtime — start board, rounds, rows, scoring, clear bonus, and loss

**Files:**
- Create: `src/endurance-game.mjs`
- Create: `endurance-runtime.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `SkyRescueGame`, `resolveShotOnGrid`, Endurance core helpers, Endurance geometry.
- Produces: `EnduranceGame extends SkyRescueGame` with the same public lifecycle methods used by the app: `start()`, `destroy()`, `setPaused()`, `getSnapshot()`.
- Snapshot adds: `mode`, `round`, `shotsInRound`, `shotsUntilRow`, `elapsedMs`, `difficultyStage`, `spatialStage`.

- [ ] **Step 1: Write runtime RED contract**

Create `endurance-runtime.test.mjs` with a lightweight fake canvas/RAF environment following the pattern already used by `storm-feedback.test.mjs`. Test these state transitions directly:

```js
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 0);
assert.equal(new Set([...game.grid.keys()].map((k) => game.B.split(k)[1])).size, 4);
assert.equal(game.status, 'playing');

// Call the post-shot progression helper directly with deterministic results.
game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 2);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 2);
assert.equal(game.shotsInRound, 0);

const scoreBeforeClear = game.score;
game.clearBonusArmed = true;
game.grid.clear();
game.applyEnduranceClearBonus();
assert(game.score > scoreBeforeClear);
const once = game.score;
game.applyEnduranceClearBonus();
assert.equal(game.score, once, 'clear bonus must latch while continuously empty');
```

Also test `pickColor()` on an empty grid returns one of `paletteForStage(game.difficultyStage)`, never `0`.

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: module-not-found for `src/endurance-game.mjs`.

- [ ] **Step 3: Implement `EnduranceGame` as a thin subclass**

Create `src/endurance-game.mjs`:

```js
export class EnduranceGame extends SkyRescueGame {
  constructor(canvas, callbacks = {}) {
    super(canvas, callbacks);
    this.mode = 'endurance';
  }

  start(seed = 'endurance') {
    this.difficultyStage = 0;
    this.spatialStage = 0;
    this.rowPhase = 0;
    this.B = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
    const palette = paletteForStage(0);
    const rng = createSeededRng(this.hashSeed(String(seed)));
    const grid = generateInitialEnduranceGrid({ geometry: this.B, palette, rng, rows: 4 });

    const level = {
      id: `endurance-${seed}`,
      name: 'Endurance',
      world: 'meadow',
      atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: .15 },
      grid: [...grid].map(([key, color]) => {
        const [c, r] = this.B.split(key);
        return { c, r, color };
      }),
      objects: [],
      objective: { type: 'survive', amount: Number.MAX_SAFE_INTEGER },
      maxShots: Number.MAX_SAFE_INTEGER,
      shotsPerDrop: Number.MAX_SAFE_INTEGER,
      specials: [],
    };

    super.start(level);
    this.round = 1;
    this.shotsInRound = 0;
    this.resolvedShots = 0;
    this.elapsedMs = 0;
    this.score = 0;
    this.clearBonusArmed = this.grid.size > 0;
    this.pendingExpansion = null;
    this.fillQueue();
    this.emitState();
  }
}
```

Do not call campaign `land()`. Override `land()` and use `resolveShotOnGrid` with `this.B` and `ceilRow: 0`.

- [ ] **Step 4: Implement Endurance queue/special behavior**

Override `pickColor()`:

```js
pickColor() {
  const palette = paletteForStage(this.difficultyStage);
  const active = activeGridColors(this.grid).filter((color) => palette.includes(color));
  const source = active.length ? active : palette;
  return source[Math.min(source.length - 1, Math.floor(this.rng() * source.length))];
}
```

Override `nextShot()` to call `scheduledSpecialType(...)`. Track `this.lastIssuedShotWasSpecial`; when a special is scheduled, use the current picked color except Rainbow which uses `0`.

- [ ] **Step 5: Implement round progression and generated row insertion**

Add a testable method:

```js
afterResolvedEnduranceShot({ popped, dropped, turnScore }) {
  this.resolvedShots += 1;
  this.shotsInRound += 1;
  this.score += Math.round(turnScore * enduranceMultiplier(this.round));
  this.applyEnduranceClearBonus();

  if (failureLineReached(this.grid, this.B)) return this.finishEndurance('Kulki dotarły do wyrzutni.');

  if (this.shotsInRound >= ENDURANCE_CONFIG.shotsPerRound) {
    this.insertEnduranceRow();
    if (this.status !== 'playing') return;
    this.shotsInRound = 0;
    this.round += 1;
    this.score += survivalBonus(this.round);
  }
  this.clearBonusArmed ||= this.grid.size > 0;
}
```

`insertEnduranceRow()`:

1. call `shiftGridForNewRow`;
2. rebuild `this.B` using the same spatial stage and returned `rowPhase`;
3. fail if shifted grid reaches the launcher line;
4. generate a top row with `generateEnduranceRow` and the current palette;
5. write it into the grid;
6. set `clearBonusArmed = true`;
7. reconcile/fill queue using current palette;
8. fail if the new row caused launcher overlap.

The bonus for completing Round 1 is applied when advancing to active Round 2; use the **new active round** for the multiplier, matching the spec's “highest round reached” semantics.

- [ ] **Step 6: Implement Endurance `land()`, snapshot, and finish**

`land()` follows campaign snap/resolve/FX flow but skips objects/objectives/lightning/ceilRow/maxShots. It computes base score with existing `scoreTurn`, then delegates Endurance progression to `afterResolvedEnduranceShot`.

`getSnapshot()` returns:

```js
{
  mode: 'endurance',
  status: this.status,
  paused: this.paused,
  score: this.score,
  combo: this.combo,
  queue: this.queue.map((shot) => ({ ...shot })),
  round: this.round,
  shotsInRound: this.shotsInRound,
  shotsUntilRow: 3 - this.shotsInRound,
  elapsedMs: this.elapsedMs,
  difficultyStage: this.difficultyStage,
  spatialStage: this.spatialStage,
}
```

`finishEndurance(reason)` sets status to `lost` once and calls `callbacks.onEnduranceEnd` after the same short result delay style used by campaign, with `{ score, elapsedMs, round, reason }`.

- [ ] **Step 7: Run runtime and campaign regressions**

```bash
node endurance-runtime.test.mjs
node shot-resolution.test.mjs
node sky-rescue.test.mjs
node storm-feedback.test.mjs
node --check src/endurance-game.mjs
```

Expected: PASS.

- [ ] **Step 8: Add runtime test to CI and commit**

```bash
git add src/endurance-game.mjs endurance-runtime.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance round runtime"
```

---

### Task 6: Active run clock, adaptive difficulty stages, and 0.6 s spatial zoom

**Files:**
- Modify: `src/endurance-game.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `endurance-runtime.test.mjs`
- Modify: `endurance-geometry.test.mjs`

**Interfaces:**
- Consumes: `adjustedExpansionTimeSeconds`, `canExpandSpatially`, `remapGridForExpansion`, `createEnduranceGeometry`.
- Produces runtime transition shape:

```js
{
  fromGeometry,
  toGeometry,
  fromGrid,
  toGrid,
  elapsed: 0,
  duration: 0.6,
}
```

and renderer `state.transitionCells: Array<{ color, x, y, radius }>`.

- [ ] **Step 1: Extend runtime tests with timing/transition RED cases**

Add assertions:

```js
game.elapsedMs = 54_900;
game.grid = makeSafeBoard(game.B); // pressure <= .45
const stageBefore = game.difficultyStage;
game.update(.033);
assert(game.difficultyStage >= stageBefore);

// Explicitly trigger a spatial expansion for deterministic transition testing.
game.beginDifficultyStage(1);
assert(game.pendingExpansion, 'spatial stage should create a transition');
assert.equal(game.spatialStage, 0, 'authoritative stage changes only after transition');
const shotsBefore = game.shotsInRound;
game.shoot();
assert.equal(game.projectile, null, 'firing is locked during zoom');

game.setPaused(true);
const elapsedBeforePause = game.pendingExpansion.elapsed;
game.update(.3);
assert.equal(game.pendingExpansion.elapsed, elapsedBeforePause);
game.setPaused(false);

game.update(.59);
assert.equal(game.spatialStage, 0);
game.update(.02);
assert.equal(game.spatialStage, 1);
assert.equal(game.shotsInRound, shotsBefore);
```

Also assert a single `update()` call advances at most one difficulty stage.

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: FAIL on missing transition/timing behavior.

- [ ] **Step 3: Accumulate active gameplay time in overridden `update(dt)`**

Use the base tick's already-clamped `dt`:

```js
update(dt) {
  if (this.pendingExpansion) {
    this.advanceExpansion(dt);
    return;
  }

  this.elapsedMs += dt * 1000;
  super.update(dt);

  if (this.status === 'playing' && !this.projectile && !this.pendingExpansion) {
    this.maybeAdvanceDifficultyStage();
  }
}
```

Because base `tick()` does not call `update()` while paused, paused time and long suspended-tab wall time are excluded automatically.

- [ ] **Step 4: Implement deterministic stage triggering**

Calculate pressure from `this.B.lowestRow(this.grid) / this.B.MAXROW`, using 0 for empty grid. The next difficulty stage is `this.difficultyStage + 1`; trigger when active elapsed seconds meet `adjustedExpansionTimeSeconds(nextStage, pressure)`.

Process at most one stage per call:

```js
maybeAdvanceDifficultyStage() {
  const next = this.difficultyStage + 1;
  const threshold = adjustedExpansionTimeSeconds(next, this.currentPressure());
  if (this.elapsedMs / 1000 < threshold) return false;
  this.beginDifficultyStage(next);
  return true;
}
```

When a stage starts, set `difficultyStage = next` immediately so palette/special difficulty advances even if the readability floor prevents spatial widening.

- [ ] **Step 5: Implement spatial expansion transition**

If `canExpandSpatially(this.spatialStage)` is false, do not create a transition. Otherwise:

```js
const fromGeometry = this.B;
const toGeometry = createEnduranceGeometry({
  spatialStage: this.spatialStage + 1,
  rowPhase: this.rowPhase,
});
const toGrid = remapGridForExpansion(this.grid);
this.pendingExpansion = {
  fromGeometry,
  toGeometry,
  fromGrid: new Map(this.grid),
  toGrid,
  elapsed: 0,
  duration: ENDURANCE_CONFIG.zoomDurationSeconds,
};
```

Override `shoot()` to return immediately while `pendingExpansion` is non-null.

On transition completion only:

```js
this.grid = pending.toGrid;
this.B = pending.toGeometry;
this.spatialStage += 1;
this.pendingExpansion = null;
if (failureLineReached(this.grid, this.B)) this.finishEndurance('Kulki dotarły do wyrzutni.');
```

Do not evaluate failure against interpolated coordinates.

- [ ] **Step 6: Produce transition cells in `renderState()`**

For each key in `fromGrid`, map its old `[c,r]` to new key `[c+1,r]` and interpolate:

```js
const t = Math.max(0, Math.min(1, pending.elapsed / pending.duration));
const smooth = t * t * (3 - 2 * t);
const x = fromX + (toX - fromX) * smooth;
const y = fromY + (toY - fromY) * smooth;
const radius = fromGeometry.RAD + (toGeometry.RAD - fromGeometry.RAD) * smooth;
```

Return `transitionCells` and keep `geometry: fromGeometry` until completion. Renderer Task 4 already knows how to render these cells.

- [ ] **Step 7: Run transition tests and syntax**

```bash
node endurance-runtime.test.mjs
node endurance-geometry.test.mjs
node gameplay-polish.test.mjs
node --check src/endurance-game.mjs
node --check src/game-renderer.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/endurance-game.mjs src/game-renderer.mjs endurance-runtime.test.mjs endurance-geometry.test.mjs
git commit -m "feat: add Endurance board expansion"
```

---

### Task 7: Save migration and Endurance records

**Files:**
- Modify: `src/save.mjs`
- Create: `save.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `updateEnduranceRecords` from `src/endurance-core.mjs` at app/result time.
- Produces normalized save shape with `endurance: { bestScore, bestTimeMs, bestRound }`.

- [ ] **Step 1: Write save RED tests**

Create `save.test.mjs`:

```js
import assert from 'node:assert/strict';
import { normalizeProgress } from './src/save.mjs';

const migrated = normalizeProgress({
  version: 1,
  levels: { 'meadow-01': { stars: 2, score: 500, completed: true, masteries: [] } },
  settings: { sound: false },
});
assert.deepEqual(migrated.endurance, { bestScore: 0, bestTimeMs: 0, bestRound: 0 });
assert.equal(migrated.levels['meadow-01'].stars, 2);
assert.equal(migrated.settings.sound, false);

const normalized = normalizeProgress({
  endurance: { bestScore: 1234, bestTimeMs: 65000, bestRound: 9 },
});
assert.deepEqual(normalized.endurance, { bestScore: 1234, bestTimeMs: 65000, bestRound: 9 });

const clamped = normalizeProgress({ endurance: { bestScore: -1, bestTimeMs: -2, bestRound: -3 } });
assert.deepEqual(clamped.endurance, { bestScore: 0, bestTimeMs: 0, bestRound: 0 });

console.log('✓ save migration + Endurance records');
```

- [ ] **Step 2: Run RED**

```bash
node save.test.mjs
```

Expected: FAIL because `endurance` is missing.

- [ ] **Step 3: Normalize Endurance records without changing the storage key**

Inside `normalizeProgress` return:

```js
endurance: {
  bestScore: Math.max(0, Number(source.endurance?.bestScore) || 0),
  bestTimeMs: Math.max(0, Number(source.endurance?.bestTimeMs) || 0),
  bestRound: Math.max(0, Math.floor(Number(source.endurance?.bestRound) || 0)),
},
```

Keep `STORAGE_KEY = 'balloon-sky-rescue-v1'` so existing progress migrates in place rather than splitting campaign data across two localStorage keys.

- [ ] **Step 4: Run GREEN and add CI**

```bash
node save.test.mjs
node --check src/save.mjs
```

Add `node save.test.mjs` to CI.

- [ ] **Step 5: Commit**

```bash
git add src/save.mjs save.test.mjs .github/workflows/ci.yml
git commit -m "feat: persist Endurance records"
```

---

### Task 8: Endurance intro, controller switching, HUD, result dialog, and responsive styles

**Files:**
- Modify: `index.html`
- Modify: `src/app.mjs`
- Create: `styles/endurance.css`
- Modify: `styles/mobile.css`
- Create: `endurance-ui.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `EnduranceGame`, `updateEnduranceRecords`, save layer.
- App owns exactly one active game controller at a time: `activeGame` and `activeMode`.
- Produces DOM IDs: `enduranceButton`, `enduranceDialog`, `enduranceStartButton`, `enduranceBackButton`, `enduranceBestScore`, `enduranceBestTime`, `enduranceBestRound`, plus label IDs `statOneLabel`, `statTwoLabel`, `statThreeLabel`.

- [ ] **Step 1: Write UI contract RED test**

Create `endurance-ui.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./src/app.mjs', import.meta.url), 'utf8');

for (const id of [
  'enduranceButton', 'enduranceDialog', 'enduranceStartButton', 'enduranceBackButton',
  'enduranceBestScore', 'enduranceBestTime', 'enduranceBestRound',
  'statOneLabel', 'statTwoLabel', 'statThreeLabel',
]) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);

assert.ok(app.includes("activeMode = 'endurance'"));
assert.ok(app.includes('new EnduranceGame'));
assert.ok(app.includes('updateEnduranceRecords'));
assert.ok(app.includes("refs.statOneLabel.textContent = 'Runda'"));
assert.ok(app.includes("refs.statTwoLabel.textContent = 'Do rzędu'"));
assert.ok(app.includes("refs.statThreeLabel.textContent = 'Czas'"));

console.log('✓ Endurance UI contract');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-ui.test.mjs
```

Expected: FAIL on missing IDs/imports.

- [ ] **Step 3: Add the Endurance entry and intro dialog**

In `index.html`, wrap campaign actions so `Graj` and `Endurance` are peers. Add:

```html
<div class="campaign-actions">
  <button class="button button-primary button-large" id="continueButton" type="button">Graj</button>
  <button class="button button-secondary button-large" id="enduranceButton" type="button">Endurance</button>
</div>
```

Add an Endurance dialog:

```html
<dialog class="game-dialog endurance-dialog" id="enduranceDialog" aria-labelledby="enduranceTitle">
  <p class="dialog-kicker">Tryb punktowy</p>
  <h2 id="enduranceTitle">Endurance</h2>
  <p>3 strzały = nowy rząd</p>
  <dl class="endurance-records">
    <div><dt>Best Score</dt><dd id="enduranceBestScore">0</dd></div>
    <div><dt>Best Time</dt><dd id="enduranceBestTime">00:00</dd></div>
    <div><dt>Best Round</dt><dd id="enduranceBestRound">0</dd></div>
  </dl>
  <div class="dialog-actions">
    <button class="button button-ghost" id="enduranceBackButton" type="button">Wróć</button>
    <button class="button button-primary" id="enduranceStartButton" type="button">Start</button>
  </div>
</dialog>
```

Add IDs to the three existing bottom-HUD `dt` labels: `statOneLabel`, `statTwoLabel`, `statThreeLabel`.

Load `styles/endurance.css` after `styles/storm.css`.

- [ ] **Step 4: Refactor app to one active controller**

Replace the single global `game` instance with:

```js
let activeGame = null;
let activeMode = 'campaign';

function destroyActiveGame() {
  activeGame?.destroy?.();
  activeGame = null;
}
```

Create a callback factory so both controllers share audio/callout callbacks while campaign keeps rescue/anchor/boss callbacks and Endurance adds `onEnduranceEnd`.

`startLevel(level)` does:

```js
destroyActiveGame();
activeMode = 'campaign';
activeGame = new SkyRescueGame(refs.canvas, createGameCallbacks());
activeGame.start(level);
```

`startEndurance()` does:

```js
destroyActiveGame();
activeMode = 'endurance';
activeGame = new EnduranceGame(refs.canvas, createGameCallbacks());
activeGame.start(`run-${Date.now()}`);
```

Using the timestamp as run seed is acceptable for normal play; tests instantiate `EnduranceGame` with deterministic seeds directly.

Every existing `game.` reference in pause/resume/retry/map code becomes `activeGame?.`.

- [ ] **Step 5: Switch HUD semantics by snapshot mode**

Campaign mode restores:

```js
refs.statOneLabel.textContent = 'Strzały';
refs.statTwoLabel.textContent = 'Sufit';
refs.statThreeLabel.textContent = 'Pudła';
```

Endurance mode uses:

```js
refs.statOneLabel.textContent = 'Runda';
refs.statTwoLabel.textContent = 'Do rzędu';
refs.statThreeLabel.textContent = 'Czas';
refs.shotsValue.textContent = String(snapshot.round);
refs.dropValue.textContent = String(snapshot.shotsUntilRow);
refs.missesValue.textContent = formatDuration(snapshot.elapsedMs);
```

Set `gameScreen.dataset.mode = activeMode`. CSS hides `.playfield-objective` and `.boss-meter` when `data-mode="endurance"` while keeping score/combo/title readable.

- [ ] **Step 6: Save records and render Endurance result**

On `onEnduranceEnd(result)`:

```js
const updated = updateEnduranceRecords(progress.endurance, result);
progress = saveProgress({ ...progress, endurance: updated.records });
```

Render result dialog with no stars/masteries/Next. Put score in `resultScore`; `resultDetail` contains formatted time and `Runda ${result.round}` plus compact `NOWY REKORD` labels for whichever booleans in `updated.newRecords` are true.

Retry calls `startEndurance()`; Map calls `showMap()`.

- [ ] **Step 7: Add Endurance responsive CSS**

`styles/endurance.css` must style only new mode hooks/classes. Keep the intro records in a compact three-column desktop grid and a single-row/stacked mobile-safe layout. Do not increase playfield chrome height.

In `styles/mobile.css`, add only the media rules necessary for the Endurance intro and HUD labels to fit at 390×844 and landscape phone widths.

- [ ] **Step 8: Run contract and syntax tests**

```bash
node endurance-ui.test.mjs
node sky-rescue.test.mjs
node endurance-runtime.test.mjs
node --check src/app.mjs
```

Expected: PASS.

- [ ] **Step 9: Add UI test to CI and commit**

```bash
git add index.html src/app.mjs styles/endurance.css styles/mobile.css endurance-ui.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance UI flow"
```

---

### Task 9: Browser smoke for rounds, expansion, records, desktop/mobile, and final verification

**Files:**
- Modify: `.github/scripts/visual-smoke.mjs`
- Optionally modify: `.github/scripts/queue-smoke.mjs` only if its selectors assume campaign-only labels
- Modify: `.github/workflows/ci.yml` only if artifact names/paths need expansion

**Interfaces:**
- Browser smoke uses public UI only. A minimal `window.__enduranceTest` read-only snapshot hook is allowed only if Playwright cannot reliably observe `round`, `shotsInRound`, `spatialStage`, and `elapsedMs` from DOM; it must not expose mutation methods.

- [ ] **Step 1: Add Endurance intro smoke**

In `.github/scripts/visual-smoke.mjs`, add `verifyEndurance(browser)` with desktop viewport 1440×1000:

```js
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('#enduranceButton').click();
assert(await page.locator('#enduranceDialog').evaluate((d) => d.open), 'Endurance intro should open');
assert((await page.locator('#enduranceBestScore').textContent()) === '0', 'fresh record score should be zero');
await page.screenshot({ path: 'artifacts/desktop-endurance-intro.png', fullPage: true });
await page.locator('#enduranceStartButton').click();
assert(await page.locator('#gameScreen').isVisible(), 'Endurance game should open');
assert((await page.locator('#statOneLabel').textContent()) === 'Runda');
assert((await page.locator('#statTwoLabel').textContent()) === 'Do rzędu');
assert((await page.locator('#statThreeLabel').textContent()) === 'Czas');
await page.screenshot({ path: 'artifacts/desktop-endurance-start.png', fullPage: true });
```

- [ ] **Step 2: Add deterministic browser acceleration only for smoke**

Do **not** make production balance faster. Add a query-string test configuration accepted only when `location.search` contains `enduranceSmoke=1`, e.g. `?enduranceSmoke=1`, that clones config at runtime with expansion thresholds `[1, 2, 3]` and zoom duration `.1`. The production default path still uses the approved 55/100/140/... values.

The smoke page uses:

```js
const ENDURANCE_BASE = 'http://127.0.0.1:4173/index.html?enduranceSmoke=1';
```

This is preferable to mutating internal game state from Playwright.

- [ ] **Step 3: Exercise three-shot row insertion through the canvas**

Use the current canvas click helper three times, waiting for each projectile to settle. Read `#dropValue`; after the third resolved shot assert it returns to `3` and `#shotsValue` changes from `1` to `2`.

Capture:

```text
artifacts/desktop-endurance-after-row.png
```

If random shot outcomes make three legal shots unreliable, use a deterministic run seed supplied by `?enduranceSeed=smoke` and keep all interaction through normal pointer events.

- [ ] **Step 4: Verify first expansion visually and structurally**

Wait until the smoke threshold triggers and transition completes. Assert the read-only snapshot or DOM data attribute reports `spatialStage >= 1`. Capture:

```text
artifacts/desktop-endurance-expanded.png
```

Wait for one more accelerated stage and capture:

```text
artifacts/desktop-endurance-wide.png
```

Assert no horizontal overflow after each expansion.

- [ ] **Step 5: Verify Endurance result/record persistence**

For browser smoke only, expose a keyboard-safe test failure route through the existing game by allowing the generated stack to reach the launcher naturally under accelerated rows; do not call controller mutation APIs from Playwright. If that is too slow even in smoke mode, configure smoke mode with `shotsPerRound: 1` while keeping production at 3.

After loss:

```js
assert(await page.locator('#resultDialog').evaluate((d) => d.open));
assert(await page.locator('#nextButton').isHidden(), 'Endurance has no Next action');
assert(await page.locator('#resultMasteries').isHidden(), 'Endurance has no mastery result');
await page.screenshot({ path: 'artifacts/desktop-endurance-result.png', fullPage: true });
```

Return to map, reopen Endurance intro, and assert at least one record is now non-zero.

- [ ] **Step 6: Add mobile portrait and landscape expansion smoke**

Run Endurance smoke at:

```text
390×844 portrait
844×390 landscape
```

Capture:

```text
artifacts/mobile-endurance-start.png
artifacts/mobile-endurance-expanded.png
artifacts/mobile-landscape-endurance-expanded.png
```

Assert:

- document horizontal overflow <= 1 px;
- canvas visible;
- launcher and bottom queue visible;
- `Runda`, `Do rzędu`, `Czas`, score, and combo labels remain readable/non-overlapping by checking their bounding boxes do not intersect the canvas clipping boundary or each other.

- [ ] **Step 7: Run the full local test suite**

```bash
node balloon.test.js
node sky-rescue.test.mjs
node wind.test.mjs
node pixel-art.test.mjs
node orb-pass.test.mjs
node orb-rack.test.mjs
node gameplay-polish.test.mjs
node storm-peaks.test.mjs
node storm-content.test.mjs
node storm-runtime.test.mjs
node storm-feedback.test.mjs
node endurance-core.test.mjs
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
node endurance-runtime.test.mjs
node save.test.mjs
node endurance-ui.test.mjs
node level-integrity.test.mjs
node --check src/sky-rescue-core.mjs
node --check src/endurance-core.mjs
node --check src/endurance-geometry.mjs
node --check src/shot-resolution.mjs
node --check src/endurance-game.mjs
node --check src/game.mjs
node --check src/game-renderer.mjs
node --check src/save.mjs
node --check src/app.mjs
```

Expected: all PASS.

- [ ] **Step 8: Run exact-head GitHub Actions and review screenshots**

Push the final feature head and require both jobs on that exact SHA:

```text
test = success
browser-smoke = success
```

Manually inspect all Endurance screenshots from the `sky-rescue-screenshots` artifact. Reject the pass if later-stage orbs are unreadably small, the launcher/queue is obscured, HUD overlaps, or the zoom produces an apparent jump rather than a centered scale-out.

- [ ] **Step 9: Update `playable` only after exact-head green**

Fast-forward `playable` to the exact verified feature head. Do not merge PR #1 and do not update `main`.

- [ ] **Step 10: Update PR #1 summary and verification comment**

Document:

- campaign empty-board fix;
- Endurance entry point;
- 3 shots/round row cadence;
- progressive board widening until 6.5 px floor;
- 0.6 s zoom transition;
- score/time/round records;
- exact SHA + CI run ID + desktop/mobile smoke coverage.

Commit browser-smoke changes before the final push:

```bash
git add .github/scripts/visual-smoke.mjs .github/scripts/queue-smoke.mjs .github/workflows/ci.yml
git commit -m "test: verify Endurance mode in browser"
```
