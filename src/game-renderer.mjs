const COLORS = ['#000', '#F35D6A', '#F5C84C', '#48A9E6', '#63B96D', '#9A6FE8', '#F18A3D'];
const WORLD_SKIES = {
  meadow: { top: '#74C8F4', mid: '#BDEBFF', bottom: '#F1FBFF', horizon: '#7FCB83', far: '#B9E2A9' },
  clouds: { top: '#5EB7EE', mid: '#A9E1FC', bottom: '#F5FCFF', horizon: '#D5EEF8', far: '#EAF7FC' },
  forest: { top: '#6EABB9', mid: '#A5D5C6', bottom: '#E8F3D9', horizon: '#4F8161', far: '#79A77B' },
};

function starPath(ctx, outer = 7, inner = 3.4, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class GameRenderer {
  constructor(canvas, B) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.B = B;
    this.images = new Map();
    canvas.width = B.LW;
    canvas.height = B.LH;
    for (let color = 1; color <= 6; color += 1) {
      const image = new Image();
      image.src = `assets/ball_${color}.png`;
      this.images.set(color, image);
    }
  }

  draw(state, time = 0) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.B.LW, this.B.LH);
    this.drawSky(state?.level, time);
    if (!state?.level) return;
    this.drawCeiling(state.ceilRow);
    if (!state.projectile && state.status === 'playing' && !state.paused) this.drawAim(state.trajectory || []);

    for (const [key, color] of state.grid) {
      const [c, r] = this.B.split(key);
      const x = this.B.colX(c, r);
      const y = this.B.rowY(r);
      this.drawBalloon(color, x, y, 1);
      const object = state.objects.get(key);
      if (object) this.drawObject(object, x, y, time);
    }

    for (const item of state.falling) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rot);
      this.drawBalloon(item.color, 0, 0, 0.92);
      ctx.restore();
    }

    if (state.projectile) this.drawShot(state.projectile, state.projectile.x, state.projectile.y, time);
    else if (state.queue[0]) this.drawShot(state.queue[0], this.B.LW / 2, this.B.LAUNCH_Y, time);

    this.drawLauncher();
    this.drawParticles(state.particles);

    if (state.paused) {
      ctx.fillStyle = 'rgba(16,42,69,.38)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }
  }

  drawSky(level, time) {
    const ctx = this.ctx;
    const world = level?.world || 'meadow';
    const palette = WORLD_SKIES[world] || WORLD_SKIES.meadow;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.B.LH);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(.58, palette.mid);
    gradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.B.LW, this.B.LH);

    if (world === 'meadow') this.drawMeadowBackdrop(time, palette);
    else if (world === 'clouds') this.drawCloudBackdrop(time, palette);
    else this.drawForestBackdrop(time, palette, Boolean(level?.boss));

    if (level?.boss) {
      const pulse = .05 + Math.sin(time * .002) * .018;
      ctx.fillStyle = `rgba(34,48,74,${pulse})`;
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }
  }

  drawMeadowBackdrop(time, palette) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = .55;
    ctx.fillStyle = '#FFE39A';
    ctx.beginPath();
    ctx.arc(194, 48, 23, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.far;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.quadraticCurveTo(54, 220, 118, 257);
    ctx.quadraticCurveTo(176, 220, 240, 254);
    ctx.lineTo(240, 320);
    ctx.lineTo(0, 320);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = .42;
    ctx.fillStyle = palette.horizon;
    ctx.beginPath();
    ctx.moveTo(0, 278);
    ctx.quadraticCurveTo(42, 246, 92, 278);
    ctx.quadraticCurveTo(154, 240, 240, 282);
    ctx.lineTo(240, 320);
    ctx.lineTo(0, 320);
    ctx.closePath();
    ctx.fill();

    const drift = (time * .006) % 320;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(-80 + drift, 102);
    ctx.quadraticCurveTo(40 + drift, 82, 130 + drift, 106);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawCloudBackdrop(time) {
    const ctx = this.ctx;
    ctx.save();
    const drift = (time * .004) % 300;
    ctx.globalAlpha = .28;
    ctx.fillStyle = '#fff';
    for (let i = -1; i < 4; i += 1) {
      const x = i * 92 + drift - 80;
      const y = 70 + (i % 2) * 72;
      this.drawCloudPuff(x, y, .8 + (i & 1) * .18);
    }

    ctx.globalAlpha = .18;
    for (let i = 0; i < 6; i += 1) {
      const y = 42 + i * 38;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18 + (i % 2) * 12, y);
      ctx.quadraticCurveTo(108, y - 9, 220, y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawForestBackdrop(time, palette, boss) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = .32;
    ctx.fillStyle = palette.far;
    for (let i = 0; i < 7; i += 1) {
      const x = -8 + i * 42;
      const h = 28 + (i % 3) * 9;
      ctx.beginPath();
      ctx.moveTo(x, 320);
      ctx.lineTo(x + 18, 320 - h);
      ctx.lineTo(x + 36, 320);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = boss ? .34 : .2;
    ctx.strokeStyle = boss ? '#E6F3FF' : '#F5FFEE';
    ctx.lineWidth = boss ? 1.6 : 1;
    const drift = (time * .018) % 80;
    for (let i = 0; i < 5; i += 1) {
      const y = 64 + i * 37;
      ctx.beginPath();
      ctx.moveTo(-45 + drift, y);
      ctx.bezierCurveTo(42 + drift, y - 16, 112 + drift, y + 13, 205 + drift, y - 4);
      ctx.stroke();
    }

    ctx.globalAlpha = .38;
    ctx.fillStyle = '#3F765A';
    for (let i = 0; i < 8; i += 1) {
      const phase = time * .0014 + i * 1.7;
      const x = (i * 37 + time * .01) % 270 - 15;
      const y = 88 + Math.sin(phase) * 24 + (i % 3) * 45;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(phase);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawCloudPuff(x, y, scale = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 18 * scale, 0, Math.PI * 2);
    ctx.arc(x + 19 * scale, y - 6 * scale, 23 * scale, 0, Math.PI * 2);
    ctx.arc(x + 43 * scale, y + 1 * scale, 19 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCeiling(ceilRow) {
    const ctx = this.ctx;
    const y = this.B.rowY(ceilRow) - this.B.RAD - 4;
    ctx.strokeStyle = 'rgba(73,106,131,.48)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(this.B.LW - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawAim(points) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    points.forEach((point, index) => {
      if (index % 2) return;
      ctx.beginPath();
      ctx.arc(point.x, point.y, index < 6 ? 1.25 : .9, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawBalloon(color, x, y, scale = 1) {
    const ctx = this.ctx;
    const image = this.images.get(color);
    const size = this.B.RAD * 2 * scale;
    if (image?.complete && image.naturalWidth) {
      ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
      return;
    }
    const fill = COLORS[color] || '#fff';
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(x - size * .16, y - size * .18, size * .12, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShot(shot, x, y, time = 0) {
    this.drawBalloon(shot.color || 1, x, y, 1);
    if (shot.type === 'bomb') this.drawBombMark(x, y, time);
    else if (shot.type === 'rainbow') this.drawRainbowMark(x, y, time);
  }

  drawBombMark(x, y, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#17324D';
    ctx.beginPath();
    ctx.arc(0, 1, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#17324D';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(3, -5);
    ctx.quadraticCurveTo(6, -10, 9, -8);
    ctx.stroke();
    ctx.fillStyle = '#FFD36A';
    const spark = 1.4 + Math.sin(time * .02) * .45;
    ctx.beginPath();
    ctx.arc(9.2, -8.1, spark, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(-2.3, -1.2, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawRainbowMark(x, y, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * .004) * .05);
    const bands = ['#F35D6A', '#F5C84C', '#63B96D', '#48A9E6', '#9A6FE8'];
    bands.forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.arc(0, 1.5, 7.2 - index * 1.15, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    });
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-7.5, 2.7, 2, 0, Math.PI * 2);
    ctx.arc(7.5, 2.7, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawObject(object, x, y, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + Math.sin(time * .004 + x * .04) * .035;
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(23,50,77,.22)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    if (object.type === 'captive') this.drawCaptive();
    else if (object.type === 'collectible') this.drawCollectible();
    else if (object.type === 'anchor') this.drawAnchor();
    ctx.restore();
  }

  drawCaptive() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.strokeStyle = 'rgba(23,50,77,.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 9.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#F18A3D';
    ctx.beginPath();
    ctx.ellipse(-.6, 1, 4.2, 4.8, -.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#48A9E6';
    ctx.beginPath();
    ctx.ellipse(-2.8, 1.7, 2.4, 1.7, -.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17324D';
    ctx.beginPath();
    ctx.arc(.9, -.7, .7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F5C84C';
    ctx.beginPath();
    ctx.moveTo(3.2, .1);
    ctx.lineTo(6.5, 1.2);
    ctx.lineTo(3.2, 2.1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(23,50,77,.42)';
    ctx.lineWidth = .7;
    [-5, 0, 5].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(dx, -7.7);
      ctx.lineTo(dx, 7.7);
      ctx.stroke();
    });
  }

  drawCollectible() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 9.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#E2A613';
    starPath(ctx, 7, 3.2, 5);
    ctx.fill();
    ctx.strokeStyle = '#FFF2B9';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.arc(-2.2, -2.8, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAnchor() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.beginPath();
    ctx.arc(0, 0, 9.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#294A67';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(0, -4.7, 2.2, 0, Math.PI * 2);
    ctx.moveTo(0, -2.3);
    ctx.lineTo(0, 5.2);
    ctx.moveTo(-5.8, -.2);
    ctx.lineTo(5.8, -.2);
    ctx.moveTo(-6.8, 3.1);
    ctx.quadraticCurveTo(-5.2, 7.2, 0, 7.3);
    ctx.quadraticCurveTo(5.2, 7.2, 6.8, 3.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6.8, 3.1);
    ctx.lineTo(-4.2, 3.2);
    ctx.moveTo(6.8, 3.1);
    ctx.lineTo(4.2, 3.2);
    ctx.stroke();
  }

  drawLauncher() {
    const ctx = this.ctx;
    const x = this.B.LW / 2;
    const y = this.B.LAUNCH_Y + 17;
    ctx.fillStyle = '#8E6B48';
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 7, 32, 16, 5);
    ctx.fill();
    ctx.strokeStyle = '#A9794B';
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 7);
    ctx.lineTo(x - 8, this.B.LAUNCH_Y + 4);
    ctx.moveTo(x + 11, y - 7);
    ctx.lineTo(x + 8, this.B.LAUNCH_Y + 4);
    ctx.stroke();
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}