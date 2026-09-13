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

```bash
node gameplay-polish.test.mjs
```

Expected: FAIL because the new exports do not exist yet.

- [ ] **Step 3: Implement shared constants/helpers in `src/game-physics.mjs`**

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

In `src/game.mjs`, import `aimInputMaxY` and `projectileCollidesGrid`, delete `const MIN_AIM_Y = 242`, and change pointer handling to:

```js
onPointerMove(event) {
  if (this.status !== 'playing') return;
  const p = toLogicalPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.B.LW, this.B.LH);
  if (p.y <= aimInputMaxY(this.B.LAUNCH_Y)) this.setAim(p.x, p.y);
}

onPointerDown(event) {
  if (this.status !== 'playing' || this.paused) return;
  const p = toLogicalPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.B.LW, this.B.LH);
  if (p.y > aimInputMaxY(this.B.LAUNCH_Y)) return;
  event.preventDefault();
  this.setAim(p.x, p.y);
  this.canvas.focus({ preventScroll: true });
  this.shoot();
}
```

Add hooks:

```js
projectileMetadataForShot() {
  return { collisionScale: 1 };
}

collisionScaleForAimShot(shot) {
  return Math.max(.1, Number(shot?.collisionScale) || 1);
}
```

When firing:

```js
const metadata = this.projectileMetadataForShot(shot) || {};
this.projectile = { ...shot, ...metadata, x: this.B.LW / 2, y: this.B.LAUNCH_Y, ...velocity, wind };
```

Replace `collides` with:

```js
collides(x, y, collisionScale = 1) {
  return projectileCollidesGrid({ grid: this.grid, geometry: this.B, x, y, collisionScale });
}
```

In `update()`:

```js
const collisionScale = Math.max(.1, Number(this.projectile.collisionScale) || 1);
if (this.projectile.y <= ceilingY || this.collides(this.projectile.x, this.projectile.y, collisionScale)) this.land();
```

In `renderState()`:

```js
const aimCollisionScale = this.collisionScaleForAimShot(this.queue[0]);
```

Use that in both preview callbacks:

```js
collides: (x, y) => this.collides(x, y, aimCollisionScale),
```

- [ ] **Step 5: Verify GREEN and campaign regression**

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

- [ ] **Step 1: Write the RED state-machine test**

Create `endurance-weather.test.mjs`:

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

Use this config:

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

Use helpers with these exact semantics:

```js
function sampleDuration(rng, minMs, maxMs) {
  return Math.round(minMs + (maxMs - minMs) * Math.max(0, Math.min(.999999, Number(rng?.()) || 0)));
}

export function createEnduranceWeatherState({ nowMs = 0, rng = Math.random, config = ENDURANCE_WEATHER_CONFIG } = {}) {
  const durationMs = sampleDuration(rng, config.firstMinMs, config.firstMaxMs);
  return {
    current: 'clear',
    previous: null,
    phaseStartedMs: nowMs,
    phaseEndsMs: nowMs + durationMs,
    transitionStartedMs: null,
    transitionDurationMs: config.transitionMs,
    totalScheduledMs: durationMs,
    frostScheduledMs: 0,
  };
}
```

For each later phase, sample one `durationMs`, rotate `weatherTypes.filter(type => type !== state.current)` from a seeded index, and reject `frost` when:

```js
(state.frostScheduledMs + durationMs) / (state.totalScheduledMs + durationMs) > config.maxFrostShare
```

If rejected, use the first rotated non-Frost candidate. `advanceEnduranceWeather()` loops while `nowMs >= phaseEndsMs`, returns every crossed change, and each change is:

```js
{ from, to, atMs, durationMs, callout: weatherCallout(from, to) }
```

Use these labels:

```js
const BADGE = { clear: '☀ CLEAR', rain: '☂ RAIN', snow: '❄ SNOW', frost: '❄ FROST' };
const CALLOUT = { clear: 'POGODNIE', rain: 'DESZCZ', snow: 'ŚNIEG', frost: 'MRÓZ — mniejsza kolizja pocisków' };
```

and return `ODWILŻ — normalna wielkość pocisków` whenever `previous === 'frost' && current !== 'frost'`.

- [ ] **Step 4: Add CI coverage and syntax check**

In `.github/workflows/ci.yml` add:

```yaml
      - name: Endurance weather tests
        run: node endurance-weather.test.mjs
```

and:

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
- Consumes Task 2 weather functions and Task 1 projectile metadata hooks.
- Produces callback: `onEnduranceWeather({ from, to, atMs, durationMs, callout })`
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
assert.equal(weatherEvents.length, 1);
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
assert.equal(weatherGame.collisionScaleForAimShot(weatherGame.queue[0]), .82);

weatherGame.shoot();
assert.equal(weatherGame.projectile.weatherType, 'frost');
assert.equal(weatherGame.projectile.collisionScale, .82);
weatherGame.weatherState.current = 'clear';
assert.equal(weatherGame.projectile.collisionScale, .82);
```

- [ ] **Step 2: Run RED**

```bash
node endurance-runtime.test.mjs
```

Expected: FAIL on missing weather state/hooks.

- [ ] **Step 3: Add dedicated weather config/RNG/state**

Import the Task 2 API and add in the constructor:

```js
this.weatherConfig = { ...ENDURANCE_WEATHER_CONFIG, ...(options.weatherConfig || {}) };
this.weatherState = null;
this.weatherRng = null;
```

In `start(seed)` after `runSeed` is resolved:

```js
this.weatherRng = createSeededRng(this.hashSeed(`endurance-weather-${runSeed}`));
this.weatherState = createEnduranceWeatherState({ nowMs: 0, rng: this.weatherRng, config: this.weatherConfig });
```

Do not persist weather state to `save.mjs`.

- [ ] **Step 4: Advance weather on active Endurance time only**

Immediately after `elapsedMs` advances in `update(dt)`:

```js
const advanced = advanceEnduranceWeather(this.weatherState, this.elapsedMs, this.weatherRng, this.weatherConfig);
this.weatherState = advanced.state;
for (const change of advanced.changes) this.callbacks.onEnduranceWeather?.(change);
```

The existing early return for `paused`/non-playing state remains the pause guarantee.

- [ ] **Step 5: Snapshot Frost metadata at shot time and mirror it for Guide preview**

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

- [ ] **Step 6: Expose public weather state and visual queue metadata**

In `getSnapshot()` add:

```js
weather: this.weatherState.current,
previousWeather: this.weatherState.previous,
weatherPhaseEndsMs: this.weatherState.phaseEndsMs,
weatherTransitionProgress: weatherTransitionProgress(this.weatherState, this.elapsedMs, this.weatherConfig),
```

In `renderState()`:

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

Do not overwrite `base.projectile`; it already contains frozen launch-time metadata.

- [ ] **Step 7: Verify GREEN**

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
- `GameRenderer.drawShot()` consumes `shot.weatherType === 'frost'` after drawing the normal orb and special overlay.

- [ ] **Step 1: Add RED visual-contract tests**

Add source-order assertions:

```js
assert.match(pixelSource, /export function drawPixelFrostOverlay/);
assert.match(rendererSource, /shot\.weatherType === 'frost'/);
assert.ok(rendererSource.indexOf('drawPixelSpecial') < rendererSource.indexOf('drawPixelFrostOverlay'));
```

Add a behavior-level fake context in `pixel-art.test.mjs`:

```js
const calls = [];
const frostCtx = new Proxy({
  globalAlpha: 1,
  save() {}, restore() {}, translate() {}, beginPath() {}, arc(...args) { calls.push(['arc', ...args]); },
  stroke() { calls.push(['stroke']); },
  fillRect(...args) { calls.push(['fillRect', ...args]); },
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return target[prop] = () => {};
  },
});
drawPixelFrostOverlay(frostCtx, 0, 0, 0);
assert.ok(calls.some(([type]) => type === 'arc'));
assert.ok(calls.filter(([type]) => type === 'fillRect').length >= 4);
assert.equal(calls.some(([type, x, y, w, h]) => type === 'fillRect' && w >= 20 && h >= 20), false, 'Frost must not cover the orb body');
```

- [ ] **Step 2: Run RED**

```bash
node endurance-specials.test.mjs
node pixel-art.test.mjs
```

Expected: FAIL on missing overlay export/use.

- [ ] **Step 3: Implement the thin ice rim**

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
  for (const [sx, sy, w, h] of [[-9,-5,2,3],[8,-4,2,2],[-7,7,2,2],[6,8,2,3]]) ctx.fillRect(sx, sy, w, h);
  ctx.restore();
}
```

- [ ] **Step 4: Compose Frost after the special overlay**

Import `drawPixelFrostOverlay` and append to `drawShot()`:

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
- Consumes `state.enduranceAtmosphere` and `state.enduranceWeather` from Task 3.
- Produces independent time-of-day + weather crossfades.
- Fabric cache key remains `world:timeOfDay:weather:boss`.

- [ ] **Step 1: Write RED renderer/background contracts**

```js
assert.match(enduranceRendererSource, /enduranceWeather/);
assert.match(backgroundFabricSource, /weather === 'snow'/);
assert.match(backgroundFabricSource, /weather === 'frost'/);
assert.match(backgroundRuntimeSource, /drawPixelSnow/);
assert.match(backgroundRuntimeSource, /drawPixelFrostAmbience/);

const base = { world: 'meadow', atmosphere: { timeOfDay: 'day', weather: 'clear' } };
const keys = ['clear', 'rain', 'snow', 'frost'].map((weather) => backgroundThemeKey({ ...base, atmosphere: { ...base.atmosphere, weather } }));
assert.equal(new Set(keys).size, 4);
```

- [ ] **Step 2: Run RED**

```bash
node endurance-renderer.test.mjs
node background-fabric.test.mjs
```

Expected: FAIL on missing weather composition.

- [ ] **Step 3: Make static Fabric palettes weather-aware**

Add after existing storm/overcast handling in `paletteFor(level)`:

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

- [ ] **Step 4: Add deterministic snow/frost runtime overlays**

In `src/background-fabric-runtime.mjs` add:

```js
function drawPixelSnow(ctx, time, width, height, intensity) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = '#f1fbff';
  const count = 34;
  for (let i = 0; i < count; i += 1) {
    const speed = .018 + (i % 4) * .004;
    const x = Math.round(((i * 43 + time * speed + Math.sin(time * .0007 + i) * 5) % (width + 20)) - 10);
    const y = Math.round(((i * 67 + time * speed * 1.7) % (height + 24)) - 12);
    ctx.globalAlpha = baseAlpha * (.24 + intensity * .24 + (i % 3) * .04);
    const size = i % 7 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawPixelFrostAmbience(ctx, time, width, height, intensity) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = '#d9f7ff';
  for (let i = 0; i < 18; i += 1) {
    const phase = Math.sin(time * .003 + i * 1.7);
    if (phase < .25) continue;
    const x = (i * 53 + 11) % width;
    const y = 44 + ((i * 37) % Math.max(1, height - 70));
    ctx.globalAlpha = baseAlpha * (.08 + intensity * .12) * phase;
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
    if (i % 5 === 0) ctx.fillRect(x, y - 1, 1, 3);
  }
  ctx.restore();
}
```

Route in `drawWeather()`:

```js
if (weather === 'snow') drawPixelSnow(ctx, time, width, height, intensity);
if (weather === 'frost') drawPixelFrostAmbience(ctx, time, width, height, intensity);
```

- [ ] **Step 5: Refactor Endurance sky composition for two independent transitions**

Change `ENDURANCE_SKIES` to time-of-day only:

```js
const ENDURANCE_SKIES = [
  { world: 'meadow', atmosphere: { timeOfDay: 'day', intensity: .15 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'late-day', intensity: .35 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'sunset', intensity: .55 } },
];
```

Add:

```js
function skyWithWeather(base, weather) {
  const intensity = weather === 'rain' ? .45 : weather === 'snow' ? .35 : weather === 'frost' ? .32 : base.atmosphere.intensity;
  return { ...base, atmosphere: { ...base.atmosphere, weather, intensity } };
}
```

Extract the current time crossfade body into:

```js
drawTimeSky(enduranceAtmosphere, weather, time) {
  const stage = Math.max(0, Math.min(ENDURANCE_SKIES.length - 1, Math.floor(Number(enduranceAtmosphere.stage) || 0)));
  const fromStage = Math.max(0, Math.min(stage, Math.floor(Number(enduranceAtmosphere.fromStage) || 0)));
  const progress = Math.max(0, Math.min(1, Number(enduranceAtmosphere.progress) || 0));
  const toSky = skyWithWeather(ENDURANCE_SKIES[stage], weather);
  const fromSky = skyWithWeather(ENDURANCE_SKIES[fromStage], weather);
  if (stage === fromStage || progress >= 1) return this.drawSky(toSky, time);
  this.ctx.save(); this.ctx.globalAlpha *= 1 - progress; this.drawSky(fromSky, time); this.ctx.restore();
  this.ctx.save(); this.ctx.globalAlpha *= progress; this.drawSky(toSky, time); this.ctx.restore();
}
```

Then implement:

```js
drawEnduranceSky(enduranceAtmosphere = {}, enduranceWeather = {}, time = 0) {
  const current = enduranceWeather.current || 'clear';
  const previous = enduranceWeather.previous || current;
  const progress = Math.max(0, Math.min(1, Number(enduranceWeather.progress) || 0));
  if (previous === current || progress >= 1) return this.drawTimeSky(enduranceAtmosphere, current, time);
  this.ctx.save(); this.ctx.globalAlpha *= 1 - progress; this.drawTimeSky(enduranceAtmosphere, previous, time); this.ctx.restore();
  this.ctx.save(); this.ctx.globalAlpha *= progress; this.drawTimeSky(enduranceAtmosphere, current, time); this.ctx.restore();
}
```

In `draw()` call:

```js
this.drawEnduranceSky(state.enduranceAtmosphere, state.enduranceWeather, time);
```

- [ ] **Step 6: Verify GREEN**

```bash
node endurance-renderer.test.mjs
node background-fabric.test.mjs
node endurance-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

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
- Produces DOM `#enduranceWeatherBadge`, hidden outside Endurance.

- [ ] **Step 1: Add RED UI/style contracts**

```js
assert.match(indexSource, /id="enduranceWeatherBadge"/);
assert.match(appSource, /onEnduranceWeather/);
assert.match(appSource, /weatherBadgeLabel/);
assert.match(appSource, /snapshot\.weather/);
assert.match(css, /\.endurance-weather-badge/);
assert.match(css, /data-weather="frost"/);
```

- [ ] **Step 2: Run RED**

```bash
node endurance-ui.test.mjs
node endurance-style.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Add the badge without adding a fifth primary stat**

In `index.html`, near the title/score block:

```html
<span class="endurance-weather-badge" id="enduranceWeatherBadge" data-weather="clear" hidden aria-live="polite">☀ CLEAR</span>
```

- [ ] **Step 4: Wire badge state and callouts in `src/app.mjs`**

Import `weatherBadgeLabel`, add the ref, and in `createEnduranceGame()`:

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

In `showMap()` and campaign `startLevel()`:

```js
refs.enduranceWeatherBadge.hidden = true;
refs.enduranceWeatherBadge.dataset.weather = 'clear';
refs.enduranceWeatherBadge.textContent = '☀ CLEAR';
```

Extend `flashCallout()` cleanup:

```js
refs.comboCallout.classList.remove('is-visible', 'is-special-ready', 'is-endurance-stage', 'is-weather');
```

- [ ] **Step 5: Add compact desktop/mobile/reduced-motion CSS**

Use:

```css
.endurance-weather-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 6px;
  border: 1px solid rgba(239,248,250,.75);
  background: rgba(12,31,42,.72);
  box-shadow: 2px 2px 0 rgba(5,18,26,.34);
  font-size: 10px;
  line-height: 1;
  letter-spacing: .04em;
  white-space: nowrap;
  pointer-events: none;
}
.endurance-weather-badge[hidden] { display: none; }
.endurance-weather-badge[data-weather="rain"] { border-color: #8fb7cf; }
.endurance-weather-badge[data-weather="snow"] { border-color: #edf7f8; }
.endurance-weather-badge[data-weather="frost"] { border-color: #a9eaff; box-shadow: 2px 2px 0 rgba(5,18,26,.34), 0 0 0 1px rgba(185,242,255,.18); }
@media (max-width: 430px) {
  .endurance-weather-badge { padding: 2px 4px; font-size: 9px; max-width: 72px; overflow: hidden; text-overflow: ellipsis; }
}
@media (prefers-reduced-motion: reduce) {
  .endurance-weather-badge { transition: none !important; }
}
```

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

**Interfaces:**
- Consumes Task 2 weather scheduler and Task 1 `projectileCollisionDistance()`.
- Produces: `frostCandidateConfigs()` for `.76`, `.82`, `.88`, `1.00`.
- Produces: `runFrostMatrix(...)`, separate from the existing baseline matrix.
- Adds per-run metrics: `scorePerMinute`, `frostShare`, `frostShots`, `frostOnlyGapShots`.

- [ ] **Step 1: Write RED Frost-study tests**

Add imports and assertions:

```js
const frostConfigs = frostCandidateConfigs();
assert.deepEqual(frostConfigs.map((item) => item.frostCollisionScale), [.76, .82, .88, 1]);

const frostA = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
const frostB = runFrostMatrix({ runs: 3, seed: 991, profiles: ['average'], maxSeconds: 180 });
assert.deepEqual(frostA, frostB);
for (const run of frostA.runs) {
  assert.ok(run.frostShare >= 0 && run.frostShare <= .401);
  assert.ok(run.scorePerMinute >= 0);
  assert.ok(run.frostShots >= 0);
  assert.ok(run.frostOnlyGapShots >= 0 && run.frostOnlyGapShots <= run.frostShots);
}
```

- [ ] **Step 2: Run RED**

```bash
node endurance-balance.test.mjs
```

Expected: FAIL on missing Frost APIs/metrics.

- [ ] **Step 3: Add Frost configs without changing the old matrix**

```js
export function frostCandidateConfigs() {
  return [.76, .82, .88, 1].map((frostCollisionScale) => ({
    id: `frost-${frostCollisionScale.toFixed(2)}`,
    frostCollisionScale,
  }));
}
```

Leave `candidateConfigs()` and old baseline IDs unchanged.

- [ ] **Step 4: Add a deterministic direct-corridor helper for relative Frost access**

Import `projectileCollisionDistance` and add:

```js
function directCorridorClear({ grid, geometry, targetC, targetR, collisionScale = 1 }) {
  const startX = geometry.LW / 2;
  const startY = geometry.LAUNCH_Y;
  const targetX = geometry.colX(targetC, targetR);
  const targetY = geometry.rowY(targetR);
  const dx = targetX - startX;
  const dy = targetY - startY;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.ceil(distance / 3));
  const threshold = projectileCollisionDistance(geometry.RAD, collisionScale);
  const targetKey = geometry.key(targetC, targetR);

  for (let i = 1; i < steps - 1; i += 1) {
    const t = i / steps;
    const x = startX + dx * t;
    const y = startY + dy * t;
    for (const key of grid.keys()) {
      if (key === targetKey) continue;
      const [c, r] = geometry.split(key);
      if (geometry.dist(x, y, geometry.colX(c, r), geometry.rowY(r)) <= threshold) return false;
    }
  }
  return true;
}
```

When selecting candidates in the Frost study, filter to direct corridors clear at the active scale. If none exist, fall back to existing candidate selection so the simulator remains total. Record:

```js
const clearsFrost = directCorridorClear({ ...args, collisionScale });
const clearsNormal = directCorridorClear({ ...args, collisionScale: 1 });
const frostOnly = weather === 'frost' && clearsFrost && !clearsNormal;
```

- [ ] **Step 5: Advance the same weather scheduler used by production**

Create a dedicated weather RNG with a deterministic salt and initialize `createEnduranceWeatherState()`. Before each simulated shot, advance weather to the new `elapsedMs`, then derive active collision scale from `weatherShotMetadata()` with the candidate override:

```js
const weatherMeta = weatherShotMetadata(weatherState.current, { ...ENDURANCE_WEATHER_CONFIG, frostCollisionScale: frostConfig.frostCollisionScale });
```

Accumulate Frost time from phase overlaps rather than counting shots. For each elapsed interval `[beforeMs, elapsedMs]`, add only the portion during which `weatherState.current === 'frost'` before/after crossed transitions; use the scheduler's `changes[].atMs` boundaries so the result is deterministic.

- [ ] **Step 6: Add per-run and summary metrics**

Per run:

```js
scorePerMinute: survivalMs > 0 ? Number((score / (survivalMs / 60000)).toFixed(2)) : 0,
frostShare: survivalMs > 0 ? Number((frostActiveMs / survivalMs).toFixed(4)) : 0,
frostShots,
frostOnlyGapShots,
```

Summary:

```js
medianScorePerMinute: Number(quantile(items.map((item) => item.scorePerMinute), .5).toFixed(2)),
meanFrostShare: Number(mean(items.map((item) => item.frostShare)).toFixed(4)),
meanFrostOnlyGapRate: Number(mean(items.map((item) => item.frostShots ? item.frostOnlyGapShots / item.frostShots : 0)).toFixed(4)),
```

Add CLI handling so:

```bash
node tools/endurance-balance.mjs --frost-study --runs 250 --seed 1337 --output artifacts/endurance-weather-balance
```

writes `artifacts/endurance-weather-balance.json` and `.md`, leaving old baseline output behavior unchanged when `--frost-study` is absent.

- [ ] **Step 7: Verify GREEN**

```bash
node endurance-balance.test.mjs
node --check tools/endurance-balance.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tools/endurance-balance.mjs endurance-balance.test.mjs
git commit -m "test: add Frost balance study"
```

---

### Task 8: Expand Endurance browser smoke for shallow aim and all weather states

**Files:**
- Modify: `.github/scripts/endurance-smoke.mjs`

**Interfaces:**
- Uses existing `window.__enduranceGame` probe.
- Adds no production-only test hooks.
- Produces screenshots for clear, rain, snow, frost and shallow-angle aiming.

- [ ] **Step 1: Extend browser snapshot data**

Add:

```js
weather: snapshot.weather,
weatherProgress: snapshot.weatherTransitionProgress,
aimAngle: game.aimAngle,
projectile: game.projectile ? {
  weatherType: game.projectile.weatherType,
  collisionScale: game.projectile.collisionScale,
  color: game.projectile.color,
} : null,
```

- [ ] **Step 2: Verify pointer aim reaches both clamp limits**

After `openEndurance()`, get the canvas box and map logical points to CSS coordinates:

```js
const box = await page.locator('#gameCanvas').boundingBox();
const toClient = (x, y) => ({ x: box.x + x / 240 * box.width, y: box.y + y / 320 * box.height });
const right = toClient(239, 284);
await page.mouse.move(right.x, right.y);
let aim = (await runtimeSnapshot(page)).aimAngle;
assert(Math.abs(aim - (-.18)) < .03, `right shallow aim ${aim}`);
const left = toClient(1, 284);
await page.mouse.move(left.x, left.y);
aim = (await runtimeSnapshot(page)).aimAngle;
assert(Math.abs(aim - (-Math.PI + .18)) < .03, `left shallow aim ${aim}`);
```

Save `artifacts/endurance-weather-shallow-aim.png`.

- [ ] **Step 3: Force visual weather states through the probed instance only**

For each target in `['clear','rain','snow','frost']`:

```js
await page.evaluate((target) => {
  const game = window.__enduranceGame;
  game.weatherState = {
    ...game.weatherState,
    previous: game.weatherState.current,
    current: target,
    transitionStartedMs: game.elapsedMs,
    transitionDurationMs: 2200,
  };
  game.emitState();
}, target);
```

Assert `#enduranceWeatherBadge` is visible, has matching `data-weather`, and expected text. After setting `game.elapsedMs += 1100` and `emitState()`, assert transition progress is between 0 and 1. Save:

```txt
artifacts/endurance-weather-clear.png
artifacts/endurance-weather-rain.png
artifacts/endurance-weather-snow.png
artifacts/endurance-weather-frost.png
```

- [ ] **Step 4: Verify real Frost transition callout and frozen projectile metadata**

Drive a real transition by placing the current phase one millisecond from expiry and ensuring the deterministic next candidate can become Frost. If the current seeded next state is not Frost, cross phases until Frost appears, with a hard cap of 8 transitions:

```js
await page.evaluate(() => {
  const game = window.__enduranceGame;
  for (let i = 0; i < 8 && game.weatherState.current !== 'frost'; i += 1) {
    game.elapsedMs = game.weatherState.phaseEndsMs - 1;
    game.update(.001);
  }
  if (game.weatherState.current !== 'frost') throw new Error('seed did not reach Frost within 8 phases');
  game.queue = [{ type: 'normal', color: 2 }, ...game.queue.slice(1)];
  game.projectile = null;
  game.shoot();
});
await page.waitForFunction(() => document.querySelector('.combo-callout')?.textContent?.includes('MRÓZ'));
let frostShot = await runtimeSnapshot(page);
assert(frostShot.projectile.color === 2);
assert(frostShot.projectile.weatherType === 'frost');
assert(Math.abs(frostShot.projectile.collisionScale - .82) < 1e-9);
await page.evaluate(() => { window.__enduranceGame.weatherState.current = 'clear'; window.__enduranceGame.emitState(); });
frostShot = await runtimeSnapshot(page);
assert(Math.abs(frostShot.projectile.collisionScale - .82) < 1e-9, 'mid-flight thaw changed projectile scale');
```

- [ ] **Step 5: Verify Guide and real collision agree in a crafted narrow-gap case**

Inside `page.evaluate()`, replace grid temporarily with two occupied orbs positioned so a test point is between normal and Frost thresholds, then compare `game.collides(x, y, 1)` and `game.collides(x, y, .82)`. Restore the grid afterward:

```js
const gap = await page.evaluate(() => {
  const game = window.__enduranceGame;
  const original = game.grid;
  const B = game.B;
  game.grid = new Map([[B.key(0, 4), 1], [B.key(2, 4), 2]]);
  const x = (B.colX(0, 4) + B.colX(2, 4)) / 2;
  const y = B.rowY(4);
  const result = { normal: game.collides(x, y, 1), frost: game.collides(x, y, .82) };
  game.grid = original;
  return result;
});
assert(gap.normal === true && gap.frost === false, `crafted Frost gap mismatch ${JSON.stringify(gap)}`);
```

The Node runtime test from Task 3 already verifies Guide selects `.82`; this browser check verifies the browser uses the same scale-aware collision helper.

- [ ] **Step 6: Preserve existing Endurance smoke checks and mobile layout**

Keep all current fixed 11/10, miss-row, drop-only success, 60/120 color stages, specials, loss/retry and 390×844 overflow checks. Add:

```js
assert(await page.locator('#enduranceWeatherBadge').isVisible(), 'mobile weather badge should be visible');
```

and keep horizontal overflow `<= 1px`.

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
- No gameplay file is changed unless verification exposes a real defect or the Frost study requires changing only `ENDURANCE_WEATHER_CONFIG.frostCollisionScale`.
- Update PR #2 body/comment with final evidence.
- Generate `artifacts/endurance-weather-balance.json`, `.md`, and browser PNGs.

**Interfaces:**
- Consumes all previous tasks.
- Produces final exact-head SHA, CI run ID, balance verdict, screenshot artifact evidence and pinned preview link.

- [ ] **Step 1: Run the full Node suite from `.github/workflows/ci.yml`**

Run all CI commands; the new/critical subset is:

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

Inspect `.76`, `.82`, `.88`, `1.00`. Keep `.82` unless it materially violates the spec: Frost share >40%, pressure becomes trivial, or Frost-only gap benefit is negligible. If scale changes, update only the weather config + matching tests, rerun this study and record the data-backed reason.

- [ ] **Step 3: Run all browser smoke**

```bash
node .github/scripts/visual-smoke.mjs
node .github/scripts/queue-smoke.mjs
node .github/scripts/endurance-smoke.mjs
```

Expected: all PASS.

- [ ] **Step 4: Manually inspect weather/aiming screenshots**

Inspect:

```txt
artifacts/endurance-weather-shallow-aim.png
artifacts/endurance-weather-clear.png
artifacts/endurance-weather-rain.png
artifacts/endurance-weather-snow.png
artifacts/endurance-weather-frost.png
artifacts/mobile-endurance-v2.png
```

Reject the build if Frost hides color/special identity, weather obscures aiming, or the badge crowds mobile HUD.

- [ ] **Step 5: Verify exact-head GitHub Actions**

Wait for both `test` and `browser-smoke` jobs on the exact final SHA and record run ID + screenshot artifact ID/digest.

- [ ] **Step 6: Update PR #2 evidence without merging**

Add:

```md
### Endurance dynamic weather
- pointer/touch/keyboard aiming reaches the existing ~10.3° clamp
- seeded Endurance-only Clear/Rain/Snow/Frost phases
- Frost snapshots reduced in-flight collision scale; board/snap geometry remains standard
- Guide prediction uses the same collision scale as the real shot
- Fabric pixel-art weather crossfades + compact HUD badge
- Frost balance study: .76/.82/.88/1.00, 250 runs/profile/config
- exact-head CI: <SHA / run ID / artifact evidence>
```

Keep PR #2 draft/open/unmerged.

- [ ] **Step 7: Verify branch safety**

Confirm `main` is still `220266acdbf313e9d0b656dfd83f945bf56cf29c` unless changed independently by the user, and verify this work did not advance `playable`.

- [ ] **Step 8: Final handoff**

Provide a rawcdn/githack link pinned to the exact verified SHA plus the Frost balance report and screenshot archive. Do not claim completion until exact-head `test` and `browser-smoke` are both green.
