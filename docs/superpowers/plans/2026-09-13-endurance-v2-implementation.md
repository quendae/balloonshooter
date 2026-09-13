# Endurance v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Endurance's round/zoom loop with a fixed 11/10 board where every resolved miss adds one pressure row, palette difficulty grows at 60/120 seconds, specials are visually self-explanatory, and a deterministic balance harness validates the chosen tuning.

**Architecture:** Keep campaign code and `balloon.html` unchanged. Refactor Endurance into fixed pure rules in `src/endurance-core.mjs`, one fixed 11/10 geometry in `src/endurance-geometry.mjs`, and a simplified `EnduranceGame` runtime with no round/spatial-expansion state. Endurance rendering owns atmosphere crossfades while the shared shot renderer owns upgraded special visuals. A separate headless balance simulator reuses Endurance rules without browser/Canvas dependencies.

**Tech Stack:** Vanilla JavaScript ES modules, Canvas 2D, Node 22 + `node:assert/strict`, Playwright Chromium browser smoke, localStorage, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-endurance-v2-design.md`

## Global Constraints

- Fixed Endurance board: **11 columns on even rows / 10 columns on odd rows**.
- Start with exactly **4 occupied rows**.
- Top-row orb body must visually touch the ceiling boundary.
- A resolved shot is successful iff **`popped + dropped > 0`**.
- A resolved shot with **`popped + dropped === 0` adds exactly one full pressure row**.
- Drop-only success does **not** add a row.
- No round counter, 3-shot cadence, timed spatial expansion, adaptive zoom timer, or post-120-second mechanic.
- Active palette: **4 colors before 60 s; 5 colors from 60 s; 6 colors from 120 s onward**.
- Pause freezes active-play time and therefore palette progression.
- Background transition duration: **1.5 s** and must not pause gameplay.
- Endurance scoring uses the existing pop/drop base values plus combo multiplier: `min(2.0, 1 + 0.10 * max(0, combo - 1))`.
- Clear bonus baseline: **1000**, once per transition into an empty board, not combo-multiplied initially.
- Special baseline: first at resolved shot **12**, then every **8** shots, cycling `guide → bomb → rainbow`, never back-to-back.
- Special callout duration: **1.5 s**; per-type display cooldown: **8 s**.
- Records: `bestScore`, `bestTimeMs`, `bestCombo`; migrate old `bestRound` safely.
- Balance harness may compare parameters but must never automatically rewrite production config.
- Do not merge PR #2 or advance `main`/`playable` unless explicitly requested.

---

### Task 1: Replace round/expansion rules with fixed Endurance v2 pure rules

**Files:**
- Modify: `src/endurance-core.mjs`
- Replace expectations in: `endurance-core.test.mjs`

**Interfaces:**
- Produces: `paletteStageAt(elapsedMs, config) -> 0 | 1 | 2`
- Produces: `paletteForElapsed(elapsedMs, config) -> number[]`
- Produces: `enduranceComboMultiplier(combo, config) -> number`
- Produces: `classifyEnduranceResolution({ popped, dropped }) -> { successful, removed }`
- Produces: `scheduledSpecialType({ resolvedShots, previousWasSpecial }, config) -> 'guide' | 'bomb' | 'rainbow' | null`
- Produces: `updateEnduranceRecords(records, result) -> { records, newRecords }`
- Retains: `generateEnduranceRow(...)`, `generateInitialEnduranceGrid(...)`

- [ ] **Step 1: Rewrite the core test to describe Endurance v2 and make it RED**

Replace round/zoom assertions in `endurance-core.test.mjs` with focused assertions like:

```js
import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  paletteStageAt,
  paletteForElapsed,
  enduranceComboMultiplier,
  classifyEnduranceResolution,
  scheduledSpecialType,
  updateEnduranceRecords,
} from './src/endurance-core.mjs';

assert.equal(ENDURANCE_CONFIG.initialRows, 4);
assert.equal(ENDURANCE_CONFIG.initialEvenCols, 11);
assert.equal(ENDURANCE_CONFIG.initialOddCols, 10);
assert.deepEqual(ENDURANCE_CONFIG.paletteThresholdMs, [60_000, 120_000]);

assert.equal(paletteStageAt(59_999), 0);
assert.equal(paletteStageAt(60_000), 1);
assert.equal(paletteStageAt(119_999), 1);
assert.equal(paletteStageAt(120_000), 2);
assert.equal(paletteStageAt(999_999), 2);
assert.deepEqual(paletteForElapsed(0), [1, 2, 3, 4]);
assert.deepEqual(paletteForElapsed(60_000), [1, 2, 3, 4, 5]);
assert.deepEqual(paletteForElapsed(120_000), [1, 2, 3, 4, 5, 6]);

assert.deepEqual(classifyEnduranceResolution({ popped: 0, dropped: 0 }), { successful: false, removed: 0 });
assert.deepEqual(classifyEnduranceResolution({ popped: 0, dropped: 5 }), { successful: true, removed: 5 });
assert.equal(enduranceComboMultiplier(1), 1);
assert.equal(enduranceComboMultiplier(2), 1.1);
assert.equal(enduranceComboMultiplier(11), 2);
assert.equal(enduranceComboMultiplier(99), 2);

assert.equal(scheduledSpecialType({ resolvedShots: 11, previousWasSpecial: false }), null);
assert.equal(scheduledSpecialType({ resolvedShots: 12, previousWasSpecial: false }), 'guide');
assert.equal(scheduledSpecialType({ resolvedShots: 20, previousWasSpecial: false }), 'bomb');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: false }), 'rainbow');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: true }), null);

const updated = updateEnduranceRecords(
  { bestScore: 900, bestTimeMs: 50_000, bestRound: 8 },
  { score: 1200, elapsedMs: 45_000, bestCombo: 7 },
);
assert.deepEqual(updated.records, { bestScore: 1200, bestTimeMs: 50_000, bestCombo: 7 });
assert.deepEqual(updated.newRecords, { score: true, time: false, combo: true });
```

- [ ] **Step 2: Run RED**

```bash
node endurance-core.test.mjs
```

Expected: FAIL because the new helpers/config fields do not exist and old round/expansion helpers still drive the module.

- [ ] **Step 3: Replace the config and pure helpers**

Refactor `ENDURANCE_CONFIG` toward this shape:

```js
export const ENDURANCE_CONFIG = Object.freeze({
  initialRows: 4,
  initialEvenCols: 11,
  initialOddCols: 10,
  paletteThresholdMs: [60_000, 120_000],
  initialColorCount: 4,
  maxColorCount: 6,
  comboStep: 0.10,
  comboCap: 2.0,
  clearBonus: 1000,
  firstSpecialShot: 12,
  specialInterval: 8,
  atmosphereTransitionMs: 1500,
  specialCalloutMs: 1500,
  specialCalloutCooldownMs: 8000,
});
```

Implement pure helpers explicitly:

```js
export function paletteStageAt(elapsedMs, config = ENDURANCE_CONFIG) {
  const ms = Math.max(0, Number(elapsedMs) || 0);
  if (ms >= config.paletteThresholdMs[1]) return 2;
  if (ms >= config.paletteThresholdMs[0]) return 1;
  return 0;
}

export function paletteForElapsed(elapsedMs, config = ENDURANCE_CONFIG) {
  const count = Math.min(config.maxColorCount, config.initialColorCount + paletteStageAt(elapsedMs, config));
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function enduranceComboMultiplier(combo, config = ENDURANCE_CONFIG) {
  const streak = Math.max(1, Math.floor(Number(combo) || 1));
  return Math.min(config.comboCap, 1 + Math.max(0, streak - 1) * config.comboStep);
}

export function classifyEnduranceResolution({ popped = 0, dropped = 0 } = {}) {
  const removed = Math.max(0, Number(popped) || 0) + Math.max(0, Number(dropped) || 0);
  return { successful: removed > 0, removed };
}
```

Delete the active round/expansion helpers (`createEnduranceState`, `advanceRoundState`, expansion timing functions, round multiplier/survival bonus). Rework `scheduledSpecialType` and records around resolved-shot count / best combo.

- [ ] **Step 4: Run GREEN**

```bash
node endurance-core.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endurance-core.mjs endurance-core.test.mjs
git commit -m "refactor: define Endurance v2 core rules"
```

---

### Task 2: Make Endurance geometry fixed 11/10 with ceiling contact

**Files:**
- Modify: `src/endurance-geometry.mjs`
- Modify: `endurance-geometry.test.mjs`

**Interfaces:**
- Produces: `createEnduranceGeometry({ rowPhase = 0 })`
- Retains: `shiftGridForNewRow(grid, geometry) -> { grid, nextRowPhase, overflowed }`
- Retains: `failureLineReached(grid, geometry) -> boolean`
- Removes from active API: `canExpandSpatially`, `remapGridForExpansion`

- [ ] **Step 1: Replace geometry tests with the fixed-board contract**

Use assertions like:

```js
const g0 = createEnduranceGeometry({ rowPhase: 0 });
assert.equal(g0.rowCols(0), 11);
assert.equal(g0.rowCols(1), 10);
assert.ok(Math.abs(g0.RAD - (240 / 22)) < 1e-9);
assert.ok(Math.abs(g0.rowY(0) - g0.RAD) < 1e-9, 'top orb must touch y=0 ceiling');
assert.ok(g0.MAXROW >= 12, 'fixed board needs enough logical pressure depth');

const g1 = createEnduranceGeometry({ rowPhase: 1 });
assert.equal(g1.rowCols(0), 10);
assert.equal(g1.rowCols(1), 11);
assert.equal(g1.RAD, g0.RAD);

for (const g of [g0, g1]) {
  for (let r = 0; r <= g.MAXROW; r += 1) {
    for (let c = 0; c < g.rowCols(r); c += 1) {
      const x = g.colX(c, r);
      assert(x - g.RAD >= -0.001);
      assert(x + g.RAD <= g.LW + 0.001);
    }
  }
}
```

Keep/extend shift tests to prove exactly one-row movement, row-phase alternation, and safe overflow detection.

- [ ] **Step 2: Run RED**

```bash
node endurance-geometry.test.mjs
```

Expected: FAIL on 11/10, radius, ceiling Y, and removed spatial-stage assumptions.

- [ ] **Step 3: Implement one fixed geometry**

Use horizontal fit to derive radius and vertical failure capacity rather than a magic expansion stage:

```js
const LW = 240;
const LH = 320;
const LAUNCH_Y = 288;
const FAILURE_MARGIN = 17;

export function createEnduranceGeometry({ rowPhase = 0 } = {}) {
  const evenCols = ENDURANCE_CONFIG.initialEvenCols;
  const oddCols = ENDURANCE_CONFIG.initialOddCols;
  const RAD = LW / (2 * evenCols);
  const PH = 2 * RAD;
  const PV = Math.sqrt(3) * RAD;
  const Y0 = RAD;
  const MAXROW = Math.floor((LAUNCH_Y - FAILURE_MARGIN - RAD - Y0) / PV);
  // existing key/split/neighbors/settle/findSnap helpers remain geometry-local
}
```

`shiftGridForNewRow` creates only the alternate-phase fixed geometry. Remove spatial-stage descriptors/remapping.

- [ ] **Step 4: Run GREEN plus shared resolver regression**

```bash
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endurance-geometry.mjs endurance-geometry.test.mjs
git commit -m "refactor: fix Endurance board at 11 by 10"
```

---

### Task 3: Rebuild Endurance runtime around miss pressure, timed colors, and combo scoring

**Files:**
- Modify: `src/endurance-game.mjs`
- Rewrite: `endurance-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1 pure rules and Task 2 fixed geometry.
- Snapshot produces: `{ mode, status, score, combo, bestCombo, queue, shotsUsed, resolvedShots, elapsedMs, paletteStage, colorCount, misses, rowsAdded, boss:false }`.
- Callback: `onEndurancePalette({ stage, colorCount })` fires once per palette threshold.
- Callback: existing `onEnduranceRow(...)` fires once for each miss row insertion.

- [ ] **Step 1: Rewrite runtime tests for the new state machine**

Key assertions:

```js
game.start('test-seed');
assert.equal(game.combo, 0);
assert.equal(game.bestCombo, 0);
assert.equal(game.rowsAdded, 0);
assert.equal(game.getSnapshot().colorCount, 4);
assert.equal('round' in game.getSnapshot(), false);
assert.equal('shotsUntilRow' in game.getSnapshot(), false);
assert.equal('spatialStage' in game.getSnapshot(), false);

const rowsBeforeSuccess = callbacks.rows;
game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
assert.equal(callbacks.rows, rowsBeforeSuccess);
assert.equal(game.combo, 1);

const rowsBeforeDropOnly = callbacks.rows;
game.afterResolvedEnduranceShot({ popped: 0, dropped: 4, turnScore: 100 });
assert.equal(callbacks.rows, rowsBeforeDropOnly, 'drop-only removal is success');
assert.equal(game.combo, 2);

const lowestBeforeMiss = game.B.lowestRow(game.grid);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(callbacks.rows, rowsBeforeDropOnly + 1);
assert.equal(game.rowsAdded, 1);
assert.equal(game.combo, 0);
assert.equal(game.B.lowestRow(game.grid), lowestBeforeMiss + 1);
```

Test time progression without waiting in real time:

```js
game.elapsedMs = 59_999;
game.update(.001);
assert.equal(game.getSnapshot().colorCount, 5);

game.setPaused(true);
const frozen = game.elapsedMs;
game.update(20);
assert.equal(game.elapsedMs, frozen);
game.setPaused(false);

game.elapsedMs = 119_999;
game.update(.001);
assert.equal(game.getSnapshot().colorCount, 6);
```

Also assert clear bonus latching, loss on pressure overflow, deterministic special sequence, and that production scoring uses Task 1's combo multiplier.

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: FAIL because runtime still uses rounds, 3-shot rows, `difficultyStage`, `spatialStage`, and zoom state.

- [ ] **Step 3: Strip round/zoom state and implement palette-stage transitions**

Constructor/start state should reduce to:

```js
this.elapsedMs = 0;
this.resolvedShots = 0;
this.rowPhase = 0;
this.rowsAdded = 0;
this.bestCombo = 0;
this.paletteStage = 0;
this.clearBonusArmed = true;
this.lastIssuedShotWasSpecial = false;
this.lastSpecialCalloutAt = new Map();
```

`update(dt)` increments active time only while playing/unpaused, derives the new palette stage, reconciles queue colors, fires `onEndurancePalette`, then delegates projectile motion to `super.update(safeDt)`.

- [ ] **Step 4: Make shot resolution decide pressure immediately**

Use one post-resolution path:

```js
afterResolvedEnduranceShot({ popped = 0, dropped = 0, turnScore = 0 } = {}) {
  if (this.status !== 'playing') return;
  this.resolvedShots += 1;
  const { successful } = classifyEnduranceResolution({ popped, dropped });

  if (successful) {
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += Math.round((Number(turnScore) || 0) * enduranceComboMultiplier(this.combo, this.config));
  } else {
    this.combo = 0;
    this.misses += 1;
    this.insertEnduranceRow();
    if (this.status !== 'playing') return;
  }

  this.applyEnduranceClearBonus();
  if (failureLineReached(this.grid, this.B)) this.finishEndurance('Kulki dotarły do wyrzutni.');
}
```

Do not double-count `misses`: remove the old miss increment in `land()` if `afterResolvedEnduranceShot()` becomes authoritative.

- [ ] **Step 5: Rework row insertion and result payload**

`insertEnduranceRow()` must use `paletteForElapsed(this.elapsedMs, this.config)`, increment `rowsAdded`, fire `onEnduranceRow({ rowsAdded, gridSize })`, and never mention round/spatial stage.

Result shape:

```js
{
  score: this.score,
  elapsedMs: this.elapsedMs,
  bestCombo: this.bestCombo,
  resolvedShots: this.resolvedShots,
  misses: this.misses,
  rowsAdded: this.rowsAdded,
  reason,
}
```

- [ ] **Step 6: Run GREEN and regressions**

```bash
node endurance-runtime.test.mjs
node endurance-core.test.mjs
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
node campaign-empty-board.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/endurance-game.mjs endurance-runtime.test.mjs
git commit -m "feat: make Endurance misses add pressure rows"
```

---

### Task 4: Migrate Endurance records and remove round language from UI

**Files:**
- Modify: `src/save.mjs`
- Modify: `save.test.mjs`
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `endurance-ui.test.mjs`
- Modify: `styles/endurance.css`
- Modify: `endurance-style.test.mjs`

**Interfaces:**
- Save schema: `endurance: { bestScore, bestTimeMs, bestCombo }`.
- HUD stats in Endurance: time/colors plus existing score/combo top HUD; no round/countdown values.

- [ ] **Step 1: Make save migration RED**

Update `save.test.mjs`:

```js
const normalized = normalizeProgress({
  endurance: { bestScore: 1234, bestTimeMs: 65_000, bestRound: 9 },
});
assert.deepEqual(normalized.endurance, { bestScore: 1234, bestTimeMs: 65_000, bestCombo: 0 });

const modern = normalizeProgress({
  endurance: { bestScore: 5000, bestTimeMs: 180_000, bestCombo: 14 },
});
assert.deepEqual(modern.endurance, { bestScore: 5000, bestTimeMs: 180_000, bestCombo: 14 });
```

Run:

```bash
node save.test.mjs
```

Expected: FAIL on old `bestRound` schema.

- [ ] **Step 2: Implement normalized `bestCombo` schema**

In `src/save.mjs` return:

```js
endurance: {
  bestScore: Math.max(0, Number(source.endurance?.bestScore) || 0),
  bestTimeMs: Math.max(0, Number(source.endurance?.bestTimeMs) || 0),
  bestCombo: Math.max(0, Math.floor(Number(source.endurance?.bestCombo) || 0)),
},
```

Run `node save.test.mjs`; expect PASS.

- [ ] **Step 3: Make UI contract RED**

Change `endurance-ui.test.mjs` to require:

```js
for (const id of [
  'enduranceBestScore', 'enduranceBestTime', 'enduranceBestCombo',
  'statOneLabel', 'statTwoLabel', 'statThreeLabel',
]) assert.ok(html.includes(`id="${id}"`));

assert.ok(html.includes('Pudło = nowy rząd'));
assert.ok(html.includes('Best Combo'));
assert.ok(!html.includes('Best Round'));
assert.ok(!app.includes("textContent = 'Runda'"));
assert.ok(!app.includes("textContent = 'Do rzędu'"));
assert.ok(app.includes("textContent = 'Czas'"));
assert.ok(app.includes("textContent = 'Kolory'"));
```

Run:

```bash
node endurance-ui.test.mjs
```

Expected: FAIL against current copy/IDs.

- [ ] **Step 4: Update intro, records, HUD, and result dialog**

In `index.html` change the rule line to `Pudło = nowy rząd`, rename `enduranceBestRound` → `enduranceBestCombo`, and label it `Best Combo`.

In `src/app.mjs`:

```js
function renderEnduranceRecords() {
  const record = progress.endurance || { bestScore: 0, bestTimeMs: 0, bestCombo: 0 };
  refs.enduranceBestScore.textContent = record.bestScore.toLocaleString('pl-PL');
  refs.enduranceBestTime.textContent = formatDuration(record.bestTimeMs);
  refs.enduranceBestCombo.textContent = String(record.bestCombo);
}
```

Update `updateEnduranceRecords()` around score/time/combo. For Endurance HUD use `Czas`, `Kolory`, and `Pudła`/`Rzędy` as the bottom compact stats while score/combo remain in the top HUD. Do not reintroduce a hidden round counter.

End result copy should be based on the result payload, e.g.:

```js
refs.resultTitle.textContent = `Combo ${result.bestCombo}`;
refs.resultDetail.textContent = `${formatDuration(result.elapsedMs)} • ${result.resolvedShots} strzałów • ${result.rowsAdded} nowych rzędów • ${result.reason}`;
```

- [ ] **Step 5: Update Endurance CSS contract**

Remove `[data-spatial-stage]` styling. Keep mobile/reduced-motion rules. Add selectors for a special-ready callout class that will be wired in Task 6, but do not animate it yet beyond existing opacity/transform patterns.

- [ ] **Step 6: Run GREEN**

```bash
node save.test.mjs
node endurance-ui.test.mjs
node endurance-style.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/save.mjs save.test.mjs index.html src/app.mjs endurance-ui.test.mjs styles/endurance.css endurance-style.test.mjs
git commit -m "feat: remove rounds from Endurance UI and records"
```

---

### Task 5: Add 60/120-second atmosphere crossfades and scale the in-playfield shot rack

**Files:**
- Modify: `src/endurance-game.mjs`
- Modify: `src/endurance-renderer.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `endurance-renderer.test.mjs`
- Modify: `orb-rack.test.mjs`

**Interfaces:**
- Runtime render state adds: `enduranceAtmosphere: { stage, fromStage, progress }`.
- `GameRenderer.drawOrbRack(queue, projectileActive, baseScale = 1)` keeps campaign default at `1`.
- Endurance passes `board.RAD / 12` as `baseScale` so current/queued/projectile orbs match board geometry.

- [ ] **Step 1: Write RED tests for atmosphere and rack scale**

`endurance-renderer.test.mjs` should require the new state contract and reject old transition-cell zoom code:

```js
const source = await fs.readFile(new URL('./src/endurance-renderer.mjs', import.meta.url), 'utf8');
assert.ok(source.includes('enduranceAtmosphere'));
assert.ok(source.includes('drawEnduranceSky'));
assert.ok(source.includes('board.RAD / 12'));
assert.ok(!source.includes('transitionCells'));
```

Extend `orb-rack.test.mjs` so layout scales can be multiplied without changing campaign defaults.

Run:

```bash
node endurance-renderer.test.mjs
node orb-rack.test.mjs
```

Expected: RED.

- [ ] **Step 2: Add pure atmosphere-transition state in Endurance runtime**

Add a helper or local method that uses active elapsed time:

```js
function atmosphereState(elapsedMs, config) {
  const stage = paletteStageAt(elapsedMs, config);
  const threshold = stage === 1 ? config.paletteThresholdMs[0]
    : stage === 2 ? config.paletteThresholdMs[1] : 0;
  const progress = stage === 0 ? 1 : Math.min(1, Math.max(0, (elapsedMs - threshold) / config.atmosphereTransitionMs));
  return { stage, fromStage: Math.max(0, stage - 1), progress };
}
```

Expose this only in render state; do not mutate campaign level data.

- [ ] **Step 3: Replace Endurance zoom rendering with sky crossfade**

In `EnduranceRenderer`, add stage-specific visual levels and crossfade:

```js
const ENDURANCE_SKIES = [
  { world: 'meadow', atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: .15 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'morning', weather: 'breeze', intensity: .35 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'sunset', weather: 'breeze', intensity: .55 } },
];
```

Draw `fromStage` and `stage` under separate `ctx.save()/globalAlpha/restore()` blocks using `progress`. Keep the board fully opaque/readable.

- [ ] **Step 4: Generalize rack scale without changing campaign**

Update `drawOrbRack` so socket geometry stays in the same positions, but shot sprite scale is multiplied by `baseScale`:

```js
drawOrbRack(queue, projectileActive, baseScale = 1) {
  // ... layout unchanged
  if (layout.current && queue[0]) this.drawShot(queue[0], layout.current.x, layout.current.y, layout.current.scale * baseScale);
  // same for next shots
}
```

Campaign continues to call the method with two arguments; Endurance calls it with `boardScale`.

- [ ] **Step 5: Run GREEN and campaign rendering regressions**

```bash
node endurance-renderer.test.mjs
node orb-rack.test.mjs
node gameplay-polish.test.mjs
node pixel-art.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/endurance-game.mjs src/endurance-renderer.mjs src/game-renderer.mjs endurance-renderer.test.mjs orb-rack.test.mjs
git commit -m "feat: add Endurance color-stage atmosphere transitions"
```

---

### Task 6: Redesign Bomb/Rainbow/Guide visuals and active-shot explanations

**Files:**
- Modify: `src/pixel-art.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `src/endurance-game.mjs`
- Modify: `src/app.mjs`
- Modify: `styles/endurance.css`
- Modify: `pixel-art.test.mjs`
- Create: `endurance-specials.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `specialShotLabel(type) -> string` in Endurance core or a small exported map in `endurance-game.mjs`.
- Callback: `onEnduranceSpecialReady({ type, label })`.
- Special visual drawing remains in shared Canvas path so launcher, queued shot, and projectile all use the same treatment.

- [ ] **Step 1: Add RED visual-contract tests**

`pixel-art.test.mjs` should verify all three specials have dedicated drawing/data definitions rather than only normal-orb overlays. `endurance-specials.test.mjs` should verify text/cooldown behavior:

```js
assert.equal(specialShotLabel('bomb'), 'BOMB — niszczy obszar');
assert.equal(specialShotLabel('rainbow'), 'RAINBOW — dopasowuje kolor');
assert.equal(specialShotLabel('guide'), 'GUIDE — pokazuje pełną trajektorię');

const game = new EnduranceGame(fakeCanvas(), {
  onEnduranceSpecialReady: (event) => events.push(event),
}, { config: ENDURANCE_CONFIG });
// Put a special at queue[0], trigger active-shot detection, then repeat inside 8 s.
// Expect exactly one callback; after advancing elapsedMs beyond cooldown expect a second callback.
```

Run:

```bash
node pixel-art.test.mjs
node endurance-specials.test.mjs
```

Expected: RED.

- [ ] **Step 2: Implement visually distinct special bodies**

Keep classic circular silhouette but draw the whole body by type:

- Bomb: dark shell + warm core/fuse + thicker outline.
- Rainbow: multi-segment body + moving highlight/shimmer.
- Guide: pale technical body + pulsing targeting corners/ring.

Do not change Bomb/Rainbow/Guide resolution mechanics.

Use render time already passed into the renderer (store as `this.animationTime = time` at the start of `draw`) so pulse/shimmer remains deterministic per frame and no new timers are required.

- [ ] **Step 3: Detect when a special becomes the active queue shot**

In Endurance runtime, compare the current `queue[0]?.type` after start/shot resolution/queue refill. Maintain `lastSpecialCalloutAt` by type in active-play milliseconds:

```js
maybeAnnounceActiveSpecial() {
  const type = this.queue[0]?.type;
  if (!['bomb', 'rainbow', 'guide'].includes(type)) return;
  const last = this.lastSpecialCalloutAt.get(type) ?? -Infinity;
  if (this.elapsedMs - last < this.config.specialCalloutCooldownMs) return;
  this.lastSpecialCalloutAt.set(type, this.elapsedMs);
  this.callbacks.onEnduranceSpecialReady?.({ type, label: specialShotLabel(type) });
}
```

The callback is presentation-only; it must not affect scheduling.

- [ ] **Step 4: Wire 1.5-second non-modal callout in app UI**

Generalize `flashCallout(text, duration = 760, className = '')`, then wire:

```js
onEnduranceSpecialReady: ({ label }) => flashCallout(label, 1500, 'is-special-ready'),
onEndurancePalette: () => flashCallout('NOWY KOLOR', 1100, 'is-endurance-stage'),
```

CSS positions `.combo-callout.is-special-ready` nearer the launcher without blocking pointer events. Preserve `aria-live` and reduced-motion behavior.

- [ ] **Step 5: Run GREEN**

```bash
node pixel-art.test.mjs
node endurance-specials.test.mjs
node endurance-style.test.mjs
node endurance-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Add the new test to CI and commit**

Add to `.github/workflows/ci.yml`:

```yaml
- name: Endurance special readability tests
  run: node endurance-specials.test.mjs
```

Then:

```bash
git add src/pixel-art.mjs src/game-renderer.mjs src/endurance-game.mjs src/app.mjs styles/endurance.css pixel-art.test.mjs endurance-specials.test.mjs .github/workflows/ci.yml
git commit -m "feat: make Endurance specials readable at a glance"
```

---

### Task 7: Build deterministic headless balance harness and run the parameter study

**Files:**
- Create: `tools/endurance-balance.mjs`
- Create: `endurance-balance.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Generate during verification: `artifacts/endurance-balance.json`
- Generate during verification: `artifacts/endurance-balance.md`

**Interfaces:**
- CLI: `node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance`
- Exports for tests: `simulateRun`, `runMatrix`, `summarizeResults`, `classifyCandidate`.
- Player profiles: `casual`, `average`, `strong`.

- [ ] **Step 1: Write RED determinism/statistics tests**

Create `endurance-balance.test.mjs`:

```js
import assert from 'node:assert/strict';
import { simulateRun, runMatrix, summarizeResults } from './tools/endurance-balance.mjs';

const config = {
  paletteThresholdMs: [60_000, 120_000],
  initialRows: 4,
  firstSpecialShot: 12,
  specialInterval: 8,
  comboStep: .10,
  comboCap: 2.0,
};

const a = simulateRun({ seed: 42, profile: 'average', config });
const b = simulateRun({ seed: 42, profile: 'average', config });
assert.deepEqual(a, b, 'fixed seed/profile/config must be deterministic');

const matrix = runMatrix({ runs: 4, seed: 99, configs: [config], profiles: ['casual', 'average', 'strong'] });
assert.equal(matrix.length, 12);
const summary = summarizeResults(matrix);
assert.equal(summary.length, 3);
for (const row of summary) {
  assert.ok(Number.isFinite(row.medianSurvivalMs));
  assert.ok(Number.isFinite(row.missRate));
}
```

Run:

```bash
node endurance-balance.test.mjs
```

Expected: FAIL because the harness does not exist.

- [ ] **Step 2: Implement simulation around pure board rules, not Canvas physics**

The harness must use `createEnduranceGeometry`, row generation, `resolveShotOnGrid`, seeded RNG, palette timing, special schedule, and combo scoring. It should choose candidate legal snap cells according to stable profile heuristics rather than simulate mouse pixels.

Profile intent:

```js
const PROFILE = {
  casual:  { bestMoveChance: .45, dropWeight: .25, specialAwareness: .35 },
  average: { bestMoveChance: .72, dropWeight: .60, specialAwareness: .70 },
  strong:  { bestMoveChance: .92, dropWeight: 1.00, specialAwareness: .95 },
};
```

For each candidate action, clone the grid, call `resolveShotOnGrid`, and score immediate `popped/dropped` with deterministic noise based on the run RNG. When a selected shot removes nothing, call the same row-shift/generation helpers production uses.

Each run records at least:

```js
{
  profile,
  configId,
  seed,
  survivalMs,
  score,
  bestCombo,
  resolvedShots,
  misses,
  rowsAdded,
  missRate,
  maxLowestRow,
  at60s,
  at120s,
  specials: { guide: {...}, bomb: {...}, rainbow: {...} },
  lossReason,
}
```

- [ ] **Step 3: Implement bounded matrix generation and labels**

Generate only the spec matrix:

```js
palette timings: [50_000,100_000], [60_000,120_000], [70_000,140_000]
initialRows: 3,4,5
firstSpecialShot: 10,12
specialInterval: 7,8,9
comboStep: .08,.10,.12
comboCap: 1.8,2.0,2.2
```

`classifyCandidate()` must use distribution separation plus miss/pressure metrics; it may output `TOO HARD`, `KEEP`, `TOO EASY`, but must never mutate `ENDURANCE_CONFIG`.

- [ ] **Step 4: Run GREEN and a quick CI-sized sample**

```bash
node endurance-balance.test.mjs
node tools/endurance-balance.mjs --runs 8 --seed 1337 --output artifacts/endurance-balance-quick
```

Expected: deterministic PASS and both JSON/Markdown output files.

- [ ] **Step 5: Add harness test to CI, not the full thousands-run study**

```yaml
- name: Endurance balance harness tests
  run: node endurance-balance.test.mjs
```

The full study is a verification activity, not a mandatory PR test that slows every push.

- [ ] **Step 6: Run the full study and review the baseline**

Start with:

```bash
node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance
```

Review the `60/120, 4 rows, 12/8, .10, 2.0` baseline against casual ~60–150 s, average ~2–4 min, strong materially longer. If the harness recommends a nearby parameter set, do **not** silently change production values: record the evidence first and review the single tuning change explicitly.

- [ ] **Step 7: Commit harness code only**

```bash
git add tools/endurance-balance.mjs endurance-balance.test.mjs .github/workflows/ci.yml
git commit -m "test: add deterministic Endurance balance harness"
```

Keep generated `artifacts/` results available for PR evidence unless the repository already tracks such reports.

---

### Task 8: Replace Endurance browser smoke with v2 gameplay/visual verification

**Files:**
- Rewrite: `.github/scripts/endurance-smoke.mjs`
- Modify if needed: `.github/workflows/ci.yml`

**Interfaces:**
- Browser smoke remains executable as `node .github/scripts/endurance-smoke.mjs` after a static server is running on port 4173.
- Screenshots continue under `artifacts/*.png`.

- [ ] **Step 1: Rewrite smoke expectations before production changes are considered complete**

Remove all `Runda`, `Do rzędu`, 3-shot cadence, and `data-spatial-stage` assertions. Require the new rule and HUD:

```js
assert((await page.locator('.endurance-rule').textContent())?.includes('Pudło = nowy rząd'));
assert((await page.locator('#statOneLabel').textContent()) !== 'Runda');
assert((await page.locator('#statTwoLabel').textContent()) !== 'Do rzędu');
```

- [ ] **Step 2: Add a deterministic browser test hook only if needed for slow milestones**

Prefer runtime APIs already visible through DOM/state. If waiting 120 real seconds makes smoke wasteful, add an Endurance-only test seam guarded by query string, e.g. `?test=endurance`, that lets the smoke advance active elapsed time through a narrow method. It must not be reachable in normal play logic and must not alter campaign behavior.

- [ ] **Step 3: Verify real gameplay contracts**

The smoke must cover:

```text
1. Open Endurance intro and start.
2. Screenshot fixed 11/10 start state.
3. Measure top-row orb/ceiling contact visually or via exposed geometry test marker.
4. Produce/observe one miss -> exactly one row insertion.
5. Produce/observe a successful pop or drop -> no row insertion.
6. Advance active time to 60 s -> colorCount=5 and background transition/callout.
7. Advance to 120 s -> colorCount=6 and no seventh color later.
8. Force/observe Guide, Bomb, Rainbow as active shots and capture each screenshot.
9. Verify each special callout is readable and does not block firing.
10. Play to a real pressure loss, verify result has no stars/mastery/round, retry.
11. Repeat entry/start checks at 390x844 with <=1 px horizontal overflow.
```

Suggested screenshot names:

```text
artifacts/endurance-v2-start.png
artifacts/endurance-v2-miss-row.png
artifacts/endurance-v2-five-colors.png
artifacts/endurance-v2-six-colors.png
artifacts/endurance-v2-guide.png
artifacts/endurance-v2-bomb.png
artifacts/endurance-v2-rainbow.png
artifacts/endurance-v2-result.png
artifacts/mobile-endurance-v2.png
```

- [ ] **Step 4: Run browser smoke locally**

```bash
python3 -m http.server 4173 >/tmp/balloon-http.log 2>&1 &
npm install --no-save --package-lock=false playwright@latest
npx playwright install chromium
node .github/scripts/endurance-smoke.mjs
```

Expected: PASS with screenshots and no page/console errors.

- [ ] **Step 5: Run campaign browser smoke too**

```bash
node .github/scripts/visual-smoke.mjs
node .github/scripts/queue-smoke.mjs
```

Expected: PASS; campaign visuals/queue remain functional.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/endurance-smoke.mjs .github/workflows/ci.yml
git commit -m "test: verify Endurance v2 in the browser"
```

---

### Task 9: Full regression, balance review, exact-head CI, and PR evidence

**Files:**
- No production file should change unless a failing test identifies a real defect.
- Update PR #2 body/comment only after exact-head verification.

**Interfaces:**
- Final head remains on `feat/endurance-mode`.
- `main`, `playable`, and PR merge state remain untouched.

- [ ] **Step 1: Run all Node tests used by CI**

```bash
node balloon.test.js
node sky-rescue.test.mjs
node campaign-empty-board.test.mjs
node endurance-core.test.mjs
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
node endurance-renderer.test.mjs
node endurance-runtime.test.mjs
node save.test.mjs
node endurance-ui.test.mjs
node endurance-style.test.mjs
node endurance-specials.test.mjs
node endurance-balance.test.mjs
node wind.test.mjs
node pixel-art.test.mjs
node orb-pass.test.mjs
node orb-rack.test.mjs
node gameplay-polish.test.mjs
node storm-peaks.test.mjs
node storm-content.test.mjs
node storm-runtime.test.mjs
node storm-feedback.test.mjs
node level-integrity.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run syntax checks**

At minimum:

```bash
node --check src/endurance-core.mjs
node --check src/endurance-geometry.mjs
node --check src/endurance-renderer.mjs
node --check src/endurance-game.mjs
node --check src/pixel-art.mjs
node --check src/game-renderer.mjs
node --check src/save.mjs
node --check src/app.mjs
node --check tools/endurance-balance.mjs
```

Expected: no output/errors.

- [ ] **Step 3: Run the full balance study and inspect distributions**

```bash
node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance
```

Check especially: casual/average/strong median separation, miss rate, rows added, survival around 60/120 s, and relative Bomb/Rainbow/Guide value. Keep production baseline if results are plausible; make only evidence-backed tuning changes, each with its own test update and commit.

- [ ] **Step 4: Run browser smoke and visually inspect screenshots**

Verify desktop and 390×844 mobile screenshots manually for ceiling contact, smaller consistent orb scale, stage crossfades, special readability, callout placement, result dialog, and overflow.

- [ ] **Step 5: Push exact head and wait for GitHub Actions**

Confirm both `test` and `browser-smoke` jobs are green at the exact SHA.

- [ ] **Step 6: Update PR #2 evidence without merging**

Add a concise PR comment containing:

```text
- exact verified head SHA
- test job ✅
- browser-smoke ✅
- fixed 11/10 / ceiling contact ✅
- miss => one row / drop-only success => no row ✅
- 4→5→6 colors at 60/120 s ✅
- Endurance background transitions ✅
- Guide/Bomb/Rainbow readability + callouts ✅
- balance harness summary and selected config ✅
- desktop + 390×844 visual review ✅
- main/playable untouched; PR remains draft/unmerged ✅
```

- [ ] **Step 7: Final commit only if documentation changed**

If no tracked report/doc was added, do not create an empty cleanup commit.
