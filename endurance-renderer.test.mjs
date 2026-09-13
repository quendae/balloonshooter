import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EnduranceRenderer } from './src/endurance-renderer.mjs';
import { GameRenderer } from './src/game-renderer.mjs';

assert.equal(Object.getPrototypeOf(EnduranceRenderer.prototype), GameRenderer.prototype);

const source = await fs.readFile(new URL('./src/endurance-renderer.mjs', import.meta.url), 'utf8');
const sharedSource = await fs.readFile(new URL('./src/game-renderer.mjs', import.meta.url), 'utf8');

assert.ok(source.includes('state.geometry || this.B'));
assert.ok(source.includes('state.enduranceAtmosphere'));
assert.ok(source.includes('drawEnduranceSky'));
assert.ok(source.includes('ENDURANCE_SKIES'));
assert.ok(source.includes('board.RAD / 12'));
assert.ok(source.includes('drawOrbRack(state.queue || [], Boolean(state.projectile), boardScale)'));
assert.ok(source.includes('board.LAUNCH_Y - 17'));
assert.ok(!source.includes('transitionCells'), 'Endurance v2 no longer renders spatial zoom transition cells');
assert.ok(sharedSource.includes("timeOfDay === 'late-day'"), 'shared sky renderer should support the Endurance-only late-day atmosphere');

console.log('✓ Endurance atmosphere renderer contract');