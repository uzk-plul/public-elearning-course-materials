// Modus „Blöcke“: ohne Zeitdruck. Jeder Hinweis trifft den ähnlichsten Block samt angrenzender Blöcke gleicher Farbe.
import { COLS, NARROW_COLS, ROWS, START_ROWS, emptyGrid, cells, findBlock, floodFill, removeAndCollapse, dropBlock, reachedTop, pickColumn, colorFor, twoBlockChance } from './blocks.js';
import { rankByHint, blockPoints } from './ranking.js';
import { h, flip, sleep, reducedMotion, fillRanking } from './ui.js';

export const COLOR_NAMES = ['Grün', 'Gelb', 'Pink', 'Blau'];
const SHAPES = ['●', '▲', '■', '◆'];

export class BlocksGame {
  constructor(ctx) {
    this.ctx = ctx;               // { deck, vec(word), board, onScore, onEnd, announce, setBusy }
    // Auf schmalen Bildschirmen 3 Spalten, damit lange Wörter auf einen Block passen
    this.cols = window.innerWidth < 480 ? NARROW_COLS : COLS;
    this.grid = emptyGrid(ROWS, this.cols);
    this.nextId = 1;
    this.aimId = null;
    this.focusId = null;
    this.score = 0;
    this.moves = [];
    this.over = false;
    this.fresh = new Set();
  }

  /** Neuer Block für Spalte c (die Farbe hängt von den künftigen Nachbarn ab). */
  newBlock(c) {
    const word = this.ctx.deck.draw(this.words());
    if (!word) return null;
    return { id: `b${this.nextId++}`, word, color: colorFor(this.grid, c) };
  }

  start() {
    for (let i = 0; i < START_ROWS; i++) {
      for (let c = 0; c < this.cols; c++) this.grid = dropBlock(this.grid, c, this.newBlock(c)).grid;
    }
    this.render();
  }

  words() {
    return cells(this.grid).map((x) => x.block.word);
  }

  hudText() {
    const n = cells(this.grid).length;
    return `${n} Blöcke`;
  }

  /* ----- Darstellung ----- */

  render() {
    const board = this.ctx.board;
    const all = cells(this.grid);
    if (!this.focusId || !findBlock(this.grid, this.focusId)) this.focusId = all[0]?.block.id ?? null;
    const grid = h('div', {
      class: 'blocks-grid', role: 'group',
      'aria-label': `Spielfeld mit ${all.length} Blöcken. Pfeiltasten wählen einen Block, Enter markiert ihn als dein Ziel (optional).`,
      style: { '--rows': ROWS, '--cols': this.cols },
      onkeydown: (e) => this.onKey(e)
    });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (!b) { grid.append(h('span', { class: `cell-empty${r === 0 ? ' is-top' : ''}`, 'aria-hidden': 'true' })); continue; }
        const aimed = b.id === this.aimId;
        grid.append(h('button', {
          type: 'button',
          class: `block c${b.color}${b.word.length > 12 ? ' len-l' : b.word.length > 9 ? ' len-m' : ''}${aimed ? ' is-aim' : ''}${this.fresh.has(b.id) ? ' is-new' : ''}`,
          'data-id': b.id,
          tabindex: b.id === this.focusId ? '0' : '-1',
          'aria-pressed': aimed ? 'true' : 'false',
          'aria-label': `${b.word}, ${COLOR_NAMES[b.color]}${aimed ? ', dein Ziel' : ''}`,
          lang: 'de',
          onclick: () => this.toggleAim(b.id),
          onfocus: () => { this.focusId = b.id; }
        }, h('span', { class: 'block-shape', 'aria-hidden': 'true' }, SHAPES[b.color]), h('span', { class: 'block-word' }, b.word)));
      }
    }
    const prev = board.querySelector('.blocks-grid');
    const hadFocus = prev?.contains(document.activeElement);
    if (prev) {
      flip(board, '.block', 'data-id', () => prev.replaceWith(grid));
    } else {
      board.replaceChildren(grid);
    }
    this.fresh.clear();
    if (hadFocus) grid.querySelector(`[data-id="${this.focusId}"]`)?.focus();
    this.ctx.onScore(this.score, this.hudText());
    this.ctx.setAim?.(this.aimId ? findBlock(this.grid, this.aimId) && this.blockWord(this.aimId) : null);
  }

  blockWord(id) {
    const p = findBlock(this.grid, id);
    return p ? this.grid[p.r][p.c].word : null;
  }

  toggleAim(id) {
    if (this.over) return;
    this.aimId = this.aimId === id ? null : id;
    this.focusId = id;
    this.render();
    const w = this.blockWord(id);
    this.ctx.announce(this.aimId ? `Ziel gesetzt: ${w}. Jetzt einen Hinweis eingeben.` : `Ziel ${w} aufgehoben.`);
  }

  onKey(e) {
    const keys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (!keys[e.key]) return;
    e.preventDefault();
    const pos = findBlock(this.grid, this.focusId);
    if (!pos) return;
    const [dy, dx] = keys[e.key];
    let r = pos.r + dy, c = pos.c + dx;
    while (r >= 0 && r < ROWS && c >= 0 && c < this.cols) {
      if (this.grid[r][c]) {
        this.focusId = this.grid[r][c].id;
        this.ctx.board.querySelectorAll('.block').forEach((el) => el.setAttribute('tabindex', el.dataset.id === this.focusId ? '0' : '-1'));
        this.ctx.board.querySelector(`[data-id="${this.focusId}"]`)?.focus();
        return;
      }
      r += dy; c += dx;
    }
  }

  /* ----- Spielzug ----- */

  async play(hint, hintVec, ms) {
    const items = cells(this.grid).map(({ block }) => ({ word: block.word, vec: this.ctx.vec(block.word) }));
    const ranked = rankByHint(hintVec, items);
    const top = ranked[0];
    const pos = cells(this.grid).find((x) => x.block.word === top.word);
    const region = floodFill(this.grid, pos.r, pos.c);
    const removedWords = region.map(([r, c]) => this.grid[r][c].word);
    const points = blockPoints(region.length);
    const aimedWord = this.aimId ? this.blockWord(this.aimId) : null;
    const aimedRank = aimedWord ? ranked.find((r) => r.word === aimedWord).rank : null;
    const aimRemoved = aimedWord ? removedWords.includes(aimedWord) : false;

    this.moves.push({
      hint, intended: aimedWord, rank: aimedRank, top: top.word,
      simGap: aimedWord ? top.sim - ranked.find((r) => r.word === aimedWord).sim : 0,
      ms, removed: region.length
    });
    this.score += points;

    const marks = {};
    removedWords.forEach((w) => { marks[w] = [{ label: w === top.word ? 'Treffer' : 'mit weg', kind: w === top.word ? 'hit' : 'gone' }]; });
    if (aimedWord) (marks[aimedWord] ||= []).push({ label: 'dein Ziel', kind: 'aim' });
    fillRanking({ hint, ranked, marks, ms });

    // Treffer hervorheben, dann entfernen
    region.forEach(([r, c]) => this.ctx.board.querySelector(`[data-id="${this.grid[r][c].id}"]`)?.classList.add('is-hit'));
    await sleep(reducedMotion() ? 0 : 420);
    this.grid = removeAndCollapse(this.grid, region);
    this.aimId = null;
    this.render();

    // Nachschub: 1–2 neue Blöcke
    await sleep(reducedMotion() ? 0 : 260);
    // 1–2 neue Blöcke; je länger die Runde, desto öfter zwei
    const count = Math.random() < twoBlockChance(this.moves.length - 1) ? 2 : 1;
    let blocked = false;
    for (let i = 0; i < count; i++) {
      const col = pickColumn(this.grid);
      const b = col < 0 ? null : this.newBlock(col);
      if (col < 0 || !b) { blocked = true; break; }
      const res = dropBlock(this.grid, col, b);
      if (!res) { blocked = true; break; }
      this.grid = res.grid;
      this.fresh.add(b.id);
    }
    this.render();

    let msg = `„${hint}“ trifft „${top.word}“`;
    msg += region.length > 1 ? ` – ${region.length} Blöcke verschwinden, +${points} Punkte.` : ` – +${points} Punkte.`;
    if (aimedWord) {
      if (aimedRank === 1) msg += ` Volltreffer: Dein Ziel „${aimedWord}“ war für das Modell auf Platz 1.`;
      else if (aimRemoved) msg += ` Dein Ziel „${aimedWord}“ ist mit weggefallen – für das Modell lag es aber nur auf Platz ${aimedRank}.`;
      else msg += ` Dein Ziel „${aimedWord}“ lag für das Modell nur auf Platz ${aimedRank}.`;
    }
    if (blocked || reachedTop(this.grid)) {
      this.over = true;
      msg += ' Der Stapel hat die Oberkante erreicht.';
    }
    return { message: msg, over: this.over };
  }

  result() {
    return { score: this.score, moves: this.moves, extra: [`${this.moves.reduce((a, m) => a + m.removed, 0)} Blöcke abgeräumt`] };
  }

  destroy() {}
}
