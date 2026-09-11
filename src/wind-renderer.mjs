function direction(wind) {
  const x = Number(wind?.forceX) || 0;
  const y = Number(wind?.forceY) || 0;
  const magnitude = Math.hypot(x, y);
  if (!magnitude) return { x: 0, y: 0, magnitude: 0, strength: 0 };
  return {
    x: x / magnitude,
    y: y / magnitude,
    magnitude,
    strength: Math.min(1, magnitude / 230),
  };
}

function drawArrow(ctx, x, y, vector, alpha = .7, scale = 1) {
  const nx = -vector.y;
  const ny = vector.x;
  const length = 12 * scale;
  const tipX = x + vector.x * length;
  const tipY = y + vector.y * length;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#f1f9ff';
  ctx.fillStyle = '#f1f9ff';
  ctx.lineWidth = 1.15 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - vector.x * 4 * scale + nx * 3 * scale, tipY - vector.y * 4 * scale + ny * 3 * scale);
  ctx.lineTo(tipX - vector.x * 4 * scale - nx * 3 * scale, tipY - vector.y * 4 * scale - ny * 3 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawGlobalWind(ctx, wind, time = 0, B = { LW: 240, LH: 320 }) {
  if (!ctx) return;
  const vector = direction(wind);
  if (!vector.magnitude) return;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const phase = reduced ? 0 : (time * (.018 + vector.strength * .025)) % 52;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(236,248,255,.26)';
  ctx.lineWidth = .75;
  const nx = -vector.y;
  const ny = vector.x;
  for (let lane = 0; lane < 6; lane += 1) {
    const baseY = 76 + lane * 31;
    for (let i = -1; i < 6; i += 1) {
      const travel = i * 52 + phase;
      const x = 18 + travel + nx * lane * 2;
      const y = baseY + vector.y * travel * .18 + ny * Math.sin(lane * 1.7) * 3;
      const len = 13 + vector.strength * 10;
      ctx.globalAlpha = .14 + vector.strength * .18;
      ctx.beginPath();
      ctx.moveTo(x - vector.x * len * .5, y - vector.y * len * .5);
      ctx.quadraticCurveTo(x, y - 1.5, x + vector.x * len * .5, y + vector.y * len * .5);
      ctx.stroke();
    }
  }
  ctx.restore();

  const indicatorX = vector.x >= 0 ? B.LW - 31 : 17;
  const indicatorY = 28;
  ctx.save();
  ctx.fillStyle = 'rgba(10,28,43,.34)';
  ctx.beginPath();
  ctx.roundRect(indicatorX - 8, indicatorY - 9, 32, 18, 5);
  ctx.fill();
  drawArrow(ctx, indicatorX, indicatorY, vector, .82, .82 + vector.strength * .18);
  ctx.restore();
}
