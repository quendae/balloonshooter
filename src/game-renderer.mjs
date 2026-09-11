import {
  WORLD_PIXEL_PALETTES,
  drawPixelBalloon,
  drawPixelLauncher,
  drawPixelObject,
  drawPixelSpecial,
} from './pixel-art.mjs';

function snap(value) {
  return Math.round(value);
}

function pixelCloud(ctx, x, y, scale = 1, color = '#FFFFFF') {
  const s = Math.max(1, Math.round(scale * 2));
  const blocks = [
    [2, 1, 5, 2], [1, 2, 8, 2], [0, 3, 10, 2], [2, 0, 3, 2], [6, 1, 2, 2],
  ];
  ctx.fillStyle = color;
  for (const [bx, by, bw, bh] of blocks) {
    ctx.fillRect(snap(x + bx * s), snap(y + by * s), bw * s, bh * s);
  }
}

function pixelTree(ctx, x, groundY, scale = 1, leaf = '#355A48', trunk = '#70482D') {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = trunk;
  ctx.fillRect(snap(x - 2 * s), snap(groundY - 14 * s), 4 * s, 14 * s);
  ctx.fillStyle = leaf;
  ctx.fillRect(snap(x - 8 * s), snap(groundY - 24 * s), 16 * s, 6 * s);
  ctx.fillRect(snap(x - 6 * s), snap(groundY - 30 * s), 12 * s, 7 * s);
  ctx.fillRect(snap(x - 3 * s), snap(groundY - 35 * s), 6 * s, 6 * s);
}

export class GameRenderer {
  constructor(canvas, B) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.B = B;
    canvas.width = B.LW;
    canvas.height = B.LH;
    this.ctx.imageSmoothingEnabled = false;
  }

  draw(state, time = 0) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
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
      ctx.translate(snap(item.x), snap(item.y));
      const quarter = Math.round(item.rot / (Math.PI / 2)) * (Math.PI / 2);
      ctx.rotate(quarter);
      this.drawBalloon(item.color, 0, 0, 0.92);
      ctx.restore();
    }

    if (state.projectile) this.drawShot(state.projectile, state.projectile.x, state.projectile.y, time);
    else if (state.queue[0]) this.drawShot(state.queue[0], this.B.LW / 2, this.B.LAUNCH_Y, time);

    this.drawLauncher();
    this.drawParticles(state.particles);

    if (state.paused) {
      ctx.fillStyle = 'rgba(11,24,39,.55)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let y = 0; y < this.B.LH; y += 6) ctx.fillRect(0, y, this.B.LW, 2);
    }
  }

  drawSky(level, time) {
    const ctx = this.ctx;
    const world = level?.world || 'meadow';
    const palette = WORLD_PIXEL_PALETTES[world] || WORLD_PIXEL_PALETTES.meadow;
    const split = world === 'forest' ? 152 : 174;

    ctx.fillStyle = palette.skyTop;
    ctx.fillRect(0, 0, this.B.LW, split);
    ctx.fillStyle = palette.skyBottom;
    ctx.fillRect(0, split, this.B.LW, this.B.LH - split);

    // Deliberately chunky two-tone horizon band: no gradients, no anti-aliased vectors.
    ctx.fillStyle = palette.far;
    for (let x = 0; x < this.B.LW; x += 16) {
      const rise = ((x / 16) % 4) * 3;
      ctx.fillRect(x, 226 - rise, 18, 94 + rise);
    }
    ctx.fillStyle = palette.near;
    for (let x = -8; x < this.B.LW; x += 24) {
      const rise = ((x + 8) / 24) % 3 * 5;
      ctx.fillRect(x, 257 - rise, 28, 63 + rise);
    }

    if (world === 'meadow') this.drawMeadowBackdrop(time, palette);
    else if (world === 'clouds') this.drawCloudBackdrop(time, palette);
    else this.drawForestBackdrop(time, palette, Boolean(level?.boss));

    if (level?.boss) {
      ctx.fillStyle = 'rgba(12,19,35,.2)';
      ctx.fillRect(0, 0, this.B.LW, this.B.LH);
      ctx.fillStyle = 'rgba(219,236,255,.16)';
      const flash = Math.floor(time / 220) % 17 === 0;
      if (flash) {
        ctx.fillRect(186, 34, 4, 28);
        ctx.fillRect(182, 56, 8, 4);
        ctx.fillRect(178, 60, 8, 4);
        ctx.fillRect(178, 64, 4, 20);
      }
    }
  }

  drawMeadowBackdrop(time, palette) {
    const ctx = this.ctx;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(190, 30, 18, 18);
    ctx.fillStyle = '#FFE28B';
    ctx.fillRect(194, 34, 10, 10);

    const drift = Math.floor((time * .008) % 280);
    pixelCloud(ctx, -42 + drift, 64, 1, '#EAF7FF');
    pixelCloud(ctx, 96 + (drift >> 1), 112, .8, '#DDF1FB');

    ctx.fillStyle = '#2F7C42';
    for (let x = 0; x < this.B.LW; x += 10) {
      const h = 4 + ((x / 10) % 3) * 2;
      ctx.fillRect(x, 284 - h, 6, h);
    }
  }

  drawCloudBackdrop(time) {
    const ctx = this.ctx;
    const drift = Math.floor((time * .005) % 300);
    pixelCloud(ctx, -66 + drift, 54, 1.1, '#F8FDFF');
    pixelCloud(ctx, 52 + (drift >> 1), 126, .9, '#EAF7FC');
    pixelCloud(ctx, 168 - (drift >> 2), 188, .72, '#FFFFFF');

    ctx.fillStyle = '#8AB9D0';
    ctx.fillRect(18, 252, 38, 5);
    ctx.fillRect(23, 257, 28, 5);
    ctx.fillRect(176, 240, 46, 5);
    ctx.fillRect(182, 245, 34, 5);
  }

  drawForestBackdrop(time, palette, boss) {
    const ctx = this.ctx;
    const ground = 286;
    for (let x = 10; x < this.B.LW; x += 34) {
      const variant = ((x / 34) | 0) % 2;
      pixelTree(ctx, x, ground, variant ? .85 : 1, variant ? '#3D6C50' : palette.far);
    }

    const drift = Math.floor((time * .018) % 60);
    ctx.fillStyle = boss ? '#D8E8EF' : '#C8DFD2';
    for (let row = 0; row < 4; row += 1) {
      const y = 74 + row * 42;
      for (let x = -40 + drift; x < this.B.LW + 20; x += 34) {
        ctx.fillRect(x, y, 10, 2);
        ctx.fillRect(x + 8, y - 2, 4, 2);
      }
    }

    ctx.fillStyle = '#89AD66';
    for (let i = 0; i < 7; i += 1) {
      const x = (i * 37 + Math.floor(time * .012)) % 260 - 10;
      const y = 96 + (i % 3) * 44 + ((Math.floor(time / 240) + i) % 3) * 2;
      ctx.fillRect(x, y, 5, 2);
      ctx.fillRect(x + 2, y - 2, 3, 2);
    }
  }

  drawCeiling(ceilRow) {
    const ctx = this.ctx;
    const y = snap(this.B.rowY(ceilRow) - this.B.RAD - 4);
    ctx.fillStyle = '#48647A';
    for (let x = 8; x < this.B.LW - 8; x += 8) ctx.fillRect(x, y, 4, 2);
  }

  drawAim(points) {
    const ctx = this.ctx;
    ctx.fillStyle = '#F7FCFF';
    points.forEach((point, index) => {
      if (index % 3) return;
      const size = index < 9 ? 3 : 2;
      ctx.fillRect(snap(point.x - size / 2), snap(point.y - size / 2), size, size);
    });
  }

  drawBalloon(color, x, y, scale = 1) {
    drawPixelBalloon(this.ctx, color, snap(x), snap(y), scale);
  }

  drawShot(shot, x, y) {
    this.drawBalloon(shot.color || 1, x, y, 1);
    if (shot.type === 'bomb' || shot.type === 'rainbow') {
      drawPixelSpecial(this.ctx, shot.type, snap(x), snap(y));
    }
  }

  drawObject(object, x, y, time) {
    const bob = Math.floor(time / 240 + x) % 2;
    const px = snap(x);
    const py = snap(y - 1 - bob);
    this.ctx.fillStyle = 'rgba(12,26,40,.28)';
    this.ctx.fillRect(px - 8, py - 8, 16, 16);
    drawPixelObject(this.ctx, object.type, px, py);
  }

  drawLauncher() {
    drawPixelLauncher(this.ctx, this.B.LW / 2, this.B.LAUNCH_Y + 18);
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const size = p.life > p.maxLife * .5 ? 3 : 2;
      ctx.fillRect(snap(p.x), snap(p.y), size, size);
    }
    ctx.globalAlpha = 1;
  }
}
