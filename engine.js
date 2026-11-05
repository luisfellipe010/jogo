/* Blip's Grove — engine.js
 *
 * The heart of the game. Owns:
 *   - TUNING block: every gameplay constant (gravity, speeds, timings, HP…)
 *   - Global game state: players, enemies, boss, map, camera, particles,
 *     power-ups, gems/shop, timers — read by every other file
 *   - Input: keyboard + gamepad polling, rebindable via settings.js
 *   - loadMap() / level lifecycle, checkpoints, respawn, win/lose
 *   - The fixed-step update loop and top-level draw orchestration
 *
 * Rendering primitives live in entities.js; collision in physics.js;
 * level data in levels.js / procgen.js. Those files read this file's globals.
 */
// ---- TUNING ----
const TS = 18;
const GRAV = 0.55, MAX_FALL = 9;
const MOVE_ACCEL = 0.55, MAX_SPD = 2.6, FRICTION = 0.78;
const JUMP_V = -8.3, DOUBLE_JUMP_V = -7.2;
const COYOTE_MS = 90, JUMP_BUFFER_MS = 130;
const DASH_SPD = 5.5, DASH_MS = 150, DASH_COOLDOWN_MS = 550;
const ENEMY_SPEED = 0.55;
const FLYER_AMP = 22, FLYER_SPEED = 0.02;
const SHOOT_INTERVAL = 1700, BULLET_SPD = 1.6;
const MAX_HP = 100, HIT_DAMAGE = 25;
const HEAD_BOUNCE_V = -9.5;
const MAX_PLAYER_DIST = 260;
const BOSS_HP = 9;
const WALL_SLIDE_V = 1.6;     // slow fall against wall
const WALL_JUMP_VX = 3.6;     // horizontal kick off wall
const WALL_JUMP_VY = -8.0;    // vertical kick off wall
const WALL_JUMP_LOCK_MS = 160; // input lockout after wall jump
const SPEED_MULT = 1.5;
const SPEED_DUR = 8000;
const SHIELD_DUR_MAX = 99999;
const GLIDE_FALL = 1.4;       // capped fall speed while gliding
const MAX_LIVES = 5;
const RESPAWN_MS = 1200;
const PLATE_LINGER_MS = 4000;
// ---- M5.1 Sky Temple tuning ----
const WIND_ACCEL = 0.18;        // horizontal accel per frame standing on/above wind tile
const WIND_DECAY_TILES = 3;     // tiles above wind where accel still applies (linear decay)
const CLOUD_SOLID_MS = 600;     // ms platform stays solid after first touch
const CLOUD_FADE_MS  = 200;     // ms it takes to vanish after solid phase ends
const CLOUD_RESPAWN_MS = 1500;  // ms until it reappears
// ---- M5.2 Combo meter ----
const COMBO_MAX = 6;
const COMBO_EXPIRE_MS = 2500;
const COMBO_COLORS = ['#fff4d6','#ffd866','#ffb04a','#ff9a3c','#ff6f88','#ff3a6a']; // tiers 1-6
const CARRY_PICKUP_RADIUS = 18;
const THROW_VY = -10;
const THROW_VX_MULT = 1.6;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const PIXEL_SCALE = 2; // render at 2× — characters appear twice as large relative to screen
const W = canvas.width / PIXEL_SCALE, H = canvas.height / PIXEL_SCALE; // logical viewport in game units

// Keys tracked by physical KeyboardEvent.code (layout-independent, rebindable)
const keys = new Set();
let keyCaptureCb = null;
function setKeyCapture(cb){ keyCaptureCb = cb; }
window.addEventListener('keydown', e => {
  if(keyCaptureCb){ e.preventDefault(); const cb=keyCaptureCb; keyCaptureCb=null; cb(e.code); return; }
  // Block all game input when the menu overlay is open
  if(typeof menuIsOpen === 'function' && menuIsOpen()) return;
  const blockCodes = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','ShiftLeft','ShiftRight'];
  if (blockCodes.includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Escape') { if(gameState !== 'editor' && gameState !== 'title') togglePause(); }
  if (e.code === 'KeyR') { if(gameState === 'play' || gameState === 'paused') resetLevel(); }
  if (e.code === 'KeyM') { if (gameState==='play') openMap(); else if(gameState !== 'title') toggleMute(); }
});
window.addEventListener('keyup', e => { keys.delete(e.code); });
window.addEventListener('blur', () => keys.clear());

const lastJump = [false,false], lastDash = [false,false];

// ---- GAMEPAD ----
const lastGpButtons = [{}, {}]; // for edge-detection if we ever need it
// Default gamepad bindings (Standard mapping). Index = button index. -1 = unbound.
// p2 uses second connected gamepad if any; otherwise both share gp0.
function defaultGpBindings(){
  return {
    p1: { left:14, right:15, up:12, down:13, jump:0 /*A*/, dash:2 /*X*/, action:3 /*Y*/ },
    p2: { left:14, right:15, up:12, down:13, jump:0,        dash:2,        action:3 },
  };
}
function gpBindings(){
  if(typeof settings === 'object' && settings.gpBindings) return settings.gpBindings;
  return defaultGpBindings();
}
function getGamepadFor(pidx){
  if(typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const list = navigator.getGamepads();
  if(!list) return null;
  let found = [];
  for(let i=0;i<list.length;i++){ if(list[i] && list[i].connected) found.push(list[i]); }
  if(found.length===0) return null;
  if(found.length===1) return found[0]; // both players share single pad
  return found[Math.min(pidx, found.length-1)];
}
function gpPressed(gp, btnIdx){
  if(!gp || btnIdx==null || btnIdx<0) return false;
  const b = gp.buttons[btnIdx];
  if(!b) return false;
  return b.pressed || (typeof b.value==='number' && b.value>0.5);
}
function gpAxis(gp, axisIdx){ if(!gp || !gp.axes || gp.axes.length<=axisIdx) return 0; return gp.axes[axisIdx]; }
function gpLeft(gp, who){
  if(!gp) return false;
  const b = gpBindings()[who];
  return gpPressed(gp, b.left) || gpAxis(gp,0) < -0.4;
}
function gpRight(gp, who){
  if(!gp) return false;
  const b = gpBindings()[who];
  return gpPressed(gp, b.right) || gpAxis(gp,0) > 0.4;
}
function gpUp(gp, who){
  if(!gp) return false;
  const b = gpBindings()[who];
  return gpPressed(gp, b.up) || gpAxis(gp,1) < -0.4;
}
function gpDown(gp, who){
  if(!gp) return false;
  const b = gpBindings()[who];
  return gpPressed(gp, b.down) || gpAxis(gp,1) > 0.4;
}
// Capture next pressed gamepad button (for rebind UI). Returns a Promise-like via callback.
let gpCaptureCb = null;
function setGamepadCapture(cb){ gpCaptureCb = cb; }
function pollGamepadCapture(){
  if(!gpCaptureCb) return;
  if(typeof navigator === 'undefined' || !navigator.getGamepads) return;
  const list = navigator.getGamepads();
  for(let i=0;i<(list?.length||0);i++){
    const gp = list[i]; if(!gp) continue;
    for(let b=0;b<gp.buttons.length;b++){
      if(gpPressed(gp, b)){ const cb=gpCaptureCb; gpCaptureCb=null; cb(b); return; }
    }
  }
}

const EMPTY_INPUT = {left:false,right:false,down:false,jump:false,jumpPressed:false,dash:false,dashPressed:false};

function readInput(i){
  const who = i===0 ? 'p1' : 'p2';

  // ── M6.2 Lobby: multi-player input routing (up to 4 players) ──
  if(typeof lobbyIsActive === 'function' && lobbyIsActive()){
    const mySlot = typeof lobbyGetMySlot === 'function' ? lobbyGetMySlot() : 0;
    const isSpec = typeof lobbyIsSpectator === 'function' && lobbyIsSpectator();
    if(isSpec) return EMPTY_INPUT; // spectators send no input
    if(i === mySlot){
      // Read local input for our own slot
      const gp = getGamepadFor(0);
      const gb = gpBindings()['p1'];
      const left  = isPressed(keys,'p1','left')  || gpLeft(gp,'p1');
      const right = isPressed(keys,'p1','right') || gpRight(gp,'p1');
      const down  = isPressed(keys,'p1','down')  || gpDown(gp,'p1');
      const jumpNow = isPressed(keys,'p1','jump')||isPressed(keys,'p1','up')||gpPressed(gp,gb.jump)||gpUp(gp,'p1');
      const dashNow = isPressed(keys,'p1','dash')||gpPressed(gp,gb.dash);
      const jp = jumpNow && !lastJump[0], dp = dashNow && !lastDash[0];
      lastJump[0] = jumpNow; lastDash[0] = dashNow;
      const inp = {left,right,down,jump:jumpNow,jumpPressed:jp,dash:dashNow,dashPressed:dp};
      // Send to host if we are a guest
      if(!lobbyIsHost() && typeof lobbySendInput==='function') lobbySendInput(inp);
      return inp;
    } else {
      // Other slots: use remote inputs from lobby (host injects for all guests)
      if(lobbyIsHost() && typeof lobbyRemoteInput==='function'){
        const rem = lobbyRemoteInput(i);
        if(rem) return {
          left:!!rem.left, right:!!rem.right, down:!!rem.down,
          jump:!!rem.jump, jumpPressed:!!rem.jumpPressed,
          dash:!!rem.dash, dashPressed:!!rem.dashPressed,
        };
      }
      return EMPTY_INPUT;
    }
  }

  // ── M6.1 Online co-op (2-player WebRTC direct): guest sends its own input; host injects remote for P2 ──
  if(typeof netIsActive === 'function' && netIsActive()){
    if(netIsGuest() && i === 0){
      const gp = getGamepadFor(0);
      const gb = gpBindings()['p1'];
      const left  = isPressed(keys, 'p1', 'left')  || gpLeft(gp, 'p1');
      const right = isPressed(keys, 'p1', 'right') || gpRight(gp, 'p1');
      const down  = isPressed(keys, 'p1', 'down')  || gpDown(gp, 'p1');
      const jumpNow = isPressed(keys, 'p1', 'jump') || isPressed(keys, 'p1', 'up') || gpPressed(gp, gb.jump) || gpUp(gp, 'p1');
      const dashNow = isPressed(keys, 'p1', 'dash') || gpPressed(gp, gb.dash);
      const jp = jumpNow && !lastJump[0], dp = dashNow && !lastDash[0];
      lastJump[0] = jumpNow; lastDash[0] = dashNow;
      const inp = {left,right,down,jump:jumpNow,jumpPressed:jp,dash:dashNow,dashPressed:dp};
      netSendGuestInput(inp);
      return inp;
    }
    if(netIsGuest() && i === 1) return EMPTY_INPUT;
    if(netIsHost() && i === 1){
      const remote = netRemoteInput();
      if(remote) return remote;
      return EMPTY_INPUT;
    }
  }

  const gp = getGamepadFor(i);
  const gb = gpBindings()[who];
  const left  = isPressed(keys, who, 'left')  || gpLeft(gp, who);
  const right = isPressed(keys, who, 'right') || gpRight(gp, who);
  const down  = isPressed(keys, who, 'down')  || gpDown(gp, who);
  const jumpNow = isPressed(keys, who, 'jump') || isPressed(keys, who, 'up') || gpPressed(gp, gb.jump) || gpUp(gp, who);
  const dashNow = isPressed(keys, who, 'dash') || gpPressed(gp, gb.dash);
  const jp = jumpNow && !lastJump[i], dp = dashNow && !lastDash[i];
  lastJump[i] = jumpNow; lastDash[i] = dashNow;
  return {left,right,down,jump:jumpNow,jumpPressed:jp,dash:dashNow,dashPressed:dp};
}


// ---- STATE ----
let map, mapW, mapH;
let players=[];
let enemies, bullets, gems, flag, movers, checkpoints, hiddenBlocks, doors, boss, powerups, plates, gates;
let crates, levers, toggleGates, keys_, locks, conveyors, ice, cannons, cannonBalls;
let clouds=[], windTiles=[]; // M5.1 Sky Temple
let combo = 0, comboExpireT = 0; // M5.2 Combo meter
let carriedKeys = []; // [{color, holder:0/1}]
let cam={x:0,y:0,shake:0};
// Reduced motion fallback (settings.js may override)
if(typeof reducedMotion === 'undefined'){ window.reducedMotion = function(){ return false; }; }
// Weather + transition
let weather=[];
let transition={t:0, dir:0, onMid:null}; // dir: 1=fade-in (cover), -1=fade-out (reveal); t: 0..1
let totalGems=0;
let gameState='title'; // title | play | win | dead | paused | map | levelClear
let particles=[];
let damageNums=[];
let tick=0, lastT=0, hitStop=0;
let respawn1=null, respawn2=null;
let numPlayers=1;
let currentLevel=0;
let inBonusRoom=false;
let bonusReturn=null;
let levelStartTime=0;
let runStartTime=0;       // performance.now() when run started
let runElapsedAtLevel=0;  // accumulated run time at start of current level
let doorCooldown=0;
let lives = MAX_LIVES;
let pendingRespawn = [null,null];
let carry = { holder:-1, held:-1, t:0 };

// Persistence
const SAVE_KEY = 'blipgrove_v4_save';

// ---- Save migration ----
// If we ever bump SAVE_KEY (e.g. to blipgrove_v5_save), call migrateSave()
// before loadSave() to carry forward any data from the old key.
// Old keys in priority order (newest first after current):
const LEGACY_SAVE_KEYS = ['blipgrove_v3_save','blipgrove_v2_save','blipgrove_v1_save'];
function migrateSave(){
  // Already have current key? Nothing to do.
  if(localStorage.getItem(SAVE_KEY)) return;
  // Try to import from a legacy key
  for(const oldKey of LEGACY_SAVE_KEYS){
    const raw = localStorage.getItem(oldKey);
    if(raw){
      try{
        // Copy raw data to new key so loadSave() picks it up with merging
        localStorage.setItem(SAVE_KEY, raw);
        // Leave the old key intact so user can still downgrade
        console.info('[save migration] copied', oldKey, '→', SAVE_KEY);
      } catch(e){}
      return;
    }
  }
}
migrateSave();

let save = loadSave();
function loadSave(){
  const def = {totalGems:0, bestTimes:{}, levelsCleared:[], bestRunTime: undefined, gemsBank:0, upgrades:{}, medals:{}};
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); const m = Object.assign({}, def, s); m.upgrades = Object.assign({heart:0,dash:0,glide:0,life:0,gem2x:0,magnet:0}, m.upgrades||{}); m.medals = m.medals||{}; if(m.gemsBank===undefined) m.gemsBank = m.totalGems||0; return m; }
  catch(e){ return Object.assign({}, def, {upgrades:{heart:0,dash:0,glide:0,life:0,gem2x:0,magnet:0}}); }
}
function persist(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e){} }

// --- Upgrade catalog & helpers ---
const SHOP_ITEMS = [
  { id:'heart',  name:'Extra Heart',     desc:'+25 max HP per level (stack 3)', max:3, cost:[40,80,140] },
  { id:'dash',   name:'Faster Dash',     desc:'−25% dash cooldown',             max:1, cost:[60] },
  { id:'glide',  name:'Glide Leaf',      desc:'Glide always available',          max:1, cost:[80] },
  { id:'life',   name:'Extra Life',      desc:'+1 starting life (stack 3)',      max:3, cost:[30,60,100] },
  { id:'gem2x',  name:'Double Gems',     desc:'Pickups give 2 gems',             max:1, cost:[100] },
  { id:'magnet', name:'Gem Magnet',      desc:'Gems pull toward you',            max:1, cost:[50] },
];
function shopItemCost(item){ const lvl = save.upgrades[item.id]||0; return lvl<item.max ? item.cost[lvl] : null; }
function buyUpgrade(id){
  const item = SHOP_ITEMS.find(s=>s.id===id); if(!item) return false;
  const cost = shopItemCost(item); if(cost===null) return false;
  if((save.gemsBank||0) < cost) return false;
  save.gemsBank -= cost;
  save.upgrades[id] = (save.upgrades[id]||0) + 1;
  persist();
  return true;
}
function refundAllUpgrades(){
  let total = 0;
  for(const item of SHOP_ITEMS){
    const lvl = save.upgrades[item.id]||0;
    for(let i=0;i<lvl;i++) total += item.cost[i];
    save.upgrades[item.id] = 0;
  }
  save.gemsBank += total;
  persist();
  return total;
}
function upLvl(id){ return save.upgrades[id]||0; }

// --- Medal tracking (per-run, reset at level start) ---
let runHurtLvl = false;
let runDeathLvl = false;
const MEDAL_KEYS = ['clear','noDamage','allGems','speedrun','secret'];
const MEDAL_LABELS = { clear:'CLEAR', noDamage:'NO-HIT', allGems:'100%', speedrun:'SPEED', secret:'SECRET' };
const MEDAL_GLYPHS = { clear:'✓', noDamage:'♥', allGems:'♦', speedrun:'⚡', secret:'★' };
const SPEEDRUN_TARGETS = { 0:30, 1:40, 2:45, 3:35, 4:55, 5:50 }; // seconds (level 5 = sky temple)
function medalsFor(lvl){ return save.medals[lvl] || []; }
function awardMedal(lvl, key){
  const cur = save.medals[lvl] || [];
  if(!cur.includes(key)){ cur.push(key); save.medals[lvl] = cur; persist(); return true; }
  return false;
}

const P1_PAL = { base:'#2dd4bf', hi:'#7ff2e2', mid:'#5ae6d1', shade:'#0e8c7d', dark:'#0a6e62', outline:'#083a33', strap:'#1a2e33', hat:'#22a995' };
const P2_PAL = { base:'#ff9a3c', hi:'#ffd77a', mid:'#ffb04a', shade:'#c46a14', dark:'#7a3f08', outline:'#3a1e04', strap:'#2e1a04', hat:'#d07018' };

function currentBiome(){ return inBonusRoom ? 'bonus' : (LEVELS[currentLevel].isBoss ? 'boss' : LEVELS[currentLevel].biome); }

function loadMap(rows){
  map = rows.map(r => r.split(''));
  mapH = map.length; mapW = map[0].length;
  enemies=[]; bullets=[]; gems=[]; particles=[]; damageNums=[]; movers=[]; checkpoints=[]; hiddenBlocks=[]; doors=[]; boss=null; powerups=[]; plates=[]; gates=[];
  crates=[]; levers=[]; toggleGates=[]; keys_=[]; locks=[]; conveyors=[]; ice=[]; cannons=[]; cannonBalls=[]; carriedKeys=[];
  clouds=[]; windTiles=[];
  totalGems=0; hitStop=0; cam.shake=0; flag=null;
  let spawn={x:0,y:0};
  for(let y=0;y<mapH;y++){
    for(let x=0;x<mapW;x++){
      const c=map[y][x], px=x*TS, py=y*TS;
      if(c==='@'){ spawn={x:px,y:py}; map[y][x]='.'; }
      else if(c==='S'){ enemies.push({kind:'slug',x:px+3,y:py+2,w:12,h:14,vx:-ENEMY_SPEED,vy:0,onGround:false,alive:true,squishT:0,frame:0}); map[y][x]='.'; }
      else if(c==='V'){ enemies.push({kind:'flyer',x:px,y:py,baseY:py,w:12,h:10,vx:-0.5,vy:0,t:Math.random()*Math.PI*2,alive:true,squishT:0,frame:0}); map[y][x]='.'; }
      else if(c==='T'){ enemies.push({kind:'turret',x:px+3,y:py+2,w:12,h:14,vx:0,vy:0,onGround:false,alive:true,squishT:0,shootAt:performance.now()+700,frame:0}); map[y][x]='.'; }
      else if(c==='W'){ enemies.push({kind:'spitter',x:px+2,y:py,w:14,h:14,vx:0,vy:0,onGround:false,alive:true,squishT:0,shootAt:performance.now()+1200,telegraphT:0,frame:0,facing:-1}); map[y][x]='.'; }
      else if(c==='Y'){ enemies.push({kind:'slime',x:px+2,y:py+2,w:12,h:12,vx:-1.4,vy:0,onGround:false,alive:true,squishT:0,size:2,bounceT:0,frame:0,hp:1}); map[y][x]='.'; }
      else if(c==='N'){ enemies.push({kind:'knight',x:px+2,y:py+1,w:14,h:15,vx:-1.0,vy:0,onGround:false,alive:true,squishT:0,frame:0,hp:1,facing:-1,sparkT:0}); map[y][x]='.'; }
      else if(c==='G'){ gems.push({x:px+TS/2,y:py+TS/2,alive:true,bob:Math.random()*Math.PI*2}); totalGems++; map[y][x]='.'; }
      else if(c==='F'){ flag={x:px,y:py}; map[y][x]='.'; }
      else if(c==='M'){ movers.push({x:px,y:py,w:TS*4,h:8,baseX:px,range:40,t:Math.random()*Math.PI*2,dx:0}); map[y][x]='.'; }
      else if(c==='C'){ checkpoints.push({x:px,y:py,active1:false,active2:false}); map[y][x]='.'; }
      else if(c==='?'){ hiddenBlocks.push({x:px,y:py,used:false,bumpT:0,kind:powerupForBlock(x,y)}); }
      else if(c==='D'){ doors.push({x:px,y:py,kind:'enter'}); map[y][x]='.'; }
      else if(c==='X'){ doors.push({x:px,y:py,kind:'exit'}); map[y][x]='.'; }
      else if(c==='K'){ boss={x:px,y:py,w:24,h:30,hp:BOSS_HP,phase:0,actT:performance.now()+1800,actKind:null,telegraphT:0,hurtT:0,jumpT:performance.now()+2400,vy:0,onGround:false,alive:true,slamT:0}; map[y][x]='.'; }
      else if(c==='1'||c==='2'){ plates.push({x:px,y:py+TS-4,w:TS,h:4,id:c,active:false,lastOnT:0}); map[y][x]='.'; }
      else if(c==='['||c===']'){ gates.push({x:px,y:py,w:TS,h:TS,open:false,opening:0}); }
      else if(c==='O'){ crates.push({x:px+1,y:py+1,w:TS-2,h:TS-2,vx:0,vy:0,onGround:false,carried:false,thrown:0}); map[y][x]='.'; }
      else if(c==='L'){ levers.push({x:px,y:py,w:TS,h:TS,on:false,cool:0}); map[y][x]='.'; }
      else if(c==='J'){ toggleGates.push({x:px,y:py,w:TS,h:TS,open:false,opening:0}); }
      else if(c==='k'){ const col=keyColorAt(x,y); keys_.push({x:px+3,y:py+3,w:TS-6,h:TS-6,color:col,bob:Math.random()*Math.PI*2,carried:false}); map[y][x]='.'; }
      else if(c==='l'){ const col=keyColorAt(x,y); locks.push({x:px,y:py,w:TS,h:TS,color:col,opening:0,open:false}); }
      else if(c==='q'){ conveyors.push({x:px,y:py,w:TS,h:TS,dir:-1}); /* keep as solid floor: leave map[y][x] as 'q' for solid lookup */ }
      else if(c==='e'){ conveyors.push({x:px,y:py,w:TS,h:TS,dir:1}); }
      else if(c==='i'){ ice.push({x:px,y:py,w:TS,h:TS}); }
      else if(c==='n'){ const dir=cannonDirAt(x,y); cannons.push({x:px,y:py,w:TS,h:TS,dir,nextShot:performance.now()+1500+Math.random()*500,kickT:0}); }
      else if(c==='>'||c==='<'){ windTiles.push({x:px,y:py,w:TS,h:TS,dir:c==='>'?1:-1}); }
      else if(c==='c'){ clouds.push({x:px,y:py,w:TS*3,h:6,touchT:0,state:'solid',respawnT:0}); map[y][x]='.'; }
    }
  }
  // reset weather so the new biome re-seeds on next frame
  weather = [];
  return spawn;
}

function startLevel(idx){
  currentLevel = idx;
  inBonusRoom = false;
  bonusReturn = null;
  lives = MAX_LIVES + upLvl('life');
  runHurtLvl = false;
  runDeathLvl = false;
  pendingRespawn = [null,null];
  combo = 0; comboExpireT = 0;
  carry = { holder:-1, held:-1, t:0 };
  const spawn = loadMap(LEVELS[idx].map);
  respawn1 = null; respawn2 = null;
  spawnPlayers(spawn);
  // M5.3 Ghost — start recording P1, load previous ghost for playback
  ghostStartRecording(idx);
  ghostStartPlayback(idx);
  // M6.1 Co-op — reset per-level tracking
  if(typeof coopOnLevelStart==='function') coopOnLevelStart();
  // Run-timer: reset on level 0, otherwise accumulate previous level's elapsed
  if(idx === 0){
    runStartTime = performance.now();
    runElapsedAtLevel = 0;
  } else if(levelStartTime){
    runElapsedAtLevel = runElapsedAtLevel + (performance.now() - levelStartTime)/1000;
  }
  levelStartTime = performance.now();
  document.getElementById('levelTag').textContent = `LEVEL ${idx+1} · ${LEVELS[idx].name}`;
  hideBanner();
  gameState = 'play';
  if(!muted) startMusic(currentBiome());
  toast(`LEVEL ${idx+1} — ${LEVELS[idx].name}`);
  // ── Online co-op: notify guest of level change ──
  if(typeof netSendLevelChange === 'function' && typeof netIsHost === 'function' && netIsHost()){
    netSendLevelChange(idx);
  }
}
function resetLevel(){
  if(gameState==='map') return;
  startLevel(currentLevel);
}
function spawnPlayers(spawn){
  players = [];
  players.push(makePlayer(0, respawn1 || spawn, P1_PAL));
  if(numPlayers===2) players.push(makePlayer(1, respawn2 || {x:spawn.x+16,y:spawn.y}, P2_PAL));
  // M6.2: support P3 and P4 from lobby palettes
  if(numPlayers>=3 && typeof LOBBY_PALETTES!=='undefined'){
    players.push(makePlayer(2, {x:spawn.x+32,y:spawn.y}, LOBBY_PALETTES[2]));
  }
  if(numPlayers>=4 && typeof LOBBY_PALETTES!=='undefined'){
    players.push(makePlayer(3, {x:spawn.x+48,y:spawn.y}, LOBBY_PALETTES[3]));
  }
  updateHud();
}
function playerMaxHp(){ return MAX_HP + upLvl('heart')*HIT_DAMAGE; }
function playerDashCooldown(){ return upLvl('dash') ? DASH_COOLDOWN_MS*0.75 : DASH_COOLDOWN_MS; }
function makePlayer(idx,spawn,pal){
  const hp = playerMaxHp();
  const hasGlide = upLvl('glide')>0;
  const p = {idx,pal,x:spawn.x,y:spawn.y,w:12,h:14,vx:0,vy:0,onGround:false,dir:1,walkFrame:0,idleT:Math.random()*100,sx:1,sy:1,hp,maxHp:hp,iFrames:0,coyote:0,jumpBuf:0,canDouble:false,dashTime:0,dashCool:0,dashDir:1,gems:0,ridingMover:null,hitWall:false,wallSide:0,wallSlide:false,wallJumpLock:0,powerup:hasGlide?'glide':null,powerupT:hasGlide?Infinity:0,gliding:false,carried:false,heldBy:-1,holdT:0,dead:false,chargeT:0,charged:false,crateHeld:null,hasKey:null,customAcc:0,customFace:null,customIdleAnim:0};
  // M7: apply saved customization (palette override + accessory + idle anim)
  if(typeof applyCustomToPlayer === 'function') applyCustomToPlayer(p);
  return p;
}

// ---- physics: isSolidChar/keyColorAt/cannonDirAt/tileAt/solidAt/hazardAt/rectsOverlap/aabb live in physics.js ----

// ---- physics: moveX/moveY live in physics.js ----

// Net broadcast throttle — send state ~20 times per second
let _netSnapTick = 0;
let _netPingTick = 0;
function update(dt){
  tick++;
  pollGamepadCapture();

  // Transition ticks regardless of game state — needed for level-clear → next level
  if(transition.dir!==0){
    transition.t += transition.dir * (dt/350);
    if(transition.dir>0 && transition.t>=1){
      transition.t=1;
      if(transition.onMid){ const cb=transition.onMid; transition.onMid=null; cb(); transition.dir=-1; }
      else transition.dir=0;
    }
    if(transition.dir<0 && transition.t<=0){ transition.t=0; transition.dir=0; }
  }

  if(gameState!=='play') return;
  // Extra guard: never update game logic while the menu overlay is open
  if(typeof menuIsOpen === 'function' && menuIsOpen()) return;
  if(hitStop>0){ hitStop-=dt; return; }

  // ── M6.2 Lobby: multi-player snapshot broadcast / receive ──
  if(typeof lobbyIsActive === 'function' && lobbyIsActive()){
    if(lobbyIsHost()){
      _netSnapTick++;
      if(_netSnapTick % (typeof LOBBY_SNAP_INTERVAL!=='undefined'?LOBBY_SNAP_INTERVAL:3) === 0){
        const snap = netBuildSnap();
        if(snap) lobbySendHostSnap(snap);
      }
      // Tick Last One Standing hazard escalation
      if(typeof lobbyIsLosActive==='function' && lobbyIsLosActive() && typeof lobbyTickLOS==='function') lobbyTickLOS();
      // Tick Gem Hunt — sync host player's gem count
      if(typeof lobbyGetMode==='function' && lobbyGetMode()==='gemhunt' && typeof lobbyGemHuntAddGem==='function'){
        // Scores are updated on gem pickup via lobbyGemHuntAddGem() called in gem collection block
      }
    } else if(!lobbyIsSpectator()){
      const snap = typeof lobbyGetLatestSnap==='function' ? lobbyGetLatestSnap() : null;
      if(snap) netApplySnap(snap);
    }
    _netPingTick++;
    if(_netPingTick % 60 === 0 && typeof lobbyPingAll==='function') lobbyPingAll();
    if(typeof lobbyUpdateSpectatorOverlay==='function') lobbyUpdateSpectatorOverlay();
  }

  // ── M6.1 Online co-op: host broadcasts state; guest applies snapshots ──
  if(typeof netIsActive === 'function' && netIsActive()){
    if(netIsHost()){
      _netSnapTick++;
      if(_netSnapTick % 3 === 0){ // every 3 ticks ≈ 20/s at 60fps
        const snap = netBuildSnap();
        if(snap) netSendHostState(snap);
      }
    } else if(netIsGuest()){
      const snap = netGetLatestSnap();
      if(snap) netApplySnap(snap);
    }
    // Ping once per second (~60 ticks)
    _netPingTick++;
    if(_netPingTick % 60 === 0 && typeof coopSendPing === 'function') coopSendPing();
  }

  // M5.2: combo expiry
  if(combo > 0 && performance.now() > comboExpireT){ resetCombo(); }
  // M5.3: record P1 position this frame, advance ghost playback
  ghostRecordFrame(players[0]);
  ghostUpdate();
  for(const m of movers){ m.t+=0.02; const nx=m.baseX+Math.sin(m.t)*m.range; m.dx=nx-m.x; m.x=nx; }

  for(const p of players){ if(!p.dead && !p.carried) updatePlayer(p,dt); }

  // process pending respawns
  for(let i=0;i<players.length;i++){
    if(pendingRespawn[i] && performance.now() >= pendingRespawn[i].at){
      const sp = (i===0 ? respawn1 : respawn2) || (i===0 ? {x:60,y:120} : {x:76,y:120});
      const p = players[i];
      p.dead=false; p.x=sp.x; p.y=sp.y; p.vx=0; p.vy=0; p.hp=p.maxHp||MAX_HP; p.iFrames=80;
      pendingRespawn[i]=null;
      sfxCheckpoint();
      for(let k=0;k<14;k++) particles.push({x:p.x+p.w/2,y:p.y+p.h/2,vx:(Math.random()-0.5)*3,vy:-Math.random()*2.5-0.5,life:36,color:p.pal.hi});
      updateHud();
    }
  }

  // ── Online co-op: partner revive (host-authoritative) ──
  if(typeof netIsHost==='function' && netIsHost() && players.length===2){
    const [a,b] = players;
    if(!a.dead && b.dead && typeof coopTryRevive==='function') coopTryRevive(a, b, dt);
    if(!b.dead && a.dead && typeof coopTryRevive==='function') coopTryRevive(b, a, dt);
  }
  // ── Co-op HUD refresh ──
  if(typeof netIsActive==='function' && netIsActive() && typeof coopUpdateHud==='function') coopUpdateHud();

  // partner head bounce + carry handling
  if(players.length===2 && !players[0].dead && !players[1].dead && !players[0].carried && !players[1].carried){
    const [a,b]=players;
    if(aabb(a,b)){ tryHeadBounce(a,b); tryHeadBounce(b,a); }
  }
  // carried player rides on top of holder
  if(carry.held>=0){
    const holder=players[carry.holder], held=players[carry.held];
    if(holder && held && !holder.dead){
      held.x = holder.x; held.y = holder.y - held.h - 1;
      held.vx=0; held.vy=0;
      held.holdT += dt;
    } else { carry.holder=-1; carry.held=-1; }
  }

  // enemies
  for(const e of enemies){
    if(!e.alive){ if(e.squishT>0) e.squishT--; continue; }
    if(e.kind==='slug'){
      e.hitWall=false; moveX(e,e.vx);
      e.vy+=GRAV; if(e.vy>MAX_FALL) e.vy=MAX_FALL;
      moveY(e,e.vy);
      if(e.hitWall) e.vx=-e.vx;
      if(e.onGround){
        const fy=Math.floor((e.y+e.h+2)/TS);
        const px=Math.floor((e.vx<0?e.x-1:e.x+e.w+1)/TS);
        if(!solidAt(px,fy)) e.vx=-e.vx;
      }
      e.frame+=0.1;
    } else if(e.kind==='flyer'){
      e.t+=FLYER_SPEED*16; e.x+=e.vx;
      e.y=e.baseY+Math.sin(e.t)*FLYER_AMP;
      if(e.x<0||e.x>mapW*TS-e.w||solidAt(Math.floor((e.vx<0?e.x:e.x+e.w)/TS),Math.floor((e.y+e.h/2)/TS))) e.vx=-e.vx;
      e.frame+=0.15;
    } else if(e.kind==='turret'){
      e.vy+=GRAV; if(e.vy>MAX_FALL) e.vy=MAX_FALL;
      moveY(e,e.vy); e.frame+=0.05;
      if(performance.now()>e.shootAt){
        e.shootAt=performance.now()+SHOOT_INTERVAL;
        const tgt=nearestPlayerTo(e.x,e.y);
        if(tgt){ const dir=tgt.x<e.x?-1:1; bullets.push({x:e.x+e.w/2,y:e.y+4,vx:dir*BULLET_SPD,vy:0,w:4,h:4,life:280}); sfxShoot(); }
      }
    } else if(e.kind==='spitter'){
      e.vy+=GRAV; if(e.vy>MAX_FALL) e.vy=MAX_FALL;
      moveY(e,e.vy); e.frame+=0.06;
      const tgt=nearestPlayerTo(e.x,e.y);
      if(tgt){ e.facing = tgt.x<e.x ? -1 : 1; }
      // wind-up telegraph then arc spit
      if(e.telegraphT>0){ e.telegraphT--; if(e.telegraphT===0 && tgt){
        // arc projectile aimed at target — solve for vx,vy with fixed gravity
        const sx = e.x+e.w/2, sy = e.y+2;
        const tx = tgt.x+tgt.w/2, ty = tgt.y+tgt.h/2;
        const dx = tx-sx, dy = ty-sy;
        const T = 60; // frames flight time
        const g = 0.18;
        const vx = dx/T;
        const vy = (dy - 0.5*g*T*T)/T;
        bullets.push({x:sx,y:sy,vx,vy,w:5,h:5,life:T+30,arc:true,g});
        sfxShoot();
      }}
      else if(performance.now()>e.shootAt){
        e.shootAt=performance.now()+2200+Math.random()*600;
        e.telegraphT = 36; // ~0.6s wind-up
      }
    } else if(e.kind==='slime'){
      e.vy+=GRAV; if(e.vy>MAX_FALL) e.vy=MAX_FALL;
      e.hitWall=false; moveX(e,e.vx);
      moveY(e,e.vy);
      if(e.hitWall) e.vx=-e.vx;
      // bounce if landed
      if(e.onGround){
        e.bounceT = (e.bounceT||0) - 1;
        if(e.bounceT<=0){ e.vy = -3.6 - (e.size===2?0.8:0); e.bounceT = 18 + (e.size===1?6:0); sfxBump && sfxBump(); }
      }
      e.frame+=0.12;
    } else if(e.kind==='knight'){
      e.vy+=GRAV; if(e.vy>MAX_FALL) e.vy=MAX_FALL;
      e.hitWall=false; moveX(e,e.vx);
      moveY(e,e.vy);
      if(e.hitWall){ e.vx=-e.vx; e.facing = e.vx<0?-1:1; }
      if(e.onGround){
        const fy=Math.floor((e.y+e.h+2)/TS);
        const px=Math.floor((e.vx<0?e.x-1:e.x+e.w+1)/TS);
        if(!solidAt(px,fy)){ e.vx=-e.vx; e.facing = e.vx<0?-1:1; }
      }
      e.frame+=0.1;
      if(e.sparkT>0) e.sparkT--;
    }
    for(const p of players){
      if(p.dead || p.carried) continue;
      if(aabb(p,e)){
        const stomping = p.vy>1 && (p.y+p.h)-e.y<10;
        if(e.kind==='knight'){
          // shielded knight: only takes damage from behind (player on opposite side of facing)
          // facing=-1 means knight looks left, shield on left → vulnerable from right
          const playerOnRight = (p.x+p.w/2) > (e.x+e.w/2);
          const shieldedSide = e.facing<0; // shield on left if facing left
          const fromBehind = (shieldedSide && playerOnRight) || (!shieldedSide && !playerOnRight);
          if(stomping && fromBehind){
            e.alive=false; e.squishT=20; p.vy=JUMP_V*0.7; p.canDouble=true;
            spawnDust(e.x+e.w/2,e.y+e.h,10); sfxStomp(); hitStop=60; cam.shake=Math.max(cam.shake,4);
            enemyKilled(e.x+e.w/2, e.y, 'KO');
          } else if(stomping){
            // bounced off shield
            p.vy=JUMP_V*0.6; p.canDouble=true;
            e.sparkT = 14;
            spawnSpark(p.x+p.w/2, e.y, 8, '#7ff2e2');
            sfxBump && sfxBump();
            hitStop=20;
          } else if(p.iFrames<=0){
            // touching from side: hit unless behind+contacting
            if(fromBehind){
              e.alive=false; e.squishT=20;
              spawnDust(e.x+e.w/2,e.y+e.h,10); sfxStomp();
              enemyKilled(e.x+e.w/2, e.y, 'KO');
            } else { hurtPlayer(p,e.x+e.w/2); }
          }
        } else if(e.kind==='slime' && stomping){
          e.alive=false; e.squishT=20; p.vy=JUMP_V*0.7; p.canDouble=true;
          spawnDust(e.x+e.w/2,e.y+e.h,8); sfxStomp(); hitStop=40; cam.shake=Math.max(cam.shake,3);
          enemyKilled(e.x+e.w/2, e.y, null);
          // split if size 2
          if(e.size===2){
            for(const dx of [-1,1]){
              enemies.push({kind:'slime',x:e.x,y:e.y,w:8,h:8,vx:dx*1.6,vy:-2,onGround:false,alive:true,squishT:0,size:1,bounceT:8,frame:0,hp:1});
            }
          }
        } else if(stomping){
          e.alive=false; e.squishT=20; p.vy=JUMP_V*0.7; p.canDouble=true;
          spawnDust(e.x+e.w/2,e.y+e.h,10); sfxStomp(); hitStop=40; cam.shake=Math.max(cam.shake,3);
          enemyKilled(e.x+e.w/2, e.y, null);
        } else if(p.iFrames<=0){ hurtPlayer(p,e.x+e.w/2); }
      }
    }
  }

  // boss — three phases, each with telegraphed attacks
  if(boss && boss.alive){
    boss.vy+=GRAV; if(boss.vy>MAX_FALL) boss.vy=MAX_FALL;
    moveY(boss,boss.vy);
    if(boss.hurtT>0) boss.hurtT--;
    // slam landing detection: when slam is active and boss touches ground, fire shockwave
    if(boss.slamT>0){
      boss.slamT--;
      if(boss.onGround && boss.vy>=0 && !boss._slamLanded){
        boss._slamLanded = true; boss._slamFire = true;
      }
    } else { boss._slamLanded = false; }
    // determine phase from HP (1=full→2/3, 2=2/3→1/3, 3=1/3→0)
    const phase = boss.hp > BOSS_HP*2/3 ? 1 : boss.hp > BOSS_HP/3 ? 2 : 3;
    if(boss.phase !== phase){
      boss.phase = phase;
      toast(phase===2?'PHASE 2':phase===3?'FINAL PHASE':'');
      // phase-change burst
      for(let i=0;i<24;i++) particles.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4-1,life:36,color:phase===3?'#ff6f88':'#ffd866'});
    }
    // telegraph countdown → resolve attack
    if(boss.telegraphT>0){
      boss.telegraphT--;
      if(boss.telegraphT===0){ resolveBossAttack(boss); }
    } else if(performance.now()>boss.actT){
      // pick next attack based on phase
      const opts = phase===1 ? ['spread','jump'] : phase===2 ? ['spread','slam','jump'] : ['slam','minions','spread'];
      boss.actKind = opts[Math.floor(Math.random()*opts.length)];
      boss.telegraphT = boss.actKind==='slam'?40 : boss.actKind==='minions'?50 : 30;
      boss.actT = performance.now() + 1400 + Math.random()*900 - phase*150;
    }
    // jump action: do it instantly when picked
    if(boss.telegraphT===0 && boss.actKind==='jump' && boss.onGround && performance.now()>boss.jumpT){
      boss.vy=-7; boss.jumpT=performance.now()+2200; boss.actKind=null;
    }
    // collide
    for(const p of players){
      if(p.dead || p.carried) continue;
      if(aabb(p,boss)){
        if(p.vy>1 && (p.y+p.h)-boss.y<14 && boss.hurtT<=0){
          boss.hp--; boss.hurtT=40;
          p.vy=JUMP_V*0.85; p.canDouble=true;
          sfxBossHit(); cam.shake=Math.max(cam.shake,10); hitStop=120;
          enemyKilled(boss.x+boss.w/2, boss.y, '1');
          for(let i=0;i<20;i++) particles.push({x:boss.x+boss.w/2,y:boss.y,vx:(Math.random()-0.5)*4,vy:-Math.random()*3,life:30,color:'#ffb04a'});
          if(boss.hp<=0){
            boss.alive=false;
            for(let i=0;i<60;i++) particles.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5-1,life:50+Math.random()*30,color:Math.random()<0.5?'#ffd866':'#ff6f88'});
            sfxWin(); toast('BOSS DEFEATED!');
            // Achievement: boss no-damage
            if(typeof achievementCheck==='function') achievementCheck('boss_defeated', { noHit: !runHurtLvl });
          }
        } else if(p.iFrames<=0){ hurtPlayer(p, boss.x+boss.w/2); }
      }
    }
    // shockwave: damage if grounded player within range when slam lands
    if(boss._slamFire){
      boss._slamFire = false;
      cam.shake=Math.max(cam.shake,12); hitStop=80;
      // visual ring
      for(let i=0;i<24;i++){
        const a = (i/24)*Math.PI*2;
        particles.push({x:boss.x+boss.w/2,y:boss.y+boss.h,vx:Math.cos(a)*3,vy:-0.5+Math.abs(Math.sin(a))*-0.5,life:24,color:'#ffd866'});
      }
      for(const p of players){
        if(p.dead||p.carried||p.iFrames>0) continue;
        const dx=Math.abs((p.x+p.w/2)-(boss.x+boss.w/2));
        if(p.onGround && dx<70){ hurtPlayer(p, boss.x+boss.w/2); }
      }
    }
  }

  // bullets
  for(const b of bullets){
    if(b.arc){ b.vy += b.g||0.18; }
    b.x+=b.vx; b.y+=b.vy; b.life--;
    for(const p of players){ if(p.dead||p.carried) continue; if(aabb(p,b)&&p.iFrames<=0){hurtPlayer(p,b.x); b.life=0; break;} }
    if(solidAt(Math.floor(b.x/TS),Math.floor(b.y/TS))) b.life=0;
  }
  bullets=bullets.filter(b=>b.life>0);

  // gems
  for(const g of gems){
    if(!g.alive) continue;
    if(g.fromBlock&&g.blockY!==undefined){ g.vy+=0.35; g.y+=g.vy; if(g.y>=g.blockY){g.y=g.blockY;g.blockY=undefined;g.vy=0;} }
    g.bob+=0.08;
    // magnet pull
    if(upLvl('magnet')){
      let nearest=null, nd=70*70;
      for(const p of players){ if(p.dead||p.carried) continue; const dx=(p.x+p.w/2)-g.x, dy=(p.y+p.h/2)-g.y; const d=dx*dx+dy*dy; if(d<nd){nd=d; nearest=p;} }
      if(nearest){ const dx=(nearest.x+nearest.w/2)-g.x, dy=(nearest.y+nearest.h/2)-g.y; const d=Math.sqrt(dx*dx+dy*dy)||1; g.x += (dx/d)*1.6; g.y += (dy/d)*1.6; }
    }
    for(const p of players){
      if(p.dead||p.carried) continue;
      if(Math.abs((p.x+p.w/2)-g.x)<10 && Math.abs((p.y+p.h/2)-g.y)<12){
        g.alive=false;
        const gemValue = (upLvl('gem2x') ? 2 : 1) * Math.max(1, combo);
        p.gems += gemValue;
        spawnSpark(g.x,g.y,10,p.idx===0?'#7ff2e2':'#ffd866');
        sfxGem(); updateHud();
        save.totalGems += gemValue;
        save.gemsBank = (save.gemsBank||0) + gemValue;
        persist();
        // Gem Hunt: track score
        if(typeof lobbyGemHuntAddGem==='function') lobbyGemHuntAddGem(p.idx, gemValue);
        break;
      }
    }
  }

  // doors
  if(doorCooldown>0) doorCooldown -= dt;
  if(doorCooldown<=0){
    let warped = false;
    for(const d of doors){
      if(warped) break;
      for(const p of players){
        if(p.dead||p.carried) continue;
        if(rectsOverlap(p.x,p.y,p.w,p.h,d.x,d.y,TS,TS)){
          if(d.kind==='enter' && !inBonusRoom){ const pp=p; startTransition(()=>enterBonus(pp)); warped=true; break; }
          else if(d.kind==='exit' && inBonusRoom){ startTransition(()=>exitBonus()); warped=true; break; }
        }
      }
    }
  }

  // flag
  if(flag){
    for(const p of players){
      if(p.dead||p.carried) continue;
      if(aabb(p,{x:flag.x+4,y:flag.y-20,w:10,h:40})){ levelComplete(); break; }
    }
  }

  // game over when out of lives and everyone dead
  if(lives<=0 && players.every(p=>p.dead)){
    gameState='dead'; stopMusic();
    showBanner('GAME OVER!','Out of lives.','RESTART','MENU',false);
  }

  if(cam.shake>0){ cam.shake*=0.9; if(cam.shake<0.1) cam.shake=0; }

  let fx,fy; const alive=players.filter(p=>!p.dead);
  if(alive.length===2){ fx=(alive[0].x+alive[0].w/2+alive[1].x+alive[1].w/2)/2-W/2; fy=(alive[0].y+alive[0].h/2+alive[1].y+alive[1].h/2)/2-H/2-10; }
  else if(alive.length===1){ fx=alive[0].x+alive[0].w/2-W/2; fy=alive[0].y+alive[0].h/2-H/2-10; }
  else { fx=cam.x; fy=cam.y; }
  cam.x+=(fx-cam.x)*0.12; cam.y+=(fy-cam.y)*0.12;
  cam.x=Math.max(0,Math.min(mapW*TS-W,cam.x)); cam.y=Math.max(0,Math.min(mapH*TS-H,cam.y));

  if(alive.length===2){
    const [a,b]=alive; const dx=(b.x+b.w/2)-(a.x+a.w/2); const dist=Math.abs(dx);
    if(dist>MAX_PLAYER_DIST){ const ex=dist-MAX_PLAYER_DIST; const sg=dx>0?1:-1; a.x+=sg*ex*0.5; a.vx=0; b.x-=sg*ex*0.5; b.vx=0; }
  }

  for(const pr of particles){ pr.x+=pr.vx; pr.y+=pr.vy; pr.vy+=0.1; pr.life--; }
  particles=particles.filter(pr=>pr.life>0);
  for(const dn of damageNums){ dn.y += dn.vy; dn.vy += 0.04; dn.life--; }
  damageNums = damageNums.filter(d=>d.life>0);
  for(const hb of hiddenBlocks){ if(hb.bumpT>0) hb.bumpT--; }
  // power-up timers
  for(const p of players){
    if(p.powerupT>0 && p.powerup!=='shield'){
      p.powerupT-=dt;
      if(p.powerupT<=0){ p.powerup=null; updateHud(); }
      else if(tick%30===0) updateHud();
    }
  }
  // plates (players OR crates trigger)
  const now = performance.now();
  for(const pl of plates){
    let on = false;
    for(const p of players){ if(p.dead||p.carried) continue; if(rectsOverlap(p.x,p.y,p.w,p.h,pl.x-1,pl.y-2,pl.w+2,pl.h+2)) { on=true; break; } }
    if(!on) for(const cr of crates){ if(cr.carried) continue; if(rectsOverlap(cr.x,cr.y,cr.w,cr.h,pl.x-1,pl.y-2,pl.w+2,pl.h+2)) { on=true; break; } }
    if(on){ if(!pl.active){ pl.active=true; sfxBump(); spawnSpark(pl.x+pl.w/2,pl.y,8,'#fff4d6'); } pl.lastOnT=now; }
    else if(pl.active && (now - pl.lastOnT) > PLATE_LINGER_MS){ pl.active=false; }
  }
  // gates open when ALL plates are active (or ANY in solo play)
  if(plates.length){
    const allOn = (numPlayers===1) ? plates.some(pl=>pl.active) : plates.every(pl=>pl.active);
    for(const g of gates){
      const target = allOn ? 1 : 0;
      g.opening += (target - g.opening) * 0.06;
      if(g.opening<0.005) g.opening=0;
      if(g.opening>0.995) g.opening=1;
      const tx = (g.x/TS)|0, ty = (g.y/TS)|0;
      const wantSolid = g.opening < 0.5;
      const cur = map[ty] && map[ty][tx];
      if(wantSolid && cur!=='[' && cur!==']') map[ty][tx]='[';
      else if(!wantSolid && (cur==='['||cur===']')) map[ty][tx]='.';
    }
  }
  // toggle gates (open if ANY lever flipped on)
  if(toggleGates.length){
    const anyLever = levers.some(L=>L.on);
    for(const g of toggleGates){
      const target = anyLever ? 1 : 0;
      g.opening += (target - g.opening) * 0.07;
      if(g.opening<0.005) g.opening=0;
      if(g.opening>0.995) { g.opening=1; g.open=true; } else g.open=false;
      const tx = (g.x/TS)|0, ty = (g.y/TS)|0;
      const wantSolid = g.opening < 0.5;
      const cur = map[ty] && map[ty][tx];
      if(wantSolid && cur!=='J') map[ty][tx]='J';
      else if(!wantSolid && cur==='J') map[ty][tx]='.';
    }
  }
  // locks: animate open then clear solidity
  for(const L of locks){
    const target = L.open ? 1 : 0;
    L.opening += (target - L.opening) * 0.18;
    const tx = (L.x/TS)|0, ty = (L.y/TS)|0;
    const cur = map[ty] && map[ty][tx];
    if(L.open && L.opening>0.6 && cur==='l') map[ty][tx]='.';
  }
  // ============ M4: crates ============
  for(const cr of crates){
    if(cr.carried){
      const owner = players.find(p=>p.crateHeld===cr);
      if(owner && !owner.dead){
        cr.x = owner.x + (owner.w-cr.w)/2;
        cr.y = owner.y - cr.h - 1;
      } else { cr.carried=false; }
      continue;
    }
    cr.thrown = Math.max(0, cr.thrown - dt);
    cr.vy += GRAV; if(cr.vy>MAX_FALL) cr.vy = MAX_FALL;
    if(!cr.thrown) cr.vx *= 0.86; // air drag once not actively thrown
    if(cr.onGround) cr.vx *= 0.85;
    // X move
    cr.x += cr.vx;
    let cx0 = Math.floor(cr.x/TS), cx1 = Math.floor((cr.x+cr.w-1)/TS);
    let cy0 = Math.floor(cr.y/TS), cy1 = Math.floor((cr.y+cr.h-1)/TS);
    for(let ty=cy0; ty<=cy1; ty++) for(let tx=cx0; tx<=cx1; tx++){
      if(solidAt(tx,ty)){
        if(cr.vx>0){ cr.x = tx*TS - cr.w; cr.vx = -cr.vx*0.2; }
        else if(cr.vx<0){ cr.x = (tx+1)*TS; cr.vx = -cr.vx*0.2; }
      }
    }
    // crate-vs-crate
    for(const other of crates){
      if(other===cr || other.carried) continue;
      if(rectsOverlap(cr.x,cr.y,cr.w,cr.h, other.x,other.y,other.w,other.h)){
        if(cr.vx>0){ cr.x = other.x - cr.w; cr.vx = -cr.vx*0.3; }
        else if(cr.vx<0){ cr.x = other.x + other.w; cr.vx = -cr.vx*0.3; }
      }
    }
    // Y move
    cr.y += cr.vy;
    cy0 = Math.floor(cr.y/TS); cy1 = Math.floor((cr.y+cr.h-1)/TS);
    cx0 = Math.floor(cr.x/TS); cx1 = Math.floor((cr.x+cr.w-1)/TS);
    cr.onGround = false;
    for(let ty=cy0; ty<=cy1; ty++) for(let tx=cx0; tx<=cx1; tx++){
      if(solidAt(tx,ty)){
        if(cr.vy>0){ cr.y = ty*TS - cr.h; cr.vy=0; cr.onGround=true; }
        else if(cr.vy<0){ cr.y = (ty+1)*TS; cr.vy=0; }
      }
    }
    // crate-vs-crate Y
    for(const other of crates){
      if(other===cr || other.carried) continue;
      if(rectsOverlap(cr.x,cr.y,cr.w,cr.h, other.x,other.y,other.w,other.h)){
        if(cr.vy>0){ cr.y = other.y - cr.h; cr.vy=0; cr.onGround=true; }
        else if(cr.vy<0){ cr.y = other.y + other.h; cr.vy=0; }
      }
    }
    // crate breaks on shielded knight (from a thrown crate) — and KOs enemies
    if(cr.thrown>0 && Math.abs(cr.vx)>1.2){
      for(const e of enemies){
        if(!e.alive) continue;
        if(rectsOverlap(cr.x,cr.y,cr.w,cr.h, e.x,e.y,e.w,e.h)){
          e.alive = false; e.squishT = 12;
          spawnSpark(e.x+e.w/2,e.y+e.h/2,10,'#ffd866');
          enemyKilled(e.x+e.w/2, e.y, 'BONK');
          cr.vx *= -0.4;
          if(e.kind==='slime' && e.size===2){
            for(let s=-1;s<=1;s+=2){
              enemies.push({kind:'slime',x:e.x+(s>0?6:-2),y:e.y,w:8,h:8,vx:s*1.4,vy:-3,onGround:false,alive:true,size:1,bounceT:0,frame:0,squishT:0,hp:1});
            }
          }
        }
      }
    }
  }
  // ============ M4: levers ============
  for(const L of levers){
    if(L.cool>0) L.cool -= dt;
    if(L.cool<=0){
      for(const p of players){
        if(p.dead||p.carried) continue;
        if(rectsOverlap(p.x,p.y,p.w,p.h, L.x,L.y,L.w,L.h)){
          L.on = !L.on;
          L.cool = 360; // debounce
          sfxBump();
          spawnSpark(L.x+L.w/2,L.y+4,10,'#ffd866');
          cam.shake = Math.max(cam.shake, 2);
          break;
        }
      }
    }
  }
  // ============ M4: keys / locks ============
  for(const k of keys_){
    if(k.carried){
      const owner = players.find(p=>p.hasKey===k);
      if(owner && !owner.dead){ k.x = owner.x + owner.w/2 - k.w/2; k.y = owner.y - 6; }
      else { k.carried=false; }
      continue;
    }
    k.bob += 0.08;
    for(const p of players){
      if(p.dead||p.carried||p.hasKey) continue;
      if(rectsOverlap(p.x,p.y,p.w,p.h, k.x,k.y,k.w,k.h)){
        k.carried = true; p.hasKey = k;
        spawnSpark(k.x+k.w/2,k.y+k.h/2,12,k.color);
        sfxBump();
        break;
      }
    }
  }
  for(const L of locks){
    if(L.open) continue;
    for(const p of players){
      if(p.dead||p.carried) continue;
      const k = p.hasKey;
      if(!k) continue;
      if(k.color !== L.color) continue;
      if(rectsOverlap(p.x-1,p.y-1,p.w+2,p.h+2, L.x,L.y,L.w,L.h)){
        L.open = true;
        // consume key
        const idx = keys_.indexOf(k);
        if(idx>=0) keys_.splice(idx,1);
        p.hasKey = null;
        spawnSpark(L.x+L.w/2,L.y+L.h/2,16,L.color);
        sfxBump();
        cam.shake = Math.max(cam.shake, 3);
        break;
      }
    }
  }
  // ============ M4: conveyors ============
  for(const c of conveyors){
    for(const p of players){
      if(p.dead||p.carried) continue;
      // standing on top of conveyor: feet just below tile top
      if(p.onGround && Math.floor((p.y+p.h)/TS) === (c.y/TS) && p.x+p.w > c.x && p.x < c.x+c.w){
        p.x += c.dir * 0.7;
      }
    }
    for(const cr of crates){
      if(cr.carried) continue;
      if(cr.onGround && Math.floor((cr.y+cr.h)/TS) === (c.y/TS) && cr.x+cr.w > c.x && cr.x < c.x+c.w){
        cr.x += c.dir * 0.7;
      }
    }
  }
  // ============ M4: ice (low friction patch) ============
  for(const p of players){
    if(p.dead||p.carried) continue;
    if(!p.onGround) continue;
    const tx = Math.floor((p.x+p.w/2)/TS), ty = Math.floor((p.y+p.h)/TS);
    if(map[ty] && map[ty][tx]==='i'){
      // slidier: re-apply input as gentler accel, but skip the friction multiplier from earlier
      // We can't undo the FRICTION already applied, but we can add a small re-impulse to keep momentum.
      const inp = readInput(p.idx);
      if(!inp.left && !inp.right){ p.vx /= 0.78; p.vx *= 0.985; } // undo FRICTION, apply ice friction
    }
  }
  // ============ M4: cannons ============
  for(const c of cannons){
    if(c.kickT>0) c.kickT -= dt;
    if(now >= c.nextShot){
      const muzzleX = c.x + (c.dir>0 ? c.w + 2 : -8);
      const muzzleY = c.y + c.h/2 - 3;
      bullets.push({x:muzzleX, y:muzzleY, w:6, h:6, vx: c.dir*2.4, vy:0, life:300, arc:false, kind:'cannon'});
      c.nextShot = now + 1700 + Math.random()*400;
      c.kickT = 12;
      spawnSpark(muzzleX, muzzleY+3, 6, '#ffd866');
      sfxBump();
    }
  }

  // ============ M5.1: wind gust tiles ============
  for(const w of windTiles){
    for(const p of players){
      if(p.dead || p.carried) continue;
      // Apply accel if player is on or within WIND_DECAY_TILES above the tile
      const pFeetY = p.y + p.h;
      const tileTopY = w.y;
      const distTiles = (tileTopY - pFeetY) / TS;
      if(distTiles >= 0 && distTiles <= WIND_DECAY_TILES &&
         p.x + p.w > w.x && p.x < w.x + w.w){
        const strength = WIND_ACCEL * (1 - distTiles / WIND_DECAY_TILES);
        p.vx += w.dir * strength;
      }
    }
  }

  // ============ M5.1: cloud platforms ============
  for(const cl of clouds){
    if(cl.state === 'gone'){
      cl.respawnT -= dt;
      if(cl.respawnT <= 0){ cl.state = 'solid'; cl.touchT = 0; cl.opacity = 1; }
      continue;
    }
    // Check if any player is standing on this cloud
    let anyOn = false;
    for(const p of players){
      if(p.dead || p.carried) continue;
      const onTop = p.onGround &&
        Math.abs((p.y + p.h) - cl.y) < 4 &&
        p.x + p.w > cl.x + 2 && p.x < cl.x + cl.w - 2;
      if(onTop){ anyOn = true; break; }
    }
    if(cl.state === 'solid'){
      if(anyOn && cl.touchT === 0) cl.touchT = now;
      if(cl.touchT > 0 && (now - cl.touchT) >= CLOUD_SOLID_MS){
        cl.state = 'fading'; cl.fadeStart = now;
      }
      cl.opacity = 1;
    } else if(cl.state === 'fading'){
      const elapsed = now - cl.fadeStart;
      cl.opacity = Math.max(0, 1 - elapsed / CLOUD_FADE_MS);
      if(elapsed >= CLOUD_FADE_MS){
        cl.state = 'gone'; cl.respawnT = CLOUD_RESPAWN_MS; cl.opacity = 0;
      }
    }
  }
  // Solid cloud platforms: treat as temporary solid in aabb checks for players
  for(const p of players){
    if(p.dead || p.carried || p.vy < 0) continue;
    for(const cl of clouds){
      if(cl.state !== 'solid' && cl.state !== 'fading') continue;
      if(cl.state === 'fading' && cl.opacity < 0.5) continue;
      const py1 = p.y + p.h;
      const py0 = p.y + p.h - Math.abs(p.vy) - 1;
      if(py1 >= cl.y && py0 <= cl.y + 2 &&
         p.x + p.w > cl.x + 2 && p.x < cl.x + cl.w - 2){
        p.y = cl.y - p.h - 0.001;
        p.vy = 0; p.onGround = true;
      }
    }
  }

  updateWeather(dt);
}

function powerupForBlock(tx,ty){
  // mix it up a bit deterministically: alternate gem / shield / speed / glide
  const r = (tx*7 + ty*13) % 7;
  if(r===1) return 'shield';
  if(r===3) return 'speed';
  if(r===5) return 'glide';
  return null; // gem (default)
}

function input_pressedDown(idx){ return idx===0 ? keys.has('ArrowDown') : keys.has('KeyS'); }

function enterBonus(p){
  bonusReturn = { level: currentLevel, x: p.x, y: p.y };
  inBonusRoom = true;
  awardMedal(currentLevel, 'secret');
  // Achievement: secret found
  if(typeof achievementCheck === 'function'){
    const totalFound = Object.keys(save.medals || {}).filter(lvl => (save.medals[lvl]||[]).includes('secret')).length;
    achievementCheck('secret_found', { totalFound });
  }
  const sp = loadMap(BONUS_ROOM);
  respawn1=null; respawn2=null;
  spawnPlayers(sp);
  doorCooldown = 600;
  sfxWarp();
  toast('SECRET ROOM!');
}
function exitBonus(){
  inBonusRoom = false;
  const back = bonusReturn;
  // accumulate gems already counted into player; reload main map
  const carried1 = players[0]?.gems || 0;
  const carried2 = players[1]?.gems || 0;
  const carriedHp = players.map(p=>p.hp);
  const sp = loadMap(LEVELS[back.level].map);
  respawn1=null; respawn2=null;
  spawnPlayers(sp);
  // place a couple tiles AWAY from the entry door so we don't immediately re-trigger it
  const offX = TS * 2.5;
  if(players[0]){ players[0].x = back.x + offX; players[0].y = back.y - 4; players[0].gems = carried1; players[0].hp = carriedHp[0] ?? MAX_HP; }
  if(players[1]){ players[1].x = back.x + offX + 14; players[1].y = back.y - 4; players[1].gems = carried2; players[1].hp = carriedHp[1] ?? MAX_HP; }
  doorCooldown = 600;
  sfxWarp();
  updateHud();
}

function levelComplete(){
  const elapsed = (performance.now() - levelStartTime)/1000;
  const lvl = currentLevel;
  if(!save.levelsCleared.includes(lvl)) save.levelsCleared.push(lvl);
  const prev = save.bestTimes[lvl];
  if(prev===undefined || elapsed<prev) save.bestTimes[lvl] = elapsed;
  // M5.3 Ghost — save recording if this is a new best
  ghostSaveIfBest(lvl, elapsed, prev);
  // ---- Medal awards ----
  const newMedals = [];
  if(awardMedal(lvl, 'clear')) newMedals.push('clear');
  if(!runHurtLvl && !runDeathLvl && awardMedal(lvl, 'noDamage')) newMedals.push('noDamage');
  const collectedAll = totalGems>0 && players.reduce((s,p)=>s+p.gems,0) >= totalGems;
  if(collectedAll && awardMedal(lvl, 'allGems')) newMedals.push('allGems');
  const target = SPEEDRUN_TARGETS[lvl];
  if(target!==undefined && elapsed <= target && awardMedal(lvl, 'speedrun')) newMedals.push('speedrun');
  // 'secret' medal is awarded inside enterBonus()
  // Total run time (compute early so newBestRun is available for achievement checks)
  const isLast = lvl >= LEVELS.length-1;
  const totalRun = runElapsedAtLevel + elapsed;
  let newBestRun = false;
  if(isLast){
    if(save.bestRunTime===undefined || totalRun < save.bestRunTime){ save.bestRunTime = totalRun; newBestRun = true; }
  }
  // ── Achievement checks ──
  if(typeof achievementCheck === 'function'){
    achievementCheck('level_clear', {
      levelIdx: lvl,
      noHit:    !runHurtLvl && !runDeathLvl,
      allGems:  totalGems > 0 && players.reduce((s,p)=>s+p.gems,0) >= totalGems,
      speedrun: SPEEDRUN_TARGETS[lvl] !== undefined && elapsed <= SPEEDRUN_TARGETS[lvl],
      elapsed,
    });
    if(newBestRun) achievementCheck('new_best_run', {});
    if(typeof netIsActive==='function' && (netIsActive() || (typeof lobbyIsActive==='function' && lobbyIsActive()))){
      achievementCheck('coop_level_clear', {});
    }
  }
  // ── M6.2 Race mode: signal finish ──
  if(typeof lobbyIsActive==='function' && lobbyIsActive() && lobbyGetMode()==='race'){
    if(typeof lobbySignalRaceFinish==='function') lobbySignalRaceFinish();
  }
  // ── Co-op medals ──
  let coopNewMedals = [];
  if(typeof netIsActive==='function' && netIsActive()){
    // Record this player's finish time for Sync medal
    const finishPidx = netIsHost() ? 0 : 1;
    if(typeof coopOnPlayerFinish==='function') coopOnPlayerFinish(finishPidx);
    // Notify partner that we finished (for Sync medal tracking)
    if(netIsHost() && typeof netSendReliable==='function') netSendReliable({ type: 'coopFinish', pidx: 0 });
    if(typeof coopLevelComplete==='function') coopNewMedals = coopLevelComplete(elapsed) || [];
  }
  persist();
  gameState='levelClear'; stopMusic(); sfxWin();
  const totalP = players.reduce((s,p)=>s+p.gems,0);
  let body = `<div style="font-size:13px;margin:8px 0;">⏱ ${elapsed.toFixed(2)}s ${prev!==undefined && elapsed<prev?'<b>(NEW BEST!)</b>':prev!==undefined?`(best ${prev.toFixed(2)}s)`:''}</div>`;
  body += `<div style="font-size:12px;">Gems collected: ${totalP} / ${totalGems}</div>`;
  // Medals earned this level (all earned so far, with new ones highlighted)
  const earnedNow = newMedals;
  const allMeds = medalsFor(lvl);
  body += `<div class="lc-medals">`;
  for(const k of MEDAL_KEYS){
    const has = allMeds.includes(k);
    const isNew = earnedNow.includes(k);
    body += `<span class="medal ${has?'on':''} ${isNew?'new':''}" title="${MEDAL_LABELS[k]}">${MEDAL_GLYPHS[k]}<span class="medal-tip">${MEDAL_LABELS[k]}${isNew?' NEW!':''}</span></span>`;
  }
  body += `</div>`;
  // ── Co-op medal row ──
  if(typeof netIsActive==='function' && netIsActive() && typeof COOP_MEDAL_KEYS!=='undefined'){
    const coopMeds = typeof coopMedalsFor==='function' ? coopMedalsFor(lvl) : [];
    body += `<div style="font-size:10px;letter-spacing:1px;color:#5a7040;margin-top:6px;">CO-OP</div>`;
    body += `<div class="lc-medals">`;
    for(const k of COOP_MEDAL_KEYS){
      const has = coopMeds.includes(k);
      const isNew = coopNewMedals.includes(k);
      body += `<span class="medal ${has?'on':''} ${isNew?'new':''}" title="${COOP_MEDAL_LABELS[k]}">${COOP_MEDAL_GLYPHS[k]}<span class="medal-tip">${COOP_MEDAL_LABELS[k]}${isNew?' NEW!':''}</span></span>`;
    }
    body += `</div>`;
  }
  if(isLast){
    body += `<div style="font-size:13px;margin-top:10px;color:#5a4a2a;">🏁 Total run: <b>${fmtTotalTime(totalRun)}</b>${newBestRun?' <b>— NEW RECORD!</b>':(save.bestRunTime!==undefined?` (best ${fmtTotalTime(save.bestRunTime)})`:'')}</div>`;
  }
  // ── Infinite mode override ──
  if(typeof isInfiniteMode === 'function' && isInfiniteMode()){
    const infBody = infiniteLevelClearBody ? infiniteLevelClearBody() : '';
    document.getElementById('bannerTitle').textContent = `∞ FLOOR ${(typeof infiniteLevelIndex==='function'?infiniteLevelIndex():0)+1} CLEAR!`;
    document.getElementById('bannerText').innerHTML = LEVELS[lvl] ? LEVELS[lvl].name : '';
    document.getElementById('bannerBody').innerHTML = body + infBody;
    document.getElementById('modeRow').style.display='none';
    document.getElementById('primaryBtn').textContent = 'NEXT FLOOR ∞';
    document.getElementById('secondaryBtn').style.display = '';
    document.getElementById('secondaryBtn').textContent = 'EXIT INFINITE';
    document.getElementById('banner').style.display='flex';
    updateStatsLine();
    return;
  }
  document.getElementById('bannerTitle').textContent = isLast ? 'YOU BEAT THE GAME!' : `LEVEL ${lvl+1} CLEAR!`;
  document.getElementById('bannerText').innerHTML = LEVELS[lvl].name;
  // M6.2: append race results if in race mode
  if(typeof lobbyIsActive==='function' && lobbyIsActive() && typeof renderRaceResultsInBanner==='function'){
    body += renderRaceResultsInBanner();
  }
  document.getElementById('bannerBody').innerHTML = body;
  document.getElementById('modeRow').style.display='none';
  document.getElementById('primaryBtn').textContent = isLast ? 'WORLD MAP' : 'NEXT LEVEL';
  document.getElementById('secondaryBtn').style.display = '';
  document.getElementById('secondaryBtn').textContent = 'WORLD MAP';
  document.getElementById('banner').style.display='flex';
  updateStatsLine();
}

function tryHeadBounce(bouncer,target){
  if(bouncer.vy>1 && (bouncer.y+bouncer.h)-target.y<10 && bouncer.y<target.y){
    bouncer.vy=HEAD_BOUNCE_V; bouncer.canDouble=true;
    target.sy=0.6; target.sx=1.4; spawnDust(target.x+target.w/2,target.y,8); sfxHeadBounce(); cam.shake=Math.max(cam.shake,2);
  }
}
function nearestPlayerTo(x,y){ let best=null,bd=Infinity; for(const p of players){ if(p.dead||p.carried) continue; const d=(p.x-x)*(p.x-x)+(p.y-y)*(p.y-y); if(d<bd){bd=d; best=p;} } return best; }
function spawnDust(x,y,n){ for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-0.5)*1.5,vy:-Math.random()*1.2,life:20+Math.random()*10,color:'#e8f7ff'}); }
function spawnSpark(x,y,n,color){ for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-0.5)*2.8,vy:(Math.random()-0.5)*2.8-0.6,life:24+Math.random()*10,color}); }
function spawnDamageNumber(x,y,text,color){ damageNums.push({x:x+(Math.random()-0.5)*4, y, vy:-1.6, life:42, text, color: color||'#fff4d6'}); }

// ---- M5.2 Combo meter ----
function comboColor(){ return COMBO_COLORS[Math.min(combo,COMBO_MAX)-1] || '#fff4d6'; }
function enemyKilled(x, y, label){
  combo = Math.min(combo + 1, COMBO_MAX);
  comboExpireT = performance.now() + COMBO_EXPIRE_MS;
  const col = comboColor();
  spawnDamageNumber(x, y, label || (combo > 1 ? 'x'+combo : '1'), col);
  updateComboHud();
  // Achievements
  if(typeof achievementCheck === 'function'){
    achievementCheck('enemy_stomped', {});
    if(combo >= 6) achievementCheck('combo_reached', { combo });
    if(label === 'KO' || label === 'BONK') achievementCheck('ground_pound_ko', {});
  }
}
function resetCombo(){
  combo = 0; comboExpireT = 0;
  updateComboHud();
}

function resolveBossAttack(b){
  const cx = b.x + b.w/2;
  if(b.actKind==='spread'){
    // Spread: 5 bullets fanned upward + downward arcs in phase 3
    const phase = b.phase;
    const count = phase===1?3 : phase===2?5 : 7;
    sfxShoot();
    for(let i=0;i<count;i++){
      const t = count===1?0.5 : i/(count-1);
      const ang = Math.PI*(1.15 + t*0.7); // sweep across the top
      bullets.push({x:cx, y:b.y+8, vx:Math.cos(ang)*BULLET_SPD*0.9, vy:Math.sin(ang)*BULLET_SPD*0.9, w:4, h:4, life:280});
    }
    for(let i=0;i<14;i++) particles.push({x:cx,y:b.y+8,vx:(Math.random()-0.5)*3,vy:-Math.random()*2,life:18,color:'#ff6f88'});
  } else if(b.actKind==='slam'){
    // Slam: jump high then crash down. Schedule landing detection in slamT (handled via onGround transition)
    b.vy = -10; b.slamT = 90; // gives ~90 frames to land
    sfxShoot();
  } else if(b.actKind==='minions'){
    // Spawn 2-3 small slimes
    const n = 2 + (Math.random()<0.5?1:0);
    for(let i=0;i<n;i++){
      const sx = cx + (i-n/2)*16;
      enemies.push({kind:'slime',x:sx-4,y:b.y-4,w:8,h:8,vx:(i%2?1:-1)*1.0,vy:-3,facing:i%2?1:-1,onGround:false,alive:true,size:1,bounceT:0,frame:0,squishT:0});
      for(let k=0;k<6;k++) particles.push({x:sx,y:b.y,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:20,color:'#5fbf5a'});
    }
    sfxPickup();
  }
  b.actKind = null;
}

function updatePlayer(p,dt){
  const inp=readInput(p.idx);
  // detect wall side BEFORE moving (uses last-frame position)
  detectWall(p);
  const speedMult = (p.powerup==='speed') ? SPEED_MULT : 1;
  const maxSpd = MAX_SPD * speedMult;
  if(p.wallJumpLock>0) p.wallJumpLock-=dt;
  if(p.dashTime>0){
    p.vx=p.dashDir*DASH_SPD; p.vy=0; p.dashTime-=dt;
    if(tick%2===0) particles.push({x:p.x+p.w/2,y:p.y+p.h/2,vx:(Math.random()-0.5),vy:(Math.random()-0.5),life:14,color:p.pal.hi});
  } else if(p.wallJumpLock>0){
    // input locked briefly so the kick reads cleanly
    if(!inp.left && !inp.right) p.vx*=0.99;
  } else {
    if(inp.left){ p.vx-=MOVE_ACCEL*speedMult; p.dir=-1; }
    if(inp.right){ p.vx+=MOVE_ACCEL*speedMult; p.dir=1; }
    if(!inp.left && !inp.right) p.vx*=FRICTION;
    p.vx=Math.max(-maxSpd,Math.min(maxSpd,p.vx));
    if(Math.abs(p.vx)<0.05) p.vx=0;
  }
  if(inp.jumpPressed) p.jumpBuf=JUMP_BUFFER_MS; else p.jumpBuf=Math.max(0,p.jumpBuf-dt);
  if(p.onGround){ p.coyote=COYOTE_MS; p.canDouble=true; } else p.coyote=Math.max(0,p.coyote-dt);
  if(p.jumpBuf>0){
    if(p.coyote>0){ p.vy=JUMP_V; p.onGround=false; p.coyote=0; p.jumpBuf=0; p.sy=1.4; p.sx=0.7; spawnDust(p.x+p.w/2,p.y+p.h,6); sfxJump(); }
    else if(p.wallSide!==0 && !p.onGround){
      // wall jump — kick off opposite the wall
      const kick = -p.wallSide;
      p.vx = kick * WALL_JUMP_VX;
      p.vy = WALL_JUMP_VY;
      p.dir = kick;
      p.canDouble = true;
      p.wallJumpLock = WALL_JUMP_LOCK_MS;
      p.jumpBuf = 0;
      p.sy=1.3; p.sx=0.8;
      for(let i=0;i<8;i++) particles.push({x:p.x+(p.wallSide>0?p.w:0),y:p.y+p.h/2,vx:kick*(0.5+Math.random()*1.2),vy:(Math.random()-0.5)*2,life:18,color:'#e8f7ff'});
      sfxJump();
    }
    else if(p.canDouble){ p.vy=DOUBLE_JUMP_V; p.canDouble=false; p.jumpBuf=0; p.sy=1.3; p.sx=0.8; for(let i=0;i<10;i++) particles.push({x:p.x+p.w/2,y:p.y+p.h,vx:(Math.random()-0.5)*2,vy:Math.random()*1.2,life:18,color:p.pal.hi}); sfxDouble(); }
  }
  if(!inp.jump && p.vy<-3) p.vy*=0.88;
  // gliding: hold jump in air to slow fall (only with glide power-up)
  p.gliding = false;
  if(p.powerup==='glide' && !p.onGround && p.vy>0 && inp.jump){
    if(p.vy>GLIDE_FALL) p.vy=GLIDE_FALL;
    p.gliding = true;
    if(tick%4===0) particles.push({x:p.x+p.w/2,y:p.y+p.h+1,vx:(Math.random()-0.5)*0.6,vy:-0.3,life:14,color:'#a8e0c7'});
  }
  // CHARGE STOMP: hold down in air to charge, release/land to slam
  const wasCharged = p.charged;
  if(!p.onGround && inp.down && p.dashTime<=0 && !p.gliding && !p.wallSlide){
    p.chargeT = Math.min(p.chargeT + dt, 600);
    // accelerate downward fall while charging
    if(p.chargeT > 80){
      p.vy = Math.min(MAX_FALL*1.2, p.vy + 0.6);
      p.charged = p.chargeT >= 180;
    }
    // aura particles
    if(p.charged && tick%2===0){
      particles.push({x:p.x+p.w/2+(Math.random()-0.5)*p.w, y:p.y+p.h, vx:(Math.random()-0.5)*0.8, vy:-0.6-Math.random()*0.6, life:18, color:'#ffd866'});
    } else if(tick%4===0){
      particles.push({x:p.x+p.w/2, y:p.y+p.h, vx:(Math.random()-0.5)*0.4, vy:-0.4, life:12, color:'#fff4d6'});
    }
  } else if(p.onGround){
    // landed — trigger pound if was charged
    if(wasCharged){ triggerGroundPound(p); }
    p.chargeT = 0; p.charged = false;
  } else {
    // released down in air — keep momentum but stop charging
    p.chargeT = Math.max(0, p.chargeT - dt*2);
    if(p.chargeT < 180) p.charged = false;
  }
  // wall slide: pressed into wall, falling, not on ground
  p.wallSlide = false;
  if(p.wallSide!==0 && !p.onGround && p.vy>0 && p.dashTime<=0){
    const pressing = (p.wallSide<0 && inp.left) || (p.wallSide>0 && inp.right);
    if(pressing){
      p.vy = Math.min(p.vy, WALL_SLIDE_V);
      p.wallSlide = true;
      if(tick%3===0) particles.push({x:p.x+(p.wallSide>0?p.w+1:-1),y:p.y+p.h-3,vx:(Math.random()-0.5)*0.6,vy:Math.random()*0.4,life:12,color:'#e8f7ff'});
    }
  }
  // M4: pick up / throw crate. Dash button is hijacked when next to or holding a crate.
  if(inp.dashPressed){
    if(p.crateHeld){
      // throw
      const cr = p.crateHeld;
      cr.carried = false; cr.thrown = 380;
      cr.vx = p.dir * 4.6 + p.vx*0.5;
      cr.vy = -2.4;
      cr.x = p.x + (p.dir>0 ? p.w+1 : -cr.w-1);
      cr.y = p.y + 2;
      p.crateHeld = null;
      sfxDash();
      cam.shake = Math.max(cam.shake, 2);
      // skip dash
      p.dashCool = Math.max(0, p.dashCool-dt);
      if(p.dashTime<=0){ p.vy+=GRAV; if(p.vy>MAX_FALL) p.vy=MAX_FALL; }
    } else {
      // try pickup
      let picked = null;
      for(const cr of crates){
        if(cr.carried) continue;
        if(rectsOverlap(p.x-2,p.y,p.w+4,p.h, cr.x,cr.y,cr.w,cr.h)){ picked = cr; break; }
      }
      if(picked){
        picked.carried = true; picked.vx=0; picked.vy=0;
        p.crateHeld = picked;
        sfxBump();
      } else if(p.dashCool<=0 && p.dashTime<=0){
        p.dashTime=DASH_MS; p.dashCool=playerDashCooldown(); p.dashDir=p.dir; sfxDash(); cam.shake=Math.max(cam.shake,3);
      }
    }
  }
  p.dashCool=Math.max(0,p.dashCool-dt);
  if(p.dashTime<=0){ p.vy+=GRAV; if(p.vy>MAX_FALL) p.vy=MAX_FALL; }
  if(p.ridingMover){ p.x+=p.ridingMover.dx; p.ridingMover=null; }
  p.hitWall=false; const wasAir=!p.onGround; const prevVy=p.vy;
  moveX(p,p.vx); const bump=moveY(p,p.vy);
  if(wasAir && p.onGround){
    // Landing squash — scale with fall speed for juiciness
    const impactScale = Math.min(1, Math.abs(prevVy) / MAX_FALL);
    p.sy = 0.6 - impactScale * 0.1;  // harder landing = more squash
    p.sx = 1.3 + impactScale * 0.1;
    const dustCount = 4 + Math.floor(impactScale * 8);
    spawnDust(p.x+p.w/2, p.y+p.h, dustCount);
    if(impactScale > 0.6 && !reducedMotion()) cam.shake = Math.max(cam.shake, impactScale * 3);
  }
  p.sx+=(1-p.sx)*0.2; p.sy+=(1-p.sy)*0.2;
  if(bump){
    const hb=hiddenBlocks.find(h=>(h.x/TS|0)===bump.tx && (h.y/TS|0)===bump.ty);
    if(hb && !hb.used){
      hb.used=true; hb.bumpT=12;
      if(hb.kind){ powerups.push({x:hb.x+TS/2,y:hb.y-TS/2-2,vy:-2.4,bob:0,kind:hb.kind,alive:true,blockY:hb.y-TS/2-2}); }
      else { gems.push({x:hb.x+TS/2,y:hb.y-TS/2,alive:true,bob:Math.random()*Math.PI*2,fromBlock:true,vy:-2,blockY:hb.y-TS/2}); totalGems++; updateHud(); }
      sfxBump();
    }
  }
  if(Math.abs(p.vx)>0.3 && p.onGround) p.walkFrame+=0.2;
  p.idleT+=1;
  if(p.y>mapH*TS+40){ p.hp=0; sfxHurt(); }
  const t0x=Math.floor(p.x/TS), t1x=Math.floor((p.x+p.w-1)/TS);
  const t0y=Math.floor(p.y/TS), t1y=Math.floor((p.y+p.h-1)/TS);
  outer: for(let ty=t0y;ty<=t1y;ty++) for(let tx=t0x;tx<=t1x;tx++){
    if(hazardAt(tx,ty)&&p.iFrames<=0){ hurtPlayer(p,tx*TS+TS/2); break outer; }
  }
  for(const c of checkpoints){
    const near=Math.abs((p.x+p.w/2)-(c.x+TS/2))<10 && Math.abs((p.y+p.h/2)-(c.y+TS/2))<14;
    if(!near) continue;
    const key=p.idx===0?'active1':'active2';
    if(!c[key]){ c[key]=true; if(p.idx===0) respawn1={x:c.x,y:c.y}; else respawn2={x:c.x,y:c.y}; sfxCheckpoint(); for(let i=0;i<14;i++) particles.push({x:c.x+TS/2,y:c.y+TS/2,vx:(Math.random()-0.5)*2.5,vy:-Math.random()*2-0.5,life:34,color:p.pal.hi}); }
  }
  if(p.hp<=0 && !p.dead){
    p.dead=true;
    lives--;
    runDeathLvl = true;
    persist(); updateHud();
    for(let i=0;i<22;i++) particles.push({x:p.x+p.w/2,y:p.y+p.h/2,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4-1,life:34,color:p.pal.base});
    // release any carry involving this player
    if(carry.holder===p.idx || carry.held===p.idx){ carry.holder=-1; carry.held=-1; }
    // drop crate/key on death so puzzles aren't softlocked
    if(p.crateHeld){ const cr=p.crateHeld; cr.carried=false; cr.vy=-1; p.crateHeld=null; }
    if(p.hasKey){ const k=p.hasKey; k.carried=false; k.x=p.x; k.y=p.y; p.hasKey=null; }
    if(lives>0){ pendingRespawn[p.idx] = { at: performance.now() + RESPAWN_MS }; toast(`LIFE LOST · ${lives} LEFT`); }
  }
  // pickup power-ups
  for(const pu of powerups){
    if(!pu.alive) continue;
    if(Math.abs((p.x+p.w/2)-pu.x)<10 && Math.abs((p.y+p.h/2)-pu.y)<12){
      pu.alive=false;
      p.powerup = pu.kind;
      p.powerupT = (pu.kind==='speed') ? SPEED_DUR : (pu.kind==='glide' ? 12000 : SHIELD_DUR_MAX);
      spawnSpark(pu.x, pu.y, 16, powerupColor(pu.kind));
      sfxGem();
      updateHud();
    }
  }
  if(p.iFrames>0) p.iFrames--;
}

// ---- physics: detectWall lives in physics.js ----

function powerupColor(k){ return k==='shield'?'#7ff2e2':k==='speed'?'#ffd866':k==='glide'?'#a8e0c7':'#fff'; }

function triggerGroundPound(p){
  // Big landing impact: shockwave, AOE on enemies, double damage to boss
  const cx = p.x + p.w/2, cy = p.y + p.h;
  const radius = 56;
  cam.shake = Math.max(cam.shake, 10);
  hitStop = 140;
  sfxBossHit();
  spawnDust(cx, cy, 16);
  // shockwave ring
  for(let i=0;i<28;i++){
    const a = (i/28)*Math.PI*2;
    particles.push({x:cx, y:cy, vx:Math.cos(a)*3.4, vy:-Math.abs(Math.sin(a))*0.6 - 0.2, life:26, color:'#ffd866'});
  }
  // enemies in radius
  for(const e of enemies){
    if(!e.alive) continue;
    const dx = (e.x+e.w/2) - cx, dy = (e.y+e.h/2) - cy;
    if(dx*dx + dy*dy <= radius*radius){
      // pound bypasses shields and triggers slime split
      e.alive = false; e.squishT = 20;
      spawnDust(e.x+e.w/2, e.y+e.h, 8);
      enemyKilled(e.x+e.w/2, e.y, 'POUND');
      if(e.kind==='slime' && e.size===2){
        for(let s=-1;s<=1;s+=2){
          enemies.push({kind:'slime',x:e.x+(s>0?6:-2),y:e.y,w:8,h:8,vx:s*1.4,vy:-3,facing:s,onGround:false,alive:true,size:1,bounceT:0,frame:0,squishT:0});
        }
      }
    }
  }
  // double damage to boss if landing near it
  if(boss && boss.alive && boss.hurtT<=0){
    const dx = (boss.x+boss.w/2) - cx;
    if(Math.abs(dx) < 80 && Math.abs((boss.y+boss.h) - cy) < 50){
      boss.hp -= 2; boss.hurtT = 40;
      enemyKilled(boss.x+boss.w/2, boss.y, '2');
      for(let i=0;i<24;i++) particles.push({x:boss.x+boss.w/2,y:boss.y,vx:(Math.random()-0.5)*4,vy:-Math.random()*3,life:32,color:'#ffb04a'});
      if(boss.hp<=0){
        boss.alive=false;
        for(let i=0;i<60;i++) particles.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5-1,life:50+Math.random()*30,color:Math.random()<0.5?'#ffd866':'#ff6f88'});
        sfxWin(); toast('BOSS DEFEATED!');
      }
    }
  }
  p.vy = JUMP_V * 0.5; // small bounce after pound
  p.canDouble = true;
}

function hurtPlayer(p,fromX){
  if(p.powerup==='shield'){
    p.powerup=null; p.powerupT=0; p.iFrames=40;
    p.vx=(p.x+p.w/2<fromX?-2:2); p.vy=-3;
    for(let i=0;i<24;i++) particles.push({x:p.x+p.w/2,y:p.y+p.h/2,vx:(Math.random()-0.5)*3.5,vy:(Math.random()-0.5)*3.5,life:30,color:'#7ff2e2'});
    sfxBump(); cam.shake=Math.max(cam.shake,3); updateHud();
    return;
  }
  p.hp-=HIT_DAMAGE; p.iFrames=60; p.vx=(p.x+p.w/2<fromX?-3:3); p.vy=-4; spawnDust(p.x+p.w/2,p.y+p.h/2,10); sfxHurt(); cam.shake=Math.max(cam.shake,6); hitStop=50; updateHud();
  runHurtLvl = true;
  // Co-op: track no-damage medal
  if(typeof coopOnPlayerHurt==='function') coopOnPlayerHurt(p.idx);
  // LOS: eliminate player on death
  if(p.hp<=0 && typeof lobbyIsLosActive==='function' && lobbyIsLosActive() && typeof lobbyLOSEliminate==='function'){
    lobbyLOSEliminate(p.idx);
  }
  resetCombo();
}


// ---- DRAW ----
function draw(){
  ctx.save();
  ctx.scale(PIXEL_SCALE, PIXEL_SCALE);
  drawBackground(currentBiome());
  const sh = reducedMotion()?0:cam.shake;
  const shX=sh?(Math.random()-0.5)*sh:0, shY=sh?(Math.random()-0.5)*sh:0;
  const camX=Math.floor(cam.x+shX), camY=Math.floor(cam.y+shY);
  const tx0=Math.max(0,Math.floor(camX/TS)), tx1=Math.min(mapW-1,Math.ceil((camX+W)/TS));
  const ty0=Math.max(0,Math.floor(camY/TS)), ty1=Math.min(mapH-1,Math.ceil((camY+H)/TS));
  for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){
    const c=map[ty][tx]; if(c==='.') continue;
    drawTile(c,tx*TS-camX,ty*TS-camY,tx,ty);
  }
  for(const m of movers) drawMover(m.x-camX,m.y-camY,m.w,m.h);
  for(const cl of clouds) drawCloud(cl, cl.x-camX, cl.y-camY);
  for(const pl of plates) drawPlate(pl.x-camX, pl.y-camY, pl.id, pl.active);
  for(const g of gates) drawGate(g.x-camX, g.y-camY, g.opening);
  for(const c of checkpoints) drawCheckpoint(c.x-camX,c.y-camY,c.active1||c.active2);
  for(const d of doors) drawDoor(d.x-camX,d.y-camY,d.kind);
  for(const cr of crates) drawCrate(cr.x-camX, cr.y-camY, cr.carried);
  for(const L of levers) drawLever(L.x-camX, L.y-camY, L.on);
  for(const k of keys_) drawKey(k.x-camX, k.y-camY, k);
  if(flag) drawFlag(flag.x-camX,flag.y-camY);
  for(const g of gems){ if(!g.alive) continue; drawGem(g.x-camX,g.y-camY+Math.sin(g.bob)*1.5); }
  for(const pu of (powerups||[])){ if(!pu.alive) continue; pu.bob+=0.08; if(pu.vy!==0){ pu.vy+=0.35; pu.y+=pu.vy; if(pu.y>=pu.blockY){ pu.y=pu.blockY; pu.vy=0; } } drawPowerup(pu.x-camX, pu.y-camY+Math.sin(pu.bob)*1.5, pu.kind); }
  for(const e of enemies) drawEnemy(e,e.x-camX,e.y-camY);
  if(boss && boss.alive) drawBoss(boss.x-camX,boss.y-camY);
  for(const b of bullets) drawBullet(b, b.x-camX, b.y-camY);
  // M5.3 Ghost silhouette — drawn behind live player
  ghostDraw(ctx, camX, camY);
  for(const p of players){
    if(p.dead) drawDeadEffect(p,p.x-camX,p.y-camY); else drawPlayer(p,p.x-camX,p.y-camY);
    if(!p.dead && p.dashCool>0){ const w=20*(1-p.dashCool/DASH_COOLDOWN_MS); ctx.fillStyle='#0b1020'; ctx.fillRect(p.x-camX-4,p.y-camY-6,20,3); ctx.fillStyle=p.pal.hi; ctx.fillRect(p.x-camX-4,p.y-camY-6,w,3); }
  }
  // tether between players when far apart
  if(players.length===2 && !players[0].dead && !players[1].dead && !players[0].carried && !players[1].carried){
    const a=players[0], b=players[1];
    const dist=Math.hypot((b.x-a.x),(b.y-a.y));
    if(dist>140){
      const ax=Math.floor(a.x+a.w/2-camX), ay=Math.floor(a.y+a.h/2-camY);
      const bx=Math.floor(b.x+b.w/2-camX), by=Math.floor(b.y+b.h/2-camY);
      const steps=Math.floor(dist/8);
      for(let s=1;s<steps;s++){
        if(s%2===0) continue;
        const t=s/steps; const px2=Math.floor(ax+(bx-ax)*t), py2=Math.floor(ay+(by-ay)*t);
        rect(px2,py2,2,2,'#fff4d6');
      }
    }
  }
  // boss HP bar
  if(boss && boss.alive){
    const bx=W/2-60, by=14;
    rect(bx-2,by-2,124,12,'#0b1020');
    rect(bx,by,120,8,'#3a1a24');
    rect(bx,by,120*(boss.hp/BOSS_HP),8,'#ff6f88');
    ctx.fillStyle='#fff4d6'; ctx.font='8px monospace'; ctx.fillText('TURRET KING', bx+30, by-4);
  }
  for(const pr of particles){ ctx.fillStyle=pr.color; ctx.fillRect(Math.floor(pr.x-camX),Math.floor(pr.y-camY),2,2); }
  // damage numbers
  ctx.font='bold 8px monospace';
  ctx.textAlign='center';
  for(const dn of damageNums){
    const a = Math.min(1, dn.life/20);
    const dx = Math.floor(dn.x - camX), dy = Math.floor(dn.y - camY);
    ctx.fillStyle = 'rgba(11,16,32,'+a+')';
    ctx.fillText(dn.text, dx+1, dy+1);
    ctx.fillStyle = dn.color.length===7 ? dn.color : dn.color;
    ctx.globalAlpha = a;
    ctx.fillText(dn.text, dx, dy);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign='left';
  drawWeather(camX,camY);
  drawTransition();
  ctx.restore();
}
function drawBackground(biome){
  if(biome==='cave'||biome==='bonus'){
    ctx.fillStyle='#1a1a2e'; ctx.fillRect(0,0,W,H);
    // dripping highlights
    ctx.fillStyle='#2a2a4a';
    for(let i=0;i<8;i++){ const cx=((i*100)-(cam.x*0.3)%200); ctx.fillRect(cx,0,40,30+i*3); }
    return;
  }
  if(biome==='boss'){
    ctx.fillStyle='#2a1820'; ctx.fillRect(0,0,W,H);
    // ominous red glow at top
    const g=ctx.createLinearGradient(0,0,0,H/2);
    g.addColorStop(0,'rgba(180,40,60,0.4)'); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H/2);
    return;
  }
  if(biome==='beach'){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#b6e6ff'); g.addColorStop(0.6,'#dff4ff'); g.addColorStop(1,'#fff5d8');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // distant water line + sun
    ctx.fillStyle='#ffe9a8'; ctx.beginPath(); ctx.arc(W-60,40,16,0,Math.PI*2); ctx.fill();
    // palm placeholders
    ctx.fillStyle='#3a8a4a';
    for(let i=0;i<5;i++){
      const cx = ((i*180) - (cam.x*0.5) % 360);
      ctx.fillRect(cx+10, H-110, 4, 40);
      // fronds
      for(let j=-2;j<=2;j++){ ctx.fillRect(cx+10+j*4, H-115+Math.abs(j)*2, 4, 2); }
    }
    drawClouds();
    return;
  }
  // grove default
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#8bd6ff'); g.addColorStop(0.6,'#c9efff'); g.addColorStop(1,'#e8f7ff');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#a8e0c7';
  for(let i=0;i<4;i++){ const cx=((i*160)-(cam.x*0.2)%320); ctx.beginPath(); ctx.moveTo(cx-80,H-70); ctx.quadraticCurveTo(cx,H-140,cx+80,H-70); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle='#7dc9a6';
  for(let i=0;i<5;i++){ const cx=((i*120)-(cam.x*0.4)%240); ctx.beginPath(); ctx.moveTo(cx-60,H-60); ctx.quadraticCurveTo(cx,H-110,cx+60,H-60); ctx.closePath(); ctx.fill(); }
  drawClouds();
}
function drawClouds(){
  ctx.fillStyle='#ffffff';
  for(let i=0;i<6;i++){ const cx=((i*140)-(cam.x*0.15)%280)+20; const cy=30+(i%2)*18; puff(cx,cy,10); puff(cx+10,cy-4,8); puff(cx+20,cy,9); }
}
// ---- rendering: pixel primitives + draw* + weather + transition + fmtTotalTime live in entities.js ----
