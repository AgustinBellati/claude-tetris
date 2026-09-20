'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Pieza especial: bomba. Aparece cada BOMB_LINE_INTERVAL líneas despejadas y,
// al fijarse, destruye un área 3×3 del tablero centrada en su celda.
const BOMB_TYPE = 8;
const BOMB_LINE_INTERVAL = 10;
const BOMB_SCORE_PER_CELL = 15;

// Tabla de records local: top N puntuaciones guardadas en localStorage.
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;

// Paletas alternativas para las skins Neon y Pastel (Retro y Pixel art reusan COLORS).
const NEON_COLORS = [
  null,
  '#00e5ff', // I
  '#ffea00', // O
  '#e040fb', // T
  '#00e676', // S
  '#ff1744', // Z
  '#2979ff', // J
  '#ff9100', // L
];

const PASTEL_COLORS = [
  null,
  '#aee7f2', // I
  '#fff2b8', // O
  '#dcc0ea', // T
  '#bde9c4', // S
  '#f5bcbc', // Z
  '#bcd0f0', // J
  '#f6d7ae', // L
];

const SKIN_STORAGE_KEY = 'tetris-skin';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayStats = document.getElementById('overlay-stats');
const overlayHighscoresEl = document.getElementById('overlay-highscores');
const highscoreForm = document.getElementById('highscore-form');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const startHighscoresEl = document.getElementById('start-highscores');
const startBestStatsEl = document.getElementById('start-best-stats');
const pauseMenu = document.getElementById('pause-menu');
const pauseMainPanel = document.getElementById('pause-main-panel');
const pauseControlsPanel = document.getElementById('pause-controls-panel');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSelect = document.getElementById('start-level-select');
const skinSelect = document.getElementById('skin-select');

const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 15;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSinceBomb, bombPending;
let combo, maxCombo, maxLinesInOneClear;
let gridLineColor = '#22222e';
// La partida ya no arranca sola al cargar la página: espera al botón "Jugar" de
// la pantalla de inicio. Sin esto, `paused`/`gameOver` quedan `undefined` (falsy)
// antes de esa primera partida y el keydown global operaría sobre estado inexistente.
let started = false;
// Nivel elegido para la PRÓXIMA partida (selector del menú de pausa).
let startLevel = loadStartLevel();
// Nivel con el que arrancó la partida EN CURSO: se fija en init() para que
// cambiar el selector a mitad de partida no altere el nivel/velocidad actual.
let gameStartLevel = startLevel;

function loadStartLevel() {
  const saved = parseInt(localStorage.getItem('tetris-start-level'), 10);
  if (Number.isInteger(saved) && saved >= MIN_START_LEVEL && saved <= MAX_START_LEVEL) return saved;
  return MIN_START_LEVEL;
}

function initialDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

for (let lvl = MIN_START_LEVEL; lvl <= MAX_START_LEVEL; lvl++) {
  const opt = document.createElement('option');
  opt.value = lvl;
  opt.textContent = lvl;
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = startLevel;

startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10);
  localStorage.setItem('tetris-start-level', String(startLevel));
});

// Cada skin define su paleta y su propia función de dibujado de bloque; drawBlock()
// delega en la skin activa. Las funciones drawBlock* se declaran más abajo, pero al
// ser function declarations quedan "hoisteadas" y ya están disponibles acá.
// bombOpts define cómo se ve la Bomba en cada skin (ver drawBombIcon); el dispatch
// a la Bomba vive una sola vez en drawBlock(), no en cada drawBlock<Skin>, así que
// una skin nueva sin bombOpts simplemente hereda el look default (sigue distinguible).
const SKINS = {
  retro: { label: 'Retro', bodyClass: null, colors: COLORS, drawBlock: drawBlockRetro, bombOpts: {} },
  neon: { label: 'Neon', bodyClass: 'skin-neon', colors: NEON_COLORS, drawBlock: drawBlockNeon, bombOpts: { glow: true } },
  pastel: { label: 'Pastel', bodyClass: 'skin-pastel', colors: PASTEL_COLORS, drawBlock: drawBlockPastel, bombOpts: { rounded: true, inset: 2 } },
  pixel: { label: 'Pixel art', bodyClass: 'skin-pixel', colors: COLORS, drawBlock: drawBlockPixel, bombOpts: { texture: true } },
};
const SKIN_BODY_CLASSES = Object.values(SKINS).map(s => s.bodyClass).filter(Boolean);

let activeSkin = SKINS.retro;

function refreshGridLineColor() {
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line-color').trim();
}

// localStorage puede no estar disponible (navegación privada estricta, page servida
// como file://, políticas del navegador) y lanzar en vez de simplemente no persistir.
// Si eso pasa acá arriba, antes de definir init()/el listener de teclado, el script
// entero se corta y el juego queda inutilizable. Por eso todo acceso pasa por acá.
function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sin persistencia disponible: la preferencia solo dura la sesión actual
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  refreshGridLineColor();
  themeToggleBtn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
  safeStorageSet('theme', theme);
}

function applySkin(name) {
  const key = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  activeSkin = SKINS[key];
  SKIN_BODY_CLASSES.forEach(cls => document.body.classList.remove(cls));
  if (activeSkin.bodyClass) document.body.classList.add(activeSkin.bodyClass);
  refreshGridLineColor();
  if (skinSelect) skinSelect.value = key;
  safeStorageSet(SKIN_STORAGE_KEY, key);
}

themeToggleBtn.addEventListener('click', () => {
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
});

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

applyTheme(safeStorageGet('theme') || 'dark');
applySkin(safeStorageGet(SKIN_STORAGE_KEY) || 'retro');

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function loadHighScores() {
  try {
    const list = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    if (!Array.isArray(list)) return [];
    return list.sort((a, b) => b.score - a.score);
  } catch (e) {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function qualifiesForHighScore(candidateScore, list) {
  if (list.length < MAX_HIGHSCORES) return true;
  return candidateScore > list[list.length - 1].score;
}

// Inserta la entrada, reordena y recorta al top N. Devuelve la lista guardada;
// como `entry` se inserta por referencia, sirve para ubicarla luego con indexOf.
function addHighScore(entry) {
  const list = loadHighScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighScores(trimmed);
  return trimmed;
}

function renderHighScoresList(container, list, highlightIndex) {
  container.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'highscores-empty';
    p.textContent = 'Sin records todavía';
    container.appendChild(p);
    return;
  }
  const ol = document.createElement('ol');
  ol.className = 'highscores-list';
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'highscore-row' + (i === highlightIndex ? ' highscore-new' : '');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hs-name';
    nameSpan.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hs-score';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.append(nameSpan, scoreSpan);
    ol.appendChild(li);
  });
  container.appendChild(ol);
}

function renderBestStats(container, list) {
  if (!list.length) {
    container.textContent = 'Mejor combo: – · Mejor jugada: –';
    return;
  }
  const bestCombo = Math.max(...list.map(e => e.maxCombo || 0));
  const bestClear = Math.max(...list.map(e => e.maxLinesInOneClear || 0));
  container.textContent = `Mejor combo: ${bestCombo}x · Mejor jugada: ${bestClear} línea${bestClear === 1 ? '' : 's'}`;
}

function showStartScreen() {
  const scores = loadHighScores();
  renderHighScoresList(startHighscoresEl, scores, -1);
  renderBestStats(startBestStatsEl, scores);
  startScreen.classList.remove('hidden');
}

function resetHighScores() {
  localStorage.removeItem(HIGHSCORES_KEY);
  renderHighScoresList(startHighscoresEl, [], -1);
  renderBestStats(startBestStatsEl, []);
}

function saveCurrentScore() {
  const name = (playerNameInput.value.trim() || 'Jugador').slice(0, 12);
  const entry = { name, score, lines, maxCombo, maxLinesInOneClear, date: new Date().toISOString() };
  const updated = addHighScore(entry);
  renderHighScoresList(overlayHighscoresEl, updated, updated.indexOf(entry));
  highscoreForm.classList.add('hidden');
}

function createBombPiece() {
  const shape = [[BOMB_TYPE]];
  return { type: BOMB_TYPE, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, isBomb: true };
}

function randomPiece() {
  if (bombPending) {
    bombPending = false;
    return createBombPiece();
  }
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = initialDropInterval(level);
    linesSinceBomb += cleared;
    while (linesSinceBomb >= BOMB_LINE_INTERVAL) {
      linesSinceBomb -= BOMB_LINE_INTERVAL;
      bombPending = true;
    }
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    maxLinesInOneClear = Math.max(maxLinesInOneClear, cleared);
    updateHUD();
  }
  return cleared;
}

function explodeBomb() {
  const cx = current.x;
  const cy = current.y;
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++) {
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (board[r][c]) destroyed++;
      board[r][c] = 0;
    }
  }
  score += destroyed * BOMB_SCORE_PER_CELL;
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.isBomb) {
    // La bomba no despeja líneas: es neutral para el combo, no lo rompe ni lo suma.
    explodeBomb();
  } else {
    merge();
    const cleared = clearLines();
    if (!cleared) combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// El dispatch de la Bomba vive acá, una sola vez, en vez de repetirse en cada
// drawBlock<Skin> — así una skin nueva no puede "olvidarse" de manejarla.
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB_TYPE) {
    drawBombIcon(context, x, y, size, activeSkin.bombOpts);
  } else {
    activeSkin.drawBlock(context, x, y, colorIndex, size);
  }
  context.globalAlpha = 1;
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// La textura pixel-art es estática por tamaño+color, así que se dibuja una sola vez
// en un canvas off-screen y se reutiliza con drawImage en vez de recalcular ~9
// fillRect por bloque en cada frame (el tablero puede tener ~200 bloques visibles).
const pixelTextureCache = new Map();

function getPixelTextureTile(s, shadeColor) {
  const key = s + '|' + shadeColor;
  let tile = pixelTextureCache.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const tileCtx = tile.getContext('2d');
    const cell = Math.max(3, Math.floor(s / 5));
    tileCtx.fillStyle = shadeColor;
    for (let i = 0; i < s; i += cell * 2) {
      for (let j = 0; j < s; j += cell * 2) {
        tileCtx.fillRect(i, j, cell, cell);
      }
    }
    pixelTextureCache.set(key, tile);
  }
  return tile;
}

function drawPixelTexture(context, px, py, s, shadeColor) {
  context.drawImage(getPixelTextureTile(s, shadeColor), px, py);
}

// Look de la bomba compartido entre skins (bloque oscuro + borde rojo + 💣) con
// pequeñas variaciones (glow, bordes redondeados, textura) para que combine con
// cada skin sin perder su identidad de "pieza especial".
function drawBombIcon(context, x, y, size, opts = {}) {
  const inset = opts.inset ?? 3;
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  if (opts.glow) {
    context.shadowBlur = 14;
    context.shadowColor = '#ff1744';
  }
  context.fillStyle = '#1a1a1a';
  if (opts.rounded) {
    roundedRectPath(context, px, py, s, s, 6);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }
  context.shadowBlur = 0;
  if (opts.texture) drawPixelTexture(context, px, py, s, 'rgba(255,255,255,0.08)');
  context.strokeStyle = '#ff1744';
  context.lineWidth = 2;
  if (opts.rounded) {
    roundedRectPath(context, x * size + inset, y * size + inset, size - inset * 2, size - inset * 2, 4);
    context.stroke();
  } else {
    context.strokeRect(x * size + inset, y * size + inset, size - inset * 2, size - inset * 2);
  }
  context.fillStyle = '#ff1744';
  context.font = `${Math.floor(size * 0.55)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('💣', x * size + size / 2, y * size + size / 2 + 1);
}

// ---- Skin: Retro (look original) ----
function drawBlockRetro(context, x, y, colorIndex, size) {
  context.fillStyle = SKINS.retro.colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// ---- Skin: Neon (fondo negro + glow) ----
function drawBlockNeon(context, x, y, colorIndex, size) {
  const color = SKINS.neon.colors[colorIndex];
  context.shadowBlur = 14;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,0.6)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
}

// ---- Skin: Pastel (colores suaves + bordes redondeados) ----
function drawBlockPastel(context, x, y, colorIndex, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  roundedRectPath(context, px, py, s, s, 6);
  context.fillStyle = SKINS.pastel.colors[colorIndex];
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.08)';
  context.lineWidth = 1;
  context.stroke();
}

// ---- Skin: Pixel art (textura tipo dithering 8-bit) ----
function drawBlockPixel(context, x, y, colorIndex, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.fillStyle = SKINS.pixel.colors[colorIndex];
  context.fillRect(px, py, s, s);
  drawPixelTexture(context, px, py, s, 'rgba(0,0,0,0.18)');
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayStats.textContent = `Líneas: ${lines} · Mejor combo: ${maxCombo}x · Mejor jugada: ${maxLinesInOneClear} línea${maxLinesInOneClear === 1 ? '' : 's'}`;

  const scores = loadHighScores();
  if (qualifiesForHighScore(score, scores)) {
    highscoreForm.classList.remove('hidden');
    playerNameInput.value = '';
    renderHighScoresList(overlayHighscoresEl, scores, -1);
    playerNameInput.focus();
  } else {
    highscoreForm.classList.add('hidden');
    renderHighScoresList(overlayHighscoresEl, scores, -1);
  }

  overlay.classList.remove('hidden');
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

function openPauseMenu() {
  // siempre arranca en el panel principal, no en el de controles
  pauseControlsPanel.classList.add('hidden');
  pauseMainPanel.classList.remove('hidden');
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = initialDropInterval(gameStartLevel);
  dropAccum = 0;
  linesSinceBomb = 0;
  bombPending = false;
  combo = 0;
  maxCombo = 0;
  maxLinesInOneClear = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  // Limpia restos del overlay de game over anterior (si no, quedarían visibles
  // detrás del overlay de pausa la próxima vez que se pause esta partida nueva).
  overlayStats.textContent = '';
  overlayHighscoresEl.innerHTML = '';
  highscoreForm.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (!started || gameOver) return;
  if (paused) {
    // menú de pausa abierto: bloquear inputs de juego y evitar que Space
    // dispare un click nativo sobre el botón que tenga el foco. Excepción:
    // si el foco está en el <select> de nivel, dejarlo manejar sus propias
    // flechas/Space (navegación nativa de opciones).
    if (e.target !== startLevelSelect && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyX', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);
controlsToggleBtn.addEventListener('click', () => {
  pauseMainPanel.classList.add('hidden');
  pauseControlsPanel.classList.remove('hidden');
  controlsBackBtn.focus();
});
controlsBackBtn.addEventListener('click', () => {
  pauseControlsPanel.classList.add('hidden');
  pauseMainPanel.classList.remove('hidden');
  resumeBtn.focus();
});

saveScoreBtn.addEventListener('click', saveCurrentScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') {
    e.preventDefault();
    saveCurrentScore();
  }
});

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});
resetScoresBtn.addEventListener('click', resetHighScores);

showStartScreen();
