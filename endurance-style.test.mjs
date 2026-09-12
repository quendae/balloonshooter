import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = await fs.readFile(new URL('./styles/endurance.css', import.meta.url), 'utf8');

for (const selector of [
  '.campaign-actions',
  '.endurance-dialog',
  '.endurance-records',
  '.game-screen[data-mode="endurance"]',
  '.game-screen[data-mode="endurance"] .playfield-hud-top',
  '@media (max-width: 720px)',
]) {
  assert.ok(css.includes(selector), `missing Endurance style contract: ${selector}`);
}

assert.ok(css.includes('prefers-reduced-motion'), 'Endurance UI motion must respect reduced-motion preferences');

console.log('✓ Endurance visual contract');