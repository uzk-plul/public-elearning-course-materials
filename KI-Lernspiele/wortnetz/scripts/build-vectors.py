"""Baut die Wortvektor-Dateien für Wortnetz aus den deutschen fastText-Vektoren.

Nicht Teil des Spiels – nur nötig, wenn die Dateien in data/ neu erzeugt werden sollen.

1. Einmalig herunterladen (ca. 1,3 GB, Lizenz CC BY-SA 3.0):
   https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz
2. Aufruf im Ordner wortnetz/:
   python scripts/build-vectors.py PFAD/cc.de.300.vec.gz

Ergebnis:
  data/vocab.txt     ein Wort pro Zeile, häufigste zuerst
  data/vec-1.bin     Vektoren der ersten CORE Wörter (inkl. aller Pool-Wörter)
  data/vec-2.bin     Vektoren der übrigen Wörter (lädt im Hintergrund)
  data/vectors.json  Metadaten: Anzahl, Dimensionen, Skalen

Format: jeder Vektor wird auf Länge 1 normiert und pro Dimension auf 4 Bit
gerundet (zwei Werte pro Byte, unteres Halbbyte = gerade Dimension).
Rückrechnung: x = (n - 8 + 0.5) / 7.5 * scale[d]
"""
import gzip
import json
import re
import sys
from pathlib import Path

import numpy as np

TOTAL = 150_000   # Wortschatz insgesamt
CORE = 50_000     # davon sofort geladen
OK = re.compile(r'^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*[A-Za-zÄÖÜäöüß]$')

root = Path(__file__).resolve().parent.parent
pool = {w for p in json.loads((root / 'data/wordlists.json').read_text('utf-8'))['pools'] for w in p['words']}

words, vecs, seen = [], [], set()
with gzip.open(sys.argv[1], 'rt', encoding='utf-8') as f:
    f.readline()
    for line in f:
        w, rest = line.split(' ', 1)
        take = (len(words) < TOTAL and OK.match(w) and '--' not in w) or w in pool
        if not take or w in seen:
            continue
        seen.add(w)
        words.append(w)
        vecs.append(np.asarray(rest.split(), dtype=np.float32))
        if len(words) >= TOTAL and pool <= seen:
            break

missing = sorted(pool - seen)
if missing:
    sys.exit(f'Diese Pool-Wörter fehlen im fastText-Wortschatz: {missing}')

# Pool-Wörter in den Kern holen, sonst Häufigkeitsreihenfolge behalten
order = list(range(min(CORE, len(words))))
order += [i for i in range(CORE, len(words)) if words[i] in pool]
core_n = len(order)
order += [i for i in range(CORE, len(words)) if words[i] not in pool]
words = [words[i] for i in order]
M = np.vstack([vecs[i] for i in order])
M /= np.linalg.norm(M, axis=1, keepdims=True)

scale = np.abs(M).max(axis=0) * 0.7
Q = np.clip(np.round(M / scale * 7.5 - 0.5), -8, 7).astype(np.int16) + 8   # 0..15
packed = (Q[:, 0::2] | (Q[:, 1::2] << 4)).astype(np.uint8)

data = root / 'data'
(data / 'vocab.txt').write_bytes('\n'.join(words).encode('utf-8'))  # write_text schriebe unter Windows \r\n
packed[:core_n].tofile(data / 'vec-1.bin')
packed[core_n:].tofile(data / 'vec-2.bin')
(data / 'vectors.json').write_text(json.dumps({
    'quelle': 'fastText cc.de.300 (Grave et al. 2018), CC BY-SA 3.0, gekürzt und auf 4 Bit gerundet',
    'dims': int(M.shape[1]),
    'count': len(words),
    'core': core_n,
    'bytesPerWord': int(packed.shape[1]),
    'files': ['vec-1.bin', 'vec-2.bin'],
    'scale': [round(float(s), 6) for s in scale]
}, ensure_ascii=False), 'utf-8')
print(f'{len(words)} Wörter, davon {core_n} im Kern · '
      f'vec-1.bin {packed[:core_n].nbytes / 1e6:.1f} MB · vec-2.bin {packed[core_n:].nbytes / 1e6:.1f} MB')
