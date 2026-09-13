import assert from 'node:assert/strict';
import {
  BALLOON_BITMAPS,
  PIXEL_COLORS,
  decodeBitmap,
  drawPixelFrostOverlay,
  drawSpecialOrb,
  WORLD_PIXEL_PALETTES,
} from './src/pixel-art.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('pixel balloon set ships six distinct indexed-color sprites', () => {
  assert.equal(Object.keys(BALLOON_BITMAPS).length, 6);
  const decoded = Object.values(BALLOON_BITMAPS).map((bitmap) => decodeBitmap(bitmap));
  decoded.forEach((sprite) => {
    assert.equal(sprite.width, 12);
    assert.equal(sprite.height, 14);
    assert.ok(sprite.pixels.some((value) => value === 1), 'sprite needs outline pixels');
    assert.ok(sprite.pixels.some((value) => value === 2), 'sprite needs body pixels');
    assert.ok(sprite.pixels.some((value) => value === 3), 'sprite needs highlight pixels');
  });
  assert.equal(new Set(Object.values(BALLOON_BITMAPS)).size, 6);
});

test('pixel balloon palette keeps high-contrast outline, body and highlight colors', () => {
  assert.equal(PIXEL_COLORS.length, 7);
  PIXEL_COLORS.slice(1).forEach((palette) => {
    assert.match(palette.outline, /^#[0-9A-F]{6}$/i);
    assert.match(palette.body, /^#[0-9A-F]{6}$/i);
    assert.match(palette.highlight, /^#[0-9A-F]{6}$/i);
    assert.notEqual(palette.outline, palette.body);
    assert.notEqual(palette.body, palette.highlight);
  });
});

test('every campaign world has a dedicated pixel backdrop palette', () => {
  assert.deepEqual(Object.keys(WORLD_PIXEL_PALETTES).sort(), ['clouds', 'forest', 'meadow']);
  for (const palette of Object.values(WORLD_PIXEL_PALETTES)) {
    for (const key of ['skyTop', 'skyBottom', 'far', 'near', 'accent']) {
      assert.match(palette[key], /^#[0-9A-F]{6}$/i, `${key} should be a six-digit hex color`);
    }
  }
});

test('special shots expose a dedicated full-orb renderer', () => {
  assert.equal(typeof drawSpecialOrb, 'function');
});

test('Frost is a thin overlay that never repaints the full orb body', () => {
  const calls = [];
  const frostCtx = new Proxy({
    globalAlpha: 1,
    save() {}, restore() {}, translate() {}, beginPath() {},
    arc(...args) { calls.push(['arc', ...args]); },
    stroke() { calls.push(['stroke']); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return target[prop] = () => {};
    },
  });
  drawPixelFrostOverlay(frostCtx, 0, 0, 0);
  assert.ok(calls.some(([type]) => type === 'arc'));
  assert.ok(calls.filter(([type]) => type === 'fillRect').length >= 4);
  assert.equal(
    calls.some(([type, x, y, w, h]) => type === 'fillRect' && w >= 20 && h >= 20),
    false,
    'Frost must not cover the orb body',
  );
});
