/* Blip's Grove — settings.js
 *
 * Player settings: defaults, localStorage persistence, and accessibility.
 *   - settings object (volumes, toggles, bindings) — load/save/migrate
 *   - Key + gamepad rebinding for both players (DEFAULT_BINDINGS /
 *     DEFAULT_GP_BINDINGS, setBinding(), isPressed())
 *   - cbColor(): colorblind-safe palette remap used by all draw code
 *   - reducedMotion(): kills shake/flash/weather when enabled
 *
 * The settings UI itself lives in ui.js; this file is data + helpers only.
 */

const SETTINGS_KEY = 'blipgrove_settings_v1';

const DEFAULT_BINDINGS = {
  p1: { left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', jump:'Space', dash:'ShiftLeft', action:'KeyE' },
  p2: { left:'KeyA',      right:'KeyD',       up:'KeyW',    down:'KeyS',       jump:'KeyW',  dash:'KeyQ',     action:'KeyR' },
  // Note: P2 has up===jump intentionally (single up/jump key in original layout)
};

const DEFAULT_GP_BINDINGS = {
  p1: { left:14, right:15, up:12, down:13, jump:0, dash:2, action:3 },
  p2: { left:14, right:15, up:12, down:13, jump:0, dash:2, action:3 },
};

const DEFAULT_SETTINGS = {
  volMaster: 0.8,
  volSfx: 0.9,
  volMusic: 0.7,
  colorblind: false,
  reducedMotion: false,
  raceGhost: true,   // M5.3 — show ghost replay of best run
  bindings: DEFAULT_BINDINGS,
  gpBindings: DEFAULT_GP_BINDINGS,
};

function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    const s = JSON.parse(raw);
    // merge with defaults so new fields don't break old saves
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s, {
      bindings: {
        p1: Object.assign({}, DEFAULT_BINDINGS.p1, (s.bindings && s.bindings.p1) || {}),
        p2: Object.assign({}, DEFAULT_BINDINGS.p2, (s.bindings && s.bindings.p2) || {}),
      },
      gpBindings: {
        p1: Object.assign({}, DEFAULT_GP_BINDINGS.p1, (s.gpBindings && s.gpBindings.p1) || {}),
        p2: Object.assign({}, DEFAULT_GP_BINDINGS.p2, (s.gpBindings && s.gpBindings.p2) || {}),
      }
    });
  } catch(e){ return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}

// ---- Settings migration ----
// Legacy keys in priority order (newest first after current):
const LEGACY_SETTINGS_KEYS = [];  // none yet; add 'blipgrove_settings_v0' etc. when bumping
function migrateSettings(){
  if(localStorage.getItem(SETTINGS_KEY)) return;
  for(const oldKey of LEGACY_SETTINGS_KEYS){
    const raw = localStorage.getItem(oldKey);
    if(raw){ try{ localStorage.setItem(SETTINGS_KEY, raw); }catch(e){} return; }
  }
}
migrateSettings();
function saveSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(e){} }

let settings = loadSettings();

// Colorblind-safe palette swap (deuteranopia: avoid red/green confusion).
// Player 1 stays cyan (distinct from gold/yellow). Player 2: gold→bright blue.
// Also remaps any bright-green tile accent to a teal that contrasts with the gold.
const CB_REMAPS = {
  // P2 palette
  '#ff9a3c': '#3b82f6',
  '#ffd77a': '#a8caff',
  '#ffb04a': '#5a9bff',
  '#c46a14': '#1f4dbf',
  '#7a3f08': '#0e2a6e',
  '#3a1e04': '#03113a',
  '#2e1a04': '#03113a',
  '#d07018': '#3068d8',
  // checkpoint/plate yellow
  '#ffd866': '#a8caff',
  '#b8800b': '#1f4dbf',
  // M5.1 sky temple accents (coral/peach → purple-safe tones)
  '#f08a60': '#7a6adf',
  '#f0c080': '#b0a8ff',
  '#a8d8f0': '#d0d8ff',
};
function cbColor(hex){
  if(!settings.colorblind || !hex) return hex;
  const k = hex.toLowerCase();
  return CB_REMAPS[k] || hex;
}

function reducedMotion(){ return !!settings.reducedMotion; }

// Apply binding changes
function setBinding(player, action, code){
  if(!settings.bindings[player]) return;
  settings.bindings[player][action] = code;
  saveSettings();
}
function resetBindings(){
  settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  settings.gpBindings = JSON.parse(JSON.stringify(DEFAULT_GP_BINDINGS));
  saveSettings();
}

// Gamepad binding helpers
function setGpBinding(player, action, btnIdx){
  if(!settings.gpBindings[player]) return;
  settings.gpBindings[player][action] = btnIdx;
  saveSettings();
}
function prettyGpBtn(idx){
  if(idx==null || idx<0) return '—';
  // Standard mapping common labels
  const names = ['A','B','X','Y','LB','RB','LT','RT','SEL','START','LS','RS','▲','▼','◀','▶','HOME'];
  return names[idx] || ('B'+idx);
}

// Pretty-print a key code
function prettyKey(code){
  if(!code) return '—';
  return code.replace(/^Key/,'').replace(/^Digit/,'').replace('Arrow','').replace('Left','L').replace('Right','R').replace('Space','SPC').replace('Shift','SHFT').replace('Control','CTRL');
}

// Lookup helpers used by engine input
function isPressed(keysSet, player, action){
  const code = settings.bindings[player] && settings.bindings[player][action];
  return code ? keysSet.has(code) : false;
}
