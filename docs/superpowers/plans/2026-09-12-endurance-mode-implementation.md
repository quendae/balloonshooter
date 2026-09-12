# Endurance Mode + Empty-Board Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the campaign empty-board dead state and add a score-focused Endurance mode with a new row every three resolved shots, progressive logical board expansion, smooth zoom-out, local records, and responsive UI.

**Architecture:** Keep authored campaign geometry unchanged. Add a pure Endurance rules module, an Endurance-only dynamic hex geometry object, a thin `EnduranceGame` subclass of `SkyRescueGame`, and one shared shot-resolution helper so both modes use the same pop/drop semantics. `GameRenderer` accepts an injected board geometry per frame plus transition cells for the 0.6 s zoom. `app.mjs` owns exactly one active controller at a time.

**Tech Stack:** Vanilla JavaScript ES modules, Canvas 2D, existing `BALLOON` engine for campaign, Node `assert` tests, Playwright browser smoke, localStorage, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-endurance-mode-design.md`

## Global Constraints

- **3 resolved shots = 1 Endurance round**.
- Start: **Round 1**, `shotsInRound = 0`, **4 generated occupied rows**.
- Spatial stage: **+1 column per side** and **+2 row capacity**.
- Zoom duration: **0.6 s**.
- Minimum orb radius: **6.5 logical px**.
- Base difficulty thresholds: **55, 100, 140, 175, 205 s**, then **+27 s**.
- Adaptive timing adjustment: clamp to **[-8 s, +8 s]**.
- Palette: **4 colors**, add fifth at difficulty stage **3**.
- Endurance multiplier: **+0.25x every 5 rounds**, max **3.00x**.
- Round bonus: **100 × multiplier**. Clear bonus: **1000 × multiplier**.
- Specials: none before Round 4; then eligible every **6 resolved shots**, cycling Guide → Bomb → Rainbow.
- No Endurance lightning, no max-shot failure, no wind physics.
- `main` stays untouched. `playable` moves only after exact-head CI and visual review are green.

---

### Task 1: Campaign empty-board terminal reconciliation

**Files:**
- Modify: `src/sky-rescue-core.mjs`
- Modify: `src/game.mjs`
- Modify: `sky-rescue.test.mjs`

**Interfaces:**
- Produces `campaignTerminalDecision(objective, state) -> { complete, fallbackEmptyBoard, evaluation }`.

- [ ] **Step 1: Write the failing tests**

Append to `sky-rescue.test.mjs`:

```js
import { campaignTerminalDecision } from './src/sky-rescue-core.mjs';

assert.deepEqual(
  campaignTerminalDecision({ type: 'clear' }, { remainingBalloons: 0 }),
  {
    complete: true,
    fallbackEmptyBoard: false,
    evaluation: { complete: true, current: 1, target: 1 },
  },
);

const rescueFallback = campaignTerminalDecision(
  { type: 'rescue', amount: 2 },
  { remainingBalloons: 0, rescued: 1 },
);
assert.equal(rescueFallback.complete, true);
assert.equal(rescueFallback.fallbackEmptyBoard, true);

const liveCollect = campaignTerminalDecision(
  { type: 'collect', amount: 2 },
  { remainingBalloons: 5, collected: 1 },
);
assert.equal(liveCollect.complete, false);
```

- [ ] **Step 2: Run RED**

```bash
node sky-rescue.test.mjs
```

Expected: FAIL because `campaignTerminalDecision` is not exported.

- [ ] **Step 3: Implement the pure decision**

Add to `src/sky-rescue-core.mjs`:

```js
export function campaignTerminalDecision(objective = { type: 'clear' }, state = {}) {
  const evaluation = evaluateObjective(objective, state);
  const empty = Math.max(0, Number(state.remainingBalloons) || 0) === 0;
  return {
    complete: Boolean(evaluation.complete || empty),
    fallbackEmptyBoard: Boolean(empty && !evaluation.complete),
    evaluation,
  };
}
```

- [ ] **Step 4: Add one campaign runtime helper and call it after removals**

In `src/game.mjs`:

```js
reconcileCampaignTerminalState() {
  const decision = campaignTerminalDecision(this.level.objective, this.objectiveState());
  if (!decision.complete) return false;
  this.complete();
  return true;
}
```

Call it:

1. in `land()` after objects, score/effects, and boss-phase updates, before lightning/ceiling/max-shot/fail checks;
2. at the end of `shiftCeiling()` after grid/object movement and the ceiling callback, because `shiftDown` can remove out-of-grid cells.

Use:

```js
if (this.reconcileCampaignTerminalState()) return;
```

An empty campaign board therefore cannot remain `playing`, regardless of objective type.

- [ ] **Step 5: Verify campaign/storm regression**

```bash
node sky-rescue.test.mjs
node storm-peaks.test.mjs
node storm-runtime.test.mjs
node storm-feedback.test.mjs
node --check src/game.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sky-rescue-core.mjs src/game.mjs sky-rescue.test.mjs
git commit -m "fix: resolve empty campaign boards"
```

---

### Task 2: Pure Endurance rules and records

**Files:**
- Create: `src/endurance-core.mjs`
- Create: `endurance-core.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces `ENDURANCE_CONFIG`.
- Produces `createEnduranceState()`, `advanceRoundState(state)`.
- Produces `pressureAdjustmentSeconds(pressure)`, `baseExpansionTimeSeconds(stage)`, `adjustedExpansionTimeSeconds(stage, pressure)`.
- Produces `enduranceMultiplier(round)`, `survivalBonus(round)`, `clearBonus(round)`.
- Produces `paletteForStage(stage)`.
- Produces `scheduledSpecialType({ round, resolvedShots, previousWasSpecial })`.
- Produces `updateEnduranceRecords(records, result)`.

- [ ] **Step 1: Write the failing core test**

Create `endurance-core.test.mjs`:

```js
import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  createEnduranceState,
  advanceRoundState,
  pressureAdjustmentSeconds,
  baseExpansionTimeSeconds,
  adjustedExpansionTimeSeconds,
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

let state = createEnduranceState();
({ state } = advanceRoundState(state));
({ state } = advanceRoundState(state));
assert.equal(state.round, 1);
assert.equal(state.shotsInRound, 2);
({ state } = advanceRoundState(state));
assert.equal(state.round, 2);
assert.equal(state.shotsInRound, 0);
assert.equal(state.resolvedShots, 3);

assert.equal(pressureAdjustmentSeconds(.45), -8);
assert.equal(pressureAdjustmentSeconds(.60), 0);
assert.equal(pressureAdjustmentSeconds(.75), 8);
assert.equal(pressureAdjustmentSeconds(0), -8);
assert.equal(pressureAdjustmentSeconds(1), 8);
assert.equal(baseExpansionTimeSeconds(1), 55);
assert.equal(baseExpansionTimeSeconds(5), 205);
assert.equal(baseExpansionTimeSeconds(6), 232);
assert.equal(adjustedExpansionTimeSeconds(1, .45), 47);
assert.equal(adjustedExpansionTimeSeconds(1, .75), 63);

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

console.log('✓ Endurance core rules');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-core.test.mjs
```

Expected: module-not-found.

- [ ] **Step 3: Implement centralized config and helpers**

Use exactly:

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

Pressure interpolation:

```js
export function pressureAdjustmentSeconds(value) {
  const p = Math.max(0, Math.min(1, Number(value) || 0));
  if (p <= .45) return -8;
  if (p >= .75) return 8;
  if (p <= .60) return -8 + ((p - .45) / .15) * 8;
  return ((p - .60) / .15) * 8;
}
```

Multiplier:

```js
Math.min(3, 1 + Math.floor((Math.max(1, round) - 1) / 5) * .25)
```

Special eligibility points are 12, 18, 24... resolved shots; cycle index is `(resolvedShots / 6) - 2`.

- [ ] **Step 4: Run GREEN and wire CI**

```bash
node endurance-core.test.mjs
node --check src/endurance-core.mjs
```

Add `node endurance-core.test.mjs` and `node --check src/endurance-core.mjs` to CI.

- [ ] **Step 5: Commit**

```bash
git add src/endurance-core.mjs endurance-core.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance core rules"
```

---

### Task 3: Dynamic Endurance geometry and generated rows

**Files:**
- Create: `src/endurance-geometry.mjs`
- Create: `endurance-geometry.test.mjs`
- Modify: `src/endurance-core.mjs`
- Modify: `endurance-core.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `createEnduranceGeometry({ spatialStage, rowPhase }) -> geometry`.
- Geometry exposes `LW`, `LH`, `RAD`, `PH`, `PV`, `LAUNCH_Y`, `MAXROW`, `stage`, `rowPhase`, `rowCols`, `colX`, `rowY`, `inGrid`, `key`, `split`, `neighbors`, `setBalloon`, `settle`, `findSnap`, `topConnected`, `lowestRow`.
- `canExpandSpatially(stage) -> boolean`.
- `remapGridForExpansion(grid) -> Map`.
- `shiftGridForNewRow(grid, geometry) -> { grid, nextRowPhase, overflowed }`.
- `failureLineReached(grid, geometry) -> boolean`.
- Endurance core additionally produces `generateEnduranceRow` and `generateInitialEnduranceGrid`.

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

assert.equal(canExpandSpatially(4), false);

const before = new Map([[g0.key(0, 0), 1], [g0.key(4, 2), 2], [g0.key(8, 3), 3]]);
const expanded = remapGridForExpansion(before);
assert.deepEqual([...expanded.keys()], ['1,0', '5,2', '9,3']);
assert.equal(expanded.size, before.size);

const shifted = shiftGridForNewRow(before, g0);
assert.equal(shifted.nextRowPhase, 1);
assert.equal(shifted.grid.size, before.size);
assert.equal(shifted.overflowed, false);

const bottom = new Map([[g0.key(4, g0.MAXROW), 1]]);
const overflow = shiftGridForNewRow(bottom, g0);
assert.equal(overflow.overflowed, true, 'cells may never silently disappear beyond max row capacity');

console.log('✓ Endurance geometry');
```

- [ ] **Step 2: Write generated-row RED tests**

Append to `endurance-core.test.mjs`:

```js
import { createEnduranceGeometry } from './src/endurance-geometry.mjs';
import { generateEnduranceRow, generateInitialEnduranceGrid } from './src/endurance-core.mjs';

const geometry = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
let i = 0;
const values = [.1, .1, .1, .7, .7, .2, .2, .9, .9, .3];
const row = generateEnduranceRow({
  geometry,
  targetRow: 0,
  palette: [1, 2, 3, 4],
  rng: () => values[(i++) % values.length],
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

Expected: FAIL because geometry/row helpers do not exist.

- [ ] **Step 4: Implement geometry**

Use fixed logical canvas `240×320`, launch Y `288`, and width-driven radius:

```js
const LW = 240;
const LH = 320;
const LAUNCH_Y = 288;
const Y0 = 48;

function descriptor(stage = 0) {
  const s = Math.max(0, Math.floor(Number(stage) || 0));
  const evenCols = 10 + s * 2;
  const oddCols = evenCols - 1;
  const rowCount = 10 + s * 2;
  const radius = Math.min(12, LW / (2 * evenCols));
  return { stage: s, evenCols, oddCols, rowCount, radius };
}
```

Set `MAXROW = rowCount - 1`, `PH = 2 * radius`, `PV = Math.sqrt(3) * radius`. Center rows horizontally with:

```js
const leftMargin = (LW - evenCols * PH) / 2;
const firstCenterX = leftMargin + radius;
const rowCols = (r) => (((r + rowPhase) & 1) ? oddCols : evenCols);
const colX = (c, r) => firstCenterX + (((r + rowPhase) & 1) ? radius : 0) + c * PH;
const rowY = (r) => Y0 + r * PV;
```

Port the existing `BALLOON` algorithms for neighbors, same-color cluster, top-connected, settle, lowest row, and snap, replacing global constants with this geometry.

`shiftGridForNewRow` toggles `rowPhase` and maps `r -> r + 1`. If any cell would land above `MAXROW`, set `overflowed = true` and do **not** silently drop that cell. Runtime treats overflow as launcher-pressure loss. This resolves the fact that width-driven zoom keeps the bottom legal row slightly above the visual launcher line at early stages.

`failureLineReached` still checks the actual line:

```js
geometry.rowY(r) + geometry.RAD >= geometry.LAUNCH_Y - 17
```

A run loses on either `overflowed === true` or `failureLineReached(...) === true`.

- [ ] **Step 5: Implement deterministic rows**

In `src/endurance-core.mjs`:

```js
export function generateEnduranceRow({ geometry, targetRow = 0, palette, rng = Math.random }) {
  const colors = palette.length ? [...palette] : [1, 2, 3, 4];
  const row = [];
  for (let c = 0; c < geometry.rowCols(targetRow); c += 1) {
    let color = colors[Math.min(colors.length - 1, Math.floor(rng() * colors.length))];
    if (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) {
      color = colors[(colors.indexOf(color) + 1) % colors.length];
    }
    row.push({ c, r: targetRow, color });
  }
  return row;
}

export function generateInitialEnduranceGrid({ geometry, palette, rng = Math.random, rows = 4 }) {
  const grid = new Map();
  for (let r = 0; r < rows; r += 1) {
    for (const cell of generateEnduranceRow({ geometry, targetRow: r, palette, rng })) {
      grid.set(geometry.key(cell.c, cell.r), cell.color);
    }
  }
  return grid;
}
```

- [ ] **Step 6: Run GREEN and add CI**

```bash
node endurance-geometry.test.mjs
node endurance-core.test.mjs
node --check src/endurance-geometry.mjs
node --check src/endurance-core.mjs
```

Add the geometry test and syntax check to CI.

- [ ] **Step 7: Commit**

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
- `resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor, ceilRow }) -> { popped, dropped, placedColor }`.
- Renderer consumes optional `state.geometry`, `state.mode`, and `state.transitionCells`.

- [ ] **Step 1: Write resolver RED tests**

Create `shot-resolution.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolveShotOnGrid } from './src/shot-resolution.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

const grid = new Map([[B.key(3, 0), 1], [B.key(4, 0), 1]]);
const result = resolveShotOnGrid({
  grid,
  shot: { type: 'normal', color: 1 },
  c: 5,
  r: 0,
  geometry: B,
  pickColor: () => 1,
  ceilRow: 0,
});
assert.equal(result.popped.length, 3);
assert.equal(grid.size, 0);

console.log('✓ shared shot resolver');
```

- [ ] **Step 2: Run RED**

```bash
node shot-resolution.test.mjs
```

Expected: module-not-found.

- [ ] **Step 3: Extract settlement**

Create `src/shot-resolution.mjs`:

```js
import { bombAffectedKeys, chooseRainbowColor } from './sky-rescue-core.mjs';

export function resolveShotOnGrid({ grid, shot, c, r, geometry, pickColor, ceilRow = 0 }) {
  let popped = [];
  let dropped = [];
  let placedColor = shot.color || pickColor();

  if (shot.type === 'bomb') {
    geometry.setBalloon(grid, c, r, placedColor);
    popped = bombAffectedKeys(c, r, geometry.neighbors).filter((key) => grid.has(key));
    popped.forEach((key) => grid.delete(key));
    const connected = geometry.topConnected(grid, ceilRow);
    dropped = [...grid.keys()].filter((key) => !connected.has(key));
    dropped.forEach((key) => grid.delete(key));
  } else {
    placedColor = shot.type === 'rainbow'
      ? chooseRainbowColor(grid, c, r, geometry.neighbors) || pickColor()
      : shot.color;
    geometry.setBalloon(grid, c, r, placedColor);
    const settled = geometry.settle(grid, c, r, ceilRow);
    popped = settled.popped;
    dropped = settled.dropped;
  }

  return { popped, dropped, placedColor };
}
```

Replace only the bomb/rainbow/normal grid mutation block in campaign `land()` with this helper.

- [ ] **Step 4: Add renderer RED contract**

In `gameplay-polish.test.mjs` assert source contains:

```js
assert.ok(renderer.includes('state.geometry || this.B'));
assert.ok(renderer.includes('state.transitionCells'));
assert.ok(renderer.includes("state.mode === 'endurance'"));
```

Run `node gameplay-polish.test.mjs`; expected FAIL.

- [ ] **Step 5: Inject geometry into renderer**

At the top of `GameRenderer.draw`:

```js
const board = state.geometry || this.B;
const boardScale = board.RAD / 12;
```

Use `board.split/colX/rowY/RAD` for occupied cells. Render board balls with `boardScale`. Render current launcher orb/projectile with `boardScale`; keep the two future queue previews at their current UI size.

If `state.transitionCells` is present, render those `{ color, x, y, radius }` cells instead of `state.grid`.

For `state.mode === 'endurance'`, draw a subtle danger line at `board.LAUNCH_Y - 17` and skip campaign ceiling/objective markers. Campaign path remains unchanged when no injected geometry/mode exists.

- [ ] **Step 6: Run regression**

```bash
node shot-resolution.test.mjs
node sky-rescue.test.mjs
node gameplay-polish.test.mjs
node storm-peaks.test.mjs
node --check src/shot-resolution.mjs
node --check src/game.mjs
node --check src/game-renderer.mjs
```

Expected: PASS.

- [ ] **Step 7: Add CI and commit**

```bash
git add src/shot-resolution.mjs src/game.mjs src/game-renderer.mjs shot-resolution.test.mjs gameplay-polish.test.mjs .github/workflows/ci.yml
git commit -m "refactor: share shot resolution with Endurance"
```

---

### Task 5: Endurance runtime — rounds, rows, scoring, clear bonus, failure

**Files:**
- Create: `src/endurance-game.mjs`
- Create: `endurance-runtime.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `EnduranceGame extends SkyRescueGame`.
- Constructor: `new EnduranceGame(canvas, callbacks = {}, options = {})`; `options.config` defaults to `ENDURANCE_CONFIG`.
- Public lifecycle matches campaign: `start(seed)`, `destroy()`, `setPaused()`, `getSnapshot()`.
- Snapshot fields: `mode`, `round`, `shotsInRound`, `shotsUntilRow`, `elapsedMs`, `difficultyStage`, `spatialStage`.

- [ ] **Step 1: Write runtime RED tests**

In `endurance-runtime.test.mjs`, use the same fake-canvas/RAF approach as `storm-feedback.test.mjs`. Assert:

```js
const game = new EnduranceGame(canvas, callbacks, { config: ENDURANCE_CONFIG });
game.start('test-seed');
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 0);
assert.equal(new Set([...game.grid.keys()].map((k) => game.B.split(k)[1])).size, 4);
assert.equal(game.status, 'playing');
assert([1, 2, 3, 4].includes(game.pickColor()));

game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 1);
assert.equal(game.shotsInRound, 2);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(game.round, 2);
assert.equal(game.shotsInRound, 0);

const before = game.score;
game.clearBonusArmed = true;
game.grid.clear();
game.applyEnduranceClearBonus();
assert(game.score > before);
const once = game.score;
game.applyEnduranceClearBonus();
assert.equal(game.score, once);
```

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: module-not-found.

- [ ] **Step 3: Implement subclass start state**

Before calling `super.start(level)`, set Endurance fields used by overridden queue methods:

```js
this.round = 1;
this.shotsInRound = 0;
this.resolvedShots = 0;
this.difficultyStage = 0;
this.spatialStage = 0;
this.rowPhase = 0;
this.elapsedMs = 0;
this.pendingExpansion = null;
this.lastIssuedShotWasSpecial = false;
```

Create stage-0 geometry and four deterministic rows. Build a synthetic level with no real objective pressure:

```js
{
  id: `endurance-${seed}`,
  name: 'Endurance',
  world: 'meadow',
  atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: .15 },
  grid,
  objects: [],
  objective: { type: 'survive', amount: Number.MAX_SAFE_INTEGER },
  maxShots: Number.MAX_SAFE_INTEGER,
  shotsPerDrop: Number.MAX_SAFE_INTEGER,
  specials: [],
}
```

Call `super.start(level)`, then restore/confirm Endurance counters and emit state. `start()` never invokes campaign completion because Endurance overrides `land()`.

- [ ] **Step 4: Override queue and special selection**

`pickColor()` uses active board colors intersected with `paletteForStage`; when grid is empty, use the configured palette directly, never color 0.

`nextShot()` uses `scheduledSpecialType({ round: this.round, resolvedShots: this.resolvedShots, previousWasSpecial: this.lastIssuedShotWasSpecial })`, then updates `lastIssuedShotWasSpecial`.

- [ ] **Step 5: Implement Endurance `land()` and shared settlement**

Use current dynamic geometry:

```js
const snap = this.B.findSnap(this.grid, shot.x, shot.y, this.B.PH * 1.6, 0);
```

Resolve through `resolveShotOnGrid`. Reuse `scoreTurn`, combo logic, particles, bounce/shot audio callbacks, and queue reconciliation. Skip campaign objects, objectives, lightning, ceiling-drop logic, and max-shot checks.

- [ ] **Step 6: Implement round progression and row insertion**

`afterResolvedEnduranceShot`:

```js
this.resolvedShots += 1;
this.shotsInRound += 1;
this.score += Math.round(turnScore * enduranceMultiplier(this.round));
this.applyEnduranceClearBonus();
if (failureLineReached(this.grid, this.B)) return this.finishEndurance('Kulki dotarły do wyrzutni.');

if (this.shotsInRound >= this.config.shotsPerRound) {
  this.insertEnduranceRow();
  if (this.status !== 'playing') return;
  this.shotsInRound = 0;
  this.round += 1;
  this.score += survivalBonus(this.round);
}
```

`insertEnduranceRow()`:

1. `shiftGridForNewRow`;
2. if `overflowed`, lose immediately;
3. rebuild same-stage geometry with returned `rowPhase`;
4. check actual danger line;
5. generate a full top row with current palette;
6. set `clearBonusArmed = true`;
7. reconcile/fill queue;
8. check danger line again.

- [ ] **Step 7: Implement clear latch, snapshot, and Endurance finish**

`applyEnduranceClearBonus()` awards once only when `grid.size === 0 && clearBonusArmed`, then sets the latch false. Any later non-empty row sets it true again.

Override `renderState()` now, even before zoom support:

```js
renderState() {
  return {
    ...super.renderState(),
    mode: 'endurance',
    geometry: this.B,
  };
}
```

`getSnapshot()` returns Endurance-only HUD fields. `finishEndurance(reason)` changes status once and calls `callbacks.onEnduranceEnd({ score, elapsedMs, round, reason })` after the normal short result delay.

- [ ] **Step 8: Run GREEN, add CI, commit**

```bash
node endurance-runtime.test.mjs
node shot-resolution.test.mjs
node sky-rescue.test.mjs
node storm-feedback.test.mjs
node --check src/endurance-game.mjs
```

Add Endurance runtime test/syntax to CI.

```bash
git add src/endurance-game.mjs endurance-runtime.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance round runtime"
```

---

### Task 6: Active timer, adaptive difficulty, and 0.6 s board expansion

**Files:**
- Modify: `src/endurance-game.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `endurance-runtime.test.mjs`

**Interfaces:**
- Runtime transition shape:

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

- Renderer consumes `transitionCells: Array<{ color, x, y, radius }>`.

- [ ] **Step 1: Add timing/transition RED tests**

Use a test config with short thresholds but production defaults unchanged:

```js
const fastConfig = {
  ...ENDURANCE_CONFIG,
  expansionTimesSeconds: [1, 2, 3],
  laterExpansionIntervalSeconds: 1,
  zoomDurationSeconds: .1,
};
```

Assert:

```js
const game = new EnduranceGame(canvas, callbacks, { config: fastConfig });
game.start('expansion-seed');

game.elapsedMs = 1_000;
game.maybeAdvanceDifficultyStage();
assert.equal(game.difficultyStage, 1);
assert(game.pendingExpansion);
assert.equal(game.spatialStage, 0);

const shotsBefore = game.shotsInRound;
game.shoot();
assert.equal(game.projectile, null);

game.setPaused(true);
const transitionBefore = game.pendingExpansion.elapsed;
game.update(.05);
assert.equal(game.pendingExpansion.elapsed, transitionBefore);
game.setPaused(false);

game.update(.09);
assert.equal(game.spatialStage, 0);
game.update(.02);
assert.equal(game.spatialStage, 1);
assert.equal(game.shotsInRound, shotsBefore);

const stageBefore = game.difficultyStage;
game.elapsedMs = 99_000;
game.update(.033);
assert.equal(game.difficultyStage, stageBefore + 1, 'one frame advances at most one difficulty stage');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: FAIL on missing timing/transition behavior.

- [ ] **Step 3: Accumulate active time safely**

Override `update(dt)`:

```js
update(dt) {
  if (this.paused || this.status !== 'playing') return;
  if (this.pendingExpansion) {
    this.advanceExpansion(dt);
    return;
  }

  this.elapsedMs += dt * 1000;
  super.update(dt);

  if (!this.projectile && !this.pendingExpansion && this.status === 'playing') {
    this.maybeAdvanceDifficultyStage();
  }
}
```

Base `tick` already clamps RAF `dt` to `.033`, so background-tab wall time is not counted.

- [ ] **Step 4: Implement adaptive threshold and one-stage-per-update**

Pressure:

```js
const lowest = this.B.lowestRow(this.grid);
const pressure = lowest < 0 ? 0 : lowest / Math.max(1, this.B.MAXROW);
```

Trigger only `difficultyStage + 1` each update. Set `difficultyStage` immediately when its threshold is reached.

- [ ] **Step 5: Start a spatial transition only when readable**

If `canExpandSpatially(this.spatialStage)` is false, stop after advancing difficulty stage. Otherwise create next geometry, remap all occupied cells `c -> c + 1`, and store the transition. Do not mutate authoritative `grid`, `B`, or `spatialStage` until transition completion.

Override `shoot()` to return while `pendingExpansion` exists.

- [ ] **Step 6: Interpolate renderer cells**

In `renderState()` compute smoothstep `t` and map each old key `[c,r]` to new `[c+1,r]`:

```js
const smooth = t * t * (3 - 2 * t);
const x = fromX + (toX - fromX) * smooth;
const y = fromY + (toY - fromY) * smooth;
const radius = fromGeometry.RAD + (toGeometry.RAD - fromGeometry.RAD) * smooth;
```

Return `transitionCells`. Renderer Task 4 uses them instead of normal grid cells.

At completion only:

```js
this.grid = pending.toGrid;
this.B = pending.toGeometry;
this.spatialStage += 1;
this.pendingExpansion = null;
if (failureLineReached(this.grid, this.B)) this.finishEndurance('Kulki dotarły do wyrzutni.');
```

- [ ] **Step 7: Run GREEN and commit**

```bash
node endurance-runtime.test.mjs
node endurance-geometry.test.mjs
node gameplay-polish.test.mjs
node --check src/endurance-game.mjs
node --check src/game-renderer.mjs
```

```bash
git add src/endurance-game.mjs src/game-renderer.mjs endurance-runtime.test.mjs
git commit -m "feat: add Endurance board expansion"
```

---

### Task 7: Save migration and Endurance records

**Files:**
- Modify: `src/save.mjs`
- Create: `save.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Normalized save includes `endurance: { bestScore, bestTimeMs, bestRound }`.

- [ ] **Step 1: Write RED save tests**

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

const normalized = normalizeProgress({ endurance: { bestScore: 1234, bestTimeMs: 65000, bestRound: 9 } });
assert.deepEqual(normalized.endurance, { bestScore: 1234, bestTimeMs: 65000, bestRound: 9 });

console.log('✓ Endurance save migration');
```

- [ ] **Step 2: Run RED**

```bash
node save.test.mjs
```

Expected: FAIL because `endurance` is absent.

- [ ] **Step 3: Extend normalization without changing storage key**

Add:

```js
endurance: {
  bestScore: Math.max(0, Number(source.endurance?.bestScore) || 0),
  bestTimeMs: Math.max(0, Number(source.endurance?.bestTimeMs) || 0),
  bestRound: Math.max(0, Math.floor(Number(source.endurance?.bestRound) || 0)),
},
```

Keep `STORAGE_KEY = 'balloon-sky-rescue-v1'` so existing users migrate in place.

- [ ] **Step 4: Run GREEN, add CI, commit**

```bash
node save.test.mjs
node --check src/save.mjs
```

```bash
git add src/save.mjs save.test.mjs .github/workflows/ci.yml
git commit -m "feat: persist Endurance records"
```

---

### Task 8: Endurance UI flow and controller switching

**Files:**
- Modify: `index.html`
- Modify: `src/app.mjs`
- Create: `styles/endurance.css`
- Modify: `styles/mobile.css`
- Create: `endurance-ui.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- App owns `activeGame` and `activeMode`.
- DOM IDs: `enduranceButton`, `enduranceDialog`, `enduranceStartButton`, `enduranceBackButton`, `enduranceBestScore`, `enduranceBestTime`, `enduranceBestRound`, `statOneLabel`, `statTwoLabel`, `statThreeLabel`.

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

assert.ok(app.includes('new EnduranceGame'));
assert.ok(app.includes('updateEnduranceRecords'));
assert.ok(app.includes("refs.statOneLabel.textContent = 'Runda'"));
console.log('✓ Endurance UI contract');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-ui.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Add Endurance entry and intro dialog**

Replace the single campaign CTA with peer buttons:

```html
<div class="campaign-actions">
  <button class="button button-primary button-large" id="continueButton" type="button">Graj</button>
  <button class="button button-secondary button-large" id="enduranceButton" type="button">Endurance</button>
</div>
```

Add dialog with the approved rule copy and three records:

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

Add IDs to bottom HUD labels and load `styles/endurance.css` after `storm.css`.

- [ ] **Step 4: Refactor to one active controller**

```js
let activeGame = null;
let activeMode = 'campaign';

function destroyActiveGame() {
  activeGame?.destroy?.();
  activeGame = null;
}
```

`startLevel` destroys previous controller, sets campaign mode, creates `SkyRescueGame`, and starts the selected level.

`startEndurance` destroys previous controller, sets Endurance mode, creates `EnduranceGame`, and starts a seed. Normal play seed is `run-${Date.now()}`.

`showMap()` must call `destroyActiveGame()` after closing dialogs so hidden controllers never keep RAF/event listeners alive.

- [ ] **Step 5: Share callbacks and switch HUD semantics**

Create one callback factory. Campaign keeps rescue/collect/anchor/boss behavior. Endurance adds `onEnduranceEnd`.

Campaign labels:

```js
Strzały / Sufit / Pudła
```

Endurance labels:

```js
refs.statOneLabel.textContent = 'Runda';
refs.statTwoLabel.textContent = 'Do rzędu';
refs.statThreeLabel.textContent = 'Czas';
refs.shotsValue.textContent = String(snapshot.round);
refs.dropValue.textContent = String(snapshot.shotsUntilRow);
refs.missesValue.textContent = formatDuration(snapshot.elapsedMs);
```

Set `gameScreen.dataset.mode = activeMode`; CSS hides campaign objective and boss meter in Endurance.

- [ ] **Step 6: Render Endurance records and result**

When opening intro, fill records from `progress.endurance` and format time `mm:ss`.

On `onEnduranceEnd(result)`:

```js
const updated = updateEnduranceRecords(progress.endurance, result);
progress = saveProgress({ ...progress, endurance: updated.records });
```

Endurance result:
- hide `resultStars`;
- hide `resultMasteries`;
- hide `nextButton`;
- show score, formatted active time, round, and independent `NOWY REKORD` indicators;
- Retry calls `startEndurance()`;
- Map calls `showMap()`.

Campaign result restores stars/masteries/Next behavior.

- [ ] **Step 7: Style desktop/mobile without increasing playfield chrome**

`styles/endurance.css` owns intro records, Endurance mode hooks, and result record badges. `styles/mobile.css` only adds the rules needed at 390×844 and 844×390.

- [ ] **Step 8: Run GREEN, add CI, commit**

```bash
node endurance-ui.test.mjs
node endurance-runtime.test.mjs
node sky-rescue.test.mjs
node --check src/app.mjs
```

```bash
git add index.html src/app.mjs styles/endurance.css styles/mobile.css endurance-ui.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Endurance UI flow"
```

---

### Task 9: Browser smoke, exact-head verification, and playable handoff

**Files:**
- Modify: `.github/scripts/visual-smoke.mjs`
- Modify: `src/app.mjs`
- Modify: `src/endurance-game.mjs`
- Modify: `.github/workflows/ci.yml` only if artifact naming changes

**Interfaces:**
- Production defaults remain `ENDURANCE_CONFIG`.
- Test-only URL `?enduranceSmoke=1&enduranceSeed=smoke` supplies a cloned runtime config:

```js
{
  ...ENDURANCE_CONFIG,
  shotsPerRound: 1,
  initialRows: 8,
  expansionTimesSeconds: [1, 2, 3],
  laterExpansionIntervalSeconds: 1,
  zoomDurationSeconds: .1,
}
```

This override is only selected when `enduranceSmoke=1`; normal players keep the approved 3-shot/55-second balance.

- [ ] **Step 1: Add normal-config Endurance browser smoke**

At desktop 1440×1000:

1. open Endurance intro;
2. assert records display;
3. start normal Endurance;
4. assert HUD labels `Runda`, `Do rzędu`, `Czas`;
5. fire three real pointer shots, waiting for each to settle;
6. assert active round advances from 1 to 2 and `Do rzędu` resets to 3;
7. capture:

```text
artifacts/desktop-endurance-intro.png
artifacts/desktop-endurance-start.png
artifacts/desktop-endurance-after-row.png
```

Use `?enduranceSeed=smoke-normal` for deterministic row/queue generation but **not** the smoke config override.

- [ ] **Step 2: Add accelerated expansion/loss browser smoke**

Reload with:

```text
/index.html?enduranceSmoke=1&enduranceSeed=smoke
```

Start Endurance and interact only through normal buttons/canvas pointer input. Do not mutate controller internals from Playwright.

Capture first and later spatial expansions:

```text
artifacts/desktop-endurance-expanded.png
artifacts/desktop-endurance-wide.png
```

Assert no horizontal overflow and that `spatialStage` is observable through a **read-only** DOM attribute on `#gameScreen`, e.g. `data-spatial-stage`, updated from snapshots.

Because smoke mode has one shot per round and eight initial rows, continue legal shots until the stack reaches the loss condition with a hard cap of 20 shots. Assert result dialog opens, Next/masteries/stars are hidden, and capture:

```text
artifacts/desktop-endurance-result.png
```

Return to map, reopen Endurance intro, and assert at least one persisted record is non-zero.

- [ ] **Step 3: Add mobile portrait and landscape expansion smoke**

Run accelerated Endurance at:

```text
390×844
844×390
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
- launcher/current shot and queue visible;
- score/combo and `Runda`/`Do rzędu`/`Czas` bounding boxes do not overlap each other;
- bottom HUD remains inside `.playfield-frame`.

- [ ] **Step 4: Run the full local suite**

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

- [ ] **Step 5: Require exact-head GitHub Actions**

Push final feature head and require on the exact SHA:

```text
test = success
browser-smoke = success
```

Manually inspect every Endurance screenshot. Reject the pass if zoom looks like a jump, later orbs are unreadably small, launcher/queue are obscured, or desktop/mobile HUD overlaps.

- [ ] **Step 6: Move `playable` only after exact-head green**

Fast-forward `playable` to the verified feature SHA. Do not merge PR #1 and do not update `main`.

- [ ] **Step 7: Update PR #1**

Update summary/comment with:
- empty-board campaign fix;
- Endurance entry point;
- 3-shot production round cadence;
- progressive geometry growth to 6.5 px floor;
- 0.6 s zoom;
- score/time/round records;
- exact SHA, Actions run ID, and browser-smoke viewport coverage.

Commit browser-smoke changes before final push:

```bash
git add .github/scripts/visual-smoke.mjs src/app.mjs src/endurance-game.mjs .github/workflows/ci.yml
git commit -m "test: verify Endurance mode in browser"
```
