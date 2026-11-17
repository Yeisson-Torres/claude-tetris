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
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const LIGHT_COLORS = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e88e5', // J
  '#fb8c00', // L
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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
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
    updateHUD();
  }
  return cleared;
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
  merge();
  trackCombo(clearLines());
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

function isLight() {
  return document.documentElement.dataset.theme === 'light';
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = (isLight() ? LIGHT_COLORS : COLORS)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = cssVar('--block-shine');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = cssVar('--grid');
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
  showGameOverRecords();
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
      if (gameOver) return;
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
  lastTime = performance.now();
  next = randomPiece();
  resetRecordsForNewGame();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // escribiendo un nombre
  if (handleStartScreenKey(e)) return;
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

const themeToggle = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');

function applyTheme(light) {
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeText.textContent = light ? 'Claro' : 'Oscuro';
  if (board) { draw(); drawNext(); }
}

themeToggle.addEventListener('click', () => {
  applyTheme(!isLight());
  themeToggle.blur(); // evita que Space active el botón durante el juego
});

applyTheme(false); // oscuro por defecto

// ===== Records =====
const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const MAX_NAME_LEN = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordsGameover = document.getElementById('records-gameover');
const newRecordMsg = document.getElementById('new-record-msg');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const recordSaveBtn = document.getElementById('record-save-btn');
const goRecordsBody = document.getElementById('go-records-body');
const goBestCombo = document.getElementById('go-best-combo');
const goMaxLines = document.getElementById('go-max-lines');

let onStartScreen = false;
let combo = 0;
let maxCombo = 0;
let pendingRecord = null; // entrada pendiente de guardar (nombre aún sin poner)
let gameOverRecords = null; // records cargados al terminar la partida actual

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || !Number.isFinite(e.score)) return null;
  const name = typeof e.name === 'string' && e.name.trim()
    ? e.name.trim().slice(0, MAX_NAME_LEN) : 'Anónimo';
  return {
    name,
    score: toCount(e.score),
    lines: toCount(e.lines),
    level: toCount(e.level) || 1,
    date: typeof e.date === 'string' ? e.date : '',
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return emptyRecords();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = (Array.isArray(data.top) ? data.top : [])
      .map(sanitizeEntry)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // almacenamiento no disponible: el juego sigue funcionando sin persistir
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // ignorado
  }
}

// Índice donde entraría `s` en el top (tras los empates), o -1 si no entra.
function recordSlot(top, s) {
  if (s <= 0) return -1;
  let i = top.findIndex(e => e.score < s);
  if (i === -1) i = top.length;
  return i < MAX_RECORDS ? i : -1;
}

function trackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function renderRecordsTable(tbody, top, highlightIdx) {
  tbody.replaceChildren();
  if (!top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'records-empty';
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  top.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIdx) tr.className = 'highlight';
    [String(i + 1), e.name, e.score.toLocaleString(), String(e.lines)].forEach(text => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderStats(comboEl, linesEl2, records) {
  comboEl.textContent = records.bestCombo;
  linesEl2.textContent = records.maxLines;
}

function drawEmptyBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

function showStartScreen() {
  onStartScreen = true;
  const records = loadRecords();
  renderRecordsTable(startRecordsBody, records.top, -1);
  renderStats(startBestCombo, startMaxLines, records);
  drawEmptyBoard();
  startScreen.classList.remove('hidden');
}

function startGame() {
  if (!onStartScreen) return;
  playBtn.blur();
  init();
}

// Devuelve true si la tecla fue consumida por la pantalla de inicio.
function handleStartScreenKey(e) {
  if (!onStartScreen) return false;
  if (e.target instanceof HTMLButtonElement) return true; // deja activar el botón enfocado
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    startGame();
  }
  return true;
}

function resetRecordsForNewGame() {
  // Si se reinicia sin guardar, el récord se conserva con el nombre escrito (o "Anónimo").
  if (pendingRecord) saveNameRecord();
  onStartScreen = false;
  startScreen.classList.add('hidden');
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  gameOverRecords = null;
  recordsGameover.hidden = true;
}

function showGameOverRecords() {
  const records = loadRecords();
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords(records);
  gameOverRecords = records;

  const slot = recordSlot(records.top, score);
  let preview = records.top;
  if (slot !== -1) {
    pendingRecord = {
      score,
      lines,
      level,
      date: new Date().toISOString().slice(0, 10),
    };
    preview = records.top.slice();
    preview.splice(slot, 0, { ...pendingRecord, name: '???' });
    preview = preview.slice(0, MAX_RECORDS);
  } else {
    pendingRecord = null;
  }

  newRecordMsg.hidden = slot === -1;
  recordForm.hidden = slot === -1;
  recordNameInput.disabled = false;
  recordSaveBtn.disabled = false;
  recordNameInput.value = '';
  renderRecordsTable(goRecordsBody, preview, slot);
  renderStats(goBestCombo, goMaxLines, records);
  recordsGameover.hidden = false;
  if (slot !== -1) recordNameInput.focus();
}

function saveNameRecord() {
  if (!pendingRecord || !gameOverRecords) return; // evita doble guardado
  const name = recordNameInput.value.trim().slice(0, MAX_NAME_LEN) || 'Anónimo';
  const entry = { name, ...pendingRecord };
  pendingRecord = null;

  const records = gameOverRecords;
  const slot = recordSlot(records.top, entry.score);
  if (slot !== -1) {
    records.top.splice(slot, 0, entry);
    records.top = records.top.slice(0, MAX_RECORDS);
    saveRecords(records);
  }
  renderRecordsTable(goRecordsBody, records.top, slot);
  renderStats(goBestCombo, goMaxLines, records);

  recordNameInput.disabled = true;
  recordSaveBtn.disabled = true;
  recordForm.hidden = true;
  recordSaveBtn.blur();
}

recordSaveBtn.addEventListener('click', saveNameRecord);
recordNameInput.maxLength = MAX_NAME_LEN;
recordNameInput.addEventListener('keydown', e => {
  // Ignora el autorepeat de Space si el jugador mantenía la caída rápida al perder.
  if (e.repeat && e.code === 'Space') { e.preventDefault(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    saveNameRecord();
  }
});

playBtn.addEventListener('click', startGame);

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.blur();
  if (!confirm('¿Borrar todos los records?')) return;
  clearRecords();
  showStartScreen();
});

restartBtn.addEventListener('click', () => restartBtn.blur());

showStartScreen();
