/* Blip's Grove — menu.js  (M8: Professional game menu)
 *
 * Replaces the plain banner title screen with a full-screen layered menu:
 *   • Animated parallax background (hills, clouds, stars)
 *   • Live pixel-art hero scene (P1 + P2 walking/idling on a platform)
 *   • Full-screen glass-panel menu with all feature entry points
 *   • Profile system (name + avatar colour + stats card)
 *   • Scale+fade transitions for menu items
 *
 * Integration:
 *   Call menuShow() instead of (or after) showTitle().
 *   Call menuHide() to dismiss (game start, world map, etc.)
 *   The existing banner is hidden while the menu is open.
 *
 * Public API:
 *   menuShow()          — open the full-screen menu
 *   menuHide()          — close it (also stops bg animation)
 *   menuIsOpen()        — bool
 *   menuGetProfile()    — { name, avatarColor } | null
 */

'use strict';

// ─── Profile persistence ──────────────────────────────────────────────────────
const PROFILE_KEY = 'blipgrove_profile_v1';

function menuGetProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function _saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch(e) {}
}

// ─── State ────────────────────────────────────────────────────────────────────
let _m8Open   = false;
let _m8El     = null;
let _m8BgRaf      = null;
let _m8BgT        = 0;
let _m8HeroT      = 0;
let _m8ActivePanel = 'main'; // 'main' | 'profile'

function menuIsOpen() { return _m8Open; }

// ─── Main entry ───────────────────────────────────────────────────────────────
function menuShow() {
  // Hide the legacy banner
  const banner = document.getElementById('banner');
  if (banner) banner.style.display = 'none';

  // Clear any held keys so game input doesn't leak through
  if (typeof keys !== 'undefined') keys.clear();

  if (_m8El) {
    _m8El.style.display = 'flex';
    _m8Open = true;
    _startBg();
    _renderMainPanel();
    // Only start title music if audio context already exists (user already interacted)
    if (typeof startTitleMusic === 'function' && typeof audioCtx !== 'undefined' && audioCtx) {
      startTitleMusic();
    }
    return;
  }

  _buildDOM();
  _m8Open = true;
  _startBg();
  _renderMainPanel();
  // Don't auto-play title music here — wait for first user interaction
  // Title music starts when user clicks any nav item or the background
}

function menuHide() {
  if (_m8El) _m8El.style.display = 'none';
  _m8Open = false;
  _stopBg();
  if (typeof stopTitleMusic === 'function') stopTitleMusic();
  // Clear held keys so nothing leaks into the game
  if (typeof keys !== 'undefined') keys.clear();
}

// ─── DOM construction ─────────────────────────────────────────────────────────
function _buildDOM() {
  const el = document.createElement('div');
  el.id = 'menuLayer';
  el.style.cssText = [
    'position:absolute','inset:0','z-index:8',
    'display:flex','align-items:stretch',
    'font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace',
    'overflow:hidden',
  ].join(';');

  el.innerHTML = `
    <!-- Parallax background canvas -->
    <canvas id="menuBgCanvas" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;"></canvas>

    <!-- Dark vignette overlay -->
    <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(11,16,32,.88) 0%,rgba(11,16,32,.60) 38%,rgba(11,16,32,.10) 62%,transparent 100%);pointer-events:none;"></div>

    <!-- Left panel — nav + logo -->
    <div id="menuPanel" style="
      position:relative;z-index:2;
      display:flex;flex-direction:column;
      width:48%;max-width:260px;min-width:200px;
      padding:18px 20px 14px;
      justify-content:space-between;
    ">
      <!-- Logo (animated letter-pop) -->
      <div id="menuLogo" style="margin-bottom:10px;">
        <div id="menuLogoLetters" style="font-size:26px;font-weight:bold;letter-spacing:4px;color:#fff4d6;line-height:1;text-shadow:3px 3px 0 #0b1020;display:flex;gap:0;">
          <span class="mll" style="--i:0">B</span><span class="mll" style="--i:1">L</span><span class="mll" style="--i:2">I</span><span class="mll" style="--i:3">P</span>
          <span class="mll" style="--i:4;color:#2dd4bf;">&amp;</span>
          <span class="mll" style="--i:5">B</span><span class="mll" style="--i:6">L</span><span class="mll" style="--i:7">O</span><span class="mll" style="--i:8">P</span>
        </div>
        <div style="font-size:9px;letter-spacing:3px;color:#5a8a7a;margin-top:3px;">A TINY GROVE RUN</div>
        <div style="width:40px;height:2px;background:#2dd4bf;margin-top:6px;"></div>
      </div>

      <!-- Nav items -->
      <nav id="menuNav" style="display:flex;flex-direction:column;gap:5px;flex:1;justify-content:center;"></nav>

      <!-- Profile strip -->
      <div id="menuProfileStrip" style="
        margin-top:12px;border-top:1px solid rgba(127,242,226,.15);
        padding-top:10px;cursor:pointer;
      " onclick="_menuOpenProfile()">
      </div>

      <!-- Version -->
      <div style="font-size:8px;letter-spacing:2px;color:rgba(90,138,122,.6);margin-top:8px;">
        v<span id="menuVersion"></span>
      </div>
    </div>

    <!-- Panel area (profile etc.) -->
    <div id="menuSubPanel" style="
      position:relative;z-index:2;
      display:none;flex-direction:column;
      background:rgba(11,16,32,.82);
      border-left:2px solid rgba(127,242,226,.15);
      width:44%;max-width:200px;padding:14px 16px;
      backdrop-filter:blur(2px);
    "></div>

    <style>
      #menuLayer .mn-item {
        display:flex;align-items:center;gap:10px;
        padding:9px 12px;cursor:pointer;
        border:1.5px solid transparent;
        background:rgba(255,244,214,0);
        color:#c8e0d8;
        transition:background .12s,border-color .12s,transform .1s,color .1s;
        position:relative;
        overflow:hidden;
      }
      #menuLayer .mn-item:hover {
        background:rgba(45,212,191,.10);
        border-color:rgba(45,212,191,.35);
        color:#fff4d6;
        transform:translateX(3px);
      }
      #menuLayer .mn-item:active { transform:translateX(1px); }
      #menuLayer .mn-item.mn-primary {
        background:rgba(45,212,191,.18);
        border-color:rgba(45,212,191,.5);
        color:#fff4d6;
      }
      #menuLayer .mn-item.mn-primary:hover {
        background:rgba(45,212,191,.28);
        border-color:#2dd4bf;
      }
      #menuLayer .mn-icon {
        width:32px;height:32px;display:grid;place-items:center;
        background:rgba(11,16,32,.6);border:1.5px solid rgba(127,242,226,.2);
        font-size:15px;flex-shrink:0;
        transition:background .12s,border-color .12s;
      }
      #menuLayer .mn-item:hover .mn-icon,
      #menuLayer .mn-item.mn-primary .mn-icon {
        background:rgba(45,212,191,.2);
        border-color:rgba(45,212,191,.6);
      }
      #menuLayer .mn-label {
        font-size:13px;letter-spacing:2px;font-weight:bold;
        flex:1;
      }
      #menuLayer .mn-sub {
        font-size:9px;letter-spacing:1px;
        color:rgba(200,224,216,.5);
        margin-top:1px;
      }
      #menuLayer .mn-badge {
        font-size:8px;letter-spacing:1px;
        background:rgba(45,212,191,.25);color:#7ff2e2;
        padding:1px 5px;border:1px solid rgba(45,212,191,.3);
      }
      #menuLayer .mn-arrow {
        font-size:10px;color:rgba(127,242,226,.4);
        transition:transform .1s,color .1s;
      }
      #menuLayer .mn-item:hover .mn-arrow { transform:translateX(2px);color:#7ff2e2; }

      /* Profile strip */
      #menuProfileStrip { transition:background .12s; }
      #menuProfileStrip:hover { background:rgba(45,212,191,.06); }

      /* Sub-panel form */
      #menuLayer .sp-title {
        font-size:13px;letter-spacing:3px;font-weight:bold;color:#fff4d6;
        margin-bottom:12px;display:flex;align-items:center;gap:8px;
      }
      #menuLayer .sp-label {
        font-size:9px;letter-spacing:2px;color:#5a8a7a;margin-bottom:5px;display:block;
      }
      #menuLayer .sp-input {
        font-family:inherit;font-size:11px;letter-spacing:1px;
        background:rgba(11,16,32,.8);color:#fff4d6;
        border:1.5px solid rgba(127,242,226,.25);padding:7px 10px;
        width:100%;box-sizing:border-box;margin-bottom:10px;
        outline:none;transition:border-color .12s;
      }
      #menuLayer .sp-input:focus { border-color:#2dd4bf; }
      #menuLayer .sp-btn {
        font-family:inherit;font-size:10px;letter-spacing:2px;
        padding:8px 14px;cursor:pointer;border:0;
        transition:background .1s,transform .08s;
      }
      #menuLayer .sp-btn-primary {
        background:#2dd4bf;color:#0b1020;
        box-shadow:3px 3px 0 #0a6e62;
      }
      #menuLayer .sp-btn-primary:hover { background:#7ff2e2; }
      #menuLayer .sp-btn-primary:active { transform:translate(2px,2px);box-shadow:1px 1px 0 #0a6e62; }
      #menuLayer .sp-btn-ghost {
        background:transparent;color:#5a8a7a;
        border:1.5px solid rgba(127,242,226,.2);
      }
      #menuLayer .sp-btn-ghost:hover { color:#c8e0d8;border-color:rgba(127,242,226,.4); }

      /* Avatar colour pickers */
      #menuLayer .av-grid { display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px; }
      #menuLayer .av-swatch {
        width:20px;height:20px;border:2px solid transparent;cursor:pointer;
        transition:transform .08s,border-color .08s;
      }
      #menuLayer .av-swatch:hover { transform:scale(1.2); }
      #menuLayer .av-swatch.sel { border-color:#fff4d6;transform:scale(1.15); }

      /* Stats row */
      #menuLayer .stat-row {
        display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;
      }
      #menuLayer .stat-card {
        flex:1;min-width:60px;background:rgba(45,212,191,.06);
        border:1px solid rgba(45,212,191,.15);
        padding:7px 10px;text-align:center;
      }
      #menuLayer .stat-val { font-size:16px;font-weight:bold;color:#7ff2e2;display:block; }
      #menuLayer .stat-lbl { font-size:8px;letter-spacing:1px;color:#5a8a7a;display:block;margin-top:2px; }

      /* Fade-in animation for nav items */
      @keyframes mn-fadein {
        from { opacity:0;transform:translateX(-8px); }
        to   { opacity:1;transform:translateX(0); }
      }
      #menuLayer .mn-item { animation:mn-fadein .22s ease both; }

      /* Animated logo letter-pop */
      @keyframes mll-pop {
        0%   { opacity:0;transform:translateY(8px) scale(0.7); }
        60%  { transform:translateY(-3px) scale(1.1); }
        80%  { transform:translateY(1px) scale(0.97); }
        100% { opacity:1;transform:translateY(0) scale(1); }
      }
      #menuLayer .mll {
        display:inline-block;
        animation:mll-pop .4s cubic-bezier(.22,1,.36,1) both;
        animation-delay:calc(var(--i) * 0.06s);
      }
      /* Subtle pulse on logo every few seconds */
      @keyframes mll-pulse {
        0%,100% { text-shadow:3px 3px 0 #0b1020; }
        50%     { text-shadow:3px 3px 0 #0b1020, 0 0 8px rgba(45,212,191,.5); }
      }
      #menuLogoLetters { animation:mll-pulse 4s ease-in-out 1.5s infinite; }
    </style>
  `;

  const stage = document.getElementById('stage');
  stage.appendChild(el);
  _m8El = el;

  // Size the bg canvas
  const bgCanvas = el.querySelector('#menuBgCanvas');
  function _resizeBgCanvas(){
    bgCanvas.width  = stage.offsetWidth  || 480;
    bgCanvas.height = stage.offsetHeight || 270;
  }
  _resizeBgCanvas();
  window._menuResizeBgCanvas = _resizeBgCanvas;
  window.addEventListener('resize', _resizeBgCanvas);

  // Start title music on first interaction with the menu
  const _onFirstInteract = () => {
    el.removeEventListener('click', _onFirstInteract);
    if (typeof ensureAudio === 'function') ensureAudio();
    if (typeof startTitleMusic === 'function') startTitleMusic();
  };
  el.addEventListener('click', _onFirstInteract);
}

// ─── Nav items definition ─────────────────────────────────────────────────────
function _getNavItems() {
  const onlineCount = (typeof netIsActive === 'function' && netIsActive()) ? 1 : 0;
  return [
    {
      id: 'play', icon: '▶', label: 'PLAY', sub: '1 or 2 players',
      primary: true,
      action: () => {
        menuHide();
        ensureAudio && ensureAudio();
        // Show the legacy banner with mode-select directly — bypass showTitle override
        if (typeof gameState !== 'undefined') gameState = 'title';
        const banner = document.getElementById('banner');
        if (banner) banner.style.display = 'flex';
        if (typeof updateModeButtons === 'function') updateModeButtons();
        if (typeof showTitleArt === 'function') showTitleArt();
        if (typeof updateStatsLine === 'function') updateStatsLine();
        // Ensure all title-screen buttons are visible
        ['titleInfiniteBtn','titleNetBtn','titleEditorBtn','titleCustomizeBtn','titleMpBtn','titleAchBtn','titleScBtn'].forEach(id => {
          const b = document.getElementById(id); if (b) b.style.display = '';
        });
        document.getElementById('primaryBtn').textContent = 'START';
        document.getElementById('secondaryBtn').style.display = '';
        document.getElementById('secondaryBtn').textContent = 'WORLD MAP';
        document.getElementById('modeRow').style.display = '';
      }
    },
    {
      id: 'map', icon: '▦', label: 'WORLD MAP', sub: 'Levels · medals · shop',
      action: () => { menuHide(); if (typeof showMap === 'function') showMap(); }
    },
    {
      id: 'online', icon: '🌐', label: 'ONLINE CO-OP', sub: 'Play with a friend',
      badge: onlineCount ? 'CONNECTED' : null,
      action: () => { if (typeof openNetLobby === 'function') openNetLobby(); }
    },
    {
      id: 'multiplayer', icon: '⚑', label: 'MULTIPLAYER', sub: 'Up to 4 players · room codes',
      action: () => { if (typeof openLobbyUI === 'function') openLobbyUI(); }
    },
    {
      id: 'customize', icon: '🎨', label: 'CUSTOMIZE', sub: 'Outfits · accessories',
      action: () => { if (typeof openCustomizeMenu === 'function') openCustomizeMenu(0); }
    },
    {
      id: 'infinite', icon: '∞', label: 'INFINITE MODE', sub: 'Endless procedural run',
      action: () => {
        menuHide();
        ensureAudio && ensureAudio();
        if (typeof startInfiniteMode === 'function') startInfiniteMode();
      }
    },
    {
      id: 'editor', icon: '✏', label: 'LEVEL EDITOR', sub: 'Build · test · share',
      action: () => { menuHide(); if (typeof openEditor === 'function') openEditor(); }
    },
    {
      id: 'achievements', icon: '★', label: 'ACHIEVEMENTS',
      get sub() {
        const all = typeof achievementGetAll === 'function' ? achievementGetAll() : [];
        const done = all.filter(a => a.unlocked).length;
        return `${done} / ${all.length} unlocked`;
      },
      action: () => { if (typeof openAchievementsPanel === 'function') openAchievementsPanel(); }
    },
    {
      id: 'scorecard', icon: '🏁', label: 'SCORECARD', sub: 'Your stats · share your run',
      action: () => { if (typeof openScorecardPanel === 'function') openScorecardPanel(); }
    },
    {
      id: 'settings', icon: '⚙', label: 'SETTINGS', sub: 'Audio · controls · display',
      action: () => {
        menuHide();
        const banner = document.getElementById('banner');
        if (banner) banner.style.display = 'flex';
        if (typeof showSettingsMenu === 'function') showSettingsMenu('title');
      }
    },
    {
      id: 'news', icon: '📋', label: "WHAT'S NEW", sub: 'Changelog · recent updates',
      action: () => { _menuOpenPanel('news'); }
    },
    {
      id: 'credits', icon: '♥', label: 'CREDITS', sub: 'The team behind the grove',
      action: () => { _menuOpenPanel('credits'); }
    },
  ];
}

// ─── Render main panel ────────────────────────────────────────────────────────
function _renderMainPanel() {
  if (!_m8El) return;

  // Version
  const vTag = _m8El.querySelector('#menuVersion');
  if (vTag) vTag.textContent = (typeof window !== 'undefined' && window.VERSION) || '';

  // Nav
  const nav = _m8El.querySelector('#menuNav');
  nav.innerHTML = '';
  _getNavItems().forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'mn-item' + (item.primary ? ' mn-primary' : '');
    el.style.animationDelay = (i * 0.04) + 's';
    el.innerHTML = `
      <div class="mn-icon">${item.icon}</div>
      <div style="flex:1;min-width:0;">
        <div class="mn-label">${item.label}</div>
        <div class="mn-sub">${item.sub || ''}</div>
      </div>
      ${item.badge ? `<span class="mn-badge">${item.badge}</span>` : ''}
      <span class="mn-arrow">›</span>
    `;
    el.addEventListener('click', item.action);
    nav.appendChild(el);
  });

  // Profile strip
  _renderProfileStrip();

  // Sub-panel — close if open
  const sub = _m8El.querySelector('#menuSubPanel');
  if (sub) sub.style.display = 'none';
}

function _renderProfileStrip() {
  const strip = _m8El?.querySelector('#menuProfileStrip');
  if (!strip) return;
  const profile = menuGetProfile();
  const name     = profile?.name || 'ADVENTURER';
  const color    = profile?.avatarColor || '#2dd4bf';
  const avatarImg = profile?.avatarImg || null;
  const gems     = (typeof save !== 'undefined' && save?.totalGems) || 0;
  const cleared  = (typeof save !== 'undefined' && save?.levelsCleared?.length) || 0;

  const avatarStyle = avatarImg
    ? `background:url(${avatarImg}) center/cover no-repeat;`
    : `background:${color};`;

  strip.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="
        width:28px;height:28px;flex-shrink:0;
        ${avatarStyle}
        border:2px solid rgba(255,244,214,.3);
        display:grid;place-items:center;font-size:14px;
        image-rendering:pixelated;
      ">${avatarImg ? '' : '◉'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;letter-spacing:2px;color:#fff4d6;font-weight:bold;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
        <div style="font-size:8px;letter-spacing:1px;color:#5a8a7a;margin-top:1px;">
          ◆ ${gems} gems · ${cleared} levels cleared
        </div>
      </div>
      <div style="font-size:9px;color:rgba(127,242,226,.35);">›</div>
    </div>
  `;
}

// ─── Profile sub-panel ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#2dd4bf','#ff9a3c','#a855f7','#fb7185',
  '#84cc16','#38bdf8','#fbbf24','#94a3b8',
  '#ef4444','#10b981','#6366f1','#f97316',
];

// ─── News / Credits / generic sub-panel ──────────────────────────────────────
const CHANGELOG = [
  { v:'v17', date:'May 2026', items:[
    'M6.1 Online co-op — WebRTC, partner revive, ping HUD, co-op medals',
    'M6.2 Multiplayer lobby — room codes (PeerJS), 4 players, chat, Gem Hunt, Last One Standing',
    'M6.2 Host admin — kick, transfer host, lock room, password, auto-kick',
    'M6.3 Achievements — 15 badges with pixel-art badge pop-up',
    'M6.3 Scorecard — shareable 480×320 profile card (PNG download)',
    'M6.3 Story cutscenes — intro + 3 biome transitions + ending',
    'M6.3 Seed codes — share infinite runs with PG-XXXXXX codes',
    'M7 Name tags — 6-char tag above player head',
    'M7 HSL colour picker — custom base colour per player',
    'M7 Shoes slot — Boots · Sneakers · Slippers · Heels',
    'M7 Unlock system — medals gate Crown, Wizard Hat, Halo, Antennae, Heels',
    'M7 Landing squash — fall-speed-scaled squash + dust',
    'M8 Title theme — gentle pentatonic melody + warm pad',
    'M8 Animated logo — letter-pop + teal glow pulse',
    'M8 Profile avatar upload — 32×32 custom icon',
    'M8 Changelog panel — this!',
    'M8 Credits screen',
  ]},
  { v:'v16', date:'Earlier', items:[
    'Share codes — ?play= URL boots shared editor maps',
    'M5.5 SHARE URL button in editor',
  ]},
  { v:'v15', date:'Earlier', items:[
    'Level editor — palette, test, save/load, export/import, resize',
  ]},
  { v:'v14', date:'Earlier', items:[
    'Ghost replay — record best run, race a cyan silhouette',
  ]},
  { v:'v13', date:'Earlier', items:[
    'Engine split — physics.js + entities.js refactor',
  ]},
  { v:'v12', date:'Earlier', items:[
    'Puzzle mechanics — crates, levers, keys/locks, conveyors, ice, cannons',
  ]},
  { v:'v11', date:'Earlier', items:[
    'Combat — 3-phase boss, spitter, slime, knight, charge stomp, damage numbers',
  ]},
  { v:'v9', date:'Earlier', items:[
    'Progression — gem shop, medals, per-level stats, refund all',
  ]},
];

const CREDITS = [
  { role: 'DESIGN & CODE',    name: 'The Grove Team' },
  { role: 'ENGINE',           name: 'engine.js · physics.js · entities.js' },
  { role: 'AUDIO',            name: 'audio.js — synth beeps + ambient loops' },
  { role: 'LEVELS',           name: 'levels.js · procgen.js' },
  { role: 'MULTIPLAYER',      name: 'netcode.js · coop.js · lobby.js' },
  { role: 'CUSTOMIZATION',    name: 'customization.js' },
  { role: 'UI & MENU',        name: 'ui.js · menu.js' },
  { role: 'ACHIEVEMENTS',     name: 'achievements.js' },
  { role: 'CUTSCENES',        name: 'cutscenes.js' },
  { role: 'LEVEL EDITOR',     name: 'editor.js' },
  { role: 'SPECIAL THANKS',   name: 'Everyone who plays in the grove ♥' },
];

function _menuOpenPanel(type) {
  const sub = _m8El?.querySelector('#menuSubPanel');
  if (!sub) return;

  if (type === 'news') {
    let html = `<div class="sp-title"><span style="color:#2dd4bf;">📋</span> WHAT'S NEW
      <button class="sp-btn sp-btn-ghost" style="margin-left:auto;font-size:9px;padding:4px 8px;" onclick="_menuCloseSubPanel()">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding-right:4px;">`;

    for (const entry of CHANGELOG) {
      html += `<div style="margin-bottom:14px;">
        <div style="font-size:10px;letter-spacing:2px;color:#ffd866;font-weight:bold;margin-bottom:4px;">
          ${entry.v} <span style="font-size:8px;color:#5a8a7a;font-weight:normal;">— ${entry.date}</span>
        </div>`;
      for (const item of entry.items) {
        html += `<div style="font-size:9px;letter-spacing:1px;color:#c8e0d8;padding:2px 0 2px 10px;border-left:2px solid rgba(45,212,191,.2);">
          ${item}
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    sub.innerHTML = html;

  } else if (type === 'credits') {
    let html = `<div class="sp-title"><span style="color:#2dd4bf;">♥</span> CREDITS
      <button class="sp-btn sp-btn-ghost" style="margin-left:auto;font-size:9px;padding:4px 8px;" onclick="_menuCloseSubPanel()">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;">`;

    // Pixel art title card
    html += `<div style="text-align:center;margin-bottom:14px;">
      <div style="font-size:18px;font-weight:bold;letter-spacing:4px;color:#fff4d6;text-shadow:2px 2px 0 #0b1020;">BLIP&amp;BLOP</div>
      <div style="font-size:8px;letter-spacing:3px;color:#5a8a7a;margin-top:2px;">A TINY GROVE RUN</div>
      <div style="width:30px;height:1px;background:#2dd4bf;margin:6px auto 0;"></div>
    </div>`;

    for (const c of CREDITS) {
      html += `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid rgba(127,242,226,.08);">
        <div style="font-size:8px;letter-spacing:1px;color:#5a8a7a;min-width:90px;flex-shrink:0;">${c.role}</div>
        <div style="font-size:9px;letter-spacing:1px;color:#c8e0d8;">${c.name}</div>
      </div>`;
    }

    html += `<div style="margin-top:14px;text-align:center;font-size:9px;letter-spacing:1px;color:#5a8a7a;">
      Made with ♥ and lots of pixel dust.
    </div></div>`;

    sub.innerHTML = html;
  }

  sub.style.display = 'flex';
  sub.style.flexDirection = 'column';
}

window._menuOpenProfile = function() {
  const sub = _m8El?.querySelector('#menuSubPanel');
  if (!sub) return;
  const profile = menuGetProfile() || { name: '', avatarColor: '#2dd4bf' };
  const gems    = (typeof save !== 'undefined' && save?.totalGems)          || 0;
  const cleared = (typeof save !== 'undefined' && save?.levelsCleared?.length) || 0;
  const best    = (typeof save !== 'undefined' && save?.bestRunTime)        || null;
  const medals  = (typeof save !== 'undefined') ?
    Object.values(save?.medals || {}).reduce((t, m) => t + (m?.length || 0), 0) : 0;

  sub.innerHTML = `
    <div class="sp-title">
      <span style="color:#2dd4bf;">◉</span> PROFILE
      <button class="sp-btn sp-btn-ghost" style="margin-left:auto;font-size:9px;padding:4px 8px;"
        onclick="_menuCloseSubPanel()">✕</button>
    </div>

    <label class="sp-label">DISPLAY NAME</label>
    <input class="sp-input" id="profileNameInput" type="text" maxlength="16"
      placeholder="Enter your name…" value="${profile.name || ''}">

    <label class="sp-label">AVATAR</label>
    <div class="av-grid" id="avGrid">
      ${AVATAR_COLORS.map(c => `
        <div class="av-swatch${c === profile.avatarColor ? ' sel' : ''}"
          style="background:${c};"
          data-color="${c}"
          onclick="_menuPickAvatar('${c}')"></div>
      `).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <div id="avImgPreview" style="
        width:32px;height:32px;border:2px solid rgba(127,242,226,.3);
        image-rendering:pixelated;flex-shrink:0;overflow:hidden;
        ${profile.avatarImg ? `background:url(${profile.avatarImg}) center/cover no-repeat;` : `background:${profile.avatarColor || '#2dd4bf'};`}
        display:grid;place-items:center;font-size:14px;
      ">${profile.avatarImg ? '' : '◉'}</div>
      <label class="sp-btn sp-btn-ghost" style="cursor:pointer;font-size:9px;padding:5px 10px;">
        📁 UPLOAD ICON
        <input type="file" accept="image/*" id="avImgUpload" style="display:none;"
          onchange="_menuAvatarUpload(event)">
      </label>
      <button class="sp-btn sp-btn-ghost" style="font-size:9px;padding:5px 8px;"
        onclick="_menuAvatarClear()">✕</button>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <span class="stat-val">${gems}</span>
        <span class="stat-lbl">GEMS</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">${cleared}</span>
        <span class="stat-lbl">LEVELS</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">${medals}</span>
        <span class="stat-lbl">MEDALS</span>
      </div>
      ${best !== null ? `<div class="stat-card">
        <span class="stat-val" style="font-size:11px;">${typeof fmtTotalTime==='function'?fmtTotalTime(best):best.toFixed(1)+'s'}</span>
        <span class="stat-lbl">BEST RUN</span>
      </div>` : ''}
    </div>

    <div style="display:flex;gap:6px;margin-top:14px;">
      <button class="sp-btn sp-btn-primary" onclick="_menuSaveProfile()">SAVE</button>
    </div>
  `;

  sub.style.display = 'flex';
  sub.style.flexDirection = 'column';

  // Focus the input
  const inp = sub.querySelector('#profileNameInput');
  if (inp) setTimeout(() => inp.focus(), 60);
};

window._menuPickAvatar = function(color) {
  const sub = _m8El?.querySelector('#menuSubPanel');
  if (!sub) return;
  sub.querySelectorAll('.av-swatch').forEach(s => {
    s.classList.toggle('sel', s.dataset.color === color);
  });
  const preview = sub.querySelector('#avImgPreview');
  if (preview && !sub.querySelector('#avImgUpload')?._hasImg) {
    preview.style.background = color;
    preview.textContent = '◉';
  }
};

window._menuAvatarUpload = function(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const sub = _m8El?.querySelector('#menuSubPanel');
    const preview = sub?.querySelector('#avImgPreview');
    if (preview) {
      preview.style.backgroundImage = `url(${ev.target.result})`;
      preview.style.backgroundSize  = 'cover';
      preview.style.backgroundPosition = 'center';
      preview.textContent = '';
      preview.dataset.img = ev.target.result;
    }
    e.target._hasImg = true;
  };
  reader.readAsDataURL(file);
};

window._menuAvatarClear = function() {
  const sub = _m8El?.querySelector('#menuSubPanel');
  const preview = sub?.querySelector('#avImgPreview');
  if (preview) {
    preview.style.backgroundImage = '';
    preview.textContent = '◉';
    delete preview.dataset.img;
  }
  const inp = sub?.querySelector('#avImgUpload');
  if (inp) inp._hasImg = false;
};

window._menuSaveProfile = function() {
  const sub = _m8El?.querySelector('#menuSubPanel');
  if (!sub) return;
  const name  = (sub.querySelector('#profileNameInput')?.value || '').trim().toUpperCase() || 'ADVENTURER';
  const selSwatch = sub.querySelector('.av-swatch.sel');
  const color = selSwatch?.dataset.color || '#2dd4bf';
  const imgEl = sub.querySelector('#avImgPreview');
  const avatarImg = imgEl?.dataset.img || null;
  _saveProfile({ name, avatarColor: color, avatarImg });
  _renderProfileStrip();
  _menuCloseSubPanel();
};

window._menuCloseSubPanel = function() {
  const sub = _m8El?.querySelector('#menuSubPanel');
  if (sub) sub.style.display = 'none';
};

// ─── Background animation ─────────────────────────────────────────────────────
function _startBg() {
  _stopBg();
  function loop() {
    _drawBg();
    _m8BgT    += 0.4;
    _m8HeroT  += 1;
    _m8BgRaf = requestAnimationFrame(loop);
  }
  _m8BgRaf = requestAnimationFrame(loop);
}

function _stopBg() {
  if (_m8BgRaf) { cancelAnimationFrame(_m8BgRaf); _m8BgRaf = null; }
}

function _drawBg() {
  const canvas = _m8El?.querySelector('#menuBgCanvas');
  if (!canvas) return;
  const c   = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  c.imageSmoothingEnabled = false;

  // Zoom in on the hero scene — draw everything at ZOOM× scale
  // centered on the platform area (55% across, 62% down)
  const ZOOM = 4;
  const focusX = W * 0.58; // where we want the platform to appear on screen
  const focusY = H * 0.62;
  const srcX   = W * 0.55; // where platform actually sits in unzoomed coords
  const srcY   = H * 0.62;

  c.save();
  c.translate(focusX, focusY);
  c.scale(ZOOM, ZOOM);
  c.translate(-srcX, -srcY);

  // ── Sky gradient ──
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,   '#0d1a3a');
  sky.addColorStop(0.5, '#0b2040');
  sky.addColorStop(1,   '#1a3a28');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  // ── Stars (static layer) ──
  const stars = [
    [0.12,0.08],[0.28,0.05],[0.44,0.12],[0.6,0.04],[0.75,0.09],[0.88,0.06],
    [0.05,0.18],[0.35,0.16],[0.55,0.20],[0.70,0.14],[0.92,0.18],[0.18,0.25],
    [0.48,0.28],[0.82,0.22],[0.30,0.30],[0.65,0.26],
  ];
  stars.forEach(([fx, fy], i) => {
    const pulse = 0.5 + 0.5 * Math.sin(_m8BgT * 0.04 + i * 1.3);
    c.fillStyle = `rgba(255,244,214,${0.3 + 0.5 * pulse})`;
    c.fillRect(Math.floor(fx * W), Math.floor(fy * H), 1, 1);
  });

  // ── Moon ──
  const moonX = Math.floor(W * 0.82);
  const moonY = Math.floor(H * 0.12);
  c.fillStyle = '#fef3c7';
  c.beginPath(); c.arc(moonX, moonY, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0d1a3a';
  c.beginPath(); c.arc(moonX + 4, moonY - 2, 7, 0, Math.PI * 2); c.fill();

  // ── Distant mountains (parallax layer 1 — slow) ──
  const mOff1 = (_m8BgT * 0.08) % W;
  c.fillStyle = '#1a2e4a';
  for (let rep = -1; rep <= 1; rep++) {
    const ox = rep * W - mOff1;
    _drawMountainRange(c, ox, H, W, H * 0.52, 5, 60, 40);
  }

  // ── Mid hills (parallax layer 2 — medium) ──
  const mOff2 = (_m8BgT * 0.18) % W;
  c.fillStyle = '#1a3a28';
  for (let rep = -1; rep <= 1; rep++) {
    const ox = rep * W - mOff2;
    _drawMountainRange(c, ox, H, W, H * 0.65, 7, 44, 30);
  }

  // ── Foreground ground + platform ──
  const groundY = Math.floor(H * 0.80);
  c.fillStyle = '#0e2218';
  c.fillRect(0, groundY, W, H - groundY);
  c.fillStyle = '#1a4a2a';
  c.fillRect(0, groundY, W, 3);
  c.fillStyle = '#2a6a3a';
  c.fillRect(0, groundY, W, 2);

  // Grass tufts
  for (let gx = 4; gx < W; gx += 18) {
    const gt = Math.floor(gx / 18);
    const wobble = Math.sin(_m8BgT * 0.05 + gt * 0.8) > 0 ? 1 : 0;
    c.fillStyle = '#3a8a4a';
    c.fillRect(gx, groundY - 2 - wobble, 2, 2 + wobble);
    c.fillRect(gx + 3, groundY - 1, 1, 1);
  }

  // Floating platform
  const platX = Math.floor(W * 0.55);
  const platY = Math.floor(H * 0.62);
  const platW = 64;
  c.fillStyle = '#6b3d1f';
  c.fillRect(platX, platY, platW, 8);
  c.fillStyle = '#4aa84a';
  c.fillRect(platX, platY, platW, 3);
  c.fillStyle = '#6bd26b';
  c.fillRect(platX, platY, platW, 2);
  // platform shadow
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.fillRect(platX + 4, platY + 9, platW - 4, 3);

  // ── Animated gems on platform ──
  for (let gi = 0; gi < 3; gi++) {
    const gx  = platX + 8 + gi * 20;
    const gy  = platY - 8 + Math.round(Math.sin(_m8BgT * 0.07 + gi * 2.1) * 2);
    const bcol = gi === 0 ? '#7ff2e2' : gi === 1 ? '#ffd866' : '#ff9a3c';
    c.fillStyle = bcol;
    c.beginPath();
    c.moveTo(gx + 3, gy);
    c.lineTo(gx + 6, gy + 2);
    c.lineTo(gx + 5, gy + 6);
    c.lineTo(gx + 1, gy + 6);
    c.lineTo(gx, gy + 2);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillRect(gx + 2, gy + 1, 2, 1);
  }

  // ── Hero sprites on platform ──
  _drawMenuHero(c, platX + 6,  platY - 15, _m8HeroT, false);
  _drawMenuHero(c, platX + 30, platY - 15, _m8HeroT + 20, true);

  c.restore(); // end zoom
}

function _drawMountainRange(c, offsetX, H, W, baseY, count, maxW, maxH) {
  for (let i = 0; i < count; i++) {
    const mx  = offsetX + (i / count) * W + (i * 23) % 40;
    const mw  = maxW - (i * 7) % 20;
    const mh  = maxH - (i * 11) % 25;
    const mtY = baseY - mh;
    c.beginPath();
    c.moveTo(mx, baseY);
    c.lineTo(mx + mw / 2, mtY);
    c.lineTo(mx + mw, baseY);
    c.closePath();
    c.fill();
  }
}

function _drawMenuHero(c, x, y, t, isP2) {
  // Tiny 12×14 pixel-art hero using the player's current custom palette if available
  let pal;
  if (typeof players !== 'undefined' && players && players[isP2 ? 1 : 0]) {
    pal = players[isP2 ? 1 : 0].pal;
  } else if (typeof OUTFITS !== 'undefined') {
    pal = isP2 ? OUTFITS[1] : OUTFITS[0];
  } else {
    pal = isP2
      ? { base:'#ff9a3c', hi:'#ffd77a', mid:'#ffb04a', shade:'#c46a14', dark:'#7a3f08', outline:'#3a1e04', strap:'#2e1a04', hat:'#d07018' }
      : { base:'#2dd4bf', hi:'#7ff2e2', mid:'#5ae6d1', shade:'#0e8c7d', dark:'#0a6e62', outline:'#083a33', strap:'#1a2e33', hat:'#22a995' };
  }

  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const p = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };

  // idle bob
  const walking   = false;
  const idleBob   = Math.round(Math.sin(t * 0.05));
  const by        = y + idleBob;
  const f         = Math.floor(t / 8) % 4;
  const idlePhase = Math.floor(t / 30) % 8;

  r(x+2, by+2, 8, 10, pal.base);
  r(x+3, by+3, 2, 2, pal.hi);
  r(x+2, by+4, 1, 4, pal.mid);
  r(x+2, by+10, 8, 2, pal.shade);
  r(x+3, by+12, 6, 1, pal.dark);
  r(x+1, by+3, 1, 8, pal.outline);
  r(x+10, by+3, 1, 8, pal.outline);
  r(x+2, by+1, 8, 1, pal.outline);
  r(x+2, by+12, 8, 1, pal.outline);
  p(x+1, by+2, pal.outline); p(x+10, by+2, pal.outline);
  p(x+1, by+11, pal.outline); p(x+10, by+11, pal.outline);

  if (isP2) {
    r(x+2, by,   8, 1, pal.hat);
    r(x+2, by+1, 8, 1, pal.hat);
    r(x+3, by-1, 6, 1, pal.hat);
    p(x+2, by, pal.outline); p(x+9, by, pal.outline);
  } else {
    r(x+5, by-1, 2, 1, pal.hi);
    p(x+5, by-2, pal.outline); p(x+6, by-2, pal.outline);
  }
  r(x+2, by+5, 8, 1, pal.strap);

  // eyes
  r(x+5, by+4, 2, 2, '#fff4d6');
  r(x+8, by+4, 1, 2, '#fff4d6');
  p(x+6, by+4, '#0b1020');

  // legs
  if (idlePhase === 4) {
    r(x+2, by+12, 3, 1, pal.shade); r(x+2, by+13, 3, 1, pal.shade);
    r(x+7, by+13, 3, 1, pal.shade);
  } else {
    r(x+2, by+13, 3, 1, pal.shade);
    r(x+7, by+13, 3, 1, pal.shade);
  }

  // Draw accessory if available
  if (typeof drawAccessory === 'function' && typeof players !== 'undefined' && players?.[isP2 ? 1 : 0]) {
    const pp = players[isP2 ? 1 : 0];
    const savedCtx = typeof ctx !== 'undefined' ? ctx : null;
    // swap ctx to menu bg canvas context temporarily
    if (typeof ctx !== 'undefined') {
      const _old = ctx;
      // We can't swap easily — call drawAccessory only if it uses the module-level ctx
      // Instead: manually replicate the accessory draw with the bg canvas ctx
      _drawAccOnCtx(c, pp.customAcc || 0, x, by, 1, t, pal);
    }
  }
}

// Draw accessory onto an arbitrary canvas context (menu bg)
function _drawAccOnCtx(c, accIdx, x, y, dir, t, pal) {
  if (!accIdx) return;
  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.floor(x), Math.floor(y), w, h); };
  const p = (x, y, col) => { c.fillStyle = col; c.fillRect(Math.floor(x), Math.floor(y), 1, 1); };
  if (accIdx === 1) { // cap
    r(x+1,y-2,10,3,'#c8391a'); r(x+10,y-1,2,1,'#c8391a'); p(x+1,y-2,'#f06040');
  } else if (accIdx === 2) { // crown
    r(x+2,y-3,8,3,'#f0c020'); r(x+2,y-5,2,2,'#f0c020'); r(x+5,y-6,2,3,'#f0c020'); r(x+8,y-5,2,2,'#f0c020');
    p(x+3,y-5,'#e03060'); p(x+6,y-6,'#20d0a0'); p(x+9,y-5,'#4080ff');
  } else if (accIdx === 3) { // wizard
    r(x,y-2,12,2,'#4020a0'); r(x+3,y-3,6,1,'#4020a0'); r(x+4,y-4,4,1,'#5030b8');
    r(x+5,y-7,2,1,'#4020a0'); p(x+5,y-8,'#ffd866');
  } else if (accIdx === 6) { // antennae
    const wL = Math.round(Math.sin(t*0.08)*1);
    const wR = Math.round(Math.sin(t*0.08+1.2)*1);
    r(x+3,y-4+wL,1,4,'#4a3020'); r(x+8,y-4+wR,1,4,'#4a3020');
    r(x+2,y-5+wL,3,2,'#ff6f88'); r(x+7,y-5+wR,3,2,'#7ff2e2');
  } else if (accIdx === 7) { // halo
    const hov = Math.round(Math.sin(t*0.06)*1)-4;
    r(x+1,y+hov,10,1,'#ffd866'); r(x,y+hov+1,12,2,'#ffd866'); r(x+1,y+hov+3,10,1,'#ffd866');
  }
}

// ─── Public override of showTitle ─────────────────────────────────────────────
// Store the old showTitle as _legacyShowTitle so the PLAY item can restore it.
// Then replace showTitle globally so any call (pause → quit, etc.) opens the menu.
if (typeof showTitle === 'function') {
  window._legacyShowTitle = showTitle;
}

// Override showTitle so the new menu always opens instead
window.showTitle = function() {
  // If a game was in progress and we're quitting, let the engine reset state first
  // then show our menu.
  if (typeof gameState !== 'undefined') gameState = 'title';
  const banner = document.getElementById('banner');
  if (banner) banner.style.display = 'none';
  menuShow();
};

// ── Boot takeover ─────────────────────────────────────────────────────────────
// ui.js called the old showTitle() before menu.js loaded and registered its
// override. Now that we're loaded, take over immediately.
(function() {
  if (typeof gameState !== 'undefined' && gameState === 'title') {
    const banner = document.getElementById('banner');
    if (banner) banner.style.display = 'none';
    menuShow();
  }
})();
