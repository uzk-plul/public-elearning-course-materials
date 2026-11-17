#!/usr/bin/env node
// Prüft data/levels.json und data/patterns.json der Quellenprobe.
// Aufruf (aus dem Repo-Root):  node quellenprobe/scripts/validate-levels.mjs
// Keine Abhängigkeiten. Exit-Code 1 bei Fehlern.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');

const SCHWIERIGKEITEN = ['leicht', 'mittel', 'schwer'];
const THEMEN = ['pruefungsordnung', 'forschung', 'mensa', 'bibliothek', 'it-dienste', 'studienorganisation'];
const LANGS = ['de', 'en'];
const MIN_WORDS = 80;
const MAX_WORDS = 200;
const MIN_PER_PATTERN = 2;

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

async function loadJson(name) {
  const path = join(dataDir, name);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    console.error(`✗ ${name} konnte nicht gelesen werden: ${e.message}`);
    process.exit(1);
  }
}

const patterns = await loadJson('patterns.json');
const levels = await loadJson('levels.json');

// ---------- Muster ----------
const patternIds = new Set();
if (!Array.isArray(patterns)) {
  err('patterns.json', 'muss ein Array sein');
} else {
  patterns.forEach((p, i) => {
    const where = `patterns[${i}]${p && p.id ? ` (${p.id})` : ''}`;
    if (!isStr(p?.id)) return err(where, 'id fehlt');
    if (patternIds.has(p.id)) err(where, `doppelte Muster-ID „${p.id}“`);
    patternIds.add(p.id);
    for (const field of ['name', 'kurzbeschreibung', 'prueftipp']) {
      for (const lang of LANGS) {
        if (!isStr(p[field]?.[lang])) err(where, `${field}.${lang} fehlt oder ist leer`);
      }
    }
  });
  if (patterns.length !== 10) warn('patterns.json', `erwartet 10 Muster, gefunden ${patterns.length}`);
}

// ---------- Level ----------
const levelIds = new Set();
const patternCount = Object.fromEntries([...patternIds].map((id) => [id, 0]));
const diffCount = Object.fromEntries(SCHWIERIGKEITEN.map((d) => [d, 0]));
const themaCount = Object.fromEntries(THEMEN.map((t) => [t, 0]));

if (!Array.isArray(levels)) {
  err('levels.json', 'muss ein Array sein');
} else {
  levels.forEach((lvl, i) => {
    const where = `levels[${i}]${lvl && lvl.id ? ` (${lvl.id})` : ''}`;

    if (!isStr(lvl?.id)) err(where, 'id fehlt');
    else if (levelIds.has(lvl.id)) err(where, `doppelte Level-ID „${lvl.id}“`);
    else levelIds.add(lvl.id);

    if (!SCHWIERIGKEITEN.includes(lvl.schwierigkeit)) {
      err(where, `schwierigkeit muss eine von ${SCHWIERIGKEITEN.join('/')} sein (ist: ${JSON.stringify(lvl.schwierigkeit)})`);
    } else diffCount[lvl.schwierigkeit]++;

    if (!THEMEN.includes(lvl.thema)) {
      err(where, `thema muss eines von ${THEMEN.join(', ')} sein (ist: ${JSON.stringify(lvl.thema)})`);
    } else themaCount[lvl.thema]++;

    if (!isStr(lvl.frage)) err(where, 'frage fehlt');

    // Quellen
    const quellen = Array.isArray(lvl.quellen) ? lvl.quellen : [];
    if (!Array.isArray(lvl.quellen)) err(where, 'quellen muss ein Array sein');
    if (quellen.length < 1 || quellen.length > 3) err(where, `1–3 Quellen erwartet, gefunden ${quellen.length}`);
    quellen.forEach((q, qi) => {
      const qw = `${where} quelle[${qi}]`;
      for (const f of ['titel', 'typ', 'text']) if (!isStr(q?.[f])) err(qw, `${f} fehlt`);
      if (isStr(q?.text)) {
        const n = words(q.text);
        if (n < MIN_WORDS || n > MAX_WORDS) err(qw, `Text hat ${n} Wörter (erlaubt ${MIN_WORDS}–${MAX_WORDS})`);
      }
    });

    // Aussagen
    const aussagen = Array.isArray(lvl.aussagen) ? lvl.aussagen : [];
    if (!Array.isArray(lvl.aussagen)) err(where, 'aussagen muss ein Array sein');
    if (aussagen.length < 4 || aussagen.length > 6) err(where, `4–6 Aussagen erwartet, gefunden ${aussagen.length}`);

    const aIds = new Set();
    let halluCount = 0;
    aussagen.forEach((a, ai) => {
      const aw = `${where} aussage[${ai}]${a && a.id ? ` (${a.id})` : ''}`;
      if (!isStr(a?.id)) err(aw, 'id fehlt');
      else if (aIds.has(a.id)) err(aw, `doppelte Aussagen-ID „${a.id}“`);
      else aIds.add(a.id);

      if (!isStr(a?.text)) err(aw, 'text fehlt');
      if (typeof a?.halluzination !== 'boolean') err(aw, 'halluzination muss true oder false sein');
      if (!isStr(a?.erklaerung)) err(aw, 'erklaerung fehlt');

      if (a?.halluzination === true) {
        halluCount++;
        if (!isStr(a.muster)) err(aw, 'Halluzination ohne muster');
        else if (!patternIds.has(a.muster)) err(aw, `unbekannte Muster-ID „${a.muster}“`);
        else patternCount[a.muster]++;
      } else if (a?.halluzination === false && a.muster !== undefined) {
        err(aw, 'korrekte Aussage darf kein muster haben');
      }

      if (!isStr(a?.beleg)) {
        err(aw, 'beleg fehlt');
      } else {
        const hits = quellen.filter((q) => typeof q?.text === 'string' && q.text.includes(a.beleg)).length;
        if (hits === 0) err(aw, `beleg kommt nicht wörtlich im Quelltext vor: „${a.beleg}“`);
        if (a.beleg.trim().length < 8) warn(aw, 'beleg ist sehr kurz – Hervorhebung evtl. wenig aussagekräftig');
      }
      if (isStr(a?.text) && isStr(a?.beleg) && a.text.trim() === a.beleg.trim()) {
        warn(aw, 'text und beleg sind identisch');
      }
    });

    if (halluCount < 1 || halluCount > 2) err(where, `1–2 Halluzinationen erwartet, gefunden ${halluCount}`);
  });
}

for (const [id, n] of Object.entries(patternCount)) {
  if (n < MIN_PER_PATTERN) err('Abdeckung', `Muster „${id}“ kommt nur ${n}× vor (mind. ${MIN_PER_PATTERN})`);
}

// ---------- Ausgabe ----------
const total = Array.isArray(levels) ? levels.length : 0;
console.log(`Quellenprobe – Validierung: ${total} Level, ${patternIds.size} Muster`);
console.log(`  Schwierigkeit: ${SCHWIERIGKEITEN.map((d) => `${d} ${diffCount[d]}`).join(', ')}`);
console.log(`  Themen:        ${THEMEN.map((t) => `${t} ${themaCount[t]}`).join(', ')}`);
console.log(`  Muster:        ${Object.entries(patternCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} Hinweis(e):`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} Fehler:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('\n✓ Alles in Ordnung.');
