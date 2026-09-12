# Endurance Mode + Empty-Board Fix Design

## Goal

Add a score-focused **Endurance** mode alongside the existing Sky Rescue campaign, while also fixing the campaign edge case where the board can become empty without the run resolving.

The new mode should feel like a distinct survival loop rather than another authored level: the board grows over time, a fresh row arrives every three resolved shots, the logical playfield expands progressively, and the player competes for score, survival time, and round count.

## Scope

This design covers:

- a campaign empty-board terminal-state fix;
- a new Endurance entry point and run lifecycle;
- one new row every three resolved shots;
- a dynamically expanding logical hex board;
- smooth zoom-out/re-layout as the board expands;
- score/time/round records;
- a progressive difficulty curve;
- Endurance-specific HUD and result presentation;
- automated tests for geometry, progression, scoring, failure states, persistence, and responsive UI.

The design does **not** add online leaderboards, currencies, booster shops, paid progression, or a new economy.

---

## 1. Campaign Empty-Board Fix

The campaign currently resolves completion primarily through objective state. That can leave an impossible state where `grid.size === 0`, but a rescue/collect/anchor counter is still not considered complete because the final cascade removed the structure before all dependent state was synchronized.

After every board mutation that can remove or add balls, campaign mode must run one terminal-state reconciliation step.

Rules:

1. For a `clear` objective, `grid.size === 0` is immediate success.
2. For rescue, collect, or anchor objectives, normal objective resolution runs first.
3. If the board is empty after that resolution, campaign mode must not remain playable.
4. If the requested objective is already satisfied, complete normally.
5. If the board is empty while an objective object can no longer physically exist or be reached, treat the run as completed rather than leaving the player stuck on an empty board.

This is intentionally campaign-only behavior. Endurance uses an empty board as a reward state and continues.

---

## 2. Endurance Core Loop

Endurance has no completion objective and no shot limit.

A run starts with a standard-size board comparable to the current campaign geometry. The player shoots exactly as in Sky Rescue, using the existing orb look, projectile speed, collision feel, queue, combo logic, bounce behavior, bomb/rainbow/Guide specials, and current visual-only wind treatment.

### Round definition

- **3 resolved shots = 1 round.**
- After the third resolved shot, the game inserts one new full row at the top.
- Existing balls shift down one row before the new row is inserted.
- The shot counter for the next round resets to 0/3.
- The run continues until a ball enters the launcher failure zone.

A shot counts when its complete board result has been resolved. Lightning telegraphs, animations, pauses, or other FX do not count as separate shots.

### Clearing the board

Clearing the entire board does **not** end Endurance.

Instead:

- award a prominent `CLEAR BONUS`;
- preserve the current score/combo state according to the scoring rules;
- continue the current 3-shot round cadence;
- the next scheduled row repopulates the playfield.

This prevents an excellent run from ending because the player played too well.

---

## 3. Dynamic Board Geometry

The existing campaign engine uses fixed geometry: 10/9 columns and 10 rows. Endurance must not mutate those campaign-wide constants.

Endurance therefore gets its own geometry descriptor, for example:

```js
{
  stage: 0,
  evenCols: 10,
  oddCols: 9,
  maxRows: 10,
  radius: 12,
  spacingX: 24,
  spacingY: 20.78,
  originX: 0,
  originY: 48,
  launchY: 288,
}
```

A geometry helper must expose the same conceptual operations the game needs:

- `rowCols(r)`
- `colX(c, r)`
- `rowY(r)`
- `inGrid(c, r)`
- `neighbors(c, r)`
- `findSnap(...)`
- `topConnected(...)`
- `lowestRow(...)`

Campaign continues using the current `BALLOON` geometry unchanged. Endurance passes its own geometry object through runtime code that needs board dimensions.

### Expansion stages

Each expansion stage increases the logical playfield by:

- **+1 column on the left**;
- **+1 column on the right**;
- therefore 10/9 -> 12/11 -> 14/13 -> 16/15 ...;
- **+2 rows of maximum vertical capacity**.

Existing balls are remapped one column to the right at each stage so their visual center remains stable while the new side columns appear symmetrically.

Example:

```text
stage 0: c -> c
stage 1: c -> c + 1
stage 2: c -> c + 2
```

The remap happens once per expansion event. Relative structure and connectivity must remain unchanged.

### No instant side-fill

Expansion creates new logical space but does **not** instantly populate the new side columns.

The next generated rows use the full new width. This allows the wider board to fill naturally rather than punishing the player with a sudden mass spawn.

---

## 4. Smooth Zoom-Out and Re-layout

The physical canvas remains the same size.

When the logical board expands, the renderer transitions from the old geometry to the new geometry over approximately **0.5-0.7 seconds**.

During the transition:

- orb radius visually interpolates to the new size;
- existing balls interpolate from old cell centers to new cell centers;
- the launcher stays anchored near the bottom center;
- the failure line remains visually clear;
- aiming is temporarily locked until the transition completes;
- the board does not accept a shot while two geometries are being interpolated.

The final geometry for each stage is derived from available canvas width and height rather than a hardcoded sprite scale. This keeps later stages readable on both desktop and mobile.

The renderer should impose a practical minimum orb radius. If the theoretical next stage would make balls smaller than the readability threshold, later difficulty increases should come from faster stage timing, scoring pressure, or row density rather than shrinking indefinitely.

---

## 5. New Row Generation

After every third resolved shot:

1. move the current board one row downward;
2. fail immediately if the move places any occupied cell into the launcher danger zone;
3. generate a fresh full row at the current top row;
4. generate colors from the current active Endurance palette;
5. reconcile the upcoming shot queue against that palette;
6. continue the next round.

### Spawn palette

Endurance starts with a controlled color count rather than all possible colors immediately. The initial recommendation is 4 active colors, with a fifth color introduced only at a later difficulty stage if playtesting supports it.

### Anti-freebie generation

A fresh generated row should avoid creating a large automatic cluster before the player shoots.

The generator should reject or adjust obvious horizontal runs that would create an immediate group of 3+ same-color balls in the new row. It does not need to solve the entire board or guarantee difficulty; it only prevents accidental free clears caused purely by row generation.

Generation must be deterministic when supplied a seeded RNG so automated tests can verify exact behavior.

---

## 6. Difficulty Curve and Expansion Timing

The first balancing pass uses a hybrid schedule: a predictable base timeline with small adjustments based on board pressure.

Initial base expansion times:

```text
Stage 1: ~55 s
Stage 2: ~100 s
Stage 3: ~140 s
Stage 4: ~175 s
Stage 5: ~205 s
Later: every ~25-30 s
```

The exact values are configuration, not embedded throughout gameplay code.

### Adaptive adjustment

At each pending expansion:

- if the board is unusually empty/safe, expansion may occur up to ~8 seconds earlier;
- if the board is already close to the failure line, expansion may be delayed up to ~8 seconds;
- no single adaptive adjustment exceeds this window;
- the schedule never moves backward after a stage has triggered.

This preserves a recognizable rhythm while preventing obviously unfair or trivial timing.

### Expansion does not replace row pressure

The 3-shot row cadence remains active at all times. Expansion only changes capacity and geometry; it does not reset the shot-round counter.

---

## 7. Scoring

Endurance reuses the current scoring model for:

- popped balls;
- dropped balls;
- combo multiplier;
- cascade bonus;
- special-shot outcomes.

It adds two Endurance-only layers.

### Round multiplier

Every 5 completed rounds, the Endurance score multiplier gains **+0.25x**.

Example:

```text
Rounds 1-5: 1.00x
Rounds 6-10: 1.25x
Rounds 11-15: 1.50x
Rounds 16-20: 1.75x
...
```

This multiplier applies to the turn's score after normal pop/drop/combo calculation. It should have a sensible cap after playtesting so extremely long runs do not overflow score presentation.

### Round survival bonus

Completing a 3-shot round grants a small flat survival bonus. It should be meaningful but remain much smaller than a strong combo/drop, so the best strategy is still to play aggressively rather than merely survive.

### Clear bonus

If the board reaches `grid.size === 0`, award a large one-time `CLEAR BONUS` for that clear event. It must not fire repeatedly while the board remains empty waiting for the next row.

---

## 8. Records and Persistence

Endurance persists three local records:

- **Best Score**
- **Best Time**
- **Best Round**

These live alongside campaign progress in the existing versioned save system, for example:

```js
endurance: {
  bestScore: 0,
  bestTimeMs: 0,
  bestRound: 0,
}
```

Existing saves migrate safely by defaulting missing Endurance data to zero values.

A new result only replaces each record independently when that metric is higher.

No cloud sync or online leaderboard is part of this scope.

---

## 9. Specials

Endurance keeps the existing special-shot types but does not add an economy.

Recommended first-pass distribution:

- no special before the player has completed a few rounds;
- then inject Guide, Bomb, and Rainbow through a deterministic sparse rotation;
- never place multiple specials back-to-back in the initial balance;
- keep normal balls as the dominant queue content.

Exact cadence should be configuration-driven so browser simulations can tune it without rewriting gameplay logic.

---

## 10. Endurance UI Flow

### Campaign screen

Add a prominent **Endurance** button next to the main campaign action.

Selecting it opens an Endurance intro state showing:

- mode name;
- one-line rule summary: `3 strzały = nowy rząd`;
- Best Score;
- Best Time;
- Best Round;
- `Start` button.

This should remain visually integrated with the current Sky Rescue presentation rather than introducing a separate application shell.

### In-run HUD

Reuse the existing playfield and shot queue.

Replace campaign-specific run stats with:

- **Runda**
- **Do rzędu** (`3`, `2`, `1` or an equivalent compact presentation)
- **Czas**

Score and combo remain in the top HUD.

Do not show campaign stars, objectives, mastery progress, or max-shot limits during an Endurance run.

### Result dialog

On loss, show:

- final score;
- survival time;
- highest completed round;
- indicators for any new records;
- `Jeszcze raz`;
- `Mapa`.

There is no `Dalej` action in Endurance.

---

## 11. Endurance Failure Rule

The run ends when the occupied board reaches the launcher danger line.

This check runs after any operation that can move or add balls:

- normal shot settlement;
- disconnected drops;
- row insertion;
- geometry expansion/remap;
- any future Endurance hazard that can add balls.

An expansion stage itself should not create a loss merely because coordinates are rescaled. Loss is evaluated against the new logical geometry after the transition settles.

The result reason should clearly state that the stack reached the launcher.

---

## 12. Runtime Architecture

Keep Endurance separate enough that campaign behavior remains understandable.

Recommended module boundaries:

### `src/endurance-core.mjs`
Pure, DOM-free logic:

- stage geometry calculation;
- expansion schedule;
- adaptive timing adjustment;
- coordinate remapping;
- 3-shot round state;
- generated-row planning;
- Endurance multiplier/bonus helpers;
- record comparison/update helpers.

### `src/endurance-game.mjs`
Endurance-specific runtime controller or thin specialization around reusable shot-resolution primitives.

Responsibilities:

- run clock;
- round counter;
- scheduled row insertion;
- expansion state;
- transition lock;
- failure checks;
- clear bonus;
- mode-specific snapshot fields.

The preferred implementation should reuse shot physics, orb queue, settlement, effects, audio, and renderer code rather than fork them wholesale.

### Shared game code

If the existing `SkyRescueGame` contains logic needed by both modes, extract only targeted shared primitives such as:

- projectile launch/update;
- settle result application;
- effects spawning;
- queue reconciliation;
- collision helpers.

Do not rewrite unrelated campaign code.

### `src/endurance-ui.mjs` or campaign UI extension
Handles intro panel, record labels, Endurance result rendering, and mode-specific HUD labels.

### Save layer
Extends the current versioned save schema with Endurance records.

---

## 13. Data Flow

### Starting a run

1. User chooses `Endurance`.
2. App loads saved records.
3. Endurance controller creates stage-0 geometry and a seeded initial board.
4. Runtime initializes score, round, shot-in-round counter, run clock, next expansion time, queue, and effects.
5. HUD switches to Endurance labels.

### Resolving a shot

1. Projectile lands using current dynamic geometry.
2. Pop/drop resolution runs.
3. Score and combo update.
4. Empty-board clear bonus is checked.
5. Shot-in-round increments.
6. Failure line is checked.
7. If this is shot 3, insert a new row and increment the round.
8. Failure line is checked again.
9. Expansion timer is evaluated.
10. Snapshot/UI updates.

### Expansion

1. Compute the next stage geometry.
2. Remap all occupied cells to preserve centered relative layout.
3. Lock firing.
4. Animate old -> new positions/scale.
5. Adopt the new geometry as authoritative.
6. Unlock firing.
7. Continue the current round count; do not reset the 3-shot cadence.

---

## 14. Error and Edge-Case Handling

The implementation must explicitly handle:

- empty board in campaign;
- empty board in Endurance;
- row insertion onto an empty Endurance board;
- queue colors when the board is temporarily empty;
- geometry expansion while no balls exist;
- expansion immediately after a third-shot row insertion;
- pause during an expansion animation;
- tab/background timing jumps;
- mobile resize/orientation changes mid-run;
- deterministic row generation tests;
- maximum practical expansion stage/readability floor;
- save data from versions without Endurance fields.

The run timer should use elapsed active gameplay time rather than wall-clock time while paused. Large `requestAnimationFrame` gaps after a background tab must not skip multiple expansion stages in one frame without controlled processing.

---

## 15. Testing Requirements

### Campaign regression

- clearing the last ball in a clear level completes immediately;
- emptying the board in rescue/collect/anchor cannot leave `status === 'playing'` forever;
- normal non-empty campaign objectives retain existing behavior.

### Endurance core tests

- exactly 3 resolved shots advance one round;
- row insertion shifts the previous board correctly;
- generated row uses valid cells and active palette;
- generator avoids obvious fresh horizontal 3+ runs;
- clearing the board awards one clear bonus and does not end the run;
- stage 0 -> 1 remap preserves all cells/connectivity;
- each expansion adds 2 logical columns and 2 row capacity;
- expansion schedule matches configured base thresholds;
- adaptive timing stays inside the +/-8 s bound;
- round multiplier changes every 5 rounds;
- records update independently.

### Geometry tests

For multiple stages:

- all cell centers remain inside logical playfield bounds;
- neighbors are symmetric;
- snap locations are valid;
- top connectivity works;
- failure line detection is correct;
- remapped boards do not create duplicate coordinates.

### Runtime tests

- firing is locked during zoom transition;
- pause freezes Endurance clock;
- third shot triggers row insertion once;
- expansion does not reset shot-in-round count;
- loss fires once when the stack reaches the launcher;
- no max-shot failure exists in Endurance.

### Browser/visual smoke

Capture at minimum:

- Endurance intro panel desktop;
- initial Endurance stage desktop;
- one completed round with wider generated row;
- first expansion transition/result;
- later wider stage;
- Endurance result dialog;
- mobile portrait before and after expansion;
- mobile landscape after expansion.

Assert no horizontal overflow and that the shot queue, launcher, score, round, timer, and danger line remain visible/readable.

---

## 16. Initial Balance Constants

These values are explicitly first-pass tuning values, not permanent design promises:

```js
shotsPerRound: 3
initialEvenCols: 10
initialOddCols: 9
initialMaxRows: 10
rowsAddedPerExpansion: 2
colsAddedPerSidePerExpansion: 1
expansionTimesSeconds: [55, 100, 140, 175, 205]
laterExpansionIntervalSeconds: 27
adaptiveExpansionWindowSeconds: 8
zoomDurationSeconds: 0.6
initialColorCount: 4
roundMultiplierStepRounds: 5
roundMultiplierStep: 0.25
```

The implementation should centralize them in one Endurance configuration object so playtesting can rebalance them quickly.

---

## 17. Non-Goals

This pass does not include:

- online/global leaderboards;
- multiplayer Endurance;
- meta-progression;
- coins, energy, lives, shops, or monetization;
- endless shrinking below a readable orb size;
- procedural campaign levels;
- real-time falling rows independent of the 3-shot cadence;
- wind affecting projectile physics.

---

## Acceptance Summary

The feature is complete when:

1. campaign can no longer remain active on an empty board;
2. Endurance is launchable from the main Sky Rescue UI;
3. every 3 resolved shots insert a fresh row;
4. clearing the Endurance board awards a bonus and continues;
5. the logical board progressively widens and gains row capacity;
6. expansion visibly zooms/repositions the existing board without changing its structure;
7. new rows use the newly available width after expansion;
8. score, time, round, and records work independently from campaign stars/masteries;
9. the run ends only when the stack reaches the launcher danger zone;
10. desktop and mobile automated smoke tests pass through at least one geometry expansion.