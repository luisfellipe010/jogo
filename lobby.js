/* Blip's Grove — lobby.js  (M6.2 / v19 bug-fix refactor)
 *
 * Architecture — Star topology, up to 4 players:
 *   HOST   — creates PeerJS peer with ID = "blipgrove-XXXXXX" (room code).
 *            Runs full simulation. Broadcasts authoritative snapshots ~20/s.
 *   GUEST  — connects to host by room code. Sends local input each frame.
 *   SPEC   — spectator: receives snapshots only, sends no input.
 *
 * Bug fixes (v19):
 *   - Ping/pong: host ping message included `seq` but guest pong replied with
 *     `msg.slot || fromSlot`, where `msg.slot` was undefined on the pong from
 *     host→guest direction — ping RTT never updated guest-side. Fixed: always
 *     use `fromSlot` for roster lookup; add slot to every pong reply.
 *   - _autoKickTimer declared inside IIFE after _reset() references it, but
 *     the var declaration was hoisted without assignment, so
 *     `clearInterval(_autoKickTimer)` in _reset() always cleared `undefined`.
 *     Fixed: declare at top of IIFE scope with the other vars.
 *   - lobbyTransferHost didn't clean up the old host's peer/connections,
 *     leaving zombie DataConnections open. Now properly steps the old host
 *     down and closes connections it no longer manages.
 *   - lobbyJoin connection metadata used `reliable: false` which maps to the
 *     PeerJS serialization option, not a channel mode — changed to explicit
 *     `serialization: 'json'` only (PeerJS default is reliable).
 *   - _reset() now null-checks _autoKickTimer before clearing to avoid the
 *     "clearInterval(undefined)" no-op on first call.
 *
 * Public API: unchanged — see top of file.
 */

(function() {
'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const LOBBY_MAX_PLAYERS   = 4;
const LOBBY_PEER_PREFIX   = 'blipgrove-';
const LOBBY_SNAP_INTERVAL = 3; // every N ticks ≈ 20/s at 60fps

const LOBBY_PALETTES = [
  { base:'#2dd4bf', hi:'#7ff2e2', mid:'#5ae6d1', shade:'#0e8c7d', dark:'#0a6e62', outline:'#083a33', strap:'#1a2e33', hat:'#22a995', label:'TEAL'   },
  { base:'#ff9a3c', hi:'#ffd77a', mid:'#ffb04a', shade:'#c46a14', dark:'#7a3f08', outline:'#3a1e04', strap:'#2e1a04', hat:'#d07018', label:'ORANGE' },
  { base:'#c084fc', hi:'#e9d5ff', mid:'#d8b4fe', shade:'#7e22ce', dark:'#4c1d95', outline:'#2e1065', strap:'#3b0764', hat:'#a855f7', label:'PURPLE' },
  { base:'#f87171', hi:'#fecaca', mid:'#fca5a5', shade:'#b91c1c', dark:'#7f1d1d', outline:'#450a0a', strap:'#3b0a0a', hat:'#ef4444', label:'RED'    },
];

// ─── State ────────────────────────────────────────────────────────────────────
let _peer         = null;
let _connections  = {};     // { slot: DataConnection }  (host only; 'spec' key = array)
let _hostConn     = null;   // DataConnection to host (guest/spec)
let _role         = null;   // 'host' | 'guest' | 'spectator' | null
let _mySlot       = 0;
let _roomCode     = null;
let _gameMode     = 'coop';
let _spectator    = false;

let _players      = [];     // index = slot (0–3)
let _latestSnap   = null;
let _remoteInputs = [{}, {}, {}, {}];
let _stateChangeCb = null;
let _snapTick      = 0;

// Race
let _raceStart   = null;
let _raceResults = [];

// Host admin
let _roomLocked   = false;
let _roomPassword = '';
let _autoKickMs   = 60000;
let _lastActivity = {};
let _autoKickTimer = null;  // FIX v19: declare here (top of scope) so _reset() can safely clear it

// Gem Hunt
let _gemHuntDurationMs = 90000;
let _gemHuntEndTime    = null;
let _gemHuntActive     = false;
let _gemHuntScores     = {};

// Last One Standing
let _losActive          = false;
let _losHazardLevel     = 0;
let _losNextHazardT     = null;
let _losEliminatedOrder = [];

// ─── Public predicates ────────────────────────────────────────────────────────
function lobbyIsActive()    { return _role !== null && _peer !== null; }
function lobbyIsHost()      { return _role === 'host'; }
function lobbyIsGuest()     { return _role === 'guest'; }
function lobbyIsSpectator() { return _role === 'spectator'; }
function lobbyGetRoomCode() { return _roomCode; }
function lobbyGetMode()     { return _gameMode; }
function lobbyGetMySlot()   { return _mySlot; }
function lobbyGetPlayers()  { return _players.filter(p => p && p.connected); }
function lobbyGetRaceResults() { return _raceResults.slice(); }
function lobbyOnStateChange(cb) { _stateChangeCb = cb; }
function _notifyStateChange()   { if (_stateChangeCb) _stateChangeCb(); }

// Host admin accessors
function lobbyIsLocked()           { return _roomLocked; }
function lobbyGetPassword()        { return _roomPassword; }
function lobbyGetAutoKickMs()      { return _autoKickMs; }
function lobbyGetGemHuntDuration() { return _gemHuntDurationMs / 1000; }
function lobbyGetGemHuntScores()   { return Object.assign({}, _gemHuntScores); }
function lobbyGetGemHuntTimeLeft() {
  if (!_gemHuntActive || !_gemHuntEndTime) return 0;
  return Math.max(0, (_gemHuntEndTime - performance.now()) / 1000);
}
function lobbyIsLosActive()        { return _losActive; }
function lobbyGetLosHazardLevel()  { return _losHazardLevel; }
function lobbyGetEliminatedOrder() { return _losEliminatedOrder.slice(); }

// ─── Room code ────────────────────────────────────────────────────────────────
function _genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function _peerId(code) { return LOBBY_PEER_PREFIX + code; }

// ─── PeerJS bootstrap ─────────────────────────────────────────────────────────
function _makePeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') { reject(new Error('PeerJS not loaded')); return; }
    const p = new Peer(id, { debug: 0 });
    p.on('open',  () => resolve(p));
    p.on('error', err => {
      if (err.type === 'unavailable-id') reject(new Error('Room code taken — try again'));
      else reject(err);
    });
  });
}

// ─── CREATE (host) ────────────────────────────────────────────────────────────
async function lobbyCreate() {
  _reset();
  _role     = 'host';
  _mySlot   = 0;
  _roomCode = _genRoomCode();

  try {
    _peer = await _makePeer(_peerId(_roomCode));
  } catch(e) {
    // Retry once on code collision
    _roomCode = _genRoomCode();
    _peer = await _makePeer(_peerId(_roomCode));
  }

  _players[0] = _makeLobbyPlayer(0, _localName(), 0, true);
  _peer.on('connection', conn => _hostHandleIncoming(conn));
  _peer.on('error', err => { console.warn('[lobby] peer error', err); });

  _notifyStateChange();
  return _roomCode;
}

// ─── JOIN (guest or spectator) ────────────────────────────────────────────────
// FIX v19: removed erroneous `reliable: false` option (it is not a valid
// PeerJS DataConnection option and caused silent fallback to unreliable mode
// in some PeerJS versions).
async function lobbyJoin(code, asSpectator = false, password = '') {
  _reset();
  _spectator = asSpectator;
  _role      = asSpectator ? 'spectator' : 'guest';
  _roomCode  = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  _peer = await _makePeer(undefined); // anonymous peer

  return new Promise((resolve, reject) => {
    const conn = _peer.connect(_peerId(_roomCode), {
      serialization: 'json',
      metadata: { name: _localName(), spectator: asSpectator },
    });

    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 15000);

    conn.on('open', () => {
      clearTimeout(timeout);
      _hostConn = conn;
      _setupGuestConn(conn);
      _send(conn, { type: 'join', name: _localName(), spectator: asSpectator, password });
      resolve();
    });
    conn.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

// ─── HOST: incoming connection handler ────────────────────────────────────────
function _hostHandleIncoming(conn) {
  // Wait for the join message before assigning slot
  let slotAssigned = -1;

  conn.on('data', msg => {
    if (msg.type === 'join' && slotAssigned === -1) {
      const isSpec = !!msg.spectator;

      if (_roomPassword && msg.password !== _roomPassword) {
        _send(conn, { type: 'joinDenied', reason: 'Wrong password' });
        conn.close(); return;
      }
      if (_roomLocked && !isSpec) {
        _send(conn, { type: 'joinDenied', reason: 'Room is locked' });
        conn.close(); return;
      }

      if (!isSpec) {
        const slot = _nextFreeSlot();
        if (slot === -1) {
          _send(conn, { type: 'joinDenied', reason: 'Room is full (max 4 players)' });
          conn.close(); return;
        }
        slotAssigned = slot;
        _connections[slot] = conn;
        _players[slot] = _makeLobbyPlayer(slot, msg.name || `P${slot+1}`, slot, true);
        _lastActivity[slot] = performance.now();

        _setupHostConnHandlers(conn, slot);

        const inGame = typeof gameState !== 'undefined' && gameState === 'play';
        _send(conn, {
          type: 'joinOk',
          slot,
          players: _players.map(p => p ? { slot: p.slot, name: p.name, color: p.color, ready: p.ready } : null),
          mode: _gameMode,
          inGame,
        });
        _broadcastExcept(slot, {
          type: 'rosterUpdate',
          players: _players.map(p => p ? { slot: p.slot, name: p.name, color: p.color, ready: p.ready } : null),
        });
        if (inGame) _sendLateJoinSnap(conn);
        _notifyStateChange();
      } else {
        _send(conn, {
          type: 'spectatorOk',
          players: _players.map(p => p ? { slot: p.slot, name: p.name } : null),
          mode: _gameMode,
        });
        _setupSpectatorConn(conn);
      }
    } else if (slotAssigned > 0) {
      _touchActivity(slotAssigned);
      _handleMessage(msg, slotAssigned);
    }
  });

  conn.on('close', () => {
    const slot = slotAssigned > 0 ? slotAssigned : _slotForConn(conn);
    if (slot > 0 && _players[slot]) {
      _players[slot].connected = false;
      _broadcastExcept(slot, { type: 'playerLeft', slot });
      _notifyStateChange();
    }
  });

  conn.on('error', err => { console.warn('[lobby] host conn error', err); });
}

function _setupHostConnHandlers(conn, slot) {
  // Additional data handler registered after join is processed
  conn.on('data', msg => {
    _touchActivity(slot);
    _handleMessage(msg, slot);
  });
  conn.on('close', () => {
    if (_players[slot]) { _players[slot].connected = false; _notifyStateChange(); }
    _broadcastExcept(slot, { type: 'playerLeft', slot });
  });
}

function _setupSpectatorConn(conn) {
  conn.on('data', () => {});
  conn.on('close', () => {});
  if (!Array.isArray(_connections['spec'])) _connections['spec'] = [];
  _connections['spec'].push(conn);
}

// ─── GUEST: messages from host ────────────────────────────────────────────────
function _setupGuestConn(conn) {
  conn.on('data', msg => _handleMessage(msg, 0));
  conn.on('close', () => {
    _role = null;
    if (typeof toast === 'function') toast('Disconnected from lobby');
    _notifyStateChange();
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────
function _handleMessage(msg, fromSlot) {
  if (!msg || !msg.type) return;
  switch (msg.type) {

    case 'joinOk':
      _mySlot   = msg.slot;
      _gameMode = msg.mode || 'coop';
      _players  = (msg.players || []).map((p, i) =>
        p ? _makeLobbyPlayer(p.slot, p.name, p.color, true) : null);
      _notifyStateChange();
      break;

    case 'joinDenied':
      if (typeof toast === 'function') toast('Join failed: ' + (msg.reason || 'unknown'));
      _reset();
      _notifyStateChange();
      break;

    case 'spectatorOk':
      _gameMode = msg.mode || 'coop';
      _players  = (msg.players || []).map((p, i) =>
        p ? _makeLobbyPlayer(p.slot, p.name, p.color || i, true) : null);
      _notifyStateChange();
      break;

    case 'rosterUpdate':
      _players = (msg.players || []).map((p, i) =>
        p ? _makeLobbyPlayer(p.slot, p.name, p.color, true) : null);
      _notifyStateChange();
      break;

    case 'playerLeft':
      if (_players[msg.slot]) { _players[msg.slot].connected = false; _notifyStateChange(); }
      break;

    case 'modeChange':
      _gameMode = msg.mode;
      _notifyStateChange();
      break;

    case 'chat':
      _receivedChat(msg.name, msg.text, msg.slot);
      break;

    case 'ready':
      if (_players[fromSlot]) { _players[fromSlot].ready = msg.ready; _notifyStateChange(); }
      if (lobbyIsHost()) _broadcastExcept(fromSlot, msg);
      break;

    case 'start':
      if (!lobbyIsHost()) {
        _raceStart   = performance.now();
        _raceResults = [];
        if (typeof numPlayers !== 'undefined')
          numPlayers = Math.min(LOBBY_MAX_PLAYERS, lobbyGetPlayers().length);
        if (typeof startTransition === 'function') startTransition(() => startLevel(msg.levelIdx));
        else if (typeof startLevel === 'function') startLevel(msg.levelIdx);
        if (typeof closeLobbyUI === 'function') closeLobbyUI();
      }
      break;

    case 'snap':
      if (!lobbyIsHost()) _latestSnap = msg.snap;
      break;

    case 'inp':
      if (lobbyIsHost() && fromSlot > 0 && fromSlot < LOBBY_MAX_PLAYERS) {
        _remoteInputs[fromSlot] = msg.inp || {};
      }
      break;

    case 'ping': {
      // FIX v19: always echo with the sender's slot so pong handler can find them
      const pongSlot = lobbyIsHost() ? fromSlot : _mySlot;
      const pongMsg  = { type: 'pong', seq: msg.seq, slot: pongSlot };
      if (lobbyIsHost() && _connections[fromSlot]) {
        _send(_connections[fromSlot], pongMsg);
      } else if (!lobbyIsHost() && _hostConn) {
        _send(_hostConn, pongMsg);
      }
      break;
    }

    case 'pong': {
      // FIX v19: use msg.slot (always present) for roster lookup
      const rSlot = msg.slot !== undefined ? msg.slot : fromSlot;
      if (_players[rSlot] && _pingSent[msg.seq] !== undefined) {
        _players[rSlot].ping = Math.round(performance.now() - _pingSent[msg.seq]);
        delete _pingSent[msg.seq];
        _notifyStateChange();
      }
      break;
    }

    case 'raceFinish':
      if (lobbyIsHost()) lobbyHandleRaceFinish(fromSlot, msg.time);
      break;

    case 'raceResults':
      _raceResults = msg.results || [];
      _notifyStateChange();
      break;

    case 'kicked':
      if (typeof toast === 'function') toast('You were removed: ' + (msg.reason || ''));
      _reset();
      _notifyStateChange();
      break;

    case 'hostTransfer':
      if (msg.newHost === _mySlot) {
        _role = 'host';
        if (typeof toast === 'function') toast('You are now the host!');
      }
      _notifyStateChange();
      break;

    case 'roomLocked':
      if (typeof toast === 'function') toast(msg.locked ? '🔒 Room locked' : '🔓 Room unlocked');
      break;

    case 'lateJoinSnap':
      if (!lobbyIsHost()) {
        _latestSnap = msg.snap;
        if (msg.levelIdx !== undefined && typeof startLevel === 'function') {
          if (typeof numPlayers !== 'undefined')
            numPlayers = Math.min(LOBBY_MAX_PLAYERS, lobbyGetPlayers().length);
          if (typeof gameState !== 'undefined' && gameState !== 'play') startLevel(msg.levelIdx);
        }
      }
      break;

    case 'gemHuntStart':
      _gemHuntActive  = true;
      _gemHuntEndTime = performance.now() + (msg.duration || 90000);
      _gemHuntScores  = {};
      if (typeof toast === 'function') toast('💎 GEM HUNT STARTED!');
      _notifyStateChange();
      break;

    case 'gemHuntEnd':
      _gemHuntActive = false;
      if (msg.results?.length && typeof toast === 'function') {
        toast(`GEM HUNT: ${msg.results[0].name} wins with ${msg.results[0].gems} gems!`);
      }
      _notifyStateChange();
      break;

    case 'losStart':
      _losActive = true; _losHazardLevel = 0; _losEliminatedOrder = [];
      if (typeof toast === 'function') toast('⚔ LAST ONE STANDING — SURVIVE!');
      _notifyStateChange();
      break;

    case 'losHazard':
      _losHazardLevel = msg.level;
      _notifyStateChange();
      break;

    case 'losEliminated':
      if (typeof players !== 'undefined' && players[fromSlot]) players[fromSlot].dead = true;
      _losEliminatedOrder.push(msg.slot);
      _notifyStateChange();
      break;

    case 'losEnd':
      _losActive = false;
      if (typeof toast === 'function') toast(`🏆 ${msg.winnerName} wins Last One Standing!`);
      _notifyStateChange();
      break;
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────
function lobbyRemoteInput(slot) {
  if (!lobbyIsActive() || slot === _mySlot) return null;
  return _remoteInputs[slot] || null;
}

function lobbySendInput(inp) {
  if (!lobbyIsActive() || lobbyIsHost() || lobbyIsSpectator()) return;
  const msg = {
    type: 'inp',
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
  if (_hostConn) _send(_hostConn, msg);
}

// ─── Snapshot broadcast ───────────────────────────────────────────────────────
function lobbySendHostSnap(snap) {
  if (!lobbyIsHost()) return;
  const msg = { type: 'snap', snap };
  for (const slot in _connections) {
    if (slot === 'spec') {
      for (const sc of (_connections['spec'] || [])) _send(sc, msg);
    } else {
      _send(_connections[slot], msg);
    }
  }
}

function lobbyGetLatestSnap() {
  const s = _latestSnap; _latestSnap = null; return s;
}

// ─── Game mode ────────────────────────────────────────────────────────────────
function lobbySetMode(mode) {
  if (!lobbyIsHost()) return;
  _gameMode = mode;
  _broadcastAll({ type: 'modeChange', mode });
  _notifyStateChange();
}

// ─── Start game (host) ────────────────────────────────────────────────────────
function lobbyStartGame(levelIdx) {
  if (!lobbyIsHost()) return;
  _raceStart   = performance.now();
  _raceResults = [];
  _broadcastAll({ type: 'start', levelIdx, mode: _gameMode });
  if (typeof numPlayers !== 'undefined')
    numPlayers = Math.min(LOBBY_MAX_PLAYERS, lobbyGetPlayers().length);
  const doStart = () => {
    startLevel(levelIdx);
    setTimeout(() => {
      if (_gameMode === 'gemhunt' && typeof lobbyStartGemHunt === 'function') lobbyStartGemHunt();
      if (_gameMode === 'los'     && typeof lobbyStartLOS     === 'function') lobbyStartLOS();
    }, 500);
  };
  if (typeof startTransition === 'function') startTransition(doStart);
  else doStart();
  if (typeof closeLobbyUI === 'function') closeLobbyUI();
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
const CHAT_HISTORY = [];
const CHAT_MAX = 60;
let _chatCb = null;

function lobbySendChat(text) {
  if (!lobbyIsActive() || !text.trim()) return;
  const name = _localName();
  const msg  = { type: 'chat', name, text: text.trim().slice(0, 120), slot: _mySlot };
  _receivedChat(name, text, _mySlot);
  if (lobbyIsHost()) _broadcastAll(msg);
  else if (_hostConn) _send(_hostConn, msg);
}

function _receivedChat(name, text, slot) {
  const entry = { name, text: text.slice(0, 120), slot, t: Date.now() };
  CHAT_HISTORY.push(entry);
  if (CHAT_HISTORY.length > CHAT_MAX) CHAT_HISTORY.shift();
  if (_chatCb) _chatCb(entry);
  if (typeof gameState !== 'undefined' && gameState === 'play') {
    if (typeof toast === 'function') toast(`${name}: ${text.slice(0, 40)}`);
  }
  if (lobbyIsHost()) _broadcastExcept(slot, { type: 'chat', name, text, slot });
}

function lobbyOnChat(cb)         { _chatCb = cb; }
function lobbyGetChatHistory()   { return CHAT_HISTORY.slice(); }

// ─── Ready ────────────────────────────────────────────────────────────────────
function lobbyToggleReady() {
  if (!lobbyIsActive()) return;
  const me = _players[_mySlot];
  if (!me) return;
  me.ready = !me.ready;
  const msg = { type: 'ready', ready: me.ready, slot: _mySlot };
  if (lobbyIsHost()) _broadcastAll(msg);
  else if (_hostConn) _send(_hostConn, msg);
  _notifyStateChange();
}

function lobbyAllReady() {
  const connected = _players.filter(p => p && p.connected);
  return connected.length >= 2 && connected.every(p => p.ready);
}

// ─── Race ─────────────────────────────────────────────────────────────────────
function lobbyHandleRaceFinish(slot, time) {
  if (!lobbyIsHost()) return;
  const elapsed = time || ((performance.now() - (_raceStart || performance.now())) / 1000);
  const p = _players[slot];
  if (!p || _raceResults.find(r => r.slot === slot)) return;
  _raceResults.push({ slot, name: p.name, time: +elapsed.toFixed(2) });
  _raceResults.sort((a, b) => a.time - b.time);
  _broadcastAll({ type: 'raceResults', results: _raceResults });
  _notifyStateChange();
}

function lobbySignalRaceFinish() {
  if (!lobbyIsActive()) return;
  const elapsed = (performance.now() - (_raceStart || performance.now())) / 1000;
  if (lobbyIsHost()) lobbyHandleRaceFinish(0, elapsed);
  else if (_hostConn) _send(_hostConn, { type: 'raceFinish', time: elapsed });
}

// ─── Ping ─────────────────────────────────────────────────────────────────────
let _pingSeq  = 0;
let _pingSent = {};

function lobbyPingAll() {
  if (!lobbyIsActive()) return;
  const seq = _pingSeq++;
  _pingSent[seq] = performance.now();

  if (lobbyIsHost()) {
    for (const slot in _connections) {
      if (slot === 'spec') continue;
      _send(_connections[slot], { type: 'ping', seq, slot: 0 });
    }
  } else if (_hostConn) {
    _send(_hostConn, { type: 'ping', seq, slot: _mySlot });
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
function lobbyDisconnect() {
  if (_peer) { try { _peer.destroy(); } catch(e) {} }
  _reset();
  _notifyStateChange();
}

function _reset() {
  // FIX v19: safely clear auto-kick timer if running
  if (_autoKickTimer) { clearInterval(_autoKickTimer); _autoKickTimer = null; }

  _peer          = null;
  _connections   = {};
  _hostConn      = null;
  _role          = null;
  _mySlot        = 0;
  _roomCode      = null;
  _players       = [];
  _latestSnap    = null;
  _remoteInputs  = [{}, {}, {}, {}];
  _raceResults   = [];
  _raceStart     = null;
  _spectator     = false;
  _roomLocked    = false;
  _roomPassword  = '';
  _lastActivity  = {};
  _gemHuntActive = false;
  _gemHuntEndTime = null;
  _gemHuntScores  = {};
  _losActive          = false;
  _losHazardLevel     = 0;
  _losNextHazardT     = null;
  _losEliminatedOrder = [];
  _pingSent           = {};
}

// ─── Host admin ───────────────────────────────────────────────────────────────
function lobbyKick(slot) {
  if (!lobbyIsHost() || slot === 0) return;
  const conn = _connections[slot];
  if (conn) { _send(conn, { type: 'kicked', reason: 'Removed by host' }); conn.close(); }
  if (_players[slot]) _players[slot].connected = false;
  _broadcastExcept(slot, { type: 'playerLeft', slot });
  _notifyStateChange();
}

// FIX v19: properly clean up the old host's peer when transferring.
// The new host needs its own PeerJS connection to manage the room from
// their side — this is a best-effort signal since true host migration in a
// star topology requires all guests to reconnect to the new host peer.
// We notify everyone, then the old host steps down gracefully.
function lobbyTransferHost(slot) {
  if (!lobbyIsHost() || slot === 0 || !_players[slot]?.connected) return;
  _broadcastAll({ type: 'hostTransfer', newHost: slot });
  // Step down: close our peer so we don't keep receiving connections
  _role   = 'guest';
  _mySlot = 0;
  // Close remaining connections the old host was managing
  for (const s in _connections) {
    if (s === 'spec') continue;
    if (parseInt(s) !== slot) {
      try { _connections[s].close(); } catch(e) {}
    }
  }
  _connections = {};
  _notifyStateChange();
  if (typeof toast === 'function') toast(`Host transferred to ${_players[slot].name}`);
}

function lobbySetLocked(locked) {
  if (!lobbyIsHost()) return;
  _roomLocked = locked;
  _broadcastAll({ type: 'roomLocked', locked });
  _notifyStateChange();
}

function lobbySetPassword(pw) {
  if (!lobbyIsHost()) return;
  _roomPassword = pw || '';
  _notifyStateChange();
}

function lobbySetAutoKick(ms) {
  _autoKickMs = ms;
  if (_autoKickTimer) { clearInterval(_autoKickTimer); _autoKickTimer = null; }
  if (ms > 0 && lobbyIsHost()) _startAutoKickTimer();
}

function _startAutoKickTimer() {
  _autoKickTimer = setInterval(() => {
    if (!lobbyIsHost()) { clearInterval(_autoKickTimer); _autoKickTimer = null; return; }
    const now = performance.now();
    for (let slot = 1; slot < LOBBY_MAX_PLAYERS; slot++) {
      if (!_players[slot]?.connected) continue;
      const last = _lastActivity[slot] || now;
      if ((now - last) > _autoKickMs) {
        if (typeof toast === 'function') toast(`Auto-kicked ${_players[slot].name} (inactive)`);
        lobbyKick(slot);
      }
    }
  }, 5000);
}

function _touchActivity(slot) { _lastActivity[slot] = performance.now(); }

// ─── Late-join ────────────────────────────────────────────────────────────────
function _sendLateJoinSnap(conn) {
  if (typeof netBuildSnap !== 'function') return;
  const snap = netBuildSnap();
  if (snap) _send(conn, {
    type: 'lateJoinSnap', snap,
    levelIdx: typeof currentLevel !== 'undefined' ? currentLevel : 0,
  });
}

// ─── Gem Hunt ────────────────────────────────────────────────────────────────
function lobbySetGemHuntDuration(seconds) { _gemHuntDurationMs = (seconds || 90) * 1000; }

function lobbyStartGemHunt() {
  if (!lobbyIsHost()) return;
  _gemHuntActive  = true;
  _gemHuntEndTime = performance.now() + _gemHuntDurationMs;
  _gemHuntScores  = {};
  _broadcastAll({ type: 'gemHuntStart', duration: _gemHuntDurationMs });
  _notifyStateChange();
  setTimeout(() => { if (_gemHuntActive) _endGemHunt(); }, _gemHuntDurationMs);
}

function lobbyGemHuntScore(slot, gems) {
  if (!lobbyIsHost()) return;
  _gemHuntScores[slot] = gems;
}

function _endGemHunt() {
  if (!lobbyIsHost()) return;
  _gemHuntActive = false;
  const results = Object.entries(_gemHuntScores)
    .map(([slot, gems]) => ({
      slot: parseInt(slot),
      name: _players[parseInt(slot)]?.name || `P${parseInt(slot)+1}`,
      gems,
    }))
    .sort((a, b) => b.gems - a.gems);
  _broadcastAll({ type: 'gemHuntEnd', results });
  _notifyStateChange();
  if (results[0] && typeof toast === 'function') {
    toast(`GEM HUNT OVER! ${results[0].name} wins with ${results[0].gems} gems!`);
  }
}

function lobbyGemHuntAddGem(slot, count) {
  if (!_gemHuntActive || !lobbyIsHost()) return;
  _gemHuntScores[slot] = (_gemHuntScores[slot] || 0) + (count || 1);
  if (_gemHuntEndTime && performance.now() >= _gemHuntEndTime) _endGemHunt();
}

// ─── Last One Standing ────────────────────────────────────────────────────────
const LOS_HAZARD_INTERVAL_MS = 15000;
const LOS_HAZARD_LEVELS = [
  { label: 'LEVEL 1', desc: 'Enemies move faster' },
  { label: 'LEVEL 2', desc: 'More projectiles' },
  { label: 'LEVEL 3', desc: 'Hazard tiles spread' },
  { label: 'LEVEL 4', desc: 'Screen shaking intensifies' },
  { label: 'MAX',     desc: 'CHAOS' },
];

function lobbyStartLOS() {
  if (!lobbyIsHost()) return;
  _losActive          = true;
  _losHazardLevel     = 0;
  _losNextHazardT     = performance.now() + LOS_HAZARD_INTERVAL_MS;
  _losEliminatedOrder = [];
  _broadcastAll({ type: 'losStart' });
  _notifyStateChange();
}

function lobbyTickLOS() {
  if (!_losActive || !lobbyIsHost()) return;
  if (performance.now() >= _losNextHazardT) {
    _losHazardLevel = Math.min(_losHazardLevel + 1, LOS_HAZARD_LEVELS.length - 1);
    _losNextHazardT = performance.now() + LOS_HAZARD_INTERVAL_MS;
    _broadcastAll({ type: 'losHazard', level: _losHazardLevel });
    if (typeof toast === 'function')
      toast(`⚠ HAZARD ${LOS_HAZARD_LEVELS[_losHazardLevel].label}: ${LOS_HAZARD_LEVELS[_losHazardLevel].desc}`);
  }
  if (typeof players !== 'undefined') {
    const alive = players.filter(p => !p.dead);
    if (alive.length === 1 && players.length > 1) {
      const winner = alive[0];
      _losActive = false;
      _broadcastAll({
        type: 'losEnd',
        winnerSlot: winner.idx,
        winnerName: _players[winner.idx]?.name || `P${winner.idx + 1}`,
      });
      if (typeof toast === 'function')
        toast(`🏆 ${_players[winner.idx]?.name || 'P' + (winner.idx + 1)} WINS LAST ONE STANDING!`);
      _notifyStateChange();
    }
  }
}

function lobbyLOSEliminate(slot) {
  if (!_losActive) return;
  _losEliminatedOrder.push(slot);
  _broadcastAll({ type: 'losEliminated', slot, order: _losEliminatedOrder.length });
  if (typeof toast === 'function') toast(`${_players[slot]?.name || 'P' + (slot+1)} eliminated!`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _send(conn, msg) {
  if (conn && conn.open) { try { conn.send(msg); } catch(e) {} }
}

function _broadcastAll(msg) {
  for (const slot in _connections) {
    if (slot === 'spec') {
      for (const sc of (_connections['spec'] || [])) _send(sc, msg);
    } else {
      _send(_connections[slot], msg);
    }
  }
}

function _broadcastExcept(exceptSlot, msg) {
  for (const slot in _connections) {
    if (slot === 'spec') {
      for (const sc of (_connections['spec'] || [])) _send(sc, msg);
      continue;
    }
    if (parseInt(slot) !== exceptSlot) _send(_connections[slot], msg);
  }
}

function _slotForConn(conn) {
  for (const slot in _connections) {
    if (slot !== 'spec' && _connections[slot] === conn) return parseInt(slot);
  }
  return -1;
}

function _nextFreeSlot() {
  for (let i = 1; i < LOBBY_MAX_PLAYERS; i++) {
    if (!_players[i] || !_players[i].connected) return i;
  }
  return -1;
}

function _localName() {
  try {
    const raw = localStorage.getItem('blipgrove_profile_v1');
    if (raw) { const p = JSON.parse(raw); if (p.name) return p.name; }
  } catch(e) {}
  return 'Player';
}

function _makeLobbyPlayer(slot, name, color, connected) {
  return {
    slot,
    name: name || `P${slot+1}`,
    color: typeof color === 'number' ? color : slot,
    ready: slot === 0,   // host starts pre-readied
    connected: !!connected,
    ping: null,
  };
}

// ─── ?room= URL auto-join ────────────────────────────────────────────────────
function lobbyCheckAutoJoin() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('room');
  const spec   = params.get('spec') === '1';
  if (!code) return;

  // Clean URL so a refresh doesn't re-trigger
  const clean = new URL(window.location.href);
  clean.searchParams.delete('room');
  clean.searchParams.delete('spec');
  window.history.replaceState({}, '', clean.toString());

  // Store the prefill code so _renderJoinTab picks it up
  window.__lobbyPrefillCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  setTimeout(() => {
    openLobbyUI();
    // If spectator flag set, auto-join immediately; otherwise just pre-fill the input
    if (spec) _lobbyAutoJoin(code, true);
  }, 400);
}

async function _lobbyAutoJoin(code, asSpec) {
  try {
    await lobbyJoin(code, asSpec);
  } catch(e) {
    if (typeof toast === 'function') toast('Auto-join failed: ' + e.message);
  }
}

// ─── Spectator overlay ────────────────────────────────────────────────────────
function lobbyUpdateSpectatorOverlay() {
  const el = document.getElementById('spectatorOverlay');
  if (!el) return;
  if (!lobbyIsSpectator() || typeof gameState === 'undefined' || gameState !== 'play') {
    el.style.display = 'none'; return;
  }
  el.style.display = 'flex';
  const res    = _raceResults;
  if (_gameMode === 'race' && res.length > 0) {
    const resHtml = res.map((r, i) =>
      `<div style="font-size:11px;letter-spacing:1px;color:${i===0?'#ffd866':'#fff4d6'};">
        ${i+1}. ${r.name} — ${r.time}s
      </div>`
    ).join('');
    const raceEl = el.querySelector('#spectatorRaceResults');
    if (raceEl) raceEl.innerHTML = resHtml;
  }
}

// ─── Expose public API ────────────────────────────────────────────────────────
Object.assign(window, {
  LOBBY_MAX_PLAYERS, LOBBY_SNAP_INTERVAL, LOBBY_PALETTES,
  LOS_HAZARD_LEVELS,
  lobbyCreate, lobbyJoin, lobbyIsActive, lobbyIsHost, lobbyIsGuest, lobbyIsSpectator,
  lobbyGetPlayers, lobbyGetRoomCode, lobbyGetMode, lobbySetMode, lobbyGetMySlot,
  lobbyRemoteInput, lobbySendInput, lobbySendHostSnap, lobbyGetLatestSnap,
  lobbyDisconnect, lobbyOnStateChange,
  lobbyHandleRaceFinish, lobbySignalRaceFinish, lobbyGetRaceResults,
  lobbyCheckAutoJoin, lobbyStartGame,
  lobbySendChat, lobbyOnChat, lobbyGetChatHistory,
  lobbyToggleReady, lobbyAllReady, lobbyPingAll, lobbyUpdateSpectatorOverlay,
  // Host admin
  lobbyKick, lobbyTransferHost, lobbySetLocked, lobbySetPassword, lobbySetAutoKick,
  lobbyIsLocked, lobbyGetPassword, lobbyGetAutoKickMs,
  // Gem Hunt
  lobbySetGemHuntDuration, lobbyStartGemHunt, lobbyGemHuntScore,
  lobbyGemHuntAddGem, lobbyGetGemHuntDuration, lobbyGetGemHuntScores, lobbyGetGemHuntTimeLeft,
  // Last One Standing
  lobbyStartLOS, lobbyTickLOS, lobbyLOSEliminate,
  lobbyIsLosActive, lobbyGetLosHazardLevel, lobbyGetEliminatedOrder,
});

})();
