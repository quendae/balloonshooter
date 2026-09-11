# Balloon: Sky Rescue — Design System

## Product identity

A calm, family-friendly precision puzzle game. The player should feel like they are guiding a small sky-rescue expedition, not operating a mobile-game dashboard.

## Visual direction

**Theme:** storybook sky adventure with tactile toy-like balloons and airy environmental depth.

**Signature:** the campaign is a visible flight path threading through floating world islands. During play, the board stays dominant and UI chrome sits at the edges.

**Material language:** painted sky, paper-map labels, rope/stitched route details, soft cloud layers, polished balloon sprites. Avoid glassmorphism, neon sci-fi, dense card grids, casino effects, and generic SaaS panels.

**Micro-illustration rule:** objective objects and special shots use small bespoke vector illustrations (bird rescue, collectible star, anchor, bomb, rainbow) rather than emoji or font glyphs. They should read at balloon scale and share the same rounded, toy-like line language.

## World identity

The three campaign worlds must be visually recognizable even with the HUD hidden:

- **Łąka Balonów:** warm sun, blue sky, soft green hill layers; calm and tutorial-like.
- **Wyspy Chmur:** brighter high-altitude blue, drifting cloud masses and open air; emphasizes bank shots and space.
- **Las Wiatru:** green/teal atmosphere, layered tree silhouettes, moving wind lines and leaves; more tension and movement.
- **Strażnik Burzy:** uses the Las Wiatru language with an additional storm-darkening layer, never a wholly unrelated boss theme.

Gameplay balloon colors stay stable across worlds for readability.

## Palette

- Sky deep: `#3178B8`
- Sky light: `#AEE3FF`
- Cloud: `#F8FCFF`
- Ink: `#17324D`
- Sun: `#FFD36A`
- Leaf: `#4B9C6A`
- Coral accent: `#F47C6C`
- Night storm: `#334B72`

World accents may shift the environment, but gameplay colors remain stable.

## Typography

No remote font dependency. Use a deliberate system stack:

- Display: `Trebuchet MS`, `Avenir Next`, system sans-serif; bold, slightly tight tracking.
- UI/body: `Avenir Next`, `Segoe UI`, system-ui, sans-serif.
- Numeric HUD: `Trebuchet MS`, system-ui; tabular numerals.

## Layout rules

- The playfield is the primary artifact and should occupy the majority of the useful viewport.
- Persistent HUD: one compact objective/status cluster and one compact queue/score cluster.
- Menus and deeper explanation live outside the live playfield or in pause/result overlays.
- Desktop game layout: side information rails + central canvas.
- Mobile game layout: compact top objective strip, full-width canvas, bottom queue/actions.
- Campaign map: open layout with a winding route; do not convert levels into a uniform card grid.
- Header progress may show stars and mastery, but it must stay compact enough to preserve the brand and classic-mode access at 390px.

## Mastery system

Mastery is **skill proof, not currency**. It does not buy boosters and does not gate campaign progression.

Each level has three persistent mastery marks:

- **Bank Shot** — make at least one successful scoring shot after a wall bounce.
- **Avalanche** — drop at least 6 balloons with one shot.
- **Perfect Aim** — finish the level with 0 misses.

Mastery marks persist independently from stars and best score. Map nodes show compact marks; the result dialog explains the three conditions and highlights newly earned marks. Never turn mastery into a daily-task checklist or reward-economy layer.

## Component rules

- Primary buttons: solid cloud/ink contrast, strong label, subtle lift on hover.
- Secondary buttons: low-emphasis outline or text treatment.
- Level nodes: circular or balloon-like, with stars and three compact mastery marks below; locked nodes use shape + icon, not color alone.
- Dialogs: app-owned modal with focusable controls; never browser `alert`/`confirm`.
- Focus: visible 3px focus ring with strong contrast.
- Special-shot badges should be vector/CSS art, not Unicode symbols pretending to be production icons.

## Audio

Audio is lightweight, responsive feedback rather than a soundtrack dependency. Procedural WebAudio tones are acceptable for this prototype and should reinforce:

- shot launch;
- wall bounce;
- pop/cascade size;
- rescue, collectible and anchor resolution;
- ceiling pressure;
- boss phase changes;
- win/loss.

Sound preference persists locally and defaults to on. Audio must never block gameplay when the browser disallows or lacks WebAudio.

## Motion

Use motion for cause and effect:

- shot launch;
- wall bounce;
- balloon squash on contact;
- pop burst;
- detached cluster falling;
- rescued-object lift;
- combo callout;
- world-map route reveal;
- newly earned mastery reveal.

Do not animate every HUD element. Respect `prefers-reduced-motion`.

## Responsive and accessibility

Target WCAG 2.2 AA for DOM UI. Buttons use semantic elements, keyboard focus is visible, dialogs are accessible, and no critical state is communicated by color alone. The layout must remain usable at narrow mobile widths and 200% zoom without hiding the core controls.