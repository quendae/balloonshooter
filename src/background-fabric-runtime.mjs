import { GameRenderer } from './game-renderer.mjs';
import { FabricBackgroundCache } from './background-fabric.mjs';

const INSTALL_FLAG = Symbol.for('balloon.fabricPixelBackgrounds');

function pixelCloud(ctx, x, y, scale = 1, top = '#eef2ee', shadow = '#aabac0', opacity = .55) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalAlpha = baseAlpha * opacity;
  const blocks = [
    [-14, 1, 28, 5, shadow],
    [-10, -3, 22, 6, top],
    [-5, -7, 10, 5, top],
    [5, -4, 9, 5, top],
    [-15, 0, 8, 4, top],
    [11, 1, 7, 4, shadow],
  ];
  for (const [dx, dy, w, h, fill] of blocks) {
    ctx.fillStyle = fill;
    ctx.fillRect(
      Math.round(x + dx * scale),
      Math.round(y + dy * scale),
      Math.max(1, Math.round(w * scale)),
      Math.max(1, Math.round(h * scale)),
    );
  }
  ctx.restore();
}

function drawParallax(ctx, world, atmosphere, time, width) {
  const weather = atmosphere?.weather || 'clear';
  const timeOfDay = atmosphere?.timeOfDay || 'day';
  const stormy = world === 'storm' || weather === 'storm' || weather === 'heavy-rain';
  const night = timeOfDay === 'night';
  const drift = (time * (stormy ? .006 : .0032)) % (width + 100);
  const top = stormy ? '#78868e' : night ? '#84959e' : '#eef0e5';
  const shadow = stormy ? '#40515d' : night ? '#526675' : '#b5c4c2';
  const alpha = stormy ? .28 : world === 'clouds' ? .32 : .18;

  pixelCloud(ctx, -38 + drift, 76, .8, top, shadow, alpha);
  pixelCloud(ctx, width + 34 - drift * .55, 116, .62, top, shadow, alpha * .82);
  if (world === 'clouds' || stormy) pixelCloud(ctx, 72 + drift * .18, 166, .7, top, shadow, alpha * .72);
}

function drawPixelFog(ctx, time, width, height, intensity) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  for (let i = 0; i < 5; i += 1) {
    const y = Math.round(82 + i * 43 + Math.sin(time * .00055 + i) * 4);
    const x = Math.round(((time * .004 + i * 37) % 28) - 14);
    ctx.globalAlpha = baseAlpha * (.07 + intensity * .07 + (i % 2) * .025);
    ctx.fillStyle = '#edf4ef';
    ctx.fillRect(x, y, width + 28, 10 + (i % 2) * 4);
    for (let d = 0; d < 12; d += 1) {
      ctx.globalAlpha = baseAlpha * .08;
      ctx.fillRect((d * 41 + i * 17) % width, y - 4 + ((d * 7) % 17), 3, 2);
    }
  }
  ctx.restore();
}

function drawPixelWind(ctx, time, width, intensity, windy) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = '#edf8f5';
  ctx.globalAlpha = baseAlpha * (windy ? .28 : .16);
  const count = windy ? 13 : 7;
  for (let i = 0; i < count; i += 1) {
    const speed = windy ? .055 : .028;
    const x = Math.round(((i * 47 + time * speed) % (width + 58)) - 29);
    const y = 52 + ((i * 31) % 178);
    const len = Math.round(8 + intensity * 9 + (i % 3) * 3);
    ctx.fillRect(x, y, len, 1);
    if (i % 3 === 0) ctx.fillRect(x + len - 2, y + 1, 4, 1);
  }
  ctx.restore();
}

function drawPixelRain(ctx, time, width, height, intensity, mode) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = mode === 'storm' ? '#c9e0ed' : '#d6e8ee';
  ctx.globalAlpha = baseAlpha * (mode === 'storm' ? .42 : mode === 'heavy-rain' ? .34 : .28);
  const count = mode === 'storm' ? 54 : mode === 'heavy-rain' ? 42 : 28;
  const speed = mode === 'storm' ? .19 : mode === 'heavy-rain' ? .145 : .105;
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(((i * 37 + time * speed) % (width + 42)) - 21);
    const y = Math.round(((i * 61 + time * speed * 1.75) % (height + 42)) - 21);
    const len = Math.round(4 + intensity * 5 + (i % 2));
    ctx.fillRect(x, y, 1, len);
    if (mode === 'storm' && i % 4 === 0) ctx.fillRect(x - 1, y + len - 1, 1, 2);
  }
  ctx.restore();
}

function drawWeather(ctx, world, atmosphere, time, width, height) {
  const weather = atmosphere?.weather || 'clear';
  const intensity = Math.max(0, Math.min(1, Number(atmosphere?.intensity) || 0));

  drawParallax(ctx, world, atmosphere, time, width);

  if (weather === 'clouds' || weather === 'overcast' || weather === 'storm') {
    const stormy = weather === 'storm';
    const top = stormy ? '#75848c' : weather === 'overcast' ? '#b1bec0' : '#e7ece8';
    const shadow = stormy ? '#3f505b' : weather === 'overcast' ? '#7e8f93' : '#b0c0c0';
    pixelCloud(ctx, 44 + Math.sin(time * .00028) * 12, 42, 1.0, top, shadow, stormy ? .32 : .18 + intensity * .16);
    pixelCloud(ctx, 181 - Math.sin(time * .0002) * 11, 78, .85, top, shadow, stormy ? .28 : .15 + intensity * .13);
  }
  if (weather === 'fog') drawPixelFog(ctx, time, width, height, intensity);
  if (weather === 'breeze' || weather === 'windy') drawPixelWind(ctx, time, width, intensity, weather === 'windy');
  if (weather === 'rain' || weather === 'heavy-rain' || weather === 'storm') drawPixelRain(ctx, time, width, height, intensity, weather);
}

function drawPixelVignette(ctx, width, height, strength = .26) {
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = '#07151f';
  const bands = [
    [0, 0, width, 5, strength * .58],
    [0, height - 9, width, 9, strength * .7],
    [0, 0, 7, height, strength * .62],
    [width - 7, 0, 7, height, strength * .62],
  ];
  for (const [x, y, w, h, alpha] of bands) {
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = baseAlpha * strength * .34;
  for (let i = 0; i < 36; i += 1) {
    const x = (i * 41 + 3) % width;
    const y = i % 2 ? (i * 13) % 34 : height - 1 - ((i * 11) % 34);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

export function installFabricPixelBackgrounds({ fabricApi = globalThis.fabric, documentRef = globalThis.document } = {}) {
  if (GameRenderer.prototype[INSTALL_FLAG]) return false;
  const legacyDrawSky = GameRenderer.prototype.drawSky;
  const fabricBackgrounds = new FabricBackgroundCache({ fabricApi, documentRef });

  GameRenderer.prototype.drawSky = function fabricPixelDrawSky(level, time = 0) {
    const resolved = level || { world: 'meadow', atmosphere: { timeOfDay: 'day', weather: 'clear', intensity: 0 } };
    const atmosphere = resolved.atmosphere || { timeOfDay: 'day', weather: 'clear', intensity: 0 };
    const world = resolved.world || 'meadow';
    const usedFabric = fabricBackgrounds.draw(this.ctx, resolved, this.B.LW, this.B.LH);
    if (!usedFabric) return legacyDrawSky.call(this, level, time);

    drawWeather(this.ctx, world, atmosphere, time, this.B.LW, this.B.LH);
    if (resolved.boss || atmosphere.weather === 'storm') drawPixelVignette(this.ctx, this.B.LW, this.B.LH, resolved.boss ? .34 : .27);
    return true;
  };

  Object.defineProperty(GameRenderer.prototype, INSTALL_FLAG, { value: true, configurable: false });
  return true;
}
