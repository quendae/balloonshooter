import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FABRIC_PIXEL_SCALE,
  FabricBackgroundCache,
  backgroundThemeKey,
  createFabricPixelBackground,
} from './src/background-fabric.mjs';

function makeFakeFabric() {
  const created = [];
  class Shape {
    constructor(options = {}) {
      this.options = options;
      created.push({ type: this.constructor.name, options });
    }
  }
  class Rect extends Shape {}
  class Polygon extends Shape {
    constructor(points = [], options = {}) {
      super(options);
      this.points = points;
    }
  }
  class StaticCanvas {
    constructor(element, options = {}) {
      this.lowerCanvasEl = element;
      this.options = options;
      this.objects = [];
      this.renderCount = 0;
      created.push({ type: 'StaticCanvas', options });
    }
    add(...objects) { this.objects.push(...objects); }
    renderAll() { this.renderCount += 1; }
    dispose() {}
  }
  return { api: { Rect, Polygon, StaticCanvas }, created };
}

const fabric = makeFakeFabric();
const canvases = [];
const documentRef = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0 };
    canvases.push(canvas);
    return canvas;
  },
};

assert.equal(FABRIC_PIXEL_SCALE, 2, 'Fabric scenes should be authored at half resolution and nearest-neighbour scaled');
assert.notEqual(
  backgroundThemeKey({ world: 'meadow', atmosphere: { timeOfDay: 'day', weather: 'clear' } }),
  backgroundThemeKey({ world: 'meadow', atmosphere: { timeOfDay: 'sunset', weather: 'clear' } }),
  'time of day needs its own cached art direction',
);
assert.notEqual(
  backgroundThemeKey({ world: 'forest', atmosphere: { timeOfDay: 'night', weather: 'clear' } }),
  backgroundThemeKey({ world: 'storm', atmosphere: { timeOfDay: 'night', weather: 'storm' } }),
  'worlds need distinct cached scenes',
);

const scene = createFabricPixelBackground({
  fabricApi: fabric.api,
  documentRef,
  level: { world: 'meadow', atmosphere: { timeOfDay: 'sunset', weather: 'breeze', intensity: .5 } },
});
assert.ok(scene, 'Fabric background builder should return a canvas');
assert.equal(scene.width, 120);
assert.equal(scene.height, 160);
assert.ok(fabric.created.filter((entry) => entry.type === 'Rect').length >= 30, 'pixel scene should use many blocky Fabric rectangles');
assert.ok(fabric.created.some((entry) => entry.type === 'Polygon'), 'pixel scene should contain authored polygon silhouettes');

const cache = new FabricBackgroundCache({ fabricApi: fabric.api, documentRef });
const draws = [];
const ctx = {
  imageSmoothingEnabled: true,
  drawImage(...args) { draws.push(args); },
};
const level = { world: 'forest', atmosphere: { timeOfDay: 'night', weather: 'fog', intensity: .4 } };
assert.equal(cache.draw(ctx, level, 240, 320), true, 'available Fabric should render a cached scene');
assert.equal(cache.draw(ctx, level, 240, 320), true, 'same theme should reuse its cached scene');
assert.equal(draws.length, 2);
assert.equal(canvases.length, 2, 'cache should build the forest scene only once after the standalone meadow build');
assert.equal(ctx.imageSmoothingEnabled, true, 'renderer smoothing state should be restored after pixel scaling');

const unavailable = new FabricBackgroundCache({ fabricApi: null, documentRef });
assert.equal(unavailable.draw(ctx, level, 240, 320), false, 'renderer must fall back cleanly when Fabric is unavailable');

const indexSource = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
assert.match(indexSource, /fabric@5\.3\.0\/dist\/fabric\.min\.js/, 'index should load the pinned Fabric.js browser build');
assert.match(indexSource, /background-fabric-runtime\.mjs/, 'Fabric background installer should run before the app bootstrap');

const runtimeSource = await fs.readFile(new URL('./src/background-fabric-runtime.mjs', import.meta.url), 'utf8');
assert.match(runtimeSource, /GameRenderer\.prototype\.drawSky/, 'runtime installer should replace only the shared sky renderer');
assert.match(runtimeSource, /fabricBackgrounds\.draw/, 'runtime sky renderer should prefer cached Fabric pixel backgrounds');
assert.match(runtimeSource, /imageSmoothingEnabled/, 'pixel background runtime should preserve nearest-neighbour presentation');

console.log('✓ Fabric pixel background authoring, cache and runtime integration contract');
