import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const game = await fs.readFile(new URL('./src/game.mjs', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./src/app.mjs', import.meta.url), 'utf8');
const feedback = await fs.readFile(new URL('./src/storm-feedback.mjs', import.meta.url), 'utf8');

assert.ok(game.includes('chooseDeepObjectiveKeys'), 'runtime should use the tested deep-slot selector');
assert.ok(game.includes('level.objectiveSlots'), 'runtime should materialize authored deep objective slots');
assert.ok(game.includes("type: this.level.objective.type === 'rescue' ? 'captive' : 'collectible'"), 'runtime should create the correct rescue/collect object type');
assert.ok(game.includes('drawGlobalWind'), 'runtime should still render whole-board wind feedback');
assert.ok(!game.includes('drawWindCorridors'), 'runtime should no longer render legacy rectangular wind corridors');
assert.ok(game.includes('this.stormInterval = Math.max(2, this.stormInterval - 1)'), 'Storm Peaks finale should tighten lightning cadence as anchor phases fall');

assert.ok(app.includes('applyStormFeedbackPatch(SkyRescueGame)'), 'visual-only wind/storm patch must be applied before gameplay starts');
assert.ok(feedback.includes('prototype.currentWindForAim'), 'storm feedback patch should own gameplay wind behavior');
assert.ok(feedback.includes('return null'), 'gameplay aim/trajectory should receive no wind force');
assert.ok(feedback.includes('this.pendingLightning'), 'lightning should have a pending telegraph state before impact');
assert.ok(feedback.includes('this.lightningWarningFx'), 'lightning should expose a warning state before impact');
assert.ok(feedback.includes('resolvePendingLightning'), 'lightning spawn should be separated from warning scheduling');
assert.ok(feedback.includes('if (this.pendingLightning'), 'shooting should be briefly locked during lightning telegraph');

console.log('✓ Storm Peaks runtime wiring contract');
