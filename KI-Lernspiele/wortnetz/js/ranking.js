// Reine Spiellogik rund um Ähnlichkeiten – ohne DOM und ohne Modell, daher in Node testbar.

export const MIN_HINT_LETTERS = 2;

/** Vergleichsform eines Wortes: klein, Umlaute ausgeschrieben, ß → ss, Akzente entfernt. */
export function normalize(word) {
  return String(word).trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Prüft ein Hinweiswort gegen die Regeln.
 * @param {string} raw Eingabe
 * @param {string[]} words alle Wörter, die gerade im Spiel sind
 * @returns {{ok:true, hint:string} | {ok:false, code:string, message:string, word?:string}}
 */
export function checkHint(raw, words) {
  const hint = String(raw ?? '').trim();
  if (!hint) return { ok: false, code: 'leer', message: 'Gib zuerst ein Hinweiswort ein.' };
  if (/\s/.test(hint)) return { ok: false, code: 'mehrere', message: 'Bitte nur ein einzelnes Wort – ohne Leerzeichen.' };
  if (!/^\p{L}[\p{L}-]*$/u.test(hint)) return { ok: false, code: 'zeichen', message: 'Bitte nur Buchstaben verwenden (ein Bindestrich ist erlaubt).' };
  if ([...hint.replace(/-/g, '')].length < MIN_HINT_LETTERS) return { ok: false, code: 'kurz', message: 'Das Wort braucht mindestens zwei Buchstaben.' };
  const n = normalize(hint);
  for (const w of words) {
    const nw = normalize(w);
    if (n === nw) return { ok: false, code: 'gleich', word: w, message: `„${hint}“ ist selbst im Spiel. Beschreibe es mit einem anderen Wort.` };
    if (nw.includes(n) || n.includes(nw)) {
      return { ok: false, code: 'teilwort', word: w, message: `„${hint}“ und „${w}“ stecken ineinander. Such ein Wort, das anders gebaut ist.` };
    }
  }
  return { ok: true, hint };
}

/** Kosinus-Ähnlichkeit zweier Vektoren (funktioniert auch mit nicht normierten Vektoren). */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Rangfolge aller Einträge nach Ähnlichkeit zum Hinweisvektor, ähnlichstes zuerst.
 * @param {ArrayLike<number>} hintVec
 * @param {{word:string, vec:ArrayLike<number>}[]} items
 * @returns {{word:string, sim:number, rank:number}[]}
 */
export function rankByHint(hintVec, items) {
  return items
    .map((it) => ({ word: it.word, sim: cosine(hintVec, it.vec) }))
    .sort((a, b) => b.sim - a.sim || a.word.localeCompare(b.word, 'de'))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Balkenlänge für die Anzeige: Die Rohwerte liegen bei manchen Modellen eng beieinander,
 * deshalb wird auf die Spanne der aktuellen Runde skaliert (min → 0.06, max → 1).
 */
export function barScale(ranked) {
  if (!ranked.length) return new Map();
  const sims = ranked.map((r) => r.sim);
  const max = Math.max(...sims), min = Math.min(...sims);
  const span = max - min;
  return new Map(ranked.map((r) => [r.word, span < 1e-9 ? 1 : 0.06 + 0.94 * (r.sim - min) / span]));
}

/* ----- Arcade ----- */

export const ARCADE = {
  startWords: 8,
  maxWords: 14,
  zoneStart: 4,
  zoneLater: 3,
  zoneShrinkAfter: 12,       // nach so vielen Treffern wird die Trefferzone kleiner
  placementBonus: [0, 40, 25, 15, 5, 0],
  pointsPerWord: 10,
  intervalStart: 6500,
  intervalMin: 2200,
  intervalFactor: 0.97
};

export function zoneSize(hits) {
  return hits >= ARCADE.zoneShrinkAfter ? ARCADE.zoneLater : ARCADE.zoneStart;
}

export function arcadeInterval(added) {
  return Math.max(ARCADE.intervalMin, Math.round(ARCADE.intervalStart * ARCADE.intervalFactor ** added));
}

/**
 * Wertet einen Arcade-Zug aus.
 * Die Liste wird so sortiert, dass das ähnlichste Wort ganz unten steht.
 * @param {{word:string, sim:number, rank:number}[]} ranked Ergebnis von rankByHint über die Liste
 * @param {string} target Zielwort
 * @param {number} zone Größe der Trefferzone (unterste N Plätze)
 * @returns {{order:string[], fromBottom:number, hit:boolean, removed:string[], remaining:string[], points:number, rank:number}}
 */
export function resolveArcade(ranked, target, zone) {
  const order = [...ranked].reverse().map((r) => r.word); // oben → unten, ähnlichstes unten
  const idx = order.indexOf(target);
  if (idx < 0) throw new Error(`Zielwort ${target} nicht in der Liste`);
  const fromBottom = order.length - idx;
  const hit = fromBottom <= zone;
  const removed = hit ? order.slice(idx) : [];
  const remaining = hit ? order.slice(0, idx) : order;
  const points = hit ? removed.length * ARCADE.pointsPerWord + (ARCADE.placementBonus[fromBottom] || 0) : 0;
  const rank = ranked.find((r) => r.word === target).rank;
  return { order, fromBottom, hit, removed, remaining, points, rank };
}

/* ----- Überraschende Züge ----- */

/**
 * Überraschung = wie weit das gemeinte Wort hinter Platz 1 lag.
 * moves: [{hint, intended, rank, top, simGap}]
 */
export function topSurprises(moves, k = 3) {
  return moves
    .filter((m) => m.intended && m.rank > 1)
    .map((m) => ({ ...m, surprise: m.rank - 1 }))
    .sort((a, b) => b.surprise - a.surprise || b.simGap - a.simGap)
    .slice(0, k);
}

/** Punkte für einen Blöcke-Zug: 10, 30, 60, 100 … (Dreieckszahlen × 10). */
export function blockPoints(n) {
  return 10 * n * (n + 1) / 2;
}
