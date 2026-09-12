import { ENDURANCE_CONFIG } from './endurance-core.mjs';

const LW = 240;
const LH = 320;
const Y0 = 48;
const LAUNCH_Y = 288;

function stageDescriptor(spatialStage = 0) {
  const stage = Math.max(0, Math.floor(Number(spatialStage) || 0));
  const evenCols = ENDURANCE_CONFIG.initialEvenCols + stage * ENDURANCE_CONFIG.colsAddedPerSidePerExpansion * 2;
  const oddCols = evenCols - 1;
  const rowCount = ENDURANCE_CONFIG.initialMaxRows + stage * ENDURANCE_CONFIG.rowsAddedPerExpansion;
  const radius = Math.min(12, LW / (2 * evenCols));
  return { stage, evenCols, oddCols, rowCount, radius };
}

export function createEnduranceGeometry({ spatialStage = 0, rowPhase = 0 } = {}) {
  const descriptor = stageDescriptor(spatialStage);
  const stage = descriptor.stage;
  const phase = Math.abs(Math.floor(Number(rowPhase) || 0)) % 2;
  const RAD = descriptor.radius;
  const PH = 2 * RAD;
  const PV = Math.sqrt(3) * RAD;
  const MAXROW = descriptor.rowCount - 1;
  const leftMargin = (LW - descriptor.evenCols * PH) / 2;
  const firstCenterX = leftMargin + RAD;

  const rowCols = (r) => (((r + phase) & 1) ? descriptor.oddCols : descriptor.evenCols);
  const colX = (c, r) => firstCenterX + (((r + phase) & 1) ? RAD : 0) + c * PH;
  const rowY = (r) => Y0 + r * PV;
  const inGrid = (c, r) => r >= 0 && r <= MAXROW && c >= 0 && c < rowCols(r);
  const key = (c, r) => `${c},${r}`;
  const split = (value) => {
    const index = value.indexOf(',');
    return [+value.slice(0, index), +value.slice(index + 1)];
  };
  const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
  const occ = (grid, c, r) => grid.has(key(c, r));

  const neighbors = (c, r) => {
    const out = [];
    for (let rr = Math.max(0, r - 1); rr <= Math.min(MAXROW, r + 1); rr += 1) {
      for (let cc = Math.max(0, c - 2); cc <= Math.min(rowCols(rr) - 1, c + 2); cc += 1) {
        if (rr === r && cc === c) continue;
        if (dist(colX(c, r), rowY(r), colX(cc, rr), rowY(rr)) < PH + 0.5) out.push([cc, rr]);
      }
    }
    return out;
  };

  const setBalloon = (grid, c, r, color) => {
    if (!inGrid(c, r) || occ(grid, c, r)) return false;
    grid.set(key(c, r), color);
    return true;
  };

  const sameColorCluster = (grid, c, r) => {
    const start = key(c, r);
    const color = grid.get(start);
    if (color === undefined) return [];
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const current = stack.pop();
      const [cc, rr] = split(current);
      for (const [nc, nr] of neighbors(cc, rr)) {
        const next = key(nc, nr);
        if (!seen.has(next) && grid.get(next) === color) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return [...seen];
  };

  const occInRow = (grid, r) => {
    const out = [];
    for (let c = 0; c < rowCols(r); c += 1) if (occ(grid, c, r)) out.push([c, r]);
    return out;
  };

  const topConnected = (grid, ceilRow = 0) => {
    const startRow = Math.max(0, Number(ceilRow) || 0);
    const seen = new Set();
    const stack = occInRow(grid, startRow).map(([c, r]) => key(c, r));
    for (const item of stack) seen.add(item);
    while (stack.length) {
      const current = stack.pop();
      const [c, r] = split(current);
      for (const [nc, nr] of neighbors(c, r)) {
        const next = key(nc, nr);
        if (!seen.has(next) && grid.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen;
  };

  const settle = (grid, c, r, ceilRow = 0) => {
    const cluster = sameColorCluster(grid, c, r);
    const popped = cluster.length >= 3 ? cluster : [];
    for (const item of popped) grid.delete(item);
    const connected = topConnected(grid, ceilRow);
    const dropped = [...grid.keys()].filter((item) => !connected.has(item));
    for (const item of dropped) grid.delete(item);
    return { popped, dropped };
  };

  const supported = (grid, c, r, ceilRow = 0) => {
    const startRow = Math.max(0, Number(ceilRow) || 0);
    if (r < startRow) return false;
    if (r === startRow) return true;
    return neighbors(c, r).some(([nc, nr]) => occ(grid, nc, nr));
  };

  const findSnap = (grid, x, y, rad = PH * 1.25, ceilRow = 0) => {
    const startRow = Math.max(0, Number(ceilRow) || 0);
    let best = null;
    let bestDistance = Infinity;
    for (let r = startRow; r <= MAXROW; r += 1) {
      for (let c = 0; c < rowCols(r); c += 1) {
        if (occ(grid, c, r) || !supported(grid, c, r, startRow)) continue;
        const distance = dist(x, y, colX(c, r), rowY(r));
        if (distance <= rad && distance < bestDistance) {
          bestDistance = distance;
          best = [c, r];
        }
      }
    }
    return best;
  };

  const lowestRow = (grid) => {
    let lowest = -1;
    for (const item of grid.keys()) lowest = Math.max(lowest, split(item)[1]);
    return lowest;
  };

  const rowCount = (grid, r) => {
    let count = 0;
    for (let c = 0; c < rowCols(r); c += 1) if (occ(grid, c, r)) count += 1;
    return count;
  };

  return {
    LW,
    LH,
    Y0,
    LAUNCH_Y,
    RAD,
    PH,
    PV,
    MAXROW,
    stage,
    rowPhase: phase,
    evenCols: descriptor.evenCols,
    oddCols: descriptor.oddCols,
    rowCols,
    colX,
    rowY,
    inGrid,
    key,
    split,
    dist,
    occ,
    neighbors,
    setBalloon,
    sameColorCluster,
    occInRow,
    topConnected,
    settle,
    supported,
    findSnap,
    lowestRow,
    rowCount,
  };
}

export function canExpandSpatially(stage, config = ENDURANCE_CONFIG) {
  const next = stageDescriptor(Math.max(0, Math.floor(Number(stage) || 0)) + 1);
  return next.radius >= config.minOrbRadius;
}

export function remapGridForExpansion(grid) {
  const remapped = new Map();
  for (const [item, color] of grid) {
    const index = item.indexOf(',');
    const c = +item.slice(0, index);
    const r = +item.slice(index + 1);
    remapped.set(`${c + 1},${r}`, color);
  }
  return remapped;
}

export function shiftGridForNewRow(grid, geometry) {
  const nextRowPhase = geometry.rowPhase ? 0 : 1;
  const nextGeometry = createEnduranceGeometry({ spatialStage: geometry.stage, rowPhase: nextRowPhase });
  const shifted = new Map();
  let overflowed = false;
  for (const [item, color] of grid) {
    const [c, r] = geometry.split(item);
    const targetRow = r + 1;
    if (!nextGeometry.inGrid(c, targetRow)) {
      overflowed = true;
      continue;
    }
    shifted.set(nextGeometry.key(c, targetRow), color);
  }
  return { grid: shifted, nextRowPhase, overflowed };
}

export function failureLineReached(grid, geometry) {
  for (const item of grid.keys()) {
    const [, r] = geometry.split(item);
    if (geometry.rowY(r) + geometry.RAD >= geometry.LAUNCH_Y - 17) return true;
  }
  return false;
}
