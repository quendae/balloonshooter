const STORAGE_KEY = 'balloon-sky-rescue-v1';

export function normalizeProgress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const levels = {};
  for (const [id, entry] of Object.entries(source.levels || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const stars = Math.max(0, Math.min(3, Number(entry.stars) || 0));
    const score = Math.max(0, Number(entry.score) || 0);
    levels[id] = {
      stars,
      score,
      completed: Boolean(entry.completed || stars > 0),
    };
  }
  return {
    version: 1,
    levels,
    settings: {
      sound: source.settings?.sound !== false,
    },
  };
}

export function loadProgress(storage = globalThis.localStorage) {
  if (!storage) return normalizeProgress(null);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return normalizeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProgress(null);
  }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  const normalized = normalizeProgress(progress);
  if (!storage) return normalized;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be blocked or full. Gameplay should continue in memory.
  }
  return normalized;
}

export function clearProgress(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  return normalizeProgress(null);
}

export { STORAGE_KEY };
