import {
  activeGridColors,
  bombAffectedKeys,
  calculateStars,
  chooseRainbowColor,
  comboCallout,
  createSeededRng,
  evaluateObjective,
  impactFeedback,
  isOptionalComplete,
  objectiveLabel,
  reconcileShotQueue,
  scoreTurn,
} from './sky-rescue-core.mjs';
import {
  SHOT_SPEED,
  clampAimAngle,
  shortTrajectoryPreview,
  shouldShowTrajectory,
  stepProjectile,
  toLogicalPoint,
  trajectoryPoints,
  velocityFromAngle,
} from './game-physics.mjs';
import { GameRenderer } from './game-renderer.mjs';
import { drawWindCorridors } from './wind-renderer.mjs';

const MIN_AIM_Y = 242;
const FX_COLORS = ['#000', '#ff4455', '#a05cf0', '#ffd93d', '#4cc94c', '#4da3ff', '#ff6fb3'];

export class SkyRescueGame {
  constructor(canvas, callbacks = {}) {
    if (!globalThis.BALLOON) throw new Error('Load balloon.js before Sky Rescue');
    this.B = globalThis.BALLOON;
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.renderer = new GameRenderer(canvas, this.B);
    this.grid = new Map();
    this.objects = new Map();
    this.queue = [];
    this.particles = [];
    this.falling = [];
    this.projectile = null;
    this.level = null;
    this.status = 'idle';
    this.paused = false;
    this.aimAngle = -Math.PI / 2;
    this.raf = 0;
    this.lastTime = 0;
    this.finishTimer = 0;
    this.shakeTime = 0;
    this.shakePower = 0;
    this.flashTime = 0;
    this.flashStrength = 0;
    this.reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Plansza Sky Rescue. Celuj myszą lub strzałkami i strzelaj spacją.');
    this.pointerMove = (e) => this.onPointerMove(e);
    this.pointerDown = (e) => this.onPointerDown(e);
    this.keyDown = (e) => this.onKeyDown(e);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('keydown', this.keyDown);
    this.tick = this.tick.bind(this);
  }

  start(level) {
    clearTimeout(this.finishTimer);
    this.level = level;
    this.rng = createSeededRng(this.hashSeed(level.id));
    this.grid = new Map(level.grid.map(({ c, r, color }) => [this.B.key(c, r), color]));
    this.objects = new Map(level.objects.map((object) => [object.at.join(','), { ...object }]));
    this.queue = [];
    this.particles = [];
    this.falling = [];
    this.projectile = null;
    this.status = 'playing';
    this.paused = false;
    this.ceilRow = 0;
    this.score = 0;
    this.combo = 0;
    this.shotsUsed = 0;
    this.misses = 0;
    this.turnsSurvived = 0;
    this.rescued = 0;
    this.collected = 0;
    this.anchorsDestroyed = 0;
    this.currentDropLimit = level.shotsPerDrop;
    this.shotsUntilDrop = this.currentDropLimit;
    this.lastBreakdown = null;
    this.specialDeck = [...(level.specials || [])];
    this.specialCursor = 0;
    this.aimAngle = -Math.PI / 2;
    this.currentWind = level.wind ? { ...level.wind } : null;
    this.shakeTime = 0;
    this.shakePower = 0;
    this.flashTime = 0;
    this.flashStrength = 0;
    this.fillQueue();
    this.emitState();
    cancelAnimationFrame(this.raf);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.finishTimer);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('keydown', this.keyDown);
  }

  setPaused(value) {
    if (this.status !== 'playing') return;
    this.paused = Boolean(value);
    this.emitState();
  }

  hashSeed(text) {
    let hash = 2166136261;
    for (const char of text) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  objectiveState() {
    return {
      remainingBalloons: this.grid.size,
      rescued: this.rescued,
      collected: this.collected,
      anchorsDestroyed: this.anchorsDestroyed,
      turnsSurvived: this.turnsSurvived,
    };
  }

  getSnapshot() {
    if (!this.level) return null;
    return {
      status: this.status,
      paused: this.paused,
      levelId: this.level.id,
      levelName: this.level.name,
      score: this.score,
      combo: this.combo,
      objectiveLabel: objectiveLabel(this.level.objective),
      objective: evaluateObjective(this.level.objective, this.objectiveState()),
      queue: this.queue.map((shot) => ({ ...shot })),
      shotsUsed: this.shotsUsed,
      shotsRemaining: Math.max(0, this.level.maxShots - this.shotsUsed),
      shotsUntilDrop: this.shotsUntilDrop,
      misses: this.misses,
      boss: Boolean(this.level.boss),
      bossPhase: this.anchorsDestroyed,
      bossPhases: this.level.objective.type === 'anchors' ? this.level.objective.amount : 0,
    };
  }

  fillQueue() {
    while (this.queue.length < 3) this.queue.push(this.nextShot());
  }

  nextShot() {
    const specialReady = this.specialCursor < this.specialDeck.length && this.shotsUsed >= 2 + this.specialCursor * 4;
    if (specialReady) {
      const type = this.specialDeck[this.specialCursor++];
      return { type, color: type === 'rainbow' ? 0 : this.pickColor() };
    }
    return { type: 'normal', color: this.pickColor() };
  }

  pickColor() {
    const colors = activeGridColors(this.grid);
    if (!colors.length) return 1;
    return colors[Math.min(colors.length - 1, Math.floor(this.rng() * colors.length))];
  }

  reconcileQueueColors() {
    const colors = activeGridColors(this.grid);
    if (!colors.length) return;
    this.queue = reconcileShotQueue(this.queue, colors, (playable) => (
      playable[Math.min(playable.length - 1, Math.floor(this.rng() * playable.length))]
    ));
  }

  onPointerMove(event) {
    if (this.status !== 'playing') return;
    const p = toLogicalPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.B.LW, this.B.LH);
    if (p.y < MIN_AIM_Y) this.setAim(p.x, p.y);
  }

  onPointerDown(event) {
    if (this.status !== 'playing' || this.paused) return;
    const p = toLogicalPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.B.LW, this.B.LH);
    if (p.y >= MIN_AIM_Y) return;
    event.preventDefault();
    this.setAim(p.x, p.y);
    this.canvas.focus({ preventScroll: true });
    this.shoot();
  }

  onKeyDown(event) {
    if (this.status !== 'playing') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -.055 : .055;
      this.aimAngle = clampAimAngle(this.aimAngle + delta);
    } else if ((event.key === ' ' || event.key === 'Enter') && !this.paused) {
      event.preventDefault();
      this.shoot();
    }
  }

  setAim(x, y) {
    this.aimAngle = clampAimAngle(Math.atan2(y - this.B.LAUNCH_Y, x - this.B.LW / 2));
  }

  currentWindForAim() {
    if (this.currentWind) return this.currentWind;
    if (Array.isArray(this.level?.windZones)) return this.level.windZones;
    return null;
  }

  shoot() {
    if (this.projectile || this.status !== 'playing' || this.paused || !this.queue.length) return;
    const shot = this.queue.shift();
    const velocity = velocityFromAngle(this.aimAngle, SHOT_SPEED);
    const activeWind = this.currentWindForAim();
    const wind = Array.isArray(activeWind)
      ? activeWind.map((zone) => ({ ...zone }))
      : { ...(activeWind || { forceX: 0, forceY: 0 }) };
    this.projectile = { ...shot, x: this.B.LW / 2, y: this.B.LAUNCH_Y, ...velocity, wind };
    this.fillQueue();
    this.callbacks.onShot?.(shot);
    this.emitState();
  }

  tick(time) {
    const dt = Math.min(.033, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (!this.paused && this.status === 'playing') this.update(dt);
    this.updateEffects(dt);
    const state = this.renderState();
    this.renderer.draw(state, time);
    drawWindCorridors(this.renderer.ctx, state.level?.windZones || [], time);
    this.raf = requestAnimationFrame(this.tick);
  }

  renderState() {
    const readyToAim = Boolean(this.level && !this.projectile && this.status === 'playing' && !this.paused);
    const ceilingY = this.level ? this.B.rowY(this.ceilRow) - this.B.RAD * .85 : 0;
    const showTrajectory = Boolean(readyToAim && shouldShowTrajectory(this.queue[0]));
    const velocity = velocityFromAngle(this.aimAngle, SHOT_SPEED);
    const wind = this.currentWindForAim();
    const bounds = { minX: this.B.RAD, maxX: this.B.LW - this.B.RAD };
    const trajectory = showTrajectory ? trajectoryPoints({
      x: this.B.LW / 2, y: this.B.LAUNCH_Y, ...velocity,
      bounds,
      ceilingY,
      collides: (x, y) => this.collides(x, y),
      wind,
    }) : [];
    const shortAim = readyToAim && !showTrajectory ? shortTrajectoryPreview({
      x: this.B.LW / 2,
      y: this.B.LAUNCH_Y,
      ...velocity,
      bounds,
      ceilingY,
      collides: (x, y) => this.collides(x, y),
      wind,
      maxDistance: 40,
    }) : [];
    const aimSegment = shortAim.length
      ? { start: shortAim[0], end: shortAim.at(-1), points: shortAim }
      : null;
    const shake = !this.reducedMotion && this.shakeTime > 0
      ? this.shakePower * Math.min(1, this.shakeTime / .12)
      : 0;
    const flash = this.flashTime > 0
      ? this.flashStrength * Math.min(1, this.flashTime / .08)
      : 0;
    return {
      level: this.level, grid: this.grid, objects: this.objects, queue: this.queue,
      projectile: this.projectile, particles: this.particles, falling: this.falling,
      status: this.status, paused: this.paused, ceilRow: this.ceilRow,
      trajectory, showTrajectory, aimSegment, currentWind: this.currentWind,
      shake, flash,
    };
  }

  update(dt) {
    if (!this.projectile) return;
    const bounds = { minX: this.B.RAD, maxX: this.B.LW - this.B.RAD };
    const beforeVx = this.projectile.vx;
    this.projectile = stepProjectile(this.projectile, dt, bounds, this.projectile.wind);
    const hitWall = this.projectile.x === bounds.minX || this.projectile.x === bounds.maxX;
    if (hitWall && Math.sign(beforeVx) !== Math.sign(this.projectile.vx)) this.callbacks.onBounce?.();
    const ceilingY = this.B.rowY(this.ceilRow) - this.B.RAD * .85;
    if (this.projectile.y <= ceilingY || this.collides(this.projectile.x, this.projectile.y)) this.land();
  }

  collides(x, y) {
    for (const key of this.grid.keys()) {
      const [c, r] = this.B.split(key);
      if (this.B.dist(x, y, this.B.colX(c, r), this.B.rowY(r)) <= this.B.RAD * 1.86) return true;
    }
    return false;
  }

  land() {
    const shot = this.projectile;
    this.projectile = null;
    const snap = this.B.findSnap(this.grid, shot.x, shot.y, this.B.PH * 1.6, this.ceilRow);
    if (!snap) return this.fail('Nie ma już miejsca na bezpieczny strzał.');
    const beforeGrid = new Map(this.grid);
    const [c, r] = snap;
    let popped = [];
    let dropped = [];

    if (shot.type === 'bomb') {
      this.B.setBalloon(this.grid, c, r, shot.color || this.pickColor());
      popped = bombAffectedKeys(c, r, this.B.neighbors).filter((key) => this.grid.has(key));
      popped.forEach((key) => this.grid.delete(key));
      dropped = this.dropDisconnected();
    } else {
      const color = shot.type === 'rainbow'
        ? chooseRainbowColor(this.grid, c, r, this.B.neighbors) || this.pickColor()
        : shot.color;
      this.B.setBalloon(this.grid, c, r, color);
      const result = this.B.settle(this.grid, c, r, this.ceilRow);
      popped = result.popped;
      dropped = result.dropped;
    }

    this.reconcileQueueColors();
    const progressBefore = this.rescued + this.collected + this.anchorsDestroyed;
    const objectiveBonus = this.resolveObjects([...popped, ...dropped]);
    const progressDelta = this.rescued + this.collected + this.anchorsDestroyed - progressBefore;
    const successful = popped.length || dropped.length || progressDelta;
    if (successful) {
      this.combo += 1;
      this.shotsUntilDrop = this.currentDropLimit;
    } else {
      this.combo = 0;
      this.misses += 1;
      this.shotsUntilDrop -= 1;
    }

    this.shotsUsed += 1;
    this.turnsSurvived += 1;
    const breakdown = scoreTurn({ popped: popped.length, dropped: dropped.length, combo: Math.max(1, this.combo), objectiveBonus, cascadeCount: dropped.length >= 3 ? 1 : 0 });
    this.score += breakdown.total;
    this.spawnEffects(popped, dropped, beforeGrid, shot.type);
    const callout = comboCallout(popped.length, dropped.length);
    if (callout) this.callbacks.onCallout?.(callout);

    if (this.level.boss && progressDelta && this.level.objective.type === 'anchors') {
      this.currentDropLimit = Math.max(3, this.level.shotsPerDrop - this.anchorsDestroyed);
      this.shotsUntilDrop = Math.min(this.shotsUntilDrop, this.currentDropLimit);
      this.callbacks.onBossPhase?.({ current: this.anchorsDestroyed, total: this.level.objective.amount });
    }

    if (evaluateObjective(this.level.objective, this.objectiveState()).complete) return this.complete();
    if (this.shotsUntilDrop <= 0) this.shiftCeiling();
    if (this.status !== 'playing') return;
    if (this.level.maxShots - this.shotsUsed <= 0) return this.fail('Skończyły się strzały.');
    const lowest = this.B.lowestRow(this.grid);
    if (lowest >= 0 && this.B.rowY(lowest) + this.B.RAD >= this.B.LAUNCH_Y - 17) return this.fail('Kulki zeszły zbyt nisko.');
    this.emitState();
  }

  dropDisconnected() {
    const connected = this.B.topConnected(this.grid, this.ceilRow);
    const dropped = [...this.grid.keys()].filter((key) => !connected.has(key));
    dropped.forEach((key) => this.grid.delete(key));
    return dropped;
  }

  resolveObjects(keys) {
    let bonus = 0;
    for (const key of new Set(keys)) {
      const object = this.objects.get(key);
      if (!object) continue;
      this.objects.delete(key);
      if (object.type === 'captive') { this.rescued += 1; bonus += 300; this.callbacks.onRescue?.(object); }
      if (object.type === 'collectible') { this.collected += 1; bonus += 200; this.callbacks.onCollect?.(object); }
      if (object.type === 'anchor') { this.anchorsDestroyed += 1; bonus += 400; this.callbacks.onAnchor?.(object); }
    }
    return bonus;
  }

  shiftCeiling() {
    if (this.ceilRow >= this.B.MAXROW - 1) return this.fail('Sufit zepchnął planszę poza bezpieczną strefę.');
    this.B.shiftDown(this.grid);
    this.ceilRow += 1;
    const moved = new Map();
    for (const [key, object] of this.objects) {
      const [c, r] = this.B.split(key);
      if (this.B.inGrid(c, r + 1)) moved.set(this.B.key(c, r + 1), { ...object, at: [c, r + 1] });
    }
    this.objects = moved;
    this.shotsUntilDrop = this.currentDropLimit;
    this.callbacks.onCeilingDrop?.();
  }

  complete() {
    if (this.status !== 'playing') return;
    this.status = 'won';
    const shotsRemaining = Math.max(0, this.level.maxShots - this.shotsUsed);
    const optionalComplete = isOptionalComplete(this.level.optional, { misses: this.misses, shotsRemaining });
    const stars = calculateStars({ completed: true, score: this.score, thresholds: this.level.starThresholds, optionalComplete });
    const result = { level: this.level, score: this.score, stars, optionalComplete, shotsUsed: this.shotsUsed, shotsRemaining, misses: this.misses };
    this.emitState();
    this.finishTimer = setTimeout(() => this.callbacks.onComplete?.(result), 420);
  }

  fail(reason) {
    if (this.status !== 'playing') return;
    this.status = 'lost';
    this.emitState();
    this.finishTimer = setTimeout(() => this.callbacks.onFail?.({ level: this.level, score: this.score, reason, shotsUsed: this.shotsUsed, misses: this.misses }), 260);
  }

  emitState() { this.callbacks.onState?.(this.getSnapshot()); }

  spawnEffects(popped, dropped, beforeGrid, special = 'normal') {
    const feedback = impactFeedback({ popped: popped.length, dropped: dropped.length, special, boss: Boolean(this.level?.boss) });
    if (!this.reducedMotion) {
      this.shakePower = Math.max(this.shakePower, feedback.shake);
      this.shakeTime = Math.max(this.shakeTime, feedback.shake ? .16 : 0);
    }
    this.flashStrength = Math.max(this.flashStrength, feedback.flash);
    this.flashTime = Math.max(this.flashTime, feedback.flash ? .09 : 0);

    for (const key of popped) {
      const [c, r] = this.B.split(key);
      const color = FX_COLORS[beforeGrid.get(key) || 1];
      for (let i = 0; i < feedback.particlesPerOrb; i += 1) {
        const angle = this.rng() * Math.PI * 2;
        const speed = 20 + this.rng() * (dropped.length >= 6 ? 58 : 42);
        const life = .38 + this.rng() * .22;
        this.particles.push({
          x: this.B.colX(c, r), y: this.B.rowY(r),
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life, maxLife: life, color,
          size: 1.5 + this.rng() * 2.2,
        });
      }
    }
    for (const key of dropped) {
      const [c, r] = this.B.split(key);
      this.falling.push({ x: this.B.colX(c, r), y: this.B.rowY(r), vy: 25, rot: 0, spin: (this.rng() - .5) * 4, color: beforeGrid.get(key) || 1 });
    }
  }

  updateEffects(dt) {
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (!this.shakeTime) this.shakePower = 0;
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (!this.flashTime) this.flashStrength = 0;
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const item of this.falling) { item.vy += 130 * dt; item.y += item.vy * dt; item.rot += item.spin * dt; }
    this.falling = this.falling.filter((item) => item.y < this.B.LH + 40);
  }
}
