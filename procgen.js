/* Blip's Grove — procgen.js  (M6: Procedural levels + Infinite mode)
 *
 * Generates valid, playable platform levels from a numeric seed.
 * Each generated level is fully compatible with the existing loadMap() system —
 * it produces a rows[] array of strings, exactly like LEVELS[n].map.
 *
 * Public API:
 *   procgenLevel(seed, opts)   → { name, biome, map: string[] }
 *   startInfiniteMode()        → enters infinite mode from level 0
 *   isInfiniteMode()           → bool
 *   infiniteLevelIndex()       → how many procedural levels have been cleared
 *   infiniteNextLevel()        → generate + start the next infinite level
 *   exitInfiniteMode()         → return to title
 *
 * Design goals:
 *   - Always solvable: spawn on solid ground, flag always reachable
 *   - Varied: platforms, gaps, enemies, gems, hazards scale with depth
 *   - Fast: pure synchronous, no async
 *   - Seeded: same seed always produces identical output (sharable)
 */

'use strict';

// ─── Seeded PRNG (xoshiro128** via mulberry32) ────────────────────────────────
function _mkRng(seed) {
  let s = seed >>> 0;
  // Splitmix32 to warm up
  for (let i = 0; i < 8; i++) { s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) + 0x6d2b79f5) >>> 0; }
  return {
    next() {
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); },
    pick(arr)   { return arr[Math.floor(this.next() * arr.length)]; },
    bool(p)     { return this.next() < (p ?? 0.5); },
  };
}

// ─── Biome definitions ────────────────────────────────────────────────────────
const BIOMES = ['grove', 'beach', 'cave', 'sky'];
const BIOME_FLOOR = {
  grove: { top: '#', sub: '=' },
  beach: { top: '#', sub: '=' },
  cave:  { top: 'B', sub: 'B' },
  sky:   { top: '#', sub: '=' },
};
const BIOME_BG = {
  grove: '.',
  beach: '.',
  cave:  'B',
  sky:   '.',
};
const BIOME_ENEMIES = {
  grove: ['S', 'V', 'Y'],
  beach: ['S', 'T', 'N'],
  cave:  ['W', 'Y', 'N'],
  sky:   ['S', 'V', 'W'],
};
const BIOME_NAMES = {
  grove: ['DAWN GROVE',  'MOSSY PATH',   'LEAF HOLLOW', 'SUNKEN GLADE'],
  beach: ['CORAL DRIFT', 'SANDY SHORES', 'TIDE RUSH',   'DUNE BLITZ'],
  cave:  ['IRON DEPTHS', 'ECHO MINE',    'DARK GROTTO', 'CRYSTAL MAZE'],
  sky:   ['CLOUD SPIRE', 'WINDY KEEP',   'STORM ISLE',  'MIST PEAK'],
};

// ─── Generator ───────────────────────────────────────────────────────────────
/**
 * procgenLevel(seed, opts) → { name, biome, map: string[] }
 *
 * opts: {
 *   biome?:   'grove'|'beach'|'cave'|'sky'  (random if omitted)
 *   depth?:   0-9  (0=easy, 9=hard; scales enemy count, gap size, hazards)
 *   cols?:    number (default 80)
 *   rows?:    number (default 14)
 * }
 */
function procgenLevel(seed, opts = {}) {
  const rng   = _mkRng(seed);
  const depth = Math.max(0, Math.min(9, opts.depth ?? 0));
  const biome = opts.biome ?? rng.pick(BIOMES);
  const COLS  = opts.cols ?? 80;
  const ROWS  = opts.rows ?? 14;

  // Terrain rows above and below the action zone
  const SKY_ROWS   = 4;   // top rows always empty (or cave walls)
  const FLOOR_ROW  = ROWS - 3; // where the main floor sits (0-indexed)
  const FLOOR_ROWS = 3;        // thickness of floor

  const bgChar = BIOME_BG[biome];

  // ── Grid initialisation ────────────────────────────────────────────────────
  // grid[row][col] — character
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (biome === 'cave') {
        // cave: brick walls everywhere except interior
        if (r === 0 || c === 0 || c === COLS - 1) row.push('B');
        else row.push('.');
      } else {
        row.push('.');
      }
    }
    grid.push(row);
  }

  // ── Main floor ────────────────────────────────────────────────────────────
  const floorTiles = BIOME_FLOOR[biome];
  for (let r = FLOOR_ROW; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (biome === 'cave' && (c === 0 || c === COLS - 1)) continue; // wall already set
      grid[r][c] = (r === FLOOR_ROW) ? floorTiles.top : floorTiles.sub;
    }
  }

  // ── Gap carving ───────────────────────────────────────────────────────────
  // Gaps are stretches where floor is removed (player must jump or use platforms)
  // Leave safe zone at start (spawn) and near end (flag)
  const safeStart = 5;
  const safeEnd   = COLS - 8;
  const numGaps   = rng.int(2 + depth, 4 + depth * 2);
  const gapZones  = [];

  let cursor = safeStart + rng.int(4, 8);
  for (let g = 0; g < numGaps && cursor < safeEnd - 4; g++) {
    const gapW = rng.int(2 + Math.floor(depth / 3), 4 + Math.floor(depth / 2));
    const start = cursor;
    const end   = Math.min(cursor + gapW, safeEnd);
    gapZones.push({ start, end });
    // Carve gap in floor
    for (let c = start; c < end; c++) {
      for (let r = FLOOR_ROW; r < ROWS; r++) {
        if (biome === 'cave') {
          // cave: leave it as is (floor is dirt, just remove top layer)
          if (r === FLOOR_ROW) grid[r][c] = '.';
          if (r > FLOOR_ROW) grid[r][c] = 'B'; // keep brick below
        } else {
          grid[r][c] = '.';
        }
      }
    }
    cursor += gapW + rng.int(5, 10);
  }

  // ── Platforms ─────────────────────────────────────────────────────────────
  // Place platforms above gaps and scattered over solid sections
  // Platform types: P=wood, B=brick, M=moving (parsed by loadMap)
  const plats = [];

  // Bridge gaps (required for solvability)
  for (const gap of gapZones) {
    const gapMid   = (gap.start + gap.end) >> 1;
    const platRow  = FLOOR_ROW - rng.int(3, 6);
    const platW    = rng.int(3, 5);
    const platX    = Math.max(1, gapMid - Math.floor(platW / 2));
    const kind     = rng.bool(0.3) ? 'M' : (biome === 'sky' && rng.bool(0.4) ? 'c' : 'P');
    // Moving platforms (M) need their own row — place as single tile string
    if (kind === 'M') {
      const r = platRow;
      const c = Math.min(platX, COLS - 5);
      grid[r][c] = 'M';
    } else if (kind === 'c') {
      // cloud: mark 3 wide
      const r = platRow;
      const c = Math.min(platX, COLS - 4);
      for (let i = 0; i < 3 && c + i < COLS - 1; i++) grid[r][c + i] = 'c';
    } else {
      const r = platRow;
      for (let i = 0; i < platW && platX + i < COLS - 1; i++) {
        grid[r][platX + i] = kind;
      }
    }
    plats.push({ x: platX, y: platRow, w: platW });
  }

  // Extra decorative platforms (not bridging gaps)
  const extraPlats = rng.int(2, 4 + depth);
  for (let i = 0; i < extraPlats; i++) {
    const r    = FLOOR_ROW - rng.int(2, 7);
    const c    = rng.int(4, COLS - 8);
    const w    = rng.int(2, 5);
    const kind = rng.bool(0.2) ? 'B' : 'P';
    // Don't overwrite existing non-air
    if (grid[r][c] !== '.' && grid[r][c] !== bgChar) continue;
    for (let j = 0; j < w && c + j < COLS - 1; j++) {
      if (grid[r][c + j] === '.' || grid[r][c + j] === bgChar) grid[r][c + j] = kind;
    }
    plats.push({ x: c, y: r, w });
  }

  // ── Sky biome extras ──────────────────────────────────────────────────────
  if (biome === 'sky') {
    // Wind gust strips
    const windCount = rng.int(1, 2 + Math.floor(depth / 2));
    for (let i = 0; i < windCount; i++) {
      const r = FLOOR_ROW - rng.int(2, 5);
      const c = rng.int(4, COLS - 12);
      const w = rng.int(4, 8);
      const dir = rng.bool() ? '>' : '<';
      for (let j = 0; j < w && c + j < COLS - 2; j++) {
        if (grid[r][c + j] === '.') grid[r][c + j] = dir;
      }
    }
  }

  // ── Hazards ───────────────────────────────────────────────────────────────
  // Spikes on floor (not in gaps, not at spawn/flag)
  const numSpikes = rng.int(0, 2 + Math.floor(depth / 2));
  for (let i = 0; i < numSpikes; i++) {
    const c = rng.int(safeStart + 3, safeEnd - 3);
    // Don't place in a gap
    const inGap = gapZones.some(g => c >= g.start && c < g.end);
    if (inGap) continue;
    if (grid[FLOOR_ROW - 1][c] === '.') grid[FLOOR_ROW - 1][c] = '^';
  }

  // ── Gems ──────────────────────────────────────────────────────────────────
  // Scatter gems on platforms and above floor
  const numGems = rng.int(8 + depth, 14 + depth * 2);
  for (let i = 0; i < numGems; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 12 && !placed; attempt++) {
      const c = rng.int(2, COLS - 3);
      // Find a surface to sit on
      for (let r = SKY_ROWS; r < FLOOR_ROW; r++) {
        const below = grid[r + 1] && grid[r + 1][c];
        const isSurf = below === '#' || below === '=' || below === 'B' || below === 'P';
        if (grid[r][c] === '.' && isSurf) {
          grid[r][c] = 'G';
          placed = true;
          break;
        }
      }
      // Also place floating gems above gap zones
      if (!placed) {
        const inGap = gapZones.find(g => c >= g.start && c < g.end);
        if (inGap) {
          const r = FLOOR_ROW - rng.int(3, 6);
          if (r >= SKY_ROWS && grid[r][c] === '.') { grid[r][c] = 'G'; placed = true; }
        }
      }
    }
  }

  // ── Hidden ? blocks ───────────────────────────────────────────────────────
  const numBlocks = rng.int(1, 3 + Math.floor(depth / 2));
  for (let i = 0; i < numBlocks; i++) {
    const c = rng.int(6, COLS - 6);
    const r = FLOOR_ROW - rng.int(3, 6);
    if (grid[r][c] === '.') grid[r][c] = '?';
  }

  // ── Checkpoint ────────────────────────────────────────────────────────────
  // One checkpoint roughly in the middle
  {
    const midC = Math.floor(COLS / 2) + rng.int(-4, 4);
    const inGap = gapZones.some(g => midC >= g.start && midC < g.end);
    if (!inGap && grid[FLOOR_ROW - 1][midC] === '.') {
      grid[FLOOR_ROW - 1][midC] = 'C';
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────────
  const enemyPool  = BIOME_ENEMIES[biome];
  const numEnemies = rng.int(1 + Math.floor(depth / 2), 2 + depth);
  let enemiesPlaced = 0;
  for (let attempt = 0; attempt < 60 && enemiesPlaced < numEnemies; attempt++) {
    const c = rng.int(safeStart + 4, safeEnd - 2);
    // Enemies sit on the floor row
    const inGap = gapZones.some(g => c >= g.start && c < g.end);
    if (inGap) continue;
    if (grid[FLOOR_ROW - 1][c] !== '.') continue;
    const kind = rng.pick(enemyPool);
    if (kind === 'V') {
      // Flyer: place above ground
      const r = FLOOR_ROW - rng.int(3, 6);
      if (grid[r][c] === '.') { grid[r][c] = 'V'; enemiesPlaced++; }
    } else {
      grid[FLOOR_ROW - 1][c] = kind;
      enemiesPlaced++;
    }
  }

  // ── Spawn (@) and Flag (F) ────────────────────────────────────────────────
  // Spawn: col 2, sitting on floor
  grid[FLOOR_ROW - 1][2] = '@';
  // Flag: last clear column near end
  let flagC = safeEnd + 1;
  while (flagC > safeStart && gapZones.some(g => flagC >= g.start && flagC < g.end)) flagC--;
  grid[FLOOR_ROW - 1][flagC] = 'F';

  // ── Level name ────────────────────────────────────────────────────────────
  const namePool = BIOME_NAMES[biome];
  const name = rng.pick(namePool) + ' ' + (seed % 1000);

  // ── Serialise to string rows ──────────────────────────────────────────────
  const mapRows = grid.map(row => row.join(''));

  return { name, biome, map: mapRows };
}

// ─── Shareable seed codes ─────────────────────────────────────────────────────
// Encode a seed + biome + depth into a short base36 share code.
// Format: "PG-" + base36(packed uint32)
//   bits 0-3:  depth  (0-9)
//   bits 4-5:  biome index (0-3)
//   bits 6-31: seed (26 bits, range 0-67108863)

function procgenEncodeSeed(seed, biome, depth) {
  const biomeIdx = BIOMES.indexOf(biome);
  const b = Math.max(0, Math.min(3, biomeIdx >= 0 ? biomeIdx : 0));
  const d = Math.max(0, Math.min(9, depth || 0));
  const s = (seed >>> 0) & 0x3FFFFFF; // 26 bits
  const packed = (s << 6) | (b << 4) | d;
  return 'PG-' + packed.toString(36).toUpperCase();
}

function procgenDecodeSeed(code) {
  if (!code) return null;
  const raw = code.replace(/^PG-/i, '');
  const packed = parseInt(raw, 36);
  if (isNaN(packed)) return null;
  const depth    = packed & 0xF;
  const biomeIdx = (packed >> 4) & 0x3;
  const seed     = (packed >> 6) & 0x3FFFFFF;
  return { seed, biome: BIOMES[biomeIdx] || 'grove', depth };
}

// Start infinite mode from a specific seed code
function startInfiniteFromSeed(codeOrSeed) {
  let seed0, biome0, depth0;
  if (typeof codeOrSeed === 'string') {
    const dec = procgenDecodeSeed(codeOrSeed);
    if (!dec) { if (typeof toast === 'function') toast('Invalid seed code'); return; }
    seed0  = dec.seed;
    biome0 = dec.biome;
    depth0 = dec.depth;
  } else {
    seed0  = (codeOrSeed >>> 0);
    biome0 = null;
    depth0 = 0;
  }
  _infiniteMode   = true;
  _infiniteIndex  = 0;
  _infiniteSeed0  = seed0;
  _infiniteBiome0 = biome0;
  _infiniteDepth0 = depth0;
  _pushInfiniteLevel();
  if (typeof numPlayers !== 'undefined') numPlayers = numPlayers || 1;
  if (typeof hideBanner === 'function') hideBanner();
  if (typeof startTransition === 'function') startTransition(() => startLevel(LEVELS.length - 1));
  else if (typeof startLevel === 'function') startLevel(LEVELS.length - 1);
}

// Get the seed code for the current infinite run
function getCurrentInfiniteSeedCode() {
  if (!_infiniteMode) return null;
  const biome = BIOMES[_infiniteIndex % BIOMES.length];
  return procgenEncodeSeed(_infiniteSeed0, biome, _infiniteDepth0 || 0);
}
let _infiniteMode   = false;
let _infiniteIndex  = 0;   // how many procedural levels cleared
let _infiniteSeed0  = 0;   // base seed (randomised per run)
let _infiniteBiome0 = null; // forced starting biome (from seed code) or null
let _infiniteDepth0 = 0;    // forced starting depth (from seed code)
const _INFINITE_SAVE_KEY = 'blipgrove_infinite_best';

function isInfiniteMode()   { return _infiniteMode; }
function infiniteLevelIndex() { return _infiniteIndex; }

function _infiniteSeed(idx) {
  // Each level gets a deterministic seed derived from the run seed + idx
  return (_infiniteSeed0 + idx * 1337 + idx * idx * 7) >>> 0;
}

function _infiniteDepth(idx) {
  // 0 → 0, 5 → 3, 10 → 6, 15+ → 9
  return Math.min(9, Math.floor(idx * 0.6));
}

function _loadInfiniteBest() {
  try { return parseInt(localStorage.getItem(_INFINITE_SAVE_KEY)) || 0; } catch(e) { return 0; }
}
function _saveInfiniteBest(n) {
  try { localStorage.setItem(_INFINITE_SAVE_KEY, n); } catch(e) {}
}

// Start infinite mode. Call from ui.js title button.
function startInfiniteMode() {
  _infiniteMode  = true;
  _infiniteIndex = 0;
  _infiniteSeed0 = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  _infiniteBiome0 = null;
  _infiniteDepth0 = 0;

  // Inject a sentinel LEVELS entry so engine.js level machinery still works
  _pushInfiniteLevel();

  numPlayers = numPlayers || 1;
  hideBanner && hideBanner();
  startTransition(() => startLevel(LEVELS.length - 1));
}

function _pushInfiniteLevel() {
  // Remove any previously injected infinite level (marked with _isInfinite)
  const prev = LEVELS.findIndex(L => L._isInfinite);
  if (prev >= 0) LEVELS.splice(prev, 1);

  const depth = _infiniteBiome0 && _infiniteIndex === 0 ? _infiniteDepth0 : _infiniteDepth(_infiniteIndex);
  const biome = _infiniteBiome0 && _infiniteIndex === 0 ? _infiniteBiome0 : BIOMES[_infiniteIndex % BIOMES.length];
  const seed  = _infiniteSeed(_infiniteIndex);
  const gen   = procgenLevel(seed, { biome, depth });

  LEVELS.push({
    name:       gen.name,
    biome:      gen.biome,
    map:        gen.map,
    _isInfinite: true,
    _seed:      seed,
    _seedCode:  procgenEncodeSeed(seed, gen.biome, depth),
    _infiniteIdx: _infiniteIndex,
  });
}

// Called by levelComplete() in engine.js when finishing an infinite level
function infiniteNextLevel() {
  if (!_infiniteMode) return;
  _infiniteIndex++;

  // Check best
  const best = _loadInfiniteBest();
  if (_infiniteIndex > best) _saveInfiniteBest(_infiniteIndex);

  // Achievement: floor 10
  if (typeof achievementCheck === 'function') achievementCheck('infinite_floor', { floor: _infiniteIndex });

  _pushInfiniteLevel();
  startTransition(() => startLevel(LEVELS.length - 1));
}

// Return to title and clean up
function exitInfiniteMode() {
  _infiniteMode = false;
  // Remove any infinite LEVELS entries
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (LEVELS[i]._isInfinite) LEVELS.splice(i, 1);
  }
  showTitle && showTitle();
}

// ─── Infinite mode HUD overlay ────────────────────────────────────────────────
// Called from ui.js draw loop (or from engine draw)
function drawInfiniteHud() {
  if (!_infiniteMode) return;
  const el = document.getElementById('infiniteHud');
  if (!el) return;
  el.style.display = '';
  el.textContent = '∞ ' + (_infiniteIndex + 1);
}

function hideInfiniteHud() {
  const el = document.getElementById('infiniteHud');
  if (el) el.style.display = 'none';
}

// Called from levelComplete() to get the infinite-mode body text
function infiniteLevelClearBody() {
  if (!_infiniteMode) return '';
  const best    = _loadInfiniteBest();
  const isNew   = _infiniteIndex + 1 >= best;
  const nextSeed = _infiniteSeed(_infiniteIndex + 1);
  const nextBiome = BIOMES[(_infiniteIndex + 1) % BIOMES.length];
  const nextDepth = _infiniteDepth(_infiniteIndex + 1);
  const shareCode = procgenEncodeSeed(_infiniteSeed0, BIOMES[0], _infiniteDepth0 || 0);
  return `<div style="font-size:12px;margin:8px 0;">
    ∞ Cleared floor <b>${_infiniteIndex + 1}</b>
    ${isNew ? ' — <b>NEW RECORD!</b>' : `(best: ${best})`}
  </div>
  <div style="font-size:11px;color:#5a4a2a;margin-bottom:6px;">
    Next: depth ${nextDepth} · ${nextBiome.toUpperCase()} · seed ${nextSeed}
  </div>
  <div style="display:flex;align-items:center;gap:6px;background:#0b1020;padding:6px 8px;">
    <span style="font-size:9px;letter-spacing:1px;color:#7ff2e2;flex:1;">${shareCode}</span>
    <button onclick="navigator.clipboard&&navigator.clipboard.writeText('${shareCode}')"
      style="font-family:ui-monospace,monospace;font-size:8px;letter-spacing:1px;
             background:#fff4d6;color:#0b1020;border:0;padding:3px 8px;cursor:pointer;">
      ⎘ COPY SEED
    </button>
  </div>`;
}
