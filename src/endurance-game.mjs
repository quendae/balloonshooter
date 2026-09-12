import { SkyRescueGame } from './game.mjs';
import { EnduranceRenderer } from './endurance-renderer.mjs';
import {
  ENDURANCE_CONFIG,
  adjustedExpansionTimeSeconds,
  clearBonus,
  enduranceMultiplier,
  generateEnduranceRow,
  generateInitialEnduranceGrid,
  paletteForStage,
  scheduledSpecialType,
  survivalBonus,
} from './endurance-core.mjs';
import {
  canExpandSpatially,
  createEnduranceGeometry,
  failureLineReached,
  remapGridForExpansion,
  shiftGridForNewRow,
} from './endurance-geometry.mjs';
import {
  activeGridColors,
  comboCallout,
  createSeededRng,
  reconcileShotQueue,
  scoreTurn,
} from './sky-rescue-core.mjs';
import { resolveShotOnGrid } from './shot-resolution.mjs';

export class EnduranceGame extends SkyRescueGame {
  constructor(canvas, callbacks = {}, options = {}) {
    super(canvas, callbacks);
    this.config = { ...ENDURANCE_CONFIG, ...(options.config || {}) };
    this.renderer = new EnduranceRenderer(canvas, this.B);
    this.elapsedMs = 0;
    this.round = 1;
    this.shotsInRound = 0;
    this.resolvedShots = 0;
    this.difficultyStage = 0;
    this.spatialStage = 0;
    this.rowPhase = 0;
    this.clearBonusArmed = true;
    this.lastIssuedShotWasSpecial = false;
    this.pendingExpansion = null;
  }

  start(seed = 'endurance') {
    const runSeed = String(seed || 'endurance');
    this.round = 1;
    this.shotsInRound = 0;
    this.resolvedShots = 0;
    this.difficultyStage = 0;
    this.spatialStage = 0;
    this.rowPhase = 0;
    this.elapsedMs = 0;
    this.clearBonusArmed = true;
    this.lastIssuedShotWasSpecial = false;
    this.pendingExpansion = null;

    this.B = createEnduranceGeometry({ spatialStage: 0, rowPhase: 0 });
    const palette = paletteForStage(0, this.config);
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
    this.round = 1;
    this.shotsInRound = 0;
    this.resolvedShots = 0;
    this.difficultyStage = 0;
    this.spatialStage = 0;
    this.rowPhase = 0;
    this.elapsedMs = 0;
    this.clearBonusArmed = this.grid.size > 0;
    this.lastIssuedShotWasSpecial = false;
    this.pendingExpansion = null;
    this.emitState();
  }

  pickColor() {
    const palette = paletteForStage(this.difficultyStage, this.config);
    const active = activeGridColors(this.grid).filter((color) => palette.includes(color));
    const colors = active.length ? active : palette;
    return colors[Math.min(colors.length - 1, Math.floor(this.rng() * colors.length))];
  }

  nextShot() {
    const special = scheduledSpecialType({
      round: this.round,
      resolvedShots: this.resolvedShots,
      previousWasSpecial: this.lastIssuedShotWasSpecial,
    }, this.config);
    const shot = special
      ? { type: special, color: special === 'rainbow' ? 0 : this.pickColor() }
      : { type: 'normal', color: this.pickColor() };
    this.lastIssuedShotWasSpecial = shot.type !== 'normal';
    return shot;
  }

  reconcileQueueColors() {
    const palette = paletteForStage(this.difficultyStage, this.config);
    const active = activeGridColors(this.grid).filter((color) => palette.includes(color));
    const playable = active.length ? active : palette;
    this.queue = reconcileShotQueue(this.queue, playable, (colors) => (
      colors[Math.min(colors.length - 1, Math.floor(this.rng() * colors.length))]
    ));
  }

  shoot() {
    if (this.pendingExpansion) return;
    return super.shoot();
  }

  update(dt) {
    if (this.paused || this.status !== 'playing') return;
    const safeDt = Math.max(0, Number(dt) || 0);
    this.elapsedMs += safeDt * 1000;

    if (this.pendingExpansion) {
      this.advanceExpansion(safeDt);
      return;
    }

    super.update(safeDt);
    if (!this.projectile && !this.pendingExpansion && this.status === 'playing') {
      this.maybeAdvanceDifficultyStage();
    }
  }

  maybeAdvanceDifficultyStage() {
    if (this.status !== 'playing' || this.pendingExpansion) return false;
    const nextStage = this.difficultyStage + 1;
    const lowest = this.B.lowestRow(this.grid);
    const pressure = lowest < 0 ? 0 : lowest / Math.max(1, this.B.MAXROW);
    const thresholdMs = adjustedExpansionTimeSeconds(nextStage, pressure, this.config) * 1000;
    if (this.elapsedMs < thresholdMs) return false;

    this.difficultyStage = nextStage;
    this.reconcileQueueColors();
    this.callbacks.onEnduranceStage?.({ difficultyStage: this.difficultyStage, pressure });

    if (!canExpandSpatially(this.spatialStage, this.config)) {
      this.emitState();
      return true;
    }

    const fromGeometry = this.B;
    const toGeometry = createEnduranceGeometry({ spatialStage: this.spatialStage + 1, rowPhase: this.rowPhase });
    const fromGrid = new Map(this.grid);
    const toGrid = remapGridForExpansion(this.grid);
    this.pendingExpansion = {
      fromGeometry,
      toGeometry,
      fromGrid,
      toGrid,
      elapsed: 0,
      duration: Math.max(.01, Number(this.config.zoomDurationSeconds) || .6),
    };
    this.callbacks.onEnduranceExpansionStart?.({ from: this.spatialStage, to: this.spatialStage + 1 });
    this.emitState();
    return true;
  }

  advanceExpansion(dt) {
    const pending = this.pendingExpansion;
    if (!pending || this.paused || this.status !== 'playing') return;
    pending.elapsed = Math.min(pending.duration, pending.elapsed + Math.max(0, Number(dt) || 0));
    if (pending.elapsed < pending.duration) return;

    this.grid = pending.toGrid;
    this.B = pending.toGeometry;
    this.spatialStage += 1;
    this.pendingExpansion = null;
    this.reconcileQueueColors();
    if (failureLineReached(this.grid, this.B)) {
      this.finishEndurance('Kulki dotarły do wyrzutni.');
      return;
    }
    this.callbacks.onEnduranceExpansion?.({ spatialStage: this.spatialStage, radius: this.B.RAD });
    this.emitState();
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

    const successful = popped.length || dropped.length;
    if (successful) this.combo += 1;
    else {
      this.combo = 0;
      this.misses += 1;
    }

    this.shotsUsed += 1;
    this.turnsSurvived += 1;
    const breakdown = scoreTurn({
      popped: popped.length,
      dropped: dropped.length,
      combo: Math.max(1, this.combo),
      cascadeCount: dropped.length >= 3 ? 1 : 0,
    });
    this.lastBreakdown = breakdown;
    this.spawnEffects(popped, dropped, beforeGrid, shot.type);
    const callout = comboCallout(popped.length, dropped.length);
    if (callout) this.callbacks.onCallout?.(callout);

    this.reconcileQueueColors();
    this.afterResolvedEnduranceShot({ popped: popped.length, dropped: dropped.length, turnScore: breakdown.total });
    if (this.status === 'playing') this.emitState();
  }

  afterResolvedEnduranceShot({ turnScore = 0 } = {}) {
    if (this.status !== 'playing') return;
    this.resolvedShots += 1;
    this.shotsInRound += 1;
    this.score += Math.round((Number(turnScore) || 0) * enduranceMultiplier(this.round, this.config));

    this.applyEnduranceClearBonus();
    if (this.status !== 'playing') return;
    if (failureLineReached(this.grid, this.B)) return this.finishEndurance('Kulki dotarły do wyrzutni.');

    if (this.shotsInRound >= this.config.shotsPerRound) {
      this.insertEnduranceRow();
      if (this.status !== 'playing') return;
      this.shotsInRound = 0;
      this.round += 1;
      this.score += survivalBonus(this.round, this.config);
    }
  }

  applyEnduranceClearBonus() {
    if (this.grid.size > 0) {
      this.clearBonusArmed = true;
      return false;
    }
    if (!this.clearBonusArmed) return false;
    this.score += clearBonus(this.round, this.config);
    this.clearBonusArmed = false;
    this.callbacks.onCallout?.('CLEAR BONUS');
    return true;
  }

  insertEnduranceRow() {
    const shifted = shiftGridForNewRow(this.grid, this.B);
    if (shifted.overflowed) return this.finishEndurance('Kulki dotarły do wyrzutni.');

    this.rowPhase = shifted.nextRowPhase;
    this.B = createEnduranceGeometry({ spatialStage: this.spatialStage, rowPhase: this.rowPhase });
    this.grid = shifted.grid;
    if (failureLineReached(this.grid, this.B)) return this.finishEndurance('Kulki dotarły do wyrzutni.');

    const palette = paletteForStage(this.difficultyStage, this.config);
    for (const cell of generateEnduranceRow({ geometry: this.B, targetRow: 0, palette, rng: this.rng })) {
      this.B.setBalloon(this.grid, cell.c, cell.r, cell.color);
    }
    this.clearBonusArmed = true;
    this.reconcileQueueColors();
    if (failureLineReached(this.grid, this.B)) return this.finishEndurance('Kulki dotarły do wyrzutni.');
    this.callbacks.onEnduranceRow?.({ round: this.round + 1, gridSize: this.grid.size });
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
      queue: this.queue.map((shot) => ({ ...shot })),
      shotsUsed: this.shotsUsed,
      resolvedShots: this.resolvedShots,
      round: this.round,
      shotsInRound: this.shotsInRound,
      shotsUntilRow: Math.max(0, this.config.shotsPerRound - this.shotsInRound),
      elapsedMs: this.elapsedMs,
      difficultyStage: this.difficultyStage,
      spatialStage: this.spatialStage,
      expanding: Boolean(this.pendingExpansion),
      misses: this.misses,
      boss: false,
    };
  }

  renderState() {
    const base = super.renderState();
    let transitionCells = null;
    if (this.pendingExpansion) {
      const pending = this.pendingExpansion;
      const t = Math.max(0, Math.min(1, pending.elapsed / pending.duration));
      const smooth = t * t * (3 - 2 * t);
      transitionCells = [...pending.fromGrid.entries()].map(([key, color]) => {
        const [c, r] = pending.fromGeometry.split(key);
        const fromX = pending.fromGeometry.colX(c, r);
        const fromY = pending.fromGeometry.rowY(r);
        const toX = pending.toGeometry.colX(c + 1, r);
        const toY = pending.toGeometry.rowY(r);
        return {
          color,
          x: fromX + (toX - fromX) * smooth,
          y: fromY + (toY - fromY) * smooth,
          radius: pending.fromGeometry.RAD + (pending.toGeometry.RAD - pending.fromGeometry.RAD) * smooth,
        };
      });
    }
    return {
      ...base,
      mode: 'endurance',
      geometry: this.B,
      transitionCells,
    };
  }

  finishEndurance(reason = 'Kulki dotarły do wyrzutni.') {
    if (this.status !== 'playing') return;
    this.status = 'lost';
    const result = {
      score: this.score,
      elapsedMs: this.elapsedMs,
      round: this.round,
      resolvedShots: this.resolvedShots,
      misses: this.misses,
      reason,
    };
    this.emitState();
    clearTimeout(this.finishTimer);
    this.finishTimer = setTimeout(() => this.callbacks.onEnduranceEnd?.(result), 260);
  }
}
