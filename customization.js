/* Blip's Grove — customization.js  (M7)
 *
 * Owns all character customization data, persistence, and the accessory
 * draw layer that sits on top of drawPlayer() in entities.js.
 *
 * Public API:
 *   OUTFITS            — array of outfit preset descriptors
 *   ACCESSORIES        — array of accessory descriptors
 *   IDLE_ANIMS         — array of idle animation descriptors
 *   loadCustomization()→ void  — call once at boot (done in ui.js)
 *   saveCustomization()→ void
 *   getPlayerCustom(idx) → { outfitIdx, accessoryIdx, faceDataUrl, idleAnimIdx }
 *   applyCustomToPlayer(p) → void  — patches p.pal + p.customAcc + p.idleAnimId
 *   drawAccessory(p,x,y)   → void  — called at end of drawPlayer()
 *   drawIdleAnim(p,x,y)    → void  — called instead of default idle when custom anim active
 *   openCustomizeMenu()    → void  — opens the in-game overlay
 *   closeCustomizeMenu()   → void
 */

'use strict';

// ─── Outfit presets ───────────────────────────────────────────────────────────
// Each outfit fully defines the 8-key palette used by drawPlayer().
const OUTFITS = [
  // ── P1 defaults first (teal), P2 defaults second (orange) ──
  { name:'Teal',    base:'#2dd4bf', hi:'#7ff2e2', mid:'#5ae6d1', shade:'#0e8c7d', dark:'#0a6e62', outline:'#083a33', strap:'#1a2e33', hat:'#22a995' },
  { name:'Orange',  base:'#ff9a3c', hi:'#ffd77a', mid:'#ffb04a', shade:'#c46a14', dark:'#7a3f08', outline:'#3a1e04', strap:'#2e1a04', hat:'#d07018' },
  { name:'Violet',  base:'#a855f7', hi:'#d8b4fe', mid:'#c084fc', shade:'#7e22ce', dark:'#581c87', outline:'#2d0a4e', strap:'#1e0a38', hat:'#9333ea' },
  { name:'Rose',    base:'#fb7185', hi:'#fda4af', mid:'#f472b6', shade:'#be123c', dark:'#881337', outline:'#4c0519', strap:'#3b0818', hat:'#e11d48' },
  { name:'Lime',    base:'#84cc16', hi:'#d9f99d', mid:'#a3e635', shade:'#4d7c0f', dark:'#365314', outline:'#1a2e05', strap:'#142208', hat:'#65a30d' },
  { name:'Sky',     base:'#38bdf8', hi:'#bae6fd', mid:'#7dd3fc', shade:'#0369a1', dark:'#0c4a6e', outline:'#082f49', strap:'#062030', hat:'#0ea5e9' },
  { name:'Amber',   base:'#fbbf24', hi:'#fef08a', mid:'#fcd34d', shade:'#b45309', dark:'#78350f', outline:'#3b1a07', strap:'#2a1205', hat:'#d97706' },
  { name:'Slate',   base:'#94a3b8', hi:'#e2e8f0', mid:'#cbd5e1', shade:'#475569', dark:'#1e293b', outline:'#0f172a', strap:'#0d1526', hat:'#64748b' },
  { name:'Crimson', base:'#ef4444', hi:'#fca5a5', mid:'#f87171', shade:'#991b1b', dark:'#7f1d1d', outline:'#450a0a', strap:'#350708', hat:'#dc2626' },
  { name:'Emerald', base:'#10b981', hi:'#6ee7b7', mid:'#34d399', shade:'#065f46', dark:'#064e3b', outline:'#022c22', strap:'#012418', hat:'#059669' },
  { name:'Indigo',  base:'#6366f1', hi:'#a5b4fc', mid:'#818cf8', shade:'#3730a3', dark:'#1e1b4b', outline:'#0d0b2e', strap:'#090821', hat:'#4f46e5' },
  { name:'Coral',   base:'#f97316', hi:'#fed7aa', mid:'#fb923c', shade:'#9a3412', dark:'#7c2d12', outline:'#431407', strap:'#330f05', hat:'#ea580c' },
];

// ─── Shoe presets ─────────────────────────────────────────────────────────────
const SHOES = [
  { id:'none',    name:'None',         draw: null },
  { id:'boots',   name:'Boots',        draw: drawShoeBoots },
  { id:'sneakers',name:'Sneakers',     draw: drawShoeSneakers },
  { id:'slippers',name:'Slippers',     draw: drawShoeSlippers },
  { id:'heels',   name:'Heels',        draw: drawShoeHeels },
];

// ─── Unlock system ────────────────────────────────────────────────────────────
// Locked accessories / shoes require specific medal combinations.
// unlockReq: function(save) → bool
const ACCESSORY_UNLOCKS = {
  'crown':    s => s && (s.medals?.['4'] || []).includes('clear'),          // clear Boss Arena
  'wizard':   s => s && Object.keys(s.medals || {}).filter(k => (s.medals[k]||[]).includes('noDamage')).length >= 3,
  'halo':     s => s && (s.levelsCleared?.length || 0) >= 6,
  'antennae': s => s && (s.medals?.['5'] || []).includes('secret'),         // secret in sky level
};
const SHOE_UNLOCKS = {
  'heels':    s => s && (s.medals?.['0'] || []).includes('speedrun'),       // speedrun Grove
};

function isAccessoryUnlocked(accId) {
  if (!ACCESSORY_UNLOCKS[accId]) return true; // no requirement = always unlocked
  try { return ACCESSORY_UNLOCKS[accId](typeof save !== 'undefined' ? save : null); }
  catch(e) { return false; }
}
function isShoeUnlocked(shoeId) {
  if (!SHOE_UNLOCKS[shoeId]) return true;
  try { return SHOE_UNLOCKS[shoeId](typeof save !== 'undefined' ? save : null); }
  catch(e) { return false; }
}
// id used as key; draw fn receives (ctx, x, y, dir, tick) where x/y is sprite top-left
const ACCESSORIES = [
  { id:'none',    name:'None',          draw: null },
  { id:'cap',     name:'Cap',           draw: drawAccCap },
  { id:'crown',   name:'Crown',         draw: drawAccCrown },
  { id:'wizard',  name:'Wizard Hat',    draw: drawAccWizard },
  { id:'bow',     name:'Bow',           draw: drawAccBow },
  { id:'glasses', name:'Glasses',       draw: drawAccGlasses },
  { id:'antennae',name:'Antennae',      draw: drawAccAntennae },
  { id:'halo',    name:'Halo',          draw: drawAccHalo },
];

// ─── Idle animations ──────────────────────────────────────────────────────────
const IDLE_ANIMS = [
  { id:'default', name:'Default (bob)' },
  { id:'dance',   name:'Dance' },
  { id:'wave',    name:'Wave' },
  { id:'think',   name:'Thinking' },
  { id:'spin',    name:'Spin' },
];

// ─── Persistence ──────────────────────────────────────────────────────────────
const CUSTOM_KEY = 'blipgrove_custom_v1';

const DEFAULT_CUSTOM = [
  { outfitIdx: 0, accessoryIdx: 0, shoeIdx: 0, faceDataUrl: null, idleAnimIdx: 0, nameTag: '', hslOverride: null }, // P1
  { outfitIdx: 1, accessoryIdx: 0, shoeIdx: 0, faceDataUrl: null, idleAnimIdx: 0, nameTag: '', hslOverride: null }, // P2
];

let _custom = null; // loaded lazily

function loadCustomization() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) { _custom = JSON.parse(JSON.stringify(DEFAULT_CUSTOM)); return; }
    const parsed = JSON.parse(raw);
    _custom = DEFAULT_CUSTOM.map((def, i) => Object.assign({}, def, parsed[i] || {}));
  } catch(e) {
    _custom = JSON.parse(JSON.stringify(DEFAULT_CUSTOM));
  }
}

function saveCustomization() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(_custom)); } catch(e) {}
}

function getPlayerCustom(idx) {
  if (!_custom) loadCustomization();
  return _custom[idx] || DEFAULT_CUSTOM[idx];
}

function setPlayerCustom(idx, patch) {
  if (!_custom) loadCustomization();
  Object.assign(_custom[idx], patch);
  saveCustomization();
}

// ─── Apply custom to live player object ───────────────────────────────────────
// Called by spawnPlayers / makePlayer override — patches pal + metadata.
function applyCustomToPlayer(p) {
  if (!_custom) loadCustomization();
  const c = _custom[p.idx];
  if (!c) return;
  // outfit palette
  const outfit = OUTFITS[c.outfitIdx] || OUTFITS[p.idx === 0 ? 0 : 1];
  p.pal = {
    base:    outfit.base,
    hi:      outfit.hi,
    mid:     outfit.mid,
    shade:   outfit.shade,
    dark:    outfit.dark,
    outline: outfit.outline,
    strap:   outfit.strap,
    hat:     outfit.hat,
  };
  // HSL override on base colour
  if (c.hslOverride) {
    const hsl = c.hslOverride;
    p.pal.base = `hsl(${hsl.h},${hsl.s}%,${hsl.l}%)`;
    p.pal.hi   = `hsl(${hsl.h},${Math.min(100,hsl.s+10)}%,${Math.min(95,hsl.l+20)}%)`;
    p.pal.mid  = `hsl(${hsl.h},${hsl.s}%,${Math.min(95,hsl.l+10)}%)`;
    p.pal.shade= `hsl(${hsl.h},${hsl.s}%,${Math.max(5,hsl.l-20)}%)`;
    p.pal.dark = `hsl(${hsl.h},${hsl.s}%,${Math.max(5,hsl.l-35)}%)`;
  }
  // store custom metadata on player for draw calls
  p.customAcc      = c.accessoryIdx || 0;
  p.customShoe     = c.shoeIdx      || 0;
  p.customFace     = c.faceDataUrl  || null;
  p.customIdleAnim = c.idleAnimIdx  || 0;
  p.nameTag        = (c.nameTag     || '').slice(0, 6);
  // Pre-load face image if set
  if (p.customFace && !p._faceImg) {
    const img = new Image();
    img.src = p.customFace;
    p._faceImg = img;
  }
}

// ─── Accessory draw functions ─────────────────────────────────────────────────
// All draw at pixel scale. x/y is top-left of the 12×14 player sprite.
// idleBob offset is NOT applied here — accessories move with the body naturally
// because drawAccessory is called with the same x/y as drawPlayer.

function drawAccessory(p, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  const blink = (p.iFrames > 0) && (Math.floor(typeof tick !== 'undefined' ? tick : 0) / 4 % 2 === 0);
  if (blink) return;
  const acc = ACCESSORIES[p.customAcc || 0];
  if (!acc || !acc.draw) return;
  // idle bob offset (matches entities.js)
  const walking = Math.abs(p.vx) > 0.3 && p.onGround;
  const jumping = !p.onGround;
  const idleBob = (!walking && !jumping) ? Math.round(Math.sin((p.idleT || 0) * 0.05)) : 0;
  acc.draw(x, y + idleBob, p.dir, typeof tick !== 'undefined' ? tick : 0, p.pal);
}

// ── Cap ──
function drawAccCap(x, y, dir, t, pal) {
  // brim + dome sitting on head
  rect(x+1, y-2, 10, 3, '#c8391a'); // dome
  rect(x+1, y-3, 10, 1, '#e04020'); // top highlight
  rect(x,   y-1,  2, 1, '#c8391a'); // brim left
  rect(x+10, y-1, 2, 1, '#c8391a'); // brim right
  // visor
  if (dir > 0) rect(x+9, y,   3, 1, '#9a2810');
  else         rect(x-1, y,   3, 1, '#9a2810');
  px(x+1, y-2, '#f06040');
}

// ── Crown ──
function drawAccCrown(x, y, dir, t, pal) {
  rect(x+2, y-3, 8, 3, '#f0c020'); // base band
  // three points
  rect(x+2, y-5, 2, 2, '#f0c020');
  rect(x+5, y-6, 2, 3, '#f0c020');
  rect(x+8, y-5, 2, 2, '#f0c020');
  // gems
  px(x+3, y-5, '#e03060');
  px(x+6, y-6, '#20d0a0');
  px(x+9, y-5, '#4080ff');
  // outline
  rect(x+2, y-3, 8, 1, '#8a6800');
}

// ── Wizard Hat ──
function drawAccWizard(x, y, dir, t, pal) {
  // wide brim
  rect(x,   y-2, 12, 2, '#4020a0');
  rect(x+1, y-3, 10, 1, '#5030b8');
  // tall cone
  rect(x+3, y-3,  6, 1, '#4020a0');
  rect(x+4, y-4,  4, 1, '#4020a0');
  rect(x+4, y-5,  4, 1, '#5030b8');
  rect(x+5, y-6,  2, 1, '#4020a0');
  rect(x+5, y-7,  2, 1, '#5030b8');
  rect(x+5, y-8,  2, 1, '#4020a0');
  // star
  px(x+5, y-9, '#ffd866');
  px(x+6, y-9, '#ffd866');
  // sparkle on brim (animated)
  if (Math.floor(t / 20) % 2 === 0) px(x+8, y-2, '#c0a0ff');
}

// ── Bow ──
function drawAccBow(x, y, dir, t, pal) {
  const bx = dir > 0 ? x + 8 : x;
  rect(bx,   y-2, 2, 3, '#ff6090');
  rect(bx-2, y-1, 2, 1, '#ff80b0');
  rect(bx+2, y-1, 2, 1, '#ff80b0');
  px(bx,   y-2, '#ff90c0');
  px(bx+1, y-2, '#ff90c0');
  // centre dot
  px(bx,   y-1, '#fff4d6');
  px(bx+1, y-1, '#fff4d6');
}

// ── Glasses ──
function drawAccGlasses(x, y, dir, t, pal) {
  // two lens frames
  rect(x+1, y+4, 4, 3, '#0b1020');
  rect(x+7, y+4, 4, 3, '#0b1020');
  // lens fill
  rect(x+2, y+5, 2, 1, '#7fd8f8');
  rect(x+8, y+5, 2, 1, '#7fd8f8');
  // bridge
  rect(x+5, y+5, 2, 1, '#0b1020');
  // arms
  px(x,   y+5, '#0b1020');
  px(x+11, y+5, '#0b1020');
}

// ── Antennae ──
function drawAccAntennae(x, y, dir, t, pal) {
  const wobL = Math.round(Math.sin(t * 0.08) * 1);
  const wobR = Math.round(Math.sin(t * 0.08 + 1.2) * 1);
  // stalks
  rect(x+3, y-4 + wobL, 1, 4, '#4a3020');
  rect(x+8, y-4 + wobR, 1, 4, '#4a3020');
  // bulbs
  rect(x+2, y-5 + wobL, 3, 2, '#ff6f88');
  rect(x+7, y-5 + wobR, 3, 2, '#7ff2e2');
  // shine
  px(x+3, y-5 + wobL, '#ffd4df');
  px(x+8, y-5 + wobR, '#d4f5ed');
}

// ── Halo ──
function drawAccHalo(x, y, dir, t, pal) {
  const hover = Math.round(Math.sin(t * 0.06) * 1) - 4;
  rect(x+1, y + hover,   10, 1, '#ffd866');
  rect(x,   y + hover + 1, 12, 1, '#ffd866');
  rect(x,   y + hover + 2, 12, 1, '#ffd866');
  rect(x+1, y + hover + 3, 10, 1, '#ffd866');
  // hollow centre
  rect(x+2, y + hover + 1, 8, 2, 'rgba(0,0,0,0)');
  // glow tint
  px(x+1, y + hover,   '#fff4a0');
  px(x+10, y + hover,  '#fff4a0');
}

// ─── Shoe draw functions ──────────────────────────────────────────────────────
function drawShoeBoots(x, y, dir, t, pal) {
  // chunky boots on both feet
  rect(x+1,  y+13, 4, 2, '#3a1e0a');
  rect(x+7,  y+13, 4, 2, '#3a1e0a');
  rect(x+1,  y+15, 5, 1, '#5a3010');
  rect(x+7,  y+15, 5, 1, '#5a3010');
}
function drawShoeSneakers(x, y, dir, t, pal) {
  rect(x+1,  y+13, 4, 2, '#fffafa');
  rect(x+7,  y+13, 4, 2, '#fffafa');
  rect(x+1,  y+15, 5, 1, '#e0e0e0');
  rect(x+7,  y+15, 5, 1, '#e0e0e0');
  // stripe
  rect(x+2,  y+13, 3, 1, pal.base);
  rect(x+8,  y+13, 3, 1, pal.base);
}
function drawShoeSlippers(x, y, dir, t, pal) {
  rect(x+1,  y+13, 4, 2, '#f4c0a0');
  rect(x+7,  y+13, 4, 2, '#f4c0a0');
  // fluffy top
  rect(x+1,  y+13, 4, 1, '#fff4d6');
  rect(x+7,  y+13, 4, 1, '#fff4d6');
}
function drawShoeHeels(x, y, dir, t, pal) {
  rect(x+2,  y+12, 3, 3, '#e02060');
  rect(x+8,  y+12, 3, 3, '#e02060');
  // heel spike
  px(x+1,    y+14, '#e02060');
  px(x+7,    y+14, '#e02060');
  rect(x+2,  y+15, 2, 1, '#ff80b0');
  rect(x+8,  y+15, 2, 1, '#ff80b0');
}

function drawShoe(p, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  const shoe = SHOES[p.customShoe || 0];
  if (!shoe || !shoe.draw) return;
  const blink = (p.iFrames > 0) && (Math.floor(typeof tick !== 'undefined' ? tick : 0) / 4 % 2 === 0);
  if (blink) return;
  const idleBob = (!Math.abs(p.vx) > 0.3 && p.onGround) ? Math.round(Math.sin((p.idleT || 0) * 0.05)) : 0;
  shoe.draw(x, y + idleBob, p.dir, typeof tick !== 'undefined' ? tick : 0, p.pal);
}

// ─── Name tag ─────────────────────────────────────────────────────────────────
function drawNameTag(p, x, y) {
  if (!p.nameTag) return;
  x = Math.floor(x); y = Math.floor(y);
  if (typeof ctx === 'undefined') return;
  const name = p.nameTag.slice(0, 6);
  const idleBob = (!Math.abs(p.vx) > 0.3 && p.onGround) ? Math.round(Math.sin((p.idleT || 0) * 0.05)) : 0;
  const tagY = y - 6 + idleBob;
  ctx.save();
  ctx.font = '5px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(name).width;
  // Background pill
  ctx.fillStyle = 'rgba(11,16,32,.72)';
  ctx.fillRect(x + p.w / 2 - tw / 2 - 2, tagY - 5, tw + 4, 6);
  // Text
  ctx.fillStyle = p.pal ? p.pal.hi : '#7ff2e2';
  ctx.fillText(name, x + p.w / 2, tagY);
  ctx.restore();
}
// Called by entities.js drawPlayer override when p.customIdleAnim > 0.
// Returns true if it drew a replacement, false to fall through to default.
function drawCustomIdleAnim(p, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  const animId = IDLE_ANIMS[p.customIdleAnim || 0]?.id || 'default';
  if (animId === 'default') return false;

  const t     = p.idleT || 0;
  const phase = Math.floor(t / 6);   // changes every 6 ticks
  const pal   = p.pal;

  if (animId === 'dance') {
    // Bounce side-to-side with arm flap
    const hop  = -Math.abs(Math.sin(t * 0.12)) * 3;
    const lean = Math.sin(t * 0.12) > 0 ? 1 : -1;
    const by   = y + Math.round(hop);
    // body
    rect(x+2, by+2, 8, 10, pal.base);
    rect(x+3, by+3, 2, 2, pal.hi);
    rect(x+2, by+4, 1, 4, pal.mid);
    rect(x+2, by+10, 8, 2, pal.shade);
    rect(x+3, by+12, 6, 1, pal.dark);
    // arms raised alternating
    if (lean > 0) {
      rect(x+10, by+2, 2, 3, pal.mid);
      rect(x+0,  by+5, 2, 3, pal.mid);
    } else {
      rect(x+0,  by+2, 2, 3, pal.mid);
      rect(x+10, by+5, 2, 3, pal.mid);
    }
    // legs
    rect(x+2, by+13, 3, 1, pal.shade);
    rect(x+7, by+13, 3, 1, pal.shade);
    // eyes (happy)
    rect(x+4, by+5, 1, 1, '#0b1020');
    rect(x+7, by+5, 1, 1, '#0b1020');
    rect(x+4, by+7, 4, 1, '#0b1020'); // smile
    return true;
  }

  if (animId === 'wave') {
    const by = y;
    // static body
    rect(x+2, by+2, 8, 10, pal.base);
    rect(x+3, by+3, 2, 2, pal.hi);
    rect(x+2, by+4, 1, 4, pal.mid);
    rect(x+2, by+10, 8, 2, pal.shade);
    // raised arm on dominant side (wave)
    const armPhase = Math.floor(t / 8) % 4;
    const armY = by + 2 - (armPhase < 2 ? 2 : 0);
    rect(x+10, armY, 2, 5, pal.mid);
    // other arm normal
    rect(x+0, by+5, 2, 3, pal.mid);
    // legs
    rect(x+2, by+13, 3, 1, pal.shade);
    rect(x+7, by+13, 3, 1, pal.shade);
    return true;
  }

  if (animId === 'think') {
    const by = y;
    const scratchFrame = Math.floor(t / 10) % 3;
    // body
    rect(x+2, by+2, 8, 10, pal.base);
    rect(x+3, by+3, 2, 2, pal.hi);
    rect(x+2, by+4, 1, 4, pal.mid);
    rect(x+2, by+10, 8, 2, pal.shade);
    // arm raised to head scratch
    rect(x+10, by+2 + scratchFrame, 2, 4, pal.mid);
    // thought bubbles
    if (Math.floor(t / 12) % 3 !== 2) {
      px(x+12, by - 2, pal.hi);
      if (Math.floor(t / 12) % 3 === 1) {
        px(x+13, by - 4, pal.hi);
        px(x+14, by - 6, pal.hi);
      }
    }
    // legs
    rect(x+2, by+13, 3, 1, pal.shade);
    rect(x+7, by+13, 3, 1, pal.shade);
    return true;
  }

  if (animId === 'spin') {
    // Quick 360 rotation using ctx.save/restore
    const angle = (t % 40) / 40 * Math.PI * 2;
    const cx = x + 6, cy = y + 7;
    if (typeof ctx !== 'undefined') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.translate(-cx, -cy);
      rect(x+2, y+2, 8, 10, pal.base);
      rect(x+3, y+3, 2, 2, pal.hi);
      rect(x+2, y+4, 1, 4, pal.mid);
      rect(x+2, y+10, 8, 2, pal.shade);
      rect(x+3, y+12, 6, 1, pal.dark);
      ctx.restore();
    }
    return true;
  }

  return false;
}

// ─── Custom face overlay ──────────────────────────────────────────────────────
// Called at end of drawPlayer if p.customFace is set.
// Draws the scaled-down 32×32 face image over the head region (4×4 px area).
function drawCustomFace(p, x, y) {
  if (!p._faceImg || !p._faceImg.complete) return;
  x = Math.floor(x); y = Math.floor(y);
  const idleBob = (!Math.abs(p.vx) > 0.3 && p.onGround) ?
    Math.round(Math.sin((p.idleT || 0) * 0.05)) : 0;
  if (typeof ctx !== 'undefined') {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Head region: x+2, y+2+idleBob, 8×8
    ctx.drawImage(p._faceImg, x + 2, y + 2 + idleBob, 8, 8);
    ctx.restore();
  }
}

// ─── In-game customization overlay ───────────────────────────────────────────
let _menuEl = null;
let _menuPlayerIdx = 0; // which player is being edited
let _previewTick = 0;
let _previewRaf  = null;

function openCustomizeMenu(playerIdx) {
  if (!_custom) loadCustomization();
  _menuPlayerIdx = playerIdx || 0;
  if (_menuEl) { _menuEl.style.display = 'flex'; _renderMenu(); return; }

  const el = document.createElement('div');
  el.id = 'customMenu';
  el.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(11,16,32,.85);';

  el.innerHTML = `
    <div id="customCard" style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:8px 8px 0 #0b1020;
      padding:20px 24px;width:94%;max-width:560px;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      max-height:90vh;overflow-y:auto;
    ">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;">
        <span style="font-size:15px;font-weight:bold;letter-spacing:3px;">🎨 CUSTOMIZE</span>
        <div style="display:flex;gap:6px;">
          <button class="cu-tab" id="cuTabP1" onclick="customSwitchPlayer(0)">P1</button>
          <button class="cu-tab" id="cuTabP2" onclick="customSwitchPlayer(1)">P2</button>
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:flex-start;">
        <!-- Preview canvas -->
        <div style="flex-shrink:0;">
          <canvas id="cuPreview" width="80" height="80" style="
            border:3px solid #0b1020;box-shadow:3px 3px 0 #0b1020;
            image-rendering:pixelated;background:#3a8ad6;
            width:80px;height:80px;
          "></canvas>
          <div id="cuPreviewName" style="font-size:9px;letter-spacing:1px;color:#5a4020;margin-top:4px;text-align:center;"></div>
        </div>

        <!-- Controls -->
        <div style="flex:1;min-width:0;">
          <!-- Outfit -->
          <div class="cu-section">
            <div class="cu-label">OUTFIT</div>
            <div id="cuOutfitGrid" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
          </div>

          <!-- Accessory -->
          <div class="cu-section">
            <div class="cu-label">ACCESSORY</div>
            <div id="cuAccGrid" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
          </div>

          <!-- Shoes -->
          <div class="cu-section">
            <div class="cu-label">SHOES</div>
            <div id="cuShoeGrid" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
          </div>

          <!-- Idle anim -->
          <div class="cu-section">
            <div class="cu-label">IDLE ANIMATION</div>
            <div id="cuAnimGrid" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
          </div>

          <!-- Name tag -->
          <div class="cu-section">
            <div class="cu-label">NAME TAG <span style="font-size:8px;color:#8a7040;">(up to 6 chars, shown above head)</span></div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input type="text" id="cuNameTag" maxlength="6" placeholder="BLIP"
                style="font-family:ui-monospace,monospace;font-size:12px;letter-spacing:2px;
                       text-transform:uppercase;padding:5px 8px;border:2px solid #0b1020;
                       background:#fff;color:#0b1020;width:80px;" />
              <button class="cu-btn cu-btn-outline" id="cuNameTagClear" style="font-size:9px;padding:4px 8px;">✕</button>
            </div>
          </div>

          <!-- HSL colour override -->
          <div class="cu-section">
            <div class="cu-label">CUSTOM COLOUR <span style="font-size:8px;color:#8a7040;">(overrides outfit base)</span></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <label style="font-size:9px;letter-spacing:1px;color:#5a4020;">H</label>
              <input type="range" id="cuHslH" min="0" max="359" step="1" value="170" style="width:70px;" />
              <label style="font-size:9px;letter-spacing:1px;color:#5a4020;">S</label>
              <input type="range" id="cuHslS" min="0" max="100" step="1" value="70" style="width:50px;" />
              <label style="font-size:9px;letter-spacing:1px;color:#5a4020;">L</label>
              <input type="range" id="cuHslL" min="10" max="90" step="1" value="55" style="width:50px;" />
              <div id="cuHslPreview" style="width:18px;height:18px;border:2px solid #0b1020;flex-shrink:0;"></div>
              <button class="cu-btn cu-btn-outline" id="cuHslClear" style="font-size:9px;padding:4px 8px;">✕ CLEAR</button>
            </div>
          </div>

          <!-- Face upload -->
          <div class="cu-section">
            <div class="cu-label">CUSTOM FACE <span style="font-size:8px;color:#8a7040;">(32×32 PNG)</span></div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <label class="cu-btn cu-btn-outline" style="cursor:pointer;">
                📁 UPLOAD
                <input type="file" accept="image/*" id="cuFaceUpload" style="display:none;" onchange="customFaceUpload(event)">
              </label>
              <button class="cu-btn cu-btn-outline" id="cuFaceClear" onclick="customFaceClear()">✕ CLEAR</button>
              <div id="cuFacePreview" style="width:24px;height:24px;border:2px solid #0b1020;image-rendering:pixelated;background:#ccc;"></div>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="cu-btn cu-btn-primary" onclick="closeCustomizeMenu()">✓ DONE</button>
      </div>
    </div>

    <style>
      .cu-tab {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:11px;letter-spacing:2px;padding:5px 12px;cursor:pointer;
        border:2px solid #0b1020;background:#fff4d6;color:#0b1020;
        box-shadow:2px 2px 0 #3a3020;
      }
      .cu-tab.active { background:#0b1020;color:#fff4d6; }
      .cu-section { margin-bottom:12px; }
      .cu-label { font-size:9px;letter-spacing:2px;color:#7a6030;margin-bottom:5px; }
      .cu-swatch {
        width:18px;height:18px;border:2px solid #0b1020;cursor:pointer;
        box-shadow:2px 2px 0 #3a3020;transition:transform .08s;
        flex-shrink:0;
      }
      .cu-swatch:hover { transform:scale(1.2); }
      .cu-swatch.active { outline:2px solid #fff4d6;outline-offset:1px;transform:scale(1.15); }
      .cu-chip {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:8px;letter-spacing:1px;padding:4px 7px;cursor:pointer;
        border:2px solid #0b1020;background:#fff4d6;color:#0b1020;
        box-shadow:2px 2px 0 #3a3020;white-space:nowrap;
      }
      .cu-chip:hover { background:#ffe8a0; }
      .cu-chip.active { background:#0b1020;color:#fff4d6; }
      .cu-chip.locked { opacity:.45;cursor:not-allowed;background:#e8d8c0; }
      .cu-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:1px;padding:7px 14px;cursor:pointer;
        border:0;box-shadow:3px 3px 0 #3a3020;
      }
      .cu-btn-outline { background:#fff4d6;color:#0b1020;border:2px solid #0b1020; }
      .cu-btn-outline:hover { background:#ffe8a0; }
      .cu-btn-primary { background:#0b1020;color:#fff4d6; }
      .cu-btn-primary:hover { background:#1a2840; }
    </style>
  `;

  const stage = document.getElementById('stage');
  stage.appendChild(el);
  _menuEl = el;
  _renderMenu();
  _startPreviewLoop();
}

function closeCustomizeMenu() {
  if (_menuEl) _menuEl.style.display = 'none';
  _stopPreviewLoop();
  // re-apply customisation to live players if a game is running
  if (typeof players !== 'undefined' && players) {
    players.forEach(p => applyCustomToPlayer(p));
  }
}

window.customSwitchPlayer = function(idx) {
  _menuPlayerIdx = idx;
  _renderMenu();
};

window.customFaceUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    setPlayerCustom(_menuPlayerIdx, { faceDataUrl: ev.target.result });
    _renderMenu();
  };
  reader.readAsDataURL(file);
};

window.customFaceClear = function() {
  setPlayerCustom(_menuPlayerIdx, { faceDataUrl: null });
  _renderMenu();
};

function _renderMenu() {
  if (!_menuEl) return;
  const c = getPlayerCustom(_menuPlayerIdx);

  // Player tabs
  ['P1','P2'].forEach((lbl, i) => {
    const tab = _menuEl.querySelector(`#cuTabP${i+1}`);
    if (tab) tab.classList.toggle('active', i === _menuPlayerIdx);
  });

  // Outfit swatches
  const og = _menuEl.querySelector('#cuOutfitGrid');
  og.innerHTML = '';
  OUTFITS.forEach((o, i) => {
    const sw = document.createElement('div');
    sw.className = 'cu-swatch' + (i === c.outfitIdx ? ' active' : '');
    sw.title = o.name;
    sw.style.background = o.base;
    sw.style.borderColor = o.outline;
    sw.onclick = () => { setPlayerCustom(_menuPlayerIdx, { outfitIdx: i }); _renderMenu(); };
    og.appendChild(sw);
  });

  // Accessory chips (with lock indicators)
  const ag = _menuEl.querySelector('#cuAccGrid');
  ag.innerHTML = '';
  ACCESSORIES.forEach((a, i) => {
    const locked = !isAccessoryUnlocked(a.id);
    const ch = document.createElement('button');
    ch.className = 'cu-chip' + (i === c.accessoryIdx ? ' active' : '') + (locked ? ' locked' : '');
    ch.textContent = locked ? `🔒 ${a.name}` : a.name;
    ch.title = locked ? 'Earn medals to unlock' : a.name;
    ch.disabled = locked;
    if (!locked) ch.onclick = () => { setPlayerCustom(_menuPlayerIdx, { accessoryIdx: i }); _renderMenu(); };
    ag.appendChild(ch);
  });

  // Shoe chips
  const sg = _menuEl.querySelector('#cuShoeGrid');
  if (sg) {
    sg.innerHTML = '';
    SHOES.forEach((s, i) => {
      const locked = !isShoeUnlocked(s.id);
      const ch = document.createElement('button');
      ch.className = 'cu-chip' + (i === c.shoeIdx ? ' active' : '') + (locked ? ' locked' : '');
      ch.textContent = locked ? `🔒 ${s.name}` : s.name;
      ch.disabled = locked;
      if (!locked) ch.onclick = () => { setPlayerCustom(_menuPlayerIdx, { shoeIdx: i }); _renderMenu(); };
      sg.appendChild(ch);
    });
  }

  // Anim chips
  const an = _menuEl.querySelector('#cuAnimGrid');
  an.innerHTML = '';
  IDLE_ANIMS.forEach((a, i) => {
    const ch = document.createElement('button');
    ch.className = 'cu-chip' + (i === c.idleAnimIdx ? ' active' : '');
    ch.textContent = a.name;
    ch.onclick = () => { setPlayerCustom(_menuPlayerIdx, { idleAnimIdx: i }); _renderMenu(); };
    an.appendChild(ch);
  });

  // Face preview
  const fp = _menuEl.querySelector('#cuFacePreview');
  if (fp) {
    if (c.faceDataUrl) {
      fp.style.backgroundImage = `url(${c.faceDataUrl})`;
      fp.style.backgroundSize  = 'cover';
      fp.style.backgroundRepeat = 'no-repeat';
    } else {
      fp.style.backgroundImage = 'none';
      fp.style.background = '#c8b890';
    }
  }

  // Name tag input
  const ntInput = _menuEl.querySelector('#cuNameTag');
  if (ntInput) {
    ntInput.value = c.nameTag || '';
    ntInput.oninput = () => {
      setPlayerCustom(_menuPlayerIdx, { nameTag: ntInput.value.toUpperCase().slice(0,6) });
    };
    const ntClear = _menuEl.querySelector('#cuNameTagClear');
    if (ntClear) ntClear.onclick = () => { setPlayerCustom(_menuPlayerIdx, { nameTag: '' }); ntInput.value = ''; };
  }

  // HSL sliders
  const hsl = c.hslOverride || { h: 170, s: 70, l: 55 };
  const hSlider = _menuEl.querySelector('#cuHslH');
  const sSlider = _menuEl.querySelector('#cuHslS');
  const lSlider = _menuEl.querySelector('#cuHslL');
  const hslPreview = _menuEl.querySelector('#cuHslPreview');
  const hslClear   = _menuEl.querySelector('#cuHslClear');

  if (hSlider) hSlider.value = hsl.h;
  if (sSlider) sSlider.value = hsl.s;
  if (lSlider) lSlider.value = hsl.l;
  if (hslPreview) hslPreview.style.background = `hsl(${hsl.h},${hsl.s}%,${hsl.l}%)`;

  const updateHsl = () => {
    const h = parseInt(hSlider?.value || 170);
    const s = parseInt(sSlider?.value || 70);
    const l = parseInt(lSlider?.value || 55);
    if (hslPreview) hslPreview.style.background = `hsl(${h},${s}%,${l}%)`;
    setPlayerCustom(_menuPlayerIdx, { hslOverride: { h, s, l } });
  };
  if (hSlider) hSlider.oninput = updateHsl;
  if (sSlider) sSlider.oninput = updateHsl;
  if (lSlider) lSlider.oninput = updateHsl;
  if (hslClear) hslClear.onclick = () => {
    setPlayerCustom(_menuPlayerIdx, { hslOverride: null });
    _renderMenu();
  };

  // Preview label
  const pn = _menuEl.querySelector('#cuPreviewName');
  if (pn) pn.textContent = `P${_menuPlayerIdx+1} · ${OUTFITS[c.outfitIdx]?.name || ''}`;
}

// ─── Preview canvas animation loop ───────────────────────────────────────────
function _startPreviewLoop() {
  _stopPreviewLoop();
  _previewTick = 0;
  function loop() {
    _drawPreview();
    _previewTick++;
    _previewRaf = requestAnimationFrame(loop);
  }
  _previewRaf = requestAnimationFrame(loop);
}

function _stopPreviewLoop() {
  if (_previewRaf) { cancelAnimationFrame(_previewRaf); _previewRaf = null; }
}

function _drawPreview() {
  const canvas = _menuEl && _menuEl.querySelector('#cuPreview');
  if (!canvas) return;
  const pctx = canvas.getContext('2d');
  pctx.imageSmoothingEnabled = false;

  const t = _previewTick;
  const c = getPlayerCustom(_menuPlayerIdx);
  const outfit = OUTFITS[c.outfitIdx] || OUTFITS[0];
  const pal = outfit;

  // Background — simple ground scene
  pctx.fillStyle = '#3a8ad6'; pctx.fillRect(0, 0, 80, 80);
  pctx.fillStyle = '#4aa84a'; pctx.fillRect(0, 56, 80, 4);
  pctx.fillStyle = '#6b3d1f'; pctx.fillRect(0, 60, 80, 20);

  // Build a mock player object for preview
  const walkFrame = Math.floor(t / 8) % 4;
  const idleT     = t;
  const walking   = false;
  const jumping   = false;
  const dir       = 1;

  // Scale up 3× for the preview
  pctx.save();
  pctx.scale(3, 3);
  const px_ = (x, y, col) => { pctx.fillStyle = col; pctx.fillRect(x, y, 1, 1); };
  const rect_ = (x, y, w, h, col) => { pctx.fillStyle = col; pctx.fillRect(x, y, w, h); };

  // Draw sprite at 3,8 in preview space (scaled), i.e. 9,24 in canvas pixels
  const sx_ = 3, sy_ = 8;
  const idleBob = Math.round(Math.sin(idleT * 0.05));
  const by = sy_ + idleBob;

  rect_(sx_+2, by+2, 8, 10, pal.base);
  rect_(sx_+3, by+3, 2, 2, pal.hi);
  rect_(sx_+2, by+4, 1, 4, pal.mid);
  rect_(sx_+2, by+10, 8, 2, pal.shade);
  rect_(sx_+3, by+12, 6, 1, pal.dark);
  rect_(sx_+1, by+3, 1, 8, pal.outline);
  rect_(sx_+10, by+3, 1, 8, pal.outline);
  rect_(sx_+2, by+1, 8, 1, pal.outline);
  rect_(sx_+2, by+12, 8, 1, pal.outline);
  px_(sx_+1, by+2, pal.outline); px_(sx_+10, by+2, pal.outline);
  px_(sx_+1, by+11, pal.outline); px_(sx_+10, by+11, pal.outline);
  // hat / ears based on player index
  if (_menuPlayerIdx === 1) {
    rect_(sx_+2, by, 8, 1, pal.hat);
    rect_(sx_+2, by+1, 8, 1, pal.hat);
    rect_(sx_+3, by-1, 6, 1, pal.hat);
    px_(sx_+2, by, pal.outline); px_(sx_+9, by, pal.outline);
  } else {
    rect_(sx_+5, by-1, 2, 1, pal.hi);
    px_(sx_+5, by-2, pal.outline); px_(sx_+6, by-2, pal.outline);
  }
  rect_(sx_+2, by+5, 8, 1, pal.strap);
  // eyes
  rect_(sx_+5, by+4, 2, 2, '#fff4d6');
  rect_(sx_+8, by+4, 1, 2, '#fff4d6');
  px_(sx_+6, by+4, '#0b1020');
  // legs
  const lf = Math.floor(idleT / 30) % 8;
  if (lf === 4) { rect_(sx_+2, by+12, 3, 1, pal.shade); rect_(sx_+2, by+13, 3, 1, pal.shade); rect_(sx_+7, by+13, 3, 1, pal.shade); }
  else          { rect_(sx_+2, by+13, 3, 1, pal.shade); rect_(sx_+7, by+13, 3, 1, pal.shade); }

  // Draw accessory in preview (use save/restore for scaling)
  const acc = ACCESSORIES[c.accessoryIdx || 0];
  if (acc && acc.draw) {
    acc.draw(sx_, sy_ + idleBob, dir, t, pal);
  }

  pctx.restore();

  // Face overlay
  if (c.faceDataUrl) {
    const img = new Image();
    img.src = c.faceDataUrl;
    if (img.complete) {
      pctx.save();
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(img, (sx_+2)*3, (by+2)*3, 8*3, 8*3);
      pctx.restore();
    }
  }
}
