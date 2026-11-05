/* Blip's Grove — lobby-ui.js  (M6.2 / v20 polish)
 *
 * Renders the full multiplayer lobby panel:
 *   - Create room / Join by code tabs
 *   - Player list with colours, ready pips, ping badges
 *   - Chat panel (history + input)
 *   - Game mode selector (co-op / race / gem hunt / last stand)
 *   - Level picker (host only)
 *   - GO button (host, when all ready)
 *   - Spectator mode join
 *   - Copy invite link button
 *   - Disconnect button
 *
 * v20 changes:
 *   - Auto-fill room code from ?room= URL param on page load (lobbyCheckAutoJoin
 *     already strips the param and calls openLobbyUI; _renderJoinTab now reads
 *     window.__lobbyPrefillCode if set before the panel is built).
 *   - Room code shown large + one-click copy in header when connected.
 *   - Invite link in Room tab now also shows the raw 6-letter code alongside
 *     the full URL so guests can type it manually if the link doesn't open.
 *   - Join tab: hitting Enter in the code field submits immediately.
 *   - Error states: join failures show inline retry without closing the panel.
 *   - Connection-quality badge next to ping (good / ok / poor thresholds).
 *   - "Creating room…" and "Joining…" show animated ellipsis spinner.
 *   - GO button pulses green when all players are ready.
 *   - Lobby header subtitle shows game mode name when connected.
 *
 * Bug fixes (v19, kept):
 *   - id="lRoomPwInput" in room tab (was "lPwInput", collided with join tab).
 *   - Chat input only auto-focuses on explicit tab click, not on re-render.
 *   - _onChatReceived appends to live history instead of full re-render.
 *   - lobbyUIGo guards against disabled state.
 *   - "WAITING…" GO button is disabled + aria-disabled.
 */

'use strict';

let _lobbyUIEl      = null;
let _lobbyUITab     = 'room';
let _lobbyPickedLvl = 0;
let _chatAutoFocus  = false;  // only focus chat input when user explicitly opens chat tab

// ─── Open / close ─────────────────────────────────────────────────────────────
function openLobbyUI() {
  if (_lobbyUIEl) { _lobbyUIEl.style.display = 'flex'; _renderLobbyUI(); return; }
  _buildLobbyUI();
}

function closeLobbyUI() {
  if (_lobbyUIEl) _lobbyUIEl.style.display = 'none';
}

// ─── Connection quality helper ─────────────────────────────────────────────────
function _pingQuality(ms) {
  if (ms === null || ms === undefined) return { label: '—',    color: '#8a7040', dot: '#c4a860' };
  if (ms < 60)  return { label: 'GOOD', color: '#0b8c6c', dot: '#0b8c6c' };
  if (ms < 150) return { label: 'OK',   color: '#a86c00', dot: '#ffa020' };
  return             { label: 'POOR', color: '#a83a3a', dot: '#e05050' };
}

function _buildLobbyUI() {
  const el = document.createElement('div');
  el.id = 'lobbyUI';
  el.style.cssText = [
    'position:absolute;inset:0;z-index:30;display:flex;',
    'align-items:center;justify-content:center;',
    'background:rgba(11,16,32,.88);',
  ].join('');

  el.innerHTML = `
    <div id="lobbyCard" style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:12px 12px 0 #0b1020;
      width:96%;max-width:560px;max-height:94vh;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      display:flex;flex-direction:column;overflow:hidden;position:relative;
    ">
      <!-- Header -->
      <div style="background:#0b1020;color:#fff4d6;padding:12px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span style="font-size:15px;letter-spacing:3px;font-weight:bold;">⚑ MULTIPLAYER</span>
          <span id="lobbyModeSubtitle" style="font-size:9px;letter-spacing:2px;color:#7ff2e2;display:none;"></span>
        </div>
        <span style="flex:1;"></span>
        <!-- Room code pill — shown when connected, click to copy -->
        <button id="lobbyRoomCodeBtn" style="
          display:none;background:#0b8c6c;color:#fff;border:0;cursor:pointer;
          font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
          font-size:14px;font-weight:bold;letter-spacing:4px;
          padding:5px 12px;box-shadow:3px 3px 0 #064d3c;
          transition:transform .08s,box-shadow .08s;
          " title="Click to copy invite link" onclick="_lobbyUIcopyroomcode()"></button>
        <span id="lobbyRoleBadge" style="font-size:9px;letter-spacing:1px;color:#a0c8c0;"></span>
      </div>

      <!-- Tab bar -->
      <div id="lobbyTabs" style="display:flex;border-bottom:3px solid #0b1020;flex-shrink:0;">
        <button class="ltab active" data-tab="room">ROOM</button>
        <button class="ltab" data-tab="chat">CHAT
          <span id="lobbyUnreadBadge" style="display:none;background:#a83a3a;color:#fff;font-size:8px;padding:1px 4px;margin-left:2px;border-radius:3px;">!</span>
        </button>
        <button class="ltab" data-tab="levels">LEVELS</button>
      </div>

      <!-- Tab content -->
      <div id="lobbyTabContent" style="flex:1;overflow-y:auto;padding:18px 20px;min-height:0;"></div>

      <!-- Footer -->
      <div style="padding:12px 20px;border-top:2px solid #d4c090;display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div id="lobbyStatus" style="flex:1;font-size:9px;letter-spacing:1px;color:#7a6030;"></div>
        <button id="lobbyGoBtn"        class="lprimary" style="display:none;" onclick="lobbyUIGo()">▶ GO!</button>
        <button id="lobbyReadyBtn"     class="lprimary" style="display:none;" onclick="lobbyUIReady()">READY UP</button>
        <button id="lobbyDisconnectBtn" class="loutline danger" style="display:none;" onclick="lobbyUIDisconnect()">LEAVE</button>
        <button class="loutline" onclick="closeLobbyUI()">CLOSE</button>
      </div>
    </div>

    <style>
      @keyframes lobbyGoPulse {
        0%,100% { box-shadow:4px 4px 0 #064d3c; }
        50%      { box-shadow:4px 4px 0 #0fcc9e,0 0 18px #0fcc9e88; }
      }
      #lobbyGoBtn.go { animation: lobbyGoPulse 1.2s ease-in-out infinite; }
      @keyframes lobbyEllipsis {
        0%   { content: '.'; }
        33%  { content: '..'; }
        66%  { content: '...'; }
        100% { content: '.'; }
      }
      .lspinner::after {
        content: '.';
        animation: lobbyEllipsis 1.2s steps(1) infinite;
      }
    </style>

    <style>
      .ltab {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:2px;padding:9px 16px;
        border:0;background:#fff4d6;color:#7a6030;cursor:pointer;
        border-right:2px solid #0b1020;flex:1;transition:background .1s;
      }
      .ltab.active { background:#0b1020;color:#fff4d6; }
      .ltab:last-child { border-right:0; }
      .lprimary {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:11px;letter-spacing:2px;padding:9px 16px;
        background:#0b1020;color:#fff4d6;border:0;cursor:pointer;
        box-shadow:4px 4px 0 #3a3020;transition:transform .08s,box-shadow .08s;
      }
      .lprimary:hover:not(:disabled)  { transform:translate(-2px,-2px);box-shadow:6px 6px 0 #3a3020; }
      .lprimary:active:not(:disabled) { transform:translate(1px,1px);box-shadow:1px 1px 0 #3a3020; }
      .lprimary.go     { background:#0b8c6c; }
      .lprimary.ready  { background:#a86c00; }
      .lprimary:disabled { opacity:.5;cursor:not-allowed;box-shadow:2px 2px 0 #3a3020; }
      .loutline {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:1px;padding:9px 14px;
        background:#fff4d6;color:#0b1020;border:2px solid #0b1020;cursor:pointer;
        box-shadow:3px 3px 0 #3a3020;transition:transform .08s,box-shadow .08s;
      }
      .loutline:hover  { background:#ffe8a0;transform:translate(-1px,-1px);box-shadow:4px 4px 0 #3a3020; }
      .loutline:active { transform:translate(1px,1px);box-shadow:1px 1px 0 #3a3020; }
      .loutline.danger { border-color:#a83a3a;color:#a83a3a; }
      .loutline.danger:hover { background:#fde8e8; }
      /* Player card */
      .lplayer-card {
        display:flex;align-items:center;gap:10px;
        padding:9px 12px;margin-bottom:6px;
        border:2px solid #c4a860;background:#fff4d6;
      }
      .lplayer-dot  { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
      .lplayer-name { flex:1;font-size:11px;letter-spacing:1px;font-weight:bold; }
      .lplayer-ping { font-size:9px;letter-spacing:1px; }
      .lplayer-ready     { font-size:9px;letter-spacing:1px; }
      .lplayer-ready.on  { color:#0b8c6c; }
      .lplayer-ready.off { color:#c4a860; }
      .lme { border-color:#0b8c6c;background:#e8fff8; }
      /* Join inputs */
      .linput-row { display:flex;gap:6px;margin-top:8px; }
      .linput-row input,
      .linput-field {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:11px;padding:8px 10px;border:2px solid #0b1020;
        background:#fff;color:#0b1020;letter-spacing:1px;
      }
      .linput-row input { flex:1; }
      .linput-field { width:100%;box-sizing:border-box; }
      /* Chat */
      .lchat-history {
        height:160px;overflow-y:auto;
        background:#0b1020;padding:8px 10px;
        font-size:10px;letter-spacing:0;line-height:1.7;color:#c0d8d0;
        border:2px solid #0b1020;margin-bottom:8px;
      }
      .lchat-input {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:11px;padding:8px 10px;
        border:2px solid #0b1020;width:100%;box-sizing:border-box;
        background:#fff;color:#0b1020;
      }
      /* Level card */
      .llvl-card {
        display:flex;align-items:center;gap:10px;
        padding:8px 12px;margin-bottom:6px;
        border:2px solid #c4a860;cursor:pointer;background:#fff4d6;
        transition:background .1s,border-color .1s;
      }
      .llvl-card:hover  { background:#ffe8a0;border-color:#0b1020; }
      .llvl-card.sel    { background:#0b1020;color:#fff4d6;border-color:#0b1020; }
      .llvl-card.disabled { opacity:.5;cursor:default;pointer-events:none; }
      .llvl-num  { font-size:18px;font-weight:bold;min-width:26px;text-align:center; }
      .llvl-name { font-size:11px;letter-spacing:2px;font-weight:bold; }
      .llvl-desc { font-size:9px;letter-spacing:1px;color:#8a7040;margin-top:2px; }
      .llvl-card.sel .llvl-desc { color:#a0c0a0; }
      /* Sections */
      .lsection { font-size:9px;letter-spacing:2px;color:#7a6030;
        margin:14px 0 8px;border-bottom:1px solid #c4a860;padding-bottom:4px; }
      /* Mode toggles */
      .lmode-row { display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap; }
      .lmode-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:1px;padding:7px 14px;
        border:2px solid #0b1020;background:#fff4d6;color:#0b1020;cursor:pointer;
        flex:1;text-align:center;transition:background .1s;
        min-width:80px;
      }
      .lmode-btn.sel { background:#0b1020;color:#fff4d6; }
      .lmode-btn:disabled { opacity:.45;cursor:not-allowed; }
      /* Invite box */
      .linvite-box {
        display:flex;align-items:center;gap:6px;
        background:#0b1020;padding:8px 10px;
        font-size:9px;color:#7ff2e2;letter-spacing:0;
        font-family:ui-monospace,monospace;
        white-space:nowrap;overflow:hidden;
      }
      .linvite-text { flex:1;overflow:hidden;text-overflow:ellipsis; }
      /* Room code big display */
      .lroom-code-big {
        display:flex;align-items:center;gap:10px;
        background:#0b1020;padding:10px 14px;margin-bottom:6px;
      }
      .lroom-code-digits {
        font-size:28px;font-weight:bold;letter-spacing:8px;
        color:#7ff2e2;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        flex:1;
      }
      /* Admin */
      .ladmin-btn {
        font-family:ui-monospace,monospace;font-size:9px;padding:3px 7px;
        border:1px solid #c4a860;background:#fff4d6;color:#5a4020;cursor:pointer;
        margin-left:4px;transition:background .1s;
      }
      .ladmin-btn:hover { background:#ffe8a0; }
      .ladmin-row { display:flex;align-items:center;gap:6px;margin-top:6px; }
      .lsub-row   { display:flex;align-items:center;gap:8px;margin-top:4px; }
      .lhost-note {
        font-size:9px;letter-spacing:1px;color:#8a7040;
        margin-bottom:10px;padding:4px 8px;background:#f8eeb8;
        border-left:3px solid #c4a860;
      }
      /* Error/retry banner */
      .lerror-banner {
        background:#fde8e8;border:2px solid #a83a3a;
        padding:8px 12px;font-size:10px;letter-spacing:1px;
        color:#a83a3a;display:flex;align-items:center;gap:8px;margin-top:8px;
      }
    </style>
  `;

  const stage = document.getElementById('stage') || document.body;
  stage.appendChild(el);
  _lobbyUIEl = el;

  // Tab switching — set _chatAutoFocus only on explicit user tab click
  el.querySelectorAll('.ltab').forEach(t => {
    t.addEventListener('click', () => {
      _lobbyUITab = t.dataset.tab;
      _chatAutoFocus = (_lobbyUITab === 'chat');
      el.querySelectorAll('.ltab').forEach(x => x.classList.toggle('active', x.dataset.tab === _lobbyUITab));
      if (_lobbyUITab === 'chat') {
        const badge = el.querySelector('#lobbyUnreadBadge');
        if (badge) badge.style.display = 'none';
      }
      _renderLobbyUI();
    });
  });

  if (typeof lobbyOnStateChange === 'function') lobbyOnStateChange(_renderLobbyUI);
  if (typeof lobbyOnChat === 'function') lobbyOnChat(_onChatReceived);

  _renderLobbyUI();
}

// ─── Copy room invite link (header button) ────────────────────────────────────
window._lobbyUIcopyroomcode = function() {
  const code = typeof lobbyGetRoomCode === 'function' ? lobbyGetRoomCode() : null;
  if (!code) return;
  const url = _buildRoomUrl(code);
  const btn = _lobbyUIEl && _lobbyUIEl.querySelector('#lobbyRoomCodeBtn');
  _copyText(url, btn || { textContent: '' });
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ COPIED!';
    btn.style.letterSpacing = '2px';
    btn.style.fontSize = '11px';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.letterSpacing = '4px';
      btn.style.fontSize = '14px';
    }, 2000);
  }
};

// ─── Main render ──────────────────────────────────────────────────────────────
function _renderLobbyUI() {
  if (!_lobbyUIEl || _lobbyUIEl.style.display === 'none') return;

  const active  = typeof lobbyIsActive === 'function' && lobbyIsActive();
  const isHost  = active && typeof lobbyIsHost === 'function' && lobbyIsHost();
  const isSpec  = active && typeof lobbyIsSpectator === 'function' && lobbyIsSpectator();
  const mySlot  = typeof lobbyGetMySlot === 'function' ? lobbyGetMySlot() : 0;
  const players = typeof lobbyGetPlayers === 'function' ? lobbyGetPlayers() : [];
  const myPlayer = players.find(p => p.slot === mySlot);
  const myReady  = myPlayer ? myPlayer.ready : false;
  const allReady = typeof lobbyAllReady === 'function' && lobbyAllReady();
  const mode     = typeof lobbyGetMode === 'function' ? lobbyGetMode() : 'coop';
  const code     = typeof lobbyGetRoomCode === 'function' ? lobbyGetRoomCode() : null;

  // ── Header: room code button + role badge + mode subtitle ──
  const codeBtn  = _lobbyUIEl.querySelector('#lobbyRoomCodeBtn');
  const roleBadge = _lobbyUIEl.querySelector('#lobbyRoleBadge');
  const modeSub  = _lobbyUIEl.querySelector('#lobbyModeSubtitle');

  if (codeBtn) {
    if (code) {
      codeBtn.style.display = '';
      codeBtn.textContent   = code;
      codeBtn.title         = 'Click to copy invite link';
    } else {
      codeBtn.style.display = 'none';
    }
  }
  if (roleBadge) {
    roleBadge.textContent = !active ? '' : isSpec ? '👁 SPECTATING' : isHost ? '⚑ HOST' : '→ GUEST';
  }
  if (modeSub) {
    const modeNames = { coop:'CO-OP', race:'CO-OP RACE', gemhunt:'GEM HUNT', los:'LAST STAND' };
    if (active && code) {
      modeSub.style.display = '';
      modeSub.textContent   = modeNames[mode] || mode.toUpperCase();
    } else {
      modeSub.style.display = 'none';
    }
  }

  // ── Footer buttons ──
  const goBtn    = _lobbyUIEl.querySelector('#lobbyGoBtn');
  const readyBtn = _lobbyUIEl.querySelector('#lobbyReadyBtn');
  const discBtn  = _lobbyUIEl.querySelector('#lobbyDisconnectBtn');
  const statusEl = _lobbyUIEl.querySelector('#lobbyStatus');

  if (active) {
    if (goBtn) {
      goBtn.style.display = isHost ? '' : 'none';
      goBtn.disabled      = !allReady;
      goBtn.className     = `lprimary ${allReady ? 'go' : ''}`;
      goBtn.textContent   = allReady ? '▶ GO!' : 'WAITING…';
    }
    if (readyBtn) {
      readyBtn.style.display = (!isHost && !isSpec) ? '' : 'none';
      readyBtn.textContent   = myReady ? '✓ READY' : 'READY UP';
      readyBtn.className     = `lprimary ${myReady ? 'ready' : ''}`;
    }
    if (discBtn) discBtn.style.display = '';
    if (statusEl) {
      const readyCount = players.filter(p => p.ready).length;
      statusEl.textContent = `${players.length} player${players.length !== 1 ? 's' : ''} · ${readyCount} ready`;
    }
  } else {
    if (goBtn)    goBtn.style.display    = 'none';
    if (readyBtn) readyBtn.style.display = 'none';
    if (discBtn)  discBtn.style.display  = 'none';
    if (statusEl) statusEl.textContent   = '';
  }

  // ── Tab content ──
  const content = _lobbyUIEl.querySelector('#lobbyTabContent');
  if (!content) return;

  if (!active) {
    _renderJoinTab(content);
  } else {
    if (_lobbyUITab === 'room')        _renderRoomTab(content);
    else if (_lobbyUITab === 'chat')   _renderChatTab(content);
    else if (_lobbyUITab === 'levels') _renderLevelsTab(content);
  }
}

// ─── Join tab (pre-connection) ────────────────────────────────────────────────
function _renderJoinTab(container) {
  // Auto-fill code from ?room= URL param (set by lobbyCheckAutoJoin before panel opens)
  const prefill = (window.__lobbyPrefillCode || '').toUpperCase().slice(0, 6);
  if (prefill) window.__lobbyPrefillCode = ''; // consume once

  container.innerHTML = `
    <div class="lsection">CREATE A ROOM</div>
    <p style="font-size:10px;letter-spacing:1px;color:#5a4020;margin:0 0 10px;">
      Host a room and share the 6-letter code with up to 3 friends.
    </p>
    <button class="lprimary" id="lBtnCreate" style="width:100%;margin-bottom:6px;">⚑ CREATE ROOM</button>
    <button class="loutline" id="lBtnCreateSpec" style="width:100%;font-size:9px;">Create as spectator only</button>

    <div class="lsection" style="margin-top:20px;">JOIN A ROOM</div>
    <p style="font-size:10px;letter-spacing:1px;color:#5a4020;margin:0 0 10px;">
      Enter the 6-letter room code your friend shared.
    </p>
    <div class="linput-row">
      <input id="lCodeInput" type="text" maxlength="6"
        placeholder="ROOM CODE" autocomplete="off" value="${prefill}"
        style="letter-spacing:4px;font-size:16px;font-weight:bold;text-transform:uppercase;" />
      <button class="lprimary" id="lBtnJoin">JOIN</button>
    </div>
    <input id="lJoinPwInput" type="text" maxlength="20" placeholder="Password (if required)"
      class="linput-field" style="margin-top:6px;border-color:#c4a860;" />
    <button class="loutline" id="lBtnJoinSpec" style="width:100%;margin-top:6px;font-size:9px;">Join as spectator</button>

    <div id="lJoinStatus" style="min-height:16px;margin-top:10px;font-size:10px;letter-spacing:1px;"></div>
  `;

  // If code was pre-filled from URL, focus the JOIN button so user can just hit Enter
  if (prefill.length === 6) {
    setTimeout(() => {
      const joinBtn = container.querySelector('#lBtnJoin');
      if (joinBtn) joinBtn.focus();
    }, 50);
  }

  const setStatus = (msg, level) => {
    const el = container.querySelector('#lJoinStatus');
    if (!el) return;
    const color = level === 'error' ? '#a83a3a' : level === 'ok' ? '#0b8c6c' : '#7a6030';
    el.innerHTML = `<span style="color:${color};">${msg}</span>`;
  };

  const setSpinner = (label) => {
    const el = container.querySelector('#lJoinStatus');
    if (!el) return;
    el.innerHTML = `<span style="color:#7a6030;">${label}<span class="lspinner"></span></span>`;
  };

  const doCreate = async () => {
    const btn = container.querySelector('#lBtnCreate');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating'; btn.classList.add('lspinner'); }
    setSpinner('Creating room');
    try {
      const code = await lobbyCreate();
      setStatus(`Room created: <b>${code}</b>`, 'ok');
      _renderLobbyUI();
    } catch(e) {
      setStatus(`✗ ${e.message} — <a href="#" id="lRetryCreate" style="color:#a83a3a;">retry</a>`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '⚑ CREATE ROOM'; btn.classList.remove('lspinner'); }
      const retryLink = container.querySelector('#lRetryCreate');
      if (retryLink) retryLink.addEventListener('click', e => { e.preventDefault(); doCreate(); });
    }
  };

  const doJoin = async (asSpec) => {
    const codeEl = container.querySelector('#lCodeInput');
    const code   = (codeEl?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pw     = (container.querySelector('#lJoinPwInput')?.value || '').trim();
    if (code.length < 6) { setStatus('Enter a 6-letter room code.', 'error'); codeEl?.focus(); return; }
    const joinBtn = container.querySelector('#lBtnJoin');
    if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = '…'; }
    setSpinner(`Joining ${code}`);
    try {
      await lobbyJoin(code, asSpec, pw);
      setStatus('Connected!', 'ok');
      _renderLobbyUI();
    } catch(e) {
      setStatus(`✗ ${e.message}`, 'error');
      if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'JOIN'; }
    }
  };

  container.querySelector('#lBtnCreate').addEventListener('click', doCreate);
  container.querySelector('#lBtnCreateSpec').addEventListener('click', doCreate);
  container.querySelector('#lBtnJoin').addEventListener('click', () => doJoin(false));
  container.querySelector('#lBtnJoinSpec').addEventListener('click', () => doJoin(true));
  container.querySelector('#lCodeInput').addEventListener('keydown', e => {
    e.stopPropagation();
    // Force uppercase as user types
    e.target.value = e.target.value.toUpperCase();
    if (e.key === 'Enter') doJoin(false);
  });
  container.querySelector('#lCodeInput').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  container.querySelector('#lJoinPwInput').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') doJoin(false);
  });
}

// ─── Room tab (connected) ─────────────────────────────────────────────────────
function _renderRoomTab(container) {
  const players = typeof lobbyGetPlayers === 'function' ? lobbyGetPlayers() : [];
  const isHost  = typeof lobbyIsHost === 'function' && lobbyIsHost();
  const mySlot  = typeof lobbyGetMySlot === 'function' ? lobbyGetMySlot() : 0;
  const mode    = typeof lobbyGetMode === 'function' ? lobbyGetMode() : 'coop';
  const locked  = typeof lobbyIsLocked === 'function' && lobbyIsLocked();
  const PAL     = typeof LOBBY_PALETTES !== 'undefined' ? LOBBY_PALETTES : [];
  const maxP    = typeof LOBBY_MAX_PLAYERS !== 'undefined' ? LOBBY_MAX_PLAYERS : 4;
  const code    = typeof lobbyGetRoomCode === 'function' ? lobbyGetRoomCode() : '';

  // ── Big room code + invite block ──
  let html = '';
  if (code) {
    const inviteUrl = _buildRoomUrl(code);
    html += `
      <div class="lroom-code-big">
        <div>
          <div style="font-size:9px;letter-spacing:2px;color:#5a8a80;margin-bottom:4px;">ROOM CODE</div>
          <div class="lroom-code-digits">${code}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          <button class="lprimary" id="lBtnCopyCode" style="font-size:9px;padding:5px 10px;white-space:nowrap;">⎘ COPY CODE</button>
          <button class="lprimary" id="lBtnCopyInviteTop" style="font-size:9px;padding:5px 10px;white-space:nowrap;background:#0b5c48;">⎘ COPY LINK</button>
        </div>
      </div>
      <div style="font-size:9px;letter-spacing:1px;color:#8a7040;margin-bottom:10px;">
        Friends can join with the code above, or open the invite link directly.
      </div>`;
  }

  // ── Player list ──
  html += `<div class="lsection">PLAYERS (${players.length} / ${maxP})</div>`;

  for (const p of players) {
    const dotColor = PAL[p.color]?.base || '#ccc';
    const isMe     = p.slot === mySlot;
    const pq       = _pingQuality(p.ping);
    const pingHtml = p.ping !== null
      ? `<span style="color:${pq.color};font-size:9px;letter-spacing:1px;">${p.ping}ms <span style="font-size:8px;">${pq.label}</span></span>`
      : `<span style="color:#8a7040;font-size:9px;">—</span>`;
    const adminBtns = isHost && !isMe ? `
      <button class="ladmin-btn" data-action="kick" data-slot="${p.slot}" title="Kick player">✕</button>
      <button class="ladmin-btn" data-action="transfer" data-slot="${p.slot}" title="Make host">⚑</button>` : '';
    html += `
      <div class="lplayer-card ${isMe ? 'lme' : ''}">
        <div class="lplayer-dot" style="background:${dotColor};box-shadow:0 0 0 2px ${dotColor}44;"></div>
        <div class="lplayer-name">
          ${_escHtml(p.name)}
          ${isMe ? '<span style="font-size:8px;color:#0b8c6c;"> (YOU)</span>' : ''}
          ${p.slot === 0 ? '<span style="font-size:8px;color:#ffd866;"> ⚑</span>' : ''}
        </div>
        <div class="lplayer-ping">${pingHtml}</div>
        <div class="lplayer-ready ${p.ready ? 'on' : 'off'}">${p.ready ? '✓ READY' : '○ WAITING'}</div>
        ${adminBtns}
      </div>`;
  }
  for (let i = players.length; i < maxP; i++) {
    html += `<div class="lplayer-card" style="opacity:.4;">
      <div class="lplayer-dot" style="background:#c4a860;"></div>
      <div class="lplayer-name" style="color:#8a7040;">Waiting for player ${i+1}…</div>
    </div>`;
  }

  // ── Game mode ──
  html += `<div class="lsection" style="margin-top:14px;">GAME MODE</div>
  <div class="lmode-row">
    <button class="lmode-btn ${mode==='coop'?'sel':''}" data-mode="coop">⚑ CO-OP</button>
    <button class="lmode-btn ${mode==='race'?'sel':''}" data-mode="race">🏁 RACE</button>
    <button class="lmode-btn ${mode==='gemhunt'?'sel':''}" data-mode="gemhunt">💎 GEM HUNT</button>
    <button class="lmode-btn ${mode==='los'?'sel':''}" data-mode="los">⚔ LAST STAND</button>
  </div>`;

  if (mode === 'race') {
    html += `<div style="font-size:9px;letter-spacing:1px;color:#5a7040;margin-bottom:6px;">First to the flag wins!</div>`;
  } else if (mode === 'gemhunt') {
    const dur = typeof lobbyGetGemHuntDuration === 'function' ? lobbyGetGemHuntDuration() : 90;
    html += `<div style="font-size:9px;letter-spacing:1px;color:#5a7040;margin-bottom:4px;">Collect the most gems in ${dur}s!</div>`;
    if (isHost) html += `<div class="lsub-row">
      <span style="font-size:9px;letter-spacing:1px;color:#5a4020;">Duration:</span>
      <input type="range" id="lGemHuntDur" min="30" max="300" step="15" value="${dur}" style="width:80px;" />
      <span id="lGemHuntDurVal" style="font-size:9px;color:#0b8c6c;">${dur}s</span>
    </div>`;
  } else if (mode === 'los') {
    const level  = typeof lobbyGetLosHazardLevel === 'function' ? lobbyGetLosHazardLevel() : 0;
    const levDef = typeof LOS_HAZARD_LEVELS !== 'undefined' ? LOS_HAZARD_LEVELS : [];
    html += `<div style="font-size:9px;letter-spacing:1px;color:#5a7040;margin-bottom:6px;">
      Last player alive wins! Hazards escalate every 15s.<br>
      ${level > 0 ? `⚠ Hazard ${levDef[level]?.label || level}: ${levDef[level]?.desc || ''}` : 'Hazards escalate once the game begins.'}
    </div>`;
  }

  // ── Host admin ──
  if (isHost) {
    const curPw  = typeof lobbyGetPassword === 'function' ? lobbyGetPassword() : '';
    const kickMs = typeof lobbyGetAutoKickMs === 'function' ? lobbyGetAutoKickMs() : 60000;
    html += `<div class="lsection" style="margin-top:14px;">HOST CONTROLS</div>
    <div class="ladmin-row">
      <button class="loutline ${locked ? 'danger' : ''}" id="lBtnLock" style="white-space:nowrap;">
        ${locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}
      </button>
      <input id="lRoomPwInput" type="text" maxlength="20" placeholder="Room password (optional)"
        value="${_escHtml(curPw)}"
        class="linput-field" style="flex:1;border-color:#c4a860;" />
      <button class="loutline" id="lBtnSetPw" style="white-space:nowrap;font-size:9px;">SET PW</button>
    </div>
    <div class="ladmin-row">
      <span style="font-size:9px;letter-spacing:1px;color:#5a4020;flex-shrink:0;">Auto-kick idle:</span>
      <button class="lmode-btn ${kickMs===0?'sel':''}" data-kick="0" style="padding:5px 8px;font-size:9px;">OFF</button>
      <button class="lmode-btn ${kickMs===30000?'sel':''}" data-kick="30000" style="padding:5px 8px;font-size:9px;">30s</button>
      <button class="lmode-btn ${kickMs===60000?'sel':''}" data-kick="60000" style="padding:5px 8px;font-size:9px;">60s</button>
      <button class="lmode-btn ${kickMs===120000?'sel':''}" data-kick="120000" style="padding:5px 8px;font-size:9px;">2m</button>
    </div>`;
  }

  if (!isHost) {
    html += `<div class="lhost-note" style="margin-top:14px;">⚑ Only the host can change game mode and settings.</div>`;
  }

  container.innerHTML = html;

  // ── Copy code / copy link (top block) ──
  const copyCodeBtn = container.querySelector('#lBtnCopyCode');
  if (copyCodeBtn) copyCodeBtn.addEventListener('click', () => _copyText(code, copyCodeBtn));
  const copyInviteTopBtn = container.querySelector('#lBtnCopyInviteTop');
  if (copyInviteTopBtn && code) {
    copyInviteTopBtn.addEventListener('click', () => _copyText(_buildRoomUrl(code), copyInviteTopBtn));
  }

  // Mode buttons
  container.querySelectorAll('.lmode-btn[data-mode]').forEach(btn => {
    if (!isHost) { btn.disabled = true; return; }
    btn.addEventListener('click', () => {
      if (typeof lobbySetMode === 'function') lobbySetMode(btn.dataset.mode);
    });
  });

  // Auto-kick buttons
  container.querySelectorAll('.lmode-btn[data-kick]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof lobbySetAutoKick === 'function') lobbySetAutoKick(parseInt(btn.dataset.kick));
      _renderRoomTab(container);
    });
  });

  // Admin: kick / transfer
  container.querySelectorAll('.ladmin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const slot = parseInt(btn.dataset.slot);
      if (btn.dataset.action === 'kick'     && typeof lobbyKick         === 'function') lobbyKick(slot);
      if (btn.dataset.action === 'transfer' && typeof lobbyTransferHost === 'function') lobbyTransferHost(slot);
    });
  });

  // Lock toggle
  const lockBtn = container.querySelector('#lBtnLock');
  if (lockBtn) lockBtn.addEventListener('click', () => {
    if (typeof lobbySetLocked === 'function') lobbySetLocked(!lobbyIsLocked());
    _renderRoomTab(container);
  });

  const setPwBtn = container.querySelector('#lBtnSetPw');
  if (setPwBtn) setPwBtn.addEventListener('click', () => {
    const pw = container.querySelector('#lRoomPwInput')?.value || '';
    if (typeof lobbySetPassword === 'function') lobbySetPassword(pw);
    if (typeof toast === 'function') toast(pw ? '🔑 Password set' : '🔓 Password cleared');
  });
  const pwInp = container.querySelector('#lRoomPwInput');
  if (pwInp) pwInp.addEventListener('keydown', e => e.stopPropagation());

  // Gem hunt duration
  const ghSlider = container.querySelector('#lGemHuntDur');
  if (ghSlider) {
    ghSlider.addEventListener('input', () => {
      const v = parseInt(ghSlider.value);
      const valEl = container.querySelector('#lGemHuntDurVal');
      if (valEl) valEl.textContent = v + 's';
      if (typeof lobbySetGemHuntDuration === 'function') lobbySetGemHuntDuration(v);
    });
  }
}

// ─── Chat tab ─────────────────────────────────────────────────────────────────
function _renderChatTab(container) {
  const history = typeof lobbyGetChatHistory === 'function' ? lobbyGetChatHistory() : [];
  const PAL     = typeof LOBBY_PALETTES !== 'undefined' ? LOBBY_PALETTES : [];

  const historyHtml = history.map(m => {
    const col = PAL[m.slot]?.base || '#7ff2e2';
    return `<div><span style="font-weight:bold;color:${col};">${_escHtml(m.name)}</span>: ${_escHtml(m.text)}</div>`;
  }).join('');

  container.innerHTML = `
    <div class="lchat-history" id="lChatHistory">
      ${historyHtml || '<span style="color:#5a7040;font-size:9px;">No messages yet…</span>'}
    </div>
    <input class="lchat-input" id="lChatInput" type="text" maxlength="120"
      placeholder="Type a message and press Enter…" autocomplete="off" />
    <div style="font-size:9px;letter-spacing:1px;color:#8a7040;margin-top:4px;">
      Messages also appear as toasts during play.
    </div>
  `;

  const hist = container.querySelector('#lChatHistory');
  if (hist) hist.scrollTop = hist.scrollHeight;

  const input = container.querySelector('#lChatInput');
  if (input) {
    // FIX v19: stopPropagation on all keydown events so game engine doesn't
    // receive them. This is the root cause of keys firing in-game while chatting.
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text && typeof lobbySendChat === 'function') {
          lobbySendChat(text);
          input.value = '';
          // Append to live history instead of full re-render
          _appendChatMessage(hist, { name: _myName(), text, slot: typeof lobbyGetMySlot === 'function' ? lobbyGetMySlot() : 0 });
        }
      }
    });

    // FIX v19: only auto-focus when user explicitly clicked the chat tab, not
    // on every state-change re-render (which stole focus from the game canvas).
    if (_chatAutoFocus) {
      input.focus();
      _chatAutoFocus = false; // consume the flag — only focus once per tab open
    }
  }
}

function _myName() {
  try {
    const raw = localStorage.getItem('blipgrove_profile_v1');
    if (raw) { const p = JSON.parse(raw); if (p.name) return p.name; }
  } catch(e) {}
  return 'Player';
}

function _appendChatMessage(histEl, entry) {
  if (!histEl) return;
  const PAL = typeof LOBBY_PALETTES !== 'undefined' ? LOBBY_PALETTES : [];
  const col  = PAL[entry.slot]?.base || '#7ff2e2';
  const div  = document.createElement('div');
  div.innerHTML = `<span style="font-weight:bold;color:${col};">${_escHtml(entry.name)}</span>: ${_escHtml(entry.text)}`;
  histEl.appendChild(div);
  histEl.scrollTop = histEl.scrollHeight;
}

// ─── Levels tab ───────────────────────────────────────────────────────────────
function _renderLevelsTab(container) {
  const isHost = typeof lobbyIsHost === 'function' && lobbyIsHost();
  const mode   = typeof lobbyGetMode === 'function' ? lobbyGetMode() : 'coop';

  let html = '';
  if (!isHost) html += `<div class="lhost-note">⚑ Host picks the level — ready up when you're set.</div>`;

  if (mode === 'coop') {
    const coopLevels = typeof LEVELS !== 'undefined' ? LEVELS.filter(l => l._coop) : [];
    const coopStart  = typeof LEVELS !== 'undefined' ? LEVELS.findIndex(l => l._coop) : -1;

    if (coopLevels.length > 0) {
      html += `<div class="lsection">CO-OP LEVELS</div>`;
      coopLevels.forEach((lvl, ci) => {
        const idx = coopStart + ci;
        const sel = _lobbyPickedLvl === idx;
        html += `<div class="llvl-card ${sel ? 'sel' : ''} ${!isHost ? 'disabled' : ''}" data-idx="${idx}">
          <div class="llvl-num">${ci + 1}</div>
          <div>
            <div class="llvl-name">${lvl.name}</div>
            <div class="llvl-desc">${lvl.coopDesc || ''}</div>
          </div>
        </div>`;
      });
    }
    html += `<div class="lsection" style="margin-top:14px;">ALL LEVELS</div>`;
  } else {
    html += `<div class="lsection">PICK A LEVEL</div>`;
  }

  if (typeof LEVELS !== 'undefined') {
    LEVELS.filter(l => !l._coop).forEach((lvl, i) => {
      const sel = _lobbyPickedLvl === i;
      html += `<div class="llvl-card ${sel ? 'sel' : ''} ${!isHost ? 'disabled' : ''}" data-idx="${i}">
        <div class="llvl-num" style="font-size:13px;">${i + 1}</div>
        <div>
          <div class="llvl-name">${lvl.name}</div>
          <div class="llvl-desc">${lvl.biome ? lvl.biome.toUpperCase() + ' BIOME' : ''}</div>
        </div>
      </div>`;
    });
  }

  container.innerHTML = html;

  if (isHost) {
    container.querySelectorAll('.llvl-card').forEach(card => {
      card.addEventListener('click', () => {
        _lobbyPickedLvl = parseInt(card.dataset.idx);
        _renderLevelsTab(container);
      });
    });
  }
}

// ─── Footer actions ───────────────────────────────────────────────────────────
function lobbyUIGo() {
  // FIX v19: guard against disabled state (button can be clicked programmatically)
  if (typeof lobbyIsHost !== 'function' || !lobbyIsHost()) return;
  if (typeof lobbyAllReady !== 'function' || !lobbyAllReady()) return;
  if (typeof lobbyStartGame === 'function') lobbyStartGame(_lobbyPickedLvl);
}

function lobbyUIReady() {
  if (typeof lobbyToggleReady === 'function') lobbyToggleReady();
}

function lobbyUIDisconnect() {
  if (typeof lobbyDisconnect === 'function') lobbyDisconnect();
  _renderLobbyUI();
}

// ─── Chat notification ────────────────────────────────────────────────────────
// FIX v19: no longer re-renders entire tab on every message — only appends
// to the live history element if the chat tab is currently shown.
function _onChatReceived(entry) {
  if (_lobbyUIEl && _lobbyUIEl.style.display !== 'none' && _lobbyUITab === 'chat') {
    const hist = _lobbyUIEl.querySelector('#lChatHistory');
    _appendChatMessage(hist, entry);
  } else {
    const badge = _lobbyUIEl?.querySelector('#lobbyUnreadBadge');
    if (badge) badge.style.display = '';
  }
}

// ─── Spectator overlay ────────────────────────────────────────────────────────
function ensureSpectatorOverlay() {
  if (document.getElementById('spectatorOverlay')) return;
  const el = document.createElement('div');
  el.id = 'spectatorOverlay';
  el.style.cssText = [
    'display:none;position:absolute;',
    'top:8px;left:50%;transform:translateX(-50%);',
    'background:rgba(11,16,32,.82);color:#fff4d6;',
    'font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;',
    'font-size:10px;letter-spacing:2px;padding:6px 14px;',
    'flex-direction:column;align-items:center;gap:4px;',
    'pointer-events:none;z-index:15;',
  ].join('');
  el.innerHTML = `
    <div style="font-weight:bold;">👁 SPECTATING</div>
    <div id="spectatorRaceResults" style="font-size:9px;letter-spacing:1px;"></div>
  `;
  const stage = document.getElementById('stage');
  if (stage) stage.appendChild(el);
}

// ─── Race results helper (called from ui.js) ──────────────────────────────────
function renderRaceResultsInBanner() {
  const results = typeof lobbyGetRaceResults === 'function' ? lobbyGetRaceResults() : [];
  if (!results.length) return '';
  const PAL = typeof LOBBY_PALETTES !== 'undefined' ? LOBBY_PALETTES : [];
  let h = `<div style="font-size:10px;letter-spacing:1px;color:#5a7040;margin-top:10px;margin-bottom:4px;">🏁 RACE RESULTS</div>`;
  results.forEach((r, i) => {
    const col = PAL[r.slot]?.base || '#fff4d6';
    h += `<div style="font-size:12px;letter-spacing:1px;color:${col};">
      ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
      ${_escHtml(r.name)} — ${r.time}s
    </div>`;
  });
  return h;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _buildRoomUrl(code) {
  const u = new URL(window.location.href);
  u.searchParams.delete('join');
  u.searchParams.delete('answer');
  u.searchParams.delete('play');
  u.searchParams.set('room', code);
  return u.toString();
}

function _copyText(text, btn) {
  const orig = btn.textContent;
  navigator.clipboard.writeText(text)
    .then(() => { btn.textContent = '✓ COPIED!'; setTimeout(() => { btn.textContent = orig; }, 2000); })
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      btn.textContent = '✓ COPIED!'; setTimeout(() => { btn.textContent = orig; }, 2000);
    });
}

function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init spectator overlay on load ──────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureSpectatorOverlay);
} else {
  ensureSpectatorOverlay();
}
