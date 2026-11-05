/* Blip's Grove — scorecard.js  (M6.3)
 *
 * Generates a shareable canvas image showing:
 *   - Player profile (name + avatar colour swatch)
 *   - All-time stats (gems, levels cleared, medals, best run)
 *   - Per-level medal grid
 *   - Achievement progress bar
 *
 * Public API:
 *   openScorecardPanel()     → show the panel with live canvas preview
 *   closeScorecardPanel()    → hide it
 *   renderScorecard()        → returns a canvas element (call any time)
 */

'use strict';

// ─── Panel ────────────────────────────────────────────────────────────────────
let _scPanelEl = null;

function openScorecardPanel() {
  if (_scPanelEl) { _scPanelEl.style.display = 'flex'; _refreshScorecard(); return; }

  const el = document.createElement('div');
  el.id = 'scorecardPanel';
  el.style.cssText = [
    'position:absolute;inset:0;z-index:36;display:flex;',
    'align-items:center;justify-content:center;',
    'background:rgba(11,16,32,.88);',
  ].join('');

  el.innerHTML = `
    <div style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:10px 10px 0 #0b1020;
      width:94%;max-width:500px;max-height:92vh;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      display:flex;flex-direction:column;overflow:hidden;
    ">
      <!-- Header -->
      <div style="background:#0b1020;color:#fff4d6;padding:14px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:14px;letter-spacing:3px;font-weight:bold;">🏁 SCORECARD</span>
        <span style="flex:1;"></span>
        <button id="scDownloadBtn" style="
          font-family:inherit;font-size:10px;letter-spacing:1px;
          background:#ffd866;color:#0b1020;border:0;padding:5px 12px;cursor:pointer;
        ">⎘ SAVE IMAGE</button>
        <button onclick="closeScorecardPanel()" style="
          font-family:inherit;font-size:11px;letter-spacing:1px;
          background:transparent;color:#fff4d6;border:1px solid #fff4d6;
          padding:4px 10px;cursor:pointer;margin-left:6px;
        ">CLOSE</button>
      </div>
      <!-- Canvas preview -->
      <div style="flex:1;overflow-y:auto;padding:16px;display:flex;justify-content:center;">
        <canvas id="scorecardCanvas" style="max-width:100%;border:2px solid #0b1020;box-shadow:4px 4px 0 #0b1020;image-rendering:pixelated;"></canvas>
      </div>
    </div>
  `;

  const stage = document.getElementById('stage') || document.body;
  stage.appendChild(el);
  _scPanelEl = el;

  el.querySelector('#scDownloadBtn').addEventListener('click', () => {
    const canvas = el.querySelector('#scorecardCanvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = 'blips-grove-scorecard.png';
    a.href     = canvas.toDataURL('image/png');
    a.click();
  });

  _refreshScorecard();
}

function closeScorecardPanel() {
  if (_scPanelEl) _scPanelEl.style.display = 'none';
}

function _refreshScorecard() {
  if (!_scPanelEl) return;
  const placeholder = _scPanelEl.querySelector('#scorecardCanvas');
  if (!placeholder) return;
  const card = renderScorecard();
  placeholder.width  = card.width;
  placeholder.height = card.height;
  const ctx = placeholder.getContext('2d');
  ctx.drawImage(card, 0, 0);
}

// ─── Scorecard renderer ───────────────────────────────────────────────────────
function renderScorecard() {
  const W = 480, H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;

  // ── Background ──
  c.fillStyle = '#0b1020';
  c.fillRect(0, 0, W, H);
  // Subtle grid pattern
  c.strokeStyle = 'rgba(255,244,214,.04)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  // ── Header bar ──
  c.fillStyle = '#ffd866';
  c.fillRect(0, 0, W, 40);
  c.fillStyle = '#0b1020';
  _text(c, 'BLIP\'S GROVE', 16, 26, 'bold 14px ui-monospace, monospace', '#0b1020');
  _text(c, 'SCORECARD', W - 16, 26, '11px ui-monospace, monospace', '#0b1020', 'right');

  // ── Profile section ──
  const profileX = 16, profileY = 52;
  // Avatar swatch
  const profile = _getProfile();
  c.fillStyle = profile.color;
  c.fillRect(profileX, profileY, 36, 36);
  c.strokeStyle = '#fff4d6';
  c.lineWidth = 2;
  c.strokeRect(profileX, profileY, 36, 36);
  // Initials in avatar
  c.fillStyle = '#fff4d6';
  const initials = (profile.name || 'P').slice(0, 2).toUpperCase();
  _text(c, initials, profileX + 18, profileY + 24, 'bold 14px ui-monospace, monospace', '#fff4d6', 'center');
  // Name + tagline
  _text(c, profile.name || 'Player', profileX + 46, profileY + 16, 'bold 13px ui-monospace, monospace', '#fff4d6');
  _text(c, 'Blip\'s Grove Explorer', profileX + 46, profileY + 30, '9px ui-monospace, monospace', '#7ff2e2');

  // ── Stats row ──
  const statsY = 104;
  c.fillStyle = 'rgba(255,244,214,.06)';
  c.fillRect(16, statsY, W - 32, 38);
  c.strokeStyle = 'rgba(255,244,214,.15)';
  c.strokeRect(16, statsY, W - 32, 38);

  const sv = typeof save !== 'undefined' ? save : {};
  const stats = [
    { label: 'GEMS',    value: String(sv.totalGems || 0) },
    { label: 'LEVELS',  value: `${(sv.levelsCleared || []).length} / ${typeof LEVELS !== 'undefined' ? LEVELS.filter(l=>!l._isInfinite&&!l._coop).length : 6}` },
    { label: 'UPGRADES', value: _upgradeCount() },
    { label: 'BEST RUN', value: sv.bestRunTime !== undefined ? _fmt(sv.bestRunTime) : '—' },
  ];
  const sw = (W - 32) / stats.length;
  stats.forEach((s, i) => {
    const sx = 16 + i * sw + sw / 2;
    _text(c, s.value, sx, statsY + 20, 'bold 14px ui-monospace, monospace', '#ffd866', 'center');
    _text(c, s.label, sx, statsY + 33, '8px ui-monospace, monospace', '#a0c0b0', 'center');
  });

  // ── Medal grid ──
  const mgY = 156;
  _text(c, 'MEDALS PER LEVEL', 16, mgY - 4, '8px ui-monospace, monospace', '#7ff2e2');

  const levels = typeof LEVELS !== 'undefined' ? LEVELS.filter(l => !l._isInfinite && !l._coop) : [];
  const MEDAL_KEYS_LOCAL   = ['clear', 'noDamage', 'allGems', 'speedrun', 'secret'];
  const MEDAL_GLYPHS_LOCAL = { clear:'✓', noDamage:'♥', allGems:'◆', speedrun:'⚡', secret:'★' };
  const cellW = Math.floor((W - 32) / Math.max(levels.length, 1));
  const cellH = 36;

  levels.forEach((lvl, i) => {
    const cx = 16 + i * cellW;
    const meds = typeof medalsFor === 'function' ? medalsFor(i) : [];
    // Level number
    c.fillStyle = 'rgba(255,244,214,.08)';
    c.fillRect(cx, mgY, cellW - 2, cellH);
    _text(c, String(i + 1), cx + cellW / 2, mgY + 12, 'bold 10px ui-monospace, monospace', '#fff4d6', 'center');
    // Medal row
    MEDAL_KEYS_LOCAL.forEach((k, mi) => {
      const has = meds.includes(k);
      const mx = cx + 2 + mi * Math.floor((cellW - 4) / 5);
      const my = mgY + 22;
      c.fillStyle = has ? '#ffd866' : 'rgba(255,244,214,.15)';
      c.font = '7px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillText(MEDAL_GLYPHS_LOCAL[k], mx + 3, my + 7);
    });
  });

  // ── Achievement progress ──
  const apY = 208;
  const all  = typeof achievementGetAll === 'function' ? achievementGetAll() : [];
  const done = all.filter(a => a.unlocked).length;
  const pct  = all.length ? done / all.length : 0;

  _text(c, `ACHIEVEMENTS  ${done} / ${all.length}`, 16, apY - 4, '8px ui-monospace, monospace', '#7ff2e2');
  // Bar track
  c.fillStyle = 'rgba(255,244,214,.12)';
  c.fillRect(16, apY, W - 32, 12);
  // Bar fill
  c.fillStyle = '#ffd866';
  c.fillRect(16, apY, Math.round((W - 32) * pct), 12);
  // Bar border
  c.strokeStyle = 'rgba(255,244,214,.2)';
  c.lineWidth = 1;
  c.strokeRect(16, apY, W - 32, 12);

  // Show unlocked achievement icons
  const unlocked = all.filter(a => a.unlocked).slice(0, 15);
  unlocked.forEach((a, i) => {
    const bx = 16 + i * 29;
    const by = apY + 18;
    c.fillStyle = a.color;
    c.fillRect(bx, by, 24, 24);
    c.fillStyle = '#fff4d6';
    c.font = '11px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText(a.icon, bx + 12, by + 17);
  });

  // ── Footer ──
  const footY = H - 14;
  _text(c, 'blipsgrove.io  ·  ' + new Date().toLocaleDateString(), W / 2, footY, '8px ui-monospace, monospace', 'rgba(255,244,214,.3)', 'center');

  return canvas;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _text(c, str, x, y, font, color, align = 'left') {
  c.font      = font;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(str, x, y);
  c.textAlign = 'left'; // reset
}

function _fmt(s) {
  const m = Math.floor(s / 60), sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
}

function _upgradeCount() {
  if (typeof save === 'undefined' || typeof SHOP_ITEMS === 'undefined') return '—';
  const total   = SHOP_ITEMS.reduce((s, it) => s + it.max, 0);
  const current = SHOP_ITEMS.reduce((s, it) => s + (save.upgrades[it.id] || 0), 0);
  return `${current}/${total}`;
}

function _getProfile() {
  try {
    const raw = localStorage.getItem('blipgrove_profile_v1');
    if (raw) {
      const p = JSON.parse(raw);
      return { name: p.name || 'Player', color: p.color || '#2dd4bf' };
    }
  } catch(e) {}
  return { name: 'Player', color: '#2dd4bf' };
}
