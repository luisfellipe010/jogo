/* Blip's Grove — ui.js
 *
 * In-game DOM UI layered over the canvas, plus boot wiring.
 *   - HUD: health bars, gem counters, power-up badges, combo meter, toasts
 *   - Banners: title / win / lose / pause overlays (showBanner/hideBanner)
 *   - Animated title screen art + world map with per-level stats & medals
 *   - Shop panel (gem upgrades), settings panel, rebind screens
 *
 * The full-screen main menu is menu.js; this file owns everything shown
 * during and around actual gameplay.
 */
// HUD
function updateHud(){
  if(!players[0]) return;
  document.getElementById('hp1').style.width=(Math.max(0,players[0].hp)/(players[0].maxHp||MAX_HP)*100)+'%';
  document.getElementById('gems1').textContent=players[0].gems;
  setPuBadge('pu1', players[0]);
  if(players.length===2){
    document.getElementById('p2Hud').style.visibility='visible';
    document.getElementById('hp2').style.width=(Math.max(0,players[1].hp)/(players[1].maxHp||MAX_HP)*100)+'%';
    document.getElementById('gems2').textContent=players[1].gems;
    setPuBadge('pu2', players[1]);
  } else { document.getElementById('p2Hud').style.visibility='hidden'; }
  // Run timer in HUD
  const rt = document.getElementById('runTimer');
  if(rt){
    if(gameState==='play'){
      const total = runElapsedAtLevel + (performance.now() - levelStartTime)/1000;
      rt.textContent = '⏱ ' + fmtTotalTime(total) + '  ·  ♥ ' + lives;
      rt.style.display = '';
    } else { rt.style.display = 'none'; }
  }
  // M5.3 Ghost HUD indicator
  const gh = document.getElementById('ghostPip');
  if(gh){
    if(gameState==='play' && ghostIsVisible()){
      const pct = ghostTotalFrames() > 0 ? ghostCurrentFrame() / ghostTotalFrames() : 0;
      gh.style.display = '';
      gh.style.opacity = 0.55 + 0.45 * Math.sin(Date.now() * 0.004);
      // fill a tiny progress bar showing ghost position
      const bar = document.getElementById('ghostBar');
      if(bar) bar.style.width = Math.min(100, pct * 100).toFixed(1) + '%';
    } else {
      if(gh) gh.style.display = 'none';
    }
  }
  // ── Infinite mode HUD ──
  if(typeof isInfiniteMode==='function' && isInfiniteMode()){
    if(typeof drawInfiniteHud==='function') drawInfiniteHud();
  } else {
    if(typeof hideInfiniteHud==='function') hideInfiniteHud();
  }
  // ── Online co-op net pip ──
  const netPip = document.getElementById('netPip');
  if(netPip){
    if(typeof netIsActive==='function' && netIsActive()){
      netPip.style.display = 'flex';
      const lbl = document.getElementById('netPipLabel');
      if(lbl) lbl.textContent = netIsHost() ? 'HOST' : 'GUEST';
    } else if(typeof lobbyIsActive==='function' && lobbyIsActive()){
      netPip.style.display = 'flex';
      const lbl = document.getElementById('netPipLabel');
      const count = typeof lobbyGetPlayers==='function' ? lobbyGetPlayers().length : 0;
      const isSpec = typeof lobbyIsSpectator==='function' && lobbyIsSpectator();
      if(lbl) lbl.textContent = isSpec ? '👁 SPEC' : (typeof lobbyIsHost==='function' && lobbyIsHost() ? `⚑ ${count}P` : `→ ${count}P`);
    } else {
      netPip.style.display = 'none';
    }
  }
  // ── Co-op HUD (ping pip + revive arcs) ──
  if(typeof coopUpdateHud === 'function' && typeof netIsActive === 'function' && netIsActive()){
    coopUpdateHud();
  }
}
// M5.2 Combo HUD
function updateComboHud(){
  const el = document.getElementById('comboPip');
  if(!el) return;
  if(!combo || combo < 2){
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.style.color = COMBO_COLORS[Math.min(combo, COMBO_MAX) - 1];
  el.textContent = 'x' + combo;
  // pulse animation — remove then re-add class
  el.classList.remove('pulse');
  void el.offsetWidth; // reflow
  el.classList.add('pulse');
}

function setPuBadge(id,p){
  const el=document.getElementById(id); if(!el) return;
  el.className='pu';
  if(!p.powerup){ el.textContent=''; return; }
  el.classList.add(p.powerup);
  if(p.powerup==='shield'){ el.textContent='◎'; }
  else if(p.powerup==='speed'){ const s=Math.max(0,(p.powerupT/1000)|0); el.textContent='» '+s+'s'; }
  else if(p.powerup==='glide'){ const s=Math.max(0,(p.powerupT/1000)|0); el.textContent='~ '+s+'s'; }
}

// Banner / menus
let toastTimer=null;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.display='block';
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.style.display='none', 1500);
}
function showBanner(title,html,primary='START',secondary=null,showModeRow=false){
  document.getElementById('bannerTitle').textContent=title;
  document.getElementById('bannerText').innerHTML=html||'';
  document.getElementById('bannerBody').innerHTML='';
  const pb=document.getElementById('primaryBtn'), sb=document.getElementById('secondaryBtn');
  pb.textContent=primary;
  if(secondary){ sb.style.display=''; sb.textContent=secondary; } else { sb.style.display='none'; }
  document.getElementById('modeRow').style.display=showModeRow?'':'none';
  document.getElementById('banner').style.display='flex';
  hideTitleArt();
  hidePauseMenu();
  hideSettingsMenu();
  updateStatsLine();
}
function hideBanner(){ 
  document.getElementById('banner').style.display='none'; 
  hideTitleArt(); 
  hidePauseMenu(); 
  hideSettingsMenu();
  // Hide title-only buttons when banner closes
  const edBtn = document.getElementById('titleEditorBtn');
  if(edBtn) edBtn.style.display = 'none';
  const infBtn = document.getElementById('titleInfiniteBtn');
  if(infBtn) infBtn.style.display = 'none';
  const netBtn = document.getElementById('titleNetBtn');
  if(netBtn) netBtn.style.display = 'none';
  const mpBtn = document.getElementById('titleMpBtn');
  if(mpBtn) mpBtn.style.display = 'none';
  const cuBtn = document.getElementById('titleCustomizeBtn');
  if(cuBtn) cuBtn.style.display = 'none';
  const mapCuBtn = document.getElementById('mapCustomizeBtn');
  if(mapCuBtn) mapCuBtn.style.display = 'none';
  const achBtn2 = document.getElementById('titleAchBtn');
  if(achBtn2) achBtn2.style.display = 'none';
  const scBtn2 = document.getElementById('titleScBtn');
  if(scBtn2) scBtn2.style.display = 'none';
}
function updateStatsLine(){
  const cleared = save.levelsCleared.length;
  const totalLevels = LEVELS.length;
  let extra = '';
  if(save.bestRunTime!==undefined){ extra = ` · 🏁 best run: ${fmtTotalTime(save.bestRunTime)}`; }
  const bank = save.gemsBank||0;
  document.getElementById('statsLine').innerHTML = `◆ Bank: ${bank} · Total gems: ${save.totalGems} · Levels cleared: ${cleared} / ${totalLevels}${extra}`;
}

// ---- ANIMATED TITLE ----
function showTitle(){
  gameState='title'; stopMusic();
  document.getElementById('bannerTitle').textContent="";
  document.getElementById('bannerText').innerHTML="";
  document.getElementById('bannerBody').innerHTML='';
  document.getElementById('primaryBtn').textContent='START';
  document.getElementById('secondaryBtn').style.display='';
  document.getElementById('secondaryBtn').textContent='WORLD MAP';
  document.getElementById('modeRow').style.display='';
  document.getElementById('banner').style.display='flex';
  showTitleArt();
  hidePauseMenu();
  hideSettingsMenu();
  updateModeButtons();
  updateStatsLine();
  // Show INFINITE MODE button on title
  let infBtn = document.getElementById('titleInfiniteBtn');
  if(!infBtn){
    infBtn = document.createElement('button');
    infBtn.id = 'titleInfiniteBtn';
    infBtn.className = 'ghost';
    infBtn.textContent = '∞ INFINITE';
    infBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    infBtn.addEventListener('click', ()=>{
      ensureAudio && ensureAudio();
      if(typeof startInfiniteMode === 'function') startInfiniteMode();
    });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(infBtn);
  }
  infBtn.style.display = '';

  // Show ONLINE CO-OP button on title
  let netBtn = document.getElementById('titleNetBtn');
  if(!netBtn){
    netBtn = document.createElement('button');
    netBtn.id = 'titleNetBtn';
    netBtn.className = 'ghost';
    netBtn.textContent = '🌐 ONLINE';
    netBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    netBtn.addEventListener('click', ()=>{
      ensureAudio && ensureAudio();
      if(typeof openNetLobby === 'function') openNetLobby();
    });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(netBtn);
  }
  netBtn.style.display = '';

  // Show MULTIPLAYER button on title (M6.2)
  let mpBtn = document.getElementById('titleMpBtn');
  if(!mpBtn){
    mpBtn = document.createElement('button');
    mpBtn.id = 'titleMpBtn';
    mpBtn.className = 'ghost';
    mpBtn.textContent = '⚑ MULTIPLAYER';
    mpBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    mpBtn.addEventListener('click', ()=>{
      ensureAudio && ensureAudio();
      if(typeof openLobbyUI === 'function') openLobbyUI();
    });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(mpBtn);
  }
  mpBtn.style.display = '';

  // Show EDITOR button on title
  let edBtn = document.getElementById('titleEditorBtn');
  if(!edBtn){
    edBtn = document.createElement('button');
    edBtn.id = 'titleEditorBtn';
    edBtn.className = 'ghost';
    edBtn.textContent = '✏ EDITOR';
    edBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    edBtn.addEventListener('click', ()=>{ hideBanner(); openEditor(); });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(edBtn);
  }
  edBtn.style.display = '';

  // M7: Show CUSTOMIZE button on title
  let cuBtn = document.getElementById('titleCustomizeBtn');
  if(!cuBtn){
    cuBtn = document.createElement('button');
    cuBtn.id = 'titleCustomizeBtn';
    cuBtn.className = 'ghost';
    cuBtn.textContent = '🎨 CUSTOMIZE';
    cuBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    cuBtn.addEventListener('click', ()=>{
      ensureAudio && ensureAudio();
      if(typeof openCustomizeMenu === 'function') openCustomizeMenu(0);
    });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(cuBtn);
  }
  cuBtn.style.display = '';

  // M6.3: ACHIEVEMENTS button
  let achBtn = document.getElementById('titleAchBtn');
  if(!achBtn){
    achBtn = document.createElement('button');
    achBtn.id = 'titleAchBtn';
    achBtn.className = 'ghost';
    achBtn.textContent = '★ ACHIEVEMENTS';
    achBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    achBtn.addEventListener('click', ()=>{ if(typeof openAchievementsPanel==='function') openAchievementsPanel(); });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(achBtn);
  }
  achBtn.style.display = '';

  // M6.3: SCORECARD button
  let scBtn = document.getElementById('titleScBtn');
  if(!scBtn){
    scBtn = document.createElement('button');
    scBtn.id = 'titleScBtn';
    scBtn.className = 'ghost';
    scBtn.textContent = '🏁 SCORECARD';
    scBtn.style.cssText = 'font:inherit;font-size:12px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:4px 4px 0 #0b1020;border:2px solid #0b1020;padding:9px 14px;cursor:pointer;';
    scBtn.addEventListener('click', ()=>{ if(typeof openScorecardPanel==='function') openScorecardPanel(); });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(scBtn);
  }
  scBtn.style.display = '';
}
function showTitleArt(){
  let el = document.getElementById('titleArt');
  if(!el){
    el = document.createElement('div');
    el.id = 'titleArt';
    el.className = 'title-art';
    el.innerHTML = `
      <div class="ta-logo">
        <span class="ta-l ta-l1">B</span><span class="ta-l ta-l2">L</span><span class="ta-l ta-l3">I</span><span class="ta-l ta-l4">P</span>
        <span class="ta-amp"> &amp; </span>
        <span class="ta-l ta-l5">B</span><span class="ta-l ta-l6">L</span><span class="ta-l ta-l7">O</span><span class="ta-l ta-l8">P</span>
      </div>
      <div class="ta-tag">A TINY GROVE RUN — FOR ONE OR TWO</div>
      <canvas class="ta-canvas" id="titleCanvas" width="220" height="80"></canvas>
    `;
    // Insert before bannerText so it stacks on top
    const card = document.querySelector('#banner .card');
    card.insertBefore(el, card.firstChild);
    startTitleArtAnim();
  }
  el.style.display='';
}
function hideTitleArt(){ const el=document.getElementById('titleArt'); if(el) el.style.display='none'; }

let titleArtRaf = 0;
function startTitleArtAnim(){
  cancelAnimationFrame(titleArtRaf);
  const tc = document.getElementById('titleCanvas');
  if(!tc) return;
  const tctx = tc.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  let t0 = performance.now();
  function draw(){
    if(gameState !== 'title'){ titleArtRaf = requestAnimationFrame(draw); return; }
    const t = (performance.now() - t0)/1000;
    const W = tc.width, H = tc.height;
    // Sky → grass gradient backdrop
    tctx.fillStyle = '#8bd6ff'; tctx.fillRect(0,0,W,H);
    // Distant hills
    tctx.fillStyle = '#7fb96e';
    for(let i=0;i<5;i++){
      const cx = (i*60 + (t*8)%60) - 20;
      tctx.beginPath();
      tctx.arc(cx, H-22, 24, Math.PI, 0); tctx.fill();
    }
    // Ground
    tctx.fillStyle = '#3fa75a'; tctx.fillRect(0, H-10, W, 10);
    tctx.fillStyle = '#2c7a40'; tctx.fillRect(0, H-2, W, 2);
    // Drifting leaves (background)
    for(let i=0;i<6;i++){
      const lx = ((i*42 - t*22) % (W+20) + (W+20)) % (W+20) - 10;
      const ly = 10 + (i*9)%30 + Math.sin(t*1.4 + i)*4;
      tctx.fillStyle = (i%2)?'#7ad88a':'#e8b455';
      tctx.fillRect(Math.floor(lx), Math.floor(ly), 2, 2);
    }
    // Two heroes posed center-stage, bobbing in sync
    const bob = Math.floor(Math.sin(t*3.2)*1.5);
    drawTitleHero(tctx, W/2 - 20, H - 32 + bob, P1_PAL, false);
    drawTitleHero(tctx, W/2 +  6, H - 32 + bob, P2_PAL, true);
    // Sparkles between them
    for(let i=0;i<3;i++){
      const sx = W/2 + Math.sin(t*2 + i*2)*10;
      const sy = H - 38 + Math.cos(t*2 + i*1.7)*4;
      tctx.fillStyle = (Math.floor(t*6 + i)%2)?'#ffd866':'#fff4d6';
      tctx.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
    }
    titleArtRaf = requestAnimationFrame(draw);
  }
  titleArtRaf = requestAnimationFrame(draw);
}
function drawTitleHero(c, x, y, pal, mirror){
  // Tiny pixel hero (12x14ish) — base/mid/hi/outline using palette
  c.save();
  if(mirror){ c.translate(x+12, y); c.scale(-1, 1); x = 0; y = 0; }
  // body
  c.fillStyle = pal.outline; c.fillRect(x+2, y+1, 8, 1); c.fillRect(x+1, y+2, 10, 11); c.fillRect(x+2, y+13, 8, 1);
  c.fillStyle = pal.base;    c.fillRect(x+2, y+2, 8, 11);
  c.fillStyle = pal.mid;     c.fillRect(x+3, y+3, 6, 4);  // face hi
  c.fillStyle = pal.hi;      c.fillRect(x+4, y+3, 4, 2);
  c.fillStyle = pal.shade;   c.fillRect(x+2, y+9, 8, 4);  // belly shadow
  c.fillStyle = pal.outline; c.fillRect(x+4, y+5, 1, 1); c.fillRect(x+7, y+5, 1, 1); // eyes
  c.fillStyle = pal.hat;     c.fillRect(x+1, y+1, 10, 1); c.fillRect(x+3, y, 6, 1);
  c.restore();
}

// ---- WORLD MAP ----
let expandedLevel = -1;
function showMap(){
  gameState='map'; stopMusic();
  document.getElementById('bannerTitle').textContent='WORLD MAP';
  document.getElementById('bannerText').innerHTML='Pick a level · click again for stats';
  renderMapBody();
  document.getElementById('primaryBtn').textContent = 'BACK';
  document.getElementById('primaryBtn').style.display = '';
  document.getElementById('secondaryBtn').style.display = '';
  document.getElementById('secondaryBtn').textContent = '◆ SHOP';
  document.getElementById('modeRow').style.display='none';
  document.getElementById('banner').style.display='flex';
  hideTitleArt(); hidePauseMenu(); hideSettingsMenu(); hideShopPanel();
  updateStatsLine();

  // M7: CUSTOMIZE button on world map
  let mapCuBtn = document.getElementById('mapCustomizeBtn');
  if(!mapCuBtn){
    mapCuBtn = document.createElement('button');
    mapCuBtn.id = 'mapCustomizeBtn';
    mapCuBtn.className = 'ghost';
    mapCuBtn.textContent = '🎨 CUSTOMIZE';
    mapCuBtn.style.cssText = 'font:inherit;font-size:11px;letter-spacing:2px;background:#fff4d6;color:#0b1020;box-shadow:3px 3px 0 #0b1020;border:2px solid #0b1020;padding:7px 12px;cursor:pointer;';
    mapCuBtn.addEventListener('click', ()=>{
      if(typeof openCustomizeMenu === 'function') openCustomizeMenu(0);
    });
    const row = document.querySelector('#banner .row');
    if(row) row.appendChild(mapCuBtn);
  }
  mapCuBtn.style.display = '';
}
function renderMapBody(){
  let html = '<div class="map-grid">';
  for(let i=0;i<LEVELS.length;i++){
    const cleared = save.levelsCleared.includes(i);
    const best = save.bestTimes[i];
    const meds = medalsFor(i);
    const isOpen = expandedLevel===i;
    html += `<div class="lvl-card ${cleared?'cleared':''} ${isOpen?'open':''}" data-level="${i}">
      <div class="lvl-head">
        <div class="lvl-num">${i+1}</div>
        <div class="lvl-name">${LEVELS[i].name}</div>
        <div class="lvl-status">${cleared?'✓':'···'}</div>
      </div>
      <div class="lvl-meta">
        <span class="lvl-time">${best!==undefined?'⏱ '+best.toFixed(2)+'s':'⏱ —'}</span>
        <span class="lvl-medals">${MEDAL_KEYS.map(k=>`<span class="medal ${meds.includes(k)?'on':''}" title="${MEDAL_LABELS[k]}">${MEDAL_GLYPHS[k]}</span>`).join('')}</span>
      </div>
      ${isOpen?renderLevelStats(i):''}
      <div class="lvl-actions">
        <button class="lvl-play" data-play="${i}">▶ PLAY</button>
      </div>
    </div>`;
  }
  html += '</div>';
  document.getElementById('bannerBody').innerHTML = html;
  document.querySelectorAll('.lvl-card').forEach(el=>{
    el.addEventListener('click', e=>{
      if(e.target.closest('.lvl-play')) return; // play button handled separately
      const i=+el.dataset.level;
      expandedLevel = (expandedLevel===i ? -1 : i);
      renderMapBody();
    });
  });
  document.querySelectorAll('.lvl-play').forEach(b=>{
    b.addEventListener('click', e=>{ e.stopPropagation(); const i=+b.dataset.play; startTransition(()=>startLevel(i)); });
  });
}
function renderLevelStats(i){
  const meds = medalsFor(i);
  const best = save.bestTimes[i];
  const target = SPEEDRUN_TARGETS[i];
  const checks = [
    ['clear','Clear the level'],
    ['noDamage','Clear without taking a hit'],
    ['allGems','Collect every gem in one run'],
    ['speedrun', target!==undefined?`Clear in under ${target}s`:'—'],
    ['secret','Find the secret bonus room'],
  ];
  let h = '<div class="lvl-detail">';
  h += `<div class="lvl-best">Best: ${best!==undefined?best.toFixed(2)+'s':'—'}</div>`;
  h += '<ul class="medal-list">';
  for(const [k,desc] of checks){
    const on = meds.includes(k);
    h += `<li class="${on?'on':''}"><span class="medal ${on?'on':''}">${MEDAL_GLYPHS[k]}</span><span class="mlabel">${MEDAL_LABELS[k]}</span><span class="mdesc">${desc}</span></li>`;
  }
  h += '</ul></div>';
  return h;
}

// ---- SHOP PANEL ----
function showShopPanel(){
  let el = document.getElementById('shopPanel');
  if(!el){
    el = document.createElement('div');
    el.id = 'shopPanel';
    el.className = 'shop-panel';
    document.body.appendChild(el);
  }
  el.style.display = '';
  // Slide in
  requestAnimationFrame(()=>{ el.classList.add('open'); });
  renderShopPanel(el);
}
function hideShopPanel(){
  const el = document.getElementById('shopPanel');
  if(el){ el.classList.remove('open'); el.style.display = 'none'; }
}
function renderShopPanel(el){
  const bank = save.gemsBank||0;
  let h = `<div class="shop-head">
    <div class="shop-title">◆ GEM SHOP</div>
    <div class="shop-bank">Bank: <b>${bank}</b> ◆</div>
    <button class="shop-close" data-act="close">×</button>
  </div>
  <div class="shop-list">`;
  for(const item of SHOP_ITEMS){
    const lvl = save.upgrades[item.id]||0;
    const cost = shopItemCost(item);
    const maxed = lvl>=item.max;
    const canAfford = cost!==null && bank >= cost;
    const dots = Array.from({length:item.max},(_,i)=>`<span class="pdot ${i<lvl?'on':''}"></span>`).join('');
    h += `<div class="shop-item ${maxed?'maxed':''}">
      <div class="si-row">
        <div class="si-icon">${shopIconFor(item.id)}</div>
        <div class="si-info">
          <div class="si-name">${item.name}</div>
          <div class="si-desc">${item.desc}</div>
          <div class="si-pips">${dots}</div>
        </div>
        <button class="si-buy ${canAfford?'':'no'}" data-buy="${item.id}" ${maxed||!canAfford?'disabled':''}>
          ${maxed?'MAX':`${cost} ◆`}
        </button>
      </div>
    </div>`;
  }
  h += `</div>
  <div class="shop-foot">
    <button class="shop-refund" data-act="refund">REFUND ALL</button>
  </div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-buy]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.dataset.buy;
      if(buyUpgrade(id)){
        sfxGem && sfxGem();
        const item = SHOP_ITEMS.find(s=>s.id===id);
        const lvl = save.upgrades[id]||0;
        toast(`${item.name.toUpperCase()}${item.max>1?' '+lvl+'/'+item.max:''} \u2713`);
        renderShopPanel(el); updateStatsLine();
      }
      else { sfxBump && sfxBump(); }
    });
  });
  el.querySelector('[data-act="close"]').addEventListener('click', hideShopPanel);
  el.querySelector('[data-act="refund"]').addEventListener('click', ()=>{
    const r = refundAllUpgrades();
    toast(`Refunded ${r} ◆`);
    renderShopPanel(el); updateStatsLine();
  });
}
function shopIconFor(id){
  const map = {
    heart: '♥', dash: '»', glide: '~', life: '♤', gem2x: '◆×2', magnet: '◜'
  };
  return `<span class="si-glyph ${id}">${map[id]||'?'}</span>`;
}
function openMap(){ if(gameState==='play'||gameState==='paused'){ stopMusic(); showMap(); } }

// ---- PAUSE MENU ----
function togglePause(){
  if(gameState==='play'){ gameState='paused'; stopMusic(); showPauseMenu(); }
  else if(gameState==='paused'){ gameState='play'; if(!muted) startMusic(currentBiome()); hideBanner(); }
}
function showPauseMenu(){
  // Use the banner card but render a custom panel inside body
  document.getElementById('bannerTitle').textContent = 'PAUSED';
  document.getElementById('bannerText').innerHTML = `<span style="font-size:11px;opacity:.7;">Level ${currentLevel+1} · ${LEVELS[currentLevel].name}</span>`;
  document.getElementById('bannerBody').innerHTML = '';
  document.getElementById('modeRow').style.display = 'none';
  // Hide standard primary/secondary; we'll render our own button stack
  document.getElementById('primaryBtn').style.display = 'none';
  document.getElementById('secondaryBtn').style.display = 'none';
  // Build pause panel
  let el = document.getElementById('pauseMenu');
  if(!el){
    el = document.createElement('div');
    el.id = 'pauseMenu';
    el.className = 'pause-menu';
    document.querySelector('#banner .card').insertBefore(el, document.getElementById('statsLine'));
  }
  el.style.display = '';
  el.innerHTML = `
    <button class="pmbtn" data-act="resume">▶ RESUME</button>
    <button class="pmbtn" data-act="restart">↻ RESTART LEVEL</button>
    <button class="pmbtn" data-act="settings">⚙ SETTINGS</button>
    <button class="pmbtn" data-act="map">▦ WORLD MAP</button>
    ${(typeof netIsActive==='function' && netIsActive()) ? '<button class="pmbtn" data-act="cooplobby">⚑ CO-OP LOBBY</button>' : ''}
    ${(typeof lobbyIsActive==='function' && lobbyIsActive()) ? '<button class="pmbtn" data-act="mplobby">⚑ MULTIPLAYER LOBBY</button>' : ''}
    <button class="pmbtn ghost" data-act="quit">⏏ QUIT TO TITLE</button>
  `;
  el.querySelectorAll('.pmbtn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const a = b.dataset.act;
      if(a==='resume') togglePause();
      else if(a==='restart'){ togglePause(); resetLevel(); }
      else if(a==='settings') showSettingsMenu('pause');
      else if(a==='map'){ showMap(); }
      else if(a==='cooplobby'){ hideBanner(); if(typeof openCoopLobby==='function') openCoopLobby(); }
      else if(a==='mplobby'){  hideBanner(); if(typeof openLobbyUI==='function')    openLobbyUI();   }
      else if(a==='quit'){ showTitle(); }
    });
  });
  document.getElementById('banner').style.display='flex';
  hideTitleArt(); hideSettingsMenu();
}
function hidePauseMenu(){
  const el=document.getElementById('pauseMenu'); if(el) el.style.display='none';
  // Restore standard buttons
  document.getElementById('primaryBtn').style.display = '';
}

// ---- SETTINGS MENU ----
let settingsReturnTo = 'title';
function showSettingsMenu(returnTo){
  settingsReturnTo = returnTo || 'title';
  document.getElementById('bannerTitle').textContent = 'SETTINGS';
  document.getElementById('bannerText').innerHTML = '';
  document.getElementById('bannerBody').innerHTML = '';
  document.getElementById('modeRow').style.display = 'none';
  document.getElementById('primaryBtn').style.display = 'none';
  document.getElementById('secondaryBtn').style.display = 'none';
  hidePauseMenu(); hideTitleArt();
  let el = document.getElementById('settingsMenu');
  if(!el){
    el = document.createElement('div');
    el.id = 'settingsMenu';
    el.className = 'settings-menu';
    document.querySelector('#banner .card').insertBefore(el, document.getElementById('statsLine'));
  }
  el.style.display='';
  renderSettingsMenu(el);
  document.getElementById('banner').style.display='flex';
}
function hideSettingsMenu(){ const el=document.getElementById('settingsMenu'); if(el) el.style.display='none'; document.getElementById('primaryBtn').style.display=''; }
function returnFromSettings(){
  hideSettingsMenu();
  if(settingsReturnTo==='pause'){ showPauseMenu(); }
  else { showTitle(); }
}
function renderSettingsMenu(el){
  const s = settings;
  el.innerHTML = `
    <div class="set-row">
      <label>Master volume</label>
      <input type="range" min="0" max="1" step="0.05" value="${s.volMaster}" data-k="volMaster" />
      <span class="set-val">${Math.round(s.volMaster*100)}%</span>
    </div>
    <div class="set-row">
      <label>SFX volume</label>
      <input type="range" min="0" max="1" step="0.05" value="${s.volSfx}" data-k="volSfx" />
      <span class="set-val">${Math.round(s.volSfx*100)}%</span>
    </div>
    <div class="set-row">
      <label>Music volume</label>
      <input type="range" min="0" max="1" step="0.05" value="${s.volMusic}" data-k="volMusic" />
      <span class="set-val">${Math.round(s.volMusic*100)}%</span>
    </div>
    <div class="set-row toggle">
      <label>Colorblind palette</label>
      <button class="tog ${s.colorblind?'on':''}" data-k="colorblind">${s.colorblind?'ON':'OFF'}</button>
    </div>
    <div class="set-row toggle">
      <label>Reduced motion</label>
      <button class="tog ${s.reducedMotion?'on':''}" data-k="reducedMotion">${s.reducedMotion?'ON':'OFF'}</button>
    </div>
    <div class="set-row toggle">
      <label>Race ghost</label>
      <button class="tog ${s.raceGhost!==false?'on':''}" data-k="raceGhost">${s.raceGhost!==false?'ON':'OFF'}</button>
    </div>
    <div class="set-section">KEYBOARD — P1</div>
    ${renderBindRows('p1', false)}
    <div class="set-section">KEYBOARD — P2</div>
    ${renderBindRows('p2', false)}
    <div class="set-section">GAMEPAD — P1 ${gamepadStatusText()}</div>
    ${renderBindRows('p1', true)}
    <div class="set-section">GAMEPAD — P2</div>
    ${renderBindRows('p2', true)}
    <div class="set-actions">
      <button class="pmbtn ghost" data-act="reset-binds">RESET BINDINGS</button>
      <button class="pmbtn" data-act="back">◀ BACK</button>
    </div>
  `;
  // Wire controls
  el.querySelectorAll('input[type=range]').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const k = inp.dataset.k;
      settings[k] = parseFloat(inp.value);
      saveSettings();
      if(typeof applyVolumes==='function') applyVolumes();
      const v = inp.parentElement.querySelector('.set-val');
      if(v) v.textContent = Math.round(parseFloat(inp.value)*100)+'%';
    });
  });
  el.querySelectorAll('.tog').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.dataset.k;
      settings[k] = !settings[k];
      saveSettings();
      btn.classList.toggle('on');
      btn.textContent = settings[k]?'ON':'OFF';
    });
  });
  el.querySelectorAll('.bind-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.action;
      const player = btn.dataset.player;
      const isGp = btn.dataset.gp === '1';
      btn.textContent = isGp ? '… press button' : '… press a key';
      btn.classList.add('binding');
      if(isGp){
        setGamepadCapture(idx => {
          setGpBinding(player, action, idx);
          renderSettingsMenu(el);
        });
      } else {
        setKeyCapture(code => {
          setBinding(player, action, code);
          renderSettingsMenu(el);
        });
      }
    });
  });
  el.querySelectorAll('[data-act]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const a = b.dataset.act;
      if(a==='back') returnFromSettings();
      else if(a==='reset-binds'){ resetBindings(); renderSettingsMenu(el); }
    });
  });
}
function renderBindRows(player, isGp){
  const actions = isGp
    ? [['jump','Jump'],['dash','Dash'],['action','Action'],['left','Left'],['right','Right'],['up','Up']]
    : (player==='p2'
        ? [['left','Left'],['right','Right'],['jump','Jump / Up'],['dash','Dash']]  // P2: up===jump, hide separate 'up'
        : [['left','Left'],['right','Right'],['up','Up'],['jump','Jump'],['dash','Dash']]);
  const map = isGp ? settings.gpBindings[player] : settings.bindings[player];
  let h = '<div class="bind-grid">';
  for(const [k, label] of actions){
    const v = map[k];
    const display = isGp ? prettyGpBtn(v) : prettyKey(v);
    h += `<div class="bind-row">
      <span class="bind-label">${label}</span>
      <button class="bind-btn" data-player="${player}" data-action="${k}" data-gp="${isGp?1:0}">${display}</button>
    </div>`;
  }
  h += '</div>';
  return h;
}
function gamepadStatusText(){
  if(typeof navigator==='undefined' || !navigator.getGamepads) return '<span class="set-status off">no API</span>';
  const list = navigator.getGamepads();
  let n = 0; for(let i=0;i<(list?.length||0);i++) if(list[i] && list[i].connected) n++;
  return n>0 ? `<span class="set-status on">${n} connected</span>` : `<span class="set-status off">none connected</span>`;
}

// Keep gamepad status fresh while settings menu is open
window.addEventListener('gamepadconnected', ()=>{ const el=document.getElementById('settingsMenu'); if(el && el.style.display!=='none') renderSettingsMenu(el); });
window.addEventListener('gamepaddisconnected', ()=>{ const el=document.getElementById('settingsMenu'); if(el && el.style.display!=='none') renderSettingsMenu(el); });

function updateModeButtons(){ document.getElementById('mode1Btn').classList.toggle('sel',numPlayers===1); document.getElementById('mode2Btn').classList.toggle('sel',numPlayers===2); }
document.getElementById('mode1Btn').addEventListener('click',()=>{ numPlayers=1; updateModeButtons(); });
document.getElementById('mode2Btn').addEventListener('click',()=>{ numPlayers=2; updateModeButtons(); });
document.getElementById('primaryBtn').addEventListener('click',()=>{
  ensureAudio(); if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume();
  if(gameState==='title'){
    // M6.3: play intro cutscene before first level
    if(typeof cutscenePlay==='function'){
      cutscenePlay('intro', ()=>startLevel(0));
    } else {
      startLevel(0);
    }
  }
  else if(gameState==='paused'){ togglePause(); }
  else if(gameState==='map'){ showTitle(); }
  else if(gameState==='dead'){
    if(typeof isInfiniteMode==='function' && isInfiniteMode()){ exitInfiniteMode(); }
    else resetLevel();
  }
  else if(gameState==='levelClear'){
    // ── Infinite mode: next floor ──
    if(typeof isInfiniteMode==='function' && isInfiniteMode()){
      hideBanner();
      if(typeof infiniteNextLevel==='function') infiniteNextLevel();
      return;
    }
    // ── Normal mode ──
    if(currentLevel>=LEVELS.length-1){ showMap(); }
    else {
      hideBanner();
      const next = currentLevel+1;
      // M6.3: play biome-transition cutscene if applicable
      const BIOME_CS = { 0:'grove_beach', 1:'beach_cave', 2:'cave_sky' };
      const csId = BIOME_CS[currentLevel];
      if(csId && typeof cutscenePlay==='function' && typeof cutsceneIsPlaying==='function'){
        startTransition(()=>{ cutscenePlay(csId, ()=>startLevel(next)); });
      } else {
        startTransition(()=>{ startLevel(next); });
      }
    }
  }
});
document.getElementById('secondaryBtn').addEventListener('click',()=>{
  if(gameState==='map'){ showShopPanel(); return; }
  // ── Infinite mode: exit on secondaryBtn during levelClear ──
  if(gameState==='levelClear' && typeof isInfiniteMode==='function' && isInfiniteMode()){
    if(typeof exitInfiniteMode==='function') exitInfiniteMode();
    return;
  }
  if(gameState==='title' || gameState==='paused' || gameState==='dead' || gameState==='levelClear' || gameState==='win'){ showMap(); }
});
document.getElementById('mapBtn').addEventListener('click',()=>{ if(gameState==='play') openMap(); else if(gameState!=='map') showMap(); });
document.getElementById('muteBtn').addEventListener('click',toggleMute);
document.getElementById('pauseBtn').addEventListener('click',togglePause);

function loop(t){ const dt=Math.min(50,t-lastT||16); lastT=t; update(dt); draw(); requestAnimationFrame(loop); }

// ---- M5.5: ?play= URL boot ----
function tryBootFromURL(){
  const params = new URLSearchParams(window.location.search);
  const code = params.get('play');
  if(!code) return false;
  try {
    const decoded = decodeURIComponent(escape(atob(code)));
    const parts = decoded.split('|');
    const name  = parts[0];
    const cols  = parseInt(parts[1]);
    const rows  = parseInt(parts[2]);
    const rowStrs = parts.slice(3);
    if(rowStrs.length !== rows) throw new Error('row mismatch');
    const mapRows = rowStrs; // keep as strings — loadMap() wants string rows
    // Inject as a temporary LEVELS[0] and play immediately
    LEVELS.unshift({ name: name || 'SHARED MAP', biome: 'grove', map: mapRows, _isShared: true });
    numPlayers = 1;
    hideBanner();
    startTransition(() => startLevel(0));
    toast('SHARED MAP: ' + (name || 'UNTITLED'));
    return true;
  } catch(e){
    console.warn('?play= decode failed:', e);
    return false;
  }
}

// Boot — load level 0 into buffer for backdrop
loadMap(LEVELS[0].map); spawnPlayers({x:80,y:120});
// M7: load character customization from localStorage
if(typeof loadCustomization === 'function') loadCustomization();
if(!tryBootFromURL()) showTitle();
// M6: auto-open net lobby if ?join= URL detected (share-link flow)
if(typeof netCheckAutoJoin === 'function') netCheckAutoJoin();
// M6.2: auto-join multiplayer lobby if ?room= URL detected
if(typeof lobbyCheckAutoJoin === 'function') lobbyCheckAutoJoin();
requestAnimationFrame(loop);
