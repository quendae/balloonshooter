export const FABRIC_PIXEL_SCALE = 2;
export const FABRIC_SCENE_WIDTH = 120;
export const FABRIC_SCENE_HEIGHT = 160;

const DAY_PALETTES = {
  day: ['#4b96c8', '#65acd5', '#86c3df', '#afd8e6'],
  morning: ['#5a9fc9', '#7bb8d6', '#a9d4df', '#ecd8a4'],
  'late-day': ['#4c7fa8', '#6b98b6', '#a8b8b5', '#d7bc83'],
  sunset: ['#3d5f88', '#816f8d', '#c17d75', '#e5b26e'],
  dusk: ['#263b61', '#4f4d72', '#7d5f73', '#b27767'],
  night: ['#0b1c36', '#17304e', '#274763', '#425e70'],
};

const WORLD_PALETTES = {
  meadow: {
    far: '#688fa1', mid: '#527c86', near: '#6d955c', ground: '#4f7c47', dark: '#31553b', accent: '#e8c45b',
    cloud: '#f0eee0', cloudShadow: '#c5d0c9',
  },
  clouds: {
    far: '#82aabb', mid: '#6694a8', near: '#aac8ce', ground: '#6f9baa', dark: '#4f7482', accent: '#e9f1e8',
    cloud: '#f2f4ef', cloudShadow: '#b6c6c8',
  },
  forest: {
    far: '#566f77', mid: '#3f6060', near: '#315444', ground: '#233f35', dark: '#172f2b', accent: '#d2b55a',
    cloud: '#c6d0ca', cloudShadow: '#81908e',
  },
  storm: {
    far: '#566875', mid: '#405663', near: '#304b55', ground: '#203b44', dark: '#152b33', accent: '#d5e0d2',
    cloud: '#7b8992', cloudShadow: '#44545f',
  },
};

function cleanWorld(world) {
  return WORLD_PALETTES[world] ? world : 'meadow';
}

function cleanTime(timeOfDay) {
  return DAY_PALETTES[timeOfDay] ? timeOfDay : 'day';
}

function cleanWeather(weather) {
  return String(weather || 'clear').toLowerCase();
}

export function backgroundThemeKey(level = {}) {
  const atmosphere = level?.atmosphere || {};
  return [
    cleanWorld(level?.world),
    cleanTime(atmosphere.timeOfDay),
    cleanWeather(atmosphere.weather),
    level?.boss ? 'boss' : 'normal',
  ].join(':');
}

function makeOptions(options = {}) {
  return {
    selectable: false,
    evented: false,
    objectCaching: false,
    strokeWidth: 0,
    originX: 'left',
    originY: 'top',
    ...options,
  };
}

function addRect(scene, F, left, top, width, height, fill, opacity = 1) {
  scene.add(new F.Rect(makeOptions({
    left: Math.round(left), top: Math.round(top), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), fill, opacity,
  })));
}

function addPoly(scene, F, points, fill, opacity = 1) {
  scene.add(new F.Polygon(points.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) })), makeOptions({ fill, opacity })));
}

function addSkyBands(scene, F, colors) {
  const bands = 10;
  for (let i = 0; i < bands; i += 1) {
    const t = i / Math.max(1, bands - 1);
    const colorIndex = Math.min(colors.length - 1, Math.floor(t * colors.length));
    addRect(scene, F, 0, i * 16, FABRIC_SCENE_WIDTH, 17, colors[colorIndex]);
  }

  const ditherColor = colors[Math.min(colors.length - 1, 2)];
  for (let i = 0; i < 24; i += 1) {
    const x = (i * 37 + 11) % FABRIC_SCENE_WIDTH;
    const y = 27 + ((i * 19) % 63);
    addRect(scene, F, x, y, i % 3 === 0 ? 2 : 1, 1, ditherColor, .22);
  }
}

function addPixelDisc(scene, F, cx, cy, radius, fill, glow = null) {
  if (glow) {
    const rings = [radius + 4, radius + 2];
    rings.forEach((r, index) => {
      for (let y = -r; y <= r; y += 2) {
        const span = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
        addRect(scene, F, cx - span, cy + y, span * 2 + 1, 2, glow, index ? .16 : .08);
      }
    });
  }
  for (let y = -radius; y <= radius; y += 2) {
    const span = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)));
    addRect(scene, F, cx - span, cy + y, span * 2 + 1, 2, fill);
  }
}

function addPixelCloud(scene, F, x, y, scale, top, shadow, opacity = 1) {
  const blocks = [
    [-14, 1, 28, 5, shadow],
    [-10, -3, 22, 6, top],
    [-5, -7, 10, 5, top],
    [5, -4, 9, 5, top],
    [-15, 0, 8, 4, top],
    [11, 1, 7, 4, shadow],
  ];
  for (const [dx, dy, w, h, fill] of blocks) addRect(scene, F, x + dx * scale, y + dy * scale, w * scale, h * scale, fill, opacity);
}

function addMountains(scene, F, palette, flavor = 'soft') {
  const far = flavor === 'storm'
    ? [[0, 116], [18, 88], [31, 105], [48, 76], [66, 109], [86, 82], [103, 106], [120, 91], [120, 160], [0, 160]]
    : [[0, 118], [17, 101], [34, 111], [53, 91], [72, 111], [91, 96], [106, 108], [120, 99], [120, 160], [0, 160]];
  const mid = flavor === 'storm'
    ? [[0, 132], [16, 112], [34, 127], [52, 101], [70, 131], [91, 109], [108, 128], [120, 116], [120, 160], [0, 160]]
    : [[0, 131], [18, 117], [37, 126], [57, 109], [79, 130], [98, 115], [120, 128], [120, 160], [0, 160]];
  addPoly(scene, F, far, palette.far);
  addPoly(scene, F, mid, palette.mid);
}

function addPine(scene, F, x, y, scale, leaf, trunk = '#513f32') {
  addRect(scene, F, x - 1 * scale, y - 7 * scale, 2 * scale, 7 * scale, trunk);
  addPoly(scene, F, [[x, y - 18 * scale], [x - 6 * scale, y - 7 * scale], [x + 6 * scale, y - 7 * scale]], leaf);
  addPoly(scene, F, [[x, y - 14 * scale], [x - 8 * scale, y - 3 * scale], [x + 8 * scale, y - 3 * scale]], leaf);
}

function addRoundTree(scene, F, x, y, scale, leaf, trunk = '#65472f') {
  addRect(scene, F, x - scale, y - 8 * scale, 2 * scale, 8 * scale, trunk);
  addRect(scene, F, x - 5 * scale, y - 14 * scale, 10 * scale, 8 * scale, leaf);
  addRect(scene, F, x - 3 * scale, y - 17 * scale, 7 * scale, 5 * scale, leaf);
  addRect(scene, F, x - 7 * scale, y - 11 * scale, 4 * scale, 5 * scale, leaf);
}

function addWindmill(scene, F, x, y, palette) {
  addRect(scene, F, x - 2, y - 16, 5, 16, '#72533c');
  addRect(scene, F, x - 4, y - 19, 9, 4, '#d6c18c');
  addRect(scene, F, x, y - 26, 1, 15, palette.dark);
  addRect(scene, F, x - 7, y - 19, 15, 1, palette.dark);
  addRect(scene, F, x - 1, y - 20, 3, 3, palette.accent);
}

function addMeadow(scene, F, palette, timeOfDay) {
  const sunset = ['sunset', 'dusk', 'late-day'].includes(timeOfDay);
  const sunX = sunset ? 99 : timeOfDay === 'morning' ? 28 : 94;
  const sunY = timeOfDay === 'sunset' ? 71 : timeOfDay === 'late-day' ? 49 : 27;
  addPixelDisc(scene, F, sunX, sunY, 6, sunset ? '#ffd080' : '#fff0a4', '#f4ba69');
  addPixelCloud(scene, F, 25, 36, 1, palette.cloud, palette.cloudShadow, .76);
  addPixelCloud(scene, F, 74, 55, .8, palette.cloud, palette.cloudShadow, .55);
  addPixelCloud(scene, F, 110, 42, .65, palette.cloud, palette.cloudShadow, .42);
  addMountains(scene, F, palette);
  addPoly(scene, F, [[0, 132], [18, 123], [39, 131], [58, 119], [79, 132], [101, 121], [120, 130], [120, 160], [0, 160]], palette.near);
  addPoly(scene, F, [[0, 145], [22, 136], [44, 143], [67, 134], [91, 142], [120, 136], [120, 160], [0, 160]], palette.ground);
  for (let i = 0; i < 11; i += 1) addRoundTree(scene, F, i * 13 - 3, 151 + (i % 3), .55 + (i % 2) * .08, i % 2 ? palette.dark : '#3e6c47');
  addWindmill(scene, F, 101, 139, palette);
  for (let i = 0; i < 19; i += 1) addRect(scene, F, (i * 17 + 5) % 118, 147 + ((i * 7) % 10), 1, 1, i % 2 ? palette.accent : '#e9e1a0', .8);
}

function addCloudWorld(scene, F, palette, timeOfDay) {
  if (timeOfDay !== 'night') addPixelDisc(scene, F, 20, 26, 5, '#f5e7a6', '#eec56d');
  addPixelCloud(scene, F, 24, 36, 1.25, palette.cloud, palette.cloudShadow, .9);
  addPixelCloud(scene, F, 88, 58, 1.05, palette.cloud, palette.cloudShadow, .72);
  addPixelCloud(scene, F, 52, 91, .8, palette.cloud, palette.cloudShadow, .48);
  addPoly(scene, F, [[3, 125], [18, 119], [29, 124], [38, 119], [48, 126], [43, 136], [12, 136]], palette.mid, .9);
  addPoly(scene, F, [[72, 116], [87, 108], [102, 116], [117, 111], [120, 132], [79, 134]], palette.near, .9);
  addRect(scene, F, 8, 133, 37, 3, palette.cloudShadow, .5);
  addRect(scene, F, 78, 131, 41, 3, palette.cloudShadow, .5);
  for (let i = 0; i < 16; i += 1) addRect(scene, F, (i * 29 + 3) % 120, 98 + ((i * 13) % 47), 2, 1, '#dce9ea', .34);
}

function addForest(scene, F, palette, timeOfDay, boss) {
  if (timeOfDay === 'night') {
    addPixelDisc(scene, F, 94, 25, 6, '#d8dfc9', '#7c8e91');
    for (let i = 0; i < 20; i += 1) addRect(scene, F, (i * 31 + 7) % 116, 9 + ((i * 17) % 53), 1, 1, '#d7e5df', .7);
  } else {
    addPixelDisc(scene, F, 92, 30, 5, '#f3dfa1', '#d2ad68');
  }
  addPixelCloud(scene, F, 31, 45, .75, palette.cloud, palette.cloudShadow, .32);
  addMountains(scene, F, palette);
  addPoly(scene, F, [[0, 132], [21, 116], [39, 130], [59, 111], [79, 131], [102, 113], [120, 126], [120, 160], [0, 160]], boss ? palette.dark : palette.near);
  for (let i = 0; i < 14; i += 1) addPine(scene, F, i * 10 - 4, 151 + (i % 3), .55 + (i % 4) * .06, i % 2 ? palette.dark : '#294a3d');
  addRect(scene, F, 0, 151, 120, 9, palette.ground);
  if (!boss) {
    addRect(scene, F, 18, 139, 10, 8, '#6a4e36');
    addPoly(scene, F, [[16, 139], [23, 133], [30, 139]], '#3a302b');
    addRect(scene, F, 21, 142, 3, 5, '#d1a85b');
  }
}

function addStorm(scene, F, palette) {
  for (let row = 0; row < 4; row += 1) {
    addPixelCloud(scene, F, 8 + row * 34, 29 + row * 9, 1.15, palette.cloud, palette.cloudShadow, .76 - row * .08);
  }
  addMountains(scene, F, palette, 'storm');
  addPoly(scene, F, [[0, 143], [17, 128], [34, 140], [51, 121], [70, 142], [90, 126], [106, 141], [120, 132], [120, 160], [0, 160]], palette.near);
  addRect(scene, F, 0, 145, 120, 15, palette.ground);
  for (let i = 0; i < 13; i += 1) addPine(scene, F, i * 11 - 5, 154 + (i % 2), .48 + (i % 3) * .05, palette.dark, '#2d3232');
  addRect(scene, F, 101, 129, 2, 16, '#26353a');
  addRect(scene, F, 97, 130, 10, 2, '#26353a');
}

function paletteFor(level = {}) {
  const world = cleanWorld(level?.world);
  const timeOfDay = cleanTime(level?.atmosphere?.timeOfDay);
  const weather = cleanWeather(level?.atmosphere?.weather);
  const palette = { ...WORLD_PALETTES[world], sky: [...DAY_PALETTES[timeOfDay]] };
  if (world === 'storm' || ['storm', 'heavy-rain', 'overcast'].includes(weather)) {
    palette.sky = palette.sky.map((color, index) => ['#263c55', '#40586a', '#5d6f78', '#7b8380'][index] || color);
    palette.cloud = '#78858c';
    palette.cloudShadow = '#3e4e59';
  }
  return { world, timeOfDay, weather, palette };
}

function fabricAvailable(F) {
  return Boolean(F?.StaticCanvas && F?.Rect && F?.Polygon);
}

export function createFabricPixelBackground({ fabricApi = globalThis.fabric, documentRef = globalThis.document, level = {} } = {}) {
  if (!fabricAvailable(fabricApi) || !documentRef?.createElement) return null;
  const element = documentRef.createElement('canvas');
  element.width = FABRIC_SCENE_WIDTH;
  element.height = FABRIC_SCENE_HEIGHT;
  const scene = new fabricApi.StaticCanvas(element, {
    width: FABRIC_SCENE_WIDTH,
    height: FABRIC_SCENE_HEIGHT,
    renderOnAddRemove: false,
    selection: false,
    backgroundColor: '#17324a',
  });
  const { world, timeOfDay, palette } = paletteFor(level);
  addSkyBands(scene, fabricApi, palette.sky);
  if (world === 'meadow') addMeadow(scene, fabricApi, palette, timeOfDay);
  else if (world === 'clouds') addCloudWorld(scene, fabricApi, palette, timeOfDay);
  else if (world === 'forest') addForest(scene, fabricApi, palette, timeOfDay, Boolean(level?.boss));
  else addStorm(scene, fabricApi, palette);
  scene.renderAll();
  try {
    Object.defineProperty(element, '__fabricPixelScene', { value: scene, configurable: true });
  } catch {}
  return element;
}

export class FabricBackgroundCache {
  constructor({ fabricApi = globalThis.fabric, documentRef = globalThis.document } = {}) {
    this.fabricApi = fabricApi;
    this.documentRef = documentRef;
    this.cache = new Map();
  }

  resolveFabric() {
    return this.fabricApi || globalThis.fabric || null;
  }

  get(level = {}) {
    const fabricApi = this.resolveFabric();
    if (!fabricAvailable(fabricApi)) return null;
    const key = backgroundThemeKey(level);
    if (!this.cache.has(key)) {
      const canvas = createFabricPixelBackground({ fabricApi, documentRef: this.documentRef, level });
      if (canvas) this.cache.set(key, canvas);
    }
    return this.cache.get(key) || null;
  }

  draw(ctx, level = {}, width = 240, height = 320) {
    if (!ctx?.drawImage) return false;
    const image = this.get(level);
    if (!image) return false;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, Math.round(width), Math.round(height));
    ctx.imageSmoothingEnabled = smoothing;
    return true;
  }

  clear() {
    for (const canvas of this.cache.values()) canvas?.__fabricPixelScene?.dispose?.();
    this.cache.clear();
  }
}
