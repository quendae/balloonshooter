import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const game = await fs.readFile(new URL('./src/game.mjs', import.meta.url), 'utf8');

assert.ok(game.includes('chooseDeepObjectiveKeys'), 'runtime should use the tested deep-slot selector');
assert.ok(game.includes('level.objectiveSlots'), 'runtime should materialize authored deep objective slots');
assert.ok(game.includes("type: this.level.objective.type === 'rescue' ? 'captive' : 'collectible'"), 'runtime should create the correct rescue/collect object type');
assert.ok(game.includes('drawGlobalWind'), 'runtime should render whole-board wind feedback');
assert.ok(!game.includes('drawWindCorridors'), 'runtime should no longer render legacy rectangular wind corridors');
assert.ok(game.includes('this.stormInterval = Math.max(2, this.stormInterval - 1)'), 'Storm Peaks finale should tighten lightning cadence as anchor phases fall');

assert.ok(!game.includes('projectile.wind'), 'visual wind must not be stored on or steer a live projectile');
assert.ok(game.includes('stepProjectile(this.projectile, dt, bounds, null)'), 'live projectile physics should ignore visual wind');
assert.ok(game.includes('wind: null'), 'normal aim and Guide simulation should ignore visual wind');

assert.ok(game.includes('this.pendingLightning'), 'lightning should have a pending telegraph state before impact');
assert.ok(game.includes('this.lightningWarningFx'), 'lightning should expose a visible warning effect before impact');
assert.ok(game.includes('resolvePendingLightning'), 'lightning spawn should be separated from warning scheduling');
assert.ok(game.includes('this.pendingLightning ||'), 'shooting should be briefly locked during lightning telegraph');

console.log('✓ Storm Peaks runtime wiring contract');
