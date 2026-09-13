export const CLASSIC_ORB_PALETTE = [
  { base: '#ff4455', dark: '#9c1422', light: '#ff9aa5' },
  { base: '#a05cf0', dark: '#5a2a9c', light: '#cfa8ff' },
  { base: '#ffd93d', dark: '#b09000', light: '#fff0a0' },
  { base: '#4cc94c', dark: '#157d2a', light: '#a8f0a0' },
  { base: '#4da3ff', dark: '#157d2a', light: '#a8f0a0' },
  { base: '#ff6fb3', dark: '#a32a68', light: '#ffb3d8' },
];

export const PIXEL_COLORS = [
  null,
  { outline: '#5B2030', body: '#E84B5B', shadow: '#A72F43', highlight: '#FFD7C2' },
  { outline: '#6A4B1C', body: '#F4C542', shadow: '#C99321', highlight: '#FFF2A6' },
  { outline: '#183B68', body: '#3E8FE8', shadow: '#2765AD', highlight: '#BDE7FF' },
  { outline: '#214D34', body: '#55B95F', shadow: '#318446', highlight: '#C4F2B7' },
  { outline: '#43285F', body: '#8B59D5', shadow: '#603A9D', highlight: '#E7C9FF' },
  { outline: '#6C341D', body: '#EF8842', shadow: '#B95C2F', highlight: '#FFD2A8' },
];

export const WORLD_PIXEL_PALETTES = {
  meadow: { skyTop: '#4B9FE1', skyBottom: '#A8DDF5', far: '#7CBF69', near: '#4D9A50', accent: '#F2C34C' },
  clouds: { skyTop: '#5CACE6', skyBottom: '#C5E9FA', far: '#A7CFE0', near: '#E7F5FB', accent: '#FFFFFF' },
  forest: { skyTop: '#32516B', skyBottom: '#76928A', far: '#355A48', near: '#244236', accent: '#E4C15A' },
};

export const BALLOON_BITMAPS = {
  1: '000111111000/001222222100/012233322210/012333322210/122222222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
  2: '000111111000/001222222100/012333222210/012333222210/122222222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
  3: '000111111000/001222222100/012233222210/012333222210/122223222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
  4: '000111111000/001222222100/012233322210/012233322210/122223222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
  5: '000111111000/001222222100/012333322210/012233322210/122222222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
  6: '000111111000/001222222100/012233222210/012333222210/122233222221/122222222221/122222222221/122222222221/012222222210/012222222210/001222222100/000122221000/000011110000/000001100000',
};

const OBJECT_BITMAPS = {
  captive: [
    '000011110000','000122221000','001244421100','012244442210','012233342210','122233342221',
    '122233342221','012233342210','001223322100','000122221000','000011110000','000000000000',
  ].join('/'),
  collectible: [
    '000005000000','000055500000','055555555550','005555555500','000555555000','000055550000',
    '000555555000','005550555500','055500055550','050000000050','000000000000','000000000000',
  ].join('/'),
  anchor: [
    '000001100000','000012210000','000001100000','000001100000','001111111100','000001100000',
    '000001100000','010001100010','011001100110','001111111100','000111111000','000000000000',
  ].join('/'),
};

export function decodeBitmap(bitmap) {
  const rows = String(bitmap || '').split('/');
  const width = rows[0]?.length || 0;
  if (!width || rows.some((row) => row.length !== width || /[^0-9]/.test(row))) throw new Error('Invalid indexed bitmap');
  return { width, height: rows.length, pixels: rows.flatMap((row) => [...row].map((value) => Number(value))) };
}

const decodedCache = new Map();
function decoded(bitmap) {
  if (!decodedCache.has(bitmap)) decodedCache.set(bitmap, decodeBitmap(bitmap));
  return decodedCache.get(bitmap);
}

export function drawBitmap(ctx, bitmap, palette, x, y, pixelSize = 1) {
  const sprite = decoded(bitmap);
  const step = Math.max(1, Math.round(pixelSize));
  const originX = Math.round(x - (sprite.width * step) / 2);
  const originY = Math.round(y - (sprite.height * step) / 2);
  for (let row = 0; row < sprite.height; row += 1) {
    for (let col = 0; col < sprite.width; col += 1) {
      const value = sprite.pixels[row * sprite.width + col];
      if (!value) continue;
      const fill = palette[value];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(originX + col * step, originY + row * step, step, step);
    }
  }
}

function classicOrbPixelRects(color = 1) {
  const p = CLASSIC_ORB_PALETTE[Math.max(1, Math.min(6, Number(color) || 1)) - 1];
  const rects = [];
  const S = 24;
  const R = 12;
  const cx = S / 2;
  const cy = S / 2;
  for (let py = 0; py < S; py += 1) {
    for (let px = 0; px < S; px += 1) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (d > R) continue;
      let fill = p.base;
      if (d > R - R * 0.16) fill = p.dark;
      const hc = Math.hypot(px + 0.5 - (cx - R * 0.37), py + 0.5 - (cy - R * 0.43));
      if (hc < R * 0.28) fill = p.light;
      if (hc < R * 0.12) fill = '#fff';
      rects.push({ x: px, y: py, fill });
    }
  }
  return rects;
}

const classicOrbRectCache = new Map();
export function classicOrbRects(color = 1) {
  const key = Math.max(1, Math.min(6, Number(color) || 1));
  if (!classicOrbRectCache.has(key)) classicOrbRectCache.set(key, classicOrbPixelRects(key));
  return classicOrbRectCache.get(key);
}

export function classicOrbDataUri(color = 1) {
  const rects = classicOrbRects(color)
    .map(({ x, y, fill }) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function balloonPalette(color) {
  const swatch = PIXEL_COLORS[color] || PIXEL_COLORS[1];
  return { 1: swatch.outline, 2: swatch.body, 3: swatch.highlight, 4: swatch.shadow };
}

export function drawPixelBalloon(ctx, color, x, y, scale = 1) {
  const bitmap = BALLOON_BITMAPS[color] || BALLOON_BITMAPS[1];
  const step = scale >= .82 ? 2 : 1;
  drawBitmap(ctx, bitmap, balloonPalette(color), x, y, step);
}

export function balloonDataUri(color = 1) {
  const bitmap = BALLOON_BITMAPS[color] || BALLOON_BITMAPS[1];
  const sprite = decoded(bitmap);
  const palette = balloonPalette(color);
  const rects = [];
  for (let row = 0; row < sprite.height; row += 1) {
    for (let col = 0; col < sprite.width; col += 1) {
      const value = sprite.pixels[row * sprite.width + col];
      if (!value || !palette[value]) continue;
      rects.push(`<rect x="${col}" y="${row}" width="1" height="1" fill="${palette[value]}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sprite.width} ${sprite.height}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function drawPixelObject(ctx, type, x, y) {
  const bitmap = OBJECT_BITMAPS[type];
  if (!bitmap) return;
  const palettes = {
    captive: { 1: '#162A40', 2: '#F0F5F8', 3: '#EE8441', 4: '#4A98DD' },
    collectible: { 5: '#FFD24C' },
    anchor: { 1: '#E7EFF4', 2: '#5E7B91' },
  };
  drawBitmap(ctx, bitmap, palettes[type], x, y, 1);
}

function specialCircle(ctx, fill, outline, lineWidth = 2) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBombOrb(ctx, x, y, scale = 1, time = 0) {
  const pulse = .5 + .5 * Math.sin(time * .012);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  specialCircle(ctx, '#252d39', '#0b1119', 2.2);
  ctx.fillStyle = '#424c5c';
  ctx.beginPath();
  ctx.arc(-3.5, -3.5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb52b';
  ctx.beginPath();
  ctx.arc(2, 2, 4 + pulse * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath();
  ctx.arc(.8, .7, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b2430';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(5, -7); ctx.quadraticCurveTo(8, -13, 10, -11);
  ctx.stroke();
  ctx.fillStyle = pulse > .55 ? '#fff27c' : '#ff7a32';
  ctx.fillRect(9, -13, 2.5, 2.5);
  ctx.restore();
}

function drawRainbowOrb(ctx, x, y, scale = 1, time = 0) {
  const colors = ['#e84b5b', '#f4c542', '#55b95f', '#3e8fe8', '#8b59d5', '#ef8842'];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  for (let i = 0; i < colors.length; i += 1) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 12, (i / colors.length) * Math.PI * 2 - Math.PI / 2, ((i + 1) / colors.length) * Math.PI * 2 - Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#f8fbff';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  const shimmer = ((time * .018) % 22) - 11;
  ctx.globalAlpha = .55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(shimmer - 3, -8); ctx.lineTo(shimmer + 3, 8);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath();
  ctx.arc(-4, -5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGuideOrb(ctx, x, y, scale = 1, time = 0) {
  const pulse = .65 + .35 * Math.sin(time * .01);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = `rgba(238,250,255,${.72 + pulse * .24})`;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.arc(0, 0, 12.7 + pulse * .55, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(22,77,114,.92)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.arc(0, 0, 9.1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#f5fcff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-14, 0); ctx.lineTo(-9.5, 0);
  ctx.moveTo(14, 0); ctx.lineTo(9.5, 0);
  ctx.moveTo(0, -14); ctx.lineTo(0, -9.5);
  ctx.moveTo(0, 14); ctx.lineTo(0, 9.5);
  ctx.stroke();

  ctx.fillStyle = '#164d72';
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

export function drawSpecialOrb(ctx, type, x, y, scale = 1, time = 0) {
  if (type === 'bomb') return drawBombOrb(ctx, x, y, scale, time);
  if (type === 'rainbow') return drawRainbowOrb(ctx, x, y, scale, time);
  if (type === 'guide') return drawGuideOrb(ctx, x, y, scale, time);
  return false;
}

export function drawPixelSpecial(ctx, type, x, y) {
  const time = Number(globalThis.performance?.now?.()) || 0;
  return drawSpecialOrb(ctx, type, x, y, 1, time);
}

export function drawPixelLauncher(ctx, x, y) {
  const dark = '#18293A';
  const metal = '#526C7F';
  const wood = '#9C6238';
  const light = '#E0B06B';
  ctx.fillStyle = dark;
  ctx.fillRect(Math.round(x - 11), Math.round(y - 5), 22, 11);
  ctx.fillStyle = wood;
  ctx.fillRect(Math.round(x - 9), Math.round(y - 3), 18, 8);
  ctx.fillStyle = light;
  ctx.fillRect(Math.round(x - 7), Math.round(y - 2), 3, 5);
  ctx.fillStyle = metal;
  ctx.fillRect(Math.round(x - 4), Math.round(y - 8), 8, 4);
  ctx.fillStyle = dark;
  ctx.fillRect(Math.round(x - 2), Math.round(y - 9), 4, 2);
}