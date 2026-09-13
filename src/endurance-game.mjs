import { SkyRescueGame } from './game.mjs';
import { EnduranceRenderer } from './endurance-renderer.mjs';
import {
  ENDURANCE_CONFIG,
  classifyEnduranceResolution,
  enduranceComboMultiplier,
  generateEnduranceRow,
  generateInitialEnduranceGrid,
  paletteForElapsed,
  paletteStageAt,
  scheduledSpecialType,
  specialShotLabel,
} from './endurance-core.mjs';
import {
  createEnduranceGeometry,
  failureLineReached,
  shiftGridForNewRow,
} from './endurance-geometry.mjs';
import {
  comboCallout,
  createSeededRng,
  reconcileShotQueue,
  scoreTurn,
} from './sky-rescue-core.mjs';
import { resolveShotOnGrid } from './shot-resolution.mjs';

function enduranceAtmosphereState(elapsedMs, config) {
  const stage = paletteStageAt(elapsedMs, config);
  if (stage === 0) return { stage: 0, fromStage: 0, progress: 1 };
  const threshold = Number(config.paletteThresholdMs?.[stage - 1]) || 0;
  const duration = Math.max(1, Number(config.atmosphereTransitionMs) || 1500);
  return {
    stage,
    fromStage: stage - 1,
    progress: Math.min(1, Math.max(0, (elapsedMs - threshold) / duration)),
  };
}

export class EnduranceGame extends SkyRescueGame {
  constructor(canvas, callbacks = {}, options = {}) {
    super(canvas, callbacks);
    this.config = { ...ENDURANCE_CONFIG, ...(options.config || {}) };
    this.renderer = new EnduranceRenderer(canvas, this.B);
    this.elapsedMs = 0;
    this.resolvedShots = 0;
    this.rowPhase = 0;
    this.rowsAdded = 0;
    this.bestCombo = 0;
    this.paletteStage = 0;
    this.clearBonusArmed = true;
    this.lastIssuedShotWasSpecial = false;
    this.issuedShots = 0;
    this.lastSpecialCalloutAt = new Map();
  }

  start(seed = 'endurance') {
    const runSeed = String(seed || 'endurance');
    this.elapsedMs = 0;
    this.resolvedShots = 0;
    this.rowPhase = 0;
    this.rowsAdded = 0;
    this.bestCombo = 0;
    this.paletteStage = 0;
    this.clearBonusArmed = true;
    this.lastIssuedShotWasSpecial = false;
    this.issuedShots = 0;
    this.lastSpecialCalloutAt = new Map();

    this.B = createEnduranceGeometry({ rowPhase: 0 });
    const palette = paletteForElapsed(0, this.config);
    const initialRng = createSeededRng(this.hashSeed(`endurance-grid-${runSeed}`));
    const initialGrid = generateInitialEnduranceGrid({
      geometry: this.B,
      palette,
      rng: initialRng,
      rows: this.config.initialRows,
    });
    const grid = [...initialGrid.entries()].map(([key, color]) => {
      const [c, r] = this.B.split(key);
      return { c, r, color };
    });

    const level = {
      id: `endurance-${runSeed}`,
      number: 0,
      name: 'Endurance',
      world: 'meadow',
      atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: .15 },
      grid,
      objects: [],
      objective: { type: 'survive', amount: Number.MAX_SAFE_INTEGER },
      maxShots: Number.MAX_SAFE_INTEGER,
      shotsPerDrop: Number.MAX_SAFE_INTEGER,
      starThresholds: [0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      specials: [],
    };

    super.start(level);
    this.resolvedShots = 0;
    this.rowPhase = 0;
    this.rowsAdded = 0;
    this.bestCombo = 0;
    this.paletteStage = 0;
    this.elapsedMs = 0;
    this.clearBonusArmed = this.grid.size > 0;
    this.lastSpecialCalloutAt = new Map();
    this.maybeAnnounceActiveSpecial();
    this.emitState();
  }

  activePalette() {
    return paletteForElapsed(this.elapsedMs, this.config);
  }

  pickColor() {
    const colors = this.activePalette();
    return colors[Math.min(colors.length - 1, Math.floor(this.rng() * colors.length))];
  }

  nextShot() {
    const schedulePosition = this.issuedShots;
    const special = scheduledSpecialType({
      resolvedShots: schedulePosition,
      previousWasSpecial: this.lastIssuedShotWasSpecial,
    }, this.config);
    const shot = special
      ? { type: special, color: special === 'rainbow' ? 0 : this.pickColor() }
      : { type: 'normal', color: this.pickColor() };
    this.lastIssuedShotWasSpecial = shot.type !== 'normal';
    this.issuedShots += 1;
    return shot;
  }

  reconcileQueueColors() {
    const palette = this.activePalette();
    this.queue = reconcileShotQueue(this.queue, palette, (colors) => (
      colors[Math.min(colors.length - 1, Math.floor(this.rng() * colors.length))]
    ));
  }

  update(dt) {
    if (this.paused || this.status !== 'playing') return;
    const safeDt = Math.max(0, Number(dt) || 0);
    this.elapsedMs += safeDt * 1000;
    this.advancePaletteStage();
    super.update(safeDt);
  }

  advancePaletteStage() {
    const nextStage = paletteStageAt(this.elapsedMs, this.config);
    if (nextStage <= this.paletteStage) return false;
    for (let stage = this.paletteStage + 1; stage <= nextStage; stage += 1) {
      this.paletteStage = stage;
      this.reconcileQueueColors();
      this.callbacks.onEndurancePalette?.({ stage, colorCount: this.activePalette().length });
    }
    if (!this.projectile) this.maybeAnnounceActiveSpecial();
    this.emitState();
    return true;
  }

  land() {
    const shot = this.projectile;
    this.projectile = null;
    if (!shot) return;
    const snap = this.B.findSnap(this.grid, shot.x, shot.y, this.B.PH * 1.6, 0);
    if (!snap) return this.finishEndurance('Kulki dotarły do wyrzutni.');

    const beforeGrid = new Map(this.grid);
    const [c, r] = snap;
    const { popped, dropped } = resolveShotOnGrid({
      grid: this.grid,
      shot,
      c,
      r,
      geometry: this.B,
      pickColor: () => this.pickColor(),
      ceilRow: 0,
    });

    this.shotsUsed += 1;
    this.turnsSurvived += 1;
    const breakdown = scoreTurn({
      popped: popped.length,
      dropped: dropped.length,
      combo: 1,
      cascadeCount: dropped.length >= 3 ? 1 : 0,
    });
    this.lastBreakdown = breakdown;
    this.spawnEffects(popped, dropped, beforeGrid, shot.type);
    const callout = comboCallout(popped.length, dropped.length);
    if (callout) this.callbacks.onCallout?.(callout);

    this.afterResolvedEnduranceShot({
      popped: popped.length,
      dropped: dropped.length,
      turnScore: breakdown.total,
    });
    if (this.status !== 'playing') return;
    this.reconcileQueueColors();
    this.maybeAnnounceActiveSpecial();
    this.emitState();
  }

  afterResolvedEnduranceShot({ popped = 0, dropped = 0, turnScore = 0 } = {}) {
    if (this.status !== 'playing') return;
    this.resolvedShots += 1;
    const { successful } = classifyEnduranceResolution({ popped, dropped });

    if (successful) {
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += Math.round((Number(turnScore) || 0) * enduranceComboMultiplier(this.combo, this.config));
    } else {
      this.combo = 0;
      this.misses += 1;
      this.insertEnduranceRow();
      if (this.status !== 'playing') return;
    }

    this.applyEnduranceClearBonus();
    if (failureLineReached(this.grid, this.B)) this.finishEndurance('Kulki dotarły do wyrzutni.');
  }

  applyEnduranceClearBonus() {
    if (this.grid.size > 0) {
      this.clearBonusArmed = true;
      return false;
    }
    if (!this.clearBonusArmed) return false;
    this.score += Math.max(0, Number(this.config.clearBonus) || 0);
    this.clearBonusArmed = false;
    this.callbacks.onCallout?.('CLEAR BONUS');
    return true;
  }

  insertEnduranceRow() {
    const shifted = shiftGridForNewRow(this.grid, this.B);
    if (shifted.overflowed) {
      this.finishEndurance('Kulki dotarły do wyrzutni.');
      return false;
    }

    this.rowPhase = shifted.nextRowPhase;
    this.B = createEnduranceGeometry({ rowPhase: this.rowPhase });
    this.grid = shifted.grid;
    if (failureLineReached(this.grid, this.B)) {
      this.finishEndurance('Kulki dotarły do wyrzutni.');
      return false;
    }

    const palette = this.activePalette();
    for (const cell of generateEnduranceRow({ geometry: this.B, targetRow: 0, palette, rng: this.rng })) {
      this.B.setBalloon(this.grid, cell.c, cell.r, cell.color);
    }
    this.rowsAdded += 1;
    this.clearBonusArmed = true;
    this.reconcileQueueColors();
    if (failureLineReached(this.grid, this.B)) {
      this.finishEndurance('Kulki dotarły do wyrzutni.');
      return false;
    }
    this.callbacks.onEnduranceRow?.({ rowsAdded: this.rowsAdded, gridSize: this.grid.size });
    return true;
  }

  maybeAnnounceActiveSpecial() {
    if (this.projectile || this.status !== 'playing') return false;
    const type = this.queue[0]?.type;
    if (!['bomb', 'rainbow', 'guide'].includes(type)) return false;
    const last = this.lastSpecialCalloutAt.get(type) ?? -Infinity;
    const cooldown = Math.max(0, Number(this.config.specialCalloutCooldownMs) || 0);
    if (this.elapsedMs - last < cooldown) return false;
    this.lastSpecialCalloutAt.set(type, this.elapsedMs);
    this.callbacks.onEnduranceSpecialReady?.({ type, label: specialShotLabel(type) });
    return true;
  }

  getSnapshot() {
    if (!this.level) return null;
    return {
      mode: 'endurance',
      status: this.status,
      paused: this.paused,
      levelId: this.level.id,
      levelName: 'Endurance',
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      queue: this.queue.map((shot) => ({ ...shot })),
      shotsUsed: this.shotsUsed,
      resolvedShots: this.resolvedShots,
      elapsedMs: this.elapsedMs,
      paletteStage: this.paletteStage,
      colorCount: this.activePalette().length,
      misses: this.misses,
      rowsAdded: this.rowsAdded,
      boss: false,
    };
  }

  renderState() {
    return {
      ...super.renderState(),
      mode: 'endurance',
      geometry: this.B,
      enduranceAtmosphere: enduranceAtmosphereState(this.elapsedMs, this.config),
    };
  }

  finishEndurance(reason = 'Kulki dotarły do wyrzutni.') {
    if (this.status !== 'playing') return;
    this.status = 'lost';
    const result = {
      score: this.score,
      elapsedMs: this.elapsedMs,
      bestCombo: this.bestCombo,
      resolvedShots: this.resolvedShots,
      misses: this.misses,
      rowsAdded: this.rowsAdded,
      reason,
    };
    this.emitState();
    clearTimeout(this.finishTimer);
    this.finishTimer = setTimeout(() => this.callbacks.onEnduranceEnd?.(result), 260);
  }
}
