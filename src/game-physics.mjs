export function clampAimAngle(angle) {
  return Math.max(-Math.PI + 0.18, Math.min(-0.18, angle));
}

export function toLogicalPoint(clientX, clientY, rect, logicalWidth, logicalHeight) {
  return {
    x: (clientX - rect.left) * (logicalWidth / rect.width),
    y: (clientY - rect.top) * (logicalHeight / rect.height),
  };
}

export function stepProjectile(projectile, dt, bounds) {
  const next = {
    ...projectile,
    x: projectile.x + projectile.vx * dt,
    y: projectile.y + projectile.vy * dt,
  };
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

export function trajectoryPoints({ x, y, vx, vy, bounds, ceilingY, steps = 90, step = 0.018, collides }) {
  const points = [];
  let projectile = { x, y, vx, vy };
  for (let i = 0; i < steps; i += 1) {
    projectile = stepProjectile(projectile, step, bounds);
    points.push({ x: projectile.x, y: projectile.y });
    if (projectile.y <= ceilingY || collides(projectile.x, projectile.y)) break;
  }
  return points;
}
