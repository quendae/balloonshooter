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
