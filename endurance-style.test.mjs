import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = await fs.readFile(new URL('./styles/endurance.css', import.meta.url), 'utf8');

for (const selector of [
  '.campaign-actions',
  '.endurance-dialog',
  '.endurance-records',
  '.endurance-weather-badge',
  '.endurance-weather-badge[data-weather="frost"]',
  '.game-screen[data-mode="endurance"]',
  '.game-screen[data-mode="endurance"] .playfield-hud-top',
  '.game-screen[data-mode="endurance"] .playfield-objective',
  '.game-screen[data-mode="endurance"] .run-stats-inline > div:nth-child(3)',
  '.game-screen[data-mode="endurance"][data-palette-stage="1"]',
  '.game-screen[data-mode="endurance"][data-palette-stage="2"]',
  '.game-screen[data-mode="endurance"] .combo-callout.is-special-ready',
  '.game-screen[data-mode="endurance"] .combo-callout.is-endurance-stage',
  '.game-screen[data-mode="endurance"] .combo-callout.is-weather',
  '@media (max-width: 720px)',
]) {
  assert.ok(css.includes(selector), `missing Endurance style contract: ${selector}`);
}

assert.ok(!css.includes('data-spatial-stage'), 'Endurance v2 must not keep visual hooks for removed spatial stages');
assert.ok(css.includes('visibility: hidden'), 'Endurance objective slot should stay layout-stable but visually empty');
assert.ok(css.includes('display: none'), 'Endurance third compact stat and hidden weather badge must leave layout when hidden');
assert.ok(css.includes('pointer-events: none'), 'special/stage/weather status must never block aiming or firing');
assert.ok(css.includes('prefers-reduced-motion'), 'Endurance UI motion must respect reduced-motion preferences');

console.log('✓ Endurance v2 dynamic-weather visual contract');
