# Endurance Dynamic Weather + Wide-Angle Aiming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing ~10.3° shallow aiming range and add deterministic dynamic Endurance weather, including Frost shots with a 0.82× in-flight collision scale, without changing campaign weather/balance.

**Architecture:** Keep campaign physics as the default path and add one shared scale-aware projectile-vs-grid collision helper. Put Endurance weather scheduling in a new pure module, snapshot its gameplay modifier onto each projectile when fired, and feed public weather state into the Endurance renderer/HUD. Fabric.js continues to own cached pixel-art background composition while animated rain/snow/frost overlays stay in the runtime renderer.

**Tech Stack:** Vanilla JavaScript ES modules, Canvas 2D, Fabric.js 5.3.0, Node 22 tests, Playwright Chromium browser smoke, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-endurance-dynamic-weather-design.md`

## Global Constraints

- Dynamic weather is **Endurance only**; campaign authored weather, wind, lightning, objectives, balance and level data remain unchanged.
- Shallow aiming must expose the existing `0.18 rad` clamp (about **10.3° from horizontal**) on both sides.
- Pointer/touch input floor is `LAUNCH_Y - 4` logical pixels; input at/below the launcher itself remains rejected.
- Endurance weather states are exactly `clear`, `rain`, `snow`, `frost` for this version.
- Initial weather is `clear`; first phase lasts seeded **25–35 s**, later phases seeded **25–40 s** of active time.
- Same run seed must produce the same weather sequence and durations; pause freezes weather time.
- No immediate weather repeat; Frost cannot repeat back-to-back and scheduled Frost share must stay **<= 40%**.
- Weather transition duration is **2200 ms**.
- Frost baseline projectile collision scale is **0.82**; normal is **1.00**.
- Frost affects only moving-projectile collision; wall bounce, board geometry, placed-orb size and final snap remain unchanged.
- A projectile keeps the weather/collision scale captured when it was fired even if weather changes mid-flight.
- Guide trajectory prediction must use the exact same collision scale as the real shot.
- Frost visuals must preserve the underlying color and special identity.
- Existing Endurance color thresholds remain **4 -> 5 at 60 s -> 6 at 120 s**, capped at six.
- No Endurance wind-bending, hail, frozen placed orbs, seventh color, or new post-120-second pressure rule.
- PR #2 stays draft/unmerged; do not advance `main` or `playable` without explicit user instruction.

---

### Task 1: Expose shallow aiming and centralize scaled projectile collision

**Files:**
- Modify: `src/game-physics.mjs`
- Modify: `src/game.mjs`
- Modify: `gameplay-polish.test.mjs`
- Test: `gameplay-polish.test.mjs`

**Interfaces:**
- Produces: `MIN_AIM_RADIANS = 0.18`
- Produces: `aimInputMaxY(launchY, margin = 4) -> number`
- Produces: `projectileCollisionDistance(radius, collisionScale = 1) -> number`
- Produces: `projectileCollidesGrid({ grid, geometry, x, y, collisionScale = 1 }) -> boolean`
- Produces on `SkyRescueGame`: `projectileMetadataForShot(shot) -> object` defaulting to `{ collisionScale: 1 }`
- Produces on `SkyRescueGame`: `collisionScaleForAimShot(shot) -> number`
- Later tasks consume these helpers for Frost and Guide consistency.

- [ ] **Step 1: Write RED assertions for the real 10.3° clamp and input floor**

Add to `gameplay-polish.test.mjs`:

```js
assert.equal(physics.MIN_AIM_RADIANS, .18);
assert.equal(physics.aimInputMaxY(288), 284);
assert.ok(Math.abs(physics.clampAimAngle(-.01) + .18) < 1e-9);
assert.ok(Math.abs(physics.clampAimAngle(-Math.PI + .01) - (-Math.PI + .18)) < 1e-9);
```

Also add a tiny grid-collision contract using a fake geometry:

```js
const collisionGeometry = {
  RAD: 12,
  split: (key) => key.split(',').map(Number),
  colX: (c) => c * 24 + 12,
  rowY: (r) => r * 20 + 12,
  dist: (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2),
};
const collisionGrid = new Map([['0,0', 1]]);
assert.equal(physics.projectileCollidesGrid({ grid: collisionGrid, geometry: collisionGeometry, x: 34, y: 12, collisionScale: 1 }), true);
assert.equal(physics.projectileCollidesGrid({ grid: collisionGrid, geometry: collisionGeometry, x: 34, y: 12, collisionScale: .82 }), false);
```

- [ ] **Step 2: Run RED**

Run:

```bash
node gameplay-polish.test.mjs
```

Expected: FAIL because the new exports do not exist yet.

- [ ] **Step 3: Implement shared constants/helpers in `src/game-physics.mjs`**

Use these exact contracts:

```js
export const MIN_AIM_RADIANS = 0.18;

export function aimInputMaxY(launchY, margin = 4) {
  return Number(launchY) - Math.max(0, Number(margin) || 0);
}

export function clampAimAngle(angle) {
  return Math.max(-Math.PI + MIN_AIM_RADIANS, Math.min(-MIN_AIM_RADIANS, angle));
}

export function projectileCollisionDistance(radius, collisionScale = 1) {
  const scale = Math.max(.1, Number(collisionScale) || 1);
  return Number(radius) * 1.86 * scale;
}

export function projectileCollidesGrid({ grid, geometry, x, y, collisionScale = 1 }) {
  const threshold = projectileCollisionDistance(geometry.RAD, collisionScale);
  for (const key of grid.keys()) {
    const [c, r] = geometry.split(key);
    if (geometry.dist(x, y, geometry.colX(c, r), geometry.rowY(r)) <= threshold) return true;
  }
  return false;
}
```

- [ ] **Step 4: Replace the pointer/touch Y gate and route collision through the helper**

In `src/game.mjs`, import `aimInputMaxY` and `projectileCollidesGrid`. Remove `const MIN_AIM_Y = 242` and replace both pointer checks with:

```js
const maxAimY = aimInputMaxY(this.B.LAUNCH_Y);
if (p.y <= maxAimY) this.setAim(p.x, p.y);
```

and for pointer-down:

```js
if (p.y > aimInputMaxY(this.B.LAUNCH_Y)) return;
```

Add extensibility hooks:

```js
projectileMetadataForShot() {
  return { collisionScale: 1 };
}

collisionScaleForAimShot(shot) {
  return Math.max(.1, Number(shot?.collisionScale) || 1);
}
```

When firing, snapshot metadata:

```js
const metadata = this.projectileMetadataForShot(shot) || {};
this.projectile = { ...shot, ...metadata, x: this.B.LW / 2, y: this.B.LAUNCH_Y, ...velocity, wind };
```

Change `collides` to:

```js
collides(x, y, collisionScale = 1) {
  return projectileCollidesGrid({ grid: this.grid, geometry: this.B, x, y, collisionScale });
}
```

In `update()` pass the projectile snapshot:

```js
if (this.projectile.y <= ceilingY || this.collides(this.projectile.x, this.projectile.y, this.projectile.collisionScale || 1)) this.land();
```

In `renderState()`, compute the preview scale once:

```js
const aimCollisionScale = this.collisionScaleForAimShot(this.queue[0]);
```

and use it in both full Guide and short preview callbacks:

```js
collides: (x, y) => this.collides(x, y, aimCollisionScale),
```

- [ ] **Step 5: Verify GREEN and campaign regression**

Run:

```bash
node gameplay-polish.test.mjs
node sky-rescue.test.mjs
node wind.test.mjs
node storm-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game-physics.mjs src/game.mjs gameplay-polish.test.mjs
git commit -m "fix: expose shallow aiming and scaled collision"
```

---

### Task 2: Build the pure deterministic Endurance weather state machine

**Files:**
- Create: `src/endurance-weather.mjs`
- Create: `endurance-weather.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `ENDURANCE_WEATHER_CONFIG`
- Produces: `createEnduranceWeatherState({ nowMs, rng, config }) -> WeatherState`
- Produces: `advanceEnduranceWeather(state, nowMs, rng, config) -> { state, changes }`
- Produces: `weatherTransitionProgress(state, nowMs, config) -> number`
- Produces: `weatherShotMetadata(weather, config) -> { weatherType, collisionScale }`
- Produces: `weatherCallout(previous, current) -> string`
- Produces: `weatherBadgeLabel(weather) -> string`
- Later runtime/render/UI tasks consume only these public functions.

- [ ] **Step 1: Write the RED state-machine test**

Create `endurance-weather.test.mjs` with deterministic injected RNG:

```js
import assert from 'node:assert/strict';
import {
  ENDURANCE_WEATHER_CONFIG,
  advanceEnduranceWeather,
  createEnduranceWeatherState,
  weatherBadgeLabel,
  weatherCallout,
  weatherShotMetadata,
  weatherTransitionProgress,
} from './src/endurance-weather.mjs';

function sequenceRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

const config = ENDURANCE_WEATHER_CONFIG;
const aRng = sequenceRng([.2, .8, .1, .6, .4, .9, .3]);
const bRng = sequenceRng([.2, .8, .1, .6, .4, .9, .3]);
let a = createEnduranceWeatherState({ nowMs: 0, rng: aRng, config });
let b = createEnduranceWeatherState({ nowMs: 0, rng: bRng, config });
assert.deepEqual(a, b);
assert.equal(a.current, 'clear');
assert.ok(a.phaseEndsMs >= 25_000 && a.phaseEndsMs <= 35_000);

const sequenceA = [];
const sequenceB = [];
for (let i = 0; i < 12; i += 1) {
  const nowA = a.phaseEndsMs + 1;
  const nowB = b.phaseEndsMs + 1;
  ({ state: a } = advanceEnduranceWeather(a, nowA, aRng, config));
  ({ state: b } = advanceEnduranceWeather(b, nowB, bRng, config));
  sequenceA.push([a.current, a.phaseEndsMs - a.phaseStartedMs]);
  sequenceB.push([b.current, b.phaseEndsMs - b.phaseStartedMs]);
}
assert.deepEqual(sequenceA, sequenceB);
assert.equal(sequenceA.some(([type], index) => index && type === sequenceA[index - 1][0]), false);
assert.equal(sequenceA.some(([type], index) => index && type === 'frost' && sequenceA[index - 1][0] === 'frost'), false);
assert.ok(a.frostScheduledMs / a.totalScheduledMs <= .4 + Number.EPSILON);

assert.deepEqual(weatherShotMetadata('clear', config), { weatherType: 'clear', collisionScale: 1 });
assert.deepEqual(weatherShotMetadata('frost', config), { weatherType: 'frost', collisionScale: .82 });
assert.equal(weatherCallout('snow', 'frost'), 'MRÓZ — mniejsza kolizja pocisków');
assert.equal(weatherCallout('frost', 'rain'), 'ODWILŻ — normalna wielkość pocisków');
assert.equal(weatherBadgeLabel('frost'), '❄ FROST');

const transitionState = { ...a, transitionStartedMs: 1000, transitionDurationMs: 2200 };
assert.equal(weatherTransitionProgress(transitionState, 1000, config), 0);
assert.ok(weatherTransitionProgress(transitionState, 2100, config) > .49 && weatherTransitionProgress(transitionState, 2100, config) < .51);
assert.equal(weatherTransitionProgress(transitionState, 3200, config), 1);

console.log('✓ deterministic Endurance weather scheduler');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-weather.test.mjs
```

Expected: module-not-found / missing exports.

- [ ] **Step 3: Implement `src/endurance-weather.mjs`**

Define config exactly:

```js
export const ENDURANCE_WEATHER_CONFIG = Object.freeze({
  weatherTypes: Object.freeze(['clear', 'rain', 'snow', 'frost']),
  firstMinMs: 25_000,
  firstMaxMs: 35_000,
  phaseMinMs: 25_000,
  phaseMaxMs: 40_000,
  transitionMs: 2_200,
  frostCollisionScale: .82,
  maxFrostShare: .40,
});
```

State shape:

```js
{
  current: 'clear',
  previous: null,
  phaseStartedMs: 0,
  phaseEndsMs,
  transitionStartedMs: null,
  transitionDurationMs: 2200,
  totalScheduledMs: phaseEndsMs,
  frostScheduledMs: 0,
}
```

Use one sampled duration per next phase. Rotate eligible types from a seeded offset, excluding the current type. Accept Frost only when:

```js
(state.frostScheduledMs + durationMs) / (state.totalScheduledMs + durationMs) <= config.maxFrostShare
```

If Frost is rejected, choose the next rotated non-current non-Frost candidate. `advanceEnduranceWeather()` must loop while `nowMs >= phaseEndsMs`, so test jumps and long frames cannot skip state accounting.

Each change object must be:

```js
{ from, to, atMs, durationMs, callout: weatherCallout(from, to) }
```

- [ ] **Step 4: Add CI coverage and syntax check**

In `.github/workflows/ci.yml` add after Endurance runtime:

```yaml
      - name: Endurance weather tests
        run: node endurance-weather.test.mjs
```

and syntax:

```yaml
          node --check src/endurance-weather.mjs
```

- [ ] **Step 5: Verify GREEN**

```bash
node endurance-weather.test.mjs
node --check src/endurance-weather.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/endurance-weather.mjs endurance-weather.test.mjs .github/workflows/ci.yml
git commit -m "feat: add deterministic Endurance weather core"
```

---

### Task 3: Integrate weather timing and per-shot Frost physics into `EnduranceGame`

**Files:**
- Modify: `src/endurance-game.mjs`
- Modify: `endurance-runtime.test.mjs`

**Interfaces:**
- Consumes: weather functions from Task 2 and projectile metadata hooks from Task 1.
- Produces callbacks: `onEnduranceWeather({ from, to, callout })`
- Produces snapshot fields: `weather`, `previousWeather`, `weatherPhaseEndsMs`, `weatherTransitionProgress`
- Produces render state: `enduranceWeather: { current, previous, progress, phaseEndsMs }`
- Overrides: `projectileMetadataForShot(shot)` and `collisionScaleForAimShot(shot)`.

- [ ] **Step 1: Extend RED runtime coverage**

Add to `endurance-runtime.test.mjs`:

```js
const weatherEvents = [];
const weatherGame = new EnduranceGame(fakeCanvas(), {
  onEnduranceWeather: (event) => weatherEvents.push(event),
}, { config: ENDURANCE_CONFIG });
weatherGame.start('weather-seed');
const weatherStart = weatherGame.getSnapshot();
assert.equal(weatherStart.weather, 'clear');
assert.ok(weatherStart.weatherPhaseEndsMs >= 25_000 && weatherStart.weatherPhaseEndsMs <= 35_000);

weatherGame.elapsedMs = weatherStart.weatherPhaseEndsMs - 1;
weatherGame.update(.001);
assert.equal(weatherEvents.length, 1, 'crossing the phase boundary should emit exactly one weather event');
assert.notEqual(weatherGame.getSnapshot().weather, 'clear');

weatherGame.setPaused(true);
const pausedWeather = weatherGame.getSnapshot();
weatherGame.update(30);
assert.equal(weatherGame.getSnapshot().weatherPhaseEndsMs, pausedWeather.weatherPhaseEndsMs);
weatherGame.setPaused(false);

weatherGame.weatherState.current = 'frost';
const frozenMeta = weatherGame.projectileMetadataForShot({ type: 'normal', color: 2 });
assert.deepEqual(frozenMeta, { weatherType: 'frost', collisionScale: .82 });
weatherGame.queue = [{ type: 'guide', color: 3 }, ...weatherGame.queue.slice(1)];
assert.equal(weatherGame.collisionScaleForAimShot(weatherGame.queue[0]), .82, 'Guide preview should inherit active Frost before firing');

weatherGame.shoot();
assert.equal(weatherGame.projectile.weatherType, 'frost');
assert.equal(weatherGame.projectile.collisionScale, .82);
weatherGame.weatherState.current = 'clear';
assert.equal(weatherGame.projectile.collisionScale, .82, 'mid-flight thaw must not mutate the shot snapshot');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: FAIL on missing weather snapshot/state/hooks.

- [ ] **Step 3: Add deterministic weather RNG/state to constructor/start**

In `EnduranceGame`, import Task 2 helpers and initialize a dedicated weather RNG from the run seed, separate from board/shot RNG:

```js
this.weatherConfig = { ...ENDURANCE_WEATHER_CONFIG, ...(options.weatherConfig || {}) };
```

In `start(seed)`:

```js
this.weatherRng = createSeededRng(this.hashSeed(`endurance-weather-${runSeed}`));
this.weatherState = createEnduranceWeatherState({ nowMs: 0, rng: this.weatherRng, config: this.weatherConfig });
```

Do not persist this state to save data.

- [ ] **Step 4: Advance weather only on active Endurance time**

After incrementing `elapsedMs` in `update(dt)`:

```js
const advanced = advanceEnduranceWeather(this.weatherState, this.elapsedMs, this.weatherRng, this.weatherConfig);
this.weatherState = advanced.state;
for (const change of advanced.changes) this.callbacks.onEnduranceWeather?.(change);
```

Pause already exits before active time changes; retain that behavior.

- [ ] **Step 5: Snapshot Frost metadata at shot time and use it for Guide preview**

Add:

```js
projectileMetadataForShot(shot) {
  if (shot?.collisionScale) {
    return { weatherType: shot.weatherType || this.weatherState.current, collisionScale: shot.collisionScale };
  }
  return weatherShotMetadata(this.weatherState.current, this.weatherConfig);
}

collisionScaleForAimShot(shot) {
  return Math.max(.1, Number(shot?.collisionScale) || weatherShotMetadata(this.weatherState.current, this.weatherConfig).collisionScale);
}
```

The parent `shoot()` from Task 1 now freezes this metadata on the projectile.

- [ ] **Step 6: Expose public weather state without leaking private scheduler internals**

In `getSnapshot()` add:

```js
weather: this.weatherState.current,
previousWeather: this.weatherState.previous,
weatherPhaseEndsMs: this.weatherState.phaseEndsMs,
weatherTransitionProgress: weatherTransitionProgress(this.weatherState, this.elapsedMs, this.weatherConfig),
```

In `renderState()` clone queue entries for visuals using current weather metadata, but never mutate the real queue:

```js
const base = super.renderState();
const queueWeather = weatherShotMetadata(this.weatherState.current, this.weatherConfig);
return {
  ...base,
  queue: base.queue.map((shot) => ({ ...shot, ...queueWeather })),
  mode: 'endurance',
  geometry: this.B,
  enduranceAtmosphere: enduranceAtmosphereState(this.elapsedMs, this.config),
  enduranceWeather: {
    current: this.weatherState.current,
    previous: this.weatherState.previous,
    progress: weatherTransitionProgress(this.weatherState, this.elapsedMs, this.weatherConfig),
    phaseEndsMs: this.weatherState.phaseEndsMs,
  },
};
```

The projectile remains the frozen object from `shoot()` and must not be overwritten with current weather in `renderState()`.

- [ ] **Step 7: Verify GREEN and existing Endurance rules**

```bash
node endurance-runtime.test.mjs
node endurance-core.test.mjs
node endurance-geometry.test.mjs
node shot-resolution.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/endurance-game.mjs endurance-runtime.test.mjs
git commit -m "feat: integrate dynamic weather into Endurance runtime"
```

---

### Task 4: Render Frost without hiding shot color or special identity

**Files:**
- Modify: `src/pixel-art.mjs`
- Modify: `src/game-renderer.mjs`
- Modify: `endurance-specials.test.mjs`
- Modify: `pixel-art.test.mjs`

**Interfaces:**
- Produces: `drawPixelFrostOverlay(ctx, x, y, time = 0)`
- `GameRenderer.drawShot()` consumes `shot.weatherType === 'frost'` after drawing the normal orb and any special overlay.

- [ ] **Step 1: Add RED visual-contract assertions**

In `endurance-specials.test.mjs` / `pixel-art.test.mjs`, assert the source exports and uses a Frost overlay after special rendering:

```js
assert.match(pixelSource, /export function drawPixelFrostOverlay/);
assert.match(rendererSource, /shot\.weatherType === 'frost'/);
assert.ok(rendererSource.indexOf('drawPixelSpecial') < rendererSource.indexOf('drawPixelFrostOverlay'), 'Frost should augment special identity, not replace it');
```

Add a fake-context test that verifies the overlay uses strokes/fillRects/arcs but never paints a full 24×24 opaque body rectangle.

- [ ] **Step 2: Run RED**

```bash
node endurance-specials.test.mjs
node pixel-art.test.mjs
```

Expected: FAIL on missing overlay export/use.

- [ ] **Step 3: Implement a thin pixel-art ice rim**

Export from `src/pixel-art.mjs`:

```js
export function drawPixelFrostOverlay(ctx, x = 0, y = 0, time = 0) {
  const pulse = .72 + Math.sin(time * .008) * .12;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= pulse;
  ctx.strokeStyle = '#c9f4ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 10.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e9fbff';
  const shards = [[-9,-5,2,3],[8,-4,2,2],[-7,7,2,2],[6,8,2,3]];
  for (const [sx, sy, w, h] of shards) ctx.fillRect(sx, sy, w, h);
  ctx.restore();
}
```

Keep the overlay sparse; do not fill the orb center.

- [ ] **Step 4: Compose the overlay in `drawShot()`**

Import `drawPixelFrostOverlay` and, after special drawing:

```js
if (shot.weatherType === 'frost') {
  const ctx = this.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawPixelFrostOverlay(ctx, 0, 0, this.animationTime);
  ctx.restore();
}
```

This automatically covers active launcher shot, queue preview and projectile because all three already use `drawShot()`.

- [ ] **Step 5: Verify GREEN**

```bash
node endurance-specials.test.mjs
node pixel-art.test.mjs
node orb-rack.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pixel-art.mjs src/game-renderer.mjs endurance-specials.test.mjs pixel-art.test.mjs
git commit -m "feat: add readable Frost shot overlay"
```

---

### Task 5: Compose time-of-day and weather crossfades with Fabric pixel backgrounds

**Files:**
- Modify: `src/endurance-renderer.mjs`
- Modify: `src/background-fabric.mjs`
- Modify: `src/background-fabric-runtime.mjs`
- Modify: `endurance-renderer.test.mjs`
- Modify: `background-fabric.test.mjs`

**Interfaces:**
- Consumes: `state.enduranceAtmosphere` and `state.enduranceWeather` from Task 3.
- Produces: Endurance sky composition where time-of-day and weather transitions can overlap independently.
- Fabric cache key remains `world:timeOfDay:weather:boss`.

- [ ] **Step 1: Write RED renderer/background contracts**

Add tests asserting:

```js
assert.match(enduranceRendererSource, /enduranceWeather/);
assert.match(enduranceRendererSource, /previous/);
assert.match(enduranceRendererSource, /progress/);
assert.match(backgroundFabricSource, /weather === 'snow'/);
assert.match(backgroundFabricSource, /weather === 'frost'/);
assert.match(backgroundRuntimeSource, /drawPixelSnow/);
assert.match(backgroundRuntimeSource, /drawPixelFrostAmbience/);
```

Add `backgroundThemeKey` assertions that `clear`, `rain`, `snow`, `frost` produce four distinct cache keys for the same world/time.

- [ ] **Step 2: Run RED**

```bash
node endurance-renderer.test.mjs
node background-fabric.test.mjs
```

Expected: FAIL on missing weather-specific composition.

- [ ] **Step 3: Make Fabric static palettes weather-aware**

In `paletteFor(level)` keep existing storm handling, then add explicit Endurance weather treatments:

```js
if (weather === 'rain') {
  palette.sky = ['#335c79', '#4f7891', '#6f94a5', '#8eabb5'];
  palette.cloud = '#a7b7bb';
  palette.cloudShadow = '#667a83';
}
if (weather === 'snow') {
  palette.sky = ['#547b99', '#7197ad', '#9db9c2', '#cbd5cf'];
  palette.near = '#93a99d';
  palette.ground = '#b8c4bb';
  palette.cloud = '#edf2ed';
  palette.cloudShadow = '#aab8b9';
}
if (weather === 'frost') {
  palette.sky = ['#456f94', '#6291ad', '#91b5c1', '#c5d9d5'];
  palette.near = '#7fa49a';
  palette.ground = '#76938c';
  palette.cloud = '#e5f1ef';
  palette.cloudShadow = '#9eb7ba';
}
```

Do not change campaign weather names/values.

- [ ] **Step 4: Add runtime snow/frost overlays**

In `src/background-fabric-runtime.mjs`, implement:

```js
function drawPixelSnow(ctx, time, width, height, intensity) { /* seeded-looking arithmetic flakes; no Math.random */ }
function drawPixelFrostAmbience(ctx, time, width, height, intensity) { /* sparse cyan/white 1–2px glints */ }
```

Use only deterministic arithmetic based on `i` and `time`, like the existing rain renderer. Route `weather === 'snow'` and `weather === 'frost'` in `drawWeather()`.

- [ ] **Step 5: Refactor `EnduranceRenderer.drawEnduranceSky()` to compose both transition axes**

Change base skies so stage defines time-of-day only:

```js
const ENDURANCE_SKIES = [
  { world: 'meadow', atmosphere: { timeOfDay: 'day', intensity: .15 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'late-day', intensity: .35 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'sunset', intensity: .55 } },
];
```

Add a helper that injects a weather value into both sides of the time crossfade. Then in `drawEnduranceSky(atmosphere, weather, time)`, if weather transition is active, draw the full time-of-day composition twice under `globalAlpha` `(1-progress)` and `progress`: once with `previous`, once with `current`.

At most four cached sky draws occur only during simultaneous transitions; Fabric scenes are cached, so do not create new Fabric canvases per frame.

- [ ] **Step 6: Pass weather state from `draw()`**

Replace:

```js
this.drawEnduranceSky(state.enduranceAtmosphere, time);
```

with:

```js
this.drawEnduranceSky(state.enduranceAtmosphere, state.enduranceWeather, time);
```

- [ ] **Step 7: Verify GREEN**

```bash
node endurance-renderer.test.mjs
node background-fabric.test.mjs
node endurance-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/endurance-renderer.mjs src/background-fabric.mjs src/background-fabric-runtime.mjs endurance-renderer.test.mjs background-fabric.test.mjs
git commit -m "feat: add pixel weather transitions to Endurance"
```

---

### Task 6: Add the compact weather badge and weather callouts

**Files:**
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `styles/endurance.css`
- Modify: `endurance-ui.test.mjs`
- Modify: `endurance-style.test.mjs`

**Interfaces:**
- Consumes snapshot `weather` from Task 3.
- Consumes callback `onEnduranceWeather({ from, to, callout })`.
- Produces DOM `#enduranceWeatherBadge` hidden outside Endurance.

- [ ] **Step 1: Add RED UI/style contracts**

Assert in `endurance-ui.test.mjs`:

```js
assert.match(indexSource, /id="enduranceWeatherBadge"/);
assert.match(appSource, /onEnduranceWeather/);
assert.match(appSource, /weatherBadgeLabel/);
assert.match(appSource, /snapshot\.weather/);
```

Assert in `endurance-style.test.mjs`:

```js
assert.match(css, /\.endurance-weather-badge/);
assert.match(css, /data-weather="frost"/);
assert.match(css, /@media \(max-width:/);
```

- [ ] **Step 2: Run RED**

```bash
node endurance-ui.test.mjs
node endurance-style.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Add the badge to the top HUD without adding a fifth stat**

In `index.html`, place near `game-title-block` / `score-compact`:

```html
<span class="endurance-weather-badge" id="enduranceWeatherBadge" data-weather="clear" hidden aria-live="polite">☀ CLEAR</span>
```

Do not alter the existing `Wynik / Combo / Czas / Kolory` stat structure.

- [ ] **Step 4: Wire app state and callouts**

Import `weatherBadgeLabel` from `src/endurance-weather.mjs`, add the ref, and in `createEnduranceGame()`:

```js
onEnduranceWeather: ({ from, to, callout }) => {
  flashCallout(callout, to === 'frost' || from === 'frost' ? 1500 : 950, 'is-weather');
},
```

In Endurance `updateHud(snapshot)`:

```js
refs.enduranceWeatherBadge.hidden = false;
refs.enduranceWeatherBadge.dataset.weather = snapshot.weather || 'clear';
refs.enduranceWeatherBadge.textContent = weatherBadgeLabel(snapshot.weather || 'clear');
```

In campaign/showMap/startLevel paths set `hidden = true` and reset `data-weather='clear'` so campaign never displays dynamic Endurance weather.

Extend `flashCallout()` cleanup list with `is-weather`.

- [ ] **Step 5: Style for desktop/mobile/reduced motion**

Use compact pixel styling in `styles/endurance.css`, e.g. 10–11px text, hard border/shadow, no backdrop that obscures the board. Give Frost a pale-cyan border, Rain a muted-blue border, Snow a near-white border. At 390px width, the badge must not expand HUD width beyond the playfield.

Reduced-motion may remove badge animation but must not change weather timing/physics.

- [ ] **Step 6: Verify GREEN**

```bash
node endurance-ui.test.mjs
node endurance-style.test.mjs
node endurance-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html src/app.mjs styles/endurance.css endurance-ui.test.mjs endurance-style.test.mjs
git commit -m "feat: show Endurance weather status"
```

---

### Task 7: Extend the deterministic balance agent with a Frost study

**Files:**
- Modify: `tools/endurance-balance.mjs`
- Modify: `endurance-balance.test.mjs`
- Modify: `.github/workflows/ci.yml` only if a syntax/test command is missing (do not put the full study in every CI run)

**Interfaces:**
- Consumes: Task 2 weather scheduler and Task 1 collision-distance helper.
- Produces: `frostCandidateConfigs()` for scales `.76`, `.82`, `.88`, `1.00`.
- Produces: `runFrostMatrix(...)` separate from the existing baseline matrix so the previously verified v2 balance study remains reproducible.
- Adds per-run metrics: `scorePerMinute`, `frostShare`, `frostShots`, `frostOnlyGapShots`.

- [ ] **Step 1: Write RED Frost-study tests**

Extend `endurance-balance.test.mjs`:

```js
const frostConfigs = frostCandidateConfigs();
assert.deepEqual(frostConfigs.map((item) => item.frostCollisionScale), [.76, .82, .88, 1]);

const frostA = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
const frostB = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
assert.deepEqual(frostA, frostB);
for (const run of frostA.runs) {
  assert.ok(run.frostShare >= 0 && run.frostShare <= .4 + .001);
  assert.ok(run.scorePerMinute >= 0);
  assert.ok(run.frostShots >= 0);
  assert.ok(run.frostOnlyGapShots >= 0 && run.frostOnlyGapShots <= run.frostShots);
}
```

- [ ] **Step 2: Run RED**

```bash
node endurance-balance.test.mjs
```

Expected: FAIL on missing Frost matrix APIs/metrics.

- [ ] **Step 3: Keep the old matrix untouched and add a dedicated Frost matrix**

Do not change `candidateConfigs()` or old baseline IDs. Add:

```js
export function frostCandidateConfigs() {
  return [.76, .82, .88, 1].map((frostCollisionScale) => ({
    id: `frost-${frostCollisionScale.toFixed(2)}`,
    frostCollisionScale,
  }));
}
```

`runFrostMatrix()` should call a weather-aware simulation path with all existing Endurance v2 gameplay config values fixed.

- [ ] **Step 4: Model relative Frost access using the same collision threshold**

For balance only, add a conservative direct-shot corridor evaluator from launcher center to candidate cell. Sample points along the segment and use `projectileCollisionDistance(geometry.RAD, scale)` against occupied orb centers, excluding the target neighborhood. The same evaluator at `1.00` and Frost scale provides the metric:

```js
const frostOnly = clearsAtScale(frostScale) && !clearsAtScale(1);
```

Use the active weather scheduler to decide shot scale. When weather is Frost, prefer otherwise equivalent candidates that are reachable at the Frost scale; do not give the simulator bank-shot superpowers that the metric cannot model.

- [ ] **Step 5: Aggregate required metrics**

Add summary fields:

```js
medianSurvivalMs
medianScorePerMinute
missRate
medianRowsAdded
medianBestCombo
meanFrostShare
meanFrostOnlyGapRate
```

The full study command should be:

```bash
node tools/endurance-balance.mjs --frost-study --runs 250 --seed 1337 --output artifacts/endurance-weather-balance
```

and should emit JSON + Markdown without replacing the previous Endurance v2 baseline artifacts.

- [ ] **Step 6: Verify GREEN**

```bash
node endurance-balance.test.mjs
node --check tools/endurance-balance.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/endurance-balance.mjs endurance-balance.test.mjs
git commit -m "test: add Frost balance study"
```

---

### Task 8: Expand Endurance browser smoke for shallow aim and all four weather states

**Files:**
- Modify: `.github/scripts/endurance-smoke.mjs`

**Interfaces:**
- Uses the existing `window.__enduranceGame` probe.
- Does not add test-only production APIs.
- Produces screenshots for clear, rain, snow, frost and shallow-angle aim.

- [ ] **Step 1: Add RED smoke assertions locally/in CI branch**

Extend `runtimeSnapshot()` with:

```js
weather: snapshot.weather,
weatherProgress: snapshot.weatherTransitionProgress,
aimAngle: game.aimAngle,
projectile: game.projectile ? {
  weatherType: game.projectile.weatherType,
  collisionScale: game.projectile.collisionScale,
} : null,
```

Add desktop checks for `#enduranceWeatherBadge` and pointer aiming.

- [ ] **Step 2: Exercise real pointer coordinates near both clamp limits**

Use the canvas bounding box and logical mapping. Move pointer to a point corresponding to logical `y = LAUNCH_Y - 4` and far left/right x values, then assert:

```js
Math.abs(rightAngle - (-.18)) < .03
Math.abs(leftAngle - (-Math.PI + .18)) < .03
```

Save `artifacts/endurance-weather-shallow-aim.png`.

- [ ] **Step 3: Use the existing browser probe to force visual weather states without production seams**

For each `rain`, `snow`, `frost`, mutate only the probed instance's public-ish test state inside `page.evaluate()`:

```js
game.weatherState = {
  ...game.weatherState,
  previous: game.weatherState.current,
  current: target,
  transitionStartedMs: game.elapsedMs,
  transitionDurationMs: 2200,
};
game.emitState();
```

Unit tests already verify scheduler correctness; smoke verifies browser rendering/HUD.

For each state assert badge text/data, take screenshots:

```txt
artifacts/endurance-weather-clear.png
artifacts/endurance-weather-rain.png
artifacts/endurance-weather-snow.png
artifacts/endurance-weather-frost.png
```

- [ ] **Step 4: Verify Frost callout and shot snapshot**

Under forced Frost, reset queue to a known colored normal shot, trigger the runtime weather callback path or call the same UI callback by transitioning through `game.update()` at a phase boundary, then shoot. Assert projectile color remains known, `weatherType === 'frost'`, `collisionScale === .82`, and the callout contains `MRÓZ`.

Also force weather to clear while the projectile is active and assert its scale remains `.82`.

- [ ] **Step 5: Verify Guide preview uses Frost scale**

Put a Guide in queue during Frost and compare a crafted narrow-gap trajectory against a normal-scale preview using the game collision helper. The browser assertion should confirm the Guide trajectory can extend through the same gap that would stop at scale 1.00.

- [ ] **Step 6: Preserve existing progression/loss/mobile checks**

Keep the current fixed 11/10, miss-row, drop-only success, 60/120 color stage, special, result/retry and 390×844 overflow checks. Add mobile assertion that the weather badge is visible and does not cause horizontal overflow.

- [ ] **Step 7: Run browser smoke**

```bash
python3 -m http.server 4173
node .github/scripts/endurance-smoke.mjs
```

Expected: PASS with no console/page errors.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/endurance-smoke.mjs
git commit -m "test: cover Endurance weather and shallow aiming"
```

---

### Task 9: Full study, screenshot review, exact-head CI and PR evidence

**Files:**
- Modify only if needed after evidence: PR #2 body/comment; no gameplay changes unless a failing test or measured balance issue requires them.
- Generated local/CI artifacts: `artifacts/endurance-weather-balance.{json,md}` and browser PNGs.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified exact-head SHA and evidence for PR #2.

- [ ] **Step 1: Run the full Node suite exactly as CI does**

Run every command in `.github/workflows/ci.yml`, including the new weather test and all syntax checks. Minimum new commands:

```bash
node endurance-weather.test.mjs
node gameplay-polish.test.mjs
node endurance-runtime.test.mjs
node endurance-renderer.test.mjs
node background-fabric.test.mjs
node endurance-specials.test.mjs
node endurance-balance.test.mjs
node --check src/endurance-weather.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run the full Frost balance study**

```bash
node tools/endurance-balance.mjs --frost-study --runs 250 --seed 1337 --output artifacts/endurance-weather-balance
```

Inspect all four scales `.76/.82/.88/1.00`. Keep `.82` unless the report shows it materially violates the spec: Frost share >40%, survival increase that trivializes pressure, or negligible Frost-only gap benefit.

If `.82` needs tuning, change only `ENDURANCE_WEATHER_CONFIG.frostCollisionScale`, update tests, rerun the study, and document why. Do not tune unrelated Endurance parameters.

- [ ] **Step 3: Run all browser smoke**

```bash
node .github/scripts/visual-smoke.mjs
node .github/scripts/queue-smoke.mjs
node .github/scripts/endurance-smoke.mjs
```

Expected: campaign, queue and Endurance all PASS.

- [ ] **Step 4: Manually inspect screenshots**

Check at minimum:

```txt
artifacts/endurance-weather-shallow-aim.png
artifacts/endurance-weather-clear.png
artifacts/endurance-weather-rain.png
artifacts/endurance-weather-snow.png
artifacts/endurance-weather-frost.png
artifacts/mobile-endurance-v2.png
```

Reject the build if Frost hides the shot color/special identity, snow/rain obscure gameplay, or the badge crowds the mobile HUD.

- [ ] **Step 5: Push exact head and verify GitHub Actions**

Wait for both `test` and `browser-smoke` jobs on the exact final SHA. Record run ID and screenshot artifact ID/digest.

- [ ] **Step 6: Update PR #2 evidence without merging**

Update the PR body/comment with:

```md
### Endurance dynamic weather
- aiming now reaches the existing ~10.3° clamp on pointer/touch and keyboard
- seeded Endurance-only Clear/Rain/Snow/Frost phases
- Frost shots snapshot a reduced in-flight collision scale; placed-orb/snap geometry unchanged
- Guide prediction uses the same collision scale as the actual shot
- Fabric pixel-art weather crossfades + compact HUD badge
- Frost balance study: .76/.82/.88/1.00 with 250 runs/profile/config
- exact-head CI: <SHA / run ID / artifact evidence>
```

Keep PR #2 `draft: true`, `merged: false`.

- [ ] **Step 7: Verify branch safety**

Confirm `main` remains `220266acdbf313e9d0b656dfd83f945bf56cf29c` unless the user explicitly changed it elsewhere, and confirm `playable` was not advanced by this work.

- [ ] **Step 8: Final handoff**

Give the user a rawcdn/githack link pinned to the exact verified SHA plus the Frost balance report and screenshot archive. Do not claim completion until exact-head test + browser-smoke are both green.
