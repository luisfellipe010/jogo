/* Blip's Grove — ghost.js  (M5.3)
 *
 * Records P1 input frames during a run. On level complete, if the run is a
 * new best time, compresses the recording with CompressionStream (gzip) and
 * saves it to localStorage under `blipgrove_ghost_<level>`.
 *
 * On the next run (when "Race ghost" is ON in Settings), the saved ghost is
 * loaded, decompressed, and replayed as a translucent silhouette drawn over
 * the game canvas.  No collision with the live player — pure visual.
 *
 * Public API (called by engine.js / ui.js):
 *   ghostStartRecording(levelIdx)   — call at level start
 *   ghostRecordFrame(p1)            — call each game-logic frame while playing
 *   ghostSaveIfBest(levelIdx, elapsed)  — call on level complete
 *   ghostStartPlayback(levelIdx)    — call at level start (after recording starts)
 *   ghostUpdate()                   — call each game-logic frame
 *   ghostDraw(ctx, camX, camY)      — call in draw loop (after tiles, before HUD)
 *   ghostEnabled()                  — returns bool (settings toggle)
 */

'use strict';

// ─── Storage ────────────────────────────────────────────────────────────────
const GHOST_KEY_PREFIX = 'blipgrove_ghost_';

function ghostKey(lvl) { return GHOST_KEY_PREFIX + lvl; }

// Compress Uint8Array → base64 string via CompressionStream (gzip)
async function compress(bytes) {
  if (typeof CompressionStream === 'undefined') {
    // Fallback: store raw base64 (no compression)
    return btoa(String.fromCharCode(...bytes));
  }
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return btoa(String.fromCharCode(...out));
}

// Decompress base64 string → Uint8Array
async function decompress(b64, compressed) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!compressed || typeof DecompressionStream === 'undefined') return bytes;
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function saveGhost(lvl, frames, startX, startY) {
  // Each frame: x(f32) y(f32) dir(i8) state(u8) = 9 bytes
  // State bits: 0=onGround 1=gliding 2=wallSlide 3=dashing
  const buf = new ArrayBuffer(8 + frames.length * 9);
  const view = new DataView(buf);
  view.setFloat32(0, startX, true);
  view.setFloat32(4, startY, true);
  let off = 8;
  for (const f of frames) {
    view.setFloat32(off,     f.x,  true); off += 4;
    view.setFloat32(off,     f.y,  true); off += 4;
    view.setInt8(off,        f.dir);      off += 1;
  }
  const bytes = new Uint8Array(buf);
  const useGzip = typeof CompressionStream !== 'undefined';
  const b64 = await compress(bytes);
  const record = { v: 1, gz: useGzip, frames: frames.length, data: b64 };
  try { localStorage.setItem(ghostKey(lvl), JSON.stringify(record)); } catch(e) {}
}

async function loadGhost(lvl) {
  try {
    const raw = localStorage.getItem(ghostKey(lvl));
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.v !== 1) return null;
    const bytes = await decompress(record.data, record.gz);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const startX = view.getFloat32(0, true);
    const startY = view.getFloat32(4, true);
    const frameCount = record.frames;
    const frames = [];
    let off = 8;
    for (let i = 0; i < frameCount; i++) {
      const x   = view.getFloat32(off, true); off += 4;
      const y   = view.getFloat32(off, true); off += 4;
      const dir = view.getInt8(off);          off += 1;
      frames.push({ x, y, dir });
    }
    return { startX, startY, frames };
  } catch(e) { return null; }
}

// ─── Settings integration ────────────────────────────────────────────────────
function ghostEnabled() {
  // settings is a global from settings.js; default on if key missing
  if (typeof settings === 'undefined') return true;
  return settings.raceGhost !== false;
}

// ─── Recording ───────────────────────────────────────────────────────────────
let _recording = false;
let _recFrames = [];
let _recLevel  = -1;
let _recStartX = 0;
let _recStartY = 0;

function ghostStartRecording(levelIdx) {
  _recording  = true;
  _recFrames  = [];
  _recLevel   = levelIdx;
  _recStartX  = 0;
  _recStartY  = 0;
}

function ghostRecordFrame(p1) {
  if (!_recording || !p1) return;
  if (_recFrames.length === 0) {
    _recStartX = p1.x;
    _recStartY = p1.y;
  }
  _recFrames.push({ x: p1.x, y: p1.y, dir: p1.dir });
}

// Call on level complete. Saves only when a new best time is set.
function ghostSaveIfBest(levelIdx, elapsed, prevBest) {
  if (!_recording) return;
  _recording = false;
  const isNewBest = (prevBest === undefined || elapsed < prevBest);
  if (!isNewBest) return;
  // Fire-and-forget async save
  saveGhost(levelIdx, _recFrames, _recStartX, _recStartY);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
let _ghost = null;       // loaded ghost data: { frames[], startX, startY }
let _ghostFrame = 0;     // current playback frame index
let _ghostLoaded = false;
let _ghostVisible = false;

function ghostStartPlayback(levelIdx) {
  _ghost       = null;
  _ghostFrame  = 0;
  _ghostLoaded = false;
  _ghostVisible = false;

  if (!ghostEnabled()) return;

  loadGhost(levelIdx).then(data => {
    if (!data) return;
    _ghost       = data;
    _ghostLoaded = true;
    _ghostVisible = true;
  });
}

// Advance the ghost one frame. Call each game-logic tick while gameState==='play'.
function ghostUpdate() {
  if (!_ghostLoaded || !_ghost || !_ghostVisible) return;
  _ghostFrame++;
  if (_ghostFrame >= _ghost.frames.length) {
    _ghostVisible = false; // ghost finished the level — hide it
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function ghostDraw(ctx, camX, camY) {
  if (!_ghostLoaded || !_ghost || !_ghostVisible) return;
  const fidx = Math.min(_ghostFrame, _ghost.frames.length - 1);
  const f    = _ghost.frames[fidx];
  const sx   = Math.floor(f.x - camX);
  const sy   = Math.floor(f.y - camY);

  // ---- Draw silhouette (translucent P1 palette, washed out) ----
  ctx.save();
  ctx.globalAlpha = 0.32;

  // Pulse: fade in/out gently over time
  const pulse = 0.82 + 0.18 * Math.sin(fidx * 0.07);
  ctx.globalAlpha = 0.30 * pulse;

  // Use a cyan-ish tint matching P1 but desaturated
  const GHOST_COL  = '#7ff2e2'; // P1 hi
  const GHOST_MID  = '#2dd4bf';
  const GHOST_DARK = '#0e8c7d';
  const GHOST_OUT  = '#0b1020';

  const dir = f.dir || 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(sx + 1, sy + 13, 10, 1);

  // Body outline (darkened silhouette)
  ctx.fillStyle = GHOST_OUT;
  ctx.fillRect(sx + 1, sy + 2, 10, 11);
  ctx.fillRect(sx + 2, sy + 1,  8,  1);
  ctx.fillRect(sx + 2, sy + 12, 8,  1);

  // Body fill
  ctx.fillStyle = GHOST_COL;
  ctx.fillRect(sx + 2, sy + 2, 8, 11);

  // Face (slightly darker band)
  ctx.fillStyle = GHOST_MID;
  ctx.fillRect(sx + 3, sy + 3, 6, 4);

  // Shade (lower body)
  ctx.fillStyle = GHOST_DARK;
  ctx.fillRect(sx + 2, sy + 9, 8, 4);

  // Eyes (direction-aware)
  ctx.fillStyle = GHOST_OUT;
  if (dir > 0) {
    ctx.fillRect(sx + 5, sy + 4, 1, 1);
    ctx.fillRect(sx + 8, sy + 4, 1, 1);
  } else {
    ctx.fillRect(sx + 3, sy + 4, 1, 1);
    ctx.fillRect(sx + 6, sy + 4, 1, 1);
  }

  // Hat nub (P1 style)
  ctx.fillStyle = GHOST_MID;
  ctx.fillRect(sx + 5, sy,     2, 1);
  ctx.fillRect(sx + 4, sy - 1, 4, 1);

  // Sparkle trail — a few pixels behind the ghost
  if (fidx > 2) {
    for (let t = 1; t <= 3; t++) {
      const tf = _ghost.frames[fidx - t];
      if (!tf) continue;
      const tx = Math.floor(tf.x - camX) + 6;
      const ty = Math.floor(tf.y - camY) + 7;
      const a  = (0.18 * (1 - t / 4)) * pulse;
      ctx.globalAlpha = a;
      ctx.fillStyle = GHOST_COL;
      ctx.fillRect(tx, ty, 1, 1);
    }
  }

  ctx.restore();
}

// ─── Label shown in HUD ────────────────────────────────────────────────────
// Returns the ghost's current elapsed time offset, useful for a race indicator
function ghostCurrentFrame() { return _ghostFrame; }
function ghostTotalFrames()  { return _ghost ? _ghost.frames.length : 0; }
function ghostIsVisible()    { return _ghostVisible; }
