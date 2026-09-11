function direction(zone) {
  const x = Number(zone.forceX) || 0;
  const y = Number(zone.forceY) || 0;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, strength: Math.min(1, Math.hypot(x, y) / 50) };
}

function pixelArrow(ctx, x, y, dx, dy, alpha) {
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sign = horizontal ? Math.sign(dx || 1) : Math.sign(dy || 1);
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#F3FAFF';

  if (horizontal) {
    const start = sign > 0 ? px - 7 : px + 7;
    const dir = sign > 0 ? 1 : -1;
    ctx.fillRect(Math.min(start, start + dir * 10), py - 1, 11, 2);
    ctx.fillRect(px + dir * 5, py - 4, 2, 8);
    ctx.fillRect(px + dir * 7, py - 2, 2, 4);
  } else {
    const start = sign > 0 ? py - 7 : py + 7;
    const dir = sign > 0 ? 1 : -1;
    ctx.fillRect(px - 1, Math.min(start, start + dir * 10), 2, 11);
    ctx.fillRect(px - 4, py + dir * 5, 8, 2);
    ctx.fillRect(px - 2, py + dir * 7, 4, 2);
  }
  ctx.restore();
}

export function drawWindCorridors(ctx, zones = [], time = 0) {
  if (!ctx || !zones?.length) return;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const phase = reduced ? 0 : Math.floor((time * 0.018) % 24);

  for (const zone of zones) {
    const x = Math.round(Number(zone.x) || 0);
    const y = Math.round(Number(zone.y) || 0);
    const width = Math.max(0, Math.round(Number(zone.width) || 0));
    const height = Math.max(0, Math.round(Number(zone.height) || 0));
    const vector = direction(zone);

    ctx.save();
    ctx.fillStyle = 'rgba(220,242,250,.08)';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = 'rgba(241,250,255,.22)';
    for (let px = x; px < x + width; px += 8) {
      ctx.fillRect(px, y, 4, 1);
      ctx.fillRect(px, y + height - 1, 4, 1);
    }
    for (let py = y; py < y + height; py += 8) {
      ctx.fillRect(x, py, 1, 4);
      ctx.fillRect(x + width - 1, py, 1, 4);
    }

    const rows = Math.max(2, Math.floor(height / 32));
    const cols = Math.max(2, Math.floor(width / 42));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const spacingX = width / cols;
        const spacingY = height / rows;
        const lane = (phase + col * 5 + row * 3) % 18 - 9;
        const px = x + spacingX * (col + .5) + vector.x * lane * .45;
        const py = y + spacingY * (row + .5) + vector.y * lane * .45;
        pixelArrow(ctx, px, py, vector.x, vector.y, .38 + vector.strength * .28);
      }
    }
    ctx.restore();
  }
}
