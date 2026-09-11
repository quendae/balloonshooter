function direction(zone) {
  const x = Number(zone.forceX) || 0;
  const y = Number(zone.forceY) || 0;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, strength: Math.min(1, Math.hypot(x, y) / 50) };
}

function arrow(ctx, x, y, dx, dy, alpha) {
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.quadraticCurveTo(-2, -2.5, 7, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, -3.5);
  ctx.lineTo(8, 0);
  ctx.lineTo(3, 3.5);
  ctx.stroke();
  ctx.restore();
}

export function drawWindCorridors(ctx, zones = [], time = 0) {
  if (!ctx || !zones?.length) return;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const phase = reduced ? 0 : (time * 0.026) % 32;

  for (const zone of zones) {
    const x = Number(zone.x) || 0;
    const y = Number(zone.y) || 0;
    const width = Math.max(0, Number(zone.width) || 0);
    const height = Math.max(0, Number(zone.height) || 0);
    const vector = direction(zone);

    ctx.save();
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, 'rgba(255,255,255,.04)');
    gradient.addColorStop(.5, 'rgba(255,255,255,.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,.035)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = .8;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 9);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const rows = Math.max(2, Math.floor(height / 34));
    const cols = Math.max(2, Math.floor(width / 46));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const spacingX = width / cols;
        const spacingY = height / rows;
        let px = x + spacingX * (col + .45);
        let py = y + spacingY * (row + .5);
        px += vector.x * ((phase + col * 7 + row * 3) % Math.max(12, spacingX) - Math.max(12, spacingX) / 2) * .35;
        py += vector.y * ((phase + col * 7 + row * 3) % Math.max(12, spacingY) - Math.max(12, spacingY) / 2) * .35;
        arrow(ctx, px, py, vector.x, vector.y, .34 + vector.strength * .2);
      }
    }
    ctx.restore();
  }
}
