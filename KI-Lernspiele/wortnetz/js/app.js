// Wortnetz – Steuerung der Bildschirme: Start, Laden, Spiel, Spielende.
import { WordVectors } from './wordvectors.js';
import { checkHint, topSurprises } from './ranking.js';
import * as store from './store.js';
import { h, setMain, announce, focusEl, Deck, rankingPanel } from './ui.js';
import { BlocksGame } from './mode-blocks.js';
import { ArcadeGame } from './mode-arcade.js';

const MODES = {
  blocks: { name: 'Blöcke', kurz: 'Ohne Zeitdruck', text: 'Ein Raster aus farbigen Wortblöcken. Dein Hinweis trifft den ähnlichsten Block – und alle angrenzenden Blöcke gleicher Farbe verschwinden mit.' },
  arcade: { name: 'Arcade', kurz: 'Unter Zeitdruck', text: 'Eine Wortliste mit einem Zielwort. Dein Hinweis sortiert die Liste – landet das Ziel ganz unten in der Trefferzone, verschwindet es. Von oben rücken ständig neue Wörter nach.' }
};

const REFLECTIONS = [
  'Bei welchem Hinweis hat das Modell anders assoziiert als du? Woran könnte das liegen?',
  'Welche Art von Hinweisen hat besonders gut funktioniert – Oberbegriffe, Eigenschaften, Tätigkeiten oder Gegenteile?',
  'Das Modell hat Bedeutung nur aus Texten gelernt. Welche Verbindung, die für dich selbstverständlich ist, kennt es vielleicht gar nicht?'
];

const state = {
  pools: [],
  mode: 'blocks',
  pool: 'gemischt',
  embedder: new WordVectors(),
  game: null,
  busy: false,
  metrics: { loadMs: null, device: null, poolEmbedMs: {}, moveMs: [] }
};
window.wortnetzMetrics = state.metrics; // für eigene Messungen in der Konsole

const poolById = (id) => state.pools.find((p) => p.id === id);

/* ----------------------------------------------------------------- Start */

function renderStart() {
  leaveGame();
  document.body.classList.remove('in-game');
  const prefs = store.loadPrefs();
  if (prefs.mode && MODES[prefs.mode]) state.mode = prefs.mode;
  if (prefs.pool && poolById(prefs.pool)) state.pool = prefs.pool;

  const cacheNote = h('p', { class: 'muted small', id: 'cache-note' },
    state.embedder.ready
      ? 'Das KI-Modell ist bereit.'
      : 'Nach dem Start wird kurz das KI-Modell geladen.');

  const modeFs = h('fieldset', { class: 'choice' },
    h('legend', {}, '1. Modus'),
    Object.entries(MODES).map(([id, m]) => h('label', { class: 'choice-card' },
      h('input', { type: 'radio', name: 'mode', value: id, checked: state.mode === id, onchange: () => { state.mode = id; renderScores(); } }),
      h('span', { class: 'choice-body' },
        h('span', { class: 'choice-title' }, m.name, h('span', { class: 'choice-kurz' }, m.kurz)),
        h('span', { class: 'choice-text' }, m.text)))));

  const poolFs = h('fieldset', { class: 'choice' },
    h('legend', {}, '2. Wortpool'),
    h('div', { class: 'pool-grid' }, state.pools.map((p) => h('label', { class: 'choice-card choice-small' },
      h('input', { type: 'radio', name: 'pool', value: p.id, checked: state.pool === p.id, onchange: () => { state.pool = p.id; renderScores(); } }),
      h('span', { class: 'choice-body' },
        h('span', { class: 'choice-title' }, p.name),
        h('span', { class: 'choice-text' }, `${p.beschreibung} ${p.words.length} Wörter.`))))));

  const scoreBox = h('section', { class: 'card', 'aria-labelledby': 'scores-h' });
  function renderScores() {
    const rows = state.pools.map((p) => h('tr', {},
      h('th', { scope: 'row' }, p.name),
      Object.keys(MODES).map((m) => h('td', { class: m === state.mode && p.id === state.pool ? 'is-current' : null }, String(store.getHighscore(m, p.id) || '–')))));
    scoreBox.replaceChildren(
      h('h2', { id: 'scores-h' }, 'Bestwerte'),
      h('table', { class: 'scores' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Pool'), Object.values(MODES).map((m) => h('th', { scope: 'col' }, m.name)))),
        h('tbody', {}, rows)),
      h('button', {
        type: 'button', class: 'btn btn-ghost small', onclick: () => {
          if (!window.confirm('Alle Bestwerte löschen?')) return;
          store.resetScores(); renderScores(); announce('Bestwerte gelöscht.');
        }
      }, 'Bestwerte zurücksetzen'));
  }
  renderScores();

  setMain(
    h('section', { class: 'intro' },
      h('h1', { id: 'start-h', tabindex: '-1' }, 'Wortnetz'),
      h('p', { class: 'lead' }, 'Ein KI-Modell ordnet Wörter danach, wie nah sie sich sind. Gib Hinweiswörter ein und finde heraus, wie gut deine Gedanken zu denen der KI passen – und wo sie auseinandergehen.'),
      h('p', { class: 'fiction-badge' }, 'Alle Spielinhalte sind frei erfunden. Die Rankings zeigen nur, wie das Modell rechnet – nicht, was richtig ist.')),
    exampleCard(),
    h('form', {
      class: 'card start-form', onsubmit: (e) => {
        e.preventDefault();
        store.savePrefs({ mode: state.mode, pool: state.pool });
        startGame();
      }
    },
    modeFs, poolFs,
    h('div', { class: 'rules' },
      h('h2', {}, 'Regeln für Hinweise'),
      h('ul', {},
        h('li', {}, 'Genau ein Wort, mindestens zwei Buchstaben.'),
        h('li', {}, 'Das Wort darf nicht im Spiel sein und keines der Wörter enthalten – „Katzen“ geht nicht, wenn „Katze“ im Spiel ist.'),
        h('li', {}, 'Enter schickt den Hinweis ab.'))),
    cacheNote,
    h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, 'Spiel starten ▶')),
    scoreBox,
    h('section', { class: 'card', 'aria-labelledby': 'tech-h' },
      h('h2', { id: 'tech-h' }, 'Was passiert hier?'),
      h('p', {}, 'Wortnetz nutzt deutsche Wortvektoren (fastText). Ein neuronales Netz hat sie aus Milliarden Wörtern von Webseiten gelernt: Wörter, die oft in ähnlichen Zusammenhängen stehen, bekommen ähnliche Vektoren aus 300 Zahlen. Je kleiner der Winkel zwischen zwei Vektoren, desto „näher“ sind sich die Wörter für das Modell.'),
      h('p', {}, 'Das Modell kennt rund 150.000 Wörter und rechnet komplett in deinem Browser – deine Hinweise verlassen das Gerät nicht.'),
      h('p', {}, 'Wichtig: Das Modell kennt keine Bedeutung, nur Sprachgebrauch. „Tropfen“ und „Regen“ stehen oft zusammen, „Gefahr“ und „Tiger“ eher selten – deshalb findet es manche Verbindungen, die für dich naheliegen, nicht.'),
      h('p', {}, 'Nach jedem Zug zeigt das Panel „So hat das Modell gerankt“ alle Ähnlichkeitswerte. Genau dort wird sichtbar, wo das Modell anders denkt als du.')));
  focusEl(document.getElementById('start-h'));
}

/** Statisches Beispiel mit echten Werten des Modells (Brett: Regen, Wüste, Kamera, Kaffee, Tiger, Rakete). */
const EXAMPLE = {
  board: ['Regen', 'Wüste', 'Kamera', 'Kaffee', 'Tiger', 'Rakete'],
  nass: [['Regen', 0.53], ['Wüste', 0.27], ['Kamera', 0.23], ['Kaffee', 0.22], ['Tiger', 0.15], ['Rakete', 0.13]],
  gefahr: [['Wüste', 0.24], ['Regen', 0.22], ['Rakete', 0.18]],
  raubkatze: [['Tiger', 0.57], ['Wüste', 0.34], ['Kamera', 0.30]]
};

function exampleCard() {
  const bars = (rows, mark) => {
    const max = rows[0][1];
    return h('ol', { class: 'rank-list ex-rank' }, rows.map(([w, v], i) => h('li', { class: `rank-row${w === mark ? ' is-marked' : ''}` },
      h('span', { class: 'rank-no' }, `${i + 1}.`),
      h('span', { class: 'rank-word' }, w, i === 0 ? h('span', { class: 'tag tag-hit' }, 'Treffer') : null),
      h('span', { class: 'rank-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round((v / max) * 100)}%` } })),
      h('span', { class: 'rank-val' }, v.toFixed(2).replace('.', ',')))));
  };
  const step = (n, text, ...body) => h('li', { class: 'ex-step' },
    h('p', { class: 'ex-step-text' }, h('span', { class: 'ex-no', 'aria-hidden': 'true' }, n), h('span', {}, h('span', { class: 'sr-only' }, `Schritt ${n}: `), text)),
    body.length ? h('div', { class: 'ex-body' }, body) : null);
  return h('section', { class: 'card how-example', 'aria-labelledby': 'ex-h' },
    h('h2', { id: 'ex-h' }, 'So geht’s – ein Beispiel'),
    h('ol', { class: 'ex-steps' },
      step('1', 'Auf dem Spielfeld liegen Wörter.',
        h('ul', { class: 'ex-board', 'aria-label': 'Beispiel-Spielfeld' }, EXAMPLE.board.map((w) => h('li', { class: `ex-chip${w === 'Regen' ? ' is-aim' : ''}` }, w)))),
      step('2', 'Du suchst dir ein Wort aus – hier „Regen“ – und tippst ein anderes Wort ein, das dazu passt: „nass“.',
        h('p', { class: 'ex-input' }, h('span', { class: 'muted' }, 'Hinweis: '), h('strong', {}, 'nass'))),
      step('3', 'Die KI sortiert alle Wörter danach, wie nah sie „nass“ sind. Je länger der Balken, desto näher.', bars(EXAMPLE.nass, 'Regen')),
      step('4', 'Das Wort auf Platz 1 wird getroffen und verschwindet. Hier hat es geklappt: „Regen“ lag vorn.'),
      step('5', 'Manchmal denkt die KI anders als du. „Gefahr“ trifft nicht „Tiger“, sondern „Wüste“ – mit „Raubkatze“ klappt es.',
        h('div', { class: 'ex-compare' },
          h('div', {}, h('p', { class: 'ex-label' }, 'Hinweis „Gefahr“'), bars(EXAMPLE.gefahr, 'Tiger')),
          h('div', {}, h('p', { class: 'ex-label' }, 'Hinweis „Raubkatze“'), bars(EXAMPLE.raubkatze, 'Tiger'))))),
    h('p', { class: 'muted small' }, 'Warum? Die KI hat aus Texten gelernt, welche Wörter oft gemeinsam vorkommen. „Raubkatze“ und „Tiger“ stehen oft zusammen, „Gefahr“ und „Tiger“ eher selten. Genau solche Unterschiede sollst du im Spiel entdecken.'));
}

/* ----------------------------------------------------------------- Laden */

async function ensureReady(pool) {
  const e = state.embedder;
  const needModel = !e.ready;
  const needWords = pool.words.some((w) => !e.vec(w));
  if (!needModel && !needWords) return true;

  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-labelledby': 'load-step' },
    h('span', { class: 'progress-fill', id: 'progress-fill' }));
  const step = h('p', { id: 'load-step', class: 'load-step' }, needModel ? 'Das Modell wird geladen …' : 'Wörter werden vorbereitet …');
  setMain(h('section', { class: 'card loading', 'aria-busy': 'true' },
    h('h1', { id: 'load-h', tabindex: '-1' }, 'Einen Moment …'),
    step, bar));
  focusEl(document.getElementById('load-h'));

  const setBar = (frac) => {
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    document.getElementById('progress-fill').style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  };

  try {
    if (needModel) {
      let lastAnnounce = 0;
      const info = await e.load((p) => {
        setBar(p.loaded / p.total);
        const pct = Math.floor((p.loaded / p.total) * 4);
        if (pct > lastAnnounce) { lastAnnounce = pct; announce(`${pct * 25} Prozent geladen.`); }
      });
      state.metrics.loadMs = info.ms;
      state.metrics.device = info.device;
    }
    step.textContent = 'Wörter werden vorbereitet …';
    setBar(0);
    const res = await e.embedWords(pool.words, (done, total) => setBar(done / total));
    if (res.count) state.metrics.poolEmbedMs[pool.id] = Math.round(res.ms);
    return true;
  } catch (err) {
    setMain(h('section', { class: 'card loading' },
      h('h1', { id: 'err-h', tabindex: '-1' }, 'Das Modell ließ sich nicht laden'),
      h('p', {}, 'Bitte prüfe die Verbindung und versuche es erneut. Läuft die Seite über einen Webserver? (Ein Doppelklick auf die HTML-Datei reicht nicht.)'),
      h('p', { class: 'muted small' }, `Technische Meldung: ${err.message}`),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startGame() }, 'Erneut versuchen'),
        h('button', { type: 'button', class: 'btn', onclick: renderStart }, 'Zur Startseite'))));
    focusEl(document.getElementById('err-h'));
    return false;
  }
}

/* ----------------------------------------------------------------- Spiel */

let dockObserver = null;

function leaveGame() {
  state.game?.destroy();
  state.game = null;
  window.visualViewport?.removeEventListener('resize', positionDock);
  window.visualViewport?.removeEventListener('scroll', positionDock);
  window.removeEventListener('resize', measureLayout);
  document.removeEventListener('keydown', onGlobalKey);
  document.body.classList.remove('kb-open');
  dockObserver?.disconnect();
  dockObserver = null;
}

/** Hält das Eingabe-Dock über der Bildschirmtastatur. */
function positionDock(e) {
  const vv = window.visualViewport;
  if (vv) {
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${offset}px`);
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    document.body.classList.toggle('kb-open', offset > 80);
  }
  // nur bei Größenänderung (Tastatur auf/zu) nachführen – beim Scrollen nicht, sonst kämpft es gegen die Hand
  if (!e || e.type === 'resize') keepBoardVisible();
}

/** Misst Dock und Kopfbereich, damit die Arcade-Liste genau zwischen beide passt. */
function measureLayout() {
  const dock = document.getElementById('dock');
  const board = document.getElementById('board');
  if (!dock || !board) return;
  const root = document.documentElement.style;
  root.setProperty('--dock-h', `${dock.offsetHeight}px`);
  const boardTop = board.getBoundingClientRect().top + window.scrollY;
  root.setProperty('--chrome', `${Math.round(boardTop + dock.offsetHeight + 28)}px`);
}

/** Scrollt so, dass die Unterkante des Spielfelds (dort liegt die Trefferzone) über dem Dock bleibt. */
function keepBoardVisible() {
  const dock = document.getElementById('dock');
  const board = document.getElementById('board');
  if (!dock || !board) return;
  const overlap = board.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 8;
  if (overlap > 0) window.scrollBy({ top: overlap, behavior: 'auto' });
}

function onGlobalKey(e) {
  const g = state.game;
  if (!g || g.over || !(g instanceof ArcadeGame)) return;
  if (e.key === 'Escape') { e.preventDefault(); g.togglePause(); }
}

async function startGame() {
  const pool = poolById(state.pool);
  if (!(await ensureReady(pool))) return;
  leaveGame();
  document.body.classList.add('in-game');

  const mode = MODES[state.mode];
  const isArcade = state.mode === 'arcade';
  const board = h('div', { class: `board board-${state.mode}`, id: 'board' });
  const scoreEl = h('span', { class: 'hud-val', id: 'score' }, '0');
  const fillEl = h('span', { class: 'hud-val', id: 'fill' }, '');
  const feedback = h('p', { class: 'feedback', id: 'feedback', role: 'status' });
  const goalEl = h('p', { class: 'goal', id: 'goal' });
  const input = h('input', {
    id: 'hint-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'send', maxlength: '40', 'aria-describedby': 'goal feedback', placeholder: 'Hinweiswort …'
  });
  const sendBtn = h('button', { type: 'submit', class: 'btn btn-primary', id: 'send-btn' }, 'Los');
  const pauseBtn = isArcade ? h('button', { type: 'button', class: 'btn btn-ghost', id: 'pause-btn', 'aria-pressed': 'false', onclick: () => state.game?.togglePause() }, '❚❚ Pause') : null;

  const form = h('form', {
    class: 'dock', id: 'dock', onsubmit: (e) => { e.preventDefault(); submitHint(); }
  },
  goalEl,
  h('div', { class: 'dock-row' },
    h('label', { for: 'hint-input', class: 'sr-only' }, 'Hinweiswort'),
    input, sendBtn),
  feedback);

  setMain(
    h('div', { class: 'game' },
      h('div', { class: 'hud' },
        h('h1', { class: 'hud-title', id: 'game-h', tabindex: '-1' }, mode.name, h('span', { class: 'hud-pool' }, ` · ${pool.name}`)),
        h('p', { class: 'hud-stats' },
          h('span', {}, 'Punkte ', scoreEl),
          h('span', {}, fillEl),
          h('span', { class: 'muted hud-record' }, `Rekord ${store.getHighscore(state.mode, pool.id) || '–'}`)),
        h('div', { class: 'hud-actions' },
          pauseBtn,
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { if (window.confirm('Runde beenden? Der Punktestand wird gewertet.')) finishGame('Runde beendet.'); } }, 'Beenden'))),
      isArcade ? h('div', { class: 'timer', 'aria-hidden': 'true' }, h('span', { class: 'timer-fill', id: 'timer-fill' })) : null,
      board,
      rankingPanel()),
    form);

  const ctx = {
    deck: new Deck(pool.words),
    vec: (w) => state.embedder.vec(w),
    board,
    announce,
    onScore: (score, fill) => { scoreEl.textContent = String(score); fillEl.textContent = fill; },
    onEnd: (reason) => finishGame(reason),
    setTarget: (w) => { goalEl.replaceChildren('Ziel: ', h('strong', { class: 'goal-word' }, `★ ${w}`), ' – bring es in die Trefferzone ganz unten.'); },
    setAim: (w) => {
      goalEl.replaceChildren(...(w
        ? ['Dein Ziel: ', h('strong', { class: 'goal-word' }, w), ' (optional markiert)']
        : ['Hinweis eingeben. ', h('span', { class: 'muted' }, 'Optional: vorher einen Block antippen, um dein Ziel zu markieren.')]));
    },
    setPaused: (p) => {
      input.disabled = p; sendBtn.disabled = p;
      if (pauseBtn) { pauseBtn.textContent = p ? '▶ Fortsetzen' : '❚❚ Pause'; pauseBtn.setAttribute('aria-pressed', String(p)); }
      if (!p) input.focus();
    }
  };
  state.game = isArcade ? new ArcadeGame(ctx) : new BlocksGame(ctx);
  state.game.start();
  if (!isArcade) ctx.setAim(null);

  window.visualViewport?.addEventListener('resize', positionDock);
  window.visualViewport?.addEventListener('scroll', positionDock);
  window.addEventListener('resize', measureLayout);
  document.addEventListener('keydown', onGlobalKey);
  if ('ResizeObserver' in window) {
    dockObserver = new ResizeObserver(() => measureLayout());
    dockObserver.observe(form);
  }
  window.scrollTo(0, 0);
  positionDock({ type: 'init' });
  measureLayout();
  positionDock();
  announce(isArcade
    ? `Arcade gestartet. Zielwort: ${state.game.target}. Neue Wörter kommen laufend dazu. Esc pausiert.`
    : 'Blöcke gestartet. Gib einen Hinweis ein – er trifft den ähnlichsten Block.');
  input.focus();
}

async function submitHint() {
  const g = state.game;
  if (!g || g.over || state.busy || g.paused) return;
  const input = document.getElementById('hint-input');
  const feedback = document.getElementById('feedback');
  const check = checkHint(input.value, g.words());
  if (!check.ok) {
    feedback.textContent = check.message;
    feedback.className = 'feedback is-error';
    input.setAttribute('aria-invalid', 'true');
    input.select();
    return;
  }
  input.removeAttribute('aria-invalid');
  state.busy = true;
  document.getElementById('send-btn').disabled = true;
  feedback.className = 'feedback';
  feedback.textContent = 'Das Modell rechnet …';
  try {
    const { vec, totalMs } = await state.embedder.embedHint(check.hint);
    if (state.game !== g || g.over) return;
    if (!vec) {
      feedback.textContent = `„${check.hint}“ kennt das Modell nicht. Versuch ein anderes, gebräuchlicheres Wort.`;
      feedback.className = 'feedback is-error';
      input.setAttribute('aria-invalid', 'true');
      input.select();
      return;
    }
    state.metrics.moveMs.push(Math.round(totalMs));
    input.value = '';
    const res = await g.play(check.hint, vec, totalMs);
    feedback.textContent = res.message;
    announce(res.message);
    if (res.over) finishGame(null);
    else keepBoardVisible();
  } catch (err) {
    feedback.textContent = `Das hat nicht geklappt: ${err.message}`;
    feedback.className = 'feedback is-error';
  } finally {
    state.busy = false;
    const btn = document.getElementById('send-btn');
    if (btn && !g.paused) btn.disabled = false;
    if (state.game === g && !g.over) document.getElementById('hint-input')?.focus();
  }
}

/* ----------------------------------------------------------------- Ende */

function finishGame(reason) {
  const g = state.game;
  if (!g || g.finished) return;
  g.finished = true;
  g.over = true;
  g.destroy();
  const res = g.result();
  const pool = poolById(state.pool);
  const isRecord = res.score > 0 && store.submitScore(state.mode, pool.id, res.score);
  const surprises = topSurprises(res.moves);
  const avgMs = res.moves.length ? Math.round(res.moves.reduce((a, m) => a + m.ms, 0) / res.moves.length) : null;
  const question = REFLECTIONS[Math.floor(Math.random() * REFLECTIONS.length)];
  document.body.classList.remove('in-game');
  leaveGame();

  setMain(h('section', { class: 'card end', 'aria-labelledby': 'end-h' },
    h('h1', { id: 'end-h', tabindex: '-1' }, 'Spiel vorbei'),
    reason ? h('p', { class: 'muted' }, reason) : h('p', { class: 'muted' }, state.mode === 'blocks' ? 'Der Stapel hat die Oberkante erreicht.' : ''),
    h('p', { class: 'end-score' }, h('span', { class: 'big' }, String(res.score)), ' Punkte', isRecord ? h('span', { class: 'tag tag-hit' }, 'Neuer Rekord!') : null),
    h('ul', { class: 'end-stats' },
      h('li', {}, `${res.moves.length} Hinweise`),
      res.extra.map((x) => h('li', {}, x)),
      avgMs !== null ? h('li', {}, `Ø ${avgMs} ms Rechenzeit pro Zug`) : null),
    h('section', { class: 'surprises', 'aria-labelledby': 'sur-h' },
      h('h2', { id: 'sur-h' }, 'Die überraschendsten Züge'),
      surprises.length
        ? h('ol', {}, surprises.map((m) => h('li', {},
          h('strong', {}, `„${m.hint}“`), ' – gemeint war ', h('strong', {}, m.intended),
          `. Das Modell setzte es auf Platz ${m.rank}; am ähnlichsten fand es „${m.top}“.`)))
        : h('p', { class: 'muted' }, !res.moves.length
          ? 'In dieser Runde gab es keinen Hinweis – also auch nichts zu vergleichen.'
          : state.mode === 'blocks' && !res.moves.some((m) => m.intended)
            ? 'Keine Überraschungen erfasst. Tipp: Tippe vor dem Hinweis einen Block an, um dein Ziel zu markieren – dann sieht das Spiel, wo das Modell anders rankt als du.'
            : 'Das Modell hat jedes gemeinte Wort auf Platz 1 gesetzt – ihr wart euch einig!')),
    h('section', { class: 'reflect', 'aria-labelledby': 'ref-h' },
      h('h2', { id: 'ref-h' }, 'Zum Nachdenken'),
      h('label', { for: 'reflection' }, question),
      h('textarea', { id: 'reflection', rows: '4', 'aria-describedby': 'ref-note' }),
      h('p', { class: 'muted small', id: 'ref-note' }, 'Deine Notiz wird nicht gespeichert – sie ist für dich oder das Gespräch im Seminar.')),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startGame() }, 'Nochmal spielen'),
      h('button', { type: 'button', class: 'btn', onclick: renderStart }, 'Modus oder Pool wechseln'))));
  focusEl(document.getElementById('end-h'));
  announce(`Spiel vorbei. ${res.score} Punkte${isRecord ? ', neuer Rekord' : ''}.`);
}

/* ----------------------------------------------------------------- Init */

async function init() {
  try {
    const res = await fetch('data/wordlists.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.pools = (await res.json()).pools;
    renderStart();
  } catch (err) {
    setMain(h('section', { class: 'card' },
      h('h1', {}, 'Wortlisten fehlen'),
      h('p', {}, 'Die Datei data/wordlists.json konnte nicht geladen werden. Läuft die Seite über einen Webserver? (Ein Doppelklick auf die HTML-Datei reicht nicht.)'),
      h('p', { class: 'muted small' }, err.message)));
  }
}

init();
