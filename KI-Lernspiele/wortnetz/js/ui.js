// Kleine DOM-Helfer und gemeinsame Bausteine (Ranking-Panel, Wortstapel).
import { barScale } from './ranking.js';
import * as store from './store.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(val)); // CSS-Variablen brauchen setProperty
        else el.style[prop] = val;
      }
    }
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function setMain(...children) {
  const main = document.getElementById('main');
  main.replaceChildren();
  append(main, children);
}

export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

export function focusEl(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(INPUT|BUTTON|A|TEXTAREA|SELECT)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
}

export function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtSim(x) {
  return x.toFixed(3).replace('.', ',');
}

/** Zieht Wörter zufällig und ohne Wiederholung, bis der Pool durch ist; Wörter im Spiel werden übersprungen. */
export class Deck {
  constructor(words) { this.all = [...words]; this.bag = shuffle(this.all); }
  draw(exclude = []) {
    const ex = new Set(exclude);
    for (let round = 0; round < 2; round++) {
      while (this.bag.length) {
        const w = this.bag.pop();
        if (!ex.has(w)) return w;
      }
      this.bag = shuffle(this.all.filter((w) => !ex.has(w)));
    }
    return null;
  }
}

/** FLIP-Animation: merkt sich Positionen, führt die Änderung aus und animiert die Verschiebung. */
export function flip(container, selector, keyAttr, mutate, duration = 380) {
  if (reducedMotion()) { mutate(); return; }
  const before = new Map();
  container.querySelectorAll(selector).forEach((el) => before.set(el.getAttribute(keyAttr), el.getBoundingClientRect()));
  mutate();
  container.querySelectorAll(selector).forEach((el) => {
    const old = before.get(el.getAttribute(keyAttr));
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left, dy = old.top - now.top;
    if (!dx && !dy) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0,0)' }], { duration, easing: 'cubic-bezier(.2,.7,.2,1)' });
  });
}

const EXPLAIN = [
  'Ein Embedding ist eine Liste aus 300 Zahlen, die das Modell für ein Wort gelernt hat. Wörter, die in ähnlichen Zusammenhängen vorkommen, bekommen ähnliche Zahlenlisten – sie liegen in diesem „Bedeutungsraum“ nah beieinander.',
  'Die Kosinus-Ähnlichkeit misst, wie stark zwei solcher Vektoren in dieselbe Richtung zeigen: 1 heißt gleiche Richtung, Werte nahe 0 heißen kein Zusammenhang.',
  'Das Modell hat diese Nähe aus riesigen Textmengen gelernt. Es kennt keine Bedeutung wie wir – nur, welche Wörter oft in ähnlicher Umgebung stehen.'
];

/** Baut das einklappbare Panel „So hat das Modell gerankt“. */
export function rankingPanel() {
  const details = h('details', { class: 'panel', id: 'ranking-panel' });
  details.open = store.loadPrefs().panelOpen ?? false;
  details.addEventListener('toggle', () => store.savePrefs({ panelOpen: details.open }));
  const body = h('div', { class: 'panel-body', id: 'ranking-body' },
    h('p', { class: 'muted' }, 'Gib einen Hinweis ein – danach siehst du hier, wie nah das Modell jedes Wort am Hinweis sieht.'));
  details.append(
    h('summary', {}, h('span', { class: 'panel-title' }, 'So hat das Modell gerankt'), h('span', { class: 'panel-hint', id: 'ranking-summary-hint' })),
    body,
    h('details', { class: 'explain' },
      h('summary', {}, 'Was ist ein Embedding? Was ist Kosinus-Ähnlichkeit?'),
      EXPLAIN.map((t) => h('p', {}, t)),
      h('p', { class: 'muted small' }, 'Die Balken sind auf die Spanne des jeweiligen Zugs gestreckt, weil die Rohwerte oft eng beieinanderliegen. Entscheidend ist die Reihenfolge.')));
  return details;
}

/**
 * Füllt das Panel mit der Rangliste eines Zugs.
 * marks: { [word]: [{ label, kind }] }
 */
export function fillRanking({ hint, ranked, marks = {}, ms }) {
  const body = document.getElementById('ranking-body');
  const sum = document.getElementById('ranking-summary-hint');
  if (!body) return;
  if (sum) sum.textContent = ` – „${hint}“`;
  const scale = barScale(ranked);
  body.replaceChildren(
    h('p', { class: 'muted small' }, `Hinweis „${hint}“ · ${ranked.length} Wörter · berechnet in ${Math.round(ms)} ms auf deinem Gerät`),
    h('ol', { class: 'rank-list' }, ranked.map((r) => {
      const tags = marks[r.word] || [];
      return h('li', { class: `rank-row${tags.length ? ' is-marked' : ''}` },
        h('span', { class: 'rank-no' }, `${r.rank}.`),
        h('span', { class: 'rank-word' }, r.word, tags.map((t) => h('span', { class: `tag tag-${t.kind}` }, t.label))),
        h('span', { class: 'rank-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${(scale.get(r.word) * 100).toFixed(1)}%` } })),
        h('span', { class: 'rank-val' }, fmtSim(r.sim)));
    })));
}
