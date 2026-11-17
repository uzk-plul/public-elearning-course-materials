// Haupt-Thread-Seite des Workers: Promise-basierte Schnittstelle plus Zwischenspeicher für Wortvektoren.
import { MODEL_ID } from './model-config.js';

export class Embedder {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
    this.device = null;
    this.loadMs = null;
    this.cache = new Map(); // Wort -> Float32Array
    this.onProgress = null;
    this.readyPromise = null;
  }

  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL('./embed-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.handle(e.data);
    this.worker.onerror = (e) => this.failAll(e.message || 'Der Worker ist abgestürzt.');
  }

  handle(msg) {
    if (msg.type === 'progress') { this.onProgress?.(msg); return; }
    if (msg.type === 'ready') {
      if (!msg.again) { this.device = msg.device; this.loadMs = msg.ms; }
      this.ready = true;
      this.pending.get('load')?.resolve(msg);
      this.pending.delete('load');
      return;
    }
    if (msg.type === 'embedded') {
      this.pending.get(msg.id)?.resolve(msg);
      this.pending.delete(msg.id);
      return;
    }
    if (msg.type === 'error') {
      const key = msg.id ?? 'load';
      const p = this.pending.get(key);
      if (p) { p.reject(new Error(msg.message)); this.pending.delete(key); } else this.failAll(msg.message);
    }
  }

  failAll(message) {
    for (const p of this.pending.values()) p.reject(new Error(message));
    this.pending.clear();
    this.readyPromise = null;
  }

  /** Lädt das Modell (einmalig). onProgress erhält {loaded,total}. */
  load(onProgress) {
    this.start();
    this.onProgress = onProgress || null;
    if (this.ready) return Promise.resolve({ device: this.device, ms: this.loadMs });
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.pending.set('load', { resolve, reject });
        let device = 'wasm';
        try { if (new URLSearchParams(location.search).get('device') === 'webgpu') device = 'webgpu'; } catch { /* ignorieren */ }
        this.worker.postMessage({ type: 'load', device });
      });
    }
    return this.readyPromise;
  }

  /** Bettet Texte ein. Gibt { vectors, ms } zurück. */
  embedRaw(texts) {
    this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'embed', id, texts });
    });
  }

  /** Bettet alle noch nicht bekannten Wörter in Paketen ein und legt sie im Zwischenspeicher ab. */
  async embedWords(words, onStep, batch = 16) {
    const todo = [...new Set(words)].filter((w) => !this.cache.has(w));
    const t0 = performance.now();
    for (let i = 0; i < todo.length; i += batch) {
      const part = todo.slice(i, i + batch);
      const { vectors } = await this.embedRaw(part);
      part.forEach((w, j) => this.cache.set(w, vectors[j]));
      onStep?.(Math.min(i + batch, todo.length), todo.length);
    }
    return { count: todo.length, ms: performance.now() - t0 };
  }

  vec(word) { return this.cache.get(word); }

  /** Bettet ein einzelnes Hinweiswort ein (nicht im Wort-Zwischenspeicher, um Pools sauber zu halten). */
  async embedHint(hint) {
    const t0 = performance.now();
    const { vectors, ms } = await this.embedRaw([hint]);
    return { vec: vectors[0], workerMs: ms, totalMs: performance.now() - t0 };
  }
}

/** Ist das Modell schon im Browser-Cache? (Nur ein Hinweis für die Ladeanzeige.) */
export async function modelLikelyCached() {
  try {
    if (!('caches' in self)) return false;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((r) => r.url.includes(MODEL_ID) && r.url.includes('.onnx'))) return true;
    }
  } catch { /* ignorieren */ }
  return false;
}
