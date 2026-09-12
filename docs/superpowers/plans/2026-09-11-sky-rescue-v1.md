# Balloon: Sky Rescue V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Balloon prototype into a playable 15-level campaign while preserving the original prototype and pure `balloon.js` geometry core.

**Architecture:** Keep `balloon.js` as the low-level board/geometry engine. Add ES-module campaign/content/presentation files and a new `index.html`; the existing `balloon.html` remains a legacy/classic prototype. Campaign rules are pure and Node-testable, while canvas rendering and DOM HUD consume those rules.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Canvas 2D, ES modules, Node.js assertion tests, localStorage.

**Spec:** User-provided `balloon_bubble_shooter_deep_dive.md`, especially sections 5–22.

## Global Constraints

- Preserve separation between simulation and presentation.
- Ship 15 authored levels: three worlds with five levels each.
- Include clear, rescue, collect, anchor and survival objectives.
- Include bomb and rainbow special shots in V1.
- Show current shot plus two upcoming shots.
- Campaign progress and best results persist locally.
- Every level must remain beatable without consuming an external booster economy.
- Keep the playfield visually dominant on desktop and mobile.
- Keep `balloon.html` operational as a legacy prototype.

---

### Task 1: Campaign rules and authored content

**Files:**
- Create: `src/sky-rescue-core.mjs`
- Create: `src/levels.mjs`
- Create: `sky-rescue.test.mjs`

**Interfaces:**
- Produces: seeded RNG, objective evaluation, star calculation, score breakdown, campaign result merging, unlock rules, 15 authored level definitions.

- [x] Write failing tests for deterministic RNG, objective progress, stars, score, progress merging, sequential unlocks and level count.
- [x] Verify the tests fail because campaign modules do not exist.
- [x] Implement the minimal pure campaign modules.
- [ ] Run the complete Node test file and keep it green.

### Task 2: Save and progression shell

**Files:**
- Create: `src/save.mjs`
- Create: `src/app.mjs`

**Interfaces:**
- Consumes: `LEVELS`, `WORLDS`, `applyCampaignResult`, `isLevelUnlocked`.
- Produces: map rendering, level selection, result persistence, next-level navigation, classic-mode entry.

- [ ] Add testable save normalization helpers.
- [ ] Implement versioned localStorage persistence with corrupt-save fallback.
- [ ] Render the campaign path and world sections from authored content.
- [ ] Show stars, locks and best scores without turning the map into a card grid.

### Task 3: Canvas gameplay runtime

**Files:**
- Create: `src/game.mjs`

**Interfaces:**
- Consumes: global `BALLOON` geometry API plus campaign level definitions.
- Produces: aim/shoot loop, snapping, clusters, drops, ceiling pressure, special shots, objective progress, loss/win callbacks.

- [ ] Implement pointer aiming and reflected trajectory preview.
- [ ] Implement projectile flight, wall bounce, collision and snap using `BALLOON.findSnap`.
- [ ] Resolve normal, bomb and rainbow shots.
- [ ] Convert popped/dropped keys into objective progress for rescue, collectibles and anchors.
- [ ] Implement score/combo feedback and ceiling-pressure turns.
- [ ] Implement boss pressure phases and campaign completion callbacks.

### Task 4: Product UI and visual system

**Files:**
- Create: `index.html`
- Create: `styles/sky-rescue.css`
- Create: `DESIGN.md`

**Interfaces:**
- Consumes: app/game state.
- Produces: responsive map, game HUD, queue, objective strip, pause/result overlays and accessible controls.

- [x] Define durable visual direction and tokens in `DESIGN.md`.
- [ ] Build an open storybook-sky layout with a winding flight-path campaign map.
- [ ] Keep live-play HUD low-chrome and outside the board center.
- [ ] Add responsive mobile recomposition, focus-visible states and reduced-motion support.
- [ ] Add result modal with score breakdown, stars, retry and next actions.

### Task 5: Verification and handoff

**Files:**
- Modify as required by test findings.

- [ ] Run `node sky-rescue.test.mjs`.
- [ ] Run `node balloon.test.js` against the unchanged geometry core.
- [ ] Perform static syntax checks for all new modules.
- [ ] Inspect desktop/mobile layout statically; runtime browser verification is required when a browser runner is available.
- [ ] Open a pull request summarizing features, test evidence and remaining asset-polish opportunities.
