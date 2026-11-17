// localStorage gekapselt – jeder Zugriff in try/catch, damit das Spiel auch ohne Speicher läuft.
const KEY_SCORES = 'wortnetz.highscores.v1';
const KEY_PREFS = 'wortnetz.prefs.v1';
const memory = { scores: {}, prefs: {} };

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadScores() {
  const s = read(KEY_SCORES, null);
  return s && typeof s === 'object' ? s : { ...memory.scores };
}

export function getHighscore(mode, pool) {
  return Number(loadScores()[`${mode}:${pool}`]) || 0;
}

/** Speichert den Punktestand, falls er ein neuer Rekord ist. Gibt true bei neuem Rekord zurück. */
export function submitScore(mode, pool, score) {
  const scores = loadScores();
  const key = `${mode}:${pool}`;
  if (score <= (Number(scores[key]) || 0)) return false;
  scores[key] = score;
  memory.scores = scores;
  write(KEY_SCORES, scores);
  return true;
}

export function resetScores() {
  memory.scores = {};
  try { window.localStorage.removeItem(KEY_SCORES); } catch { /* ignorieren */ }
}

export function loadPrefs() {
  const p = read(KEY_PREFS, null);
  return p && typeof p === 'object' ? p : { ...memory.prefs };
}

export function savePrefs(patch) {
  const p = { ...loadPrefs(), ...patch };
  memory.prefs = p;
  write(KEY_PREFS, p);
}
