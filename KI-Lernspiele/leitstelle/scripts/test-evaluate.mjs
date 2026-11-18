#!/usr/bin/env node
// Kleine Tests für die Regel-Engine. Aufruf: node leitstelle/scripts/test-evaluate.mjs
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { evaluate, combineStars } = await import(pathToFileURL(join(here, '..', 'js', 'evaluate.js')).href);

const mail = {
  stufen: [{
    regeln: {
      required: ['entwurf', 'pruefung', 'senden'],
      forbidden: [],
      order: [['entwurf', 'pruefung'], ['pruefung', 'senden']],
      reviewBeforeHighRisk: true,
      optimalLength: 3
    },
    typischeFehler: [
      { bedingung: { typ: 'ohneFreigabe' }, text: 'ohne Freigabe' },
      { bedingung: { typ: 'geaendertNachFreigabe' }, text: 'geändert' },
      { bedingung: { typ: 'und', bedingungen: [{ typ: 'fehlt', werkzeug: 'pruefung' }, { typ: 'enthaelt', werkzeug: 'senden' }] }, text: 'und' }
    ]
  }]
};
const s = (r) => Object.values(r.sterne).join('/');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('evaluate()');
test('perfekte Kette', () => {
  const r = evaluate(mail, ['entwurf', 'pruefung', 'senden']);
  assert.equal(s(r), '3/3/3'); assert.ok(r.perfekt); assert.deepEqual(r.fehler, []);
});
test('Senden ohne Prüfung: Aufgabe erledigt, aber Sicherheit 0', () => {
  const r = evaluate(mail, ['entwurf', 'senden']);
  assert.equal(r.sterne.sicherheit, 0);
  assert.equal(r.sterne.erfolg, 3); // fehlende Freigabe zählt nur bei der Sicherheit
  assert.deepEqual(r.fehler, [0, 2]);
});
test('Änderung nach Freigabe wird erkannt', () => {
  const r = evaluate(mail, ['entwurf', 'pruefung', 'entwurf', 'senden']);
  assert.equal(r.sterne.sicherheit, 0);
  assert.equal(r.sterne.effizienz, 2);
  assert.ok(r.fehler.includes(1));
  assert.equal(r.schritte[3].warnung, 'geaendertNachFreigabe');
});
test('vertauschte Reihenfolge kostet einen Erfolgsstern', () => {
  const r = evaluate(mail, ['pruefung', 'entwurf', 'senden']);
  assert.equal(r.sterne.erfolg, 2);
  assert.equal(r.sterne.sicherheit, 0); // Entwurf nach der Prüfung
});
test('leere Kette bei Aufgabe ohne Werkzeug ist perfekt', () => {
  const none = { stufen: [{ regeln: { required: [], forbidden: ['senden'], order: [], reviewBeforeHighRisk: true, optimalLength: 0 } }] };
  assert.ok(evaluate(none, []).perfekt);
  const r = evaluate(none, ['suche', 'rechner']);
  assert.equal(s(r), '3/1/3');
  const r2 = evaluate(none, ['pruefung', 'senden']);
  assert.equal(r2.sterne.erfolg, 1); assert.equal(r2.sterne.sicherheit, 1);
});
test('ohne Freigabepflicht ist direktes Senden sicher', () => {
  const ok = { stufen: [{ regeln: { required: ['senden'], forbidden: ['entwurf'], order: [], reviewBeforeHighRisk: false, optimalLength: 1 } }] };
  assert.equal(s(evaluate(ok, ['senden'])), '3/3/3');
  assert.equal(s(evaluate(ok, ['pruefung', 'senden'])), '3/2/3');
});
test('Mehrfachbedarf über doppelte required-Einträge', () => {
  const two = { stufen: [{ regeln: { required: ['suche', 'suche'], forbidden: [], order: [], reviewBeforeHighRisk: true, optimalLength: 2 } }] };
  assert.equal(evaluate(two, ['suche', 'suche']).sterne.effizienz, 3);
  assert.equal(evaluate(two, ['suche', 'suche', 'suche']).sterne.effizienz, 2);
});
test('combineStars rundet den Mittelwert', () => {
  assert.deepEqual(combineStars([{ erfolg: 3, effizienz: 2, sicherheit: 0 }, { erfolg: 3, effizienz: 3, sicherheit: 3 }]),
    { erfolg: 3, effizienz: 3, sicherheit: 2 });
});
console.log(`\n✓ ${n} Tests bestanden.`);
