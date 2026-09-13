import { SkyRescueGame } from './game.mjs';
import {
  aimInputMaxY,
  beginPointerShotGesture,
  createPointerShotGesture,
  endPointerShotGesture,
  ownsPointerShotGesture,
  shouldShowAimGuide,
  toLogicalPoint,
} from './game-physics.mjs';

const PATCH_FLAG = Symbol.for('balloon.hold-to-aim.patch');
const GESTURE = Symbol('pointer-shot-gesture');
const LISTENERS = Symbol('pointer-shot-listeners');

function coarsePointerEnvironment() {
  return Boolean(
    globalThis.matchMedia?.('(pointer: coarse)')?.matches
    || Number(globalThis.navigator?.maxTouchPoints || 0) > 0
  );
}

function gestureState(game) {
  if (!game[GESTURE]) game[GESTURE] = createPointerShotGesture();
  return game[GESTURE];
}

function removeFinishListeners(game) {
  const listeners = game[LISTENERS];
  if (!listeners) return;
  const { pointerId, up, cancel } = listeners;
  game.canvas.removeEventListener('pointerup', up);
  game.canvas.removeEventListener('pointercancel', cancel);
  globalThis.removeEventListener?.('pointerup', up);
  globalThis.removeEventListener?.('pointercancel', cancel);
  try {
    if (game.canvas.hasPointerCapture?.(pointerId)) game.canvas.releasePointerCapture(pointerId);
  } catch (_) {
    // Synthetic browser tests and older engines may not expose an active capture.
  }
  game[LISTENERS] = null;
}

function resetGesture(game) {
  removeFinishListeners(game);
  game[GESTURE] = createPointerShotGesture();
}

function aimFromPointer(game, event) {
  const point = toLogicalPoint(
    event.clientX,
    event.clientY,
    game.canvas.getBoundingClientRect(),
    game.B.LW,
    game.B.LH,
  );
  if (point.y > aimInputMaxY(game.B.LAUNCH_Y)) return false;
  game.setAim(point.x, point.y);
  return true;
}

function finishGesture(game, event, cancelled) {
  const current = gestureState(game);
  if (!ownsPointerShotGesture(current, event.pointerId)) return;

  if (!cancelled && game.status === 'playing' && !game.paused) aimFromPointer(game, event);
  const result = endPointerShotGesture(current, event.pointerId, { cancelled });
  game[GESTURE] = result.state;
  removeFinishListeners(game);

  if (result.shouldShoot && game.status === 'playing' && !game.paused) game.shoot();
}

export function applyHoldToAimPatch(GameClass = SkyRescueGame) {
  const proto = GameClass?.prototype;
  if (!proto || proto[PATCH_FLAG]) return GameClass;
  Object.defineProperty(proto, PATCH_FLAG, { value: true });

  const originalStart = proto.start;
  const originalDestroy = proto.destroy;
  const originalPointerMove = proto.onPointerMove;
  const originalRenderState = proto.renderState;
  const originalSetPaused = proto.setPaused;

  proto.start = function holdToAimStart(...args) {
    resetGesture(this);
    this.canvas.setAttribute(
      'aria-label',
      'Plansza Sky Rescue. Przytrzymaj i przeciągnij, aby celować; puść, aby strzelić. Klawiatura: strzałki i spacja.',
    );
    return originalStart.apply(this, args);
  };

  proto.destroy = function holdToAimDestroy(...args) {
    resetGesture(this);
    return originalDestroy.apply(this, args);
  };

  proto.setPaused = function holdToAimSetPaused(value) {
    if (value) resetGesture(this);
    return originalSetPaused.call(this, value);
  };

  proto.onPointerMove = function holdToAimPointerMove(event) {
    const current = gestureState(this);
    if (current.active) {
      if (!ownsPointerShotGesture(current, event.pointerId)) return;
      if (this.status !== 'playing' || this.paused) return;
      aimFromPointer(this, event);
      return;
    }

    // Desktop keeps hover-to-aim. Touch/pen input only changes aim after a press.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    originalPointerMove.call(this, event);
  };

  proto.onPointerDown = function holdToAimPointerDown(event) {
    if (this.status !== 'playing' || this.paused || this.projectile || !this.queue?.length) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (gestureState(this).active) return;
    if (!aimFromPointer(this, event)) return;

    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this[GESTURE] = beginPointerShotGesture(gestureState(this), event.pointerId, event.pointerType || 'mouse');

    const up = (finishEvent) => finishGesture(this, finishEvent, false);
    const cancel = (finishEvent) => finishGesture(this, finishEvent, true);
    this[LISTENERS] = { pointerId: event.pointerId, up, cancel };

    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', cancel);
    globalThis.addEventListener?.('pointerup', up);
    globalThis.addEventListener?.('pointercancel', cancel);

    try {
      this.canvas.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Pointer capture is an enhancement; window listeners are the fallback.
    }
  };

  proto.renderState = function holdToAimRenderState(...args) {
    const state = originalRenderState.apply(this, args);
    const visible = shouldShowAimGuide({
      coarsePointer: coarsePointerEnvironment(),
      gestureActive: gestureState(this).active,
    });
    if (!visible) {
      state.trajectory = [];
      state.showTrajectory = false;
      state.aimSegment = null;
    }
    return state;
  };

  return GameClass;
}
