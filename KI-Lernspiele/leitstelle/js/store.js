// Gekapselter Zugriff auf localStorage (jeder Zugriff in try/catch).

const KEY = 'leitstelle.stats.v1';

export function emptyStats() {
  return {
    missionsPlayed: 0,
    perfectMissions: 0,
    totals: { erfolg: 0, effizienz: 0, sicherheit: 0 },
    best: {} // missionId -> { erfolg, effizienz, sicherheit }
  };
}

let memory = emptyStats();
let available = null;

export function storageAvailable() {
  if (available !== null) return available;
  try {
    window.localStorage.setItem('__ls_test__', '1');
    window.localStorage.removeItem('__ls_test__');
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function loadStats() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return memory;
    const p = JSON.parse(raw);
    const base = emptyStats();
    return {
      missionsPlayed: Number(p.missionsPlayed) || 0,
      perfectMissions: Number(p.perfectMissions) || 0,
      totals: { ...base.totals, ...(p.totals || {}) },
      best: p.best && typeof p.best === 'object' ? p.best : {}
    };
  } catch {
    return memory;
  }
}

export function saveStats(stats) {
  memory = stats;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* kein Speicher verfügbar */
  }
}

export function resetStats() {
  memory = emptyStats();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
  return emptyStats();
}
