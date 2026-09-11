import { classicOrbRects, drawPixelObject, drawPixelSpecial } from './pixel-art.mjs';

const RENDER_SCALE = 3;

function snap(value) { return Math.round(value); }

export function orbRackLayout(B, projectileActive = false) {
  const nextY = Math.min(B.LH - 20, B.LAUNCH_Y + 10);
  const railY = Math.min(B.LH - 8, B.LAUNCH_Y + 18);
  return {
    current: projectileActive ? null : { x: B.LW / 2, y: B.LAUNCH_Y, scale: 1 },
    next: [
      { x: B.LW / 2 + 31, y: nextY, scale: .72 },
      { x: B.LW / 2 + 54, y: nextY, scale: .72 },
    ],
    railY,
  };
}

export function projectileTrailSegments(projectile) {
  const speed = Math.hypot(projectile?.vx || 0, projectile?.vy || 0) || 1;
  const ux = (projectile?.vx || 0) / speed;
  const uy = (projectile?.vy || 0) / speed;
  return [9, 15, 21].map((distance, index) => ({
    x: projectile.x - ux * distance,
    y: projectile.y - uy * distance,
    alpha: .34 - index * .08,
    radius: 2.2 - index * .45,
  }));
}

function roundedCloud(ctx, x, y, scale = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x, y, 19 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 13 * scale, y + 2 * scale, 12 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 13 * scale, y + 2 * scale, 13 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 3 * scale, y - 6 * scale, 10 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 8 * scale, y - 4 * scale, 8 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hill(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i];
    const [px, py] = points[i - 1];
    ctx.quadraticCurveTo((px + x) / 2, py, x, y);
  }
  ctx.lineTo(240, 320);
  ctx.lineTo(0, 320);
  ctx.closePath();
  ctx.fill();
}

function tree(ctx, x, y, scale = 1, leaf = '#376f55', trunk = '#76563b') {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - 1.2 * scale, y - 10 * scale, 2.4 * scale, 10 * scale);
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.arc(x, y - 13 * scale, 5 * scale, 0, Math.PI * 2);
  ctx.arc(x - 3.5 * scale, y - 10 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.arc(x + 3.5 * scale, y - 10 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.fill();
}

export class GameRenderer {
  constructor(canvas, B) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.B = B;
    this.orbSprites = new Map();
    canvas.width = B.LW * RENDER_SCALE;
    canvas.height = B.LH * RENDER_SCALE;
    this.ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    for (let color = 1; color <= 6; color += 1) this.orbSprites.set(color, this.makeOrbSprite(color));
  }

  makeOrbSprite(color) {
    const sprite = document.createElement('canvas');
    sprite.width = 24;
    sprite.height = 24;
    const g = sprite.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const { x, y, fill } of classicOrbRects(color)) {
      g.fillStyle = fill;
      g.fillRect(x, y, 1, 1);
    }
    return sprite;
  }

  draw(state, time = 0) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.B.LW, this.B.LH);
    this.drawSky(state?.level, time);
    if (!state?.level) return;

    this.drawCeiling(state.ceilRow);
    if (!state.projectile && state.status === 'playing' && !state.paused && state.trajectory?.length) this.drawAim(state.trajectory, time);

    for (const [key, color] of state.grid) {
      const [c, r] = this.B.split(key);
      const x = this.B.colX(c, r);
      const y = this.B.rowY(r);
      this.drawOrb(color, x, y, 1);
      const object = state.objects.get(key);
      if (object) this.drawObject(object, x, y, time);
    }

    for (const item of state.falling) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rot);
      this.drawOrb(item.color, 0, 0, .92);
      ctx.restore();
    }

    this.drawOrbRack(state.queue || [], Boolean(state.projectile));
    if (state.projectile) {
      this.drawProjectileTrail(state.projectile);
      this.drawShot(state.projectile, state.projectile.x, state.projectile.y, 1);
    }

    this.drawParticles(state.particles);

    if (state.paused) {
      ctx.fillStyle = 'rgba(9, 22, 34, .48)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }
  }

  drawSky(level, time) {
    const ctx = this.ctx;
    const world = level?.world || 'meadow';
    const sky = ctx.createLinearGradient(0, 0, 0, this.B.LH);
    if (world === 'forest') {
      sky.addColorStop(0, '#467597');
      sky.addColorStop(.48, '#8db5b1');
      sky.addColorStop(1, '#d5d19f');
    } else if (world === 'clouds') {
      sky.addColorStop(0, '#59a9e7');
      sky.addColorStop(.54, '#9ed8f4');
      sky.addColorStop(1, '#eef8fb');
    } else {
      sky.addColorStop(0, '#4ea9e8');
      sky.addColorStop(.52, '#9ddaf4');
      sky.addColorStop(1, '#f1f3c3');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.B.LW, this.B.LH);

    if (world === 'meadow') this.drawMeadowBackdrop(time);
    else if (world === 'clouds') this.drawCloudBackdrop(time);
    else this.drawForestBackdrop(time, Boolean(level?.boss));

    if (level?.boss) {
      const vignette = ctx.createRadialGradient(120, 150, 20, 120, 150, 180);
      vignette.addColorStop(0, 'rgba(26,39,57,0)');
      vignette.addColorStop(1, 'rgba(18,25,42,.34)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 240, 320);
      if (Math.floor(time / 220) % 17 === 0) {
        ctx.strokeStyle = 'rgba(240,248,255,.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(188, 28); ctx.lineTo(181, 52); ctx.lineTo(187, 52); ctx.lineTo(178, 78);
        ctx.stroke();
      }
    }
  }

  drawMeadowBackdrop(time) {
    const ctx = this.ctx;
    const sun = ctx.createRadialGradient(194, 56, 2, 194, 56, 30);
    sun.addColorStop(0, 'rgba(255,248,198,.95)');
    sun.addColorStop(.42, 'rgba(255,230,138,.72)');
    sun.addColorStop(1, 'rgba(255,230,138,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(160, 20, 68, 68);

    const drift = (time * .0028) % 280;
    roundedCloud(ctx, -35 + drift, 72, .78, .75);
    roundedCloud(ctx, 80 + drift * .42, 112, .58, .58);
    roundedCloud(ctx, 214 - drift * .2, 91, .52, .45);

    hill(ctx, [[0, 235], [38, 214], [74, 228], [116, 205], [160, 227], [201, 210], [240, 225]], '#8ec3d8');
    hill(ctx, [[0, 252], [32, 230], [68, 244], [104, 222], [147, 244], [186, 226], [240, 247]], '#6ea8be');
    hill(ctx, [[0, 273], [35, 252], [76, 262], [118, 245], [165, 258], [205, 246], [240, 260]], '#9fc56f');
    hill(ctx, [[0, 292], [45, 270], [82, 284], [125, 265], [169, 280], [211, 267], [240, 278]], '#79b95f');

    for (let i = 0; i < 18; i += 1) {
      const x = i * 15 - 6;
      const y = 286 + (i % 4) * 2;
      tree(ctx, x, y, .7 + (i % 3) * .08, i % 2 ? '#407b59' : '#4d865c');
    }
    ctx.fillStyle = '#5fae4e';
    ctx.fillRect(0, 292, 240, 28);
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 29) % 238;
      const y = 296 + ((i * 7) % 18);
      ctx.fillStyle = i % 3 === 0 ? '#fff7cc' : i % 3 === 1 ? '#f5d452' : '#f2a354';
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }

  drawCloudBackdrop(time) {
    const ctx = this.ctx;
    const drift = (time * .002) % 300;
    roundedCloud(ctx, -40 + drift, 64, .9, .74);
    roundedCloud(ctx, 82 + drift * .35, 125, .72, .62);
    roundedCloud(ctx, 205 - drift * .22, 188, .68, .68);

    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.ellipse(48, 252, 35, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(190, 240, 43, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#83b8c9';
    ctx.beginPath();
    ctx.moveTo(20, 251); ctx.quadraticCurveTo(48, 277, 76, 251); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(153, 239); ctx.quadraticCurveTo(190, 273, 227, 239); ctx.closePath(); ctx.fill();

    const haze = ctx.createLinearGradient(0, 210, 0, 320);
    haze.addColorStop(0, 'rgba(235,249,255,0)');
    haze.addColorStop(1, 'rgba(235,249,255,.72)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 210, 240, 110);
  }

  drawForestBackdrop(time, boss) {
    const ctx = this.ctx;
    roundedCloud(ctx, 46 + Math.sin(time * .0004) * 8, 78, .56, .25);
    roundedCloud(ctx, 182 - Math.sin(time * .00035) * 6, 108, .46, .2);

    hill(ctx, [[0, 226], [38, 199], [74, 218], [112, 192], [151, 216], [191, 193], [240, 216]], boss ? '#587377' : '#6d9591');
    hill(ctx, [[0, 251], [30, 225], [70, 244], [111, 219], [151, 245], [194, 220], [240, 242]], boss ? '#355b54' : '#4e7866');

    for (let i = 0; i < 22; i += 1) {
      const x = i * 12 - 4;
      const scale = .72 + (i % 4) * .08;
      tree(ctx, x, 279, scale, boss ? '#24483f' : i % 2 ? '#315f4a' : '#386a51', '#5d4636');
    }
    ctx.fillStyle = boss ? '#1f4038' : '#2f5b42';
    ctx.fillRect(0, 278, 240, 42);

    const drift = (time * .018) % 70;
    ctx.strokeStyle = boss ? 'rgba(225,239,244,.5)' : 'rgba(219,235,221,.42)';
    ctx.lineWidth = .8;
    for (let row = 0; row < 4; row += 1) {
      const y = 86 + row * 38;
      for (let x = -65 + drift; x < 270; x += 44) {
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 3, x + 17, y); ctx.stroke();
      }
    }
  }

  drawCeiling(ceilRow) {
    const ctx = this.ctx;
    const y = this.B.rowY(ceilRow) - this.B.RAD - 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(42,68,88,.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(8, y); ctx.lineTo(this.B.LW - 8, y); ctx.stroke();
    ctx.restore();
  }

  drawAim(points, time) {
    const ctx = this.ctx;
    const pulse = .72 + Math.sin(time * .01) * .16;
    ctx.save();
    ctx.fillStyle = `rgba(248,252,255,${pulse})`;
    points.forEach((point, index) => {
      if (index % 3) return;
      const r = index < 8 ? 1.8 : 1.25;
      ctx.beginPath();
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawOrb(color, x, y, scale = 1) {
    const ctx = this.ctx;
    const sprite = this.orbSprites.get(color) || this.orbSprites.get(1);
    const size = 24 * scale;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.imageSmoothingEnabled = smoothing;
  }

  drawShot(shot, x, y, scale = 1) {
    this.drawOrb(shot.color || 1, x, y, scale);
    if (shot.type === 'bomb' || shot.type === 'rainbow' || shot.type === 'guide') {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      drawPixelSpecial(ctx, shot.type, 0, 0);
      ctx.restore();
    }
  }

  drawProjectileTrail(projectile) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#f7fcff';
    for (const mark of projectileTrailSegments(projectile)) {
      ctx.globalAlpha = mark.alpha;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawOrbRack(queue, projectileActive) {
    const layout = orbRackLayout(this.B, projectileActive);
    const ctx = this.ctx;
    const sockets = [layout.current, ...layout.next].filter(Boolean);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(21, 47, 57, .52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.B.LW / 2 - 16, layout.railY);
    ctx.lineTo(this.B.LW / 2 + 66, layout.railY);
    ctx.stroke();
    for (const socket of sockets) {
      ctx.fillStyle = 'rgba(10, 31, 38, .24)';
      ctx.beginPath();
      ctx.ellipse(socket.x, layout.railY - 1.5, 11 * socket.scale, 3 * socket.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (layout.current && queue[0]) this.drawShot(queue[0], layout.current.x, layout.current.y, layout.current.scale);
    const nextShots = projectileActive ? queue.slice(0, 2) : queue.slice(1, 3);
    nextShots.forEach((shot, index) => {
      const slot = layout.next[index];
      if (slot) this.drawShot(shot, slot.x, slot.y, slot.scale);
    });
  }

  drawObject(object, x, y, time) {
    const bob = Math.sin(time * .005 + x) * 1.4;
    const px = snap(x);
    const py = snap(y - 1 + bob);
    this.ctx.fillStyle = 'rgba(12,26,40,.24)';
    this.ctx.fillRect(px - 8, py - 8, 16, 16);
    drawPixelObject(this.ctx, object.type, px, py);
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(snap(p.x), snap(p.y), p.life > p.maxLife * .5 ? 2.5 : 1.5, p.life > p.maxLife * .5 ? 2.5 : 1.5);
    }
    ctx.globalAlpha = 1;
  }
}
