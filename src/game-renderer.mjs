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

function drawCloudBand(ctx, x, y, width = 78, height = 22, alpha = .7, top = '#ffffff', shadow = '#b9c9d3', lobes = 5) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const underside = ctx.createLinearGradient(0, y - height * .2, 0, y + height * .65);
  underside.addColorStop(0, top);
  underside.addColorStop(.68, top);
  underside.addColorStop(1, shadow);
  ctx.fillStyle = underside;
  ctx.beginPath();
  ctx.ellipse(x, y + height * .18, width * .5, height * .32, 0, 0, Math.PI * 2);
  ctx.fill();

  const count = Math.max(3, Math.min(6, Math.round(lobes)));
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? .5 : i / (count - 1);
    const offset = (t - .5) * width * .72;
    const central = 1 - Math.abs(t - .5) * 1.35;
    const rx = width * (.12 + central * .045);
    const ry = height * (.32 + central * .18);
    const cy = y - height * (.08 + central * .24) + (i % 2 ? 1.2 : 0);
    ctx.fillStyle = underside;
    ctx.beginPath();
    ctx.ellipse(x + offset, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha *= .34;
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(x + width * .04, y + height * .28, width * .38, height * .12, 0, 0, Math.PI * 2);
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

function skyPalette(world, timeOfDay) {
  if (timeOfDay === 'night') return ['#08172f', '#173451', '#496274'];
  if (timeOfDay === 'dusk') return ['#263d68', '#776b8e', '#d69a78'];
  if (timeOfDay === 'sunset') return ['#5877ad', '#e58f83', '#f4cf8b'];
  if (timeOfDay === 'late-day') return ['#4f92cb', '#91c4d7', '#e7d7a6'];
  if (timeOfDay === 'morning') return ['#64afe3', '#a7d8ed', '#f4e8bd'];
  if (world === 'storm') return ['#263b56', '#56697a', '#9ca6a5'];
  if (world === 'forest') return ['#467597', '#8db5b1', '#d5d19f'];
  if (world === 'clouds') return ['#59a9e7', '#9ed8f4', '#eef8fb'];
  return ['#4ea9e8', '#9ddaf4', '#f1f3c3'];
}

export class GameRenderer {
  constructor(canvas, B) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.B = B;
    this.orbSprites = new Map();
    this.animationTime = 0;
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
    this.animationTime = time;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.B.LW, this.B.LH);
    ctx.fillStyle = '#17324a';
    ctx.fillRect(0, 0, this.B.LW, this.B.LH);

    const shake = Number(state?.shake) || 0;
    const shakeX = shake ? Math.sin(time * .071) * shake * .75 : 0;
    const shakeY = shake ? Math.cos(time * .093) * shake * .45 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawSky(state?.level, time);
    if (state?.level) {
      this.drawCeiling(state.ceilRow);
      if (!state.projectile && state.status === 'playing' && !state.paused) {
        if (state.trajectory?.length) this.drawAim(state.trajectory, time);
        else if (state.aimSegment) this.drawShortAim(state.aimSegment, time);
      }

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

      if (state.lightningFx) this.drawLightningBolt(state.lightningFx, time);
      this.drawParticles(state.particles);
    }
    ctx.restore();

    if (state?.flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(238,248,255,${Math.min(.34, state.flash)})`;
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
      ctx.restore();
    }

    if (state?.paused) {
      ctx.fillStyle = 'rgba(9, 22, 34, .48)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }
  }

  drawSky(level, time) {
    const ctx = this.ctx;
    const world = level?.world || 'meadow';
    const atmosphere = level?.atmosphere || { timeOfDay: 'day', weather: 'clear', intensity: 0 };
    const colors = skyPalette(world, atmosphere.timeOfDay);
    const sky = ctx.createLinearGradient(0, 0, 0, this.B.LH);
    sky.addColorStop(0, colors[0]);
    sky.addColorStop(.52, colors[1]);
    sky.addColorStop(1, colors[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(-8, -8, this.B.LW + 16, this.B.LH + 16);

    if (world === 'meadow') this.drawMeadowBackdrop(time, atmosphere);
    else if (world === 'clouds') this.drawCloudBackdrop(time, atmosphere);
    else if (world === 'storm') this.drawStormBackdrop(time, atmosphere);
    else this.drawForestBackdrop(time, Boolean(level?.boss), atmosphere);

    this.drawAtmosphere(atmosphere, time);

    if (atmosphere.timeOfDay === 'night') {
      ctx.save();
      ctx.fillStyle = 'rgba(241,246,221,.72)';
      ctx.beginPath();
      ctx.arc(192, 47, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(25,45,69,.45)';
      ctx.beginPath();
      ctx.arc(198, 43, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (level?.boss || atmosphere.weather === 'storm') {
      const vignette = ctx.createRadialGradient(120, 150, 20, 120, 150, 180);
      vignette.addColorStop(0, 'rgba(26,39,57,0)');
      vignette.addColorStop(1, 'rgba(8,14,31,.42)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 240, 320);
      if (Math.floor(time / 160) % 23 === 0) {
        ctx.strokeStyle = 'rgba(240,248,255,.72)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(188, 28); ctx.lineTo(181, 52); ctx.lineTo(187, 52); ctx.lineTo(178, 78);
        ctx.stroke();
      }
    }
  }

  drawMeadowBackdrop(time, atmosphere) {
    const ctx = this.ctx;
    const timeOfDay = atmosphere?.timeOfDay || 'day';
    const sunX = timeOfDay === 'morning' ? 58 : timeOfDay === 'sunset' ? 205 : timeOfDay === 'late-day' ? 208 : 194;
    const sunY = timeOfDay === 'sunset' ? 176 : timeOfDay === 'late-day' ? 112 : timeOfDay === 'morning' ? 72 : 56;
    const sun = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 30);
    sun.addColorStop(0, timeOfDay === 'sunset' ? 'rgba(255,236,184,.98)' : 'rgba(255,248,198,.95)');
    sun.addColorStop(.42, timeOfDay === 'sunset' || timeOfDay === 'late-day' ? 'rgba(255,167,91,.74)' : 'rgba(255,230,138,.72)');
    sun.addColorStop(1, 'rgba(255,230,138,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - 34, sunY - 34, 68, 68);

    const driftMultiplier = timeOfDay === 'late-day' ? .0038 : timeOfDay === 'sunset' ? .0042 : .0028;
    const drift = (time * driftMultiplier) % 300;
    drawCloudBand(ctx, -46 + drift, 70, 78, 20, .62, '#fffdf4', '#cbd8dc', 5);
    drawCloudBand(ctx, 78 + drift * .34, 111, 58, 15, .44, '#ffffff', '#cbd8dc', 4);
    drawCloudBand(ctx, 218 - drift * .18, 90, 50, 13, .34, '#ffffff', '#cbd8dc', 4);

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

  drawCloudBackdrop(time, atmosphere) {
    const ctx = this.ctx;
    const drift = (time * .002) % 330;
    const muted = ['overcast', 'rain', 'fog', 'heavy-rain', 'storm'].includes(atmosphere?.weather);
    const top = muted ? '#e6edf0' : '#fff';
    const shadow = muted ? '#a8b8c2' : '#c9dae1';
    drawCloudBand(ctx, -48 + drift, 62, 94, 25, .68, top, shadow, 6);
    drawCloudBand(ctx, 82 + drift * .31, 122, 76, 20, .54, top, shadow, 5);
    drawCloudBand(ctx, 212 - drift * .2, 184, 72, 18, .58, top, shadow, 5);
    drawCloudBand(ctx, 26 + drift * .12, 202, 54, 14, .25, '#f2f5f5', shadow, 4);

    ctx.fillStyle = 'rgba(255,255,255,.46)';
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
    haze.addColorStop(1, 'rgba(235,249,255,.68)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 210, 240, 110);
  }

  drawForestBackdrop(time, boss, atmosphere) {
    const ctx = this.ctx;
    const night = atmosphere?.timeOfDay === 'night';
    drawCloudBand(ctx, 48 + Math.sin(time * .0004) * 10, 76, 60, 15, .2, night ? '#9dacb8' : '#eef3f2', night ? '#657788' : '#b8c9ce', 4);
    drawCloudBand(ctx, 184 - Math.sin(time * .00035) * 7, 107, 52, 13, .17, night ? '#91a0ad' : '#eef3f2', night ? '#607283' : '#b8c9ce', 4);

    hill(ctx, [[0, 226], [38, 199], [74, 218], [112, 192], [151, 216], [191, 193], [240, 216]], boss ? '#587377' : '#6d9591');
    hill(ctx, [[0, 251], [30, 225], [70, 244], [111, 219], [151, 245], [194, 220], [240, 242]], boss ? '#355b54' : '#4e7866');

    for (let i = 0; i < 22; i += 1) {
      const x = i * 12 - 4;
      const scale = .72 + (i % 4) * .08;
      tree(ctx, x, 279, scale, boss ? '#24483f' : i % 2 ? '#315f4a' : '#386a51', '#5d4636');
    }
    ctx.fillStyle = boss ? '#1f4038' : '#2f5b42';
    ctx.fillRect(0, 278, 240, 42);
  }

  drawStormBackdrop(time, atmosphere) {
    const ctx = this.ctx;
    const drift = (time * .0042) % 340;
    drawCloudBand(ctx, -65 + drift, 54, 116, 30, .62, '#8997a2', '#465767', 6);
    drawCloudBand(ctx, 72 + drift * .28, 88, 92, 24, .5, '#96a2aa', '#4c5c69', 6);
    drawCloudBand(ctx, 214 - drift * .24, 128, 104, 25, .48, '#7d8e99', '#3f5261', 5);

    hill(ctx, [[0, 230], [35, 191], [64, 217], [104, 171], [142, 216], [184, 181], [240, 221]], '#607783');
    hill(ctx, [[0, 258], [31, 224], [71, 248], [112, 208], [153, 249], [198, 213], [240, 244]], '#3f5965');
    hill(ctx, [[0, 286], [38, 254], [83, 278], [124, 239], [168, 276], [211, 247], [240, 265]], '#284852');
    ctx.fillStyle = '#203b43';
    ctx.fillRect(0, 282, 240, 38);
  }

  drawAtmosphere(atmosphere, time) {
    const ctx = this.ctx;
    const weather = atmosphere?.weather || 'clear';
    const intensity = Math.max(0, Math.min(1, Number(atmosphere?.intensity) || 0));
    const timeOfDay = atmosphere?.timeOfDay || 'day';

    if (timeOfDay === 'sunset') {
      ctx.fillStyle = 'rgba(255,116,74,.08)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    } else if (timeOfDay === 'late-day') {
      ctx.fillStyle = 'rgba(255,178,92,.045)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    } else if (timeOfDay === 'dusk') {
      ctx.fillStyle = 'rgba(38,36,82,.14)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    } else if (timeOfDay === 'night') {
      ctx.fillStyle = 'rgba(4,10,28,.28)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }

    if (weather === 'clouds' || weather === 'overcast' || weather === 'storm') {
      const stormy = weather === 'storm';
      const overcast = weather === 'overcast';
      const top = stormy ? '#758594' : overcast ? '#b2bec5' : '#e7eef0';
      const shadow = stormy ? '#3f5060' : overcast ? '#7d8d98' : '#b3c2c8';
      const alpha = stormy ? .43 : .2 + intensity * .22;
      drawCloudBand(ctx, 48 + Math.sin(time * .00025) * 13, 41, 96, 24, alpha, top, shadow, 6);
      drawCloudBand(ctx, 182 - Math.sin(time * .00019) * 11, 78, 82, 20, alpha * .88, top, shadow, 5);
    }

    if (weather === 'fog') {
      for (let i = 0; i < 4; i += 1) {
        const y = 88 + i * 48 + Math.sin(time * .00055 + i) * 5;
        const fog = ctx.createLinearGradient(0, y, this.B.LW, y);
        fog.addColorStop(0, 'rgba(238,247,248,.08)');
        fog.addColorStop(.45, `rgba(238,247,248,${.14 + intensity * .2})`);
        fog.addColorStop(1, 'rgba(238,247,248,.06)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, y - 12, this.B.LW, 24);
      }
    }

    if (weather === 'breeze' || weather === 'windy') {
      const count = weather === 'windy' ? 14 : 7;
      ctx.save();
      ctx.strokeStyle = weather === 'windy' ? 'rgba(236,249,251,.34)' : 'rgba(247,252,252,.2)';
      ctx.lineWidth = .7;
      for (let i = 0; i < count; i += 1) {
        const x = ((i * 43 + time * (weather === 'windy' ? .04 : .018)) % 290) - 30;
        const y = 54 + ((i * 29) % 178);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 8, y - 2, x + 18 + intensity * 8, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (weather === 'rain' || weather === 'heavy-rain' || weather === 'storm') {
      const count = weather === 'rain' ? 26 : weather === 'heavy-rain' ? 42 : 54;
      const speed = weather === 'storm' ? .18 : weather === 'heavy-rain' ? .13 : .09;
      ctx.save();
      ctx.strokeStyle = weather === 'storm' ? 'rgba(207,230,247,.46)' : 'rgba(215,237,249,.36)';
      ctx.lineWidth = weather === 'storm' ? .9 : .7;
      for (let i = 0; i < count; i += 1) {
        const x = ((i * 37 + time * speed) % 300) - 30;
        const y = ((i * 61 + time * speed * 1.8) % 360) - 20;
        const len = 5 + intensity * 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2.5, y + len);
        ctx.stroke();
      }
      ctx.restore();
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

  drawShortAim(segment, time) {
    const ctx = this.ctx;
    const points = Array.isArray(segment.points) && segment.points.length ? segment.points : [segment.start, segment.end].filter(Boolean);
    if (points.length < 2) return;
    const pulse = .64 + Math.sin(time * .008) * .08;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(248,252,255,${pulse})`;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 2.5]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const end = points.at(-1);
    ctx.fillStyle = `rgba(248,252,255,${Math.min(1, pulse + .14)})`;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 1.4, 0, Math.PI * 2);
    ctx.fill();
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

  drawLightningBolt(fx, time) {
    if (!fx) return;
    const ctx = this.ctx;
    const alpha = Math.max(0, Math.min(1, Number(fx.life) / (Number(fx.maxLife) || 1)));
    const targetX = Number(fx.x) || this.B.LW / 2;
    const targetY = Number(fx.y) || 120;
    const startX = targetX + Math.sin(time * .03 + targetX) * 8;
    const points = [
      [startX, -4],
      [targetX - 7, targetY * .28],
      [targetX + 5, targetY * .5],
      [targetX - 3, targetY * .72],
      [targetX, targetY],
    ];
    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(122,190,255,.42)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = '#f4fbff';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = `rgba(232,247,255,${.28 * alpha})`;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 16 * alpha + 3, 0, Math.PI * 2);
    ctx.fill();
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

  drawOrbRack(queue, projectileActive, baseScale = 1) {
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
      ctx.ellipse(socket.x, layout.railY - 1.5, 11 * socket.scale * baseScale, 3 * socket.scale * baseScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (layout.current && queue[0]) this.drawShot(queue[0], layout.current.x, layout.current.y, layout.current.scale * baseScale);
    const nextShots = projectileActive ? queue.slice(0, 2) : queue.slice(1, 3);
    nextShots.forEach((shot, index) => {
      const slot = layout.next[index];
      if (slot) this.drawShot(shot, slot.x, slot.y, slot.scale * baseScale);
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
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const size = Math.max(1.2, Number(p.size) || (p.life > p.maxLife * .5 ? 2.5 : 1.5));
      ctx.fillRect(snap(p.x - size / 2), snap(p.y - size / 2), size, size);
    }
    ctx.restore();
  }
}
