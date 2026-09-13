# Endurance v2 — design

Date: 2026-09-13
Branch: `feat/endurance-mode`
Scope: redesign only the Endurance mode loop, presentation, persistence, and balancing harness. Campaign and `balloon.html` classic mode remain unchanged.

## Goal

Simplify Endurance around one clear pressure rule: **a resolved shot that removes nothing adds a full pressure row**. Remove round-based pressure and timed spatial expansion. Long-term difficulty comes from palette growth at 60 s and 120 s, while score pressure comes from maintaining successful-shot streaks.

The redesign must keep the mode immediately readable, preserve the existing classic-orb visual identity, and make special shots recognizable without needing to decode a tiny icon.

## Core gameplay loop

Endurance starts with a fixed 11/10-column hex board. The board no longer expands spatially during the run.

- Even rows: 11 columns.
- Odd rows: 10 columns.
- Orb radius is derived from this fixed geometry and is approximately 10% smaller than the previous 10/9-column start.
- The active projectile and queued shots use the same geometry-derived scale so the launcher area does not show oversized projectiles relative to the field.
- The top row visually touches the ceiling. There must be no apparent gap suggesting that a projectile can pass above the top row.
- Initial occupied rows remain a small opening stack; the exact count is a tunable balance parameter, not a gameplay rule.

A shot is evaluated only after all pop and drop resolution is complete.

- If `popped + dropped > 0`, the shot is successful and no row is added.
- If `popped + dropped === 0`, the shot is a miss: the whole board shifts down by one row and a new full generated row is inserted at the ceiling.
- This rule applies identically to normal, Bomb, Rainbow, and Guide shots. Only the final resolved result matters.
- A shot that pops nothing directly but causes detached orbs to fall counts as successful because `dropped > 0`.
- Loss occurs when the shifted/generated structure reaches the launcher failure line or cannot be represented safely inside the fixed logical capacity.
- Clearing the board never ends the run. It awards a one-time clear bonus for that empty-board event and the run continues.

There is no concept of a round in Endurance v2.

## Difficulty progression

The run starts with four colors.

- `0–59.999 s`: 4 active colors.
- `60–119.999 s`: 5 active colors.
- `120 s+`: 6 active colors.

After 120 s no additional color and no new mandatory difficulty mechanic is introduced. Difficulty continues naturally through the six-color board state and the miss-equals-row rule.

When a new palette stage begins:

1. Existing orbs keep their colors.
2. The new color becomes eligible for newly generated pressure rows.
3. The new color becomes eligible for subsequently generated normal shots.
4. Queued normal shots are reconciled so the queue remains playable, without rewriting already launched projectiles.
5. The background transitions to the next atmosphere state.
6. A short non-modal `NOWY KOLOR` callout is shown.

Palette stage timing is active-play time and pauses while the game is paused.

## Background progression

Replace timed spatial zoom with visual atmosphere progression tied to the two palette milestones.

Stage 0, 0–60 s: bright calm daytime meadow/sky.

Stage 1, 60–120 s: later afternoon, more cloud movement and slightly richer contrast.

Stage 2, 120 s+: sunset or more dramatic sky, deeper but still readable colors and somewhat faster ambient movement.

Transitions should crossfade over roughly 1.2–1.8 seconds. Gameplay continues during the transition. Background transitions must not darken the playfield enough to reduce orb readability.

The renderer should receive an Endurance atmosphere stage/progress value rather than mutating campaign level definitions.

## Score, streak, and HUD

Remove round-based multipliers, round survival bonuses, and round-related state.

Scoring keeps the existing base pop/drop calculation, then adds a success-streak multiplier/bonus driven by consecutive resolved shots with `popped + dropped > 0`.

- Successful shot: streak increments.
- Miss: streak resets to zero and inserts one pressure row.
- Clear bonus remains and may be scaled by a modest streak-derived factor if needed during balancing, but must remain bounded.
- There is no hard survival multiplier based on elapsed time or a hidden round counter.

The initial implementation should favor a simple bounded streak multiplier rather than a complex formula. Exact multiplier steps are balance parameters and must be exposed in the Endurance config so the balance harness can compare them.

HUD becomes:

- `Wynik`
- `Combo`
- `Czas`
- `Kolory`

Remove `Runda` and `Do rzędu` everywhere from runtime state, UI, result dialog, and tests.

Persistent Endurance records become:

- `bestScore`
- `bestTimeMs`
- `bestCombo`

Existing saves containing `bestRound` must migrate safely. The localStorage key remains unchanged. Migration must preserve existing score/time records and may ignore the obsolete round value after schema normalization.

Result dialog shows score, time, best combo, total shots, misses/rows added, and new-record indicators. It does not show campaign stars, mastery, or Next.

## Pressure-row generation

Pressure-row generation remains deterministic for a given run seed.

Generated rows must:

- use only the currently unlocked palette;
- fill the entire current 11/10 top row;
- avoid generating an immediate free horizontal 3+ match inside the new row where practical;
- preserve valid hex support/connectivity after the shift;
- alternate row phase correctly when the board shifts.

Row insertion must be atomic from the player's perspective: resolve shot, update score/streak, then shift and insert if the shot was a miss, then evaluate loss.

## Special shots: mechanics

Keep the existing first-pass mechanics of the three specials.

- **Bomb**: area-destruction special using the current Bomb resolver.
- **Rainbow**: color-flexible special using the current Rainbow resolver.
- **Guide**: normal-color shot with full deterministic trajectory visualization.

Do not add new special mechanics in this redesign. Balance work may tune spawn cadence after measuring their real value.

Special scheduling must remain deterministic, must not issue specials back-to-back, and must be parameterized in Endurance config. Initial target cadence: first special around 10–12 resolved shots, then roughly every 7–9 resolved shots. The balance harness decides whether that range should move.

## Special shots: visual language

Specials must be recognizable as distinct shot classes at a glance, not merely normal orbs with small overlay icons.

### Bomb

- dark body/outer shell;
- strong yellow/orange luminous core or fuse accent;
- heavier outline than a normal orb;
- subtle pulse or fuse flicker while queued/active.

### Rainbow

- clearly segmented multi-color body;
- animated shimmer/highlight across the orb;
- silhouette remains circular and consistent with the classic-orb set.

### Guide

- pale technical body treatment;
- pulsing targeting ring/corner marks;
- subtle trajectory motif while active;
- full deterministic trajectory remains its primary gameplay signal.

Special visual treatments must render consistently in three places: active launcher shot, next-shot queue, and projectile in flight. Scale-dependent detail may be simplified for small queue previews, but type recognition must remain clear.

When a special becomes the active shot, show a compact callout above the launcher for about 1.5 seconds:

- `BOMB — niszczy obszar`
- `RAINBOW — dopasowuje kolor`
- `GUIDE — pokazuje pełną trajektorię`

The callout is non-modal and must not block input. Repeated callouts for the same type may be rate-limited so quick successive specials do not spam the playfield.

## Architecture changes

Prefer a cleanup rather than preserving dead expansion state.

### `src/endurance-core.mjs`

Owns fixed Endurance config and pure rules:

- palette thresholds at 60/120 s;
- streak multiplier calculation;
- deterministic special schedule;
- deterministic generated-row logic;
- record migration/update helpers.

Remove round and timed expansion helpers from active Endurance behavior.

### `src/endurance-geometry.mjs`

Owns one fixed 11/10 geometry plus row-phase shifting and failure-line logic.

Remove spatial-stage growth/remap behavior from active use. The geometry should expose a top-row Y position where orb radius touches the ceiling boundary visually.

### `src/endurance-game.mjs`

Owns runtime state:

- elapsed active time;
- resolved shots;
- current success streak / best combo;
- miss count / rows added;
- current palette stage;
- special queue scheduling.

After each resolved shot, decide success from `popped + dropped`. A miss inserts exactly one row.

No `round`, `shotsInRound`, `difficultyStage` tied to spatial expansion, `spatialStage`, or `pendingExpansion` state should remain in the runtime snapshot.

### Renderer

`EnduranceRenderer`/shared renderer receives fixed geometry and Endurance atmosphere transition data. Special rendering should be upgraded in the shared shot rendering path so queue and projectile visuals stay consistent.

Campaign rendering must not change behavior.

### App/UI/save

Update Endurance intro/result/HUD copy, record schema, and migration. Keep the Endurance entry point and controller lifecycle unchanged.

## Balance harness

Create a deterministic headless Endurance balance harness that can run thousands of simulated games without a browser.

The harness should support at least three player profiles:

- **casual**: often chooses plausible colors/targets but has imprecise aim and weak drop planning;
- **average**: prefers clusters, uses some bank shots and detached-group opportunities;
- **strong**: evaluates the best available pop/drop opportunities and makes intentional use of specials.

The profiles are not intended to produce perfect play. They are stable comparative probes.

For each configuration/profile, collect:

- survival time;
- final score;
- best combo;
- total resolved shots;
- miss rate;
- rows added;
- maximum pressure / lowest occupied row over time;
- board state summary at 60 s and 120 s;
- number and type of specials issued;
- value of each special type, measured by immediate removals and downstream survival impact where practical;
- loss reason.

The harness should compare a small parameter grid around the chosen design, including:

- palette timings such as 50/100, 60/120, 70/140 seconds;
- initial occupied row count;
- special cadence within the target range;
- streak multiplier steps/cap.

The core rule `miss => exactly one new row` is not a tuning parameter.

Initial interpretation targets, used only as heuristics for the report:

- casual median run: roughly 60–150 s;
- average median run: roughly 2–4 min;
- strong player: materially longer with no artificial hard cap.

These are not acceptance gates. The report should label candidate configs `TOO HARD`, `KEEP`, or `TOO EASY` based on distribution separation, miss rate, pressure growth, and special value rather than only mean survival time.

The harness outputs a machine-readable result plus a human-readable summary table:

`config | profile | median survival | p25/p75 survival | median score | miss rate | rows added | score/min | special value`

## Browser playtest

After headless tuning selects the best candidate, run real Playwright smoke/playtest coverage on desktop and a representative phone viewport.

Required browser checks:

- fixed 11/10 board starts with the intended smaller orb scale;
- top row visually touches the ceiling;
- a successful pop/drop does not add a row;
- a miss adds exactly one row;
- 5th color becomes available around 60 s active time;
- 6th color becomes available around 120 s active time;
- background transition occurs without pausing gameplay;
- Bomb/Rainbow/Guide are visually distinguishable in launcher, queue, and flight;
- each special active-shot callout is readable and non-blocking;
- loss/result/retry flow remains correct;
- no horizontal overflow on mobile;
- campaign browser smoke remains green.

Capture screenshots for start state, post-miss row insertion, 5-color background stage, 6-color stage, each special type, result dialog, and mobile playfield.

## Tests

Use TDD for implementation. Update or add focused tests for:

- fixed 11/10 geometry and ceiling contact;
- miss classification from `popped + dropped`;
- exactly one row added per miss;
- successful drop-only shot does not add a row;
- palette stage boundaries at 60 s and 120 s;
- no palette growth beyond six colors;
- pause freezing active-time palette progression;
- streak increment/reset/scoring bounds;
- record migration from `bestRound` to `bestCombo` schema;
- deterministic special schedule and no consecutive specials;
- special visual contract/callout contract;
- balance harness determinism for a fixed seed;
- existing campaign and shared-shot-resolution regressions.

## Non-goals

- Do not alter campaign difficulty or geometry.
- Do not change the visual-only wind rule in campaign.
- Do not add a seventh color.
- Do not add another post-120-second difficulty mechanic in this pass.
- Do not redesign Bomb/Rainbow/Guide gameplay effects before balance data shows a need.
- Do not merge PR #2 or advance `main`/`playable` as part of this redesign unless explicitly requested.

## Success criteria

Endurance v2 is successful when a new player can infer the pressure loop from play: successful shots hold the line, misses visibly add pressure, palette changes mark long-term progression, and specials are identifiable before firing.

The implementation is ready for review when unit/regression tests and browser smoke are green, balance-harness results are attached to the PR, and the selected configuration has been validated in desktop and mobile browser playtests.