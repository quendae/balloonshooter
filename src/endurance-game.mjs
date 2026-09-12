import { SkyRescueGame } from './game.mjs';
import { EnduranceRenderer } from './endurance-renderer.mjs';
import {
  ENDURANCE_CONFIG,
  clearBonus,
  enduranceMultiplier,
  generateEnduranceRow,
  generateInitialEnduranceGrid,
  paletteForStage,
  scheduledSpecialType,
  survivalBonus,
} from './endurance-core.mjs';
import {
  createEnduranceGeometry,
  failureLineReached,
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
      misses: this.misses,
      boss: false,
    };
  }

  renderState() {
    return {
      ...super.renderState(),
      mode: 'endurance',
      geometry: this.B,
      transitionCells: null,
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
