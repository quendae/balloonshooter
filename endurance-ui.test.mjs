import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./src/app.mjs', import.meta.url), 'utf8');

for (const id of [
  'enduranceButton', 'enduranceDialog', 'enduranceStartButton', 'enduranceBackButton',
  'enduranceBestScore', 'enduranceBestTime', 'enduranceBestCombo', 'enduranceWeatherBadge',
  'statOneLabel', 'statTwoLabel', 'statThreeLabel',
]) {
  assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
}

assert.ok(html.includes('Pudło = nowy rząd'));
assert.ok(html.includes('Best Combo'));
assert.ok(!html.includes('Best Round'));
assert.ok(!html.includes('3 strzały = nowy rząd'));
assert.ok(html.includes('styles/endurance.css'));
assert.ok(app.includes("import { EnduranceGame } from './endurance-game.mjs'"));
assert.ok(app.includes("weatherBadgeLabel"), 'app should use the public Endurance weather label helper');
assert.ok(app.includes('new EnduranceGame'));
assert.ok(app.includes('updateEnduranceRecords'));
assert.ok(app.includes('enduranceBestCombo'));
assert.ok(app.includes('onEnduranceWeather'));
assert.ok(app.includes('snapshot.weather'));
assert.ok(!app.includes("textContent = 'Runda'"));
assert.ok(!app.includes("textContent = 'Do rzędu'"));
assert.ok(app.includes("refs.statOneLabel.textContent = 'Czas'"));
assert.ok(app.includes("refs.statTwoLabel.textContent = 'Kolory'"));
assert.ok(app.includes('snapshot.colorCount'));
assert.ok(app.includes('snapshot.combo'));
assert.ok(app.includes('result.bestCombo'));
assert.ok(app.includes('result.rowsAdded'));
assert.ok(app.includes("refs.resultStars.hidden = true"));
assert.ok(app.includes("refs.nextButton.hidden = true"));
assert.ok(app.includes("refs.gameScreen.dataset.mode = activeMode"));
assert.ok(app.includes('destroyActiveGame'));

console.log('✓ Endurance v2 weather-aware UI contract');
