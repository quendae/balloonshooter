# Endurance v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Endurance's round/zoom loop with a fixed 11/10 board where every resolved miss adds one pressure row, palette difficulty grows at 60/120 seconds, specials are visually self-explanatory, and a deterministic balance harness validates tuning before any balance changes are accepted.

**Architecture:** Keep campaign behavior and `balloon.html` unchanged. Refactor Endurance pure rules into `src/endurance-core.mjs`, use one fixed 11/10 geometry in `src/endurance-geometry.mjs`, and simplify `EnduranceGame` so it owns active time, combo, palette stage, miss rows, and special scheduling without round/spatial-expansion state. `EnduranceRenderer` owns atmosphere crossfades; shared shot drawing owns improved Bomb/Rainbow/Guide bodies. A headless balance simulator reuses the same pure board/rule helpers without browser or Canvas dependencies.

**Tech Stack:** Vanilla JavaScript ES modules, Canvas 2D, Node 22 + `node:assert/strict`, Playwright Chromium browser smoke, localStorage, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-endurance-v2-design.md`

## Global Constraints

- Fixed board: **11 columns on even rows / 10 columns on odd rows**.
- Start with exactly **4 occupied rows**.
- Top-row orb body visually touches the ceiling boundary.
- A resolved shot is successful iff **`popped + dropped > 0`**.
- **`popped + dropped === 0` adds exactly one full pressure row**.
- Drop-only success does **not** add a row.
- No round counter, 3-shot cadence, timed board expansion, adaptive zoom timer, or post-120-second difficulty mechanic.
- Palette: **4 colors before 60 s; 5 from 60 s; 6 from 120 s onward**.
- Pause freezes active-play time and palette/background progression.
- Background crossfade: **1.5 s**, gameplay continues.
- Endurance combo multiplier: `min(2.0, 1 + 0.10 * max(0, combo - 1))`.
- Clear bonus: **1000**, once per transition into an empty board, not combo-multiplied initially.
- Specials: first at resolved shot **12**, then every **8**, cycle `guide → bomb → rainbow`, never back-to-back.
- Special explanation: **1.5 s**, per-type display cooldown **8 s**.
- Records: `bestScore`, `bestTimeMs`, `bestCombo`; old `bestRound` must migrate safely.
- HUD information is exactly **Wynik / Combo / Czas / Kolory**. Miss/row counts may appear in the result dialog, not as a permanent fifth/sixth HUD statistic.
- Balance harness may recommend values but must never rewrite production config automatically.
- Do not merge PR #2 or advance `main`/`playable` unless explicitly requested.

---

### Task 1: Replace round/zoom helpers with Endurance v2 pure rules

**Files:**
- Modify: `src/endurance-core.mjs`
- Rewrite: `endurance-core.test.mjs`

**Interfaces:**
- Produces: `paletteStageAt(elapsedMs, config) -> 0 | 1 | 2`
- Produces: `paletteForElapsed(elapsedMs, config) -> number[]`
- Produces: `enduranceComboMultiplier(combo, config) -> number`
- Produces: `classifyEnduranceResolution({ popped, dropped }) -> { successful, removed }`
- Produces: `scheduledSpecialType({ resolvedShots, previousWasSpecial }, config) -> special|null`
- Produces: `specialShotLabel(type) -> string`
- Produces: `updateEnduranceRecords(records, result)`
- Retains deterministic row generation helpers.

- [ ] **Step 1: Write the new failing core contract**

Replace the old round/expansion assertions with:

```js
import assert from 'node:assert/strict';
import {
  ENDURANCE_CONFIG,
  paletteStageAt,
  paletteForElapsed,
  enduranceComboMultiplier,
  classifyEnduranceResolution,
  scheduledSpecialType,
  specialShotLabel,
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
assert.deepEqual(classifyEnduranceResolution({ popped: 0, dropped: 4 }), { successful: true, removed: 4 });
assert.equal(enduranceComboMultiplier(1), 1);
assert.equal(enduranceComboMultiplier(2), 1.1);
assert.equal(enduranceComboMultiplier(11), 2);
assert.equal(enduranceComboMultiplier(99), 2);

assert.equal(scheduledSpecialType({ resolvedShots: 11, previousWasSpecial: false }), null);
assert.equal(scheduledSpecialType({ resolvedShots: 12, previousWasSpecial: false }), 'guide');
assert.equal(scheduledSpecialType({ resolvedShots: 20, previousWasSpecial: false }), 'bomb');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: false }), 'rainbow');
assert.equal(scheduledSpecialType({ resolvedShots: 28, previousWasSpecial: true }), null);

assert.equal(specialShotLabel('bomb'), 'BOMB — niszczy obszar');
assert.equal(specialShotLabel('rainbow'), 'RAINBOW — dopasowuje kolor');
assert.equal(specialShotLabel('guide'), 'GUIDE — pokazuje pełną trajektorię');

const migrated = updateEnduranceRecords(
  { bestScore: 900, bestTimeMs: 50_000, bestRound: 8 },
  { score: 1200, elapsedMs: 45_000, bestCombo: 7 },
);
assert.deepEqual(migrated.records, { bestScore: 1200, bestTimeMs: 50_000, bestCombo: 7 });
assert.deepEqual(migrated.newRecords, { score: true, time: false, combo: true });
```

- [ ] **Step 2: Run RED**

```bash
node endurance-core.test.mjs
```

Expected: FAIL because the v2 helpers/config do not exist.

- [ ] **Step 3: Replace the config and helpers**

Use this production baseline:

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

Implement:

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

Delete active round/expansion helpers and rework specials/records around resolved shots and best combo.

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

### Task 2: Make the board fixed 11/10 and remove the ceiling gap

**Files:**
- Modify: `src/endurance-geometry.mjs`
- Rewrite: `endurance-geometry.test.mjs`

**Interfaces:**
- Produces: `createEnduranceGeometry({ rowPhase = 0 })`
- Retains: `shiftGridForNewRow(grid, geometry)` and `failureLineReached(grid, geometry)`
- Removes active `spatialStage`, `canExpandSpatially`, and `remapGridForExpansion` behavior.

- [ ] **Step 1: Write fixed-board RED tests**

```js
const g0 = createEnduranceGeometry({ rowPhase: 0 });
assert.equal(g0.rowCols(0), 11);
assert.equal(g0.rowCols(1), 10);
assert.ok(Math.abs(g0.RAD - (240 / 22)) < 1e-9);
assert.ok(Math.abs(g0.rowY(0) - g0.RAD) < 1e-9, 'orb body must touch y=0');
assert.ok(g0.MAXROW >= 12);

const g1 = createEnduranceGeometry({ rowPhase: 1 });
assert.equal(g1.rowCols(0), 10);
assert.equal(g1.rowCols(1), 11);
assert.equal(g1.RAD, g0.RAD);
```

Keep neighbor symmetry, horizontal bounds, deterministic row-generation, row-phase-shift, overflow, and failure-line assertions.

- [ ] **Step 2: Run RED**

```bash
node endurance-geometry.test.mjs
```

Expected: FAIL on current 10/9 stage-zero geometry and Y=48 top row.

- [ ] **Step 3: Implement one geometry**

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
  // preserve the existing geometry-local key/neighbors/settle/findSnap helpers
}
```

`shiftGridForNewRow()` only flips row phase and shifts `r -> r + 1`; physical horizontal alignment must remain stable.

- [ ] **Step 4: Run GREEN and resolver regression**

```bash
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src/endurance-geometry.mjs endurance-geometry.test.mjs
git commit -m "refactor: fix Endurance board at 11 by 10"
```

---

### Task 3: Rebuild runtime around miss pressure, combo scoring, and 60/120 palette stages

**Files:**
- Modify: `src/endurance-game.mjs`
- Rewrite: `endurance-runtime.test.mjs`

**Interfaces:**
- Snapshot: `{ mode, status, score, combo, bestCombo, queue, shotsUsed, resolvedShots, elapsedMs, paletteStage, colorCount, misses, rowsAdded, boss:false }`
- Callback: `onEndurancePalette({ stage, colorCount })`
- Callback: `onEnduranceRow({ rowsAdded, gridSize })`

- [ ] **Step 1: Write new runtime tests**

```js
game.start('test-seed');
const start = game.getSnapshot();
assert.equal(start.colorCount, 4);
assert.equal(start.combo, 0);
assert.equal(start.bestCombo, 0);
assert.equal(start.rowsAdded, 0);
assert.equal('round' in start, false);
assert.equal('shotsUntilRow' in start, false);
assert.equal('spatialStage' in start, false);

const rowEvents = callbacks.rows;
game.afterResolvedEnduranceShot({ popped: 3, dropped: 0, turnScore: 30 });
assert.equal(callbacks.rows, rowEvents);
assert.equal(game.combo, 1);

game.afterResolvedEnduranceShot({ popped: 0, dropped: 4, turnScore: 100 });
assert.equal(callbacks.rows, rowEvents, 'drop-only success does not add pressure');
assert.equal(game.combo, 2);

const lowest = game.B.lowestRow(game.grid);
game.afterResolvedEnduranceShot({ popped: 0, dropped: 0, turnScore: 0 });
assert.equal(callbacks.rows, rowEvents + 1);
assert.equal(game.rowsAdded, 1);
assert.equal(game.combo, 0);
assert.equal(game.B.lowestRow(game.grid), lowest + 1);
```

Test active-time boundaries:

```js
game.elapsedMs = 59_999;
game.update(.001);
assert.equal(game.getSnapshot().colorCount, 5);

game.setPaused(true);
const frozen = game.elapsedMs;
game.update(10);
assert.equal(game.elapsedMs, frozen);
game.setPaused(false);

game.elapsedMs = 119_999;
game.update(.001);
assert.equal(game.getSnapshot().colorCount, 6);
game.elapsedMs = 500_000;
assert.equal(game.getSnapshot().colorCount, 6);
```

Also test clear-bonus latching, pressure loss, deterministic special sequence, and result payload.

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

- [ ] **Step 3: Strip obsolete runtime state**

Start/reset only:

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

Remove `round`, `shotsInRound`, `difficultyStage`, `spatialStage`, `pendingExpansion`, and their methods.

- [ ] **Step 4: Prevent double combo multiplication**

The shared `scoreTurn()` already has campaign combo math. Endurance must request the base turn score with `combo: 1`:

```js
const breakdown = scoreTurn({
  popped: popped.length,
  dropped: dropped.length,
  combo: 1,
  cascadeCount: dropped.length >= 3 ? 1 : 0,
});
```

Then apply only Endurance's own combo multiplier after resolution.

- [ ] **Step 5: Make resolution authoritative for pressure**

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

Remove the old `misses += 1` from `land()` so a miss is counted exactly once.

- [ ] **Step 6: Use elapsed time for palette/queue/rows**

`pickColor`, `reconcileQueueColors`, and pressure-row generation all use `paletteForElapsed(this.elapsedMs, this.config)`. `update(dt)` detects stage changes and fires `onEndurancePalette` once per threshold.

Result payload:

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

- [ ] **Step 7: Run GREEN/regressions**

```bash
node endurance-runtime.test.mjs
node endurance-core.test.mjs
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
node campaign-empty-board.test.mjs
```

- [ ] **Step 8: Commit**

```bash
git add src/endurance-game.mjs endurance-runtime.test.mjs
git commit -m "feat: make Endurance misses add pressure rows"
```

---

### Task 4: Migrate records and reduce the HUD to Wynik / Combo / Czas / Kolory

**Files:**
- Modify: `src/save.mjs`
- Modify: `save.test.mjs`
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `styles/endurance.css`
- Modify: `endurance-ui.test.mjs`
- Modify: `endurance-style.test.mjs`

**Interfaces:**
- Save schema: `{ bestScore, bestTimeMs, bestCombo }`.
- Existing top score/combo remain; Endurance bottom stats expose only time and color count.

- [ ] **Step 1: Write migration RED test**

```js
const legacy = normalizeProgress({
  endurance: { bestScore: 1234, bestTimeMs: 65_000, bestRound: 9 },
});
assert.deepEqual(legacy.endurance, { bestScore: 1234, bestTimeMs: 65_000, bestCombo: 0 });

const modern = normalizeProgress({
  endurance: { bestScore: 5000, bestTimeMs: 180_000, bestCombo: 14 },
});
assert.deepEqual(modern.endurance, { bestScore: 5000, bestTimeMs: 180_000, bestCombo: 14 });
```

Run `node save.test.mjs`; expect FAIL.

- [ ] **Step 2: Normalize bestCombo**

```js
endurance: {
  bestScore: Math.max(0, Number(source.endurance?.bestScore) || 0),
  bestTimeMs: Math.max(0, Number(source.endurance?.bestTimeMs) || 0),
  bestCombo: Math.max(0, Math.floor(Number(source.endurance?.bestCombo) || 0)),
},
```

- [ ] **Step 3: Write UI RED contract**

```js
assert.ok(html.includes('Pudło = nowy rząd'));
assert.ok(html.includes('Best Combo'));
assert.ok(html.includes('id="enduranceBestCombo"'));
assert.ok(!html.includes('Best Round'));
assert.ok(!app.includes("textContent = 'Runda'"));
assert.ok(!app.includes("textContent = 'Do rzędu'"));
assert.ok(app.includes("textContent = 'Czas'"));
assert.ok(app.includes("textContent = 'Kolory'"));
```

- [ ] **Step 4: Update intro/records/result**

`index.html`: `Pudło = nowy rząd`, `Best Combo`, `enduranceBestCombo`.

`renderEnduranceRecords()`:

```js
const record = progress.endurance || { bestScore: 0, bestTimeMs: 0, bestCombo: 0 };
refs.enduranceBestScore.textContent = record.bestScore.toLocaleString('pl-PL');
refs.enduranceBestTime.textContent = formatDuration(record.bestTimeMs);
refs.enduranceBestCombo.textContent = String(record.bestCombo);
```

Update record comparison around `bestCombo`. Result detail includes time, best combo, shots, misses/rows added, and reason; no round/stars/mastery/Next.

- [ ] **Step 5: Make HUD exactly four information fields**

Keep top `scoreValue` and `comboValue` as Wynik/Combo. In Endurance bottom stats use two visible cells only:

```js
refs.statOneLabel.textContent = 'Czas';
refs.statTwoLabel.textContent = 'Kolory';
refs.shotsValue.textContent = formatDuration(snapshot.elapsedMs);
refs.dropValue.textContent = String(snapshot.colorCount);
```

Hide the third bottom `<dl>` cell only in Endurance via CSS rather than inventing a permanent Pudła/Rzędy HUD field:

```css
.game-screen[data-mode="endurance"] .run-stats-inline > div:nth-child(3) {
  display: none;
}
```

- [ ] **Step 6: Run GREEN**

```bash
node save.test.mjs
node endurance-ui.test.mjs
node endurance-style.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/save.mjs save.test.mjs index.html src/app.mjs styles/endurance.css endurance-ui.test.mjs endurance-style.test.mjs
git commit -m "feat: remove rounds from Endurance UI and records"
```

---

### Task 5: Replace zoom with 1.5-second atmosphere crossfades and scale all fired/queued orbs

**Files:**
- Modify: `src/endurance-game.mjs`
- Modify: `src/endurance-renderer.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `endurance-renderer.test.mjs`
- Modify: `orb-rack.test.mjs`

**Interfaces:**
- Render state: `enduranceAtmosphere: { stage, fromStage, progress }`.
- `GameRenderer.drawOrbRack(queue, projectileActive, baseScale = 1)`; campaign keeps default scale 1.

- [ ] **Step 1: Write RED renderer/rack tests**

```js
const source = await fs.readFile(new URL('./src/endurance-renderer.mjs', import.meta.url), 'utf8');
assert.ok(source.includes('enduranceAtmosphere'));
assert.ok(source.includes('drawEnduranceSky'));
assert.ok(source.includes('board.RAD / 12'));
assert.ok(!source.includes('transitionCells'));
```

Extend `orb-rack.test.mjs` to prove campaign layout defaults are unchanged and Endurance can multiply sprite scale.

- [ ] **Step 2: Add atmosphere transition state**

```js
function atmosphereState(elapsedMs, config) {
  const stage = paletteStageAt(elapsedMs, config);
  const threshold = stage === 1 ? config.paletteThresholdMs[0]
    : stage === 2 ? config.paletteThresholdMs[1] : 0;
  const progress = stage === 0 ? 1
    : Math.min(1, Math.max(0, (elapsedMs - threshold) / config.atmosphereTransitionMs));
  return { stage, fromStage: Math.max(0, stage - 1), progress };
}
```

Expose only through Endurance render state.

- [ ] **Step 3: Add a true late-afternoon visual state**

Extend shared `skyPalette()` / meadow sun placement with a new `timeOfDay: 'late-day'` value used only by Endurance; existing campaign time-of-day values must render exactly as before.

Endurance stages:

```js
const ENDURANCE_SKIES = [
  { world: 'meadow', atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: .15 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'late-day', weather: 'breeze', intensity: .35 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'sunset', weather: 'breeze', intensity: .55 } },
];
```

`drawEnduranceSky()` draws from/to stages under `ctx.globalAlpha` using transition progress. Never lower board/orb alpha.

- [ ] **Step 4: Scale launcher orb, queue orbs, and projectile consistently**

Generalize rack drawing:

```js
drawOrbRack(queue, projectileActive, baseScale = 1) {
  const layout = orbRackLayout(this.B, projectileActive);
  if (layout.current && queue[0]) {
    this.drawShot(queue[0], layout.current.x, layout.current.y, layout.current.scale * baseScale);
  }
  // apply baseScale to next slots too
}
```

Endurance passes `board.RAD / 12`; campaign continues to call with the default. Projectile already uses board scale; verify that path remains aligned.

- [ ] **Step 5: Run GREEN/regressions**

```bash
node endurance-renderer.test.mjs
node orb-rack.test.mjs
node gameplay-polish.test.mjs
node pixel-art.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/endurance-game.mjs src/endurance-renderer.mjs src/game-renderer.mjs endurance-renderer.test.mjs orb-rack.test.mjs
git commit -m "feat: add Endurance atmosphere progression"
```

---

### Task 6: Make Bomb/Rainbow/Guide recognizable before firing

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
- Consumes `specialShotLabel(type)` from Task 1.
- Callback: `onEnduranceSpecialReady({ type, label })`.
- Shared Canvas shot renderer must use the same special body for active rack, queued rack, and projectile.

- [ ] **Step 1: Add RED special contracts**

Test that Bomb/Rainbow/Guide each have a dedicated body treatment and that active-shot announcement obeys 8-second per-type cooldown.

```js
const events = [];
const game = new EnduranceGame(fakeCanvas(), {
  onEnduranceSpecialReady: (event) => events.push(event),
}, { config: ENDURANCE_CONFIG });

// Arrange queue[0] as bomb, call active-special detector twice inside cooldown.
assert.equal(events.length, 1);
game.elapsedMs += 8000;
// Re-activate same type.
assert.equal(events.length, 2);
```

- [ ] **Step 2: Implement full special bodies, not tiny overlays**

Use classic circular silhouette but distinct interior/outline language:

```text
Bomb    = charcoal shell + thick outline + yellow/orange core/fuse pulse
Rainbow = segmented multi-color body + moving shimmer
Guide   = pale technical body + pulsing target ring/corner marks
```

At `draw()` start set `this.animationTime = time`; special drawing uses this value for pulse/shimmer, avoiding extra timers.

- [ ] **Step 3: Detect active special without affecting schedule**

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

Call after initial queue fill and after queue advancement/reconciliation.

- [ ] **Step 4: Wire non-modal 1.5-second callout**

Generalize:

```js
function flashCallout(text, duration = 760, className = '') {
  // reset classes/content, add className, show, remove after duration
}
```

Callbacks:

```js
onEnduranceSpecialReady: ({ label }) => flashCallout(label, 1500, 'is-special-ready'),
onEndurancePalette: () => flashCallout('NOWY KOLOR', 1100, 'is-endurance-stage'),
```

CSS moves `.is-special-ready` nearer launcher, keeps `pointer-events:none`, and respects reduced motion.

- [ ] **Step 5: Run GREEN**

```bash
node pixel-art.test.mjs
node endurance-specials.test.mjs
node endurance-runtime.test.mjs
node endurance-style.test.mjs
```

- [ ] **Step 6: Add CI step and commit**

```yaml
- name: Endurance special readability tests
  run: node endurance-specials.test.mjs
```

```bash
git add src/pixel-art.mjs src/game-renderer.mjs src/endurance-game.mjs src/app.mjs styles/endurance.css pixel-art.test.mjs endurance-specials.test.mjs .github/workflows/ci.yml
git commit -m "feat: make Endurance specials readable at a glance"
```

---

### Task 7: Build and run the deterministic balance harness

**Files:**
- Create: `tools/endurance-balance.mjs`
- Create: `endurance-balance.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Generate for review: `artifacts/endurance-balance.json`, `artifacts/endurance-balance.md`

**Interfaces:**
- CLI: `node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance`
- Exports: `simulateRun`, `runMatrix`, `summarizeResults`, `classifyCandidate`.
- Profiles: `casual`, `average`, `strong`.

- [ ] **Step 1: Write RED determinism test**

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

assert.deepEqual(
  simulateRun({ seed: 42, profile: 'average', config }),
  simulateRun({ seed: 42, profile: 'average', config }),
);

const rows = runMatrix({ runs: 4, seed: 99, configs: [config], profiles: ['casual', 'average', 'strong'] });
assert.equal(rows.length, 12);
const summary = summarizeResults(rows);
assert.equal(summary.length, 3);
summary.forEach((row) => {
  assert.ok(Number.isFinite(row.medianSurvivalMs));
  assert.ok(Number.isFinite(row.missRate));
});
```

- [ ] **Step 2: Define stable player-speed assumptions**

The headless harness needs time to test 60/120 thresholds. Use deterministic time-per-shot with small seeded jitter; browser playtest later validates whether these assumptions feel reasonable:

```js
const PROFILE = {
  casual:  { bestMoveChance: .45, dropWeight: .25, specialAwareness: .35, shotSeconds: 3.6, jitterSeconds: .6 },
  average: { bestMoveChance: .72, dropWeight: .60, specialAwareness: .70, shotSeconds: 3.0, jitterSeconds: .5 },
  strong:  { bestMoveChance: .92, dropWeight: 1.00, specialAwareness: .95, shotSeconds: 2.4, jitterSeconds: .4 },
};
```

Each resolved shot advances simulated active time by `shotSeconds ± seeded jitter`, never below 1 second.

- [ ] **Step 3: Simulate legal board decisions using production pure helpers**

Use `createEnduranceGeometry`, seeded RNG, `resolveShotOnGrid`, row generation/shift, palette timing, special schedule, and Endurance combo math. Do not simulate Canvas pixels.

For candidate legal snaps, clone the grid, resolve the shot, and score immediate pops/drops. Profile parameters choose between best candidate and plausible weaker candidates. Miss outcome uses exactly the production rule: shift + one generated row.

Each run records:

```js
{
  profile, configId, seed,
  survivalMs, score, bestCombo, resolvedShots,
  misses, rowsAdded, missRate, maxLowestRow,
  at60s, at120s,
  specials: { guide: {}, bomb: {}, rainbow: {} },
  lossReason,
}
```

- [ ] **Step 4: Compare only the agreed bounded matrix**

```text
palette timings: 50/100, 60/120, 70/140 s
initial rows: 3, 4, 5
first special: shot 10 or 12
special interval: 7, 8, 9
combo step: .08, .10, .12
combo cap: 1.8, 2.0, 2.2
```

`miss => exactly one row` is never tunable. `classifyCandidate()` outputs `TOO HARD`, `KEEP`, or `TOO EASY` based on distribution separation, miss rate, pressure growth, and special value; it never modifies `ENDURANCE_CONFIG`.

- [ ] **Step 5: Run GREEN and quick sample**

```bash
node endurance-balance.test.mjs
node tools/endurance-balance.mjs --runs 8 --seed 1337 --output artifacts/endurance-balance-quick
```

- [ ] **Step 6: Add only harness tests to regular CI**

```yaml
- name: Endurance balance harness tests
  run: node endurance-balance.test.mjs
```

Do not put the full thousands-game matrix on every push.

- [ ] **Step 7: Run the full study**

```bash
node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance
```

Review the `60/120, 4 rows, 12/8, .10, 2.0` baseline against the heuristic ranges: casual ~60–150 s, average ~2–4 min, strong materially longer. Any production tuning change requires explicit evidence in the report and its own test/commit; no silent auto-tuning.

- [ ] **Step 8: Commit harness code**

```bash
git add tools/endurance-balance.mjs endurance-balance.test.mjs .github/workflows/ci.yml
git commit -m "test: add deterministic Endurance balance harness"
```

---

### Task 8: Replace browser smoke with Endurance v2 playtest coverage

**Files:**
- Rewrite: `.github/scripts/endurance-smoke.mjs`
- Modify if necessary: `.github/workflows/ci.yml`

**Interfaces:**
- Execute after static server: `node .github/scripts/endurance-smoke.mjs`.
- Screenshots remain under `artifacts/*.png`.

- [ ] **Step 1: Delete obsolete browser expectations**

Remove `Runda`, `Do rzędu`, three-shot countdown, and `data-spatial-stage` assertions. Require intro rule `Pudło = nowy rząd` and HUD `Czas` / `Kolory`.

- [ ] **Step 2: Add a narrow test seam for slow active-time milestones if necessary**

Waiting two real minutes in every browser smoke is wasteful. If required, expose an Endurance-only test method only when URL includes `?test=endurance`, for example `window.__enduranceTest.advanceActiveMs(ms)`. It may only advance Endurance active time and must not affect campaign or normal production flow.

- [ ] **Step 3: Verify gameplay/visual contracts**

Browser smoke sequence:

```text
1. Open intro/start; capture fixed 11/10 start.
2. Confirm top row touches ceiling and board/current/next orbs share smaller scale.
3. Resolve one miss -> exactly one pressure row.
4. Resolve one pop/drop success -> no pressure row.
5. Reach 60 s active time -> 5 colors + NOWY KOLOR + late-day crossfade.
6. Reach 120 s -> 6 colors + sunset crossfade; later time stays at 6.
7. Observe/capture Guide, Bomb, Rainbow as active shots.
8. Verify each 1.5 s explanation is readable and pointer-nonblocking.
9. Play/force a real pressure loss; result has no stars/mastery/round; retry starts fresh.
10. Repeat entry/start checks at 390×844 and assert <=1 px horizontal overflow.
```

Screenshots:

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

- [ ] **Step 4: Run Endurance smoke**

```bash
python3 -m http.server 4173 >/tmp/balloon-http.log 2>&1 &
npm install --no-save --package-lock=false playwright@latest
npx playwright install chromium
node .github/scripts/endurance-smoke.mjs
```

- [ ] **Step 5: Run campaign browser regressions**

```bash
node .github/scripts/visual-smoke.mjs
node .github/scripts/queue-smoke.mjs
```

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/endurance-smoke.mjs .github/workflows/ci.yml
git commit -m "test: verify Endurance v2 in the browser"
```

---

### Task 9: Exact-head verification, balance review, and PR evidence

**Files:**
- No production changes unless a failing check identifies a real defect.
- Update PR #2 discussion/body only after exact-head verification.

**Interfaces:**
- Final changes stay on `feat/endurance-mode`.
- `main`, `playable`, and merge state remain untouched.

- [ ] **Step 1: Run full Node regression suite**

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

- [ ] **Step 3: Run full balance study and inspect report**

```bash
node tools/endurance-balance.mjs --runs 250 --seed 1337 --output artifacts/endurance-balance
```

Review casual/average/strong survival separation, miss rate, rows added, behavior across 60/120 s, and relative Guide/Bomb/Rainbow value. Keep baseline unless data supports a nearby alternative.

- [ ] **Step 4: Run browser smoke and manually inspect all screenshots**

Check ceiling contact, 11/10 scale, active/queued projectile scale, background transitions, special readability, callout position, result dialog, and 390×844 overflow.

- [ ] **Step 5: Push exact head and wait for GitHub Actions**

Both `test` and `browser-smoke` jobs must be green at the exact SHA.

- [ ] **Step 6: Update PR #2 evidence without merging**

PR evidence should include:

```text
exact verified head SHA
full regression job ✅
browser-smoke ✅
fixed 11/10 + ceiling contact ✅
miss => one row; drop-only success => no row ✅
4→5→6 colors at 60/120 s ✅
late-day/sunset background transitions ✅
Guide/Bomb/Rainbow readability + callouts ✅
balance harness summary + selected config ✅
desktop + 390×844 visual review ✅
main/playable untouched; PR remains draft/unmerged ✅
```

- [ ] **Step 7: Do not create a cleanup commit unless tracked files actually changed**
