export const ENDURANCE_CONFIG = Object.freeze({
  initialRows: 4,
  initialEvenCols: 11,
  initialOddCols: 10,
  paletteThresholdMs: [60_000, 120_000],
  initialColorCount: 4,
  maxColorCount: 6,
  comboStep: 0.10,
  comboCap: 2.0,
  clearBonus: 1000,
  firstSpecialShot: 12,
  specialInterval: 8,
  atmosphereTransitionMs: 1500,
  specialCalloutMs: 1500,
  specialCalloutCooldownMs: 8000,
});

export function paletteStageAt(elapsedMs, config = ENDURANCE_CONFIG) {
  const ms = Math.max(0, Number(elapsedMs) || 0);
  const thresholds = Array.isArray(config.paletteThresholdMs) ? config.paletteThresholdMs : [60_000, 120_000];
  if (ms >= (Number(thresholds[1]) || 120_000)) return 2;
  if (ms >= (Number(thresholds[0]) || 60_000)) return 1;
  return 0;
}

export function paletteForElapsed(elapsedMs, config = ENDURANCE_CONFIG) {
  const stage = paletteStageAt(elapsedMs, config);
  const initial = Math.max(1, Math.floor(Number(config.initialColorCount) || 4));
  const max = Math.max(initial, Math.floor(Number(config.maxColorCount) || 6));
  const count = Math.min(max, initial + stage);
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function enduranceComboMultiplier(combo, config = ENDURANCE_CONFIG) {
  const streak = Math.max(1, Math.floor(Number(combo) || 1));
  const step = Math.max(0, Number(config.comboStep) || 0);
  const cap = Math.max(1, Number(config.comboCap) || 1);
  return Math.min(cap, 1 + Math.max(0, streak - 1) * step);
}

export function classifyEnduranceResolution({ popped = 0, dropped = 0 } = {}) {
  const removed = Math.max(0, Number(popped) || 0) + Math.max(0, Number(dropped) || 0);
  return { successful: removed > 0, removed };
}

export function scheduledSpecialType({ resolvedShots = 0, previousWasSpecial = false } = {}, config = ENDURANCE_CONFIG) {
  if (previousWasSpecial) return null;
  const shots = Math.max(0, Math.floor(Number(resolvedShots) || 0));
  const first = Math.max(1, Math.floor(Number(config.firstSpecialShot) || 12));
  const interval = Math.max(1, Math.floor(Number(config.specialInterval) || 8));
  if (shots < first) return null;
  const offset = shots - first;
  if (offset % interval !== 0) return null;
  const types = ['guide', 'bomb', 'rainbow'];
  return types[(offset / interval) % types.length];
}

export function specialShotLabel(type) {
  if (type === 'bomb') return 'BOMB — niszczy obszar';
  if (type === 'rainbow') return 'RAINBOW — dopasowuje kolor';
  if (type === 'guide') return 'GUIDE — pokazuje pełną trajektorię';
  return '';
}

export function generateEnduranceRow({ geometry, targetRow = 0, palette = [], rng = Math.random } = {}) {
  if (!geometry) return [];
  const colors = palette.length ? [...palette] : [1, 2, 3, 4];
  const row = [];
  for (let c = 0; c < geometry.rowCols(targetRow); c += 1) {
    let color = colors[Math.min(colors.length - 1, Math.floor(rng() * colors.length))];
    if (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) {
      color = colors[(colors.indexOf(color) + 1) % colors.length];
    }
    row.push({ c, r: targetRow, color });
  }
  return row;
}

export function generateInitialEnduranceGrid({ geometry, palette = [], rng = Math.random, rows = ENDURANCE_CONFIG.initialRows } = {}) {
  const grid = new Map();
  if (!geometry) return grid;
  const count = Math.max(0, Math.min(geometry.MAXROW + 1, Math.floor(Number(rows) || 0)));
  for (let r = 0; r < count; r += 1) {
    for (const cell of generateEnduranceRow({ geometry, targetRow: r, palette, rng })) {
      grid.set(geometry.key(cell.c, cell.r), cell.color);
    }
  }
  return grid;
}

export function updateEnduranceRecords(records = {}, result = {}) {
  const previous = {
    bestScore: Math.max(0, Number(records.bestScore) || 0),
    bestTimeMs: Math.max(0, Number(records.bestTimeMs) || 0),
    bestCombo: Math.max(0, Math.floor(Number(records.bestCombo) || 0)),
  };
  const score = Math.max(0, Number(result.score) || 0);
  const elapsedMs = Math.max(0, Number(result.elapsedMs) || 0);
  const bestCombo = Math.max(0, Math.floor(Number(result.bestCombo) || 0));
  return {
    records: {
      bestScore: Math.max(previous.bestScore, score),
      bestTimeMs: Math.max(previous.bestTimeMs, elapsedMs),
      bestCombo: Math.max(previous.bestCombo, bestCombo),
    },
    newRecords: {
      score: score > previous.bestScore,
      time: elapsedMs > previous.bestTimeMs,
      combo: bestCombo > previous.bestCombo,
    },
  };
}
