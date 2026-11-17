// Modus „Arcade“: Liste unter Zeitdruck. Das ähnlichste Wort wandert nach unten;
// landet das Zielwort in der Trefferzone, verschwindet es samt allen Wörtern darunter.
import { ARCADE, rankByHint, resolveArcade, zoneSize, arcadeInterval } from './ranking.js';
import { h, flip, sleep, reducedMotion, fillRanking } from './ui.js';

export class ArcadeGame {
  constructor(ctx) {
    this.ctx = ctx;              // { deck, vec(word), board, onScore, onEnd, announce, setBusy, setPaused }
    this.list = [];              // oben → unten
    this.target = null;
    this.hits = 0;
    this.added = 0;
    this.score = 0;
    this.moves = [];
    this.paused = false;
    this.over = false;
    this.timer = null;
    this.dueAt = 0;
    this.remaining = 0;
    this.interval = 0;
    this.fresh = new Set();
    this.leaving = new Set();
    this.onVisibility = () => { if (document.hidden) this.pause(); };
  }

  start() {
    for (let i = 0; i < ARCADE.startWords; i++) this.list.push(this.ctx.deck.draw(this.list));
    this.pickTarget();
    this.render();
    this.schedule();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  words() { return [...this.list]; }

  pickTarget() {
    const prev = this.target;
    const options = this.list.filter((w) => w !== prev);
    this.target = (options.length ? options : this.list)[Math.floor(Math.random() * (options.length || this.list.length))];
  }

  hudText() {
    return `${this.list.length}/${ARCADE.maxWords} Wörter`;
  }

  /* ----- Zeit ----- */

  schedule(ms, full) {
    clearTimeout(this.timer);
    const wait = ms ?? arcadeInterval(this.added);
    this.interval = full ?? wait;
    this.dueAt = performance.now() + wait;
    this.timer = setTimeout(() => this.tick(), wait);
    this.renderTimer(wait, this.interval);
  }

  tick() {
    if (this.paused || this.over) return;
    this.addWord();
    if (this.list.length >= ARCADE.maxWords) { this.end('Die Liste hat die Obergrenze erreicht.'); return; }
    if (this.list.length >= ARCADE.maxWords - 2) this.ctx.announce(`Achtung: noch ${ARCADE.maxWords - this.list.length} Plätze frei.`);
    this.schedule();
  }

  addWord() {
    const w = this.ctx.deck.draw(this.list);
    if (!w) return;
    this.list.unshift(w);
    this.added++;
    this.fresh.add(w);
    this.render();
  }

  renderTimer(left, full) {
    const bar = document.getElementById('timer-fill');
    if (!bar) return;
    bar.getAnimations?.().forEach((a) => a.cancel());
    const startFrac = Math.max(0, Math.min(1, left / full));
    bar.style.transform = `scaleX(${startFrac})`;
    if (this.paused) return;
    bar.animate([{ transform: `scaleX(${startFrac})` }, { transform: 'scaleX(0)' }], { duration: left, easing: 'linear', fill: 'forwards' });
  }

  pause() {
    if (this.paused || this.over) return;
    this.paused = true;
    clearTimeout(this.timer);
    this.remaining = Math.max(300, this.dueAt - performance.now());
    document.getElementById('timer-fill')?.getAnimations?.().forEach((a) => a.pause());
    this.ctx.setPaused(true);
    this.render();
    this.ctx.announce('Pausiert. Die Wörter sind ausgeblendet.');
  }

  resume() {
    if (!this.paused || this.over) return;
    this.paused = false;
    this.ctx.setPaused(false);
    this.render();
    this.schedule(this.remaining, this.interval);
    this.ctx.announce('Weiter geht’s.');
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  /* ----- Darstellung ----- */

  render() {
    const board = this.ctx.board;
    const zone = zoneSize(this.hits);
    const n = this.list.length;
    const list = h('ol', {
      class: `arcade-list${this.paused ? ' is-paused' : ''}`,
      style: { '--max': ARCADE.maxWords },
      'aria-label': `Wortliste, ${n} von höchstens ${ARCADE.maxWords} Wörtern. Zielwort: ${this.target}. Trefferzone: die untersten ${zone} Plätze.`
    }, this.list.map((w, i) => {
      const fromBottom = n - i;
      const inZone = fromBottom <= zone;
      const isTarget = w === this.target;
      return h('li', {
        class: `arcade-row${inZone ? ' in-zone' : ''}${isTarget ? ' is-target' : ''}${this.fresh.has(w) ? ' is-new' : ''}${this.leaving.has(w) ? ' is-leaving' : ''}`,
        'data-word': w
      },
      h('span', { class: 'row-word' }, isTarget ? h('span', { class: 'target-mark', 'aria-hidden': 'true' }, '★ ') : null, w),
      isTarget ? h('span', { class: 'tag tag-target' }, 'Ziel') : null);
    }));
    const frame = h('div', { class: 'arcade-frame', style: { '--max': ARCADE.maxWords, '--zone': zone } },
      h('div', { class: 'limit-line', 'aria-hidden': 'true' }, h('span', {}, `Obergrenze ${ARCADE.maxWords}`)),
      h('div', { class: 'zone-band', 'aria-hidden': 'true' }, h('span', {}, `Trefferzone ${zone}`)),
      list,
      this.paused ? h('div', { class: 'pause-cover' }, h('p', {}, 'Pause'), h('p', { class: 'small' }, 'Wörter ausgeblendet. Weiter mit „Fortsetzen“ oder Esc.')) : null);
    const old = board.querySelector('.arcade-frame');
    if (old) flip(board, '.arcade-row', 'data-word', () => old.replaceWith(frame));
    else board.replaceChildren(frame);
    this.fresh.clear();
    this.ctx.onScore(this.score, this.hudText());
    this.ctx.setTarget?.(this.target);
  }

  /* ----- Spielzug ----- */

  async play(hint, hintVec, ms) {
    const items = this.list.map((word) => ({ word, vec: this.ctx.vec(word) }));
    const ranked = rankByHint(hintVec, items);
    const zone = zoneSize(this.hits);
    const target = this.target;
    const res = resolveArcade(ranked, target, zone);
    const targetSim = ranked.find((r) => r.word === target).sim;
    this.moves.push({ hint, intended: target, rank: res.rank, top: ranked[0].word, simGap: ranked[0].sim - targetSim, ms, hit: res.hit });

    const marks = { [target]: [{ label: res.hit ? 'Ziel – Treffer' : 'Ziel', kind: res.hit ? 'hit' : 'aim' }] };
    res.removed.filter((w) => w !== target).forEach((w) => { marks[w] = [{ label: 'mit weg', kind: 'gone' }]; });
    fillRanking({ hint, ranked, marks, ms });

    // 1. Liste umsortieren (animiert)
    this.list = res.order;
    this.render();
    let msg;
    if (res.hit) {
      await sleep(reducedMotion() ? 0 : 450);
      res.removed.forEach((w) => this.leaving.add(w));
      this.render();
      await sleep(reducedMotion() ? 0 : 320);
      this.leaving.clear();
      // Während der Animation kann ein neues Wort nachgerückt sein – es bleibt erhalten.
      const gone = new Set(res.removed);
      this.list = this.list.filter((w) => !gone.has(w));
      this.hits++;
      this.score += res.points;
      if (!this.list.length) for (let i = 0; i < 4; i++) this.list.unshift(this.ctx.deck.draw(this.list));
      this.pickTarget();
      this.render();
      msg = `Treffer! „${hint}“ bringt „${target}“ auf Platz ${res.fromBottom} von unten – ${res.removed.length} ${res.removed.length === 1 ? 'Wort' : 'Wörter'} weg, +${res.points} Punkte. Neues Ziel: „${this.target}“.`;
      if (this.hits === ARCADE.zoneShrinkAfter) msg += ' Die Trefferzone ist jetzt kleiner.';
    } else {
      msg = `Knapp daneben: „${target}“ landet auf Platz ${res.fromBottom} von unten, nötig war Platz ${zone} oder tiefer. Am ähnlichsten fand das Modell „${ranked[0].word}“.`;
    }
    return { message: msg, over: this.over };
  }

  end(reason) {
    if (this.over) return;
    this.over = true;
    clearTimeout(this.timer);
    this.ctx.onEnd(reason);
  }

  result() {
    return { score: this.score, moves: this.moves, extra: [`${this.hits} Ziele getroffen`, `${this.added} Wörter nachgerückt`] };
  }

  destroy() {
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
