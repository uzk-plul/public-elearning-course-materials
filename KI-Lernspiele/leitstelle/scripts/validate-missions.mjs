#!/usr/bin/env node
// Prüft data/tools.json und data/missions.json der Leitstelle.
// Aufruf (im Ordner leitstelle/):  node scripts/validate-missions.mjs
// Keine Abhängigkeiten. Exit-Code 1 bei Fehlern.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { evaluate, CONDITION_TYPES, MAX_CHAIN, REVIEW_TOOL } = await import(pathToFileURL(join(root, 'js', 'evaluate.js')).href);

const TYPEN = ['kein-werkzeug', 'nachschlagen', 'rechnen', 'riskant', 'reihenfolge', 'mehrstufig', 'overkill'];
const SCHWIERIGKEITEN = ['leicht', 'mittel', 'schwer'];
const THEMEN = ['raumbuchung', 'noten', 'mail', 'literatur', 'mensa', 'pruefungsanmeldung', 'reisekosten', 'veranstaltung', 'bibliothek', 'studienorganisation', 'it', 'verwaltung', 'alltag'];
const MIN_PER_TYP = 4;

const errors = [];
const warnings = [];
const err = (w, m) => errors.push(`${w}: ${m}`);
const warn = (w, m) => warnings.push(`${w}: ${m}`);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

async function loadJson(name) {
  try {
    return JSON.parse(await readFile(join(root, 'data', name), 'utf8'));
  } catch (e) {
    console.error(`✗ ${name} konnte nicht gelesen werden: ${e.message}`);
    process.exit(1);
  }
}

const tools = await loadJson('tools.json');
const missions = await loadJson('missions.json');

// ---------- Werkzeuge ----------
const toolIds = [];
if (!Array.isArray(tools)) err('tools.json', 'muss ein Array sein');
else {
  tools.forEach((t, i) => {
    const w = `tools[${i}]${t?.id ? ` (${t.id})` : ''}`;
    if (!isStr(t?.id)) return err(w, 'id fehlt');
    if (toolIds.includes(t.id)) err(w, 'doppelte Werkzeug-ID');
    toolIds.push(t.id);
    for (const f of ['name', 'beschreibung', 'leerlauf']) if (!isStr(t[f])) err(w, `${f} fehlt`);
    if (!isStr(t.icon) || !t.icon.trim().startsWith('<svg')) err(w, 'icon muss ein inline-SVG sein');
    if (!['niedrig', 'hoch'].includes(t.risiko)) err(w, 'risiko muss „niedrig“ oder „hoch“ sein');
  });
  if (!toolIds.includes(REVIEW_TOOL)) err('tools.json', `Werkzeug „${REVIEW_TOOL}“ fehlt (wird für Freigaben gebraucht)`);
}
const highRisk = (tools || []).filter((t) => t.risiko === 'hoch').map((t) => t.id);
const isTool = (id) => toolIds.includes(id);

// Alle Ketten der Länge 0..MAX_CHAIN (Brute Force)
function* allChains(maxLen) {
  const cur = [];
  function* rec(len) {
    yield cur.slice();
    if (len === maxLen) return;
    for (const t of toolIds) {
      cur.push(t);
      yield* rec(len + 1);
      cur.pop();
    }
  }
  yield* rec(0);
}

function checkCondition(c, w) {
  if (!c || typeof c !== 'object') return err(w, 'bedingung fehlt');
  if (!CONDITION_TYPES.includes(c.typ)) return err(w, `unbekannter Bedingungstyp „${c.typ}“`);
  if (['fehlt', 'enthaelt'].includes(c.typ) && !isTool(c.werkzeug)) err(w, `ungültiges werkzeug „${c.werkzeug}“`);
  if (c.typ === 'reihenfolge' && (!isTool(c.a) || !isTool(c.b))) err(w, 'reihenfolge braucht gültige a und b');
  if (['und', 'oder'].includes(c.typ)) {
    if (!Array.isArray(c.bedingungen) || !c.bedingungen.length) err(w, `${c.typ} braucht bedingungen[]`);
    else c.bedingungen.forEach((b, i) => checkCondition(b, `${w}.bedingungen[${i}]`));
  }
}

// ---------- Missionen ----------
const ids = new Set();
const typCount = Object.fromEntries(TYPEN.map((t) => [t, 0]));
const diffCount = Object.fromEntries(SCHWIERIGKEITEN.map((d) => [d, 0]));
let stageTotal = 0;
let chainsTested = 0;
const t0 = Date.now();

if (!Array.isArray(missions)) err('missions.json', 'muss ein Array sein');
else missions.forEach((m, mi) => {
  const w = `missions[${mi}]${m?.id ? ` (${m.id})` : ''}`;
  if (!isStr(m?.id)) err(w, 'id fehlt');
  else if (ids.has(m.id)) err(w, 'doppelte Missions-ID');
  else ids.add(m.id);
  for (const f of ['titel', 'ziel']) if (!isStr(m?.[f])) err(w, `${f} fehlt`);
  if (!TYPEN.includes(m.typ)) err(w, `typ muss einer von ${TYPEN.join(', ')} sein`); else typCount[m.typ]++;
  if (!SCHWIERIGKEITEN.includes(m.schwierigkeit)) err(w, 'ungültige schwierigkeit'); else diffCount[m.schwierigkeit]++;
  if (!THEMEN.includes(m.thema)) err(w, `thema muss eines von ${THEMEN.join(', ')} sein`);

  const stufen = Array.isArray(m.stufen) ? m.stufen : [];
  if (!stufen.length) return err(w, 'stufen fehlt oder leer');
  if (m.typ === 'mehrstufig' && (stufen.length < 2 || stufen.length > 3)) err(w, 'mehrstufige Missionen brauchen 2–3 Stufen');
  if (m.typ !== 'mehrstufig' && stufen.length !== 1) err(w, 'nur mehrstufige Missionen haben mehr als eine Stufe');

  stufen.forEach((s, si) => {
    stageTotal++;
    const errorsBefore = errors.length;
    const sw = `${w} stufe ${si + 1}`;
    for (const f of ['auftrag', 'ergebnis', 'debrief']) if (!isStr(s?.[f])) err(sw, `${f} fehlt`);
    if (!Array.isArray(s.material)) err(sw, 'material muss ein Array sein');
    else s.material.forEach((x, xi) => { if (!isStr(x?.titel) || !isStr(x?.text)) err(sw, `material[${xi}] braucht titel und text`); });

    // Regeln
    const r = s.regeln;
    if (!r || typeof r !== 'object') return err(sw, 'regeln fehlen');
    const required = r.required ?? []; const forbidden = r.forbidden ?? []; const order = r.order ?? [];
    if (!Array.isArray(required)) err(sw, 'required muss ein Array sein');
    if (!Array.isArray(forbidden)) err(sw, 'forbidden muss ein Array sein');
    if (!Array.isArray(order)) err(sw, 'order muss ein Array sein');
    [...required, ...forbidden].forEach((t) => { if (!isTool(t)) err(sw, `ungültige Werkzeug-ID „${t}“`); });
    if (typeof r.reviewBeforeHighRisk !== 'boolean') err(sw, 'reviewBeforeHighRisk muss true/false sein');
    if (!Number.isInteger(r.optimalLength) || r.optimalLength < 0 || r.optimalLength > MAX_CHAIN) err(sw, `optimalLength muss 0–${MAX_CHAIN} sein`);

    // Widersprüche
    const both = required.filter((t) => forbidden.includes(t));
    if (both.length) err(sw, `Werkzeug zugleich required und forbidden: ${both.join(', ')}`);
    order.forEach((p, pi) => {
      if (!Array.isArray(p) || p.length !== 2 || !isTool(p[0]) || !isTool(p[1])) return err(sw, `order[${pi}] muss ein Paar gültiger IDs sein`);
      if (p[0] === p[1]) err(sw, `order[${pi}]: A und B sind gleich`);
      if (!required.includes(p[0]) || !required.includes(p[1])) err(sw, `order[${pi}]: beide Werkzeuge müssen in required stehen`);
      if (order.some((q) => q[0] === p[1] && q[1] === p[0])) err(sw, `order[${pi}]: Zyklus ${p[0]} ↔ ${p[1]}`);
    });
    if (r.reviewBeforeHighRisk && required.some((t) => highRisk.includes(t))) {
      if (!required.includes(REVIEW_TOOL)) err(sw, `riskantes Werkzeug verlangt, aber „${REVIEW_TOOL}“ fehlt in required`);
      if (forbidden.includes(REVIEW_TOOL)) err(sw, `„${REVIEW_TOOL}“ ist verboten, obwohl eine Freigabe nötig ist`);
    }
    if (Number.isInteger(r.optimalLength) && r.optimalLength < required.length) err(sw, 'optimalLength ist kleiner als die Zahl der Pflichtwerkzeuge');

    // Beobachtungen
    const obs = s.observations;
    if (!obs || typeof obs !== 'object') err(sw, 'observations fehlen');
    else {
      Object.keys(obs).forEach((k) => { if (k !== 'standard' && !isTool(k)) err(sw, `observations: unbekannter Schlüssel „${k}“`); });
      new Set(required).forEach((t) => { if (!isStr(obs[t])) err(sw, `observations.${t} fehlt (Pflichtwerkzeug)`); });
      if (!isStr(obs.standard)) err(sw, 'observations.standard (Text für nutzlose Schritte) fehlt');
    }

    // Typische Fehler
    const tf = Array.isArray(s.typischeFehler) ? s.typischeFehler : [];
    if (!Array.isArray(s.typischeFehler) || !tf.length) err(sw, 'typischeFehler fehlt oder ist leer');
    tf.forEach((f, fi) => {
      if (!isStr(f?.text)) err(sw, `typischeFehler[${fi}].text fehlt`);
      checkCondition(f?.bedingung, `${sw} typischeFehler[${fi}]`);
    });

    // Beispielkette
    if (!Array.isArray(s.beispiel) || s.beispiel.some((t) => !isTool(t))) err(sw, 'beispiel muss eine Kette gültiger Werkzeug-IDs sein');

    if (errors.length > errorsBefore) return; // Brute Force nur bei sauberem Schema dieser Stufe

    // ---------- Brute Force ----------
    let perfectCount = 0;
    let minPerfect = Infinity;
    const triggered = new Array(tf.length).fill(false);
    const firesOnPerfect = new Array(tf.length).fill(false);
    for (const chain of allChains(MAX_CHAIN)) {
      chainsTested++;
      const res = evaluate(m, chain, { stage: si, highRisk });
      res.fehler.forEach((i) => { triggered[i] = true; if (res.perfekt) firesOnPerfect[i] = true; });
      if (res.perfekt) {
        perfectCount++;
        if (chain.length < minPerfect) minPerfect = chain.length;
      }
    }
    if (!perfectCount) err(sw, 'keine Kette bis Länge 6 erreicht volle Punktzahl (3/3/3)');
    else if (minPerfect !== r.optimalLength) err(sw, `optimalLength ist ${r.optimalLength}, kürzeste perfekte Kette hat aber Länge ${minPerfect}`);
    tf.forEach((f, fi) => {
      if (!triggered[fi]) err(sw, `typischeFehler[${fi}] kann nie eintreten`);
      if (firesOnPerfect[fi]) err(sw, `typischeFehler[${fi}] trifft auch auf eine perfekte Lösung zu`);
    });
    if (Array.isArray(s.beispiel)) {
      const ex = evaluate(m, s.beispiel, { stage: si, highRisk });
      if (!ex.perfekt) err(sw, `beispiel [${s.beispiel.join(' → ')}] erreicht nicht 3/3/3 (${Object.values(ex.sterne).join('/')})`);
    }
    if (perfectCount > 6) warn(sw, `${perfectCount} perfekte Ketten – Reihenfolge ist evtl. kaum relevant`);
  });
});

for (const [t, n] of Object.entries(typCount)) if (n < MIN_PER_TYP) err('Abdeckung', `Missionstyp „${t}“ kommt nur ${n}× vor (mind. ${MIN_PER_TYP})`);

// ---------- Ausgabe ----------
console.log(`Leitstelle – Validierung: ${missions.length} Missionen, ${stageTotal} Stufen, ${toolIds.length} Werkzeuge`);
console.log(`  Typen:         ${Object.entries(typCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  Schwierigkeit: ${Object.entries(diffCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  Brute Force:   ${chainsTested.toLocaleString('de-DE')} Ketten geprüft in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (warnings.length) { console.log(`\n⚠ ${warnings.length} Hinweis(e):`); warnings.forEach((x) => console.log(`  - ${x}`)); }
if (errors.length) { console.error(`\n✗ ${errors.length} Fehler:`); errors.forEach((x) => console.error(`  - ${x}`)); process.exit(1); }
console.log('\n✓ Alles in Ordnung.');
