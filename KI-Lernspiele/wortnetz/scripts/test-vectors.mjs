// Prüft die Wortvektor-Dateien mit demselben Code, den das Spiel nutzt. Aufruf im Ordner wortnetz/: node scripts/test-vectors.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WordVectors } from '../js/wordvectors.js';
import { rankByHint } from '../js/ranking.js';

// fetch() für lokale Dateien nachbilden
globalThis.fetch = async (url) => {
  const buf = await readFile(fileURLToPath(url));
  return new Response(buf, { headers: { 'content-length': String(buf.length) } });
};

const wv = new WordVectors();
const t0 = performance.now();
await wv.load();
await wv.restPromise;
console.log(`Geladen: ${wv.words.length} Wörter in ${Math.round(performance.now() - t0)} ms`);

const pools = JSON.parse(await readFile(new URL('../data/wordlists.json', import.meta.url), 'utf8')).pools;
let fail = 0;
for (const p of pools) {
  const unknown = p.words.filter((w) => !wv.known(w));
  const outside = p.words.filter((w) => wv.indexOf(w) >= wv.meta.core);
  if (unknown.length || outside.length) { fail++; console.log(`✗ ${p.id}: unbekannt ${unknown}, nicht im Kern ${outside}`); }
}
console.log(fail ? '' : '✓ Alle Pool-Wörter liegen im Kern');

const board = ['Samen', 'Regen', 'Wüste', 'Kamera', 'Tennis', 'Diamant', 'Kaffee', 'Polizei', 'Wiese', 'Krokodil', 'Tiger', 'Biene', 'Rakete', 'Medaille', 'Bahnhof'];
const items = board.map((word) => ({ word, vec: wv.vec(word) }));
for (const hint of ['Tropfen', 'nass', 'gefährlich', 'Streifen', 'Sand', 'honig', 'Gefahr', 'Sternschnuppe']) {
  const { vec } = await wv.embedHint(hint);
  const r = rankByHint(vec, items).slice(0, 3).map((x) => `${x.word} ${x.sim.toFixed(2)}`).join('  ');
  console.log(`  ${hint.padEnd(13)} ${r}`);
}
const unk = await wv.embedHint('Xqzzlwort');
console.log(unk.vec === null ? '✓ Unbekanntes Wort wird erkannt' : '✗ Unbekanntes Wort nicht erkannt');
if (fail || unk.vec !== null) process.exit(1);
