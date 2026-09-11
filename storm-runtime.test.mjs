import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const game = await fs.readFile(new URL('./src/game.mjs', import.meta.url), 'utf8');

assert.ok(game.includes('chooseDeepObjectiveKeys'), 'runtime should use the tested deep-slot selector');
assert.ok(game.includes('level.objectiveSlots'), 'runtime should materialize authored deep objective slots');
assert.ok(game.includes("type: this.level.objective.type === 'rescue' ? 'captive' : 'collectible'"), 'runtime should create the correct rescue/collect object type');
assert.ok(game.includes('drawGlobalWind'), 'runtime should render whole-board wind feedback');
assert.ok(!game.includes('drawWindCorridors'), 'runtime should no longer render legacy rectangular wind corridors');
assert.ok(game.includes('this.stormInterval = Math.max(2, this.stormInterval - 1)'), 'Storm Peaks finale should tighten lightning cadence as anchor phases fall');
assert.ok(game.includes('projectile.wind'), 'live projectile should keep its launch-frozen wind');

console.log('✓ Storm Peaks runtime wiring contract');
