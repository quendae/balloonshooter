export function windForResolvedShot(level = {}, resolvedShots = 0) {
  const sequence = Array.isArray(level.windSequence) ? level.windSequence : [];
  if (sequence.length) {
    const index = Math.min(sequence.length - 1, Math.max(0, Number(resolvedShots) || 0));
    const item = sequence[index] || sequence.at(-1);
    return { forceX: Number(item?.forceX) || 0, forceY: Number(item?.forceY) || 0 };
  }
  return {
    forceX: Number(level.wind?.forceX) || 0,
    forceY: Number(level.wind?.forceY) || 0,
  };
}

export function shouldTriggerLightning(storm, resolvedShots = 0, strikesSoFar = 0) {
  if (!storm) return false;
  const first = Math.max(1, Number(storm.firstStrikeAfterShots) || 1);
  const interval = Math.max(1, Number(storm.intervalShots) || 1);
  const expected = first + Math.max(0, Number(strikesSoFar) || 0) * interval;
  return Number(resolvedShots) === expected;
}

function rotateDeterministically(items, rng) {
  if (items.length <= 1) return [...items];
  const offset = Math.floor((rng?.() ?? 0) * items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function legalEmptyNeighbors(key, working, objects, B, failureY) {
  const [c, r] = B.split(key);
  return B.neighbors(c, r)
    .map(([nc, nr]) => ({ c: nc, r: nr, key: B.key(nc, nr) }))
    .filter((cell) => B.inGrid(cell.c, cell.r))
    .filter((cell) => !working.has(cell.key) && !objects?.has(cell.key))
    .map((cell) => ({ ...cell, safe: B.rowY(cell.r) < failureY }));
}

export function lightningSpawnPlan({
  grid,
  objects = new Map(),
  B,
  palette = [],
  rng = Math.random,
  spawnCount = [2, 4],
  failureY = Infinity,
} = {}) {
  if (!(grid instanceof Map) || !B || !grid.size || !palette.length) {
    return { strikeKey: null, additions: [] };
  }

  const occupied = [...grid.keys()]
    .map((key) => {
      const [c, r] = B.split(key);
      return { key, c, r };
    })
    .filter((cell) => legalEmptyNeighbors(cell.key, new Set(grid.keys()), objects, B, failureY).length > 0);

  if (!occupied.length) return { strikeKey: null, additions: [] };

  const preferred = occupied.filter(({ r }) => r >= 1 && r <= 6);
  const strikePool = preferred.length ? preferred : occupied;
  strikePool.sort((a, b) => {
    const da = Math.abs(a.r - 3.5);
    const db = Math.abs(b.r - 3.5);
    return da - db || a.r - b.r || a.c - b.c;
  });
  const orderedStrikes = rotateDeterministically(strikePool, rng);
  const strikeKey = orderedStrikes[0].key;

  const min = Math.max(0, Number(spawnCount?.[0]) || 0);
  const max = Math.max(min, Number(spawnCount?.[1]) || min);
  const requested = min + Math.floor((rng?.() ?? 0) * (max - min + 1));
  const working = new Set(grid.keys());
  const additions = [];
  const frontier = [strikeKey];

  while (additions.length < requested) {
    let candidates = [];
    for (const sourceKey of frontier) {
      candidates.push(...legalEmptyNeighbors(sourceKey, working, objects, B, failureY));
    }

    if (!candidates.length) {
      for (const sourceKey of working) {
        candidates.push(...legalEmptyNeighbors(sourceKey, working, objects, B, failureY));
      }
    }

    const unique = new Map();
    for (const cell of candidates) if (!unique.has(cell.key)) unique.set(cell.key, cell);
    let pool = [...unique.values()];
    if (!pool.length) break;

    const safe = pool.filter((cell) => cell.safe);
    if (safe.length) pool = safe;
    const middle = pool.filter(({ r }) => r >= 1 && r <= 6);
    if (middle.length) pool = middle;
    pool.sort((a, b) => a.r - b.r || a.c - b.c);
    pool = rotateDeterministically(pool, rng);

    const cell = pool[0];
    const colorIndex = Math.floor((rng?.() ?? 0) * palette.length) % palette.length;
    const color = palette[colorIndex];
    additions.push({ c: cell.c, r: cell.r, color });
    working.add(cell.key);
    frontier.push(cell.key);
  }

  return { strikeKey, additions };
}

function ceilingPathDepth(grid, B, startKey) {
  if (!grid.has(startKey)) return -1;
  const queue = [{ key: startKey, depth: 0 }];
  const seen = new Set([startKey]);
  while (queue.length) {
    const current = queue.shift();
    const [c, r] = B.split(current.key);
    if (r === 0) return current.depth;
    for (const [nc, nr] of B.neighbors(c, r)) {
      const key = B.key(nc, nr);
      if (nr > r || seen.has(key) || !grid.has(key)) continue;
      seen.add(key);
      queue.push({ key, depth: current.depth + 1 });
    }
  }
  return -1;
}

export function deepObjectiveCandidates({ grid, B, eligibleKeys = null } = {}) {
  if (!(grid instanceof Map) || !B || !grid.size) return [];
  const lowestRow = B.lowestRow(grid);
  const keys = Array.isArray(eligibleKeys) && eligibleKeys.length ? eligibleKeys : [...grid.keys()];
  const candidates = [];

  for (const key of keys) {
    if (!grid.has(key)) continue;
    const [c, r] = B.split(key);
    const neighbors = B.neighbors(c, r);
    const occupiedNeighbors = neighbors.filter(([nc, nr]) => grid.has(B.key(nc, nr))).length;
    const hasOccupiedBelow = neighbors.some(([nc, nr]) => nr > r && grid.has(B.key(nc, nr)));
    const pathDepth = ceilingPathDepth(grid, B, key);
    const behindFront = r <= lowestRow - 2;
    if (!behindFront || occupiedNeighbors < 2 || !hasOccupiedBelow || pathDepth < 2) continue;

    const score = 4
      + Math.min(4, occupiedNeighbors)
      + 2
      + Math.min(3, pathDepth);
    candidates.push({ key, c, r, score, occupiedNeighbors, pathDepth });
  }

  return candidates.sort((a, b) => b.score - a.score || a.r - b.r || a.c - b.c);
}

export function chooseDeepObjectiveKeys({
  grid,
  B,
  eligibleKeys = null,
  count = 1,
  rng = Math.random,
} = {}) {
  const remaining = deepObjectiveCandidates({ grid, B, eligibleKeys });
  const chosen = [];
  const wanted = Math.max(0, Number(count) || 0);

  while (chosen.length < wanted && remaining.length) {
    const bestScore = remaining[0].score;
    const best = remaining.filter((item) => item.score === bestScore);
    const index = Math.floor((rng?.() ?? 0) * best.length) % best.length;
    const pick = best[index];
    chosen.push(pick.key);
    remaining.splice(remaining.findIndex((item) => item.key === pick.key), 1);
  }
  return chosen;
}
