# Endurance Mode + Empty-Board Fix Design

## Goal

Add a score-focused **Endurance** mode alongside the existing Sky Rescue campaign and fix the campaign edge case where the board can become empty without the run resolving.

Endurance is a distinct survival loop rather than another authored level: every three resolved shots create a new row, the logical board expands over time with a smooth zoom-out, and the player competes for score, survival time, and highest round.

## Scope

This design covers:

- campaign empty-board terminal-state reconciliation;
- a new Endurance entry point and lifecycle;
- one generated row every three resolved shots;
- dynamically expanding hex geometry isolated from campaign geometry;
- smooth zoom/re-layout during expansions;
- score, time, and round records;
- progressive/adaptive expansion timing;
- Endurance-specific HUD and result UI;
- automated core, geometry, runtime, persistence, and browser tests.

It does not add online leaderboards, multiplayer Endurance, currencies, booster shops, monetization, or a meta-progression economy.

---

## 1. Campaign Empty-Board Fix

Campaign currently resolves completion primarily through objective state. An edge case can therefore leave `grid.size === 0` while an objective counter has not synchronized, leaving the player on an empty board with no valid move.

After every campaign board mutation that can remove or add balls, run one terminal-state reconciliation step after normal object/counter resolution.

Rules:

1. `clear` objectives complete immediately when `grid.size === 0`.
2. Rescue, collect, and anchor objects/counters resolve normally first.
3. If the board is empty after that resolution, the campaign run must never remain `playing`.
4. If the objective is satisfied, complete normally.
5. If counters remain inconsistent after the final cascade, an empty board is the safety fallback and the level completes anyway. An empty campaign board is never treated as a loss.

This fallback is campaign-only. Endurance treats an empty board as a reward state and continues.

---

## 2. Endurance Core Loop

Endurance has no completion objective and no maximum shot count.

A run starts with the current standard board dimensions and **four generated occupied rows**. Those rows use the same deterministic row-generation constraints as later rows so the starting position does not contain accidental horizontal same-color runs of 3+.

The player keeps the existing orb art, projectile speed, collision feel, queue, combo model, wall bounces, Bomb/Rainbow/Guide shots, visual-only wind, impact effects, and audio language.

Storm lightning is **not** part of Endurance in the first pass. The mode's pressure comes from rows and board growth.

### Round semantics

State starts as:

```js
round: 1
shotsInRound: 0
```

- Every resolved shot increments `shotsInRound`.
- **3 resolved shots = one completed round.**
- After shot 3, insert a new top row, reset `shotsInRound` to 0, and increment `round`.
- HUD shows the currently active round, so after surviving the first inserted row it changes from Round 1 to Round 2.
- `bestRound` stores the highest round reached, not merely the count of finished rounds.

A shot counts only after its entire pop/drop result is resolved. Pauses, FX, zoom transitions, or warnings never count as shots.

### Clearing the board

`grid.size === 0` never ends Endurance.

On the transition from non-empty to empty:

- award one `CLEAR BONUS`;
- show a prominent `CLEAR BONUS` callout;
- keep the current three-shot cadence;
- do not repeatedly award the bonus while the board remains empty;
- the next scheduled row repopulates the board.

---

## 3. Dynamic Board Geometry

Campaign geometry remains untouched. Existing fixed `BALLOON` constants continue to power authored campaign levels.

Endurance gets a separate geometry descriptor, for example:

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

The Endurance geometry API exposes the operations needed by runtime code:

- `rowCols(r)`
- `colX(c, r)`
- `rowY(r)`
- `inGrid(c, r)`
- `neighbors(c, r)`
- `findSnap(...)`
- `topConnected(...)`
- `lowestRow(...)`

### Spatial expansion

Each spatial expansion adds:

- **1 logical column on the left**;
- **1 logical column on the right**;
- therefore 10/9 -> 12/11 -> 14/13 -> 16/15 ...;
- **2 rows of maximum vertical capacity**.

Existing occupied cells are remapped `c -> c + 1` once per expansion. This opens one new column on each side while preserving the centered shape and all adjacency/connectivity relationships.

Expansion itself adds **no balls** to the side columns. Later generated top rows use the full current width and naturally begin filling them.

### Readability floor

Final cell spacing is calculated from the fixed canvas size. The renderer/runtime must not shrink orb radius below **6.5 logical pixels**.

If the next spatial expansion would require a radius below 6.5, spatial growth stops at the current geometry. Endurance still continues indefinitely with its three-shot row pressure and score progression; the game never becomes unreadably tiny merely to claim another zoom stage.

---

## 4. Smooth Zoom-Out and Re-layout

The physical canvas remains unchanged.

A spatial expansion transitions old geometry -> new geometry over **0.6 seconds**.

During the transition:

- orb radius interpolates from old to new;
- occupied balls interpolate between old and remapped cell centers;
- the launcher remains anchored at bottom center;
- the failure line remains visible;
- firing/aim confirmation is locked;
- the run clock continues only if the game itself is not paused;
- row and shot counters do not reset.

After 0.6 s, the new geometry becomes authoritative and firing unlocks.

Pause freezes the transition. Resume continues from the same interpolation progress.

---

## 5. New Row Generation

After each third resolved shot:

1. shift occupied cells one row downward using current Endurance geometry;
2. check the launcher danger line;
3. if still alive, generate a full current-width top row;
4. reconcile upcoming queue colors;
5. reset `shotsInRound` and advance the active round;
6. check failure state again after the new row exists.

### Palette

- Start with **4 active colors**.
- Introduce a fifth active color at spatial/difficulty stage 3.
- Never generate a shot color absent from the current Endurance palette.
- If the board is temporarily empty, queue generation falls back to the configured current palette rather than returning color 0.

### Anti-freebie constraint

For the new row, reject/repair any horizontal same-color run of 3 or more cells created entirely within that row.

The generator does not solve the whole board and does not prevent a new row from connecting to existing same-color balls below. It only prevents a free horizontal 3+ caused solely by generation.

Generation accepts a seeded RNG and must be deterministic in tests.

---

## 6. Difficulty Curve and Expansion Timing

Use a hybrid schedule: predictable base times plus a small board-pressure adjustment.

First-pass base elapsed-active-time thresholds:

```text
Stage 1: 55 s
Stage 2: 100 s
Stage 3: 140 s
Stage 4: 175 s
Stage 5: 205 s
Later difficulty stages: +27 s each
```

These values live in one Endurance configuration object.

### Pressure metric

Define:

```text
pressure = lowestOccupiedRow / (maxRows - 1)
```

For an empty board, pressure is `0`.

The threshold adjustment is deterministic and bounded:

```text
pressure <= 0.45  -> -8 s
pressure == 0.60  ->  0 s
pressure >= 0.75  -> +8 s
```

Linearly interpolate between these points and clamp to `[-8 s, +8 s]`.

Interpretation:

- safe/empty board -> next stage arrives a little earlier;
- dangerous board -> player gets up to 8 seconds of relief;
- no threshold can move by more than 8 seconds;
- once a stage triggers, it cannot be undone.

If spatial growth has already hit the 6.5 px readability floor, later timed stages still advance the difficulty stage for palette/scoring/special cadence purposes but do not widen the board further.

The three-shot row cadence never changes and never resets because of a timed stage.

---

## 7. Scoring

Reuse the existing turn score calculation for pops, drops, combos, cascades, and special outcomes.

Endurance then applies an additional mode multiplier.

### Round multiplier

Every five rounds, add `+0.25x`:

```text
Rounds 1-5:   1.00x
Rounds 6-10:  1.25x
Rounds 11-15: 1.50x
Rounds 16-20: 1.75x
...
```

Cap the Endurance multiplier at **3.00x**.

The Endurance multiplier applies after normal turn-score calculation.

### Survival bonus

Completing a three-shot round grants:

```text
100 * enduranceMultiplier
```

rounded to the nearest integer.

This remains much smaller than a strong later-game cascade.

### Clear bonus

Transitioning from a non-empty board to an empty board grants:

```text
1000 * enduranceMultiplier
```

rounded to the nearest integer.

The clear bonus can trigger again only after at least one ball has existed on the board since the previous clear.

---

## 8. Specials

There is no Endurance economy.

First-pass deterministic cadence:

- no special before Round 4;
- after Round 4, inject one special every **6 resolved shots**;
- cycle `Guide -> Bomb -> Rainbow -> Guide ...`;
- never insert a second special if the immediately previous queued/used shot was already special;
- normal balls remain the dominant queue content.

Exact cadence remains configuration-driven for later balancing.

---

## 9. Records and Persistence

Persist three independent local records:

- **Best Score**
- **Best Time**
- **Best Round**

Save shape:

```js
endurance: {
  bestScore: 0,
  bestTimeMs: 0,
  bestRound: 0,
}
```

Existing saves migrate by defaulting the missing Endurance object to zeros.

At run end, each metric updates independently with `max(old, new)`.

Time means **active gameplay time**. Paused time and time spent with the tab suspended do not count.

---

## 10. Endurance UI Flow

### Main/campaign screen

Add a prominent **Endurance** button beside the primary campaign action.

Selecting it opens an integrated Endurance intro panel/dialog containing:

- `Endurance`;
- rule summary `3 strzały = nowy rząd`;
- Best Score;
- Best Time;
- Best Round;
- `Start`;
- `Wróć`.

### In-run HUD

Reuse the current playfield frame, top score/combo display, canvas, and in-playfield shot queue.

Replace campaign run stats with:

- **Runda** — active round number;
- **Do rzędu** — `3 - shotsInRound`;
- **Czas** — active elapsed time.

Do not show campaign objective progress, stars, mastery counts, max-shot limit, or boss meter in Endurance.

### Result dialog

On loss show:

- final score;
- active survival time;
- highest round reached;
- `NOWY REKORD` indicators independently for score/time/round when appropriate;
- `Jeszcze raz`;
- `Mapa`.

Do not show campaign stars or `Dalej`.

---

## 11. Failure Rule

Endurance ends only when the occupied structure reaches the launcher danger line.

Check after every operation that can change occupied positions:

- normal shot settlement;
- disconnected drops;
- generated-row downward shift;
- top-row generation;
- completed geometry remap/transition;
- any future Endurance mechanic that adds/moves balls.

The zoom interpolation itself cannot cause a loss mid-animation. Evaluate against authoritative new logical geometry after the transition completes.

Failure fires once and produces a clear result reason such as `Kulki dotarły do wyrzutni.`

There is no max-shot failure in Endurance.

---

## 12. Runtime Architecture

Keep Endurance isolated enough that campaign behavior remains understandable while reusing existing shot mechanics.

### `src/endurance-core.mjs`

Pure DOM-free logic:

- central `ENDURANCE_CONFIG`;
- stage geometry calculation;
- expansion schedule and pressure adjustment;
- coordinate remapping;
- round progression;
- generated-row planning;
- palette-by-stage;
- Endurance multiplier/survival/clear bonuses;
- record comparison/update helpers.

### `src/endurance-geometry.mjs`

A focused dynamic geometry implementation exposing the hex operations currently supplied globally by `BALLOON` for campaign.

It receives a geometry descriptor and contains no UI/run-state logic.

### `src/endurance-game.mjs`

Endurance runtime controller or thin specialization around reusable shot-resolution primitives.

Responsibilities:

- active run clock;
- round and `shotsInRound`;
- row insertion;
- current difficulty/spatial stage;
- zoom transition state;
- clear-bonus latch;
- failure checks;
- Endurance-specific snapshots.

### Shared gameplay extraction

Reuse rather than fork:

- projectile launch/update;
- collision/settlement operations where geometry can be injected;
- queue generation/reconciliation;
- scoring primitives;
- particle/impact effects;
- audio callbacks;
- renderer orb/special drawing.

Extract only the narrow pieces required to inject dynamic geometry. Do not rewrite unrelated campaign systems.

### UI/save

Extend app/UI flow with an Endurance intro/result path and extend the existing versioned save schema with Endurance records.

---

## 13. Data Flow

### Start

1. User chooses Endurance.
2. App loads records.
3. Create stage-0 geometry.
4. Generate four initial rows using a run seed.
5. Initialize `round=1`, `shotsInRound=0`, score, timer, palette, queue, stage timers, and FX.
6. Switch HUD to Endurance mode.

### Resolve shot

1. Land/snap using current dynamic geometry.
2. Resolve pop/drop.
3. Calculate normal score then Endurance multiplier.
4. Detect a new empty-board transition and award clear bonus once.
5. Increment `shotsInRound`.
6. Check failure line.
7. On shot 3: shift board, generate row, reset shot count, increment active round, grant survival bonus.
8. Check failure again.
9. Evaluate whether a timed difficulty/spatial stage should trigger.
10. Emit snapshot.

### Expansion

1. Calculate next geometry.
2. If next radius would be <6.5, advance difficulty stage without spatial remap.
3. Otherwise remap all occupied cells `c -> c + 1`.
4. Lock firing.
5. Animate old -> new geometry for 0.6 s.
6. Adopt new geometry as authoritative.
7. Check failure using new geometry.
8. Unlock firing.
9. Preserve current round and `shotsInRound`.

---

## 14. Timing and Pause Safety

Use accumulated active `dt`, not `Date.now()` wall time, for Endurance time.

Rules:

- pause stops the run clock and zoom transition;
- hidden/background tab gaps are clamped using the same safe-frame strategy as gameplay;
- one frame may advance at most one difficulty stage;
- if multiple thresholds were technically crossed during a long suspension, process them on subsequent active frames rather than jumping several spatial stages at once;
- resize/orientation changes recalculate rendering scale but do not change logical stage, round, or score.

---

## 15. Testing Requirements

### Campaign regression

- clearing the final ball in `clear` completes immediately;
- an empty rescue/collect/anchor board never remains `playing`;
- non-empty campaign objective behavior remains unchanged.

### Endurance core

- start state is Round 1 / 0 of 3 shots;
- exactly three resolved shots insert exactly one row and advance to Round 2;
- row insertion shifts previous cells correctly;
- generated row fills valid current-width top cells;
- generator is deterministic and avoids horizontal fresh 3+ runs;
- temporary empty board uses configured palette for queue generation;
- empty-board transition awards one clear bonus but does not end run;
- clear bonus cannot repeat while continuously empty;
- spatial expansion adds two total columns and two row capacity;
- remap preserves cell count and connectivity with no duplicate keys;
- pressure adjustment equals -8/0/+8 at 0.45/0.60/0.75 and clamps outside;
- timed stages match configured thresholds;
- multiplier changes every five rounds and caps at 3.00x;
- survival and clear bonuses use the multiplier;
- special cadence begins no earlier than Round 4;
- records update independently.

### Geometry

Across several supported spatial stages:

- all cell centers remain in playfield bounds;
- neighbors are symmetric;
- snapping yields valid cells;
- top connectivity works;
- failure-line detection is correct;
- next expansion stops when it would require radius <6.5.

### Runtime

- firing is locked during the 0.6 s zoom;
- pause freezes timer and zoom;
- row insertion fires once on the third shot;
- expansion does not reset `shotsInRound`;
- no max-shot failure exists;
- loss fires once when structure reaches launcher;
- a spatial expansion cannot lose mid-interpolation;
- one active frame cannot skip several difficulty stages.

### Browser/visual smoke

Capture and inspect at minimum:

- Endurance intro desktop;
- initial Endurance run;
- state after first generated row;
- first expanded board;
- later wider board;
- Endurance result dialog;
- mobile portrait before and after expansion;
- mobile landscape after expansion.

Assert no horizontal overflow and verify launcher, shot queue, score, combo, Round, `Do rzędu`, timer, and failure line remain readable.

---

## 16. Initial Configuration

```js
const ENDURANCE_CONFIG = {
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
};
```

These are first-pass balancing values and must be centralized so later playtesting can change them without redesigning the mode.

---

## 17. Non-Goals

This pass does not include:

- online/global leaderboards;
- multiplayer Endurance;
- coins, energy, lives, shops, or monetization;
- real-time row drops independent of the three-shot cadence;
- procedural campaign levels;
- storm lightning in Endurance;
- wind affecting projectile physics;
- shrinking orbs below the readability floor just to keep expanding spatially.

---

## Acceptance Summary

The work is complete when:

1. campaign cannot remain active on an empty board;
2. Endurance is launchable from the main Sky Rescue UI;
3. the run starts with four generated rows and Round 1;
4. every three resolved shots insert one fresh row and advance the round;
5. clearing Endurance awards one clear bonus and continues;
6. timed stages progressively widen/increase board capacity until the readability floor;
7. an expansion smoothly remaps and zooms existing balls without changing their structure;
8. generated rows use new side columns after widening;
9. score, active time, highest round, and records are independent from campaign stars/masteries;
10. run ends only when occupied structure reaches the launcher danger line;
11. desktop and mobile automated smoke tests pass through at least one spatial expansion.