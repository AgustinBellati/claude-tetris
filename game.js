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
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSinceBomb, bombPending;
let gridLineColor = '#22222e';

// Cada skin define su paleta y su propia función de dibujado de bloque; drawBlock()
// delega en la skin activa. Las funciones drawBlock* se declaran más abajo, pero al
// ser function declarations quedan "hoisteadas" y ya están disponibles acá.
const SKINS = {
  retro: { label: 'Retro', bodyClass: null, colors: COLORS, drawBlock: drawBlockRetro },
  neon: { label: 'Neon', bodyClass: 'skin-neon', colors: NEON_COLORS, drawBlock: drawBlockNeon },
  pastel: { label: 'Pastel', bodyClass: 'skin-pastel', colors: PASTEL_COLORS, drawBlock: drawBlockPastel },
  pixel: { label: 'Pixel art', bodyClass: 'skin-pixel', colors: COLORS, drawBlock: drawBlockPixel },
};
const SKIN_BODY_CLASSES = Object.values(SKINS).map(s => s.bodyClass).filter(Boolean);

let activeSkin = SKINS.retro;

function refreshGridLineColor() {
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line-color').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  refreshGridLineColor();
  themeToggleBtn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
  localStorage.setItem('theme', theme);
}

function applySkin(name) {
  const key = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  activeSkin = SKINS[key];
  SKIN_BODY_CLASSES.forEach(cls => document.body.classList.remove(cls));
  if (activeSkin.bodyClass) document.body.classList.add(activeSkin.bodyClass);
  refreshGridLineColor();
  if (skinSelect) skinSelect.value = key;
  localStorage.setItem(SKIN_STORAGE_KEY, key);
}

themeToggleBtn.addEventListener('click', () => {
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
});

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

applyTheme(localStorage.getItem('theme') || 'dark');
applySkin(localStorage.getItem(SKIN_STORAGE_KEY) || 'retro');

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSinceBomb += cleared;
    while (linesSinceBomb >= BOMB_LINE_INTERVAL) {
      linesSinceBomb -= BOMB_LINE_INTERVAL;
      bombPending = true;
    }
    updateHUD();
  }
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
    explodeBomb();
  } else {
    merge();
    clearLines();
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  activeSkin.drawBlock(context, x, y, colorIndex, size);
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

function drawPixelTexture(context, px, py, s, shadeColor) {
  const cell = Math.max(3, Math.floor(s / 5));
  context.fillStyle = shadeColor;
  for (let i = 0; i < s; i += cell * 2) {
    for (let j = 0; j < s; j += cell * 2) {
      context.fillRect(px + i, py + j, cell, cell);
    }
  }
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
  if (colorIndex === BOMB_TYPE) {
    drawBombIcon(context, x, y, size);
    return;
  }
  context.fillStyle = SKINS.retro.colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// ---- Skin: Neon (fondo negro + glow) ----
function drawBlockNeon(context, x, y, colorIndex, size) {
  if (colorIndex === BOMB_TYPE) {
    drawBombIcon(context, x, y, size, { glow: true });
    return;
  }
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
  if (colorIndex === BOMB_TYPE) {
    drawBombIcon(context, x, y, size, { rounded: true, inset: 2 });
    return;
  }
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
  if (colorIndex === BOMB_TYPE) {
    drawBombIcon(context, x, y, size, { texture: true });
    return;
  }
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
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSinceBomb = 0;
  bombPending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

init();
