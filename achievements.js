/* Blip's Grove — achievements.js  (M6.3)
 *
 * 15 achievements, each with a pixel-art badge pop-up at the bottom of the screen.
 *
 * Public API:
 *   achievementCheck(event, data)  → call from engine/ui on relevant events
 *   achievementGet(id)             → { id, name, desc, icon, unlocked, t }
 *   achievementGetAll()            → all 15 achievement objects
 *   openAchievementsPanel()        → show full achievement list panel
 *   closeAchievementsPanel()       → hide it
 */

'use strict';

// ─── Achievement definitions ──────────────────────────────────────────────────
const ACHIEVEMENTS = [
  // Progression
  { id:'first_clear',    name:'First Steps',       desc:'Clear your first level',                      icon:'✓',  color:'#2dd4bf' },
  { id:'all_clear',      name:'World Beater',       desc:'Clear every level in the game',               icon:'★',  color:'#ffd866' },
  { id:'no_damage_run',  name:'Untouchable',        desc:'Clear a level without taking any damage',      icon:'♥',  color:'#f87171' },
  { id:'speedrun_medal', name:'Flash Boots',        desc:'Earn a speedrun medal on any level',           icon:'⚡', color:'#ffd866' },
  { id:'all_gems',       name:'Gem Hoarder',        desc:'Collect all gems in a single level',           icon:'◆',  color:'#c084fc' },
  // Combat
  { id:'stomp_10',       name:'Stomping Grounds',   desc:'Stomp 10 enemies',                            icon:'👟', color:'#ff9a3c' },
  { id:'combo_6',        name:'Combo King',         desc:'Reach a x6 combo',                            icon:'×6', color:'#ff6f88' },
  { id:'boss_no_damage', name:'Flawless Victory',   desc:'Defeat the boss without getting hit',          icon:'⚑',  color:'#ffd866' },
  { id:'ground_pound',   name:'Ground Pounder',     desc:'KO an enemy with the charge stomp',            icon:'↓',  color:'#ff9a3c' },
  // Exploration
  { id:'secret_room',    name:'Curious Explorer',   desc:'Find your first secret bonus room',            icon:'★',  color:'#2dd4bf' },
  { id:'all_secrets',    name:'Every Nook',         desc:'Find the secret room in every level',          icon:'🗝', color:'#c084fc' },
  { id:'coop_clear',     name:'Better Together',    desc:'Clear a level in online co-op',                icon:'⚑',  color:'#2dd4bf' },
  // Persistence
  { id:'shop_maxout',    name:'Fully Loaded',       desc:'Max out all upgrades in the gem shop',         icon:'◆',  color:'#ffd866' },
  { id:'infinite_10',    name:'Endless Runner',     desc:'Reach floor 10 in Infinite Mode',              icon:'∞',  color:'#c084fc' },
  { id:'best_run',       name:'Personal Best',      desc:'Set a new total-run time record',              icon:'🏁', color:'#ffd866' },
];

// ─── Persistence ──────────────────────────────────────────────────────────────
const ACH_SAVE_KEY = 'blipgrove_achievements_v1';

let _achState = (() => {
  try { return JSON.parse(localStorage.getItem(ACH_SAVE_KEY) || '{}'); }
  catch(e) { return {}; }
})();

function _saveAch() {
  try { localStorage.setItem(ACH_SAVE_KEY, JSON.stringify(_achState)); } catch(e) {}
}

// ─── Public accessors ─────────────────────────────────────────────────────────
function achievementGet(id) {
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;
  return Object.assign({}, def, { unlocked: !!_achState[id], t: _achState[id] || null });
}

function achievementGetAll() {
  return ACHIEVEMENTS.map(a => achievementGet(a.id));
}

// ─── Unlock ───────────────────────────────────────────────────────────────────
function _unlock(id) {
  if (_achState[id]) return false; // already unlocked
  _achState[id] = Date.now();
  _saveAch();
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (def) _showBadgePopup(def);
  return true;
}

// ─── Event checks ─────────────────────────────────────────────────────────────
// Call achievementCheck(event, data) from engine/ui at relevant moments.
// Events:
//   'level_clear'      { levelIdx, noHit, allGems, speedrun, elapsed }
//   'enemy_stomped'    { total }   (pass running total of stomps)
//   'combo_reached'    { combo }
//   'boss_defeated'    { noHit }
//   'ground_pound_ko'  {}
//   'secret_found'     { totalFound }
//   'gem_shop_maxed'   {}
//   'infinite_floor'   { floor }
//   'new_best_run'     {}
//   'coop_level_clear' {}

// Running stomp counter (persisted)
let _stompCount = (() => {
  try { return parseInt(localStorage.getItem('blipgrove_stomp_count') || '0'); } catch(e) { return 0; }
})();
function _addStomp() {
  _stompCount++;
  try { localStorage.setItem('blipgrove_stomp_count', _stompCount); } catch(e) {}
}

function achievementCheck(event, data = {}) {
  switch (event) {
    case 'level_clear':
      _unlock('first_clear');
      if (data.noHit)     _unlock('no_damage_run');
      if (data.allGems)   _unlock('all_gems');
      if (data.speedrun)  _unlock('speedrun_medal');
      // Check all levels cleared
      if (typeof save !== 'undefined' && typeof LEVELS !== 'undefined') {
        const nonInfinite = LEVELS.filter(l => !l._isInfinite && !l._coop);
        if (nonInfinite.every((_, i) => save.levelsCleared && save.levelsCleared.includes(i))) {
          _unlock('all_clear');
        }
        // All secrets
        if (typeof medalsFor === 'function') {
          const allHaveSecret = nonInfinite.every((_, i) => medalsFor(i).includes('secret'));
          if (allHaveSecret) _unlock('all_secrets');
        }
        // Shop maxed
        if (typeof save !== 'undefined' && typeof SHOP_ITEMS !== 'undefined') {
          const allMaxed = SHOP_ITEMS.every(item => (save.upgrades[item.id] || 0) >= item.max);
          if (allMaxed) _unlock('shop_maxout');
        }
      }
      break;

    case 'enemy_stomped':
      _addStomp();
      if (_stompCount >= 10) _unlock('stomp_10');
      break;

    case 'combo_reached':
      if ((data.combo || 0) >= 6) _unlock('combo_6');
      break;

    case 'boss_defeated':
      if (data.noHit) _unlock('boss_no_damage');
      break;

    case 'ground_pound_ko':
      _unlock('ground_pound');
      break;

    case 'secret_found':
      _unlock('secret_room');
      if ((data.totalFound || 0) >= (typeof LEVELS !== 'undefined' ? LEVELS.filter(l => !l._isInfinite && !l._coop).length : 6)) {
        _unlock('all_secrets');
      }
      break;

    case 'gem_shop_maxed':
      _unlock('shop_maxout');
      break;

    case 'infinite_floor':
      if ((data.floor || 0) >= 10) _unlock('infinite_10');
      break;

    case 'new_best_run':
      _unlock('best_run');
      break;

    case 'coop_level_clear':
      _unlock('coop_clear');
      break;
  }
}

// ─── Badge pop-up ─────────────────────────────────────────────────────────────
// Pixel-art style badge slides up from bottom, holds 3s, fades out.
const _BADGE_QUEUE = [];
let   _badgeActive = false;

function _showBadgePopup(def) {
  _BADGE_QUEUE.push(def);
  if (!_badgeActive) _nextBadge();
}

function _nextBadge() {
  if (!_BADGE_QUEUE.length) { _badgeActive = false; return; }
  _badgeActive = true;
  const def = _BADGE_QUEUE.shift();

  let el = document.getElementById('achBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'achBadge';
    el.style.cssText = [
      'position:absolute;left:50%;transform:translateX(-50%) translateY(120px);',
      'bottom:24px;z-index:50;',
      'display:flex;align-items:center;gap:10px;',
      'background:#0b1020;color:#fff4d6;',
      'border:3px solid #ffd866;box-shadow:0 0 0 1px #0b1020,6px 6px 0 #0b1020;',
      'padding:10px 16px;',
      'font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;',
      'pointer-events:none;',
      'transition:transform .35s cubic-bezier(.22,1,.36,1), opacity .3s;',
      'opacity:0;',
    ].join('');
    const stage = document.getElementById('stage') || document.body;
    stage.appendChild(el);
  }

  // Render badge content
  el.innerHTML = `
    <div style="
      width:36px;height:36px;border-radius:4px;
      background:${def.color};display:flex;align-items:center;justify-content:center;
      font-size:18px;flex-shrink:0;border:2px solid #fff4d6;
      box-shadow:2px 2px 0 #0b1020;
    ">${def.icon}</div>
    <div>
      <div style="font-size:8px;letter-spacing:2px;color:#ffd866;margin-bottom:2px;">ACHIEVEMENT UNLOCKED</div>
      <div style="font-size:12px;letter-spacing:1px;font-weight:bold;">${def.name}</div>
      <div style="font-size:9px;letter-spacing:1px;color:#a0c0b0;margin-top:1px;">${def.desc}</div>
    </div>
  `;

  // Animate in
  requestAnimationFrame(() => {
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.opacity   = '1';
  });

  // Hold then slide out
  setTimeout(() => {
    el.style.transform = 'translateX(-50%) translateY(120px)';
    el.style.opacity   = '0';
    setTimeout(() => _nextBadge(), 400);
  }, 3200);
}

// ─── Achievements panel ───────────────────────────────────────────────────────
let _achPanelEl = null;

function openAchievementsPanel() {
  if (_achPanelEl) { _achPanelEl.style.display = 'flex'; _renderAchPanel(); return; }

  const el = document.createElement('div');
  el.id = 'achPanel';
  el.style.cssText = [
    'position:absolute;inset:0;z-index:35;display:flex;',
    'align-items:center;justify-content:center;',
    'background:rgba(11,16,32,.88);',
  ].join('');

  el.innerHTML = `
    <div style="
      background:#fff4d6;color:#1a1322;
      border:4px solid #0b1020;box-shadow:10px 10px 0 #0b1020;
      width:94%;max-width:500px;max-height:90vh;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      display:flex;flex-direction:column;overflow:hidden;
    ">
      <!-- Header -->
      <div style="background:#0b1020;color:#fff4d6;padding:14px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
        <span style="font-size:14px;letter-spacing:3px;font-weight:bold;">★ ACHIEVEMENTS</span>
        <span id="achPanelCount" style="font-size:10px;letter-spacing:1px;background:#ffd866;color:#0b1020;padding:2px 8px;"></span>
        <span style="flex:1;"></span>
        <button onclick="closeAchievementsPanel()" style="
          font-family:inherit;font-size:11px;letter-spacing:1px;
          background:transparent;color:#fff4d6;border:1px solid #fff4d6;
          padding:4px 10px;cursor:pointer;
        ">CLOSE</button>
      </div>
      <!-- List -->
      <div id="achPanelList" style="flex:1;overflow-y:auto;padding:14px 18px;"></div>
    </div>
  `;

  const stage = document.getElementById('stage') || document.body;
  stage.appendChild(el);
  _achPanelEl = el;
  _renderAchPanel();
}

function closeAchievementsPanel() {
  if (_achPanelEl) _achPanelEl.style.display = 'none';
}

function _renderAchPanel() {
  if (!_achPanelEl) return;
  const all      = achievementGetAll();
  const unlocked = all.filter(a => a.unlocked).length;
  const countEl  = _achPanelEl.querySelector('#achPanelCount');
  if (countEl) countEl.textContent = `${unlocked} / ${all.length}`;

  const listEl = _achPanelEl.querySelector('#achPanelList');
  if (!listEl) return;

  listEl.innerHTML = all.map(a => `
    <div style="
      display:flex;align-items:center;gap:10px;
      padding:9px 12px;margin-bottom:6px;
      border:2px solid ${a.unlocked ? a.color : '#c4a860'};
      background:${a.unlocked ? '#fff4d6' : '#f0e8d0'};
      opacity:${a.unlocked ? '1' : '0.55'};
    ">
      <div style="
        width:32px;height:32px;flex-shrink:0;border-radius:3px;
        background:${a.unlocked ? a.color : '#c4a860'};
        display:flex;align-items:center;justify-content:center;
        font-size:16px;border:2px solid ${a.unlocked ? '#fff4d6' : '#b09050'};
      ">${a.unlocked ? a.icon : '?'}</div>
      <div style="flex:1;">
        <div style="font-size:11px;letter-spacing:1px;font-weight:bold;color:${a.unlocked ? '#1a1322' : '#6a5030'};">${a.unlocked ? a.name : '???'}</div>
        <div style="font-size:9px;letter-spacing:1px;color:${a.unlocked ? '#5a4020' : '#8a7040'};margin-top:2px;">${a.desc}</div>
      </div>
      ${a.unlocked ? `<div style="font-size:8px;letter-spacing:1px;color:#0b8c6c;">✓</div>` : ''}
    </div>
  `).join('');
}
