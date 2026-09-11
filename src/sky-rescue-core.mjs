export const MASTERY_IDS = ['bank-shot', 'avalanche', 'perfect-aim'];

export const MASTERY_BADGES = {
  'bank-shot': { label: 'Bank Shot', description: 'Skasuj balony po odbiciu od ściany.', symbol: '↗' },
  avalanche: { label: 'Avalanche', description: 'Zrzuć co najmniej 6 balonów jednym strzałem.', symbol: '◆' },
  'perfect-aim': { label: 'Perfect Aim', description: 'Ukończ poziom bez pudła.', symbol: '◎' },
};

export function createSeededRng(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function evaluateObjective(objective = { type: 'clear' }, state = {}) {
  const amount = Math.max(1, Number(objective.amount) || 1);
  switch (objective.type) {
    case 'rescue': {
      const current = Math.max(0, Number(state.rescued) || 0);
      return { complete: current >= amount, current, target: amount };
    }
    case 'collect': {
      const current = Math.max(0, Number(state.collected) || 0);
      return { complete: current >= amount, current, target: amount };
    }
    case 'anchors': {
      const current = Math.max(0, Number(state.anchorsDestroyed) || 0);
      return { complete: current >= amount, current, target: amount };
    }
    case 'survive': {
      const current = Math.max(0, Number(state.turnsSurvived) || 0);
      return { complete: current >= amount, current, target: amount };
    }
    case 'clear':
    default: {
      const remaining = Math.max(0, Number(state.remainingBalloons) || 0);
      return { complete: remaining === 0, current: remaining === 0 ? 1 : 0, target: 1 };
    }
  }
}

export function calculateStars({ completed, score = 0, thresholds = [0, 1000, 1800], optionalComplete = false }) {
  if (!completed) return 0;
  const twoStar = Number(thresholds[1]) || 0;
  const threeStar = Number(thresholds[2]) || twoStar;
  let stars = 1;
  if (score >= twoStar) stars = 2;
  if (score >= threeStar || optionalComplete) stars = 3;
  return stars;
}

export function scoreTurn({ popped = 0, dropped = 0, combo = 1, objectiveBonus = 0, cascadeCount = 0 }) {
  const normal = Math.max(0, popped) * 10;
  const droppedScore = Math.max(0, dropped) * 25;
  const multiplier = Math.min(8, 1 + Math.max(0, combo - 1) * 0.5);
  const cascadeBonus = Math.max(0, cascadeCount) * 50;
  const total = Math.round((normal + droppedScore) * multiplier) + objectiveBonus + cascadeBonus;
  return {
    normal,
    dropped: droppedScore,
    multiplier,
    objectiveBonus,
    cascadeBonus,
    total,
  };
}

export function evaluateMasteries({ successfulBankShots = 0, largestDrop = 0, misses = 0 } = {}) {
  const earned = [];
  if (Number(successfulBankShots) > 0) earned.push('bank-shot');
  if (Number(largestDrop) >= 6) earned.push('avalanche');
  if ((Number(misses) || 0) === 0) earned.push('perfect-aim');
  return earned;
}

export function applyCampaignResult(progress = {}, levelId, stars, score, masteries = []) {
  const next = {
    ...progress,
    levels: { ...(progress.levels || {}) },
  };
  const previous = next.levels[levelId] || { stars: 0, score: 0, completed: false, masteries: [] };
  const masterySet = new Set([...(previous.masteries || []), ...masteries.filter((id) => MASTERY_IDS.includes(id))]);
  next.levels[levelId] = {
    stars: Math.max(previous.stars || 0, stars || 0),
    score: Math.max(previous.score || 0, score || 0),
    completed: Boolean(previous.completed || stars > 0),
    masteries: MASTERY_IDS.filter((id) => masterySet.has(id)),
  };
  return next;
}

export function isLevelUnlocked(level, levels, progress = {}) {
  const index = levels.findIndex((candidate) => candidate.id === level.id);
  if (index <= 0) return true;
  const previous = progress.levels?.[levels[index - 1].id];
  return Boolean(previous?.completed || previous?.stars > 0);
}

export function chooseRainbowColor(grid, c, r, neighborsFn) {
  const counts = new Map();
  for (const [nc, nr] of neighborsFn(c, r)) {
    const color = grid.get(`${nc},${nr}`);
    if (!color) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  let bestColor = 0;
  let bestCount = -1;
  for (const [color, count] of counts) {
    if (count > bestCount || (count === bestCount && color < bestColor)) {
      bestColor = color;
      bestCount = count;
    }
  }
  return bestColor;
}

export function bombAffectedKeys(c, r, neighborsFn) {
  const keys = new Set([`${c},${r}`]);
  for (const [nc, nr] of neighborsFn(c, r)) keys.add(`${nc},${nr}`);
  return [...keys];
}

export function isOptionalComplete(optional, state = {}) {
  if (!optional) return false;
  if (optional.type === 'accuracy') {
    return (Number(state.misses) || 0) <= (Number(optional.maxMisses) || 0);
  }
  if (optional.type === 'shots-left') {
    return (Number(state.shotsRemaining) || 0) >= (Number(optional.amount) || 0);
  }
  return false;
}

export function objectiveLabel(objective = { type: 'clear' }) {
  const amount = objective.amount || 1;
  switch (objective.type) {
    case 'rescue': return amount === 1 ? 'Uwolnij przyjaciela' : `Uwolnij ${amount} przyjaciół`;
    case 'collect': return `Zbierz ${amount} gwiazd`;
    case 'anchors': return `Zniszcz ${amount} kotwice`;
    case 'survive': return `Przetrwaj ${amount} tur`;
    default: return 'Oczyść niebo';
  }
}

export function comboCallout(popped, dropped) {
  if (dropped >= 18) return 'SKY FALL';
  if (dropped >= 6) return 'AVALANCHE';
  if (popped >= 8) return 'MEGA POP';
  if (popped >= 6) return 'SUPER';
  if (popped >= 4) return 'GREAT';
  if (popped >= 3) return 'POP';
  return '';
}