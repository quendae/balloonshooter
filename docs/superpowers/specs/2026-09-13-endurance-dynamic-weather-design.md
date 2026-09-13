# Endurance Dynamic Weather + Wide-Angle Aiming Design

Date: 2026-09-13
Branch: `feat/endurance-mode`
Scope: Endurance only for weather mechanics; aiming fix applies to shared aiming input because the current input gate is the root cause, while campaign authored level content/weather rules remain otherwise unchanged.

## Goals

1. Remove the practical ~45° aiming floor caused by the pointer/touch input gate and expose the existing ~10° physical aim clamp to the player.
2. Add seeded, dynamic weather phases to Endurance only.
3. Make Frost mechanically meaningful by letting freshly fired icy shots pass through tighter gaps via a reduced collision radius in flight.
4. Keep shot color readable and keep board/snap geometry unchanged.
5. Preserve existing Endurance color progression, scoring, pressure-row rules, specials, Fabric.js backgrounds, and campaign balance.

## Non-goals

- No dynamic weather system in campaign.
- No wind that bends Endurance shots in this version.
- No hail.
- No permanent freezing of already placed board orbs.
- No changed hex-grid spacing or placed-orb radius.
- No new seventh color or new post-120-second difficulty rule.

## 1. Aiming range

### Current problem

`clampAimAngle()` already allows roughly 10.3° from horizontal (`0.18 rad`) on either side. The practical restriction comes from `MIN_AIM_Y = 242` in `src/game.mjs`: pointer/touch input is ignored once the cursor gets too close to the launcher at `LAUNCH_Y = 288`, which prevents the player from reaching the shallow angles the physics already supports.

### Required behavior

- Pointer and touch aiming may extend down to just above the launcher line instead of stopping at Y=242.
- The final authority remains `clampAimAngle()` at approximately 10° from horizontal on both sides.
- Keyboard aiming uses the same clamp.
- Guide trajectory prediction uses the same range and the same collision rules as the actual projectile.
- The launcher-area exclusion should only prevent accidental clicks directly on/below the launcher, not block shallow legitimate aim vectors.

A practical baseline is an input floor near `LAUNCH_Y - 3..6 logical px`, with tests asserting that pointer coordinates can produce angles at or very near the clamp limit.

## 2. Endurance weather states

Endurance gets a separate seeded weather state machine. Campaign themes and authored campaign weather remain unchanged.

Initial weather: `clear`.

Weather states:

- `clear` — neutral gameplay.
- `rain` — visual/atmospheric only in v1.
- `snow` — visual/atmospheric only in v1.
- `frost` — visual plus reduced in-flight projectile collision radius.

The weather state machine is independent from Endurance palette progression. The existing 4 -> 5 -> 6 color thresholds at 60 s / 120 s remain unchanged.

## 3. Weather timing and determinism

- The first weather transition occurs after a deterministic seeded duration sampled from 25–35 seconds of active Endurance time.
- Subsequent phases last a deterministic seeded 25–40 seconds.
- Pausing freezes weather timers exactly like other Endurance active-time systems.
- The same Endurance seed must produce the same weather sequence and phase durations.
- A weather state may not repeat immediately.
- `frost` may not repeat immediately.
- The scheduler should constrain Frost so it does not dominate a typical run; target Frost occupancy is at most roughly 35–40% of active play time.
- Weather changes should not mutate a projectile that is already in flight. Shot physics are snapshotted when the shot is fired.

Suggested state-machine API shape:

```js
{
  current: 'clear',
  previous: null,
  phaseStartedMs: 0,
  phaseEndsMs: 31_000,
  transitionStartedMs: null,
  transitionDurationMs: 2_200,
}
```

The exact internal representation may differ as long as the observable rules above hold.

## 4. Frost projectile mechanics

### Baseline

`frostCollisionScale = 0.82`.

The scale applies only while the projectile is flying.

Normal shot collision radius:

```txt
1.00 × existing projectile-vs-orb collision radius
```

Frost shot collision radius:

```txt
0.82 × existing projectile-vs-orb collision radius
```

### Important constraints

- Wall collision behavior stays unchanged.
- Board orbs keep their normal size.
- Snap/placement after contact uses the existing standard grid/snap geometry.
- The reduced radius affects only whether the moving projectile intersects an occupied orb on its path.
- Frost therefore creates new line-of-sight possibilities through narrow openings without changing the board topology.
- The active weather state is copied onto the shot at fire time, e.g. `{ weatherType: 'frost', collisionScale: 0.82 }`.
- If Frost ends while that shot is flying, the shot remains icy until it lands.
- If Frost begins while a normal shot is flying, that shot remains normal.

## 5. Guide consistency

Guide must predict the exact physics of the shot it represents.

- A Guide fired during Frost uses the same `collisionScale = 0.82` in trajectory collision checks.
- A non-Frost Guide uses `1.00`.
- The preview must not show a path through a gap that the actual projectile would collide with, or vice versa.

This requires collision helpers used by real projectile flight and trajectory prediction to accept the same effective collision scale.

## 6. Frost visuals and readability

Do not recolor the whole orb white/blue.

The underlying shot color must remain obvious. Frost is shown as an overlay:

- thin pale-blue pixel-art rim,
- 3–4 small ice crystals / shard pixels around the outer edge,
- subtle icy glint/pulse,
- same overlay visible on the active launcher shot, queue preview, and projectile.

Bomb/Rainbow/Guide identities remain recognizable. If a special shot is fired during Frost, the frost treatment should augment rather than erase the special treatment.

Weather callouts:

- entering Frost: `MRÓZ — mniejsza kolizja pocisków`
- leaving Frost for a non-Frost state: `ODWILŻ — normalna wielkość pocisków`

Other weather changes may use short labels such as `DESZCZ`, `ŚNIEG`, `POGODNIE` without explanatory gameplay text because they are visual-only in v1.

## 7. Weather HUD

Do not add another full Endurance HUD stat column.

Add a compact pixel-style weather badge near the existing top HUD, for example:

- `☀ CLEAR`
- `☂ RAIN`
- `❄ SNOW`
- `❄ FROST`

The badge changes with a short non-blocking transition and must remain readable on desktop and 390×844 mobile.

The primary Endurance HUD remains exactly:

- Wynik
- Combo
- Czas
- Kolory

The weather badge is supplemental status, not a fifth primary stat.

## 8. Fabric.js / background integration

Use the existing Fabric.js pixel-background system.

- Cached background themes remain keyed by world/time-of-day/weather/boss as appropriate.
- Endurance weather supplies `clear`, `rain`, `snow`, or `frost` atmosphere data to the background system.
- Weather transitions crossfade over about 2.2 seconds.
- Existing Endurance time-of-day transition (`day -> late-day -> sunset`) remains active and independent.
- Crossfades must compose cleanly when a weather transition happens near a palette/time-of-day transition.
- Dynamic overlays (rain, snow, fog-like frost ambience if used) remain runtime effects rather than forcing a Fabric scene rebuild every frame.
- If Fabric is unavailable, the existing fallback renderer must still work.

Visual direction:

- `clear`: current bright pixel-art base.
- `rain`: darker cloud layer, pixel rain overlay, slightly cooler scene.
- `snow`: cooler sky/terrain treatment, sparse pixel snow.
- `frost`: crisp cold tint plus sparse glitter/ice ambience; avoid washing out orb colors.

## 9. Endurance runtime integration

Endurance owns the dynamic weather scheduler.

Expected runtime additions include:

- current weather type,
- current weather phase timing,
- transition progress,
- deterministic weather RNG/state,
- per-shot `collisionScale` snapshot,
- optional weather transition/callout bookkeeping.

`EnduranceGame.getSnapshot()` should expose enough weather state for HUD/tests, e.g.:

```js
{
  weather: 'frost',
  weatherPhaseEndsMs: 92_400,
  weatherTransitionProgress: 1,
}
```

The precise field names are implementation details, but tests and UI must not need to inspect private internals.

## 10. Collision architecture

Avoid duplicating projectile collision math.

Refactor toward a shared collision predicate/helper used by:

- actual projectile flight,
- short aim preview,
- Guide full trajectory preview.

The helper should accept an effective projectile collision scale. Board-orb positions and geometry remain unchanged.

The current campaign behavior remains the default by passing `1.00`.

## 11. Balance validation

Extend the deterministic Endurance balance harness with Frost support.

Evaluate at least:

- `0.76`
- `0.82` baseline
- `0.88`
- `1.00` control

Keep all other selected Endurance v2 baseline parameters fixed during this study.

Measure at minimum:

- median survival time per player profile,
- score/minute,
- miss rate,
- rows added,
- best combo distribution,
- fraction of active time spent in Frost,
- count/rate of Frost shots that successfully use a path that would have collided at 1.00 scale.

Success criteria:

- Frost is measurably useful but not dominant.
- Average-player survival should not jump enough to trivialize pressure.
- Frost occupancy should remain below the intended ~35–40% ceiling in normal-length runs.
- `0.82` remains the preferred default unless the data shows it is materially too weak or too strong.

## 12. Tests

### Unit / deterministic tests

Add or extend tests for:

- pointer/touch input can reach approximately 10° from horizontal;
- keyboard still clamps to the same minimum angle;
- seeded weather sequence and durations are reproducible;
- no immediate weather repeat;
- no back-to-back Frost;
- Frost occupancy guard;
- pause freezes weather phase timing;
- projectile snapshots current weather at fire time;
- weather changing mid-flight does not mutate that projectile;
- normal projectile uses collision scale 1.00;
- Frost uses 0.82;
- Frost can pass a crafted narrow gap where 1.00 collides;
- snap after Frost flight uses normal grid geometry;
- Guide trajectory and real projectile agree for both 1.00 and 0.82 collision scales;
- campaign projectile collision remains unchanged;
- weather badge reflects current state;
- Fabric theme/crossfade integration supports rain/snow/frost and fallback.

### Browser smoke

Endurance smoke should verify:

- shallow aiming near both 10° limits is possible with pointer input;
- weather badge changes;
- deterministic forced/test-seam transitions can reach rain, snow and frost without waiting minutes;
- Frost overlay preserves shot color in launcher/queue/projectile;
- Frost explanatory callout appears;
- weather transition does not block shooting;
- day/late-day/sunset still transitions correctly;
- desktop and 390×844 remain free of horizontal overflow;
- campaign smoke remains green.

Browser screenshots should include at least clear, rain, snow, frost, and a shallow-angle aiming case.

## 13. CI / completion criteria

Before declaring complete:

1. Run the full Node regression suite.
2. Run syntax checks for all new/changed modules.
3. Run campaign, queue, and Endurance browser smoke.
4. Run the Frost balance matrix and inspect its report.
5. Inspect weather/aiming screenshots manually.
6. Verify PR exact head.
7. Keep PR #2 draft/unmerged unless explicitly requested otherwise.
8. Do not advance `main` or `playable` without explicit user instruction.

## 14. Compatibility and fallback

- Existing campaign authored themes/weather remain unchanged.
- Existing campaign wind/lightning behavior remains unchanged.
- Existing Endurance scoring, row-pressure rule, color thresholds, special schedule, records, and save schema remain unchanged unless weather state needs transient runtime-only data.
- No save migration is required for transient weather state.
- Fabric failure falls back to the previous renderer.
- Reduced-motion should reduce or remove purely decorative weather transitions/particles without changing gameplay timing or Frost physics.
