/* Blip's Grove — netcode.js  (M6 / v19 refactor)
 *
 * Architecture:
 *   HOST  — runs the full game simulation. Receives remote guest inputs each
 *           frame, injects them as P2. Sends authoritative state snapshots ~20/s.
 *
 *   GUEST — renders from host snapshots (interpolated). Captures local
 *           keyboard/gamepad for P1 role, sends to host.
 *
 * Signaling — two methods, user picks whichever is easier:
 *
 *   METHOD A — Share Link (recommended, default)
 *     Host clicks HOST → offer compressed → ?join= URL copied to clipboard.
 *     Guest opens URL → game auto-detects → builds ?answer= URL → copies.
 *     Host pastes answer URL → clicks CONNECT. Two URL shares, zero raw SDP.
 *
 *   METHOD B — Manual code (fallback / LAN)
 *     Classic copy-paste of compressed base64 codes.
 *
 * Transport: RTCPeerConnection + two RTCDataChannels
 *   _reliable — ordered, reliable   (lobby / level-change messages)
 *   _fast     — unordered, 0-retransmit (game input & state snapshots)
 *
 * ICE: Google STUN + openrelay.metered.ca free TURN for symmetric NAT.
 * 15-second ICE timeout with actionable error + retry button.
 *
 * Public API (unchanged — engine.js / ui.js call these):
 *   netIsActive()           → bool
 *   netIsHost()             → bool
 *   netIsGuest()            → bool
 *   netRemoteInput()        → input object | null
 *   netSendHostState(snap)  → void
 *   netGetLatestSnap()      → snapshot | null
 *   netSendGuestInput(inp)  → void
 *   openNetLobby()          → void
 *   closeNetLobby()         → void
 *   netDisconnect()         → void
 *   netOnConnected(cb)      → void
 *   netOnDisconnected(cb)   → void
 *   netSendLevelChange(idx) → void
 *   netBuildSnap()          → snapshot | null
 *   netApplySnap(snap)      → void
 *   netCheckAutoJoin()      → call once on page load to handle ?join= URLs
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let _pc        = null;
let _reliable  = null;
let _fast      = null;
let _role      = null;       // 'host' | 'guest' | null
let _connected = false;

let _remoteInputBuf = null;
let _latestSnap     = null;
let _connectedCb    = null;
let _disconnectedCb = null;

let _localInputSeq  = 0;
let _lastRemoteSeq  = -1;
let _snapSeq        = 0;

let _iceTimer       = null;  // 15-second ICE timeout handle

// ─── Public predicates ────────────────────────────────────────────────────────
function netIsActive()         { return _connected && _role !== null; }
function netIsHost()           { return _connected && _role === 'host'; }
function netIsGuest()          { return _connected && _role === 'guest'; }
function netOnConnected(cb)    { _connectedCb    = cb; }
function netOnDisconnected(cb) { _disconnectedCb = cb; }

// ─── Remote input / snapshot access ──────────────────────────────────────────
function netRemoteInput() {
  if (!netIsHost() || !_remoteInputBuf) return null;
  return _remoteInputBuf;
}

function netGetLatestSnap() {
  const s = _latestSnap;
  _latestSnap = null;
  return s;
}

// ─── Host: broadcast state snapshot ──────────────────────────────────────────
function netSendHostState(snap) {
  if (!netIsHost() || !_fast || _fast.readyState !== 'open') return;
  try { _fast.send(JSON.stringify({ type: 'snap', seq: _snapSeq++, snap })); } catch(e) {}
}

// ─── Guest: send input to host ────────────────────────────────────────────────
function netSendGuestInput(inp) {
  if (!netIsGuest() || !_fast || _fast.readyState !== 'open') return;
  const msg = {
    type: 'inp', seq: _localInputSeq++,
    inp: {
      left:        inp.left        ? 1 : 0,
      right:       inp.right       ? 1 : 0,
      down:        inp.down        ? 1 : 0,
      jump:        inp.jump        ? 1 : 0,
      jumpPressed: inp.jumpPressed ? 1 : 0,
      dash:        inp.dash        ? 1 : 0,
      dashPressed: inp.dashPressed ? 1 : 0,
    }
  };
  try { _fast.send(JSON.stringify(msg)); } catch(e) {}
}

// ─── Host: notify guest of level change ───────────────────────────────────────
function netSendLevelChange(idx) {
  if (!netIsHost() || !_reliable || _reliable.readyState !== 'open') return;
  try { _reliable.send(JSON.stringify({ type: 'level', idx })); } catch(e) {}
}

// ─── Expose _reliable / _fast for coop.js helpers ────────────────────────────
// coop.js uses netSendReliable() and netFastChannel() which read these directly.
// They are module-level vars in the same global scope — no extra exposure needed.

// ─── SDP compression helpers ──────────────────────────────────────────────────
async function _compress(str) {
  if (typeof CompressionStream === 'undefined') {
    // Plain base64url fallback
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  const cs  = new CompressionStream('deflate-raw');
  const w   = cs.writable.getWriter();
  w.write(new TextEncoder().encode(str));
  w.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return btoa(String.fromCharCode(...merged))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _decompress(code) {
  const b64    = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  if (typeof DecompressionStream === 'undefined') return binary;
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate-raw');
  const w  = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new TextDecoder().decode(merged);
}

function _buildShareUrl(paramName, code) {
  const u = new URL(window.location.href);
  u.searchParams.delete('join');
  u.searchParams.delete('answer');
  u.searchParams.set(paramName, code);
  return u.toString();
}

function _extractCode(urlOrCode, param) {
  try {
    const u = new URL(urlOrCode);
    return u.searchParams.get(param) || null;
  } catch(e) { return null; }
}

// ─── Auto-join on page load (?join= URL) ─────────────────────────────────────
function netCheckAutoJoin() {
  const params   = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (!joinCode) return;
  // Clean URL so a refresh doesn't re-trigger
  const clean = new URL(window.location.href);
  clean.searchParams.delete('join');
  window.history.replaceState({}, '', clean.toString());
  // Small delay so game DOM is ready
  setTimeout(() => {
    openNetLobby();
    _lobbyAutoGuest(joinCode);
  }, 400);
}
// ─── RTC config ───────────────────────────────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ]
};

let _gatherResolve = null;

function _createPeer() {
  if (_pc) { try { _pc.close(); } catch(e) {} }
  _pc = new RTCPeerConnection(RTC_CONFIG);

  _pc.oniceconnectionstatechange = () => {
    const s = _pc.iceConnectionState;
    _lobbySetIceState(s);
    if (s === 'connected' || s === 'completed') _clearIceTimer();
    if (s === 'disconnected' || s === 'failed' || s === 'closed') {
      _clearIceTimer();
      _handleDisconnect();
    }
  };

  _pc.onicegatheringstatechange = () => {
    if (_pc.iceGatheringState === 'complete' && _gatherResolve) {
      _gatherResolve();
      _gatherResolve = null;
    }
  };

  return _pc;
}

function _startIceTimer() {
  _clearIceTimer();
  _iceTimer = setTimeout(() => {
    if (!_connected) {
      _lobbySetStatus(
        '⚠ Connection timed out. Check your network or try Manual mode.\n' +
        'Tip: if you\'re on mobile data or a corporate network, the TURN relay should help — wait a few more seconds.',
        'error'
      );
      _lobbyShowRetry();
      netDisconnect();
    }
  }, 15000);
}

function _clearIceTimer() {
  if (_iceTimer) { clearTimeout(_iceTimer); _iceTimer = null; }
}

function _setupChannelHandlers(chan, isFast) {
  chan.onopen = () => {
    if (!isFast) return;
    _connected = true;
    _clearIceTimer();
    _lobbyShowConnected();
    if (_connectedCb) _connectedCb(_role);
  };
  chan.onclose  = () => { if (isFast) _handleDisconnect(); };
  chan.onerror  = (e) => { console.warn('[netcode] channel error', e); };
  chan.onmessage = (e) => {
    try { _handleMessage(JSON.parse(e.data)); } catch(err) {}
  };
}

function _handleMessage(msg) {
  if (!msg?.type) return;
  switch (msg.type) {
    case 'inp':
      if (msg.seq <= _lastRemoteSeq) return;
      _lastRemoteSeq = msg.seq;
      _remoteInputBuf = {
        left:        !!msg.inp.left,
        right:       !!msg.inp.right,
        down:        !!msg.inp.down,
        jump:        !!msg.inp.jump,
        jumpPressed: !!msg.inp.jumpPressed,
        dash:        !!msg.inp.dash,
        dashPressed: !!msg.inp.dashPressed,
      };
      break;
    case 'snap':
      _latestSnap = msg.snap;
      break;
    case 'chat':
      if (typeof toast === 'function') toast(msg.text);
      break;
    case 'level':
      if (typeof startLevel === 'function') {
        numPlayers = 2;
        startLevel(msg.idx);
      }
      break;
    case 'coopLevelPick':
      if (typeof _lobbyLevelIdx !== 'undefined') _lobbyLevelIdx = msg.idx;
      if (typeof _renderLobbyContent === 'function') _renderLobbyContent();
      break;
    default:
      if (typeof coopHandleMessage === 'function') coopHandleMessage(msg);
      break;
  }
}

function _handleDisconnect() {
  if (!_connected && !_pc) return;
  _connected      = false;
  _remoteInputBuf = null;
  _latestSnap     = null;
  _localInputSeq  = 0;
  _lastRemoteSeq  = -1;
  _clearIceTimer();
  try { if (_pc) _pc.close(); } catch(e) {}
  _pc = null; _reliable = null; _fast = null;
  _lobbySetStatus('Disconnected from session.', 'warn');
  if (_disconnectedCb) _disconnectedCb();
}

function netDisconnect() {
  _role = null;
  _handleDisconnect();
}

// ─── HOST FLOW ────────────────────────────────────────────────────────────────
let _hostOfferCode = null;

async function _hostCreateOffer() {
  _role = 'host';
  const pc = _createPeer();
  _reliable = pc.createDataChannel('reliable', { ordered: true });
  _fast     = pc.createDataChannel('fast',     { ordered: false, maxRetransmits: 0 });
  _setupChannelHandlers(_reliable, false);
  _setupChannelHandlers(_fast,     true);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (pc.iceGatheringState !== 'complete') {
    await new Promise(r => { _gatherResolve = r; });
  }
  return pc.localDescription.sdp;
}

async function _hostReceiveAnswer(answerCode) {
  if (!_pc || _role !== 'host') throw new Error('Not in host role');
  const sdp = await _decompress(answerCode);
  await _pc.setRemoteDescription({ type: 'answer', sdp });
  _startIceTimer();
}

// ─── GUEST FLOW ───────────────────────────────────────────────────────────────
async function _guestReceiveOffer(offerCode) {
  _role = 'guest';
  const pc = _createPeer();
  pc.ondatachannel = (e) => {
    const chan = e.channel;
    if (chan.label === 'reliable') { _reliable = chan; _setupChannelHandlers(chan, false); }
    if (chan.label === 'fast')     { _fast     = chan; _setupChannelHandlers(chan, true);  }
  };
  const offerSdp = await _decompress(offerCode);
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  if (pc.iceGatheringState !== 'complete') {
    await new Promise(r => { _gatherResolve = r; });
  }
  _startIceTimer();
  return pc.localDescription.sdp;
}

// ─── LOBBY UI ─────────────────────────────────────────────────────────────────
// Refactored v19: single wizard card, no nested tab-switch functions on window.
// Steps:
//   Host: Step 1 shows invite link → Step 2 shows answer paste field (inline)
//   Guest: Single text area for invite link/code → generates answer link inline
//   Auto-guest: auto-detected from ?join=, answer link shown immediately

let _lobbyEl    = null;
let _lobbyMode  = null; // 'host' | 'guest' | null

function openNetLobby() {
  if (_lobbyEl) { _lobbyEl.style.display = 'flex'; return; }
  _buildLobbyEl();
}

function closeNetLobby() {
  if (_lobbyEl) _lobbyEl.style.display = 'none';
}

function _buildLobbyEl() {
  const el = document.createElement('div');
  el.id = 'netLobby';
  el.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(11,16,32,.82);';

  el.innerHTML = `
    <div id="netCard" style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:8px 8px 0 #0b1020;
      padding:24px 28px;width:92%;max-width:420px;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      position:relative;
    ">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px;">
        <span style="font-size:16px;font-weight:bold;letter-spacing:3px;">🌐 ONLINE CO-OP</span>
        <span id="netManualToggle"
          style="font-size:9px;letter-spacing:1px;color:#8a7040;cursor:pointer;text-decoration:underline;margin-left:auto;"
          onclick="_netToggleManual()">Manual codes ↓</span>
      </div>
      <div style="font-size:10px;color:#7a6030;letter-spacing:1px;margin-bottom:18px;">
        Play together across the internet — no account needed
      </div>

      <!-- Role picker (shown initially) -->
      <div id="netRolePicker" style="display:flex;gap:8px;margin-bottom:18px;">
        <button id="netBtnHost" class="net-big-btn" style="flex:1;" onclick="_netPickRole('host')">
          <div style="font-size:20px;margin-bottom:4px;">⚑</div>
          <div style="font-size:12px;letter-spacing:2px;font-weight:bold;">HOST</div>
          <div style="font-size:9px;color:#b09060;margin-top:3px;letter-spacing:1px;">Start a new session</div>
        </button>
        <button id="netBtnJoin" class="net-big-btn" style="flex:1;" onclick="_netPickRole('guest')">
          <div style="font-size:20px;margin-bottom:4px;">→</div>
          <div style="font-size:12px;letter-spacing:2px;font-weight:bold;">JOIN</div>
          <div style="font-size:9px;color:#b09060;margin-top:3px;letter-spacing:1px;">Join a friend's session</div>
        </button>
      </div>

      <!-- Wizard flow area -->
      <div id="netWizard"></div>

      <!-- ICE progress bar -->
      <div id="netIceWrap" style="display:none;margin-top:12px;">
        <div style="font-size:9px;letter-spacing:1px;color:#7a6030;margin-bottom:4px;">CONNECTING…</div>
        <div style="background:#d4c090;height:6px;border-radius:3px;overflow:hidden;">
          <div id="netIceBar" style="height:100%;width:0%;background:#0b8c6c;transition:width .4s ease;border-radius:3px;"></div>
        </div>
        <div id="netIceLabel" style="font-size:9px;letter-spacing:1px;color:#7a6030;margin-top:3px;"></div>
      </div>

      <!-- Status line -->
      <div id="netStatus" style="min-height:16px;margin-top:8px;font-size:10px;letter-spacing:1px;"></div>

      <!-- Footer -->
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:14px;">
        <button id="netBtnDisconnect" onclick="netDisconnect();_netReset();" style="display:none;" class="net-btn net-btn-red">DISCONNECT</button>
        <button onclick="closeNetLobby();" class="net-btn net-btn-outline">CLOSE</button>
      </div>
    </div>

    <style>
      .net-big-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        background:#0b1020;color:#fff4d6;border:0;padding:14px 10px;
        cursor:pointer;box-shadow:4px 4px 0 #3a3020;text-align:center;
        transition:transform .08s,box-shadow .08s;
      }
      .net-big-btn:hover { transform:translate(-2px,-2px);box-shadow:6px 6px 0 #3a3020; }
      .net-big-btn:active{ transform:translate(1px,1px);box-shadow:2px 2px 0 #3a3020; }
      .net-btn {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;letter-spacing:1px;border:0;padding:7px 14px;cursor:pointer;
        box-shadow:3px 3px 0 #3a3020;transition:transform .08s,box-shadow .08s;
      }
      .net-btn:hover  { transform:translate(-1px,-1px);box-shadow:4px 4px 0 #3a3020; }
      .net-btn:active { transform:translate(1px,1px);box-shadow:1px 1px 0 #3a3020; }
      .net-btn-outline{ background:#fff4d6;color:#0b1020;border:2px solid #0b1020; }
      .net-btn-outline:hover{ background:#ffe8a0; }
      .net-btn-red    { background:#a83a3a;color:#fff; }
      .net-btn-red:hover{ background:#c44444; }
      .net-btn-primary{ background:#0b1020;color:#fff4d6; }
      .net-btn-primary:hover{ background:#1a2840; }
      .net-ta {
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
        font-size:10px;width:100%;resize:none;box-sizing:border-box;
        padding:8px;border:2px solid #0b1020;letter-spacing:0;line-height:1.4;
      }
      .net-ta-dark  { background:#0b1020;color:#7ff2e2; }
      .net-ta-light { background:#fff;color:#0b1020; }
      .net-label { font-size:10px;letter-spacing:1px;color:#5a4020;margin-bottom:5px;display:block; }
      .net-step  { margin-bottom:14px; }
      .net-url-box {
        display:flex;align-items:center;gap:6px;
        background:#0b1020;padding:8px 10px;border:2px solid #0b1020;
      }
      .net-url-text {
        flex:1;font-size:9px;color:#7ff2e2;letter-spacing:0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      }
      .net-tip {
        font-size:9px;color:#8a7040;letter-spacing:1px;
        margin-top:6px;line-height:1.5;
      }
      .net-success {
        background:#d4f5e9;border:2px solid #0b8c6c;
        padding:12px 14px;font-size:11px;line-height:1.7;letter-spacing:1px;
      }
      .net-divider {
        border:0;border-top:1px dashed #c4a860;margin:14px 0;
      }
    </style>
  `;

  const stage = document.getElementById('stage');
  stage.appendChild(el);
  _lobbyEl = el;
}

// ─── Role picker ──────────────────────────────────────────────────────────────
window._netPickRole = function(role) {
  _lobbyMode = role;
  _lobbyEl.querySelector('#netRolePicker').style.display = 'none';
  const wizard = _lobbyEl.querySelector('#netWizard');
  if (role === 'host') _renderHostWizard(wizard, false);
  else                 _renderGuestWizard(wizard, false);
};

window._netToggleManual = function() {
  if (!_lobbyMode) return; // nothing selected yet
  const wizard = _lobbyEl.querySelector('#netWizard');
  const isManual = wizard.dataset.mode === 'manual';
  if (_lobbyMode === 'host') _renderHostWizard(wizard, !isManual);
  else                       _renderGuestWizard(wizard, !isManual);
};

function _netReset() {
  if (!_lobbyEl) return;
  _lobbyMode = null;
  _hostOfferCode = null;
  _lobbyEl.querySelector('#netRolePicker').style.display = 'flex';
  _lobbyEl.querySelector('#netWizard').innerHTML = '';
  _lobbyEl.querySelector('#netWizard').dataset.mode = '';
  _lobbyEl.querySelector('#netBtnDisconnect').style.display = 'none';
  _lobbyEl.querySelector('#netIceWrap').style.display = 'none';
  _lobbySetStatus('');
  const toggle = _lobbyEl.querySelector('#netManualToggle');
  if (toggle) toggle.textContent = 'Manual codes ↓';
}

// ─── HOST WIZARD ──────────────────────────────────────────────────────────────
// Renders inline — Step 1 (invite link) then Step 2 (answer paste) appear
// in the same container without any tab switching.
async function _renderHostWizard(container, manual) {
  container.dataset.mode = manual ? 'manual' : 'link';
  const toggle = _lobbyEl.querySelector('#netManualToggle');
  if (toggle) toggle.textContent = manual ? 'Share link ↑' : 'Manual codes ↓';

  container.innerHTML = `<div style="font-size:10px;color:#7a6030;letter-spacing:1px;">⏳ Generating ${manual ? 'offer code' : 'invite link'}…</div>`;
  _lobbySetStatus('Creating session…');

  // Create offer (reuse if already made)
  if (!_hostOfferCode) {
    let offerSdp;
    try {
      offerSdp = await _hostCreateOffer();
    } catch(e) {
      container.innerHTML = `<div style="color:#a83a3a;font-size:10px;">✗ Failed to create session: ${e.message}</div>`;
      _lobbySetStatus('WebRTC unsupported?', 'error');
      return;
    }
    _hostOfferCode = await _compress(offerSdp);
  }

  _lobbySetStatus('');

  if (manual) {
    container.innerHTML = `
      <div class="net-step">
        <span class="net-label">STEP 1 — Copy this offer code, send it to your friend:</span>
        <textarea class="net-ta net-ta-dark" rows="4" readonly>${_hostOfferCode}</textarea>
        <button class="net-btn net-btn-primary" id="netBtnCopyOffer" style="margin-top:5px;">⎘ COPY CODE</button>
      </div>
      <hr class="net-divider">
      <div class="net-step">
        <span class="net-label">STEP 2 — Paste your friend's answer code:</span>
        <textarea id="netAnswerInput" class="net-ta net-ta-light" rows="4"
          placeholder="Paste answer code here…"></textarea>
        <button class="net-btn net-btn-primary" id="netBtnConnect" style="margin-top:6px;">▶ CONNECT</button>
      </div>
    `;
    container.querySelector('#netBtnCopyOffer').onclick = () => {
      _copyToClipboard(_hostOfferCode, container.querySelector('#netBtnCopyOffer'));
    };
  } else {
    const inviteUrl = _buildShareUrl('join', _hostOfferCode);
    container.innerHTML = `
      <div class="net-step">
        <span class="net-label">STEP 1 — Send this link to your friend:</span>
        <div class="net-url-box">
          <span class="net-url-text">${inviteUrl}</span>
          <button class="net-btn net-btn-primary" id="netBtnCopyInvite" style="font-size:9px;padding:5px 9px;white-space:nowrap;">⎘ COPY</button>
        </div>
        <div class="net-tip">They open it — the game processes it automatically and gives them a link to send back.</div>
      </div>
      <hr class="net-divider">
      <div class="net-step">
        <span class="net-label">STEP 2 — Paste your friend's answer link (or code):</span>
        <textarea id="netAnswerInput" class="net-ta net-ta-light" rows="2"
          placeholder="Paste their https://…?answer=… link (or just the code)…"></textarea>
        <button class="net-btn net-btn-primary" id="netBtnConnect" style="margin-top:6px;">▶ CONNECT</button>
      </div>
    `;
    container.querySelector('#netBtnCopyInvite').onclick = () => {
      _copyToClipboard(inviteUrl, container.querySelector('#netBtnCopyInvite'));
    };
  }

  container.querySelector('#netBtnConnect').onclick = async () => {
    const raw  = container.querySelector('#netAnswerInput').value.trim();
    if (!raw) { _lobbySetStatus('⚠ Paste the answer first.', 'warn'); return; }
    const code = _extractCode(raw, 'answer') || raw;
    _lobbySetStatus('Connecting…');
    try {
      await _hostReceiveAnswer(code);
    } catch(e) {
      _lobbySetStatus('✗ Bad answer: ' + e.message, 'error');
    }
  };
}

// ─── GUEST WIZARD ─────────────────────────────────────────────────────────────
function _renderGuestWizard(container, manual) {
  container.dataset.mode = manual ? 'manual' : 'link';
  const toggle = _lobbyEl.querySelector('#netManualToggle');
  if (toggle) toggle.textContent = manual ? 'Share link ↑' : 'Manual codes ↓';

  if (manual) {
    container.innerHTML = `
      <div class="net-step">
        <span class="net-label">Paste the host's offer code:</span>
        <textarea id="netGuestInput" class="net-ta net-ta-light" rows="4"
          placeholder="Paste offer code here…"></textarea>
        <button class="net-btn net-btn-primary" id="netBtnGuestGo" style="margin-top:6px;">▶ GENERATE ANSWER</button>
      </div>
      <div id="netGuestAnswer"></div>
    `;
  } else {
    container.innerHTML = `
      <div class="net-step">
        <span class="net-label">Paste the host's invite link:</span>
        <textarea id="netGuestInput" class="net-ta net-ta-light" rows="2"
          placeholder="Paste https://…?join=… link here…"></textarea>
        <button class="net-btn net-btn-primary" id="netBtnGuestGo" style="margin-top:6px;">▶ GENERATE ANSWER</button>
      </div>
      <div id="netGuestAnswer"></div>
    `;
  }

  container.querySelector('#netBtnGuestGo').onclick = async () => {
    const raw  = container.querySelector('#netGuestInput').value.trim();
    if (!raw) { _lobbySetStatus('⚠ Paste the invite first.', 'warn'); return; }
    const code = (manual ? raw : (_extractCode(raw, 'join') || raw));
    await _processGuestOffer(code, container.querySelector('#netGuestAnswer'), !manual);
  };
}

// ─── GUEST: process offer and render answer ────────────────────────────────────
async function _processGuestOffer(offerCode, answerContainer, useLink) {
  _lobbySetStatus('Processing offer…');
  let answerSdp;
  try {
    answerSdp = await _guestReceiveOffer(offerCode);
  } catch(e) {
    _lobbySetStatus('✗ Bad offer: ' + e.message, 'error');
    return;
  }

  const answerCode = await _compress(answerSdp);

  if (useLink) {
    const answerUrl = _buildShareUrl('answer', answerCode);
    answerContainer.innerHTML = `
      <hr class="net-divider">
      <div class="net-step">
        <span class="net-label">Now send this answer link back to the host:</span>
        <div class="net-url-box">
          <span class="net-url-text">${answerUrl}</span>
          <button class="net-btn net-btn-primary" id="netBtnCopyAnswer" style="font-size:9px;padding:5px 9px;white-space:nowrap;">⎘ COPY</button>
        </div>
        <div class="net-tip">Once the host pastes this and clicks Connect, you'll both be in the game!</div>
      </div>
    `;
    answerContainer.querySelector('#netBtnCopyAnswer').onclick = () => {
      _copyToClipboard(answerUrl, answerContainer.querySelector('#netBtnCopyAnswer'));
    };
  } else {
    answerContainer.innerHTML = `
      <hr class="net-divider">
      <div class="net-step">
        <span class="net-label">Copy this answer code and send it to the host:</span>
        <textarea class="net-ta net-ta-dark" rows="4" readonly>${answerCode}</textarea>
        <button class="net-btn net-btn-primary" id="netBtnCopyAnswer" style="margin-top:5px;">⎘ COPY CODE</button>
      </div>
      <div class="net-tip" style="margin-top:-8px;">Waiting for host to connect…</div>
    `;
    answerContainer.querySelector('#netBtnCopyAnswer').onclick = () => {
      _copyToClipboard(answerCode, answerContainer.querySelector('#netBtnCopyAnswer'));
    };
  }

  _lobbySetStatus('Answer ready — waiting for host to connect…', 'ok');
}

// ─── Auto-guest flow (?join= URL detected on load) ────────────────────────────
async function _lobbyAutoGuest(joinCode) {
  if (!_lobbyEl) return;
  _lobbyMode = 'guest';

  // Hide role picker, show wizard with an in-progress message
  _lobbyEl.querySelector('#netRolePicker').style.display = 'none';
  const wizard = _lobbyEl.querySelector('#netWizard');
  wizard.dataset.mode = 'link';
  wizard.innerHTML = `
    <div style="font-size:11px;letter-spacing:1px;color:#5a4020;margin-bottom:12px;">
      <b>Invite link detected!</b><br>
      <span style="font-size:9px;color:#8a7040;">Processing the host's offer…</span>
    </div>
    <div id="netAutoAnswer"></div>
  `;

  const toggle = _lobbyEl.querySelector('#netManualToggle');
  if (toggle) toggle.style.display = 'none'; // hide during auto-flow

  await _processGuestOffer(joinCode, wizard.querySelector('#netAutoAnswer'), true);
}

// ─── ICE state display ────────────────────────────────────────────────────────
function _lobbySetIceState(state) {
  const wrap  = _lobbyEl?.querySelector('#netIceWrap');
  const bar   = _lobbyEl?.querySelector('#netIceBar');
  const label = _lobbyEl?.querySelector('#netIceLabel');
  if (!wrap) return;

  const stateMap = {
    'new':          [  5, 'Initialising…'],
    'checking':     [ 45, 'Finding best connection path…'],
    'connected':    [ 85, 'Almost there…'],
    'completed':    [100, 'Connected!'],
    'disconnected': [  0, 'Connection lost — trying to reconnect…'],
    'failed':       [  0, 'Connection failed — check firewall / network'],
    'closed':       [  0, 'Session closed'],
  };
  const [pct, text] = stateMap[state] || [0, state];
  wrap.style.display  = 'block';
  bar.style.width     = pct + '%';
  label.textContent   = text;

  if (state === 'completed' || state === 'connected') {
    bar.style.background = '#0b8c6c';
    bar.style.width = '100%';
    setTimeout(() => { if (wrap) wrap.style.display = 'none'; }, 1500);
  } else if (state === 'failed' || state === 'disconnected') {
    bar.style.background = '#a83a3a';
  } else {
    bar.style.background = '#0b8c6c';
  }
}

function _lobbySetStatus(msg, level) {
  const el = _lobbyEl?.querySelector('#netStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = level === 'error' ? '#a83a3a'
                 : level === 'warn'  ? '#c47a00'
                 : level === 'ok'    ? '#0b8c6c'
                 : '#7a6030';
}

function _lobbyShowRetry() {
  const wizard = _lobbyEl?.querySelector('#netWizard');
  if (!wizard) return;
  const btn = document.createElement('button');
  btn.className   = 'net-btn net-btn-outline';
  btn.textContent = '↺ TRY AGAIN';
  btn.style.marginTop = '10px';
  btn.onclick = () => { netDisconnect(); _netReset(); };
  wizard.appendChild(btn);
}

function _lobbyShowConnected() {
  const wizard = _lobbyEl?.querySelector('#netWizard');
  if (!wizard) return;
  _lobbyEl.querySelector('#netBtnDisconnect').style.display = '';
  wizard.innerHTML = `
    <div class="net-success">
      ✓ <b>CONNECTED!</b><br>
      Both players are online — opening co-op lobby…
    </div>
  `;
  _lobbySetStatus('');
  // Flash the ICE bar to 100% green before hiding
  const bar = _lobbyEl?.querySelector('#netIceBar');
  const wrap = _lobbyEl?.querySelector('#netIceWrap');
  if (bar)  { bar.style.background = '#0b8c6c'; bar.style.width = '100%'; }
  if (wrap) { wrap.style.display = 'block'; setTimeout(() => { wrap.style.display = 'none'; }, 1200); }
  setTimeout(() => {
    if (typeof _pushSettingsToGuest === 'function') _pushSettingsToGuest();
    closeNetLobby();
    if (typeof openCoopLobby === 'function') openCoopLobby();
    if (typeof _startLobbyPingLoop === 'function') _startLobbyPingLoop();
  }, 800);
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────
function _copyToClipboard(text, btn) {
  const orig = btn.textContent;
  navigator.clipboard.writeText(text)
    .then(() => { btn.textContent = '✓ COPIED!'; setTimeout(() => { btn.textContent = orig; }, 2000); })
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = '✓ COPIED!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
}

// ─── Snapshot builder (called by engine.js host) ──────────────────────────────
function netBuildSnap() {
  if (!netIsHost() || typeof players === 'undefined') return null;
  const ps = players.map(p => ({
    x: p.x|0, y: p.y|0, vx: +(p.vx.toFixed(2)), vy: +(p.vy.toFixed(2)),
    hp: p.hp, maxHp: p.maxHp, gems: p.gems,
    dir: p.dir, onGround: p.onGround?1:0, dead: p.dead?1:0,
    iFrames: p.iFrames|0, gliding: p.gliding?1:0,
    wallSlide: p.wallSlide?1:0, wallSide: p.wallSide,
    powerup: p.powerup, combo: combo,
  }));
  const en = enemies.map(e => ({
    kind: e.kind, x: e.x|0, y: e.y|0, alive: e.alive?1:0,
    squishT: e.squishT|0, dir: e.facing||e.dir||(e.vx<0?-1:1),
  }));
  const gm = gems.map(g => ({ x: g.x|0, y: g.y|0, alive: g.alive?1:0 }));
  return {
    tick, gameState, currentLevel, lives,
    players: ps, enemies: en, gems: gm,
    cam: { x: cam.x|0, y: cam.y|0, shake: cam.shake },
    bossHp:    boss ? boss.hp      : null,
    bossAlive: boss ? (boss.alive?1:0) : null,
    sharedGems: (typeof coopSettings !== 'undefined' && coopSettings.sharedGemPool)
                  ? (typeof coopSharedGems === 'function' ? coopSharedGems() : 0) : undefined,
  };
}

// ─── Apply snapshot on guest ──────────────────────────────────────────────────
function netApplySnap(snap) {
  if (!snap || !netIsGuest()) return;
  if (snap.cam) { cam.x = snap.cam.x; cam.y = snap.cam.y; cam.shake = snap.cam.shake; }
  if (snap.players && players) {
    for (let i = 0; i < snap.players.length && i < players.length; i++) {
      const sp = snap.players[i], lp = players[i];
      const lerp = 0.35;
      lp.x  = lp.x  + (sp.x  - lp.x)  * lerp;
      lp.y  = lp.y  + (sp.y  - lp.y)  * lerp;
      lp.vx = sp.vx; lp.vy = sp.vy;
      lp.hp = sp.hp; lp.maxHp = sp.maxHp; lp.gems = sp.gems;
      lp.dir = sp.dir; lp.onGround = !!sp.onGround; lp.dead = !!sp.dead;
      lp.iFrames = sp.iFrames; lp.gliding = !!sp.gliding;
      lp.wallSlide = !!sp.wallSlide; lp.wallSide = sp.wallSide;
      if (sp.powerup !== undefined) lp.powerup = sp.powerup;
    }
  }
  if (typeof combo !== 'undefined' && snap.players?.[0]) {
    combo = snap.players[0].combo || 0;
  }
  if (snap.enemies && enemies) {
    for (let i = 0; i < snap.enemies.length && i < enemies.length; i++) {
      if (!snap.enemies[i].alive && enemies[i].alive) {
        enemies[i].alive   = false;
        enemies[i].squishT = snap.enemies[i].squishT || 12;
      }
    }
  }
  if (snap.gems && gems) {
    for (let i = 0; i < snap.gems.length && i < gems.length; i++) {
      if (!snap.gems[i].alive) gems[i].alive = false;
    }
  }
  if (boss && snap.bossHp !== null) {
    boss.hp = snap.bossHp;
    if (!snap.bossAlive) boss.alive = false;
  }
  // Co-op shared gem pool sync
  if (snap.sharedGems !== undefined && typeof coopResetSharedGems === 'function') {
    if (players && players[0]) players[0].gems = snap.sharedGems;
  }
  if (typeof updateHud === 'function') updateHud();
}
