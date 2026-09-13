import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENDURANCE_CONFIG,
  enduranceComboMultiplier,
  generateEnduranceRow,
  generateInitialEnduranceGrid,
  paletteForElapsed,
  scheduledSpecialType,
} from '../src/endurance-core.mjs';
import { createEnduranceGeometry, failureLineReached, shiftGridForNewRow } from '../src/endurance-geometry.mjs';
import { resolveShotOnGrid } from '../src/shot-resolution.mjs';
import { createSeededRng, scoreTurn } from '../src/sky-rescue-core.mjs';

export const PROFILE = Object.freeze({
  casual: Object.freeze({ bestMoveChance: .45, dropWeight: .25, specialAwareness: .35, shotSeconds: 3.6, jitterSeconds: .6 }),
  average: Object.freeze({ bestMoveChance: .72, dropWeight: .60, specialAwareness: .70, shotSeconds: 3.0, jitterSeconds: .5 }),
  strong: Object.freeze({ bestMoveChance: .92, dropWeight: 1.00, specialAwareness: .95, shotSeconds: 2.4, jitterSeconds: .4 }),
});

function cloneConfig(overrides = {}) {
  return {
    ...ENDURANCE_CONFIG,
    ...overrides,
    paletteThresholdMs: [...(overrides.paletteThresholdMs || ENDURANCE_CONFIG.paletteThresholdMs)],
  };
}

function configId(config) {
  const [a, b] = config.paletteThresholdMs.map((ms) => Math.round(ms / 1000));
  return `${a}-${b}s-r${config.initialRows}-s${config.firstSpecialShot}-${config.specialInterval}-c${Number(config.comboStep).toFixed(2)}-${Number(config.comboCap).toFixed(1)}`;
}

export function candidateConfigs() {
  const baseline = cloneConfig();
  const candidates = [
    { ...baseline, id: 'baseline-60-120' },
    { ...cloneConfig({ paletteThresholdMs: [50_000, 100_000] }), id: 'palette-50-100' },
    { ...cloneConfig({ paletteThresholdMs: [70_000, 140_000] }), id: 'palette-70-140' },
    { ...cloneConfig({ initialRows: 3 }), id: 'rows-3' },
    { ...cloneConfig({ initialRows: 5 }), id: 'rows-5' },
    { ...cloneConfig({ firstSpecialShot: 10 }), id: 'special-first-10' },
    { ...cloneConfig({ specialInterval: 7 }), id: 'special-every-7' },
    { ...cloneConfig({ specialInterval: 9 }), id: 'special-every-9' },
    { ...cloneConfig({ comboStep: .08 }), id: 'combo-step-08' },
    { ...cloneConfig({ comboStep: .12 }), id: 'combo-step-12' },
    { ...cloneConfig({ comboCap: 1.8 }), id: 'combo-cap-18' },
    { ...cloneConfig({ comboCap: 2.2 }), id: 'combo-cap-22' },
  ];
  return candidates.map((item) => ({ ...item, configKey: configId(item) }));
}

function hashSeed(seed, salt) {
  let value = Number(seed) >>> 0;
  const text = String(salt);
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value || 1;
}

function legalCells(grid, geometry) {
  const out = [];
  for (let r = 0; r <= geometry.MAXROW; r += 1) {
    for (let c = 0; c < geometry.rowCols(r); c += 1) {
      if (geometry.occ(grid, c, r)) continue;
      if (!geometry.supported(grid, c, r, 0)) continue;
      out.push([c, r]);
    }
  }
  return out;
}

function evaluateCandidate({ grid, geometry, shot, c, r, palette, rng, profile }) {
  const trial = new Map(grid);
  const fallbackColor = () => palette[Math.min(palette.length - 1, Math.floor(rng() * palette.length))] || 1;
  const result = resolveShotOnGrid({ grid: trial, shot, c, r, geometry, pickColor: fallbackColor, ceilRow: 0 });
  const removed = result.popped.length + result.dropped.length;
  const value = result.popped.length + result.dropped.length * profile.dropWeight;
  return { c, r, removed, value, popped: result.popped.length, dropped: result.dropped.length };
}

function chooseCandidate({ grid, geometry, shot, palette, rng, profile }) {
  const cells = legalCells(grid, geometry);
  if (!cells.length) return null;
  const evaluated = cells.map(([c, r]) => evaluateCandidate({ grid, geometry, shot, c, r, palette, rng, profile }));
  evaluated.sort((a, b) => b.value - a.value || b.removed - a.removed || a.r - b.r || a.c - b.c);

  const special = shot.type !== 'normal';
  const bestChance = special
    ? Math.max(profile.bestMoveChance, profile.specialAwareness)
    : profile.bestMoveChance;
  if (rng() < bestChance) return evaluated[0];

  const poolStart = Math.min(evaluated.length - 1, Math.max(0, Math.floor(evaluated.length * .28)));
  const pool = evaluated.slice(poolStart);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] || evaluated.at(-1);
}

function insertPressureRow(state, palette, rng) {
  const shifted = shiftGridForNewRow(state.grid, state.geometry);
  if (shifted.overflowed) return false;
  state.rowPhase = shifted.nextRowPhase;
  state.geometry = createEnduranceGeometry({ rowPhase: state.rowPhase });
  state.grid = shifted.grid;
  if (failureLineReached(state.grid, state.geometry)) return false;
  for (const cell of generateEnduranceRow({ geometry: state.geometry, targetRow: 0, palette, rng })) {
    state.geometry.setBalloon(state.grid, cell.c, cell.r, cell.color);
  }
  state.rowsAdded += 1;
  return !failureLineReached(state.grid, state.geometry);
}

function snapshotMilestone(state, elapsedMs) {
  return {
    reached: true,
    elapsedMs: Math.round(elapsedMs),
    rowsAdded: state.rowsAdded,
    misses: state.misses,
    gridSize: state.grid.size,
    lowestRow: state.geometry.lowestRow(state.grid),
  };
}

function makeSpecialStats() {
  return {
    guide: { used: 0, successful: 0, removed: 0 },
    bomb: { used: 0, successful: 0, removed: 0 },
    rainbow: { used: 0, successful: 0, removed: 0 },
  };
}

export function simulateRun({ seed = 1, profile = 'average', config = ENDURANCE_CONFIG, maxSeconds = 600 } = {}) {
  const player = PROFILE[profile];
  if (!player) throw new Error(`Unknown Endurance balance profile: ${profile}`);
  const cfg = cloneConfig(config);
  const rng = createSeededRng(hashSeed(seed, `${profile}:${configId(cfg)}`));
  let geometry = createEnduranceGeometry({ rowPhase: 0 });
  const initialPalette = paletteForElapsed(0, cfg);
  let grid = generateInitialEnduranceGrid({ geometry, palette: initialPalette, rng, rows: cfg.initialRows });
  const state = {
    geometry,
    grid,
    rowPhase: 0,
    rowsAdded: 0,
    misses: 0,
  };

  let elapsedMs = 0;
  let resolvedShots = 0;
  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  let maxLowestRow = geometry.lowestRow(grid);
  let previousWasSpecial = false;
  let clearBonusArmed = grid.size > 0;
  let at60s = null;
  let at120s = null;
  let lossReason = 'time-cap';
  const specials = makeSpecialStats();
  const maxMs = Math.max(1_000, Number(maxSeconds) * 1000 || 600_000);

  while (elapsedMs < maxMs) {
    const jitter = (rng() * 2 - 1) * player.jitterSeconds;
    const seconds = Math.max(1, player.shotSeconds + jitter);
    const beforeMs = elapsedMs;
    elapsedMs += seconds * 1000;
    const palette = paletteForElapsed(elapsedMs, cfg);
    const specialType = scheduledSpecialType({ resolvedShots, previousWasSpecial }, cfg);
    const color = palette[Math.min(palette.length - 1, Math.floor(rng() * palette.length))] || 1;
    const shot = specialType
      ? { type: specialType, color: specialType === 'rainbow' ? 0 : color }
      : { type: 'normal', color };
    previousWasSpecial = shot.type !== 'normal';

    const chosen = chooseCandidate({ grid: state.grid, geometry: state.geometry, shot, palette, rng, profile: player });
    if (!chosen) {
      lossReason = 'no-legal-snap';
      break;
    }

    const result = resolveShotOnGrid({
      grid: state.grid,
      shot,
      c: chosen.c,
      r: chosen.r,
      geometry: state.geometry,
      pickColor: () => palette[Math.min(palette.length - 1, Math.floor(rng() * palette.length))] || 1,
      ceilRow: 0,
    });
    resolvedShots += 1;
    const removed = result.popped.length + result.dropped.length;

    if (shot.type !== 'normal') {
      specials[shot.type].used += 1;
      specials[shot.type].removed += removed;
      if (removed > 0) specials[shot.type].successful += 1;
    }

    if (removed > 0) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      const breakdown = scoreTurn({
        popped: result.popped.length,
        dropped: result.dropped.length,
        combo: 1,
        cascadeCount: result.dropped.length >= 3 ? 1 : 0,
      });
      score += Math.round(breakdown.total * enduranceComboMultiplier(combo, cfg));
      if (state.grid.size === 0 && clearBonusArmed) {
        score += Math.max(0, Number(cfg.clearBonus) || 0);
        clearBonusArmed = false;
      } else if (state.grid.size > 0) {
        clearBonusArmed = true;
      }
    } else {
      combo = 0;
      state.misses += 1;
      if (!insertPressureRow(state, palette, rng)) {
        lossReason = 'pressure-line';
        maxLowestRow = Math.max(maxLowestRow, state.geometry.lowestRow(state.grid));
        break;
      }
      clearBonusArmed = true;
    }

    maxLowestRow = Math.max(maxLowestRow, state.geometry.lowestRow(state.grid));
    if (failureLineReached(state.grid, state.geometry)) {
      lossReason = 'pressure-line';
      break;
    }

    if (!at60s && beforeMs < 60_000 && elapsedMs >= 60_000) at60s = snapshotMilestone(state, elapsedMs);
    if (!at120s && beforeMs < 120_000 && elapsedMs >= 120_000) at120s = snapshotMilestone(state, elapsedMs);
  }

  const survivalMs = Math.round(Math.min(elapsedMs, maxMs));
  return {
    profile,
    configId: cfg.id || configId(cfg),
    seed: Number(seed),
    survivalMs,
    score,
    bestCombo,
    resolvedShots,
    misses: state.misses,
    rowsAdded: state.rowsAdded,
    missRate: resolvedShots ? Number((state.misses / resolvedShots).toFixed(4)) : 0,
    maxLowestRow,
    at60s,
    at120s,
    specials,
    lossReason,
  };
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function runMatrix({ runs = 8, seed = 1337, configs = candidateConfigs(), profiles = Object.keys(PROFILE), maxSeconds = 600 } = {}) {
  const rows = [];
  const count = Math.max(1, Math.floor(Number(runs) || 1));
  configs.forEach((config, configIndex) => {
    profiles.forEach((profile, profileIndex) => {
      for (let index = 0; index < count; index += 1) {
        const runSeed = hashSeed(seed + index, `${config.id || configIndex}:${profile}:${profileIndex}`);
        rows.push(simulateRun({ seed: runSeed, profile, config, maxSeconds }));
      }
    });
  });
  return {
    runs: rows,
    configs: configs.map((config) => config.id || configId(config)),
    profiles: [...profiles],
    runsPerProfile: count,
    seed: Number(seed),
    maxSeconds: Number(maxSeconds),
  };
}

export function summarizeResults(matrix) {
  const rows = Array.isArray(matrix) ? matrix : matrix?.runs || [];
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.configId}::${row.profile}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, items]) => {
    const [configIdValue, profile] = key.split('::');
    const survival = items.map((item) => item.survivalMs);
    const scores = items.map((item) => item.score);
    const missRates = items.map((item) => item.missRate);
    const rowsAdded = items.map((item) => item.rowsAdded);
    const combos = items.map((item) => item.bestCombo);
    return {
      configId: configIdValue,
      profile,
      samples: items.length,
      medianSurvivalMs: Math.round(quantile(survival, .5)),
      p25SurvivalMs: Math.round(quantile(survival, .25)),
      p75SurvivalMs: Math.round(quantile(survival, .75)),
      medianScore: Math.round(quantile(scores, .5)),
      missRate: Number(mean(missRates).toFixed(4)),
      medianRowsAdded: Number(quantile(rowsAdded, .5).toFixed(1)),
      medianBestCombo: Number(quantile(combos, .5).toFixed(1)),
      reached60Rate: Number((items.filter((item) => item.at60s).length / items.length).toFixed(3)),
      reached120Rate: Number((items.filter((item) => item.at120s).length / items.length).toFixed(3)),
    };
  });
}

export function classifyCandidate({ casualMedianMs = 0, averageMedianMs = 0, strongMedianMs = 0, averageMissRate = null } = {}) {
  if (averageMedianMs < 120_000 || casualMedianMs < 55_000 || strongMedianMs < 150_000) return 'TOO HARD';
  if (averageMedianMs > 280_000 || casualMedianMs > 170_000 || strongMedianMs > 420_000) return 'TOO EASY';
  if (Number.isFinite(averageMissRate) && averageMissRate > .72) return 'TOO HARD';
  if (Number.isFinite(averageMissRate) && averageMissRate < .08 && averageMedianMs > 240_000) return 'TOO EASY';
  return 'KEEP';
}

function candidateReview(summary) {
  const byConfig = new Map();
  for (const row of summary) {
    if (!byConfig.has(row.configId)) byConfig.set(row.configId, new Map());
    byConfig.get(row.configId).set(row.profile, row);
  }
  return [...byConfig.entries()].map(([id, profiles]) => {
    const casual = profiles.get('casual');
    const average = profiles.get('average');
    const strong = profiles.get('strong');
    const verdict = classifyCandidate({
      casualMedianMs: casual?.medianSurvivalMs || 0,
      averageMedianMs: average?.medianSurvivalMs || 0,
      strongMedianMs: strong?.medianSurvivalMs || 0,
      averageMissRate: average?.missRate,
    });
    return { id, verdict, casual, average, strong };
  });
}

function formatSeconds(ms) {
  return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}s`;
}

function markdownReport({ matrix, summary, review }) {
  const lines = [
    '# Endurance balance study',
    '',
    `Seed: \`${matrix.seed}\` · runs/profile/config: **${matrix.runsPerProfile}** · cap: **${matrix.maxSeconds}s**`,
    '',
    '| Candidate | Verdict | Casual median | Average median | Strong median | Avg miss rate |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ];
  for (const item of review) {
    lines.push(`| ${item.id} | **${item.verdict}** | ${formatSeconds(item.casual?.medianSurvivalMs)} | ${formatSeconds(item.average?.medianSurvivalMs)} | ${formatSeconds(item.strong?.medianSurvivalMs)} | ${((item.average?.missRate || 0) * 100).toFixed(1)}% |`);
  }
  const baseline = review.find((item) => item.id === 'baseline-60-120');
  lines.push('', '## Baseline', '');
  if (baseline) {
    lines.push(`Baseline verdict: **${baseline.verdict}**. Casual ${formatSeconds(baseline.casual?.medianSurvivalMs)}, average ${formatSeconds(baseline.average?.medianSurvivalMs)}, strong ${formatSeconds(baseline.strong?.medianSurvivalMs)}.`);
    lines.push(`Average profile reaches 60s in ${Math.round((baseline.average?.reached60Rate || 0) * 100)}% of runs and 120s in ${Math.round((baseline.average?.reached120Rate || 0) * 100)}%.`);
  }
  lines.push('', 'No production tuning is applied automatically by this harness.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = { runs: 250, seed: 1337, output: 'artifacts/endurance-balance', maxSeconds: 600 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--runs' && value) { args.runs = Number(value); i += 1; }
    else if (key === '--seed' && value) { args.seed = Number(value); i += 1; }
    else if (key === '--output' && value) { args.output = value; i += 1; }
    else if (key === '--max-seconds' && value) { args.maxSeconds = Number(value); i += 1; }
  }
  return args;
}

export async function writeStudy({ runs = 250, seed = 1337, output = 'artifacts/endurance-balance', maxSeconds = 600 } = {}) {
  const matrix = runMatrix({ runs, seed, configs: candidateConfigs(), profiles: Object.keys(PROFILE), maxSeconds });
  const summary = summarizeResults(matrix);
  const review = candidateReview(summary);
  const payload = { generatedAt: new Date().toISOString(), matrix: { ...matrix, runs: undefined }, summary, review };
  const dir = path.dirname(output);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${output}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(`${output}.md`, markdownReport({ matrix, summary, review }), 'utf8');
  return { matrix, summary, review };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = await writeStudy(args);
  const baseline = result.review.find((item) => item.id === 'baseline-60-120');
  console.log(`Endurance balance study: ${result.matrix.runs.length} runs; baseline ${baseline?.verdict || 'n/a'}`);
  console.log(`Reports: ${args.output}.json and ${args.output}.md`);
}
