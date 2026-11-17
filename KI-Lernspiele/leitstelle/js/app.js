// Leitstelle – Oberfläche, Ketten-Editor und Simulation (Vanilla JS, ES-Module)
import { evaluate, combineStars, MAX_CHAIN } from './evaluate.js';
import { mascotSVG } from './mascot.js';
import * as store from './store.js';

const main = document.getElementById('main');
const live = document.getElementById('live');
const hud = document.getElementById('hud');
const BLOCK_SIZE = 5;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TYPEN = {
  'kein-werkzeug': 'Kein Werkzeug nötig',
  nachschlagen: 'Nachschlagen nötig',
  rechnen: 'Exakt rechnen',
  riskant: 'Riskante Aktion',
  reihenfolge: 'Reihenfolge entscheidend',
  mehrstufig: 'Mehrstufig',
  overkill: 'Overkill-Falle'
};
const THEMEN = {
  raumbuchung: 'Raumbuchung', noten: 'Noten', mail: 'Mail an Studierende', literatur: 'Literaturrecherche',
  mensa: 'Mensa', pruefungsanmeldung: 'Prüfungsanmeldung', reisekosten: 'Reisekosten'
};
const DIFFS = { leicht: 'leicht', mittel: 'mittel', schwer: 'schwer' };
const DIMS = [
  { key: 'erfolg', label: 'Erfolg', frage: 'Ist die Aufgabe gelöst?' },
  { key: 'effizienz', label: 'Effizienz', frage: 'Gab es unnötige Schritte?' },
  { key: 'sicherheit', label: 'Sicherheit', frage: 'Kam vor jeder riskanten Aktion eine Freigabe?' }
];
const REFLECTIONS = [
  'Welche Aufgabe aus deinem Arbeits- oder Studienalltag würdest du einem Agenten nicht ohne Freigabe überlassen?',
  'Wann hast du zuletzt ein Werkzeug benutzt, obwohl die Antwort schon vor dir lag?',
  'Woran merkst du, dass eine KI „im Kopf“ rechnet, statt wirklich zu rechnen?',
  'Wer sollte in deinem Umfeld die menschliche Prüfung übernehmen – und was genau sollte diese Person prüfen?',
  'Bei welcher Aufgabe wäre eine falsche Reihenfolge besonders teuer?',
  'Welche Information würdest du einem Agenten lieber selbst geben, statt ihn suchen zu lassen?',
  'Was unterscheidet „einen Entwurf vorbereiten“ von „im Namen von jemandem handeln“?'
];

const state = {
  tools: [],
  toolById: new Map(),
  highRisk: [],
  missions: [],
  filter: { diff: 'alle', typen: new Set(Object.keys(TYPEN)) },
  stats: store.loadStats(),
  session: { count: 0, played: new Set(), block: [], poolRestarted: false },
  screen: 'loading',
  mission: null,
  stage: 0,
  chain: [],
  running: false,
  result: null,
  stageResults: [],
  log: [],
  mood: 'neutral',
  speech: '',
  drag: null,
  reflection: { index: 0, text: '' }
};

/* ---------------- Hilfsfunktionen ---------------- */

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const setMain = (...nodes) => main.replaceChildren(...nodes.flat().filter(Boolean));
const fill = (box, ...nodes) => box.replaceChildren(...nodes.flat().filter(Boolean));
const toolName = (id) => state.toolById.get(id)?.name || id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICONS = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.01"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
function icon(name, cls = 'icon') {
  return h('span', {
    class: cls, 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  });
}
function toolIcon(id, cls = 'tool-icon') {
  return h('span', { class: cls, 'aria-hidden': 'true', html: state.toolById.get(id)?.icon || '' });
}
function stars(n) {
  const wrap = h('span', { class: 'stars', 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i++) {
    wrap.append(h('span', {
      class: `star${i < n ? ' is-on' : ''}`,
      html: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>'
    }));
  }
  return wrap;
}

function announce(msg) {
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 40);
}
function focusEl(el, scroll = true) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (scroll) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function updateHud() {
  const s = state.session;
  hud.textContent = s.count ? `Sitzung: ${s.count} Mission${s.count === 1 ? '' : 'en'}` : '';
  hud.hidden = !s.count;
}

/* ---------------- Missionsauswahl ---------------- */

function pool() {
  return state.missions.filter((m) =>
    (state.filter.diff === 'alle' || m.schwierigkeit === state.filter.diff) && state.filter.typen.has(m.typ));
}

function pickNextMission() {
  const p = pool();
  if (!p.length) return false;
  const s = state.session;
  let cand = p.filter((m) => !s.played.has(m.id));
  s.poolRestarted = false;
  if (!cand.length) {
    p.forEach((m) => s.played.delete(m.id));
    cand = p.filter((m) => m.id !== state.mission?.id);
    if (!cand.length) cand = p;
    s.poolRestarted = true;
  }
  const m = cand[Math.floor(Math.random() * cand.length)];
  s.played.add(m.id);
  state.mission = m;
  state.stage = 0;
  state.stageResults = [];
  resetStage();
  return true;
}

function resetStage(keepChain = false) {
  if (!keepChain) state.chain = [];
  state.result = null;
  state.running = false;
  state.runIndex = -1;
  state.log = [];
  state.mood = 'neutral';
  state.speech = state.stage === 0 && !keepChain
    ? 'Bereit! Stell mir eine Kette zusammen – oder starte ohne Werkzeug.'
    : 'Neuer Versuch – ich warte auf deinen Plan.';
}

/* ---------------- Startbildschirm ---------------- */

function renderStart() {
  state.screen = 'start';
  updateHud();
  const st = state.stats;
  const poolInfo = h('p', { class: 'pool-info', 'aria-live': 'polite' });
  const startError = h('p', { class: 'form-error', role: 'alert' });
  const refresh = () => {
    startError.textContent = '';
    if (!state.filter.typen.size) { poolInfo.textContent = 'Bitte mindestens einen Missionstyp wählen.'; return; }
    const n = pool().length;
    poolInfo.textContent = n ? `${n} passende Missionen` : 'Mit dieser Auswahl gibt es keine Missionen.';
  };

  const typeBoxes = Object.keys(TYPEN).map((t) => h('input', {
    type: 'checkbox', id: `tf-${t}`, value: t, checked: state.filter.typen.has(t),
    onchange: (e) => { if (e.target.checked) state.filter.typen.add(t); else state.filter.typen.delete(t); refresh(); }
  }));
  const setAll = (on) => {
    state.filter.typen = new Set(on ? Object.keys(TYPEN) : []);
    typeBoxes.forEach((b) => { b.checked = on; });
    refresh();
  };

  const form = h('form', {
    class: 'filter-form',
    onsubmit: (e) => {
      e.preventDefault();
      if (!state.filter.typen.size) { startError.textContent = 'Bitte mindestens einen Missionstyp wählen.'; return; }
      if (!pool().length) { startError.textContent = 'Mit dieser Auswahl gibt es keine Missionen.'; return; }
      const keep = state.mission && !state.result && !state.stageResults.length && pool().some((m) => m.id === state.mission.id);
      if (!keep) pickNextMission();
      renderGame();
      focusEl(document.getElementById('mission-heading'));
    }
  },
  h('fieldset', { class: 'fieldset' },
    h('legend', {}, 'Schwierigkeit'),
    h('div', { class: 'radio-row' },
      ['alle', 'leicht', 'mittel', 'schwer'].map((d) => h('label', { class: 'pill' },
        h('input', { type: 'radio', name: 'diff', value: d, checked: state.filter.diff === d, onchange: () => { state.filter.diff = d; refresh(); } }),
        h('span', {}, d === 'alle' ? 'Alle' : DIFFS[d]))))),
  h('fieldset', { class: 'fieldset' },
    h('legend', {}, 'Missionstyp'),
    h('div', { class: 'btn-row btn-row-tight' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => setAll(true) }, 'Alle auswählen'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => setAll(false) }, 'Keine')),
    h('ul', { class: 'check-grid' }, Object.entries(TYPEN).map(([t, label], i) =>
      h('li', {}, h('label', { class: 'check', for: `tf-${t}` }, typeBoxes[i], h('span', {}, label)))))),
  poolInfo, startError,
  h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn btn-primary btn-large' },
    state.session.count ? 'Weiter mit nächster Mission' : 'Erste Mission starten', icon('arrow'))));

  const maxStars = st.missionsPlayed * 3;
  const resetBtn = h('button', {
    type: 'button', class: 'btn btn-danger', id: 'reset-btn',
    onclick: () => {
      if (!window.confirm('Statistik und Sterne wirklich löschen?')) return;
      state.stats = store.resetStats();
      state.session = { count: 0, played: new Set(), block: [], poolRestarted: false };
      state.mission = null; state.stageResults = []; state.result = null;
      renderStart();
      announce('Fortschritt wurde zurückgesetzt.');
      document.getElementById('reset-btn')?.focus();
    }
  }, icon('trash'), 'Fortschritt zurücksetzen');

  setMain(
    h('section', { class: 'intro' },
      h('div', { class: 'intro-mascot', html: mascotSVG('neutral', 112) }),
      h('div', {},
        h('h1', { id: 'start-heading' }, 'Leitstelle'),
        h('p', { class: 'lead' }, 'Du leitest die Leitstelle und schickst einen kleinen KI-Agenten auf Missionen aus dem Hochschulalltag. Du entscheidest, welche Werkzeuge er in welcher Reihenfolge nutzt – und wo ein Mensch freigeben muss, bevor etwas nach außen geht.'))),
    h('div', { class: 'start-grid' },
      h('section', { class: 'card', 'aria-labelledby': 'how-h' },
        h('h2', { id: 'how-h' }, 'So funktioniert’s'),
        h('ol', { class: 'steps' },
          h('li', {}, h('span', { class: 'step-no', 'aria-hidden': 'true' }, '1'), h('span', {}, 'Lies den Auftrag und das Material, das dem Agenten schon vorliegt.')),
          h('li', {}, h('span', { class: 'step-no', 'aria-hidden': 'true' }, '2'), h('span', {}, 'Baue eine Kette aus 0 bis 6 Werkzeugen: antippen oder ziehen, umsortieren, entfernen. Auch „kein Werkzeug“ kann richtig sein.')),
          h('li', {}, h('span', { class: 'step-no', 'aria-hidden': 'true' }, '3'), h('span', {}, 'Starte die Mission und lies das Protokoll. Du bekommst Sterne für Erfolg, Effizienz und Sicherheit.'))),
        h('p', { class: 'hint' }, 'Der Agent kann immer direkt antworten. Werkzeuge braucht er nur, wenn ihm etwas fehlt oder wenn etwas exakt, geprüft oder nach außen geschehen muss.')),
      h('section', { class: 'card', 'aria-labelledby': 'filter-h' },
        h('h2', { id: 'filter-h' }, 'Missionen auswählen (optional)'),
        form)),
    h('section', { class: 'card', 'aria-labelledby': 'tools-h' },
      h('h2', { id: 'tools-h' }, 'Die Werkzeuge'),
      h('ul', { class: 'tool-overview' }, state.tools.map((t) => h('li', { class: `tool-card${t.risiko === 'hoch' ? ' is-high' : ''}` },
        toolIcon(t.id),
        h('div', {},
          h('h3', {}, t.name, t.risiko === 'hoch' ? h('span', { class: 'risk-badge' }, icon('warn'), 'hohes Risiko') : null),
          h('p', {}, t.beschreibung)))))),
    h('section', { class: 'card', 'aria-labelledby': 'progress-h' },
      h('h2', { id: 'progress-h' }, 'Dein Fortschritt'),
      h('dl', { class: 'stats' },
        h('div', {}, h('dt', {}, 'Missionen gespielt'), h('dd', {}, st.missionsPlayed)),
        h('div', {}, h('dt', {}, 'Perfekte Missionen'), h('dd', {}, st.perfectMissions)),
        DIMS.map((d) => h('div', {}, h('dt', {}, `${d.label}-Sterne`), h('dd', {}, st.totals[d.key], h('small', {}, ` / ${maxStars}`))))),
      store.storageAvailable() ? null : h('p', { class: 'note' }, 'Hinweis: Dein Browser erlaubt keinen lokalen Speicher. Der Fortschritt geht beim Schließen verloren.'),
      h('div', { class: 'btn-row' }, resetBtn))
  );
  refresh();
}

/* ---------------- Spielbildschirm ---------------- */

function missionHeader() {
  const m = state.mission;
  const n = m.stufen.length;
  return h('section', { class: 'mission-bar', 'aria-label': 'Missionskopf' },
    h('div', { class: 'mission-goal' },
      icon('target', 'icon goal-icon'),
      h('div', {},
        h('p', { class: 'goal-label' }, 'Ziel'),
        h('p', { class: 'goal-text' }, m.ziel))),
    h('div', { class: 'mission-progress' },
      h('p', { class: 'goal-label' }, `Stufe ${state.stage + 1} von ${n}`),
      h('ol', { class: 'stage-dots', 'aria-hidden': 'true' },
        m.stufen.map((_, i) => h('li', { class: i < state.stage ? 'is-done' : i === state.stage ? 'is-current' : '' },
          i < state.stage ? icon('check') : String(i + 1)))))
  );
}

function materialList() {
  const m = state.mission;
  const items = [];
  for (let i = 0; i < state.stage; i++) {
    items.push({ titel: `Ergebnis aus Stufe ${i + 1}`, text: m.stufen[i].ergebnis, fromStage: true });
  }
  items.push(...(m.stufen[state.stage].material || []));
  if (!items.length) return h('p', { class: 'hint' }, 'Kein zusätzliches Material.');
  return h('ul', { class: 'material' }, items.map((x) => h('li', { class: x.fromStage ? 'is-carried' : '' },
    h('h4', {}, x.titel),
    h('p', {}, x.text))));
}

/* ----- Ketten-Editor ----- */

function addTool(id, at = state.chain.length) {
  if (state.running || state.result) return;
  if (state.chain.length >= MAX_CHAIN) { announce(`Die Kette ist voll: höchstens ${MAX_CHAIN} Schritte.`); return; }
  state.chain.splice(at, 0, id);
  renderPlan();
  announce(`${toolName(id)} als Schritt ${at + 1} von ${state.chain.length} hinzugefügt.`);
}
function removeStep(i) {
  const [t] = state.chain.splice(i, 1);
  renderPlan();
  announce(`Schritt ${i + 1} (${toolName(t)}) entfernt.`);
  const next = document.getElementById(`ch-${Math.min(i, state.chain.length - 1)}-rm`) || document.getElementById('chain-heading');
  focusEl(next, false);
}
function moveStep(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.chain.length) return;
  [state.chain[i], state.chain[j]] = [state.chain[j], state.chain[i]];
  renderPlan();
  announce(`${toolName(state.chain[j])} ist jetzt Schritt ${j + 1}.`);
  const btn = document.getElementById(`ch-${j}-${dir < 0 ? 'up' : 'down'}`);
  focusEl(btn && !btn.disabled ? btn : document.getElementById(`ch-${j}-rm`), false);
}

function onDrop(e, targetIndex) {
  e.preventDefault();
  clearDropMarks();
  if (state.running || state.result) return;
  let data;
  try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
  if (data.from === 'palette') addTool(data.tool, targetIndex);
  else if (data.from === 'chain') {
    const [t] = state.chain.splice(data.index, 1);
    const at = targetIndex > data.index ? targetIndex - 1 : targetIndex;
    state.chain.splice(at, 0, t);
    renderPlan();
    announce(`${toolName(t)} ist jetzt Schritt ${at + 1}.`);
  }
}
function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-end').forEach((el) => el.classList.remove('drop-before', 'drop-end'));
}

function renderPlan() {
  const box = document.getElementById('plan');
  if (!box) return;
  const focusedId = box.contains(document.activeElement) ? document.activeElement.id : null;
  const locked = state.running || !!state.result;
  const full = state.chain.length >= MAX_CHAIN;

  const palette = h('ul', { class: 'palette', 'aria-label': 'Werkzeugpalette' },
    state.tools.map((t) => h('li', {},
      h('button', {
        type: 'button', id: `pal-${t.id}`,
        class: `tool-btn${t.risiko === 'hoch' ? ' is-high' : ''}`,
        draggable: locked ? null : 'true',
        'aria-disabled': locked || full ? 'true' : null,
        'aria-describedby': `pal-${t.id}-desc`,
        onclick: () => addTool(t.id),
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'palette', tool: t.id })); e.dataTransfer.effectAllowed = 'copyMove'; }
      },
      toolIcon(t.id),
      h('span', { class: 'tool-btn-name' }, t.name),
      t.risiko === 'hoch' ? h('span', { class: 'risk-badge' }, icon('warn'), 'hohes Risiko') : null,
      h('span', { class: 'tool-btn-desc', id: `pal-${t.id}-desc` }, t.beschreibung)))));

  const list = h('ol', {
    class: 'chain', id: 'chain-list', 'aria-labelledby': 'chain-heading',
    ondragover: (e) => {
      if (locked) return;
      e.preventDefault();
      clearDropMarks();
      const li = e.target.closest('li[data-index]');
      if (li) {
        const r = li.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const idx = Number(li.dataset.index) + (after ? 1 : 0);
        const target = list.querySelector(`li[data-index="${idx}"]`);
        if (target) target.classList.add('drop-before'); else list.classList.add('drop-end');
        list.dataset.dropAt = String(idx);
      } else {
        list.classList.add('drop-end');
        list.dataset.dropAt = String(state.chain.length);
      }
    },
    ondragleave: (e) => { if (!list.contains(e.relatedTarget)) clearDropMarks(); },
    ondrop: (e) => onDrop(e, Number(list.dataset.dropAt ?? state.chain.length))
  },
  state.chain.map((id, i) => {
    const step = state.result?.schritte?.[i];
    const runningNow = state.running && state.runIndex === i;
    return h('li', {
      'data-index': i,
      class: `chain-item${runningNow ? ' is-running' : ''}${step ? ` st-${step.status}` : ''}${step?.warnung ? ' has-warning' : ''}${state.runIndex > i || step ? ' is-done' : ''}`,
      draggable: locked ? null : 'true',
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'chain', index: i })); e.dataTransfer.effectAllowed = 'move'; }
    },
    h('span', { class: 'step-num', 'aria-hidden': 'true' }, i + 1),
    locked ? null : icon('grip', 'icon grip'),
    toolIcon(id),
    h('span', { class: 'chain-name' }, h('span', { class: 'sr-only' }, `Schritt ${i + 1}: `), toolName(id)),
    locked ? null : h('span', { class: 'chain-ctrl' },
      h('button', { type: 'button', class: 'icon-btn', id: `ch-${i}-up`, disabled: i === 0, 'aria-label': `Schritt ${i + 1} (${toolName(id)}) nach oben`, onclick: () => moveStep(i, -1) }, icon('up')),
      h('button', { type: 'button', class: 'icon-btn', id: `ch-${i}-down`, disabled: i === state.chain.length - 1, 'aria-label': `Schritt ${i + 1} (${toolName(id)}) nach unten`, onclick: () => moveStep(i, 1) }, icon('down')),
      h('button', { type: 'button', class: 'icon-btn icon-btn-danger', id: `ch-${i}-rm`, 'aria-label': `Schritt ${i + 1} (${toolName(id)}) entfernen`, onclick: () => removeStep(i) }, icon('x'))));
  }));

  const empty = state.chain.length ? null : h('p', { class: 'chain-empty' },
    'Noch keine Schritte. Tippe oben auf ein Werkzeug oder ziehe es hierher. ',
    h('strong', {}, 'Leere Kette = der Agent antwortet direkt aus dem Material.'), ' Auch das kann die beste Lösung sein.');

  fill(box,
    h('h2', { id: 'palette-heading' }, 'Werkzeuge'),
    h('p', { class: 'hint', id: 'palette-hint' }, locked
      ? 'Während und nach der Simulation ist die Kette gesperrt.'
      : full ? `Die Kette ist voll (${MAX_CHAIN} Schritte). Entferne einen Schritt, um einen neuen hinzuzufügen.`
        : 'Antippen fügt das Werkzeug am Ende der Kette an. Am Desktop kannst du es auch an eine Stelle ziehen.'),
    palette,
    h('div', { class: 'chain-head' },
      h('h2', { id: 'chain-heading', tabindex: '-1' }, 'Deine Kette'),
      h('span', { class: 'chain-count' }, `${state.chain.length} / ${MAX_CHAIN} Schritte`)),
    list,
    empty,
    h('div', { class: 'btn-row plan-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'start-btn', disabled: locked, onclick: runMission },
        icon('play'), state.chain.length ? 'Mission starten' : 'Ohne Werkzeug starten'),
      h('button', {
        type: 'button', class: 'btn btn-ghost', disabled: locked || !state.chain.length,
        onclick: () => { state.chain = []; renderPlan(); announce('Kette geleert.'); focusEl(document.getElementById('chain-heading'), false); }
      }, 'Kette leeren'))
  );
  // Fokus nach dem Neuaufbau erhalten (z. B. Palette per Enter bedient).
  if (focusedId) {
    const again = document.getElementById(focusedId);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
}

/* ----- Agent & Protokoll ----- */

function renderAgent() {
  const box = document.getElementById('agent');
  if (!box) return;
  fill(box,
    h('h2', { id: 'agent-heading' }, 'Agent & Protokoll'),
    h('div', { class: 'agent-row' },
      h('div', { class: `agent-mascot${state.running ? ' is-working' : ''}`, html: mascotSVG(state.mood, 96) }),
      h('p', { class: 'speech' }, state.speech)),
    h('ol', { class: 'log', id: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Protokoll der Simulation' },
      state.log.map(logItem)),
    state.log.length ? null : h('p', { class: 'hint log-empty' }, 'Das Protokoll füllt sich, sobald du die Mission startest.')
  );
}
function logItem(entry) {
  const cls = `log-item log-${entry.kind}`;
  const ic = entry.tool ? toolIcon(entry.tool, 'tool-icon small') : icon(entry.kind === 'warn' ? 'warn' : entry.kind === 'result' ? 'check' : 'info', 'icon');
  return h('li', { class: cls }, ic, h('span', {},
    entry.tag ? h('span', { class: `log-tag tag-${entry.tagKind}` }, entry.tag) : null,
    entry.text));
}
function pushLog(entry) {
  state.log.push(entry);
  const list = document.getElementById('log');
  if (list) {
    document.querySelector('.log-empty')?.remove();
    const li = logItem(entry);
    list.append(li);
    if (!reducedMotion()) li.classList.add('is-new');
  }
}
function setMood(mood, speech) {
  state.mood = mood;
  if (speech !== undefined) state.speech = speech;
  const box = document.querySelector('.agent-mascot');
  if (box) { box.innerHTML = mascotSVG(mood, 96); box.classList.toggle('is-working', state.running); }
  const sp = document.querySelector('.speech');
  if (sp) sp.textContent = state.speech;
}

function observationFor(stage, step, seen) {
  const obs = stage.observations || {};
  const name = toolName(step.werkzeug);
  if (step.status === 'doppelt' || seen > 1) {
    return `${name}: Noch einmal dasselbe – das Ergebnis lag schon aus Schritt ${step.firstIndex + 1} vor.`;
  }
  if (obs[step.werkzeug]) return obs[step.werkzeug];
  const tool = state.toolById.get(step.werkzeug);
  if (step.status === 'unnoetig' && tool?.leerlauf) return tool.leerlauf;
  return (obs.standard || '{werkzeug}: Dieser Schritt brachte hier nichts.').replace('{werkzeug}', name);
}

const WARN_TEXT = {
  ohneFreigabe: 'Ohne vorherige menschliche Prüfung ausgeführt!',
  geaendertNachFreigabe: 'Der Text wurde nach der Freigabe noch geändert – ausgeführt wurde eine ungeprüfte Fassung!',
  ungefragteAktion: 'Diese Aktion nach außen war gar nicht beauftragt!'
};

async function runMission() {
  if (state.running || state.result) return;
  const m = state.mission;
  const stage = m.stufen[state.stage];
  const chain = [...state.chain];
  const res = evaluate(m, chain, { stage: state.stage, highRisk: state.highRisk });
  const delay = reducedMotion() ? 60 : 850;

  state.running = true;
  state.runIndex = -1;
  state.log = [];
  renderPlan();
  renderAgent();
  setMood('denkt', 'Ich lege los …');
  announce('Mission gestartet.');
  document.getElementById('agent').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  await sleep(reducedMotion() ? 0 : 400);

  if (!chain.length) {
    pushLog({ kind: 'info', text: 'Der Agent nutzt kein Werkzeug und antwortet direkt aus Auftrag und Material.' });
    await sleep(delay);
  }
  const firstIdx = new Map();
  const seenCount = new Map();
  for (let i = 0; i < chain.length; i++) {
    state.runIndex = i;
    renderPlan();
    const step = { ...res.schritte[i] };
    if (!firstIdx.has(step.werkzeug)) firstIdx.set(step.werkzeug, i);
    step.firstIndex = firstIdx.get(step.werkzeug);
    seenCount.set(step.werkzeug, (seenCount.get(step.werkzeug) || 0) + 1);
    await sleep(delay / 2);
    const tag = step.status === 'noetig' ? null : step.status === 'doppelt' ? 'doppelt' : 'unnötig';
    pushLog({ kind: 'step', tool: step.werkzeug, text: observationFor(stage, step, seenCount.get(step.werkzeug)), tag, tagKind: 'muted' });
    if (step.warnung) {
      setMood('besorgt', 'Oh nein – das ging ungeprüft raus!');
      pushLog({ kind: 'warn', text: WARN_TEXT[step.warnung], tag: 'Warnung', tagKind: 'warn' });
    }
    await sleep(delay / 2);
  }
  state.runIndex = chain.length;

  if (res.sterne.erfolg === 3) pushLog({ kind: 'result', text: `Ergebnis: ${stage.ergebnis}` });
  else pushLog({ kind: 'warn', text: `Ergebnis: ${failureReason(res)}`, tag: 'Problem', tagKind: 'warn' });

  state.running = false;
  state.result = res;
  state.stageResults[state.stage] = { sterne: res.sterne, chain };
  const mood = res.perfekt ? 'freut' : res.sterne.sicherheit < 3 ? 'besorgt' : res.sterne.erfolg < 3 ? 'verwirrt' : 'neutral';
  const speech = res.perfekt ? 'Mission erfüllt – sauber geplant!'
    : res.sterne.sicherheit < 3 ? 'Da ist etwas nach außen gegangen, das jemand hätte prüfen müssen.'
      : res.sterne.erfolg < 3 ? 'Hm, da ist bei der Aufgabe etwas schiefgelaufen.'
        : 'Geschafft – aber mit Umwegen.';
  setMood(mood, speech);
  renderPlan();
  renderEvaluation();
  const s = res.sterne;
  announce(`Auswertung: Erfolg ${s.erfolg}, Effizienz ${s.effizienz}, Sicherheit ${s.sicherheit} von je 3 Sternen.`);
  focusEl(document.getElementById('eval-heading'));
}

/* ----- Auswertung ----- */

function failureReason(res) {
  const codes = new Set(res.probleme.filter((p) => p.dim === 'erfolg').map((p) => p.code));
  const parts = [];
  if (codes.has('fehlt')) parts.push('ihm fehlte ein nötiger Schritt');
  if (codes.has('verboten')) parts.push('er hat etwas getan, das der Auftrag ausschloss');
  if (codes.has('reihenfolge')) parts.push('die Schritte kamen in der falschen Reihenfolge');
  const why = parts.length ? parts.join(', ') : 'der Plan passte nicht zum Auftrag';
  return `Der Agent liefert kein brauchbares Ergebnis – ${why}.`;
}

function problemText(p) {
  const n = toolName(p.werkzeug);
  switch (p.code) {
    case 'fehlt': return `Es fehlte ein nötiger Schritt: ${n}.`;
    case 'verboten': return `${n} hätte hier nicht vorkommen dürfen.`;
    case 'reihenfolge': return `Reihenfolge: ${toolName(p.a)} muss vor ${toolName(p.b)} kommen.`;
    case 'unnoetig': return `${n} war hier nicht nötig${p.anzahl > 1 ? ` (${p.anzahl}×)` : ''}.`;
    case 'doppelt': return `${n} kam öfter vor als nötig${p.anzahl > 1 ? ` (${p.anzahl}× zu viel)` : ''}.`;
    case 'ohneFreigabe': return `Schritt ${p.index + 1} (${n}) lief, bevor ein Mensch geprüft und freigegeben hatte.`;
    case 'geaendertNachFreigabe': return `Schritt ${p.index + 1} (${n}): Nach der Freigabe wurde der Text noch geändert – nach außen ging eine ungeprüfte Fassung.`;
    case 'ungefragteAktion': return `Schritt ${p.index + 1} (${n}) hat etwas nach außen ausgelöst, worum niemand gebeten hatte.`;
    default: return p.code;
  }
}
function dimNote(key, n) {
  const notes = {
    erfolg: ['Die Aufgabe ist nicht gelöst.', 'Die Aufgabe ist nur in Teilen gelöst.', 'Fast gelöst – ein Detail stimmt nicht.', 'Die Aufgabe ist gelöst.'],
    effizienz: ['Viele unnötige Schritte.', 'Mehrere unnötige Schritte.', 'Ein Schritt zu viel.', 'Kein Schritt zu viel.'],
    sicherheit: ['Eine riskante Aktion lief ohne gültige Freigabe.', 'Eine Aktion nach außen war nicht beauftragt.', '', 'Alles Riskante war freigegeben – oder es gab nichts Riskantes.']
  };
  return notes[key][n] || '';
}

function nextLabel() {
  const m = state.mission;
  if (state.stage < m.stufen.length - 1) return `Weiter zu Stufe ${state.stage + 2}`;
  return (state.session.count + 1) % BLOCK_SIZE === 0 ? 'Mission abschließen & Zwischenbilanz' : 'Mission abschließen & nächste Mission';
}

function renderEvaluation() {
  const box = document.getElementById('evaluation');
  if (!box) return;
  const res = state.result;
  if (!res) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  const m = state.mission;
  const stage = m.stufen[state.stage];
  const fehlerTexte = res.fehler.map((i) => stage.typischeFehler[i].text);
  const probleme = res.probleme;
  const multi = m.stufen.length > 1;

  fill(box,
    h('h2', { id: 'eval-heading', tabindex: '-1' }, multi ? `Auswertung – Stufe ${state.stage + 1}` : 'Auswertung'),
    h('ul', { class: 'dims' }, DIMS.map((d) => h('li', { class: `dim dim-${res.sterne[d.key]}` },
      h('div', { class: 'dim-head' },
        h('strong', {}, d.label),
        stars(res.sterne[d.key]),
        h('span', { class: 'dim-score' }, `${res.sterne[d.key]} von 3 Sternen`)),
      h('p', { class: 'dim-q' }, d.frage, ' ', h('span', { class: 'dim-note' }, dimNote(d.key, res.sterne[d.key])))))),
    res.perfekt
      ? h('p', { class: 'callout callout-good' }, icon('check'), h('span', {}, h('strong', {}, 'Perfekt geplant. '), 'Genau die nötigen Schritte, in der richtigen Reihenfolge, mit Freigabe wo nötig.'))
      : h('div', { class: 'callout callout-bad' },
        h('h3', {}, icon('warn'), 'Was nicht gepasst hat'),
        fehlerTexte.length ? h('ul', { class: 'fehler-list' }, fehlerTexte.map((t) => h('li', {}, t))) : null,
        fehlerTexte.length && probleme.length ? h('h4', { class: 'problem-head' }, 'Alle Befunde im Einzelnen') : null,
        probleme.length ? h('ul', { class: 'problem-list' }, probleme.map((p) => h('li', {}, problemText(p)))) : null),
    h('section', { class: 'debrief', 'aria-labelledby': 'debrief-h' },
      h('h3', { id: 'debrief-h' }, 'Nachbesprechung'),
      h('p', {}, stage.debrief),
      h('p', { class: 'example-label' }, 'Eine gute Kette:'),
      stage.beispiel.length
        ? h('ol', { class: 'example' }, stage.beispiel.map((id) => h('li', {}, toolIcon(id, 'tool-icon small'), toolName(id))))
        : h('p', { class: 'example-none' }, 'Keine Werkzeuge – der Agent antwortet direkt.'),
      state.stage === m.stufen.length - 1 ? h('p', { class: 'hint' }, `Missionstyp: ${TYPEN[m.typ]} · Thema: ${THEMEN[m.thema]}`) : null),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'next-btn', onclick: goNext }, nextLabel(), icon('arrow')),
      h('button', {
        type: 'button', class: 'btn', onclick: () => {
          resetStage(true);
          renderGame();
          focusEl(document.getElementById('chain-heading'));
          announce('Neuer Versuch. Die Kette ist wieder bearbeitbar.');
        }
      }, icon('retry'), 'Diese Stufe nochmal versuchen'))
  );
}

function finalizeMission() {
  const m = state.mission;
  const sterne = combineStars(state.stageResults.map((r) => r.sterne));
  const st = state.stats;
  st.missionsPlayed++;
  st.totals.erfolg += sterne.erfolg;
  st.totals.effizienz += sterne.effizienz;
  st.totals.sicherheit += sterne.sicherheit;
  const perfect = sterne.erfolg === 3 && sterne.effizienz === 3 && sterne.sicherheit === 3;
  if (perfect) st.perfectMissions++;
  const sum = (x) => x.erfolg + x.effizienz + x.sicherheit;
  if (!st.best[m.id] || sum(sterne) > sum(st.best[m.id])) st.best[m.id] = sterne;
  store.saveStats(st);
  state.session.count++;
  state.session.block.push({ id: m.id, titel: m.titel, typ: m.typ, sterne });
}

function goNext() {
  const m = state.mission;
  if (state.stage < m.stufen.length - 1) {
    state.stage++;
    resetStage();
    state.speech = `Stufe ${state.stage + 1}: Das Ergebnis der letzten Stufe liegt jetzt als Material vor.`;
    renderGame();
    focusEl(document.getElementById('mission-heading'));
    announce(`Stufe ${state.stage + 1} von ${m.stufen.length}.`);
    return;
  }
  finalizeMission();
  if (state.session.count % BLOCK_SIZE === 0) {
    state.reflection = { index: Math.floor(Math.random() * REFLECTIONS.length), text: '' };
    renderSummary();
    focusEl(document.getElementById('summary-heading'));
    return;
  }
  if (!pickNextMission()) { renderStart(); return; }
  renderGame();
  focusEl(document.getElementById('mission-heading'));
  if (state.session.poolRestarted) announce('Alle passenden Missionen gespielt – der Pool beginnt von vorn.');
}

function renderGame() {
  state.screen = 'game';
  updateHud();
  const m = state.mission;
  const stage = m.stufen[state.stage];
  setMain(
    h('div', { class: 'game-top' },
      h('div', {},
        h('h1', { id: 'mission-heading', class: 'mission-title', tabindex: '-1' }, m.titel),
        h('p', { class: 'mission-meta' },
          h('span', { class: `chip chip-${m.schwierigkeit}` }, DIFFS[m.schwierigkeit]),
          h('span', { class: 'chip' }, THEMEN[m.thema]),
          h('span', { class: 'mission-id' }, `ID ${m.id}`))),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { renderStart(); focusEl(document.getElementById('start-heading')); } }, icon('home'), 'Zur Startseite')),
    state.session.poolRestarted && state.stage === 0 && !state.result ? h('p', { class: 'note' }, 'Du hast alle passenden Missionen gespielt – der Pool beginnt von vorn.') : null,
    missionHeader(),
    h('div', { class: 'game-grid' },
      h('section', { class: 'card brief', 'aria-labelledby': 'brief-h' },
        h('h2', { id: 'brief-h' }, 'Auftrag'),
        h('p', { class: 'auftrag' }, stage.auftrag),
        h('h3', { class: 'material-h' }, 'Material, das dem Agenten vorliegt'),
        materialList()),
      h('section', { class: 'card plan', id: 'plan', 'aria-label': 'Plan des Agenten' }),
      h('section', { class: 'card agent', id: 'agent', 'aria-labelledby': 'agent-heading' }),
      h('section', { class: 'card evaluation', id: 'evaluation', 'aria-labelledby': 'eval-heading', hidden: true }))
  );
  renderPlan();
  renderAgent();
  renderEvaluation();
}

/* ---------------- Zwischenbilanz ---------------- */

function renderSummary() {
  state.screen = 'summary';
  updateHud();
  const block = state.session.block;
  const totals = { erfolg: 0, effizienz: 0, sicherheit: 0 };
  block.forEach((b) => DIMS.forEach((d) => { totals[d.key] += b.sterne[d.key]; }));
  const max = block.length * 3;
  const weakest = [...DIMS].sort((a, b) => totals[a.key] - totals[b.key])[0];
  const allFull = DIMS.every((d) => totals[d.key] === max);
  const tips = {
    erfolg: 'Achte darauf, was dem Agenten wirklich fehlt: Steht die Information im Material? Muss exakt gerechnet werden?',
    effizienz: 'Frag dich bei jedem Schritt: Was weiß der Agent danach, was er vorher nicht wusste? Wenn nichts – weglassen.',
    sicherheit: 'Alles, was nach außen wirkt (Senden, Buchen, Löschen), braucht vorher eine menschliche Freigabe – und danach keine Änderungen mehr.'
  };
  const textarea = h('textarea', {
    id: 'reflection', rows: '4', placeholder: 'Notiere hier deine Gedanken …', 'aria-describedby': 'reflect-note',
    oninput: (e) => { state.reflection.text = e.target.value; }
  });
  textarea.value = state.reflection.text;

  setMain(h('section', { class: 'card summary', 'aria-labelledby': 'summary-heading' },
    h('div', { class: 'summary-top' },
      h('div', { html: mascotSVG(allFull ? 'freut' : 'neutral', 88) }),
      h('div', {},
        h('h1', { id: 'summary-heading', tabindex: '-1' }, 'Zwischenbilanz'),
        h('p', { class: 'lead' }, `Deine letzten ${block.length} Missionen im Überblick.`))),
    h('ul', { class: 'dims dims-summary' }, DIMS.map((d) => h('li', { class: 'dim' },
      h('div', { class: 'dim-head' }, h('strong', {}, d.label), h('span', { class: 'dim-score' }, `${totals[d.key]} von ${max} Sternen`)),
      h('div', { class: 'bar', role: 'presentation' }, h('span', { style: `width:${max ? Math.round(totals[d.key] / max * 100) : 0}%` }))))),
    h('p', { class: 'callout' }, icon('info'), h('span', {},
      allFull ? h('strong', {}, 'Alles volle Sterne – stark! ') : h('strong', {}, `Am meisten Luft nach oben: ${weakest.label}. `),
      allFull ? 'Achte weiter darauf, nur so viel zu tun wie nötig.' : tips[weakest.key])),
    h('table', { class: 'summary-table' },
      h('caption', { class: 'sr-only' }, 'Sterne je Mission'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mission'), DIMS.map((d) => h('th', { scope: 'col' }, d.label)))),
      h('tbody', {}, block.map((b) => h('tr', {},
        h('th', { scope: 'row' }, b.titel, h('span', { class: 'table-type' }, TYPEN[b.typ])),
        DIMS.map((d) => h('td', {}, stars(b.sterne[d.key]), h('span', { class: 'sr-only' }, `${b.sterne[d.key]} von 3`))))))),
    h('div', { class: 'reflect' },
      h('h2', {}, 'Zum Nachdenken'),
      h('label', { for: 'reflection', class: 'reflect-q' }, REFLECTIONS[state.reflection.index]),
      textarea,
      h('p', { class: 'hint', id: 'reflect-note' }, 'Deine Antwort wird nicht gespeichert. Sie ist nur für dich – oder für das Gespräch in der Lehrveranstaltung.')),
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn btn-primary', onclick: () => {
          state.session.block = [];
          if (!pickNextMission()) { renderStart(); return; }
          renderGame();
          focusEl(document.getElementById('mission-heading'));
        }
      }, 'Weiter mit nächster Mission', icon('arrow')),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { state.session.block = []; state.mission = null; renderStart(); focusEl(document.getElementById('start-heading')); } }, icon('home'), 'Zur Startseite'))
  ));
}

/* ---------------- Start ---------------- */

async function init() {
  setMain(h('p', { class: 'loading' }, 'Lade Missionen …'));
  try {
    const [tRes, mRes] = await Promise.all([fetch('data/tools.json'), fetch('data/missions.json')]);
    if (!tRes.ok || !mRes.ok) throw new Error('HTTP');
    state.tools = await tRes.json();
    state.missions = await mRes.json();
  } catch {
    setMain(h('p', { class: 'form-error' }, 'Die Spieldaten konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen (siehe README).'));
    return;
  }
  state.tools.forEach((t) => state.toolById.set(t.id, t));
  state.highRisk = state.tools.filter((t) => t.risiko === 'hoch').map((t) => t.id);
  renderStart();
}

init();
