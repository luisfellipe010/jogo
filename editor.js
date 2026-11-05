/* Blip's Grove — editor.js  (M5.4)
 *
 * A full tile-based level editor overlaid on the game canvas.
 * Activated via "EDITOR" on the title screen; returns cleanly to title.
 *
 * Public API (called by ui.js):
 *   openEditor()   — enter editor mode
 *   closeEditor()  — return to title
 *
 * Internally reads/writes:
 *   editorState    — current editor state object
 *   EDITOR_SAVE_KEY — localStorage key for saved slots
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const EDITOR_SAVE_KEY = 'blipgrove_editor_v1';
const EDITOR_COLS = 60;   // default map width
const EDITOR_ROWS = 15;   // fixed map height (matches existing levels)
const EDITOR_MAX_SLOTS = 10;

// Tile palette definition — char, label, color swatch, category
const TILE_PALETTE = [
  // terrain
  { ch: '.', label: 'Air',        color: '#8bd6ff', cat: 'Terrain' },
  { ch: '#', label: 'Grass',      color: '#4aa84a', cat: 'Terrain' },
  { ch: '=', label: 'Dirt',       color: '#a87a3a', cat: 'Terrain' },
  { ch: 'B', label: 'Brick',      color: '#8892a6', cat: 'Terrain' },
  { ch: 'P', label: 'Platform',   color: '#c49256', cat: 'Terrain' },
  { ch: '^', label: 'Spikes',     color: '#e6edf5', cat: 'Terrain' },
  { ch: '~', label: 'Water',      color: '#3a8ad6', cat: 'Terrain' },
  { ch: 'i', label: 'Ice',        color: '#a8e8ff', cat: 'Terrain' },
  // interactive
  { ch: '?', label: '? Block',    color: '#e0a63a', cat: 'Objects' },
  { ch: 'M', label: 'Mover',      color: '#c49256', cat: 'Objects' },
  { ch: 'C', label: 'Checkpoint', color: '#d8d8e0', cat: 'Objects' },
  { ch: 'G', label: 'Gem',        color: '#ffd866', cat: 'Objects' },
  { ch: 'O', label: 'Crate',      color: '#a06a30', cat: 'Objects' },
  { ch: 'L', label: 'Lever',      color: '#c8b89a', cat: 'Objects' },
  { ch: 'k', label: 'Key',        color: '#ff5a8a', cat: 'Objects' },
  { ch: 'l', label: 'Lock',       color: '#5a4028', cat: 'Objects' },
  // puzzle
  { ch: '1', label: 'Plate 1',    color: '#7ff2e2', cat: 'Puzzle' },
  { ch: '2', label: 'Plate 2',    color: '#ffd866', cat: 'Puzzle' },
  { ch: '[', label: 'Gate',       color: '#5a3a8a', cat: 'Puzzle' },
  { ch: 'J', label: 'Tog.Gate',   color: '#c66a3a', cat: 'Puzzle' },
  { ch: 'q', label: 'Conv.Left',  color: '#3a3340', cat: 'Puzzle' },
  { ch: 'e', label: 'Conv.Right', color: '#3a3340', cat: 'Puzzle' },
  { ch: 'n', label: 'Cannon',     color: '#454a55', cat: 'Puzzle' },
  // sky
  { ch: '>', label: 'Wind R',     color: '#c8eeff', cat: 'Sky' },
  { ch: '<', label: 'Wind L',     color: '#c8eeff', cat: 'Sky' },
  { ch: 'c', label: 'Cloud',      color: '#e8f6ff', cat: 'Sky' },
  // enemies
  { ch: 'S', label: 'Slug',       color: '#6b3fa0', cat: 'Enemies' },
  { ch: 'V', label: 'Flyer',      color: '#b83a80', cat: 'Enemies' },
  { ch: 'T', label: 'Turret',     color: '#3a5a7a', cat: 'Enemies' },
  { ch: 'W', label: 'Spitter',    color: '#5a7a3a', cat: 'Enemies' },
  { ch: 'Y', label: 'Slime',      color: '#5fbf5a', cat: 'Enemies' },
  { ch: 'N', label: 'Knight',     color: '#7a8a9a', cat: 'Enemies' },
  { ch: 'K', label: 'Boss',       color: '#5a3a8a', cat: 'Enemies' },
  // specials
  { ch: '@', label: 'Spawn',      color: '#2dd4bf', cat: 'Special' },
  { ch: 'F', label: 'Flag',       color: '#ff6f88', cat: 'Special' },
  { ch: 'D', label: 'Door In',    color: '#5a3a8a', cat: 'Special' },
  { ch: 'X', label: 'Door Out',   color: '#3a8a5a', cat: 'Special' },
];

const CATEGORIES = ['Terrain','Objects','Puzzle','Sky','Enemies','Special'];

// ─── Editor state ─────────────────────────────────────────────────────────────
let editorState = null;

function makeBlankMap(cols, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      // bottom 2 rows = ground, rest = air
      row.push(r >= rows - 2 ? '#' : '.');
    }
    grid.push(row);
  }
  return grid;
}

function editorDefaultState() {
  return {
    grid: makeBlankMap(EDITOR_COLS, EDITOR_ROWS),
    cols: EDITOR_COLS,
    rows: EDITOR_ROWS,
    selectedTile: '#',
    camX: 0,              // pixel scroll offset
    scrollTarget: 0,
    painting: false,
    erasing: false,
    activeCat: 'Terrain',
    slots: loadEditorSlots(),
    dirty: false,
    testMode: false,
    mapName: 'MY LEVEL',
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadEditorSlots() {
  try {
    const raw = localStorage.getItem(EDITOR_SAVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}
function saveEditorSlots(slots) {
  try { localStorage.setItem(EDITOR_SAVE_KEY, JSON.stringify(slots)); } catch(e) {}
}

// ─── DOM layer ────────────────────────────────────────────────────────────────
// The editor lives entirely in a <div id="editorOverlay"> injected over the stage.

function openEditor() {
  // Pause the game loop's draw output
  gameState = 'editor';
  stopMusic();

  editorState = editorDefaultState();

  let el = document.getElementById('editorOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'editorOverlay';
    document.getElementById('stage').appendChild(el);
  }
  el.style.display = 'flex';
  renderEditorUI(el);
}

function closeEditor() {
  const el = document.getElementById('editorOverlay');
  if (el) el.style.display = 'none';
  editorState = null;
  showTitle();
}

// ─── Full UI render ───────────────────────────────────────────────────────────
function renderEditorUI(el) {
  const s = editorState;

  el.innerHTML = `
    <div class="ed-sidebar" id="edSidebar">
      <div class="ed-logo">EDITOR</div>

      <div class="ed-name-row">
        <input class="ed-name-input" id="edNameInput" maxlength="20" value="${s.mapName}" placeholder="MAP NAME" />
      </div>

      <div class="ed-cat-tabs" id="edCatTabs">
        ${CATEGORIES.map(c => `<button class="ed-cat ${c===s.activeCat?'on':''}" data-cat="${c}">${c}</button>`).join('')}
      </div>

      <div class="ed-palette" id="edPalette">
        ${renderPaletteTiles(s.activeCat, s.selectedTile)}
      </div>

      <div class="ed-section">MAP SIZE</div>
      <div class="ed-size-row">
        <label>Width</label>
        <input class="ed-num" id="edColsInput" type="number" min="20" max="200" value="${s.cols}" />
        <button class="ed-sm-btn" id="edResizeBtn">RESIZE</button>
      </div>

      <div class="ed-section">ACTIONS</div>
      <button class="ed-btn accent" id="edTestBtn">▶ TEST</button>
      <button class="ed-btn" id="edSaveBtn">◼ SAVE</button>
      <button class="ed-btn" id="edLoadBtn">▤ LOAD</button>
      <button class="ed-btn" id="edExportBtn">⎘ EXPORT CODE</button>
      <button class="ed-btn accent" id="edShareBtn">🔗 SHARE URL</button>
      <button class="ed-btn" id="edImportBtn">⎗ IMPORT</button>
      <button class="ed-btn ghost" id="edClearBtn">✕ CLEAR</button>
      <button class="ed-btn ghost" id="edCloseBtn">◀ TITLE</button>

      <div class="ed-hint">LEFT: paint · RIGHT: erase<br>SCROLL: pan · SHIFT+drag: pan</div>
    </div>

    <div class="ed-canvas-wrap" id="edCanvasWrap">
      <canvas id="edCanvas"></canvas>
      <div class="ed-coords" id="edCoords"></div>
    </div>

    <div class="ed-modal" id="edModal" style="display:none;"></div>
  `;

  // Wire name input
  el.querySelector('#edNameInput').addEventListener('input', e => {
    editorState.mapName = e.target.value.toUpperCase();
  });

  // Category tabs
  el.querySelectorAll('.ed-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      editorState.activeCat = btn.dataset.cat;
      refreshPalette();
    });
  });

  // Palette tile clicks
  wirePaletteClicks(el);

  // Resize
  el.querySelector('#edResizeBtn').addEventListener('click', () => {
    const newCols = Math.max(20, Math.min(200, parseInt(el.querySelector('#edColsInput').value) || EDITOR_COLS));
    resizeMap(newCols, editorState.rows);
    el.querySelector('#edColsInput').value = newCols;
    editorState.dirty = true;
    redrawCanvas();
  });

  // Action buttons
  el.querySelector('#edTestBtn').addEventListener('click', testMap);
  el.querySelector('#edSaveBtn').addEventListener('click', showSaveModal);
  el.querySelector('#edLoadBtn').addEventListener('click', showLoadModal);
  el.querySelector('#edExportBtn').addEventListener('click', exportMap);
  el.querySelector('#edShareBtn').addEventListener('click', shareMap);
  el.querySelector('#edImportBtn').addEventListener('click', showImportModal);
  el.querySelector('#edClearBtn').addEventListener('click', () => {
    if (confirm('Clear the map?')) {
      editorState.grid = makeBlankMap(editorState.cols, editorState.rows);
      editorState.dirty = true;
      redrawCanvas();
    }
  });
  el.querySelector('#edCloseBtn').addEventListener('click', () => {
    if (!editorState.dirty || confirm('Unsaved changes — leave anyway?')) closeEditor();
  });

  // Canvas setup
  initEditorCanvas();
}

function renderPaletteTiles(cat, selected) {
  const tiles = TILE_PALETTE.filter(t => t.cat === cat);
  return tiles.map(t => `
    <div class="ed-tile ${t.ch === selected ? 'on' : ''}" data-ch="${t.ch}" title="${t.label} [${t.ch}]">
      <span class="ed-swatch" style="background:${t.color};"></span>
      <span class="ed-tlabel">${t.label}</span>
    </div>
  `).join('');
}

function refreshPalette() {
  const el = document.getElementById('edPalette');
  if (el) el.innerHTML = renderPaletteTiles(editorState.activeCat, editorState.selectedTile);
  document.querySelectorAll('.ed-cat').forEach(b => b.classList.toggle('on', b.dataset.cat === editorState.activeCat));
  wirePaletteClicks(document.getElementById('editorOverlay'));
}

function wirePaletteClicks(root) {
  root.querySelectorAll('.ed-tile').forEach(t => {
    t.addEventListener('click', () => {
      editorState.selectedTile = t.dataset.ch;
      root.querySelectorAll('.ed-tile').forEach(x => x.classList.toggle('on', x.dataset.ch === editorState.selectedTile));
    });
  });
}

// ─── Canvas ────────────────────────────────────────────────────────────────────
const ED_TS = 14; // tile size in editor canvas pixels
let edCanvas = null, edCtx = null;
let edDragging = false, edDragLast = null, edPanning = false;

function initEditorCanvas() {
  edCanvas = document.getElementById('edCanvas');
  edCtx = edCanvas.getContext('2d');
  edCtx.imageSmoothingEnabled = false;
  resizeEditorCanvas();

  edCanvas.addEventListener('mousedown',  onEdMouseDown);
  edCanvas.addEventListener('mousemove',  onEdMouseMove);
  edCanvas.addEventListener('mouseup',    onEdMouseUp);
  edCanvas.addEventListener('mouseleave', onEdMouseUp);
  edCanvas.addEventListener('wheel',      onEdWheel, { passive: true });
  edCanvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('resize', resizeEditorCanvas);
  redrawCanvas();
}

function resizeEditorCanvas() {
  if (!edCanvas) return;
  const wrap = document.getElementById('edCanvasWrap');
  if (!wrap) return;
  edCanvas.width  = wrap.clientWidth;
  edCanvas.height = wrap.clientHeight;
  redrawCanvas();
}

function tileUnderMouse(mx, my) {
  const s = editorState;
  const tx = Math.floor((mx + s.camX) / ED_TS);
  const ty = Math.floor(my / ED_TS);
  return { tx, ty };
}

function onEdMouseDown(e) {
  e.preventDefault();
  const s = editorState;
  const rect = edCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (edCanvas.width / rect.width);
  const my = (e.clientY - rect.top)  * (edCanvas.height / rect.height);

  if (e.shiftKey || e.button === 1) {
    edPanning = true; edDragLast = { x: e.clientX, y: e.clientY }; return;
  }
  if (e.button === 2) { s.erasing = true; s.painting = false; }
  else                { s.painting = true; s.erasing = false; }

  edDragging = true;
  paintAt(mx, my, e.button === 2);
}

function onEdMouseMove(e) {
  const s = editorState;
  const rect = edCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (edCanvas.width / rect.width);
  const my = (e.clientY - rect.top)  * (edCanvas.height / rect.height);

  // Update coord display
  const { tx, ty } = tileUnderMouse(mx, my);
  const coords = document.getElementById('edCoords');
  if (coords) coords.textContent = `${tx},${ty}`;

  if (edPanning && edDragLast) {
    const dx = e.clientX - edDragLast.x;
    s.camX = Math.max(0, Math.min(s.cols * ED_TS - edCanvas.width, s.camX - dx));
    edDragLast = { x: e.clientX, y: e.clientY };
    redrawCanvas(); return;
  }
  if (!edDragging) return;
  paintAt(mx, my, s.erasing);
}

function onEdMouseUp() {
  edDragging = false; edPanning = false; edDragLast = null;
  editorState.painting = false; editorState.erasing = false;
}

function onEdWheel(e) {
  const s = editorState;
  s.camX = Math.max(0, Math.min(s.cols * ED_TS - edCanvas.width, s.camX + e.deltaY * 0.8));
  redrawCanvas();
}

function paintAt(mx, my, erase) {
  const s = editorState;
  const { tx, ty } = tileUnderMouse(mx, my);
  if (tx < 0 || tx >= s.cols || ty < 0 || ty >= s.rows) return;
  const ch = erase ? '.' : s.selectedTile;
  if (s.grid[ty][tx] === ch) return;

  // Enforce single spawn & flag
  if (ch === '@') clearTileFromGrid('@');
  if (ch === 'F') clearTileFromGrid('F');

  s.grid[ty][tx] = ch;
  s.dirty = true;
  redrawCanvas();
}

function clearTileFromGrid(ch) {
  const s = editorState;
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++)
      if (s.grid[r][c] === ch) s.grid[r][c] = '.';
}

function resizeMap(newCols, newRows) {
  const s = editorState;
  const newGrid = [];
  for (let r = 0; r < newRows; r++) {
    const row = [];
    for (let c = 0; c < newCols; c++) {
      row.push((s.grid[r] && s.grid[r][c]) ? s.grid[r][c] : (r >= newRows - 2 ? '#' : '.'));
    }
    newGrid.push(row);
  }
  s.grid = newGrid;
  s.cols = newCols;
  s.rows = newRows;
  s.camX = Math.min(s.camX, Math.max(0, newCols * ED_TS - edCanvas.width));
}

// ─── Canvas draw ──────────────────────────────────────────────────────────────
const TILE_COLORS = {};
TILE_PALETTE.forEach(t => { TILE_COLORS[t.ch] = t.color; });

function redrawCanvas() {
  if (!edCtx || !editorState) return;
  const s = editorState;
  const W = edCanvas.width, H = edCanvas.height;
  edCtx.fillStyle = '#0b1020';
  edCtx.fillRect(0, 0, W, H);

  const camX = Math.floor(s.camX);
  const tx0 = Math.max(0, Math.floor(camX / ED_TS));
  const tx1 = Math.min(s.cols - 1, Math.ceil((camX + W) / ED_TS));

  for (let r = 0; r < s.rows; r++) {
    for (let c = tx0; c <= tx1; c++) {
      const ch  = s.grid[r][c];
      const px  = c * ED_TS - camX;
      const py  = r * ED_TS;
      const col = TILE_COLORS[ch] || '#222';

      edCtx.fillStyle = col;
      edCtx.fillRect(px, py, ED_TS, ED_TS);

      // Grid lines (subtle)
      edCtx.strokeStyle = 'rgba(0,0,0,0.18)';
      edCtx.lineWidth = 0.5;
      edCtx.strokeRect(px, py, ED_TS, ED_TS);

      // Special overlays
      if (ch !== '.') {
        edCtx.fillStyle = 'rgba(0,0,0,0.55)';
        edCtx.font = `bold ${ED_TS - 3}px monospace`;
        edCtx.textAlign = 'center';
        edCtx.textBaseline = 'middle';
        edCtx.fillText(ch, px + ED_TS / 2, py + ED_TS / 2);
      }
    }
  }

  // Selected tile cursor highlight (last hovered cell)
  // Draw scroll bar
  if (s.cols * ED_TS > W) {
    const barW = W * (W / (s.cols * ED_TS));
    const barX = (camX / (s.cols * ED_TS - W)) * (W - barW);
    edCtx.fillStyle = 'rgba(255,244,214,0.25)';
    edCtx.fillRect(barX, H - 4, barW, 4);
  }

  edCtx.textAlign = 'left';
  edCtx.textBaseline = 'alphabetic';
}

// ─── TEST mode ────────────────────────────────────────────────────────────────
let _preTestState = null;

function testMap() {
  const s = editorState;

  // Validate: must have @ spawn and F flag
  let hasSpawn = false, hasFlag = false;
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      if (s.grid[r][c] === '@') hasSpawn = true;
      if (s.grid[r][c] === 'F') hasFlag  = true;
    }
  if (!hasSpawn) { showEditorToast('Place a spawn point (@) first!'); return; }
  if (!hasFlag)  { showEditorToast('Place a flag (F) first!');        return; }

  // Hide editor overlay, start level from grid
  const el = document.getElementById('editorOverlay');
  if (el) el.style.display = 'none';

  _preTestState = { editorState: JSON.parse(JSON.stringify(editorState)) };

  // Build the level rows as strings
  const rows = s.grid.map(row => row.join(''));

  // Inject a temporary level at the start of LEVELS (index 0 slot) — restored on exit
  _preTestState.level0 = Object.assign({}, LEVELS[0]);
  LEVELS[0] = { name: s.mapName || 'TEST', biome: 'grove', map: rows, _isTest: true };

  numPlayers = 1;
  startLevel(0);

  // Register Escape handler to return to editor
  window._editorTestEscHandler = function(e) {
    if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      exitTestMode();
    }
  };
  window.addEventListener('keydown', window._editorTestEscHandler, true);

  showEditorToast('ESC to return to editor');
}

function exitTestMode() {
  if (!_preTestState) return;

  // Remove escape handler
  if (window._editorTestEscHandler) {
    window.removeEventListener('keydown', window._editorTestEscHandler, true);
    window._editorTestEscHandler = null;
  }

  // Restore original level 0
  LEVELS[0] = _preTestState.level0;

  // Restore editor state
  editorState = _preTestState.editorState;
  _preTestState = null;

  // Show editor overlay again
  gameState = 'editor';
  stopMusic();

  const el = document.getElementById('editorOverlay');
  if (el) {
    el.style.display = 'flex';
    renderEditorUI(el);
  }
  showEditorToast('Back in editor');
}

// ─── Save / Load modals ───────────────────────────────────────────────────────
function showSaveModal() {
  const s = editorState;
  const slots = s.slots;
  let html = `<div class="ed-modal-box">
    <div class="ed-modal-title">SAVE MAP</div>
    <div class="ed-slot-list">`;
  for (let i = 0; i < EDITOR_MAX_SLOTS; i++) {
    const slot = slots[i];
    html += `<div class="ed-slot-row">
      <span class="ed-slot-num">${i + 1}</span>
      <span class="ed-slot-name">${slot ? slot.name : '— empty —'}</span>
      <button class="ed-sm-btn" data-save="${i}">SAVE</button>
    </div>`;
  }
  html += `</div><button class="ed-btn ghost ed-modal-close">CANCEL</button></div>`;
  showModal(html, el => {
    el.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.save);
        const newSlot = {
          name: s.mapName || 'MY LEVEL',
          cols: s.cols,
          rows: s.rows,
          grid: s.grid.map(r => r.join('')),
          savedAt: Date.now(),
        };
        s.slots[idx] = newSlot;
        saveEditorSlots(s.slots);
        s.dirty = false;
        hideModal();
        showEditorToast(`Saved to slot ${idx + 1}`);
      });
    });
    el.querySelector('.ed-modal-close').addEventListener('click', hideModal);
  });
}

function showLoadModal() {
  const s = editorState;
  const slots = s.slots;
  let html = `<div class="ed-modal-box">
    <div class="ed-modal-title">LOAD MAP</div>
    <div class="ed-slot-list">`;
  for (let i = 0; i < EDITOR_MAX_SLOTS; i++) {
    const slot = slots[i];
    html += `<div class="ed-slot-row">
      <span class="ed-slot-num">${i + 1}</span>
      <span class="ed-slot-name">${slot ? slot.name : '— empty —'}</span>
      ${slot ? `<button class="ed-sm-btn" data-load="${i}">LOAD</button>
                <button class="ed-sm-btn ghost" data-del="${i}">DEL</button>` : ''}
    </div>`;
  }
  html += `</div><button class="ed-btn ghost ed-modal-close">CANCEL</button></div>`;
  showModal(html, el => {
    el.querySelectorAll('[data-load]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.load);
        const slot = s.slots[idx]; if (!slot) return;
        s.grid = slot.grid.map(row => row.split(''));
        s.cols = slot.cols;
        s.rows = slot.rows;
        s.mapName = slot.name;
        s.camX = 0;
        s.dirty = false;
        hideModal();
        // Full re-render so name input and canvas update
        const overlay = document.getElementById('editorOverlay');
        if (overlay) renderEditorUI(overlay);
        showEditorToast(`Loaded: ${slot.name}`);
      });
    });
    el.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.del);
        if (confirm(`Delete slot ${idx + 1}?`)) {
          s.slots[idx] = null;
          saveEditorSlots(s.slots);
          hideModal();
          showLoadModal();
        }
      });
    });
    el.querySelector('.ed-modal-close').addEventListener('click', hideModal);
  });
}

// ─── Export / Import ──────────────────────────────────────────────────────────

// Encode the current map to a base64 share code
function encodeMapToCode(s) {
  const rows = s.grid.map(r => r.join(''));
  const parts = [s.mapName || 'MY LEVEL', s.cols, s.rows, ...rows];
  const joined = parts.join('|');
  return btoa(unescape(encodeURIComponent(joined)));
}

// Build a full ?play= share URL from current map
function buildShareURL(s) {
  const code = encodeMapToCode(s);
  const base = window.location.origin + window.location.pathname;
  return base + '?play=' + code;
}

function exportMap() {
  const s = editorState;
  const code = encodeMapToCode(s);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      showEditorToast('Code copied to clipboard!');
    }).catch(() => showExportFallback(code));
  } else {
    showExportFallback(code);
  }
}

function shareMap() {
  const s = editorState;
  const url = buildShareURL(s);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showEditorToast('Share URL copied!');
    }).catch(() => showExportFallback(url));
  } else {
    showExportFallback(url);
  }
}

function showExportFallback(text) {
  const html = `<div class="ed-modal-box">
    <div class="ed-modal-title">COPY THIS</div>
    <textarea class="ed-export-area" readonly>${text}</textarea>
    <button class="ed-btn ghost ed-modal-close">CLOSE</button>
  </div>`;
  showModal(html, el => {
    el.querySelector('.ed-export-area').select();
    el.querySelector('.ed-modal-close').addEventListener('click', hideModal);
  });
}

function showImportModal() {
  const html = `<div class="ed-modal-box">
    <div class="ed-modal-title">IMPORT CODE</div>
    <textarea class="ed-export-area" id="edImportArea" placeholder="Paste export code here…"></textarea>
    <div class="ed-modal-row">
      <button class="ed-btn" id="edImportConfirm">IMPORT</button>
      <button class="ed-btn ghost ed-modal-close">CANCEL</button>
    </div>
  </div>`;
  showModal(html, el => {
    el.querySelector('#edImportConfirm').addEventListener('click', () => {
      const code = el.querySelector('#edImportArea').value.trim();
      if (!code) return;
      try {
        const decoded = decodeURIComponent(escape(atob(code)));
        const parts = decoded.split('|');
        const name = parts[0];
        const cols = parseInt(parts[1]);
        const rows = parseInt(parts[2]);
        const rowStrs = parts.slice(3);
        if (rowStrs.length !== rows) throw new Error('row count mismatch');
        const grid = rowStrs.map(r => r.split(''));
        editorState.mapName = name;
        editorState.cols = cols;
        editorState.rows = rows;
        editorState.grid = grid;
        editorState.camX = 0;
        editorState.dirty = true;
        hideModal();
        const overlay = document.getElementById('editorOverlay');
        if (overlay) renderEditorUI(overlay);
        showEditorToast(`Imported: ${name}`);
      } catch(e) {
        showEditorToast('Invalid code — could not import.');
      }
    });
    el.querySelector('.ed-modal-close').addEventListener('click', hideModal);
  });
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function showModal(html, wire) {
  const el = document.getElementById('edModal');
  if (!el) return;
  el.innerHTML = html;
  el.style.display = 'flex';
  if (wire) wire(el);
}
function hideModal() {
  const el = document.getElementById('edModal');
  if (el) el.style.display = 'none';
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let _edToastTimer = null;
function showEditorToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(_edToastTimer);
  _edToastTimer = setTimeout(() => { t.style.display = 'none'; }, 1800);
}
