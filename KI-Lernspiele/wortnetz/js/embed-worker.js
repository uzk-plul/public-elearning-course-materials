// Web Worker: lädt das Embedding-Modell und berechnet Vektoren, damit die Oberfläche flüssig bleibt.
// Nachrichten an den Worker:   { type: 'load' } | { type: 'embed', id, texts: string[] }
// Nachrichten vom Worker:      progress | ready | embedded | error
import { TRANSFORMERS_URL, MODEL_ID, MODEL_PREFIX, MODEL_DTYPE, APPROX_DOWNLOAD_MB } from './model-config.js';

let extractor = null;
let loading = null;
let device = null;

// Standard ist WASM (CPU): Im Test lieferte das quantisierte Modell auf WebGPU unplausible Rangfolgen
// und brauchte ~3,5 s pro Wort, auf WASM wenige Millisekunden. WebGPU lässt sich mit ?device=webgpu erzwingen;
// ist es dann nicht verfügbar, fällt der Worker auf WASM zurück.
async function chooseDevices(preferred) {
  const list = [];
  if (preferred === 'webgpu') {
    try {
      if (self.navigator && self.navigator.gpu) {
        const adapter = await self.navigator.gpu.requestAdapter();
        if (adapter) list.push('webgpu');
      }
    } catch { /* kein WebGPU */ }
  }
  list.push('wasm');
  return list;
}

let preferredDevice = 'wasm';

async function load() {
  const t0 = performance.now();
  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.allowLocalModels = false;

  const files = new Map();
  const approx = APPROX_DOWNLOAD_MB * 1e6;
  const progress_callback = (p) => {
    if (!p || !p.file) return;
    if (p.status === 'progress' || p.status === 'done') {
      const prev = files.get(p.file) || { loaded: 0, total: 0 };
      const total = p.total || prev.total;
      const loaded = p.status === 'done' ? (total || prev.loaded) : (p.loaded ?? prev.loaded);
      files.set(p.file, { loaded, total });
      let L = 0, T = 0;
      for (const f of files.values()) { L += f.loaded; T += f.total; }
      self.postMessage({ type: 'progress', loaded: L, total: Math.max(T, approx), file: p.file });
    }
  };

  let lastError = null;
  for (const d of await chooseDevices(preferredDevice)) {
    try {
      const ex = await pipeline('feature-extraction', MODEL_ID, { dtype: MODEL_DTYPE, device: d, progress_callback });
      await ex(MODEL_PREFIX + 'Probe', { pooling: 'mean', normalize: true }); // Testlauf: klappt das Gerät wirklich?
      extractor = ex;
      device = d;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!extractor) throw lastError || new Error('Modell konnte nicht geladen werden.');
  self.postMessage({ type: 'ready', device, ms: Math.round(performance.now() - t0) });
}

async function embed(texts) {
  const out = await extractor(texts.map((t) => MODEL_PREFIX + t), { pooling: 'mean', normalize: true });
  const dim = out.dims[out.dims.length - 1];
  const data = out.data;
  return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'load') {
      if (msg.device) preferredDevice = msg.device;
      if (!loading) loading = load();
      await loading;
      if (extractor) self.postMessage({ type: 'ready', device, ms: 0, again: true });
    } else if (msg.type === 'embed') {
      if (!loading) loading = load();
      await loading;
      const t0 = performance.now();
      const vectors = await embed(msg.texts);
      self.postMessage({ type: 'embedded', id: msg.id, vectors, ms: performance.now() - t0 }, vectors.map((v) => v.buffer));
    }
  } catch (err) {
    loading = msg.type === 'load' ? null : loading;
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
