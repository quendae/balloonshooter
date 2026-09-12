export const ENDURANCE_CONFIG = Object.freeze({
  shotsPerRound: 3,
  initialRows: 4,
  initialEvenCols: 10,
  initialOddCols: 9,
  initialMaxRows: 10,
  rowsAddedPerExpansion: 2,
  colsAddedPerSidePerExpansion: 1,
  minOrbRadius: 6.5,
  expansionTimesSeconds: [55, 100, 140, 175, 205],
  laterExpansionIntervalSeconds: 27,
  adaptiveExpansionWindowSeconds: 8,
  zoomDurationSeconds: 0.6,
  initialColorCount: 4,
  fifthColorStage: 3,
  roundMultiplierStepRounds: 5,
  roundMultiplierStep: 0.25,
  maxEnduranceMultiplier: 3,
  survivalBonus: 100,
  clearBonus: 1000,
  firstSpecialRound: 4,
  specialEveryResolvedShots: 6,
});

export function createEnduranceState() {
  return {
    round: 1,
    shotsInRound: 0,
    resolvedShots: 0,
    difficultyStage: 0,
    spatialStage: 0,
  };
}

export function advanceRoundState(state, config = ENDURANCE_CONFIG) {
  const next = {
    ...state,
    resolvedShots: Math.max(0, Number(state?.resolvedShots) || 0) + 1,
    shotsInRound: Math.max(0, Number(state?.shotsInRound) || 0) + 1,
  };
  let roundCompleted = false;
  if (next.shotsInRound >= config.shotsPerRound) {
    next.shotsInRound = 0;
    next.round = Math.max(1, Number(state?.round) || 1) + 1;
    roundCompleted = true;
  }
  return { state: next, roundCompleted };
}

export function pressureAdjustmentSeconds(value, config = ENDURANCE_CONFIG) {
  const p = Math.max(0, Math.min(1, Number(value) || 0));
  const window = config.adaptiveExpansionWindowSeconds;
  if (p <= .45) return -window;
  if (p >= .75) return window;
  if (p <= .60) return -window + ((p - .45) / .15) * window;
  return ((p - .60) / .15) * window;
}

export function baseExpansionTimeSeconds(stage, config = ENDURANCE_CONFIG) {
  const value = Math.max(1, Math.floor(Number(stage) || 1));
  const fixed = config.expansionTimesSeconds;
  if (value <= fixed.length) return fixed[value - 1];
  return fixed.at(-1) + (value - fixed.length) * config.laterExpansionIntervalSeconds;
}

export function adjustedExpansionTimeSeconds(stage, pressure, config = ENDURANCE_CONFIG) {
  return baseExpansionTimeSeconds(stage, config) + pressureAdjustmentSeconds(pressure, config);
}

export function enduranceMultiplier(round, config = ENDURANCE_CONFIG) {
  const safeRound = Math.max(1, Math.floor(Number(round) || 1));
  const steps = Math.floor((safeRound - 1) / config.roundMultiplierStepRounds);
  return Math.min(config.maxEnduranceMultiplier, 1 + steps * config.roundMultiplierStep);
}

export function survivalBonus(round, config = ENDURANCE_CONFIG) {
  return Math.round(config.survivalBonus * enduranceMultiplier(round, config));
}

export function clearBonus(round, config = ENDURANCE_CONFIG) {
  return Math.round(config.clearBonus * enduranceMultiplier(round, config));
}

export function paletteForStage(stage, config = ENDURANCE_CONFIG) {
  const count = Math.max(1, Number(stage) >= config.fifthColorStage ? 5 : config.initialColorCount);
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function scheduledSpecialType({ round = 1, resolvedShots = 0, previousWasSpecial = false } = {}, config = ENDURANCE_CONFIG) {
  const shots = Math.max(0, Math.floor(Number(resolvedShots) || 0));
  if (previousWasSpecial || Number(round) < config.firstSpecialRound) return null;
  if (shots < config.specialEveryResolvedShots * 2 || shots % config.specialEveryResolvedShots !== 0) return null;
  const types = ['guide', 'bomb', 'rainbow'];
  const index = (shots / config.specialEveryResolvedShots) - 2;
  return types[index % types.length];
}

export function updateEnduranceRecords(records = {}, result = {}) {
  const previous = {
    bestScore: Math.max(0, Number(records.bestScore) || 0),
    bestTimeMs: Math.max(0, Number(records.bestTimeMs) || 0),
    bestRound: Math.max(0, Math.floor(Number(records.bestRound) || 0)),
  };
  const score = Math.max(0, Number(result.score) || 0);
  const elapsedMs = Math.max(0, Number(result.elapsedMs) || 0);
  const round = Math.max(0, Math.floor(Number(result.round) || 0));
  return {
    records: {
      bestScore: Math.max(previous.bestScore, score),
      bestTimeMs: Math.max(previous.bestTimeMs, elapsedMs),
      bestRound: Math.max(previous.bestRound, round),
    },
    newRecords: {
      score: score > previous.bestScore,
      time: elapsedMs > previous.bestTimeMs,
      round: round > previous.bestRound,
    },
  };
}
