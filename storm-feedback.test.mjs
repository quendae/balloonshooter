import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyStormFeedbackPatch } from './src/storm-feedback.mjs';

const require = createRequire(import.meta.url);
const B = require('./balloon.js');

class FakeGame {
  constructor() {
    this.B = B;
    this.level = { storm: { firstStrikeAfterShots: 1, intervalShots: 3, spawnCount: [2, 2] } };
    this.status = 'playing';
    this.paused = false;
    this.shotsUsed = 1;
    this.lightningStrikes = 0;
    this.grid = new Map([
      [B.key(3, 0), 1], [B.key(4, 0), 2], [B.key(5, 0), 3],
      [B.key(3, 1), 2], [B.key(4, 1), 1], [B.key(4, 2), 3],
    ]);
    this.objects = new Map();
    this.rng = () => .25;
    this.particles = [];
    this.reducedMotion = true;
    this.shakePower = 0;
    this.shakeTime = 0;
    this.flashStrength = 0;
    this.flashTime = 0;
    this.shotsFired = 0;
    this.lightningCallbacks = 0;
    this.emits = 0;
    this.callbacks = { onLightning: () => { this.lightningCallbacks += 1; } };
  }

  start(level) { this.level = level; }
  shoot() { this.shotsFired += 1; }
  updateEffects() {}
  runtimeStorm() { return this.level?.storm || null; }
  reconcileQueueColors() {}
  emitState() { this.emits += 1; }
  fail(reason) { this.status = 'lost'; this.failReason = reason; }
}

applyStormFeedbackPatch(FakeGame);

const game = new FakeGame();
assert.equal(game.currentWindForAim(), null, 'wind must stay visual-only and never reach aim/projectile physics');

const before = game.grid.size;
const scheduled = game.maybeStrikeLightning();
assert(scheduled, 'storm threshold should schedule a lightning telegraph');
assert.equal(game.grid.size, before, 'telegraph must happen before lightning grows the board');
assert(game.flashStrength >= .7, 'telegraph should start with a visible bright flash');
assert(game.pendingLightning, 'lightning must remain pending during the warning window');

game.shoot();
assert.equal(game.shotsFired, 0, 'player must not fire through the short lightning warning');

game.updateEffects(.18);
assert.equal(game.grid.size, before, 'halfway through the warning the board must still be unchanged');
assert(game.pendingLightning, 'warning should still be pending before its duration elapses');

game.updateEffects(.20);
assert.equal(game.pendingLightning, null, 'warning should resolve after the telegraph duration');
assert(game.grid.size > before, 'lightning impact should add connected pressure orbs after the flash');
assert.equal(game.lightningCallbacks, 1, 'impact callback should fire only at the actual strike');

console.log('✓ Visual-only wind and delayed lightning feedback');
