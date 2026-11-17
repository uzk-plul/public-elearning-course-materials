// Zentrale Modellkonfiguration – wird vom Worker und von der Oberfläche genutzt.
// Modellwahl: siehe README („Modellwahl“) und scripts/compare-models.mjs.
export const TRANSFORMERS_VERSION = '4.3.2';
export const TRANSFORMERS_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`;
export const MODEL_ID = 'Xenova/distiluse-base-multilingual-cased-v2';
export const MODEL_PREFIX = '';            // bei e5-Modellen wäre hier 'query: ' nötig
export const MODEL_DTYPE = 'q8';           // quantisiert: onnx/model_quantized.onnx, ca. 135 MB
export const MODEL_DIMS = 768;             // Länge eines Embedding-Vektors
export const APPROX_DOWNLOAD_MB = 138;     // Modell (135 MB) + Tokenizer (3 MB)
