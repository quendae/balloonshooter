import { GameRenderer } from './game-renderer.mjs';

const INSTALL_FLAG = Symbol.for('balloon.frostShotRenderer');

export function installFrostShotRenderer() {
  if (GameRenderer.prototype[INSTALL_FLAG]) return false;
  const originalDrawShot = GameRenderer.prototype.drawShot;

  GameRenderer.prototype.drawShot = function frostAwareDrawShot(shot, x, y, scale = 1) {
    originalDrawShot.call(this, shot, x, y, scale);
    if (shot?.weatherType !== 'frost') return;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawPixelFrostOverlay(ctx, 0, 0, this.animationTime);
    ctx.restore();
  };

  Object.defineProperty(GameRenderer.prototype, INSTALL_FLAG, { value: true, configurable: false });
  return true;
}

export function drawPixelFrostOverlay(ctx, x = 0, y = 0, time = 0) {
  const pulse = .72 + Math.sin(time * .008) * .12;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= pulse;
  ctx.strokeStyle = '#c9f4ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 10.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e9fbff';
  for (const [sx, sy, w, h] of [[-9, -5, 2, 3], [8, -4, 2, 2], [-7, 7, 2, 2], [6, 8, 2, 3]]) {
    ctx.fillRect(sx, sy, w, h);
  }
  ctx.restore();
}

installFrostShotRenderer();
