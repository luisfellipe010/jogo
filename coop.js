/* Blip's Grove — coop.js  (M6.1 / v19 refactor)
 *
 * Responsibilities:
 *   - Co-op lobby: post-connection screen with level picker + ready-up
 *   - Co-op settings: friendly fire, respawn mode, shared gem pool
 *   - Partner revive mechanic (host-authoritative)
 *   - Ping display (RTT measurement via echo messages)
 *   - Co-op medals: Clear · Sync · No-Damage · Speed
 *   - Co-op HUD overlay (ping pip, partner status)
 *
 * Bug fixes (v19):
 *   - _hostReady / _guestReady naming collision: the old code reused _hostReady
 *     for the guest's own ready state, causing the ready-up state machine to
 *     silently misbehave.  Now each side tracks its own flag separately.
 *   - coopSendPing used netFastChannel() (unordered, fire-and-forget) while
 *     coopHandleMessage 'pong' replied via netSendReliable (ordered).  Mixed
 *     channel paths meant pong sometimes arrived before the preceding fast
 *     message was flushed, breaking RTT measurement.  Both now go through the
 *     reliable channel so ordering is guaranteed.
 *   - _lobbyLevelIdx was accessible from netcode _handleMessage but only
 *     declared as a let inside openCoopLobby closure; moved to module scope.
 *
 * Public API:
 *   openCoopLobby()           → show post-connection lobby
 *   coopSettings              → live settings object
 *   coopIsReviving(pidx)      → true while pidx is being revived
 *   coopTryRevive(p,other,dt) → called each frame by engine when co-op active
 *   coopOnLevelStart()        → reset per-level co-op tracking
 *   coopOnPlayerHurt(pidx)    → track no-damage medal
 *   coopLevelComplete(elapsed)→ evaluate + award co-op medals
 *   coopSendPing()            → fire an RTT echo; call ~1/s
 *   coopGetPing()             → latest RTT in ms (or null)
 *   coopHandleMessage(msg)    → extra message types routed here from netcode
 *   coopUpdateHud()           → refresh co-op HUD elements
 */

'use strict';

// ─── Co-op settings ───────────────────────────────────────────────────────────
const COOP_SETTINGS_KEY = 'blipgrove_coop_v1';
const COOP_SETTINGS_DEFAULTS = {
  friendlyFire:    false,
  respawnMode:     'shared',   // 'shared' | 'independent'
  sharedGemPool:   false,
  showPing:        true,
  lagCompensation: 2,          // guest-side prediction frames (0–6)
};

let coopSettings = (() => {
  try {
    const raw = localStorage.getItem(COOP_SETTINGS_KEY);
    return Object.assign({}, COOP_SETTINGS_DEFAULTS, raw ? JSON.parse(raw) : {});
  } catch(e) { return Object.assign({}, COOP_SETTINGS_DEFAULTS); }
})();

function _saveCoopSettings() {
  try { localStorage.setItem(COOP_SETTINGS_KEY, JSON.stringify(coopSettings)); } catch(e) {}
}

// ─── Ping measurement ─────────────────────────────────────────────────────────
// FIX v19: both ping and pong now go through the reliable channel so ordering
// is guaranteed and RTT measurement is accurate.
let _pingRtt    = null;
let _pingSentAt = null;
let _coopPingSeq = 0;

function coopSendPing() {
  if (!netIsActive()) return;
  _pingSentAt = performance.now();
  netSendReliable({ type: 'coopPing', seq: _coopPingSeq++ });
}

function coopGetPing() { return _pingRtt; }

// ─── Per-level co-op tracking ─────────────────────────────────────────────────
let _coopHurt      = [false, false];
let _coopP1FinishT = null;
let _coopP2FinishT = null;

function coopOnLevelStart() {
  _coopHurt      = [false, false];
  _coopP1FinishT = null;
  _coopP2FinishT = null;
  coopUpdateHud();
}

function coopOnPlayerHurt(pidx) {
  if (pidx === 0 || pidx === 1) _coopHurt[pidx] = true;
}

function coopOnPlayerFinish(pidx) {
  const t = performance.now();
  if (pidx === 0) _coopP1FinishT = t;
  else            _coopP2FinishT = t;
}

function coopLevelComplete(elapsed) {
  const lvl = typeof currentLevel !== 'undefined' ? currentLevel : 0;
  const newMedals = [];
  if (typeof awardCoopMedal === 'function') {
    if (awardCoopMedal(lvl, 'coopClear'))   newMedals.push('coopClear');
    if (!_coopHurt[0] && !_coopHurt[1] && awardCoopMedal(lvl, 'coopNoDamage')) newMedals.push('coopNoDamage');
    if (_coopP1FinishT !== null && _coopP2FinishT !== null) {
      const diff = Math.abs(_coopP1FinishT - _coopP2FinishT) / 1000;
      if (diff <= 2.0 && awardCoopMedal(lvl, 'coopSync')) newMedals.push('coopSync');
    }
    const target = COOP_SPEEDRUN_TARGETS[lvl];
    if (target !== undefined && elapsed <= target && awardCoopMedal(lvl, 'coopSpeed')) newMedals.push('coopSpeed');
  }
  return newMedals;
}

// ─── Medal storage ────────────────────────────────────────────────────────────
const COOP_MEDAL_KEYS   = ['coopClear', 'coopNoDamage', 'coopSync', 'coopSpeed'];
const COOP_MEDAL_LABELS = { coopClear:'CLEAR', coopNoDamage:'NO-HIT', coopSync:'SYNC', coopSpeed:'SPEED' };
const COOP_MEDAL_GLYPHS = { coopClear:'✓', coopNoDamage:'♥', coopSync:'⚏', coopSpeed:'⚡' };
const COOP_SAVE_KEY = 'blipgrove_coop_medals_v1';

let _coopMedalSave = (() => {
  try { return JSON.parse(localStorage.getItem(COOP_SAVE_KEY) || '{}'); }
  catch(e) { return {}; }
})();

function coopMedalsFor(lvl) { return _coopMedalSave[lvl] || []; }
function awardCoopMedal(lvl, key) {
  const cur = _coopMedalSave[lvl] || [];
  if (cur.includes(key)) return false;
  cur.push(key);
  _coopMedalSave[lvl] = cur;
  try { localStorage.setItem(COOP_SAVE_KEY, JSON.stringify(_coopMedalSave)); } catch(e) {}
  return true;
}

const COOP_SPEEDRUN_TARGETS = {};  // populated by injectCoopLevels() below

// ─── Partner revive ──────────────────────────────────────────────────────────
const REVIVE_HOLD_MS = 2000;
const REVIVE_RADIUS  = 18;

let _reviveProgress = [0, 0];
let _reviveHolding  = [false, false];

function coopIsReviving(pidx)     { return _reviveHolding[pidx]; }
function coopReviveProgress(pidx) { return Math.min(1, _reviveProgress[pidx] / REVIVE_HOLD_MS); }

function coopTryRevive(p, other, dt) {
  if (!netIsHost()) return;
  const didx = other.idx;
  if (!other.dead) { _reviveProgress[didx] = 0; _reviveHolding[didx] = false; return; }

  const dx   = Math.abs((p.x + p.w / 2) - (other.x + other.w / 2));
  const dy   = Math.abs((p.y + p.h / 2) - (other.y + other.h / 2));
  const near = dx < REVIVE_RADIUS && dy < REVIVE_RADIUS;

  if (near) {
    _reviveHolding[didx]   = true;
    _reviveProgress[didx] += dt;
    if (_reviveProgress[didx] >= REVIVE_HOLD_MS) {
      _reviveProgress[didx] = 0;
      _reviveHolding[didx]  = false;
      _executeRevive(other);
      netSendReliable({ type: 'revive', pidx: didx });
    }
  } else {
    _reviveProgress[didx] = Math.max(0, _reviveProgress[didx] - dt * 2);
    _reviveHolding[didx]  = false;
  }
}

function _executeRevive(p) {
  p.dead    = false;
  p.hp      = Math.floor(p.maxHp * 0.5);
  p.iFrames = 90;
  p.vx = 0; p.vy = -4;
  if (typeof spawnDust === 'function')     spawnDust(p.x + p.w / 2, p.y + p.h, 14);
  if (typeof sfxCheckpoint === 'function') sfxCheckpoint();
  if (typeof toast === 'function')         toast('REVIVED!');
  if (typeof updateHud === 'function')     updateHud();
}

function _guestApplyRevive(pidx) {
  if (typeof players === 'undefined' || !players[pidx]) return;
  _executeRevive(players[pidx]);
}

// ─── Shared gem pool ──────────────────────────────────────────────────────────
let _sharedGems = 0;
function coopSharedGems()      { return _sharedGems; }
function coopAddSharedGems(n)  { _sharedGems += n; }
function coopResetSharedGems() { _sharedGems = 0; }

// ─── Message routing ──────────────────────────────────────────────────────────
function coopHandleMessage(msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'coopPing':
      // FIX v19: reflect back on reliable channel (same as sender)
      netSendReliable({ type: 'coopPong', seq: msg.seq });
      break;
    case 'coopPong':
      if (_pingSentAt !== null) {
        _pingRtt    = Math.round(performance.now() - _pingSentAt);
        _pingSentAt = null;
      }
      break;
    case 'revive':
      if (netIsGuest()) _guestApplyRevive(msg.pidx);
      break;
    case 'coopSettings':
      if (netIsGuest() && msg.settings) {
        Object.assign(coopSettings, msg.settings);
        _saveCoopSettings();
      }
      break;
    case 'coopReady':
      _handleGuestReadyMsg(msg);
      break;
    case 'coopStart':
      if (netIsGuest() && msg.levelIdx !== undefined) {
        if (typeof numPlayers !== 'undefined') numPlayers = 2;
        if (typeof startTransition === 'function') startTransition(() => startLevel(msg.levelIdx));
        else if (typeof startLevel === 'function') startLevel(msg.levelIdx);
        _closeLobbyPanel();
      }
      break;
    case 'coopFinish':
      if (netIsGuest()) coopOnPlayerFinish(1);
      break;
    case 'coopLevelPick':
      // Host broadcast selected level → update guest's lobby view
      _lobbyLevelIdx = msg.idx;
      if (_lobbyPanelEl) _renderLobbyContent();
      break;
  }
}

// ─── Ready-up state ───────────────────────────────────────────────────────────
// FIX v19: separate flags for each role. Previously both host and guest
// reused `_hostReady`, making the guest's "am I ready?" state corrupt the
// host's "is the guest ready?" state and vice-versa.
let _guestIsReady = false;   // host's view: has the guest pressed READY?
let _myReady      = false;   // this client's own ready toggle (guest side)
let _lobbyLevelIdx = 0;      // module-level so netcode can also read/write it

function _handleGuestReadyMsg(msg) {
  // Only the host receives this; update host's view of guest readiness
  if (netIsHost()) {
    _guestIsReady = !!msg.ready;
    _renderLobbyReadyState();
  }
}

// ─── Co-op Lobby UI ───────────────────────────────────────────────────────────
let _lobbyPanelEl  = null;
let _lobbyActiveTab = 'levels';

function openCoopLobby() {
  if (_lobbyPanelEl) { _lobbyPanelEl.style.display = 'flex'; _renderLobbyContent(); return; }

  const el = document.createElement('div');
  el.id = 'coopLobby';
  el.style.cssText = [
    'position:absolute;inset:0;z-index:25;display:flex;',
    'align-items:center;justify-content:center;',
    'background:rgba(11,16,32,.85);',
  ].join('');

  el.innerHTML = `
    <div id="coopCard" style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:10px 10px 0 #0b1020;
      padding:0;width:94%;max-width:520px;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      position:relative;display:flex;flex-direction:column;
      max-height:92vh;overflow:hidden;
    ">
      <!-- Header -->
      <div style="background:#0b1020;color:#fff4d6;padding:14px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:15px;letter-spacing:3px;font-weight:bold;">⚑ CO-OP LOBBY</span>
        <span id="coopRoleBadge" style="font-size:9px;letter-spacing:2px;background:#0b8c6c;color:#fff;padding:2px 7px;"></span>
        <span style="flex:1;"></span>
        <span id="coopPingBadge" style="font-size:9px;letter-spacing:1px;color:#7ff2e2;"></span>
      </div>

      <!-- Tab bar -->
      <div id="coopTabs" style="display:flex;border-bottom:3px solid #0b1020;flex-shrink:0;">
        <button class="coop-tab active" data-tab="levels" onclick="coopSwitchTab('levels')">LEVELS</button>
        <button class="coop-tab" data-tab="settings" onclick="coopSwitchTab('settings')">SETTINGS</button>
      </div>

      <!-- Tab content -->
      <div id="coopTabContent" style="flex:1;overflow-y:auto;padding:18px 20px;"></div>

      <!-- Footer -->
      <div style="padding:12px 20px;border-top:2px solid #d4c090;display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div id="coopGuestStatus" style="flex:1;font-size:10px;letter-spacing:1px;color:#5a7040;"></div>
        <button id="coopReadyBtn" class="coop-primary-btn" onclick="coopToggleReady()">READY UP</button>
        <button class="coop-outline-btn" onclick="closeCoopLobby()">CLOSE</button>
      </div>
    </div>

    <style>
      .coop-tab {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:2px;padding:9px 18px;
        border:0;background:#fff4d6;color:#7a6030;cursor:pointer;
        border-right:2px solid #0b1020;transition:background .1s;
      }
      .coop-tab.active { background:#0b1020;color:#fff4d6; }
      .coop-tab:last-child { border-right:0; }
      .coop-primary-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:11px;letter-spacing:2px;padding:9px 18px;
        background:#0b1020;color:#fff4d6;border:0;cursor:pointer;
        box-shadow:4px 4px 0 #3a3020;transition:transform .08s,box-shadow .08s;
      }
      .coop-primary-btn:hover  { transform:translate(-2px,-2px);box-shadow:6px 6px 0 #3a3020; }
      .coop-primary-btn:active { transform:translate(1px,1px);box-shadow:1px 1px 0 #3a3020; }
      .coop-primary-btn.ready  { background:#0b8c6c; }
      .coop-primary-btn.go     { background:#a83a3a;color:#fff; }
      .coop-primary-btn.waiting { background:#5a4020;cursor:not-allowed; }
      .coop-outline-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:1px;padding:9px 14px;
        background:#fff4d6;color:#0b1020;border:2px solid #0b1020;cursor:pointer;
        box-shadow:3px 3px 0 #3a3020;transition:transform .08s,box-shadow .08s;
      }
      .coop-outline-btn:hover  { background:#ffe8a0;transform:translate(-1px,-1px);box-shadow:4px 4px 0 #3a3020; }
      .coop-lvl-card {
        border:2px solid #c4a860;padding:10px 14px;margin-bottom:8px;
        cursor:pointer;display:flex;align-items:center;gap:12px;
        background:#fff4d6;transition:background .1s,border-color .1s;
      }
      .coop-lvl-card:hover  { background:#ffe8a0;border-color:#0b1020; }
      .coop-lvl-card.sel    { background:#0b1020;color:#fff4d6;border-color:#0b1020; }
      .coop-lvl-card.no-pick{ cursor:default;pointer-events:none; }
      .coop-lvl-num  { font-size:20px;font-weight:bold;min-width:28px;text-align:center; }
      .coop-lvl-meta { flex:1; }
      .coop-lvl-name { font-size:12px;letter-spacing:2px;font-weight:bold; }
      .coop-lvl-desc { font-size:9px;letter-spacing:1px;color:#8a7040;margin-top:3px; }
      .coop-lvl-card.sel .coop-lvl-desc { color:#a0c0a0; }
      .coop-lvl-medals { display:flex;gap:4px;font-size:11px; }
      .coop-set-row {
        display:flex;align-items:center;gap:10px;padding:8px 0;
        border-bottom:1px solid #e8d8a0;font-size:10px;letter-spacing:1px;
      }
      .coop-set-row:last-child { border-bottom:0; }
      .coop-set-label { flex:1;color:#5a4020; }
      .coop-tog {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:9px;letter-spacing:1px;padding:4px 10px;
        border:2px solid #0b1020;background:#fff4d6;color:#0b1020;cursor:pointer;
        transition:background .1s;
      }
      .coop-tog.on { background:#0b1020;color:#fff4d6; }
      .coop-lag-val { min-width:18px;text-align:right;font-size:10px;color:#0b8c6c; }
      .coop-section { font-size:9px;letter-spacing:2px;color:#7a6030;
        margin:14px 0 6px;border-bottom:1px solid #c4a860;padding-bottom:4px; }
      .coop-medal { font-size:12px;opacity:.3; }
      .coop-medal.on { opacity:1; }
      .ready-pip {
        display:inline-block;width:8px;height:8px;border-radius:50%;
        margin-right:4px;background:#c4a860;
      }
      .ready-pip.on { background:#0b8c6c; }
      .coop-host-note {
        font-size:9px;letter-spacing:1px;color:#8a7040;
        margin-bottom:10px;padding:4px 8px;background:#f8eeb8;
        border-left:3px solid #c4a860;
      }
    </style>
  `;

  const stage = document.getElementById('stage') || document.body;
  stage.appendChild(el);
  _lobbyPanelEl = el;

  _renderLobbyContent();
  _startLobbyPingLoop();
}

function closeCoopLobby() {
  if (_lobbyPanelEl) _lobbyPanelEl.style.display = 'none';
}

function _closeLobbyPanel() { closeCoopLobby(); }

function coopSwitchTab(tab) {
  _lobbyActiveTab = tab;
  _lobbyPanelEl.querySelectorAll('.coop-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  _renderLobbyContent();
}

function _renderLobbyContent() {
  if (!_lobbyPanelEl) return;

  const badge = _lobbyPanelEl.querySelector('#coopRoleBadge');
  if (badge) badge.textContent = netIsHost() ? 'HOST · P1' : 'GUEST · P2';

  const content = _lobbyPanelEl.querySelector('#coopTabContent');
  if (!content) return;
  if (_lobbyActiveTab === 'levels') _renderLevelsTab(content);
  else                               _renderSettingsTab(content);
  _renderLobbyReadyState();
}

// ─── Levels tab ───────────────────────────────────────────────────────────────
function _renderLevelsTab(container) {
  const isHost   = netIsHost();
  let html = '';

  if (!isHost) {
    html += `<div class="coop-host-note">⚑ The host picks the level — ready up once you're set.</div>`;
  }

  html += `<div class="coop-section">CO-OP LEVELS</div>`;
  const coopStart  = typeof LEVELS !== 'undefined' ? LEVELS.findIndex(l => l._coop) : -1;
  const coopLevels = typeof LEVELS !== 'undefined' ? LEVELS.filter(l => l._coop) : [];

  if (coopLevels.length === 0) {
    html += `<div style="font-size:10px;color:#8a7040;letter-spacing:1px;">No co-op levels found.</div>`;
  } else {
    coopLevels.forEach((lvl, ci) => {
      const globalIdx = coopStart + ci;
      const sel       = _lobbyLevelIdx === globalIdx;
      const meds      = coopMedalsFor(globalIdx);
      const medalHtml = COOP_MEDAL_KEYS.map(k =>
        `<span class="coop-medal ${meds.includes(k) ? 'on' : ''}" title="${COOP_MEDAL_LABELS[k]}">${COOP_MEDAL_GLYPHS[k]}</span>`
      ).join('');
      html += `
        <div class="coop-lvl-card ${sel ? 'sel' : ''} ${isHost ? '' : 'no-pick'}" data-idx="${globalIdx}">
          <div class="coop-lvl-num">${ci + 1}</div>
          <div class="coop-lvl-meta">
            <div class="coop-lvl-name">${lvl.name}</div>
            <div class="coop-lvl-desc">${lvl.coopDesc || ''}</div>
          </div>
          <div class="coop-lvl-medals">${medalHtml}</div>
        </div>`;
    });
  }

  html += `<div class="coop-section" style="margin-top:16px;">ANY LEVEL (CO-OP)</div>`;
  if (typeof LEVELS !== 'undefined') {
    LEVELS.filter(l => !l._coop).forEach((lvl, i) => {
      const sel = _lobbyLevelIdx === i;
      html += `
        <div class="coop-lvl-card ${sel ? 'sel' : ''} ${isHost ? '' : 'no-pick'}" data-idx="${i}">
          <div class="coop-lvl-num" style="font-size:13px;">${i + 1}</div>
          <div class="coop-lvl-meta">
            <div class="coop-lvl-name">${lvl.name}</div>
            <div class="coop-lvl-desc">${lvl.biome ? lvl.biome.toUpperCase() + ' BIOME' : ''}</div>
          </div>
        </div>`;
    });
  }

  container.innerHTML = html;

  if (isHost) {
    container.querySelectorAll('.coop-lvl-card').forEach(card => {
      card.addEventListener('click', () => {
        _lobbyLevelIdx = parseInt(card.dataset.idx);
        _renderLevelsTab(container);
        _renderLobbyReadyState();
        netSendReliable({ type: 'coopLevelPick', idx: _lobbyLevelIdx });
      });
    });
  }
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function _renderSettingsTab(container) {
  const s      = coopSettings;
  const isHost = netIsHost();
  container.innerHTML = `
    ${!isHost ? '<div class="coop-host-note">⚑ Settings are controlled by the host.</div>' : ''}
    <div class="coop-section">CO-OP OPTIONS</div>

    <div class="coop-set-row">
      <span class="coop-set-label">Friendly fire</span>
      <button class="coop-tog ${s.friendlyFire ? 'on' : ''}" data-k="friendlyFire">${s.friendlyFire ? 'ON' : 'OFF'}</button>
    </div>
    <div class="coop-set-row">
      <span class="coop-set-label">Respawn mode</span>
      <button class="coop-tog ${s.respawnMode === 'shared' ? 'on' : ''}" data-k="respawnMode"
        title="Shared = one pool of lives; Independent = each player has their own">
        ${s.respawnMode === 'shared' ? 'SHARED' : 'INDEPENDENT'}
      </button>
    </div>
    <div class="coop-set-row">
      <span class="coop-set-label">Shared gem pool</span>
      <button class="coop-tog ${s.sharedGemPool ? 'on' : ''}" data-k="sharedGemPool">${s.sharedGemPool ? 'ON' : 'OFF'}</button>
    </div>
    <div class="coop-set-row">
      <span class="coop-set-label">Show ping</span>
      <button class="coop-tog ${s.showPing ? 'on' : ''}" data-k="showPing">${s.showPing ? 'ON' : 'OFF'}</button>
    </div>

    <div class="coop-section">NETWORK</div>
    <div class="coop-set-row">
      <span class="coop-set-label">Input lag compensation</span>
      <input type="range" min="0" max="6" step="1" value="${s.lagCompensation}"
        data-k="lagCompensation" style="width:90px;" />
      <span class="coop-lag-val">${s.lagCompensation}f</span>
    </div>

    <div class="coop-section">CO-OP MEDALS</div>
    <div style="font-size:9px;letter-spacing:1px;line-height:2;color:#5a4020;">
      ${COOP_MEDAL_KEYS.map(k =>
        `${COOP_MEDAL_GLYPHS[k]} <b>${COOP_MEDAL_LABELS[k]}</b> — ${_coopMedalDesc(k)}`
      ).join('<br>')}
    </div>
  `;

  // Wire toggle buttons
  container.querySelectorAll('.coop-tog[data-k]').forEach(btn => {
    if (!isHost) { btn.disabled = true; btn.style.opacity = '0.45'; btn.style.cursor = 'not-allowed'; return; }
    btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      if (k === 'respawnMode') {
        coopSettings[k] = coopSettings[k] === 'shared' ? 'independent' : 'shared';
        btn.textContent = coopSettings[k] === 'shared' ? 'SHARED' : 'INDEPENDENT';
        btn.classList.toggle('on', coopSettings[k] === 'shared');
      } else {
        coopSettings[k] = !coopSettings[k];
        btn.classList.toggle('on', !!coopSettings[k]);
        btn.textContent = coopSettings[k] ? 'ON' : 'OFF';
      }
      _saveCoopSettings();
      _pushSettingsToGuest();
    });
  });

  // Lag slider
  const lagSlider = container.querySelector('input[data-k="lagCompensation"]');
  if (lagSlider) {
    if (!isHost) { lagSlider.disabled = true; lagSlider.style.opacity = '0.45'; }
    else {
      lagSlider.addEventListener('input', () => {
        const v    = parseInt(lagSlider.value);
        coopSettings.lagCompensation = v;
        const valEl = lagSlider.parentElement.querySelector('.coop-lag-val');
        if (valEl) valEl.textContent = v + 'f';
        _saveCoopSettings();
        _pushSettingsToGuest();
      });
    }
  }
}

function _coopMedalDesc(k) {
  switch(k) {
    case 'coopClear':    return 'Clear a co-op level together';
    case 'coopNoDamage': return 'Neither player takes damage';
    case 'coopSync':     return 'Both reach the flag within 2 s of each other';
    case 'coopSpeed':    return 'Beat the co-op speedrun target';
    default: return '';
  }
}

// ─── Ready-up logic ───────────────────────────────────────────────────────────
// FIX v19: host and guest now track separate ready flags.
//
//   HOST flow:
//     - Button shows "WAITING…" until _guestIsReady is true
//     - Once guest ready, button shows "▶ GO!" and clicking starts the game
//   GUEST flow:
//     - Button toggles _myReady, sends coopReady message to host
//     - Button shows "✓ READY" / "READY UP" accordingly

function coopToggleReady() {
  if (netIsHost()) {
    if (_guestIsReady) {
      // Launch
      if (typeof numPlayers !== 'undefined') numPlayers = 2;
      netSendReliable({ type: 'coopStart', levelIdx: _lobbyLevelIdx });
      _closeLobbyPanel();
      if (typeof startTransition === 'function') startTransition(() => startLevel(_lobbyLevelIdx));
      else if (typeof startLevel === 'function') startLevel(_lobbyLevelIdx);
    } else {
      if (typeof toast === 'function') toast('Waiting for your partner to ready up…');
    }
  } else {
    // Guest toggles own ready flag
    _myReady = !_myReady;
    netSendReliable({ type: 'coopReady', ready: _myReady });
    _renderLobbyReadyState();
  }
}

function _renderLobbyReadyState() {
  if (!_lobbyPanelEl) return;
  const btn  = _lobbyPanelEl.querySelector('#coopReadyBtn');
  const stat = _lobbyPanelEl.querySelector('#coopGuestStatus');

  if (netIsHost()) {
    const pip = `<span class="ready-pip ${_guestIsReady ? 'on' : ''}"></span>`;
    if (stat) stat.innerHTML = `${pip} Partner: ${_guestIsReady ? '<b>READY</b>' : 'waiting…'}`;
    if (btn) {
      if (_guestIsReady) {
        btn.textContent = '▶ GO!';
        btn.className   = 'coop-primary-btn go';
      } else {
        btn.textContent = 'WAITING…';
        btn.className   = 'coop-primary-btn waiting';
      }
    }
  } else {
    if (stat) stat.innerHTML = 'Host picks the level — ready up when you\'re set.';
    if (btn) {
      btn.textContent = _myReady ? '✓ READY' : 'READY UP';
      btn.className   = `coop-primary-btn ${_myReady ? 'ready' : ''}`;
    }
  }
}

// ─── Push settings to guest ───────────────────────────────────────────────────
function _pushSettingsToGuest() {
  if (!netIsHost()) return;
  netSendReliable({ type: 'coopSettings', settings: coopSettings });
}

// ─── Ping loop ────────────────────────────────────────────────────────────────
let _pingLoopHandle = null;

function _startLobbyPingLoop() {
  if (_pingLoopHandle) return;
  _pingLoopHandle = setInterval(() => {
    if (!netIsActive()) { clearInterval(_pingLoopHandle); _pingLoopHandle = null; return; }
    coopSendPing();
    // Update badge in lobby if visible
    if (_lobbyPanelEl && _lobbyPanelEl.style.display !== 'none') {
      const badge = _lobbyPanelEl.querySelector('#coopPingBadge');
      if (badge) badge.textContent = _pingRtt !== null ? `${_pingRtt} ms` : '— ms';
    }
  }, 1000);
}

// ─── In-game HUD ──────────────────────────────────────────────────────────────
function coopUpdateHud() {
  const pip = document.getElementById('coopNetPip');
  if (pip) {
    if (netIsActive() && coopSettings.showPing) {
      pip.style.display = 'flex';
      const pingEl = pip.querySelector('#coopPingVal');
      if (pingEl) pingEl.textContent = _pingRtt !== null ? `${_pingRtt}ms` : '…';
      const roleEl = pip.querySelector('#coopRoleVal');
      if (roleEl) roleEl.textContent = netIsHost() ? '⚑ HOST' : '→ GUEST';
    } else {
      pip.style.display = 'none';
    }
  }

  // Revive progress arcs
  if (typeof players !== 'undefined' && typeof cam !== 'undefined') {
    const stage  = document.getElementById('stage');
    const canvas = document.getElementById('game');
    if (!stage || !canvas) return;
    const scaleX = canvas.offsetWidth  / (canvas.width  || 1);
    const scaleY = canvas.offsetHeight / (canvas.height || 1);

    players.forEach((p, i) => {
      const arc    = document.getElementById(`reviveArc${i}`);
      const circle = document.getElementById(`reviveCircle${i}`);
      if (!arc || !circle) return;
      const prog = coopReviveProgress(i);
      if (p.dead && netIsActive() && prog > 0) {
        arc.style.display = '';
        const sx = (p.x - cam.x) * scaleX - 14;
        const sy = (p.y - cam.y) * scaleY - 28;
        arc.style.left = Math.round(sx) + 'px';
        arc.style.top  = Math.round(sy) + 'px';
        const circumference = 2 * Math.PI * 11;
        circle.style.strokeDasharray  = circumference;
        circle.style.strokeDashoffset = circumference * (1 - prog);
      } else {
        arc.style.display = 'none';
      }
    });
  }
}

// ─── netSendReliable / netFastChannel helpers ─────────────────────────────────
// These reach into netcode.js module-level vars (_reliable, _fast) which are
// in the same global script scope.
function netSendReliable(msg) {
  if (typeof _reliable !== 'undefined' && _reliable && _reliable.readyState === 'open') {
    try { _reliable.send(JSON.stringify(msg)); } catch(e) {}
  }
}

function netFastChannel() {
  if (typeof _fast !== 'undefined') return _fast;
  return null;
}

// ─── Co-op level definitions ──────────────────────────────────────────────────
const COOP_LEVELS = [
  {
    name: 'TWIN GROVE',
    biome: 'grove',
    _coop: true,
    coopDesc: 'Two paths, one goal — pressure plates need both players',
    map: [
      "....................................................................................................",
      "....................................................................................................",
      "...........G.G.G......................................G.G.G.....................................",
      "..........PPP.PPP.....................................PPP.PPP....................................",
      "....................................................................................................",
      ".....G......................C.......................C....................G......................",
      "...BBBBB.......G.G......BBBBBBB.BBB...................BBB.BBBBBBB......G.G.......BBBBB......",
      "....................................................................................................",
      "..V...........G.....................................G...........V..............................",
      "..........PPPP.............................................PPPP...............................",
      "...G...G.....G.G.G........[.................].........G.G.G.....G...G..........................",
      "..BBBBB....BBBBB..........1.....G.G.G.......2...........BBBBB....BBBBB.........................",
      ".........................................................................G...G.G...G..........",
      "..@..P2...S.....W.........BBB..C..BBB.......N.....W.....S.........................T.......F..",
      "################====################====################====################====##############",
      "################====################====################====################====##############",
    ],
  },
  {
    name: 'RELAY BEACH',
    biome: 'beach',
    _coop: true,
    coopDesc: 'One player opens gates while the other advances — swap roles',
    map: [
      "..................................................................................................",
      "..................................................................................................",
      "..........V.................................V........V.....................................",
      "....G.G.....G.G.G....................G.G.........G.G.G..........G.G.G......................",
      "..PPPP.....PPPP...?..................PPPP........PPPP.........PPPP.....?.......................",
      ".......................G..................G...........G..............G......................",
      "..........BBB....[....L.J...BBB...................BBB....L.J...BBB.............................B",
      "......G...........[.........G.G.G.....G.G.G........[...........G.G.G...G.G......................",
      "..@...N.....S.....].........C.......C.......].....N.......T.............Y..........D.......F.",
      "###########=======##########====########===##########=========########=====########===========",
      "###########=======##########====########===##########=========########=====########===========",
      "###########~~~~~~~##########~~~~########~~~##########~~~~~~~~~########~~~~~########~~~~~~~~~~~",
    ],
  },
  {
    name: 'VAULT WORKS',
    biome: 'cave',
    _coop: true,
    coopDesc: 'Carry each other across gaps — crates, ice, timing puzzles',
    map: [
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "B................................................................................................B",
      "B....G.G.G.................G..G.G......................................G.G.G...................B",
      "B..BBBBBBB.................................e.e.q.e.e.......................BBBBBBB...............B",
      "B................................................................................................B",
      "B.......................[.....L.....J.........................................[...L......J.......B",
      "B....O...O.........k.....[.............................l...............O......[................l..B",
      "B..BBBBBBB...1.....BBB...[.....G.G.......G.G.......BBB.....2.........BBB....[...G.G.....BBB....B",
      "B.....................................................iiiiii..............................i.....B",
      "B.......................n..............n.........................................n...............B",
      "B..@...S...........W...BBB..C.....C..BBB...Y........N.....T.............S.....BBB........C..F..B",
      "B##################################################################################################B",
      "B##################################################################################################B",
    ],
  },
];

(function injectCoopLevels() {
  if (typeof LEVELS === 'undefined') { setTimeout(injectCoopLevels, 50); return; }
  const startIdx = LEVELS.length;
  LEVELS.push(...COOP_LEVELS);
  COOP_SPEEDRUN_TARGETS[startIdx + 0] = 70;   // Twin Grove
  COOP_SPEEDRUN_TARGETS[startIdx + 1] = 80;   // Relay Beach
  COOP_SPEEDRUN_TARGETS[startIdx + 2] = 95;   // Vault Works
})();
