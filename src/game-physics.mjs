export const SHOT_SPEED = 460;

export function shouldShowTrajectory(shot) {
  return shot?.type === 'guide';
}

export function shortAimSegment({ x, y, angle, length = 36, startOffset = 12 }) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const start = { x: x + dx * startOffset, y: y + dy * startOffset };
  const end = { x: start.x + dx * length, y: start.y + dy * length };
  return { start, end };
}

export function clampAimAngle(angle) {
  return Math.max(-Math.PI + 0.18, Math.min(-0.18, angle));
}

export function toLogicalPoint(clientX, clientY, rect, logicalWidth, logicalHeight) {
  return {
    x: (clientX - rect.left) * (logicalWidth / rect.width),
    y: (clientY - rect.top) * (logicalHeight / rect.height),
  };
}

export function windAtPoint(windZones = [], x, y) {
  let forceX = 0;
  let forceY = 0;
  for (const zone of windZones || []) {
    const left = Number(zone.x) || 0;
    const top = Number(zone.y) || 0;
    const right = left + Math.max(0, Number(zone.width) || 0);
    const bottom = top + Math.max(0, Number(zone.height) || 0);
    if (x < left || x > right || y < top || y > bottom) continue;
    forceX += Number(zone.forceX) || 0;
    forceY += Number(zone.forceY) || 0;
  }
  return { x: forceX, y: forceY };
}

export function stepProjectile(projectile, dt, bounds, windZones = []) {
  const wind = windAtPoint(windZones, projectile.x, projectile.y);
  const next = {
    ...projectile,
    vx: projectile.vx + wind.x * dt,
    vy: projectile.vy + wind.y * dt,
  };
  next.x = projectile.x + next.vx * dt;
  next.y = projectile.y + next.vy * dt;

  if (next.x <= bounds.minX) {
    next.x = bounds.minX;
    next.vx = Math.abs(next.vx);
  } else if (next.x >= bounds.maxX) {
    next.x = bounds.maxX;
    next.vx = -Math.abs(next.vx);
  }
  return next;
}

export function velocityFromAngle(angle, speed) {
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}

export function trajectoryPoints({ x, y, vx, vy, bounds, ceilingY, steps = 90, step = 0.018, collides, windZones = [] }) {
  const points = [];
  let projectile = { x, y, vx, vy };
  for (let i = 0; i < steps; i += 1) {
    projectile = stepProjectile(projectile, step, bounds, windZones);
    points.push({ x: projectile.x, y: projectile.y });
    if (projectile.y <= ceilingY || collides(projectile.x, projectile.y)) break;
  }
  return points;
}
