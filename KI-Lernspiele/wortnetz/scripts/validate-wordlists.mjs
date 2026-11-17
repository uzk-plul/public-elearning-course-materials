// Prüft wortnetz/data/wordlists.json. Aufruf im Repo-Root: node wortnetz/scripts/validate-wordlists.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize } from '../js/ranking.js';

const MIN_WORDS = 80;
const MAX_LEN_WARN = 14;
const REQUIRED_POOLS = ['alltag', 'uni', 'ki', 'natur', 'gemischt'];

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'data', 'wordlists.json');
const errors = [];
const warnings = [];

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✗ ${file} lässt sich nicht lesen: ${e.message}`);
  process.exit(1);
}

if (!data || typeof data !== 'object' || !Array.isArray(data.pools)) {
  console.error('✗ Erwartet wird ein Objekt mit dem Array "pools".');
  process.exit(1);
}

const ids = new Set();
for (const [i, pool] of data.pools.entries()) {
  const where = `pools[${i}]${pool?.id ? ` (${pool.id})` : ''}`;
  if (!pool || typeof pool !== 'object') { errors.push(`${where}: kein Objekt`); continue; }
  if (typeof pool.id !== 'string' || !/^[a-z0-9-]+$/.test(pool.id)) errors.push(`${where}: "id" fehlt oder enthält ungültige Zeichen`);
  else if (ids.has(pool.id)) errors.push(`${where}: id "${pool.id}" ist doppelt`);
  else ids.add(pool.id);
  if (typeof pool.name !== 'string' || !pool.name.trim()) errors.push(`${where}: "name" fehlt`);
  if (typeof pool.beschreibung !== 'string' || !pool.beschreibung.trim()) errors.push(`${where}: "beschreibung" fehlt`);
  if (!Array.isArray(pool.words)) { errors.push(`${where}: "words" ist kein Array`); continue; }

  if (pool.words.length < MIN_WORDS) errors.push(`${where}: nur ${pool.words.length} Wörter, mindestens ${MIN_WORDS} nötig`);

  const seen = new Map();
  for (const w of pool.words) {
    if (typeof w !== 'string' || !w.trim()) { errors.push(`${where}: leerer oder ungültiger Eintrag`); continue; }
    if (w !== w.trim()) errors.push(`${where}: „${w}“ hat Leerzeichen am Rand`);
    if (/\s/.test(w.trim())) errors.push(`${where}: „${w}“ besteht aus mehreren Wörtern`);
    if (!/^\p{Lu}[\p{L}-]*$/u.test(w.trim())) errors.push(`${where}: „${w}“ ist kein großgeschriebenes Substantiv aus Buchstaben`);
    if ([...w].length > MAX_LEN_WARN) warnings.push(`${where}: „${w}“ ist sehr lang (${[...w].length} Zeichen) – passt es auf einen Block?`);
    const n = normalize(w);
    if (n.length < 3) errors.push(`${where}: „${w}“ ist zu kurz (Teilwort-Kollisionen)`);
    if (seen.has(n)) errors.push(`${where}: Dublette „${w}“ (= „${seen.get(n)}“)`);
    else seen.set(n, w);
  }

  // Teilwort-Überschneidungen innerhalb des Pools (normalisiert)
  const list = [...seen.entries()];
  for (let a = 0; a < list.length; a++) {
    for (let b = 0; b < list.length; b++) {
      if (a === b) continue;
      const [na, wa] = list[a], [nb, wb] = list[b];
      if (na.length <= nb.length && nb.includes(na)) errors.push(`${where}: „${wa}“ steckt in „${wb}“`);
    }
  }
}

for (const id of REQUIRED_POOLS) if (!ids.has(id)) errors.push(`Pflicht-Pool "${id}" fehlt`);

console.log(`Wortnetz – Wortlisten: ${data.pools.length} Pools`);
for (const p of data.pools) if (Array.isArray(p?.words)) console.log(`  ${String(p.id).padEnd(10)} ${String(p.words.length).padStart(3)} Wörter  ${p.name ?? ''}`);
if (warnings.length) { console.log(`\nHinweise (${warnings.length}):`); warnings.forEach((w) => console.log('  · ' + w)); }
if (errors.length) {
  console.log(`\n✗ ${errors.length} Fehler:`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\n✓ Alles in Ordnung.');
