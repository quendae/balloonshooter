import { activeGridColors } from './sky-rescue-core.mjs';
import { lightningSpawnPlan, shouldTriggerLightning } from './storm-core.mjs';

const TELEGRAPH_SECONDS = 0.36;

export function applyStormFeedbackPatch(SkyRescueGame) {
  const prototype = SkyRescueGame?.prototype;
  if (!prototype || prototype.__stormFeedbackPatchApplied) return;

  const originalStart = prototype.start;
  const originalShoot = prototype.shoot;
  const originalUpdateEffects = prototype.updateEffects;

  prototype.start = function startWithStormFeedback(level) {
    const result = originalStart.call(this, level);
    this.pendingLightning = null;
    this.lightningWarningFx = null;
    return result;
  };

  prototype.currentWindForAim = function visualWindOnly() {
    return null;
  };

  prototype.shoot = function shootWithLightningLock() {
    if (this.pendingLightning || this.lightningWarningFx) return;
    return originalShoot.call(this);
  };

  prototype.maybeStrikeLightning = function scheduleLightningTelegraph() {
    const storm = this.runtimeStorm();
    if (this.pendingLightning || !shouldTriggerLightning(storm, this.shotsUsed, this.lightningStrikes)) return null;

    this.lightningStrikes += 1;
    this.pendingLightning = {
      storm: { ...storm },
      life: TELEGRAPH_SECONDS,
      maxLife: TELEGRAPH_SECONDS,
    };
    this.lightningWarningFx = {
      life: TELEGRAPH_SECONDS,
      maxLife: TELEGRAPH_SECONDS,
    };

    this.flashStrength = Math.max(this.flashStrength, .72);
    this.flashTime = Math.max(this.flashTime, .12);
    this.callbacks.onLightningWarning?.({ strike: this.lightningStrikes });
    return this.pendingLightning;
  };

  prototype.resolvePendingLightning = function resolvePendingLightning() {
    const pending = this.pendingLightning;
    if (!pending || this.status !== 'playing') return null;
    this.pendingLightning = null;
    this.lightningWarningFx = null;

    const palette = activeGridColors(this.grid);
    const plan = lightningSpawnPlan({
      grid: this.grid,
      objects: this.objects,
      B: this.B,
      palette,
      rng: this.rng,
      spawnCount: pending.storm?.spawnCount,
      failureY: this.B.LAUNCH_Y - 17,
    });
    if (!plan.strikeKey || !plan.additions.length) {
      this.emitState();
      return plan;
    }

    for (const item of plan.additions) this.B.setBalloon(this.grid, item.c, item.r, item.color);
    const [strikeC, strikeR] = this.B.split(plan.strikeKey);
    this.lightningFx = {
      key: plan.strikeKey,
      x: this.B.colX(strikeC, strikeR),
      y: this.B.rowY(strikeR),
      life: .32,
      maxLife: .32,
    };

    if (!this.reducedMotion) {
      this.shakePower = Math.max(this.shakePower, 6);
      this.shakeTime = Math.max(this.shakeTime, .26);
    }
    this.flashStrength = Math.max(this.flashStrength, .42);
    this.flashTime = Math.max(this.flashTime, .14);

    for (let i = 0; i < 14; i += 1) {
      const angle = this.rng() * Math.PI * 2;
      const speed = 32 + this.rng() * 62;
      const life = .28 + this.rng() * .2;
      this.particles.push({
        x: this.lightningFx.x,
        y: this.lightningFx.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: i % 3 === 0 ? '#fff8c8' : '#d6ecff',
        size: 1.5 + this.rng() * 2,
      });
    }

    this.reconcileQueueColors();
    this.callbacks.onLightning?.({ ...plan, strike: this.lightningStrikes });

    const lowest = this.B.lowestRow(this.grid);
    if (lowest >= 0 && this.B.rowY(lowest) + this.B.RAD >= this.B.LAUNCH_Y - 17) {
      this.fail('Piorun zepchnął kulki zbyt nisko.');
      return plan;
    }

    this.emitState();
    return plan;
  };

  prototype.updateEffects = function updateEffectsWithLightningTelegraph(dt) {
    originalUpdateEffects.call(this, dt);
    if (!this.pendingLightning || this.paused || this.status !== 'playing') return;

    this.pendingLightning.life = Math.max(0, this.pendingLightning.life - dt);
    if (this.lightningWarningFx) this.lightningWarningFx.life = this.pendingLightning.life;
    if (this.pendingLightning.life <= 0) this.resolvePendingLightning();
  };

  prototype.__stormFeedbackPatchApplied = true;
}
