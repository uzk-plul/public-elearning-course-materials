// Wortvektoren (fastText, Deutsch) – ersetzt das frühere Transformer-Modell.
// Alle Dateien liegen in data/ und kommen vom selben Server wie das Spiel.
// Format: siehe scripts/build-vectors.py

const DATA = new URL('../data/', import.meta.url);

/** Liest eine Datei als ArrayBuffer und meldet den Fortschritt (0..1). */
async function fetchBytes(name, onFrac) {
  const res = await fetch(new URL(name, DATA));
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total || !onFrac) return res.arrayBuffer();
  // content-length kann bei komprimierter Auslieferung von der echten Länge abweichen – daher sammeln statt vorbelegen
  const chunks = [];
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onFrac(Math.min(1, got / total));
  }
  return new Blob(chunks).arrayBuffer();
}

export class WordVectors {
  constructor() {
    this.ready = false;
    this.meta = null;
    this.words = [];
    this.exact = new Map();   // Wort -> Index
    this.lower = new Map();   // kleingeschrieben -> häufigster Index
    this.parts = [];          // [Uint8Array Kern, Uint8Array Rest]
    this.restPromise = null;
    this.cache = new Map();   // Index -> Float32Array
    this.loadMs = null;
    this.readyPromise = null;
  }

  /** Lädt Wortliste und Kern-Vektoren; der Rest kommt danach im Hintergrund. onProgress erhält {loaded,total}. */
  load(onProgress) {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const t0 = performance.now();
        const metaRes = await fetch(new URL('vectors.json', DATA));
        if (!metaRes.ok) throw new Error(`vectors.json: HTTP ${metaRes.status}`);
        this.meta = await metaRes.json();
        let fVocab = 0, fCore = 0;
        const report = () => onProgress?.({ loaded: fVocab * 0.2 + fCore * 0.8, total: 1 });
        const [vocabBuf, coreBuf] = await Promise.all([
          fetchBytes('vocab.txt', (f) => { fVocab = f; report(); }),
          fetchBytes(this.meta.files[0], (f) => { fCore = f; report(); })
        ]);
        this.words = new TextDecoder().decode(vocabBuf).split(/\r?\n/);
        this.words.forEach((w, i) => {
          this.exact.set(w, i);
          const k = w.toLowerCase();
          if (!this.lower.has(k)) this.lower.set(k, i);
        });
        this.parts[0] = new Uint8Array(coreBuf);
        this.ready = true;
        this.loadMs = Math.round(performance.now() - t0);
        this.restPromise = fetchBytes(this.meta.files[1]).then((b) => { this.parts[1] = new Uint8Array(b); }).catch(() => { this.restPromise = null; });
        return { ms: this.loadMs, device: 'Wortvektoren' };
      })().catch((err) => { this.readyPromise = null; throw err; });
    }
    return this.readyPromise;
  }

  /** Index eines Wortes: exakt, dann mit großem Anfangsbuchstaben, dann ohne Groß-/Kleinschreibung. */
  indexOf(word) {
    const w = word.trim();
    if (this.exact.has(w)) return this.exact.get(w);
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    if (this.exact.has(cap)) return this.exact.get(cap);
    return this.lower.get(w.toLowerCase()) ?? -1;
  }

  known(word) { return this.indexOf(word) >= 0; }

  decode(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    const { core, dims, bytesPerWord, scale } = this.meta;
    const inCore = i < core;
    const bytes = inCore ? this.parts[0] : this.parts[1];
    if (!bytes) return null;
    const off = (inCore ? i : i - core) * bytesPerWord;
    const v = new Float32Array(dims);
    let norm = 0;
    for (let b = 0; b < bytesPerWord; b++) {
      const byte = bytes[off + b];
      const lo = ((byte & 15) - 7.5) / 7.5 * scale[2 * b];
      const hi = ((byte >> 4) - 7.5) / 7.5 * scale[2 * b + 1];
      v[2 * b] = lo; v[2 * b + 1] = hi;
      norm += lo * lo + hi * hi;
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dims; d++) v[d] /= norm;
    this.cache.set(i, v);
    return v;
  }

  /** Vektor eines Spielworts (Pool-Wörter liegen immer im Kern). */
  vec(word) {
    if (!this.ready) return undefined;
    const i = this.indexOf(word);
    return i < 0 ? undefined : this.decode(i) ?? undefined;
  }

  /** Kompatibel zur alten Schnittstelle: prüft nur, ob alle Wörter bekannt sind. */
  async embedWords(words) {
    const unknown = words.filter((w) => !this.known(w));
    if (unknown.length) throw new Error(`Unbekannte Wörter im Pool: ${unknown.join(', ')}`);
    return { count: 0, ms: 0 };
  }

  /** Vektor für ein Hinweiswort. vec ist null, wenn das Wort nicht im Wortschatz steht. */
  async embedHint(hint) {
    const t0 = performance.now();
    const i = this.indexOf(hint);
    if (i < 0) return { vec: null, totalMs: 0 };
    if (i >= this.meta.core && !this.parts[1]) {
      if (!this.restPromise) this.restPromise = fetchBytes(this.meta.files[1]).then((b) => { this.parts[1] = new Uint8Array(b); });
      await this.restPromise;
    }
    return { vec: this.decode(i), word: this.words[i], totalMs: performance.now() - t0 };
  }
}
