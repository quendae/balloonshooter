import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./src/app.mjs', import.meta.url), 'utf8');

for (const id of [
  'enduranceButton', 'enduranceDialog', 'enduranceStartButton', 'enduranceBackButton',
  'enduranceBestScore', 'enduranceBestTime', 'enduranceBestRound',
  'statOneLabel', 'statTwoLabel', 'statThreeLabel',
]) {
  assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
}

assert.ok(html.includes('3 strzały = nowy rząd'));
assert.ok(html.includes('styles/endurance.css'));
assert.ok(app.includes("import { EnduranceGame } from './endurance-game.mjs'"));
assert.ok(app.includes('new EnduranceGame'));
assert.ok(app.includes('updateEnduranceRecords'));
assert.ok(app.includes("refs.statOneLabel.textContent = 'Runda'"));
assert.ok(app.includes("refs.statTwoLabel.textContent = 'Do rzędu'"));
assert.ok(app.includes("refs.statThreeLabel.textContent = 'Czas'"));
assert.ok(app.includes("refs.gameScreen.dataset.mode = activeMode"));
assert.ok(app.includes('destroyActiveGame'));

console.log('✓ Endurance UI contract');
