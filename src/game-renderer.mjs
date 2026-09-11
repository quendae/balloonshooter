const COLORS = ['#000', '#F35D6A', '#F5C84C', '#48A9E6', '#63B96D', '#9A6FE8', '#F18A3D'];
const ICONS = { captive: '🐦', collectible: '★', anchor: '⚓' };

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
    this.drawSky(time);
    if (!state?.level) return;
    this.drawCeiling(state.ceilRow);
    if (!state.projectile && state.status === 'playing' && !state.paused) this.drawAim(state.trajectory || []);

    for (const [key, color] of state.grid) {
      const [c, r] = this.B.split(key);
      const x = this.B.colX(c, r);
      const y = this.B.rowY(r);
      this.drawBalloon(color, x, y, 1);
      const object = state.objects.get(key);
      if (object) this.drawObject(object, x, y);
    }

    for (const item of state.falling) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rot);
      this.drawBalloon(item.color, 0, 0, 0.92);
      ctx.restore();
    }

    if (state.projectile) this.drawShot(state.projectile, state.projectile.x, state.projectile.y);
    else if (state.queue[0]) this.drawShot(state.queue[0], this.B.LW / 2, this.B.LAUNCH_Y);

    this.drawLauncher();
    this.drawParticles(state.particles);

    if (state.paused) {
      ctx.fillStyle = 'rgba(16,42,69,.38)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
    }
  }

  drawSky(time) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.B.LH);
    gradient.addColorStop(0, '#8FD4FF');
    gradient.addColorStop(.58, '#C9EEFF');
    gradient.addColorStop(1, '#EEF9FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.B.LW, this.B.LH);

    ctx.globalAlpha = .24;
    ctx.fillStyle = '#fff';
    const drift = (time * .002) % 280;
    for (let i = -1; i < 3; i += 1) {
      const x = i * 110 + drift - 70;
      const y = 76 + (i % 2) * 78;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.arc(x + 22, y - 7, 29, 0, Math.PI * 2);
      ctx.arc(x + 52, y + 2, 24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

  drawShot(shot, x, y) {
    this.drawBalloon(shot.color || 1, x, y, 1);
    const ctx = this.ctx;
    if (shot.type === 'bomb') {
      ctx.fillStyle = '#17324D';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✹', x, y + 1);
    } else if (shot.type === 'rainbow') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, this.B.RAD * .72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#F35D6A';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, this.B.RAD * .5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawObject(object, x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.strokeStyle = 'rgba(23,50,77,.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-8, -8, 16, 16, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = object.type === 'collectible' ? '#D99A0A' : '#17324D';
    ctx.font = object.type === 'collectible' ? 'bold 12px system-ui' : '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ICONS[object.type] || '•', 0, .5);
    ctx.restore();
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
