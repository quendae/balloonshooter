export const ENDURANCE_WEATHER_CONFIG = Object.freeze({
  weatherTypes: Object.freeze(['clear', 'rain', 'snow', 'frost']),
  firstMinMs: 25_000,
  firstMaxMs: 35_000,
  phaseMinMs: 25_000,
  phaseMaxMs: 40_000,
  transitionMs: 2_200,
  frostCollisionScale: .82,
  maxFrostShare: .40,
});

const BADGE = Object.freeze({
  clear: '☀ CLEAR',
  rain: '☂ RAIN',
  snow: '❄ SNOW',
  frost: '❄ FROST',
});

const CALLOUT = Object.freeze({
  clear: 'POGODNIE',
  rain: 'DESZCZ',
  snow: 'ŚNIEG',
  frost: 'MRÓZ — mniejsza kolizja pocisków',
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function sampleDuration(rng, minMs, maxMs) {
  const random = Math.max(0, Math.min(.999999, Number(rng?.()) || 0));
  return Math.round(minMs + (maxMs - minMs) * random);
}

function rotated(items, offset) {
  if (!items.length) return [];
  const index = Math.max(0, Math.floor(Number(offset) || 0)) % items.length;
  return [...items.slice(index), ...items.slice(0, index)];
}

export function weatherCallout(previous, current) {
  if (previous === 'frost' && current !== 'frost') return 'ODWILŻ — normalna wielkość pocisków';
  return CALLOUT[current] || CALLOUT.clear;
}

export function weatherBadgeLabel(weather) {
  return BADGE[weather] || BADGE.clear;
}

export function weatherShotMetadata(weather, config = ENDURANCE_WEATHER_CONFIG) {
  const weatherType = config.weatherTypes.includes(weather) ? weather : 'clear';
  return {
    weatherType,
    collisionScale: weatherType === 'frost' ? Number(config.frostCollisionScale) || .82 : 1,
  };
}

export function weatherTransitionProgress(state, nowMs, config = ENDURANCE_WEATHER_CONFIG) {
  if (state?.transitionStartedMs == null) return 1;
  const duration = Math.max(1, Number(state.transitionDurationMs) || config.transitionMs);
  return clamp01((Number(nowMs) - Number(state.transitionStartedMs)) / duration);
}

export function createEnduranceWeatherState({
  nowMs = 0,
  rng = Math.random,
  config = ENDURANCE_WEATHER_CONFIG,
} = {}) {
  const start = Number(nowMs) || 0;
  const durationMs = sampleDuration(rng, config.firstMinMs, config.firstMaxMs);
  return {
    current: 'clear',
    previous: null,
    phaseStartedMs: start,
    phaseEndsMs: start + durationMs,
    transitionStartedMs: null,
    transitionDurationMs: config.transitionMs,
    totalScheduledMs: durationMs,
    frostScheduledMs: 0,
  };
}

function chooseNextWeather(state, durationMs, rng, config) {
  const candidates = config.weatherTypes.filter((type) => type !== state.current);
  if (!candidates.length) return 'clear';
  const offset = Math.floor(clamp01(rng?.()) * candidates.length) % candidates.length;
  const ordered = rotated(candidates, offset);
  const projectedTotal = state.totalScheduledMs + durationMs;

  for (const candidate of ordered) {
    if (candidate !== 'frost') return candidate;
    const projectedFrost = state.frostScheduledMs + durationMs;
    if (projectedTotal <= 0 || projectedFrost / projectedTotal <= config.maxFrostShare + Number.EPSILON) return candidate;
  }
  return ordered.find((type) => type !== 'frost') || 'clear';
}

export function advanceEnduranceWeather(
  state,
  nowMs,
  rng = Math.random,
  config = ENDURANCE_WEATHER_CONFIG,
) {
  let next = { ...state };
  const changes = [];
  const now = Number(nowMs) || 0;

  while (now >= next.phaseEndsMs) {
    const atMs = next.phaseEndsMs;
    const durationMs = sampleDuration(rng, config.phaseMinMs, config.phaseMaxMs);
    const from = next.current;
    const to = chooseNextWeather(next, durationMs, rng, config);
    next = {
      ...next,
      current: to,
      previous: from,
      phaseStartedMs: atMs,
      phaseEndsMs: atMs + durationMs,
      transitionStartedMs: atMs,
      transitionDurationMs: config.transitionMs,
      totalScheduledMs: next.totalScheduledMs + durationMs,
      frostScheduledMs: next.frostScheduledMs + (to === 'frost' ? durationMs : 0),
    };
    changes.push({ from, to, atMs, durationMs, callout: weatherCallout(from, to) });
  }

  return { state: next, changes };
}
