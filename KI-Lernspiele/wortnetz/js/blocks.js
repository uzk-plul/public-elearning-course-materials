// Reine Rasterlogik für den Modus „Blöcke“. Zeile 0 ist oben.
// Ein Feld ist entweder null oder { id, word, color }.

export const COLS = 4;
export const NARROW_COLS = 3;   // Handy-Breite (< 480 px)
export const ROWS = 8;
export const COLORS = 4;
export const START_ROWS = 3;

export function emptyGrid(rows = ROWS, cols = COLS) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function cells(grid) {
  const out = [];
  grid.forEach((row, r) => row.forEach((b, c) => { if (b) out.push({ r, c, block: b }); }));
  return out;
}

export function findBlock(grid, id) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) if (grid[r][c]?.id === id) return { r, c };
  }
  return null;
}

/** Alle direkt (waagerecht/senkrecht) zusammenhängenden Blöcke gleicher Farbe. */
export function floodFill(grid, r, c) {
  const start = grid[r]?.[c];
  if (!start) return [];
  const seen = new Set([`${r},${c}`]);
  const stack = [[r, c]];
  const out = [];
  while (stack.length) {
    const [y, x] = stack.pop();
    out.push([y, x]);
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = y + dy, nx = x + dx, key = `${ny},${nx}`;
      if (seen.has(key)) continue;
      const b = grid[ny]?.[nx];
      if (b && b.color === start.color) { seen.add(key); stack.push([ny, nx]); }
    }
  }
  return out;
}

/** Entfernt Felder und lässt die Blöcke darüber nach unten rutschen. */
export function removeAndCollapse(grid, coords) {
  const g = cloneGrid(grid);
  for (const [r, c] of coords) g[r][c] = null;
  return applyGravity(g);
}

export function applyGravity(grid) {
  const g = cloneGrid(grid);
  const rows = g.length;
  for (let c = 0; c < g[0].length; c++) {
    const stack = [];
    for (let r = rows - 1; r >= 0; r--) if (g[r][c]) stack.push(g[r][c]);
    for (let r = rows - 1, i = 0; r >= 0; r--, i++) g[r][c] = stack[i] || null;
  }
  return g;
}

export function columnHeight(grid, c) {
  let h = 0;
  for (let r = grid.length - 1; r >= 0; r--) if (grid[r][c]) h++;
  return h;
}

/** Lässt einen Block in Spalte c fallen. Gibt null zurück, wenn die Spalte voll ist. */
export function dropBlock(grid, c, block) {
  const h = columnHeight(grid, c);
  if (h >= grid.length) return null;
  const g = cloneGrid(grid);
  const row = grid.length - 1 - h;
  g[row][c] = block;
  return { grid: g, row };
}

/** Stapel hat die Oberkante erreicht: In der obersten Zeile liegt ein Block. */
export function reachedTop(grid) {
  return grid[0].some(Boolean);
}

/** Anteil neuer Blöcke, die bewusst eine andere Farbe als ihre Nachbarn bekommen (sonst räumen Gruppen zu viel ab). */
export const COLOR_SPREAD = 0.5;

/** Wahrscheinlichkeit für zwei (statt einen) neue Blöcke nach Zug m: 50 % → 100 %. */
export function twoBlockChance(moveIndex) {
  return Math.min(1, 0.5 + moveIndex * 0.03);
}

/** Farbe für einen Block, der in Spalte c landet – mit Wahrscheinlichkeit COLOR_SPREAD keine Nachbarfarbe. */
export function colorFor(grid, c, rand = Math.random, colors = COLORS) {
  const row = grid.length - 1 - columnHeight(grid, c);
  const near = new Set([grid[row + 1]?.[c], grid[row]?.[c - 1], grid[row]?.[c + 1]].filter(Boolean).map((b) => b.color));
  const free = Array.from({ length: colors }, (_, i) => i).filter((x) => !near.has(x));
  if (free.length && rand() < COLOR_SPREAD) return free[Math.floor(rand() * free.length)];
  return Math.floor(rand() * colors);
}

/** Wählt eine Spalte für einen neuen Block: bevorzugt niedrige Spalten, damit das Spiel fair bleibt. */
export function pickColumn(grid, rand = Math.random) {
  const cols = grid[0].map((_, c) => c).filter((c) => columnHeight(grid, c) < grid.length);
  if (!cols.length) return -1;
  const weights = cols.map((c) => grid.length + 1 - columnHeight(grid, c));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < cols.length; i++) { x -= weights[i]; if (x < 0) return cols[i]; }
  return cols[cols.length - 1];
}
