# Storm Peaks (Levels 16–20) Design

## Goal
Extend the existing 15-level Sky Rescue campaign with a fourth 5-level world that introduces whole-board wind, deterministic lightning pressure, deeper objective placement, and improved cloud rendering without changing the core bubble-shooter rules or adding an economy.

## Scope
- Add levels 16–20 as a new world: **Storm Peaks**.
- Replace authored rectangular wind zones with a whole-board wind model for new windy content and migrate Forest levels to the same model where appropriate.
- Make the short aim guide reflect wind curvature while still hiding rebounds and exact landing prediction.
- Keep `Guide` as the only shot that shows full predicted trajectory including rebounds.
- Add storm lightning that periodically adds connected orbs to the current cluster to create time/turn pressure.
- Place rescue/collect objectives deeper inside authored layouts rather than on exposed front cells.
- Improve procedural clouds so they read as natural layered cloud bands rather than a few circular blobs.
- Preserve the original classic orb rendering, in-playfield next-orb rack, dynamic color pool, and existing campaign/save systems.

## 1. Whole-board wind

### Data model
Levels use a single optional wind vector:

```js
wind: { forceX: number, forceY: number }
```

`forceX` and `forceY` are acceleration values in logical-canvas units per second squared. No x/y/width/height bounds are required.

For compatibility during migration, physics helpers may temporarily accept legacy `windZones`, but authored Forest and Storm Peaks levels should use `wind` only.

### Physics
Every projectile step applies the current level wind regardless of projectile position.

A constant vector is preferred over random per-frame gusts because:
- the player can learn the current condition,
- aim feedback remains deterministic,
- a shot never changes trajectory because of frame timing.

Later levels may change wind **between shots**, not during a shot. The current wind for a shot is frozen at launch so the predicted trajectory and live projectile use exactly the same vector.

### Player communication
Wind is shown as a compact directional indicator integrated with the playfield, not as painted rectangular corridors.

The world background should also communicate wind through cloud/rain drift and vegetation motion.

## 2. Wind-aware aiming

### Normal shot
The normal aim guide remains intentionally limited. Instead of a straight geometric segment, render only the first ~40 logical pixels of the real simulated trajectory under the current wind.

It must:
- show initial curvature caused by wind,
- stop before any wall rebound,
- not reveal the final landing point,
- not extend through the board like the `Guide` power-up.

### Guide shot
`Guide` continues to use the complete deterministic simulator and may show:
- wind curvature,
- wall rebounds,
- path until collision/ceiling.

The live projectile and both aim modes must share the same physics helper to avoid prediction drift.

## 3. Lightning pressure mechanic

### Purpose
Lightning is a pressure mechanic, not direct damage. It periodically makes the board harder by welding new orbs onto the existing cluster.

### Trigger model
A storm level defines:

```js
storm: {
  firstStrikeAfterShots: number,
  intervalShots: number,
  spawnCount: [min, max]
}
```

Lightning is turn-based rather than real-time so pausing, device speed, and animation timing cannot affect gameplay.

Example: `firstStrikeAfterShots: 4`, `intervalShots: 3` means the first strike happens after the player's fourth resolved shot and every third resolved shot afterwards.

### Strike sequence
1. Brief warning flash in the cloud layer.
2. Bolt strikes a chosen occupied cell near the upper/middle part of the connected cluster.
3. 2–4 new normal orbs are added to empty neighboring cells.
4. Every new orb must be connected to the current top-connected structure.
5. Spawn colors come from the current active board palette.
6. The shot queue is reconciled after spawning so removed colors are not reintroduced incorrectly.
7. Lightning causes a stronger flash/shake/audio cue than a normal pop.

### Spawn constraints
Lightning must never:
- place an orb outside the valid hex grid,
- overwrite an occupied cell or objective,
- spawn an immediately disconnected island,
- place an orb below the failure line if another legal spawn exists,
- introduce a color absent from the current playable palette.

Candidate cells are ranked deterministically using the level RNG. Prefer empty neighbors around rows 1–6; only fall back lower if needed.

## 4. Deep objective placement

### Problem
Current captive/collectible objects may sit on an exposed front cell and become trivial to remove with one shot.

### Rule
For new rescue/collect content, objectives are selected from **deep slots** inside the authored pattern.

A deep slot should satisfy as many of these as possible:
- not be in the lowest two occupied rows of the cluster,
- have at least two occupied neighboring cells,
- have at least one occupied cell below or diagonally below it,
- not be directly reachable as the first collision from the launcher on an empty lane,
- remain connected to the ceiling through at least two cells at level start.

Authored layouts define eligible target cells or a target region; a deterministic helper chooses among eligible deep candidates using the level seed. This keeps replays consistent.

Anchors may remain explicitly authored when they are structural boss/mechanic targets.

## 5. Cloud rendering

Replace the current few-circle clouds with layered procedural cloud bands:
- 3–6 overlapping elliptical lobes per cloud,
- a wider soft base instead of identical round puffs,
- subtle underside shadow,
- varying opacity and vertical scale,
- multiple depth layers moving at different speeds,
- storm clouds use denser, darker layers rather than simply tinting white blobs.

Do not use heavy blur filters every frame. Prefer gradients and alpha-composited geometry for performance.

## 6. New world: Storm Peaks

World ID: `storm`

Name: **Burzowe Szczyty**

Theme: exposed mountain ridges above the forest, fast cloud layers, strong crosswinds, rain, lightning, dusk-to-night progression.

### Level 16 — Crosswind
- Objective: clear board.
- Introduces whole-board constant wind.
- Moderate rightward wind.
- No lightning.
- Short aim line visibly bends with wind.
- Layout uses large readable groups so the player can learn compensation.

### Level 17 — Turning Weather
- Objective: rescue 1 target.
- Target is placed in a deep slot.
- Wind changes direction **between resolved shots** on a deterministic authored sequence (e.g. right, right, left, left).
- Wind never changes during a flying projectile.
- No lightning yet.

### Level 18 — First Strike
- Objective: collect 2 targets.
- Both targets use deep placement.
- Constant diagonal wind.
- Introduces lightning after several shots.
- First strike spawns 2 orbs; later strikes use 2–3.
- Weather: heavy overcast/rain.

### Level 19 — Thunder Run
- Objective: survive a fixed number of turns or clear a protected structural section (final exact objective chosen to match existing rule APIs with minimal new objective code; preference: survive).
- Strong crosswind.
- Lightning arrives more frequently and spawns 3–4 orbs.
- One `Guide` special is available to teach using prediction under extreme wind.
- Dusk / heavy rain.

### Level 20 — Eye of the Storm
- World finale; marked boss-like visually but does not replace the existing level-15 boss progression.
- Objective: destroy 3 structural anchors or rescue 2 deep targets depending on which produces the better authored board during implementation; preference: anchors to reuse existing boss meter and rules.
- Wind changes between phases/shots but remains frozen during each projectile.
- Regular lightning pressure.
- Specials: Guide + bomb + rainbow in controlled order.
- Night storm, frequent background lightning, strongest weather presentation.
- Lightning spawn cadence tightens after each completed boss phase.

## 7. Campaign integration

- Campaign grows from 15 to 20 levels.
- `WORLDS` grows from 3 to 4 entries.
- Unlock remains sequential: level 16 unlocks after completing level 15.
- Total star count becomes 60.
- Existing saved progress remains valid; no destructive save migration is required because progress is keyed by level ID.
- `firstPlayableLevel`, map rendering, and mastery totals should continue to work from the authored level list rather than hard-coded 15-level assumptions.
- Browser tests must stop hard-coding 15 nodes.

## 8. Effects and audio feedback

Lightning uses existing feedback infrastructure where possible:
- strong canvas shake,
- white-blue full-frame flash,
- bolt rendering,
- brief spark particles at strike point,
- dedicated audio callback if feasible with existing procedural WebAudio.

`prefers-reduced-motion` disables or greatly reduces shake while retaining visual warning/flash clarity.

## 9. Testing requirements

### Unit / contract tests
- whole-board wind affects projectile anywhere on the map,
- aim preview and live projectile use the same wind vector,
- normal short preview ends before first rebound,
- Guide still includes rebound simulation,
- wind direction changes only between shots and stays frozen for a launched projectile,
- lightning schedule is deterministic,
- lightning spawns only into valid empty connected cells,
- lightning colors come only from the active palette,
- deep objective selector rejects exposed/front candidates when deeper legal candidates exist,
- all 20 authored levels fit the hex board and start top-connected,
- all rescue/collect targets in levels 16–20 satisfy the deep-slot contract,
- campaign exposes exactly 4 worlds / 20 levels.

### Browser smoke
Capture and inspect at least:
- level 16 wind-aware short aim,
- level 18 lightning strike aftermath,
- level 19 heavy storm,
- level 20 night finale,
- mobile view of a Storm Peaks level.

No horizontal overflow on desktop/mobile; integrated orb rack remains inside playfield; no detached side HUD returns.

## Non-goals for this pass
- No real-time countdown timer.
- No moving wind zones.
- No physics applied to already attached board orbs.
- No monetization/booster shop.
- No random mid-flight gust that would make prediction unreliable.
- No procedural generation of entire levels; layouts remain authored.
