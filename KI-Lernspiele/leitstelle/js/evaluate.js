// Leitstelle – Regel-Engine
// Reine Funktionen ohne DOM-Zugriff: im Browser und in Node (Validator) nutzbar.
//
// evaluate(mission, chain, { stage, highRisk })
//   mission : Missionsobjekt mit `stufen` (oder direkt ein Stufenobjekt mit `regeln`)
//   chain   : Array von Werkzeug-IDs in Ausführungsreihenfolge, z. B. ['entwurf', 'pruefung', 'senden']
//   stage   : Index der Stufe (Standard 0)
//   highRisk: IDs der Werkzeuge mit hohem Risiko (Standard: ['senden'])
//
// Rückgabe:
//   { sterne: { erfolg, effizienz, sicherheit }, perfekt, probleme[], schritte[], fehler[] }

export const HIGH_RISK_DEFAULT = ['senden'];
/** Werkzeuge, die einen geprüften Inhalt verändern – danach gilt eine Freigabe nicht mehr. */
export const CHANGES_CONTENT = ['entwurf'];
export const REVIEW_TOOL = 'pruefung';
export const MAX_CHAIN = 6;

const clamp = (n) => Math.max(0, Math.min(3, n));

export function getStage(mission, stage = 0) {
  if (mission && Array.isArray(mission.stufen)) return mission.stufen[stage];
  return mission;
}

function counts(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

/** true, wenn ein B ohne vorheriges A vorkommt („A muss vor B kommen“ verletzt). */
export function orderViolated(chain, a, b) {
  let seenA = false;
  for (const t of chain) {
    if (t === a) seenA = true;
    else if (t === b && !seenA) return true;
  }
  return false;
}

/** Prüft jede Aktion mit hohem Risiko auf eine gültige vorherige Freigabe. */
export function safetyViolations(chain, highRisk = HIGH_RISK_DEFAULT, reviewNeeded = true) {
  const out = [];
  if (!reviewNeeded) return out;
  chain.forEach((tool, i) => {
    if (!highRisk.includes(tool)) return;
    const lastReview = chain.lastIndexOf(REVIEW_TOOL, i);
    if (lastReview < 0) {
      out.push({ index: i, werkzeug: tool, code: 'ohneFreigabe' });
    } else if (chain.slice(lastReview + 1, i).some((t) => CHANGES_CONTENT.includes(t))) {
      out.push({ index: i, werkzeug: tool, code: 'geaendertNachFreigabe' });
    }
  });
  return out;
}

/** Wertet eine Bedingung aus `typischeFehler` aus. */
export function conditionMatches(cond, chain, ctx) {
  switch (cond.typ) {
    case 'fehlt': return !chain.includes(cond.werkzeug);
    case 'enthaelt': return chain.includes(cond.werkzeug);
    case 'reihenfolge':
      return chain.includes(cond.a) && chain.includes(cond.b) && orderViolated(chain, cond.a, cond.b);
    case 'ohneFreigabe': return ctx.safety.some((v) => v.code === 'ohneFreigabe');
    case 'geaendertNachFreigabe': return ctx.safety.some((v) => v.code === 'geaendertNachFreigabe');
    case 'leer': return chain.length === 0;
    case 'zuLang': return chain.length > ctx.optimalLength;
    case 'und': return (cond.bedingungen || []).every((c) => conditionMatches(c, chain, ctx));
    case 'oder': return (cond.bedingungen || []).some((c) => conditionMatches(c, chain, ctx));
    default: return false;
  }
}

export const CONDITION_TYPES = ['fehlt', 'enthaelt', 'reihenfolge', 'ohneFreigabe', 'geaendertNachFreigabe', 'leer', 'zuLang', 'und', 'oder'];

export function evaluate(mission, chain, { stage = 0, highRisk = HIGH_RISK_DEFAULT } = {}) {
  const st = getStage(mission, stage);
  const r = st.regeln || {};
  const required = r.required || [];
  const forbidden = r.forbidden || [];
  const order = r.order || [];
  const reviewNeeded = r.reviewBeforeHighRisk !== false;
  const optimalLength = Number.isInteger(r.optimalLength) ? r.optimalLength : required.length;

  const probleme = [];
  const need = counts(required);

  // ---------- Erfolg ----------
  let penalty = 0;
  // Ist die Prüfung nur wegen der Freigabepflicht nötig, zählt ihr Fehlen bei der Sicherheit – nicht beim Erfolg.
  const reviewIsSafetyOnly = reviewNeeded && required.some((t) => highRisk.includes(t));
  for (const [tool] of need) {
    if (chain.includes(tool)) continue;
    if (tool === REVIEW_TOOL && reviewIsSafetyOnly) continue;
    probleme.push({ code: 'fehlt', dim: 'erfolg', werkzeug: tool });
    penalty += 2;
  }
  for (const tool of new Set(forbidden)) {
    if (chain.includes(tool)) { probleme.push({ code: 'verboten', dim: 'erfolg', werkzeug: tool }); penalty += 2; }
  }
  for (const [a, b] of order) {
    if (chain.includes(b) && orderViolated(chain, a, b)) {
      // Fehlt A ganz, ist das schon als „fehlt“ erfasst – nur echte Vertauschungen zählen hier.
      if (chain.includes(a)) { probleme.push({ code: 'reihenfolge', dim: 'erfolg', a, b }); penalty += 1; }
    }
  }
  const erfolg = clamp(3 - penalty);

  // ---------- Schritte & Effizienz ----------
  const used = new Map();
  const schritte = chain.map((tool, index) => {
    const n = (used.get(tool) || 0) + 1;
    used.set(tool, n);
    let status = 'noetig';
    if (!need.has(tool)) status = 'unnoetig';
    else if (n > need.get(tool)) status = 'doppelt';
    return { werkzeug: tool, index, status };
  });
  const wasted = schritte.filter((s) => s.status !== 'noetig');
  const wastedByTool = counts(wasted.map((s) => `${s.status}:${s.werkzeug}`));
  for (const [key, anzahl] of wastedByTool) {
    const [code, werkzeug] = key.split(':');
    probleme.push({ code, dim: 'effizienz', werkzeug, anzahl });
  }
  const extra = Math.max(wasted.length, chain.length - optimalLength);
  const effizienz = clamp(3 - extra);

  // ---------- Sicherheit ----------
  const safety = safetyViolations(chain, highRisk, reviewNeeded);
  let sicherheit = safety.length ? 0 : 3;
  for (const v of safety) {
    probleme.push({ code: v.code, dim: 'sicherheit', werkzeug: v.werkzeug, index: v.index });
    schritte[v.index].warnung = v.code;
  }
  schritte.forEach((s) => {
    if (highRisk.includes(s.werkzeug) && !need.has(s.werkzeug)) {
      probleme.push({ code: 'ungefragteAktion', dim: 'sicherheit', werkzeug: s.werkzeug, index: s.index });
      if (!s.warnung) s.warnung = 'ungefragteAktion';
      sicherheit = Math.min(sicherheit, 1);
    }
  });

  // ---------- Typische Fehler ----------
  const ctx = { safety, optimalLength };
  const fehler = [];
  (st.typischeFehler || []).forEach((f, i) => {
    if (f && f.bedingung && conditionMatches(f.bedingung, chain, ctx)) fehler.push(i);
  });

  const sterne = { erfolg, effizienz, sicherheit };
  return {
    sterne,
    perfekt: erfolg === 3 && effizienz === 3 && sicherheit === 3,
    probleme,
    schritte,
    fehler
  };
}

/** Fasst die Sterne mehrerer Stufen zu einer Missionswertung zusammen (gerundeter Mittelwert). */
export function combineStars(list) {
  if (!list.length) return { erfolg: 0, effizienz: 0, sicherheit: 0 };
  const avg = (k) => Math.round(list.reduce((s, x) => s + x[k], 0) / list.length);
  return { erfolg: avg('erfolg'), effizienz: avg('effizienz'), sicherheit: avg('sicherheit') };
}
