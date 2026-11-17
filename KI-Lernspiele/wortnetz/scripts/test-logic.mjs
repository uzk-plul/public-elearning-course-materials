// Tests für die reine Spiellogik (ohne Modell). Aufruf: node wortnetz/scripts/test-logic.mjs
import assert from 'node:assert/strict';
import { normalize, checkHint, cosine, rankByHint, barScale, resolveArcade, topSurprises, blockPoints, zoneSize, arcadeInterval, ARCADE } from '../js/ranking.js';
import { emptyGrid, floodFill, removeAndCollapse, dropBlock, reachedTop, pickColumn, applyGravity, colorFor, twoBlockChance } from '../js/blocks.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
console.log('Spiellogik');

test('normalize: Umlaute, ß, Groß-/Kleinschreibung', () => {
  assert.equal(normalize('Größe'), 'groesse');
  assert.equal(normalize('  ÜBUNG '), 'uebung');
  assert.equal(normalize('Café'), 'cafe');
});

test('checkHint: gültig und ungültig', () => {
  const words = ['Katze', 'Bibliothek', 'Bäume'];
  assert.equal(checkHint('Hund', words).ok, true);
  assert.equal(checkHint('', words).code, 'leer');
  assert.equal(checkHint('zwei Worte', words).code, 'mehrere');
  assert.equal(checkHint('a', words).code, 'kurz');
  assert.equal(checkHint('R2D2', words).code, 'zeichen');
  assert.equal(checkHint('katze', words).code, 'gleich');
  assert.equal(checkHint('Katzen', words).code, 'teilwort');
  assert.equal(checkHint('Thek', words).code, 'teilwort');
  assert.equal(checkHint('baeume', words).code, 'gleich');
  assert.equal(checkHint('Baum', words).ok, true);
  assert.equal(checkHint('Bio-Tonne', words).ok, true);
});

test('cosine und rankByHint', () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  const r = rankByHint([1, 0], [{ word: 'A', vec: [0, 1] }, { word: 'B', vec: [1, 0.1] }, { word: 'C', vec: [1, 1] }]);
  assert.deepEqual(r.map((x) => x.word), ['B', 'C', 'A']);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3]);
});

test('barScale skaliert auf die Spanne', () => {
  const s = barScale([{ word: 'a', sim: 0.9 }, { word: 'b', sim: 0.85 }, { word: 'c', sim: 0.8 }]);
  assert.equal(s.get('a'), 1);
  assert.ok(Math.abs(s.get('c') - 0.06) < 1e-9);
});

test('resolveArcade: Treffer räumt Ziel und alles darunter', () => {
  const ranked = ['Z', 'Y', 'Ziel', 'X', 'W', 'V'].map((word, i) => ({ word, sim: 1 - i / 10, rank: i + 1 }));
  const res = resolveArcade(ranked, 'Ziel', 4);
  assert.deepEqual(res.order, ['V', 'W', 'X', 'Ziel', 'Y', 'Z']);
  assert.equal(res.fromBottom, 3);
  assert.equal(res.hit, true);
  assert.deepEqual(res.removed, ['Ziel', 'Y', 'Z']);
  assert.deepEqual(res.remaining, ['V', 'W', 'X']);
  assert.equal(res.points, 3 * 10 + ARCADE.placementBonus[3]);
  assert.equal(res.rank, 3);
});

test('resolveArcade: Fehlschuss außerhalb der Zone', () => {
  const ranked = ['A', 'B', 'C', 'D', 'Ziel', 'E'].map((word, i) => ({ word, sim: 1 - i / 10, rank: i + 1 }));
  const res = resolveArcade(ranked, 'Ziel', 4);
  assert.equal(res.fromBottom, 5);
  assert.equal(res.hit, false);
  assert.equal(res.points, 0);
  assert.equal(res.removed.length, 0);
});

test('Zone, Tempo und Punkte', () => {
  assert.equal(zoneSize(0), 4);
  assert.equal(zoneSize(ARCADE.zoneShrinkAfter), 3);
  assert.ok(arcadeInterval(10) < arcadeInterval(0));
  assert.equal(arcadeInterval(500), ARCADE.intervalMin);
  assert.deepEqual([1, 2, 3, 4].map(blockPoints), [10, 30, 60, 100]);
});

test('topSurprises: größte Ranglücke zuerst, nur gemeinte Züge', () => {
  const moves = [
    { hint: 'a', intended: 'X', rank: 1, simGap: 0 },
    { hint: 'b', intended: 'Y', rank: 5, simGap: 0.1 },
    { hint: 'c', intended: null, rank: 9, simGap: 0 },
    { hint: 'd', intended: 'Z', rank: 3, simGap: 0.2 }
  ];
  assert.deepEqual(topSurprises(moves).map((m) => m.hint), ['b', 'd']);
});

const B = (id, color) => ({ id, word: id, color });

test('floodFill findet zusammenhängende Blöcke gleicher Farbe', () => {
  const g = emptyGrid(4, 3);
  g[3] = [B('a', 0), B('b', 0), B('c', 1)];
  g[2] = [B('d', 1), B('e', 0), B('f', 1)];
  g[1][1] = B('g', 0);
  const found = floodFill(g, 3, 0).map(([r, c]) => g[r][c].id).sort();
  assert.deepEqual(found, ['a', 'b', 'e', 'g']);
  assert.deepEqual(floodFill(g, 2, 0).map(([r, c]) => g[r][c].id), ['d']);
});

test('removeAndCollapse lässt Blöcke nachrutschen', () => {
  const g = emptyGrid(3, 2);
  g[0][0] = B('top', 2); g[1][0] = B('mid', 1); g[2][0] = B('bot', 0);
  const after = removeAndCollapse(g, [[2, 0]]);
  assert.equal(after[2][0].id, 'mid');
  assert.equal(after[1][0].id, 'top');
  assert.equal(after[0][0], null);
  assert.equal(g[2][0].id, 'bot', 'Original bleibt unverändert');
});

test('dropBlock, reachedTop und pickColumn', () => {
  let g = emptyGrid(2, 2);
  g = dropBlock(g, 0, B('x', 0)).grid;
  assert.equal(g[1][0].id, 'x');
  assert.equal(reachedTop(g), false);
  g = dropBlock(g, 0, B('y', 0)).grid;
  assert.equal(reachedTop(g), true);
  assert.equal(dropBlock(g, 0, B('z', 0)), null);
  assert.equal(pickColumn(g, () => 0.5), 1, 'volle Spalte wird nie gewählt');
  assert.deepEqual(applyGravity(g).map((r) => r.map((b) => b?.id ?? null)), [['y', null], ['x', null]]);
});

test('colorFor meidet Nachbarfarben, twoBlockChance steigt bis 100 %', () => {
  const g = emptyGrid(3, 3);
  g[2] = [B('l', 0), B('m', 1), B('r', 2)];
  g[1][0] = B('ol', 3);
  // Block landet in Spalte 1, Zeile 1: Nachbarn unten 1, links 3 → frei sind 0 und 2
  const seq = [0.1, 0.0]; let i = 0;
  assert.equal(colorFor(g, 1, () => seq[i++]), 0);
  assert.equal(twoBlockChance(0), 0.5);
  assert.equal(twoBlockChance(100), 1);
});

console.log(`\n✓ ${n} Tests bestanden.`);
