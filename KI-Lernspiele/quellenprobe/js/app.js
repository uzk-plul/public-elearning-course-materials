// Quellenprobe – Spiellogik und Darstellung (Vanilla JS, ES-Module)
import { STRINGS, REFLECTIONS } from './i18n.js';
import * as store from './store.js';

const main = document.getElementById('main');
const live = document.getElementById('live');
const hud = document.getElementById('hud');
const BLOCK_SIZE = 5;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  lang: 'de',
  patterns: [],
  patternById: new Map(),
  levels: [],
  filter: { diff: 'alle', patterns: new Set() },
  stats: store.loadStats(),
  session: { score: 0, streak: 0, count: 0, played: new Set(), block: [], poolRestarted: false },
  screen: 'loading',
  level: null,
  selected: new Set(),
  result: null,
  activeBeleg: null,
  srcCollapsed: false,
  mobileTab: 'quelle',
  reflection: { question: '', text: '' }
};

/* ---------------- Hilfsfunktionen ---------------- */

function t(key, vars = {}) {
  const dict = STRINGS[state.lang] || STRINGS.de;
  const raw = dict[key] ?? STRINGS.de[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const L = (obj) => (obj && typeof obj === 'object' ? obj[state.lang] ?? obj.de : obj);
const themeName = (id) => (STRINGS[state.lang] || STRINGS.de).themen[id] || id;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

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

const ICONS = {
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'
};
function icon(name, cls = 'icon') {
  return h('span', {
    class: cls,
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  });
}

// replaceChildren() würde null/undefined als Text „null“ einfügen – daher filtern
function setMain(...nodes) {
  main.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false));
}

function announce(msg) {
  // Leeren und neu setzen, damit Screenreader auch gleiche Texte erneut vorlesen
  live.textContent = '';
  window.setTimeout(() => { live.textContent = msg; }, 50);
}

function focusEl(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/* ---------------- Statische Texte / Sprache ---------------- */

function applyStatic() {
  document.documentElement.lang = state.lang;
  document.title = t('pageTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
}

/* ---------------- Level-Auswahl ---------------- */

function pool() {
  return state.levels.filter((l) =>
    (state.filter.diff === 'alle' || l.schwierigkeit === state.filter.diff) &&
    l.aussagen.some((a) => a.halluzination && state.filter.patterns.has(a.muster))
  );
}

function pickNextLevel() {
  const p = pool();
  if (!p.length) return false;
  const s = state.session;
  let candidates = p.filter((l) => !s.played.has(l.id));
  s.poolRestarted = false;
  if (!candidates.length) {
    p.forEach((l) => s.played.delete(l.id));
    candidates = p.filter((l) => l.id !== state.level?.id);
    if (!candidates.length) candidates = p;
    s.poolRestarted = true;
  }
  const lvl = candidates[Math.floor(Math.random() * candidates.length)];
  s.played.add(lvl.id);
  state.level = lvl;
  state.selected = new Set();
  state.result = null;
  state.activeBeleg = null;
  state.srcCollapsed = false;
  state.mobileTab = 'quelle';
  return true;
}

function locateBeleg(lvl, beleg) {
  for (let i = 0; i < lvl.quellen.length; i++) {
    const start = lvl.quellen[i].text.indexOf(beleg);
    if (start >= 0) return { src: i, start, end: start + beleg.length };
  }
  return null;
}

/* ---------------- HUD ---------------- */

function updateHud() {
  if (state.screen !== 'game') { hud.hidden = true; return; }
  hud.hidden = false;
  const s = state.session;
  const levelNo = state.result ? s.count : s.count + 1;
  hud.replaceChildren(
    h('span', { class: 'hud-item' }, h('span', { class: 'hud-label' }, t('hudScore')), ' ', h('strong', {}, s.score)),
    h('span', { class: 'hud-item' }, h('span', { class: 'hud-label' }, t('hudStreak')), ' ', h('strong', {}, s.streak)),
    h('span', { class: 'hud-item' }, h('span', { class: 'hud-label' }, t('hudLevel')), ' ', h('strong', {}, levelNo))
  );
}

/* ---------------- Startbildschirm ---------------- */

function renderStart() {
  state.screen = 'start';
  updateHud();
  const st = state.stats;

  const poolInfo = h('p', { class: 'pool-info', id: 'pool-info', 'aria-live': 'polite' });
  const startError = h('p', { class: 'form-error', id: 'start-error', role: 'alert' });
  const refreshPool = () => {
    startError.textContent = '';
    if (!state.filter.patterns.size) { poolInfo.textContent = t('noPattern'); return; }
    const n = pool().length;
    poolInfo.textContent = n ? t('poolInfo', { n }) : t('poolEmpty');
  };

  const diffs = ['alle', 'leicht', 'mittel', 'schwer'];
  const diffFieldset = h('fieldset', { class: 'fieldset' },
    h('legend', {}, t('diffLegend')),
    h('div', { class: 'radio-row' },
      diffs.map((d) => h('label', { class: 'pill' },
        h('input', {
          type: 'radio', name: 'diff', value: d, checked: state.filter.diff === d,
          onchange: () => { state.filter.diff = d; refreshPool(); }
        }),
        h('span', {}, d === 'alle' ? t('diffAll') : t(d))
      ))
    )
  );

  const patternBoxes = state.patterns.map((p) => h('input', {
    type: 'checkbox', value: p.id, id: `pf-${p.id}`, checked: state.filter.patterns.has(p.id),
    onchange: (e) => {
      if (e.target.checked) state.filter.patterns.add(p.id); else state.filter.patterns.delete(p.id);
      refreshPool();
    }
  }));
  const setAll = (on) => {
    state.filter.patterns = new Set(on ? state.patterns.map((p) => p.id) : []);
    patternBoxes.forEach((b) => { b.checked = on; });
    refreshPool();
  };
  const patternFieldset = h('fieldset', { class: 'fieldset' },
    h('legend', {}, t('patternLegend')),
    h('p', { class: 'hint', id: 'pattern-hint' }, t('patternHint')),
    h('div', { class: 'btn-row btn-row-tight' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => setAll(true) }, t('selectAll')),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => setAll(false) }, t('selectNone'))
    ),
    h('ul', { class: 'check-grid', 'aria-describedby': 'pattern-hint' },
      state.patterns.map((p, i) => h('li', {},
        h('label', { class: 'check', for: `pf-${p.id}` }, patternBoxes[i], h('span', {}, L(p.name)))
      ))
    )
  );

  const resumable = state.level && !state.result && pool().some((l) => l.id === state.level.id);
  const startBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-large' },
    resumable || state.session.count ? t('resume') : t('start'), icon('arrow'));

  const form = h('form', {
    class: 'filter-form',
    onsubmit: (e) => {
      e.preventDefault();
      if (!state.filter.patterns.size) { startError.textContent = t('noPattern'); return; }
      if (!pool().length) { startError.textContent = t('poolEmpty'); return; }
      const keep = state.level && !state.result && pool().some((l) => l.id === state.level.id);
      if (!keep) pickNextLevel();
      renderGame();
      focusEl(document.getElementById('level-heading'));
    }
  }, diffFieldset, patternFieldset, poolInfo, startError, h('div', { class: 'btn-row' }, startBtn));

  const patternList = h('ul', { class: 'pattern-list' },
    state.patterns.map((p, i) => {
      const ps = st.patterns[p.id];
      return h('li', { class: 'pattern-item' },
        h('h3', { class: 'pattern-name' }, h('span', { class: 'pattern-no', 'aria-hidden': 'true' }, i + 1), L(p.name)),
        h('p', {}, L(p.kurzbeschreibung)),
        h('p', { class: 'tip' }, h('strong', {}, `${t('tipLabel')}: `), L(p.prueftipp)),
        h('p', { class: 'pattern-stat' }, ps ? t('yourStats', { found: ps.found, missed: ps.missed }) : t('noStatsYet'))
      );
    })
  );

  const resetBtn = h('button', {
    type: 'button', class: 'btn btn-danger',
    onclick: () => {
      if (!window.confirm(t('resetConfirm'))) return;
      state.stats = store.resetStats();
      state.session = { score: 0, streak: 0, count: 0, played: new Set(), block: [], poolRestarted: false };
      state.level = null; state.result = null;
      renderStart();
      announce(t('resetDone'));
      document.getElementById('reset-btn')?.focus();
    },
    id: 'reset-btn'
  }, t('reset'));

  setMain(
    h('section', { class: 'intro' },
      h('h1', { id: 'start-heading' }, t('introTitle')),
      h('p', { class: 'lead' }, t('introLead')),
      h('p', { class: 'fiction-badge' }, t('fiction'))
    ),
    exampleCard(),
    h('div', { class: 'start-grid' },
      h('section', { class: 'card', 'aria-labelledby': 'filter-h' },
        h('h2', { id: 'filter-h' }, t('filterTitle')),
        form
      )
    ),
    h('section', { class: 'card', 'aria-labelledby': 'patterns-h' },
      h('h2', { id: 'patterns-h' }, t('patternsTitle')),
      h('details', { class: 'details' },
        h('summary', {}, icon('chevron', 'icon summary-icon'), t('patternsSummary')),
        patternList
      )
    ),
    h('section', { class: 'card', 'aria-labelledby': 'progress-h' },
      h('h2', { id: 'progress-h' }, t('progressTitle')),
      h('dl', { class: 'stats' },
        h('div', {}, h('dt', {}, t('statHighscore')), h('dd', {}, st.highscore)),
        h('div', {}, h('dt', {}, t('statBestStreak')), h('dd', {}, st.bestStreak)),
        h('div', {}, h('dt', {}, t('statLevels')), h('dd', {}, st.levelsPlayed)),
        h('div', {}, h('dt', {}, t('statFalse')), h('dd', {}, st.falseAlarms))
      ),
      store.storageAvailable() ? null : h('p', { class: 'note' }, t('storageOff')),
      h('div', { class: 'btn-row' }, resetBtn)
    )
  );
  refreshPool();
}

/** Statisches Beispiel auf der Startseite: Quelle → Antwort → Markieren → Auswerten. */
function exampleCard() {
  const step = (n, text, ...body) => h('li', { class: 'ex-step' },
    h('p', { class: 'ex-step-text' }, h('span', { class: 'step-no', 'aria-hidden': 'true' }, n), h('span', {}, h('span', { class: 'sr-only' }, `Schritt ${n}: `), text)),
    body.length ? h('div', { class: 'ex-body' }, body) : null);
  return h('section', { class: 'card how-example', 'aria-labelledby': 'how-h' },
    h('h2', { id: 'how-h' }, t('howTitle')),
    h('ol', { class: 'ex-steps' },
      step('1', t('exStep1'), h('article', { class: 'doc ex-doc' },
        h('p', { class: 'doc-type' }, t('exSourceType')), h('h3', { class: 'doc-title' }, t('exSourceTitle')), h('p', { class: 'doc-text' }, t('exSource')))),
      step('2', t('exStep2'), h('div', { class: 'question' }, h('p', { class: 'q-label' }, t('question')), h('p', { class: 'q-text' }, t('exQuestion'))),
        h('div', { class: 'ai-bubble' }, h('p', { class: 'ai-label' }, t('aiSays')),
          h('p', { class: 'ai-text' }, h('span', { class: 'sent' }, t('exAnswer1')), ' ', h('span', { class: 'sent' }, t('exAnswer2'))))),
      step('3', t('exStep3'), h('div', { class: 'ai-bubble' }, h('p', { class: 'ai-label' }, t('aiSays')),
        h('p', { class: 'ai-text' }, h('span', { class: 'sent' }, t('exAnswer1')), ' ',
          h('span', { class: 'sent is-marked' }, icon('flag', 'icon sent-flag'), t('exAnswer2'), h('span', { class: 'sr-only' }, ` (${t('exMarked')})`))))),
      step('4', t('exStep4'), h('p', { class: 'ex-result' }, icon('check', 'icon'), h('span', {}, t('exResult'))))
    ),
    h('p', { class: 'hint' }, t('scoring'))
  );
}

/* ---------------- Spielbildschirm ---------------- */

function renderSourceText(lvl, srcIndex) {
  const text = lvl.quellen[srcIndex].text;
  const marks = [];
  if (state.result) {
    for (const a of lvl.aussagen) {
      const active = state.activeBeleg === a.id;
      if (!a.halluzination && !active) continue;
      const loc = locateBeleg(lvl, a.beleg);
      if (!loc || loc.src !== srcIndex) continue;
      marks.push({ ...loc, id: a.id, kind: a.halluzination ? 'halluz' : 'support', active });
    }
  }
  const p = h('p', { class: 'doc-text' });
  if (!marks.length) { p.textContent = text; return p; }
  const cuts = new Set([0, text.length]);
  marks.forEach((m) => { cuts.add(m.start); cuts.add(m.end); });
  const pts = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i]; const e = pts[i + 1];
    const seg = text.slice(s, e);
    const cover = marks.filter((m) => m.start <= s && m.end >= e);
    if (!cover.length) { p.append(seg); continue; }
    const kind = cover.some((m) => m.kind === 'halluz') ? 'halluz' : 'support';
    const active = cover.some((m) => m.active);
    p.append(h('mark', { class: `mk mk-${kind}${active ? ' mk-active' : ''}`, 'data-for': cover.map((m) => m.id).join(' ') }, seg));
  }
  return p;
}

function buildSources() {
  const lvl = state.level;
  return lvl.quellen.map((q, i) => h('article', { class: 'doc', 'aria-labelledby': `doc-${i}` },
    h('p', { class: 'doc-type' }, q.typ),
    h('h3', { class: 'doc-title', id: `doc-${i}` }, q.titel),
    renderSourceText(lvl, i)
  ));
}

function refreshSources() {
  const body = document.getElementById('src-body');
  if (body) body.replaceChildren(...buildSources());
  const panel = document.getElementById('src-panel');
  const toggle = document.getElementById('src-toggle');
  if (panel) panel.classList.toggle('is-collapsed', state.srcCollapsed);
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!state.srcCollapsed));
    toggle.querySelector('.label').textContent = state.srcCollapsed ? t('sourceShow') : t('sourceHide');
  }
}

function showBeleg(id) {
  state.activeBeleg = id;
  state.srcCollapsed = false;
  setMobileTab('quelle', false);
  refreshSources();
  document.querySelectorAll('.show-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.for === id));
  const mark = document.querySelector('mark.mk-active');
  if (mark) {
    mark.setAttribute('tabindex', '-1');
    mark.focus({ preventScroll: true });
    mark.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }
}

function claimButton(a) {
  const pressed = state.selected.has(a.id);
  const stateLabel = h('span', { class: 'sr-only' }, pressed ? ` (${t('suspicious')})` : '');
  const btn = h('button', {
    type: 'button',
    class: `sent${pressed ? ' is-marked' : ''}`,
    'aria-pressed': String(pressed),
    'aria-describedby': 'mark-hint'
  },
  icon('flag', 'icon sent-flag'),
  h('span', { class: 'sent-text' }, a.text),
  stateLabel);
  btn.addEventListener('click', () => {
    const on = !state.selected.has(a.id);
    if (on) state.selected.add(a.id); else state.selected.delete(a.id);
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-marked', on);
    stateLabel.textContent = on ? ` (${t('suspicious')})` : '';
    const counter = document.getElementById('marked-count');
    if (counter) counter.textContent = t('markedCount', { n: state.selected.size });
    const tabCount = document.getElementById('tab-count');
    if (tabCount) tabCount.textContent = t('markedCount', { n: state.selected.size });
  });
  return btn;
}

const STATUS = {
  found: { cls: 'res-found', icon: 'check', label: 'resFound', sub: 'resFoundSub', pts: 2 },
  missed: { cls: 'res-missed', icon: 'alert', label: 'resMissed', sub: 'resMissedSub', pts: 0 },
  false: { cls: 'res-false', icon: 'x', label: 'resFalse', sub: 'resFalseSub', pts: -1 },
  ok: { cls: 'res-ok', icon: 'checkCircle', label: 'resOk', sub: 'resOkSub', pts: null }
};

function resultCard(a, status) {
  const cfg = STATUS[status];
  const lvl = state.level;
  const loc = locateBeleg(lvl, a.beleg);
  const srcTitle = loc ? lvl.quellen[loc.src].titel : '';
  const pattern = a.halluzination ? state.patternById.get(a.muster) : null;
  const ptsText = cfg.pts === null ? null : Math.abs(cfg.pts) === 1 ? t('point', { p: signed(cfg.pts) }) : t('points', { p: signed(cfg.pts) });

  return h('article', { class: `result ${cfg.cls}` },
    h('header', { class: 'result-head' },
      icon(cfg.icon, 'icon result-icon'),
      h('strong', { class: 'result-label' }, t(cfg.label)),
      ptsText ? h('span', { class: 'result-points' }, ptsText) : null
    ),
    h('p', { class: 'result-claim' }, a.text),
    h('p', { class: 'result-sub' }, t(cfg.sub)),
    pattern ? h('div', { class: 'pattern-box' },
      h('p', { class: 'pattern-tag' }, h('span', { class: 'pattern-tag-label' }, `${t('patternLabel')}: `), h('strong', {}, L(pattern.name))),
      h('p', {}, a.erklaerung),
      h('p', { class: 'tip' }, h('strong', {}, `${t('tipLabel')}: `), L(pattern.prueftipp))
    ) : (status === 'false' ? h('p', {}, a.erklaerung) : null),
    h('figure', { class: 'beleg' },
      h('figcaption', {}, `${a.halluzination ? t('decisive') : t('support')}${srcTitle ? ` · ${srcTitle}` : ''}`),
      h('blockquote', {}, `„${a.beleg}“`),
      h('button', {
        type: 'button',
        class: `btn btn-small show-btn${state.activeBeleg === a.id ? ' is-active' : ''}`,
        'data-for': a.id,
        onclick: () => showBeleg(a.id)
      }, icon('target'), t('showInSource'))
    )
  );
}

function renderGame() {
  state.screen = 'game';
  const lvl = state.level;
  const r = state.result;
  updateHud();

  const sourcePanel = h('section', {
    class: `panel panel-source${state.srcCollapsed ? ' is-collapsed' : ''}`, id: 'src-panel', 'aria-labelledby': 'src-h'
  },
  h('div', { class: 'panel-head' }, h('h2', { id: 'src-h' }, t('sourceTitle'))),
  h('div', { class: 'src-body', id: 'src-body' }, buildSources()),
  h('button', { type: 'button', class: 'btn btn-primary next-tab', onclick: () => setMobileTab('antwort', true) },
    r ? t('tabResult') : t('toAnswer'), icon('arrow')));

  let answerContent;
  if (!r) {
    answerContent = [
      h('div', { class: 'ai-bubble' },
        h('p', { class: 'ai-label' }, t('aiSays')),
        h('p', { class: 'ai-text' }, lvl.aussagen.flatMap((a, i) => [i ? ' ' : null, claimButton(a)]))),
      h('p', { class: 'hint', id: 'mark-hint' }, t('markHint')),
      h('div', { class: 'actions' },
        h('span', { class: 'marked-count', id: 'marked-count' }, t('markedCount', { n: state.selected.size })),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'evaluate-btn', onclick: evaluate }, t('evaluate'))
      )
    ];
  } else {
    const s = state.session;
    const goSummary = s.count % BLOCK_SIZE === 0 && s.block.length > 0;
    answerContent = [
      h('section', { class: `result-summary${r.perfect ? ' is-perfect' : ''}`, 'aria-labelledby': 'result-heading' },
        h('h3', { id: 'result-heading', tabindex: '-1' }, icon(r.perfect ? 'checkCircle' : 'target', 'icon'), t('resultTitle')),
        h('p', {}, t('resultLine', { found: r.found, total: r.total, fa: r.fa, delta: signed(r.delta) })),
        h('p', { class: 'streak-line' }, r.perfect ? t('perfect', { streak: s.streak }) : t('streakBroken')),
        r.newHigh ? h('p', { class: 'highscore-line' }, t('newHighscore', { score: state.stats.highscore })) : null,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', id: 'next-btn', onclick: goNext },
            goSummary ? t('toSummary') : t('next'), icon('arrow')))
      ),
      h('ol', { class: 'claims claims-result' }, lvl.aussagen.map((a) => h('li', {}, resultCard(a, r.status[a.id]))))
    ];
  }

  const answerPanel = h('section', { class: 'panel panel-answer', id: 'ans-panel', 'aria-labelledby': 'ans-h' },
    h('h2', { id: 'ans-h' }, t('answerTitle')),
    h('div', { class: 'question' },
      h('p', { class: 'q-label' }, t('question')),
      h('p', { class: 'q-text' }, lvl.frage)),
    r ? h('p', { class: 'ai-label' }, t('resultsPerSentence')) : null,
    answerContent
  );

  setMain(
    h('div', { class: 'game-top' },
      h('div', {},
        h('h1', { class: 'level-heading', id: 'level-heading', tabindex: '-1' },
          `${t('hudLevel')} ${r ? state.session.count : state.session.count + 1}`),
        h('p', { class: 'level-meta' },
          h('span', { class: 'chip' }, themeName(lvl.thema)),
          h('span', { class: `chip chip-${lvl.schwierigkeit}` }, t(lvl.schwierigkeit)),
          h('span', { class: 'level-id' }, `ID ${lvl.id}`))
      ),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: goHome }, icon('home'), t('home'))
    ),
    state.session.poolRestarted && !r ? h('p', { class: 'note' }, t('poolRestart')) : null,
    h('p', { class: 'fiction-badge' }, t('fiction')),
    mobileTabs(),
    h('div', { class: 'game-grid', id: 'game-grid', 'data-tab': state.mobileTab }, sourcePanel, answerPanel)
  );
}

/* Auf schmalen Bildschirmen: Quelle und Antwort als zwei Reiter statt untereinander */
function mobileTabs() {
  const tab = (id, label, extra) => h('button', {
    type: 'button', role: 'tab', id: `tab-${id}`, class: 'tab',
    'aria-selected': String(state.mobileTab === id), 'aria-controls': id === 'quelle' ? 'src-panel' : 'ans-panel',
    onclick: () => setMobileTab(id, true)
  }, h('span', {}, label), extra || null);
  const count = state.result ? null : h('span', { class: 'tab-count', id: 'tab-count' }, t('markedCount', { n: state.selected.size }));
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('tabsLabel') },
    tab('quelle', t('tabSource')),
    tab('antwort', state.result ? t('tabResult') : t('tabAnswer'), count));
}

function setMobileTab(id, scroll) {
  state.mobileTab = id;
  const grid = document.getElementById('game-grid');
  if (!grid) return;
  grid.dataset.tab = id;
  document.querySelectorAll('.tabs .tab').forEach((b) => b.setAttribute('aria-selected', String(b.id === `tab-${id}`)));
  const bar = document.querySelector('.tabs');
  if (scroll && bar && getComputedStyle(bar).display !== 'none' && grid.getBoundingClientRect().top < bar.offsetHeight) {
    window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 8, behavior: 'auto' });
  }
}

function evaluate() {
  const lvl = state.level;
  const s = state.session;
  const st = state.stats;
  const status = {};
  let found = 0; let missed = 0; let fa = 0; let total = 0;
  const blockItems = [];

  for (const a of lvl.aussagen) {
    const sel = state.selected.has(a.id);
    if (a.halluzination) {
      total++;
      status[a.id] = sel ? 'found' : 'missed';
      if (sel) found++; else missed++;
      blockItems.push({ muster: a.muster, found: sel });
      const ps = st.patterns[a.muster] || { found: 0, missed: 0 };
      if (sel) ps.found++; else ps.missed++;
      st.patterns[a.muster] = ps;
    } else {
      status[a.id] = sel ? 'false' : 'ok';
      if (sel) fa++;
    }
  }

  const delta = found * 2 - fa;
  const perfect = missed === 0 && fa === 0;
  s.score += delta;
  s.streak = perfect ? s.streak + 1 : 0;
  s.count++;
  s.block.push({ id: lvl.id, items: blockItems, fa, delta });

  st.levelsPlayed++;
  st.falseAlarms += fa;
  let newHigh = false;
  if (s.score > st.highscore) { st.highscore = s.score; newHigh = true; }
  if (s.streak > st.bestStreak) st.bestStreak = s.streak;
  store.saveStats(st);

  state.result = { status, found, missed, fa, total, delta, perfect, newHigh };
  const firstHallu = lvl.aussagen.find((a) => a.halluzination);
  state.activeBeleg = firstHallu ? firstHallu.id : null;
  state.srcCollapsed = false;
  state.mobileTab = 'antwort';

  renderGame();
  focusEl(document.getElementById('result-heading'));
  let msg = `${t('resultTitle')}: ${t('resultLine', { found, total, fa, delta: signed(delta) })} ${perfect ? t('perfect', { streak: s.streak }) : t('streakBroken')}`;
  if (newHigh) msg += ` ${t('newHighscore', { score: st.highscore })}`;
  announce(msg);
}

function goNext() {
  const s = state.session;
  if (s.count % BLOCK_SIZE === 0 && s.block.length > 0) {
    const qs = REFLECTIONS.de;
    state.reflection = { index: Math.floor(Math.random() * qs.length), text: '' };
    renderSummary();
    focusEl(document.getElementById('summary-heading'));
    return;
  }
  if (!pickNextLevel()) { goHome(); return; }
  renderGame();
  focusEl(document.getElementById('level-heading'));
  if (state.session.poolRestarted) announce(t('poolRestart'));
}

function goHome() {
  renderStart();
  focusEl(document.getElementById('start-heading'));
}

/* ---------------- Zwischenbilanz ---------------- */

function renderSummary() {
  state.screen = 'summary';
  updateHud();
  const block = state.session.block;
  const agg = new Map();
  let fa = 0; let pts = 0;
  for (const b of block) {
    fa += b.fa; pts += b.delta;
    for (const it of b.items) {
      const e = agg.get(it.muster) || { found: 0, total: 0 };
      e.total++; if (it.found) e.found++;
      agg.set(it.muster, e);
    }
  }
  const entries = [...agg.entries()].map(([id, e]) => ({ id, ...e, p: state.patternById.get(id) }));
  const good = entries.filter((e) => e.found === e.total).sort((a, b) => b.total - a.total);
  const missed = entries.filter((e) => e.found < e.total).sort((a, b) => (b.total - b.found) - (a.total - a.found));

  const list = (items, cls, iconName) => items.length
    ? h('ul', { class: `summary-list ${cls}` }, items.map((e) => h('li', {},
        icon(iconName, 'icon'),
        h('span', {}, h('strong', {}, L(e.p.name)), ' – ', t('foundOf', { found: e.found, total: e.total }),
          cls === 'is-missed' ? h('span', { class: 'tip-inline' }, h('br'), h('em', {}, `${t('tipLabel')}: `), L(e.p.prueftipp)) : null))))
    : h('p', { class: 'hint' }, t('none'));

  const qIndex = state.reflection.index ?? 0;
  const question = REFLECTIONS[state.lang][qIndex] || REFLECTIONS.de[qIndex];
  const textarea = h('textarea', {
    id: 'reflection', rows: '4', placeholder: t('reflectPlaceholder'), 'aria-describedby': 'reflect-note',
    oninput: (e) => { state.reflection.text = e.target.value; }
  });
  textarea.value = state.reflection.text || '';

  setMain(
    h('section', { class: 'card summary' , 'aria-labelledby': 'summary-heading' },
      h('h1', { id: 'summary-heading', tabindex: '-1' }, t('summaryTitle')),
      h('p', { class: 'lead' }, t('summaryLead', { n: block.length })),
      h('p', {}, t('summaryScore', { p: signed(pts) }), ' · ', t('summaryFalse', { n: fa })),
      h('div', { class: 'summary-grid' },
        h('div', {}, h('h2', {}, icon('checkCircle', 'icon icon-good'), t('goodTitle')), list(good, 'is-good', 'check')),
        h('div', {}, h('h2', {}, icon('alert', 'icon icon-bad'), t('missedTitle')), list(missed, 'is-missed', 'alert'))
      ),
      h('div', { class: 'reflect' },
        h('h2', {}, t('reflectTitle')),
        h('label', { for: 'reflection', class: 'reflect-q' }, question),
        textarea,
        h('p', { class: 'hint', id: 'reflect-note' }, t('reflectNote'))
      ),
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            state.session.block = [];
            if (!pickNextLevel()) { goHome(); return; }
            renderGame();
            focusEl(document.getElementById('level-heading'));
          }
        }, t('continue'), icon('arrow')),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { state.session.block = []; goHome(); } }, icon('home'), t('home'))
      )
    )
  );
}

/* ---------------- Start ---------------- */

async function init() {
  applyStatic();
  setMain(h('p', { class: 'loading' }, t('loading')));
  try {
    const [pRes, lRes] = await Promise.all([fetch('data/patterns.json'), fetch('data/levels.json')]);
    if (!pRes.ok || !lRes.ok) throw new Error('HTTP');
    state.patterns = await pRes.json();
    state.levels = await lRes.json();
  } catch {
    setMain(h('p', { class: 'form-error' }, t('loadError')));
    return;
  }
  state.patterns.forEach((p) => state.patternById.set(p.id, p));
  state.filter.patterns = new Set(state.patterns.map((p) => p.id));
  renderStart();
}

init();
