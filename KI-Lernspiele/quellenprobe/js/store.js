// Gekapselter Zugriff auf localStorage. Jeder Zugriff steht in try/catch,
// damit das Spiel auch ohne Speicher (Privatmodus, blockierte Cookies) läuft.

const KEY_STATS = 'quellenprobe.stats.v1';
const KEY_LANG = 'quellenprobe.lang';

function emptyStats() {
  return { highscore: 0, bestStreak: 0, levelsPlayed: 0, falseAlarms: 0, patterns: {} };
}

let memoryStats = emptyStats();
let available = null;

export function storageAvailable() {
  if (available !== null) return available;
  try {
    const k = '__qp_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function loadStats() {
  try {
    const raw = window.localStorage.getItem(KEY_STATS);
    if (!raw) return { ...emptyStats(), ...memoryStats };
    const parsed = JSON.parse(raw);
    const base = emptyStats();
    return {
      highscore: Number(parsed.highscore) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
      levelsPlayed: Number(parsed.levelsPlayed) || 0,
      falseAlarms: Number(parsed.falseAlarms) || 0,
      patterns: typeof parsed.patterns === 'object' && parsed.patterns ? parsed.patterns : base.patterns
    };
  } catch {
    return memoryStats;
  }
}

export function saveStats(stats) {
  memoryStats = stats;
  try {
    window.localStorage.setItem(KEY_STATS, JSON.stringify(stats));
  } catch {
    /* Speicher nicht verfügbar – Stand bleibt nur im Arbeitsspeicher */
  }
}

export function resetStats() {
  memoryStats = emptyStats();
  try {
    window.localStorage.removeItem(KEY_STATS);
  } catch {
    /* ignorieren */
  }
  return emptyStats();
}

export function loadLang() {
  try {
    const v = window.localStorage.getItem(KEY_LANG);
    return v === 'en' || v === 'de' ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang) {
  try {
    window.localStorage.setItem(KEY_LANG, lang);
  } catch {
    /* ignorieren */
  }
}
