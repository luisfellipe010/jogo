/* Blip's Grove — entities & rendering: pixel primitives, tile/entity draw,
 * weather, transitions, time formatter.
 *
 * Pure render layer. All state belongs to engine.js — these functions only read
 * globals (ctx, tick, players, enemies, boss, particles, hiddenBlocks,
 * toggleGates, locks, cannons, weather, transition, cam, W, H, TS,
 * currentBiome(), reducedMotion()) and call the small px()/rect() primitives
 * defined here.
 *
 * Extracted from engine.js v12 to keep the engine file under ~1300 lines.
 */

function puff(x,y,r){ ctx.fillRect(x-r,y-r/2,r*2,r); ctx.fillRect(x-r/2,y-r,r,r*2); }
function px(x,y,c){ ctx.fillStyle=c; ctx.fillRect(x,y,1,1); }
function rect(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }

function drawTile(c,x,y,wx,wy){
  const biome = currentBiome();
  if(c==='#'){
    if(biome==='beach'){
      // sand top
      rect(x,y,TS,TS,'#c89a5a');
      rect(x,y+2,TS,4,'#f0d090');
      rect(x,y,TS,2,'#fbe5ad');
      px(x+3,y+10,'#a87a3a'); px(x+11,y+13,'#a87a3a'); px(x+7,y+7,'#7a4a1a');
    } else {
      rect(x,y,TS,TS,'#6b3d1f');
      rect(x,y+2,TS,4,'#4aa84a');
      rect(x,y,TS,2,'#6bd26b');
      for(let i=0;i<3;i++) px(x+2+i*6,y+1,'#9cf09c');
      px(x+3,y+10,'#8a5a3a'); px(x+11,y+13,'#8a5a3a'); px(x+7,y+7,'#5a2f18');
    }
    rect(x,y+TS-1,TS,1,'#3a200f');
  } else if(c==='='){
    if(biome==='beach'){
      rect(x,y,TS,TS,'#a87a3a');
      rect(x,y,TS,2,'#c89a5a');
      px(x+3,y+6,'#7a4a1a'); px(x+11,y+4,'#7a4a1a'); px(x+7,y+12,'#5a3010');
    } else {
      rect(x,y,TS,TS,'#7a4822'); rect(x,y,TS,2,'#8a5529');
      px(x+3,y+6,'#5a3418'); px(x+11,y+4,'#5a3418'); px(x+7,y+12,'#5a3418'); px(x+14,y+10,'#9a6333');
    }
    rect(x,y+TS-1,TS,1,'#3a200f');
  } else if(c==='B'){
    if(biome==='cave'||biome==='bonus'){
      rect(x,y,TS,TS,'#3a3a5a');
      rect(x,y,TS,2,'#5a5a7a');
      rect(x,y+TS-2,TS,2,'#1a1a3a');
      rect(x+(TS/2|0),y,1,TS/2|0,'#1a1a3a'); rect(x,y+(TS/2|0),TS,1,'#1a1a3a');
      // glow specks
      if((wx+wy)%5===0) px(x+TS/2|0,y+TS/2|0,'#7ff2e2');
    } else if(biome==='boss'){
      rect(x,y,TS,TS,'#3a1a2a');
      rect(x,y,TS,2,'#5a3a4a');
      rect(x,y+TS-2,TS,2,'#1a0a18');
    } else {
      rect(x,y,TS,TS,'#8892a6'); rect(x,y,TS,2,'#a2adc3'); rect(x,y+TS-2,TS,2,'#5b6378');
      rect(x+(TS/2|0),y,1,TS/2|0,'#5b6378'); rect(x,y+(TS/2|0),TS,1,'#5b6378');
      rect(x+(TS/4|0),y+(TS/2|0),1,TS/2|0,'#5b6378'); rect(x+(3*TS/4|0),y+(TS/2|0),1,TS/2|0,'#5b6378');
    }
  } else if(c==='P'){
    rect(x,y,TS,8,'#c49256'); rect(x,y,TS,2,'#e0b074'); rect(x,y+6,TS,2,'#7a5629');
    px(x+3,y+3,'#7a5629'); px(x+10,y+4,'#7a5629'); px(x+14,y+3,'#7a5629');
  } else if(c==='?'){
    const wx0=wx*TS, wy0=wy*TS;
    const hb=hiddenBlocks.find(h=>h.x===wx0&&h.y===wy0);
    const offset=hb&&hb.bumpT>0?-Math.sin((12-hb.bumpT)/12*Math.PI)*4:0;
    if(hb&&hb.used){ rect(x,y+offset,TS,TS,'#6b5028'); rect(x,y+offset,TS,2,'#8a6a36'); rect(x,y+TS-2+offset,TS,2,'#453010'); }
    else { rect(x,y+offset,TS,TS,'#e0a63a'); rect(x,y+offset,TS,2,'#ffd77a'); rect(x,y+TS-2+offset,TS,2,'#9a6a14'); rect(x+7,y+4+offset,4,2,'#fff4d6'); rect(x+10,y+6+offset,2,3,'#fff4d6'); rect(x+8,y+8+offset,2,2,'#fff4d6'); px(x+8,y+12+offset,'#fff4d6'); }
  } else if(c==='^'){
    rect(x,y+TS-2,TS,2,'#6b3d1f');
    for(let i=0;i<3;i++){ const sx=x+i*6+1; rect(sx+2,y+TS-8,1,1,'#e6edf5'); rect(sx+1,y+TS-7,3,1,'#e6edf5'); rect(sx,y+TS-6,5,1,'#c8d0dd'); rect(sx,y+TS-5,5,1,'#a0a8b5'); rect(sx,y+TS-4,5,1,'#7c8390'); }
  } else if(c==='~'){
    // water (decorative, drawn behind ground line)
    const t = tick*0.05;
    rect(x,y,TS,TS,'#3a8ad6');
    rect(x,y+1+Math.floor(Math.sin(t+x*0.1)*1),TS,2,'#7fc6f5');
  } else if(c==='J'){
    // toggle gate (closed) — distinguish from plate gate via dashed cap
    const tg = toggleGates.find(g=> (g.x/TS|0)===wx && (g.y/TS|0)===wy );
    const off = tg ? Math.floor(tg.opening * TS) : 0;
    rect(x, y+off, TS, TS-off, '#c66a3a'); // warm orange = lever-controlled
    rect(x, y+off, TS, 2, '#ffb585');
    rect(x, y+TS-2, TS, 2, '#7a3818');
    for(let i=2;i<TS-2;i+=4) px(x+i, y+4+off, '#7a3818');
    for(let i=2;i<TS-2;i+=4) px(x+i+1, y+TS-4, '#ffd0a8');
  } else if(c==='l'){
    // lock — finds by position, look up color
    const lk = locks.find(L=> (L.x/TS|0)===wx && (L.y/TS|0)===wy );
    const col = lk ? lk.color : '#fff';
    const op = lk ? lk.opening : 0;
    const sh = Math.floor(op * 6);
    rect(x+1, y+1+sh, TS-2, TS-2-sh, '#5a4028');
    rect(x+2, y+2+sh, TS-4, TS-4-sh, col);
    rect(x+2, y+2+sh, TS-4, 2, '#fff');
    // keyhole
    if(op<0.5){
      rect(x+TS/2-1, y+5, 2, 4, '#1a1020');
      rect(x+TS/2-2, y+8, 4, 3, '#1a1020');
    }
  } else if(c==='q' || c==='e'){
    // conveyor belt
    rect(x, y, TS, TS-2, '#3a3340');
    rect(x, y, TS, 2, '#5a5060');
    rect(x, y+TS-2, TS, 2, '#1a1020');
    // moving chevrons
    const dir = (c==='e') ? 1 : -1;
    const t = Math.floor(tick * 0.4) % 6;
    for(let i=0; i<3; i++){
      const cx = x + ((i*6 + (dir>0?t:6-t))|0) % TS;
      px(cx, y+5, '#ffd866');
      px(cx+1, y+6, '#ffd866');
      px(cx, y+7, '#ffd866');
    }
  } else if(c==='i'){
    // ice tile
    rect(x, y, TS, TS, '#a8e8ff');
    rect(x, y, TS, 2, '#e0f6ff');
    rect(x, y+TS-2, TS, 2, '#5aa8d6');
    px(x+3, y+5, '#fff'); px(x+4, y+5, '#fff');
    px(x+11, y+11, '#fff'); px(x+12, y+11, '#fff');
    rect(x+7, y+8, 3, 1, '#d6f0ff');
  } else if(c==='n'){
    // cannon
    const cn = cannons.find(cc=> (cc.x/TS|0)===wx && (cc.y/TS|0)===wy );
    const dir = cn ? cn.dir : 1;
    const kick = cn ? Math.max(0, cn.kickT/12) * 3 : 0;
    // base
    rect(x+1, y+1, TS-2, TS-2, '#454a55');
    rect(x+1, y+1, TS-2, 2, '#6a7180');
    rect(x+1, y+TS-3, TS-2, 2, '#252a35');
    // barrel pointing in dir
    const bw = TS-6, bh = 8;
    const bx = dir>0 ? (x + 4 + kick) : (x + 2 - kick);
    rect(bx, y+5, bw, bh, '#2a2f38');
    rect(bx, y+5, bw, 2, '#5a606a');
    // muzzle ring
    if(dir>0) rect(bx+bw-2, y+4, 2, bh+2, '#1a1d24');
    else rect(bx, y+4, 2, bh+2, '#1a1d24');
  } else if(c==='>' || c==='<'){
    // wind gust tile — animated chevrons blowing in direction
    const wdir = c==='>' ? 1 : -1;
    const t = Math.floor(tick * 0.35) % TS;
    rect(x, y, TS, TS, '#c8eeff');
    rect(x, y, TS, 2, '#e8f8ff');
    rect(x, y+TS-2, TS, 2, '#8ac8e8');
    // animated chevron arrows
    for(let i=0; i<3; i++){
      const cx = wdir>0
        ? x + ((i*6 + t) % TS)
        : x + TS - 1 - ((i*6 + t) % TS);
      const mid = y + TS/2;
      px(cx, mid|0, '#5a9fc8');
      px(cx, (mid-1)|0, '#5a9fc8');
      px(cx + wdir, (mid-2)|0, '#5a9fc8');
      px(cx + wdir, (mid+1)|0, '#5a9fc8');
    }
  }
}
function drawMover(x,y,w,h){ x=Math.floor(x); y=Math.floor(y); rect(x,y,w,2,'#e0b074'); rect(x,y+2,w,h-4,'#c49256'); rect(x,y+h-2,w,2,'#7a5629'); for(let i=0;i<w;i+=6) px(x+i+2,y+4,'#7a5629'); rect(x+w/2-1,y-4,2,4,'#5b6378'); }
function drawCloud(cl, x, y){
  x=Math.floor(x); y=Math.floor(y);
  if(cl.state==='gone') return;
  const alpha = cl.opacity !== undefined ? cl.opacity : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = cl.w, h = cl.h;
  // puffy cloud shape: three overlapping ovals
  rect(x,      y+2, w,   h-2, '#e8f6ff');
  rect(x+2,    y,   w-4, h,   '#e8f6ff');
  rect(x+1,    y+1, w-2, h-1, '#ffffff');
  // highlight strip
  rect(x+3,    y+1, w-6, 1,   '#ffffff');
  // underside shadow
  rect(x+2,    y+h-1, w-4, 1, '#b8d8f0');
  ctx.restore();
}
function drawPlate(x,y,id,active){
  x=Math.floor(x); y=Math.floor(y);
  const col = active ? (id==='1' ? '#7ff2e2' : '#ffd866') : '#3a4a6a';
  const dark = active ? (id==='1' ? '#0e8c7d' : '#b8800b') : '#1a2a3a';
  rect(x,y+1,TS,3,dark);
  rect(x,y,TS,1,col);
  rect(x+1,y,TS-2,1,active?'#fff4d6':'#5a6a8a');
  px((x+TS/2)|0, y+2, '#0b1020');
}
function drawGate(x,y,opening){
  x=Math.floor(x); y=Math.floor(y);
  const off = Math.floor(opening*TS);
  if(off>=TS) return;
  rect(x+1,y-2-off,TS-2,2,'#ffd866');
  rect(x+2,y-off,TS-4,TS,'#5a3a8a');
  rect(x+2,y-off,TS-4,2,'#7a5aa8');
  rect(x+2,y+TS-2-off,TS-4,2,'#3a1a5a');
  for(let i=0;i<3;i++) rect(x+3+i*4,y-off+3,1,TS-6,'#3a1a5a');
}
function drawCheckpoint(x,y,active){ x=Math.floor(x); y=Math.floor(y); rect(x+6,y-20,2,36,'#d8d8e0'); rect(x+2,y+14,10,2,'#3a2a1a'); const wv=Math.sin(tick*0.12)*1; const col=active?'#7ff2e2':'#c8d0dd'; const cd=active?'#2dd4bf':'#8892a6'; rect(x+8,y-18+wv,10,6,col); rect(x+8,y-18+wv,2,6,cd); if(active){ px(x+13,y-15+wv,'#fff4d6'); px(x+14,y-15+wv,'#fff4d6'); } }
function drawCrate(x,y,carried){
  x=Math.floor(x); y=Math.floor(y);
  const w=TS-2, h=TS-2;
  rect(x,y,w,h,'#a06a30');
  rect(x,y,w,2,'#c89052');
  rect(x,y+h-2,w,2,'#603818');
  rect(x,y,2,h,'#c89052');
  rect(x+w-2,y,2,h,'#603818');
  // X pattern
  rect(x+2,y+2,w-4,1,'#603818');
  rect(x+2,y+h-3,w-4,1,'#603818');
  for(let i=0;i<4;i++) px(x+2+i*3,y+h/2|0,'#603818');
  if(carried){
    // sparkle
    const t=Math.sin(tick*0.2)*0.5+0.5;
    if(t>0.5) px(x+2,y-1,'#fff4d6');
  }
}
function drawLever(x,y,on){
  x=Math.floor(x); y=Math.floor(y);
  // base
  rect(x+2, y+TS-6, TS-4, 5, '#5a4028');
  rect(x+2, y+TS-6, TS-4, 1, '#8a6a48');
  // handle
  const ang = on ? 1 : -1;
  const hx = x + TS/2 + ang*4;
  const hy = y + TS-6;
  // shaft
  for(let i=0;i<6;i++){
    const t = i/5;
    px((x+TS/2 + ang*4*t)|0, (hy - i*1.4)|0, '#c8b89a');
  }
  // knob
  const kx = (x+TS/2 + ang*5)|0, ky = hy - 8;
  rect(kx-2, ky-2, 5, 5, on?'#ffd866':'#d04a4a');
  rect(kx-2, ky-2, 5, 1, '#fff4d6');
}
function drawKey(x,y,k){
  x=Math.floor(x); y=Math.floor(y);
  const bob = k.carried ? 0 : Math.sin(k.bob)*1.5;
  // bow (head)
  rect(x+2, y+1+bob, 6, 6, k.color);
  rect(x+3, y+2+bob, 4, 4, '#fff4d6');
  rect(x+4, y+3+bob, 2, 2, k.color);
  // shaft
  rect(x+7, y+3+bob, 4, 2, k.color);
  // teeth
  px(x+10, y+5+bob, k.color);
  px(x+9, y+5+bob, k.color);
}
function drawCannonBall(x,y){
  x=Math.floor(x); y=Math.floor(y);
  rect(x+1, y+1, 4, 4, '#1a1020');
  rect(x+1, y+1, 2, 1, '#5a5060');
  px(x+2, y+2, '#a0a0b0');
}
function drawDoor(x,y,kind){
  x=Math.floor(x); y=Math.floor(y);
  const t = Math.floor(tick*0.1)%2;
  rect(x+3,y+2,12,16,'#3a2a1a');
  rect(x+4,y+3,10,14,kind==='enter'?'#5a3a8a':'#3a8a5a');
  rect(x+4,y+3,10,2,kind==='enter'?'#7a5aa8':'#5aa87a');
  // sparkle
  if(t) px(x+9,y+9,'#fff4d6');
  rect(x+12,y+10,1,2,'#fff4d6'); // doorknob
}
function drawPowerup(cx,cy,kind){
  cx=Math.floor(cx); cy=Math.floor(cy);
  ctx.save(); ctx.translate(cx,cy);
  if(kind==='shield'){
    rect(-5,-5,10,10,'#0b1020');
    rect(-4,-4,8,8,'#7ff2e2');
    rect(-3,-3,6,6,'#c8fff5');
    rect(-1,-1,2,2,'#0e8c7d');
  } else if(kind==='speed'){
    rect(-5,-3,10,6,'#0b1020');
    rect(-4,-2,8,4,'#ffd866');
    rect(-3,-1,2,1,'#fff4d6'); rect(0,-1,2,1,'#fff4d6');
    rect(3,0,2,1,'#fff4d6');
  } else if(kind==='glide'){
    rect(-5,-2,10,4,'#0b1020');
    rect(-4,-1,8,2,'#a8e0c7');
    rect(-3,0,6,1,'#7dc9a6');
    px(-2,-2,'#fff4d6'); px(2,-2,'#fff4d6');
  }
  ctx.restore();
}
function drawGem(cx,cy){ ctx.save(); ctx.translate(Math.floor(cx),Math.floor(cy)); rect(-1,-4,2,8,'#ffd866'); rect(-4,-1,8,2,'#ffd866'); rect(-2,-3,4,6,'#ffe69a'); rect(-3,-2,6,4,'#ffe69a'); px(-1,-3,'#fff5cc'); px(0,-2,'#fff5cc'); px(0,-5,'#8a5a0a'); px(0,4,'#8a5a0a'); px(-5,0,'#8a5a0a'); px(4,0,'#8a5a0a'); ctx.restore(); }
function drawFlag(x,y){ rect(x+6,y-24,2,44,'#d8d8e0'); rect(x+2,y+18,10,2,'#3a2a1a'); const wv=Math.sin(tick*0.1)*1; rect(x+8,y-22+wv,10,2,'#ff6f88'); rect(x+8,y-20+wv,12,6,'#ff6f88'); rect(x+8,y-14+wv,10,2,'#ff6f88'); rect(x+8,y-22+wv,2,10,'#d12847'); px(x+14,y-18+wv,'#fff4d6'); px(x+15,y-17+wv,'#fff4d6'); px(x+13,y-17+wv,'#fff4d6'); px(x+14,y-16+wv,'#fff4d6'); px(x+14,y-19+wv,'#fff4d6'); }
function drawBullet(b,x,y){ x=Math.floor(x); y=Math.floor(y); if(b.kind==='cannon'){ rect(x,y,b.w,b.h,'#1a1020'); rect(x+1,y+1,2,1,'#7a7080'); px(x+2,y+2,'#c0c0d0'); return; } rect(x-1,y-1,4,4,'#ffb04a'); rect(x,y,2,2,'#fff4d6'); }

function drawPlayer(p,x,y){
  x=Math.floor(x); y=Math.floor(y);
  const blink=(p.iFrames>0)&&(Math.floor(tick/4)%2===0); if(blink) return;
  // shield aura
  if(p.powerup==='shield'){
    const r = 10 + Math.sin(tick*0.2)*1;
    ctx.strokeStyle='#7ff2e2'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(x+6,y+7,r,0,Math.PI*2); ctx.stroke();
  }
  // glide trail behind player
  if(p.gliding){
    rect(x-2,y+4,2,6,'#a8e0c7'); rect(x+12,y+4,2,6,'#a8e0c7');
  }
  // wall slide marker
  if(p.wallSlide){
    rect(x+(p.wallSide>0?p.w:-1),y+p.h-4,1,3,'#fff4d6');
  }
  const pal=p.pal; const sx=p.sx, sy=p.sy;
  const cx=x+6, cy=y+14;
  ctx.save(); ctx.translate(cx,cy); ctx.scale(sx,sy); ctx.translate(-cx,-cy);
  const dir=p.dir; const walking=Math.abs(p.vx)>0.3&&p.onGround; const jumping=!p.onGround;
  const f=Math.floor(p.walkFrame)%4; const idleBob=(!walking&&!jumping)?Math.round(Math.sin(p.idleT*0.05)):0; const by=y+idleBob;
  rect(x+1,y+13,10,1,'rgba(0,0,0,0.25)');
  rect(x+2,by+2,8,10,pal.base); rect(x+3,by+3,2,2,pal.hi); rect(x+2,by+4,1,4,pal.mid);
  rect(x+2,by+10,8,2,pal.shade); rect(x+3,by+12,6,1,pal.dark);
  rect(x+1,by+3,1,8,pal.outline); rect(x+10,by+3,1,8,pal.outline);
  rect(x+2,by+1,8,1,pal.outline); rect(x+2,by+12,8,1,pal.outline);
  px(x+1,by+2,pal.outline); px(x+10,by+2,pal.outline); px(x+1,by+11,pal.outline); px(x+10,by+11,pal.outline);
  if(p.idx===1){ rect(x+2,by,8,1,pal.hat); rect(x+2,by+1,8,1,pal.hat); rect(x+3,by-1,6,1,pal.hat); px(x+2,by,pal.outline); px(x+9,by,pal.outline); }
  else { rect(x+5,by-1,2,1,pal.hi); px(x+5,by-2,pal.outline); px(x+6,by-2,pal.outline); }
  rect(x+2,by+5,8,1,pal.strap);
  if(dir>0){ rect(x+5,by+4,2,2,'#fff4d6'); rect(x+8,by+4,1,2,'#fff4d6'); px(x+6,by+4,'#0b1020'); }
  else { rect(x+3,by+4,1,2,'#fff4d6'); rect(x+5,by+4,2,2,'#fff4d6'); px(x+5,by+4,'#0b1020'); }
  const idlePhase=Math.floor(p.idleT/30)%8;
  if(jumping) rect(x+5,by+8,2,1,'#0b1020');
  else if(walking){ if(f%2===0) rect(x+5,by+8,3,1,'#0b1020'); else rect(x+5,by+9,2,1,'#0b1020'); }
  else { if(idlePhase===0) rect(x+5,by+9,3,1,'#0b1020'); else rect(x+5,by+9,2,1,'#0b1020'); }
  if(jumping){ rect(x+2,by+13,3,1,pal.shade); rect(x+7,by+13,3,1,pal.shade); }
  else if(walking){ if(f<2){ rect(x+2,by+13,3,1,pal.shade); rect(x+8,by+12,3,1,pal.shade); rect(x+8,by+13,3,1,pal.shade); } else { rect(x+2,by+12,3,1,pal.shade); rect(x+2,by+13,3,1,pal.shade); rect(x+7,by+13,3,1,pal.shade); } }
  else { if(idlePhase===4){ rect(x+2,by+12,3,1,pal.shade); rect(x+2,by+13,3,1,pal.shade); rect(x+7,by+13,3,1,pal.shade); } else { rect(x+2,by+13,3,1,pal.shade); rect(x+7,by+13,3,1,pal.shade); } }
  ctx.restore();
  // M7: custom face overlay
  if(p.customFace && typeof drawCustomFace === 'function') drawCustomFace(p, x, y);
  // M7: accessory overlay
  if(typeof drawAccessory === 'function') drawAccessory(p, x, y);
  // M7: shoe overlay
  if(p.customShoe && typeof drawShoe === 'function') drawShoe(p, x, y);
  // M7: name tag above head
  if(p.nameTag && typeof drawNameTag === 'function') drawNameTag(p, x, y);
}
function drawDeadEffect(p,x,y){ const t=performance.now()/200; const yy=y - Math.min(20, (performance.now() - (p.deadAt||performance.now()))/40); for(let i=0;i<3;i++){ const cx=x+4+Math.sin(t+i)*3; px(Math.floor(cx),Math.floor(yy+i*4),p.pal.hi); } }
function drawDowned(p,x,y){ x=Math.floor(x); y=Math.floor(y); const t=(performance.now()-p.downedAt)/1000; const yy=y+6-Math.sin(t*2)*2; rect(x+2,yy+4,8,8,p.pal.base); rect(x+3,yy+5,6,6,p.pal.mid); rect(x+4,yy+6,1,1,'#0b1020'); rect(x+6,yy+6,1,1,'#0b1020'); rect(x+4,yy+8,1,1,'#0b1020'); rect(x+6,yy+8,1,1,'#0b1020'); rect(x+5,yy+7,1,1,'#0b1020'); rect(x+2,yy+12,2,1,p.pal.mid); rect(x+5,yy+13,2,1,p.pal.mid); rect(x+8,yy+12,2,1,p.pal.mid); }
function drawEnemy(e,x,y){ x=Math.floor(x); y=Math.floor(y); if(!e.alive){ if(e.kind==='flyer'){ rect(x,y+6,12,2,'#b83a80'); return; } rect(x,y+10,12,3,'#6b3fa0'); rect(x+1,y+10,10,1,'#8a5fc2'); rect(x+2,y+9,8,1,'#6b3fa0'); return; } if(e.kind==='slug') drawSlug(e,x,y); else if(e.kind==='flyer') drawFlyer(e,x,y); else if(e.kind==='turret') drawTurret(e,x,y); else if(e.kind==='spitter') drawSpitter(e,x,y); else if(e.kind==='slime') drawSlime(e,x,y); else if(e.kind==='knight') drawKnight(e,x,y); }
function drawSpitter(e,x,y){
  // Snail body with shell
  const wob = Math.sin(e.frame)*1;
  const tele = e.telegraphT>0;
  rect(x+1,y+13,12,1,'rgba(0,0,0,0.25)');
  // foot
  rect(x+1,y+10,12,3,'#5a7a3a');
  rect(x+2,y+13,10,1,'#3a5a1a');
  // shell
  rect(x+3,y+3,8,8,'#a85a2a');
  rect(x+4,y+2,6,1,'#a85a2a');
  rect(x+4,y+4,6,1,'#c4732e');
  rect(x+5,y+6,4,1,'#7a3e1a');
  rect(x+4,y+8,6,1,'#7a3e1a');
  // stalks/eyes (face direction)
  const eyeBase = e.facing<0 ? x+1 : x+11;
  px(eyeBase, y+8, '#5a7a3a');
  px(eyeBase, y+7, '#fff4d6');
  // open mouth + telegraph glow
  if(tele){
    // pulse
    const pulse = Math.floor(e.telegraphT/4)%2;
    rect(eyeBase + (e.facing<0?-2:1), y+9, 2, 2, pulse?'#ffd866':'#ff6f88');
    // wind-up sparkles
    if(tick%3===0) particles.push({x:e.x+(e.facing<0?-2:e.w+2), y:e.y+9, vx:e.facing*0.4, vy:-0.4, life:14, color:'#ffd866'});
  }
  if(Math.floor(wob+2)%2) px(x+5,y+10,'#3a5a1a');
}
function drawSlime(e,x,y){
  const big = e.size===2;
  const w = big?12:8, h = big?12:8;
  const squish = e.onGround && (e.bounceT||0)<6 ? 2 : 0;
  // shadow
  rect(x+1, y+h-1, w-2, 1, 'rgba(0,0,0,0.25)');
  // body — translucent green
  rect(x+1, y+squish+1, w-2, h-1-squish, '#5fbf5a');
  rect(x+2, y+squish, w-4, 1, '#5fbf5a');
  rect(x+2, y+squish+1, w-4, 1, '#a8e0c7');
  rect(x+1, y+h-2, w-2, 1, '#3a8a3a');
  // eyes
  const ey = y+squish+3;
  rect(x+w/2-3, ey, 2, 2, '#fff4d6'); px(x+w/2-2, ey+1, '#0b1020');
  rect(x+w/2+1, ey, 2, 2, '#fff4d6'); px(x+w/2+2, ey+1, '#0b1020');
}
function drawKnight(e,x,y){
  // Body
  rect(x+1, y+14, 12, 1, 'rgba(0,0,0,0.25)');
  rect(x+3, y+8, 8, 6, '#7a8a9a'); // armor body
  rect(x+4, y+7, 6, 1, '#9aa8b8');
  rect(x+3, y+13, 8, 1, '#3a4a5a');
  // helmet
  rect(x+4, y+3, 6, 5, '#5a6a7a');
  rect(x+5, y+2, 4, 1, '#7a8a9a');
  rect(x+5, y+5, 4, 2, '#0b1020'); // visor slit
  px(x+ (e.facing<0?5:8), y+6, '#ff6f88');
  // legs
  rect(x+4, y+13, 2, 2, '#3a4a5a');
  rect(x+8, y+13, 2, 2, '#3a4a5a');
  // shield (on facing side)
  const sx = e.facing<0 ? x : x+12;
  const flash = e.sparkT>0 && Math.floor(e.sparkT/2)%2;
  rect(sx, y+6, 2, 7, flash?'#fff4d6':'#c4732e');
  rect(sx+(e.facing<0?0:1), y+7, 1, 5, '#7a3e1a');
  // sword (opposite side)
  const wx = e.facing<0 ? x+13 : x-1;
  rect(wx, y+8, 1, 5, '#d8d8d8');
  px(wx, y+13, '#5a4a2a');
}
function drawSlug(e,x,y){ const wob=Math.sin(e.frame)*1; rect(x+1,y+13,10,1,'rgba(0,0,0,0.25)'); rect(x+1,y+6,10,7,'#6b3fa0'); rect(x+2,y+5,8,1,'#6b3fa0'); rect(x+2,y+7,8,1,'#8a5fc2'); rect(x+2,y+12,8,1,'#4a2578'); px(x+2,y+4,'#fff4d6'); px(x+2,y+3,'#fff4d6'); px(x+5,y+3,'#fff4d6'); px(x+5,y+2,'#fff4d6'); px(x+8,y+4,'#fff4d6'); px(x+8,y+3,'#fff4d6'); const ex=e.vx<0?x+3:x+7; rect(ex,y+8,2,2,'#fff4d6'); px(ex+(e.vx<0?0:1),y+8,'#0b1020'); rect(x+2,y+13,4,1,'#4a2578'); rect(x+7,y+13,3+((Math.floor(wob)+2)%2),1,'#4a2578'); }
function drawFlyer(e,x,y){ const flap=Math.floor(e.frame)%2; rect(x+4,y+3,4,5,'#b83a80'); rect(x+5,y+3,2,1,'#e570ad'); rect(x+4,y+7,4,1,'#7a1e50'); if(flap===0){ rect(x+1,y+3,3,3,'#b83a80'); rect(x+8,y+3,3,3,'#b83a80'); } else { rect(x+0,y+5,4,3,'#b83a80'); rect(x+8,y+5,4,3,'#b83a80'); } const ex=e.vx<0?x+4:x+6; px(ex,y+5,'#fff4d6'); px(ex+(e.vx<0?-1:1),y+5,'#fff4d6'); px(ex,y+5,'#0b1020'); }
function drawTurret(e,x,y){ rect(x+1,y+13,10,1,'rgba(0,0,0,0.25)'); rect(x+1,y+8,10,5,'#3a5a7a'); rect(x+2,y+7,8,1,'#5a7a9a'); rect(x+2,y+13,8,1,'#1a3a5a'); const tgt=nearestPlayerTo(e.x,e.y); const dir=tgt?(tgt.x<e.x?-1:1):1; if(dir<0) rect(x-2,y+9,4,3,'#5a7a9a'); else rect(x+10,y+9,4,3,'#5a7a9a'); rect(x+5,y+4,3,3,'#ffb04a'); px(x+6,y+5,'#0b1020'); rect(x+1,y+13,2,1,'#1a3a5a'); rect(x+9,y+13,2,1,'#1a3a5a'); }
function drawBoss(x,y){
  x=Math.floor(x); y=Math.floor(y);
  const flash = boss.hurtT>0 && Math.floor(tick/2)%2;
  const base = flash ? '#fff' : '#5a3a8a';
  const mid = flash ? '#fff' : '#7a5aa8';
  const dark = flash ? '#ccc' : '#3a1a5a';
  // body
  rect(x+2, y+8, 20, 18, base);
  rect(x+2, y+8, 20, 3, mid);
  rect(x+2, y+24, 20, 2, dark);
  // crown
  rect(x+4, y+4, 16, 4, '#ffd866');
  rect(x+5, y, 2, 4, '#ffd866'); rect(x+11, y-2, 2, 6, '#ffd866'); rect(x+17, y, 2, 4, '#ffd866');
  rect(x+6, y+5, 1, 1, '#ff6f88'); rect(x+12, y+3, 1, 1, '#ff6f88'); rect(x+18, y+5, 1, 1, '#ff6f88');
  // eyes
  rect(x+6, y+12, 4, 3, '#fff4d6'); rect(x+14, y+12, 4, 3, '#fff4d6');
  const tgt=nearestPlayerTo(boss.x, boss.y);
  const ex = tgt && tgt.x<boss.x ? 0 : 2;
  rect(x+6+ex, y+13, 2, 2, '#0b1020'); rect(x+14+ex, y+13, 2, 2, '#0b1020');
  // mouth
  rect(x+8, y+19, 8, 2, '#0b1020');
  rect(x+9, y+18, 1, 1, '#fff4d6'); rect(x+14, y+18, 1, 1, '#fff4d6');
  // turrets on sides
  rect(x-2, y+14, 4, 4, '#3a5a7a'); rect(x+22, y+14, 4, 4, '#3a5a7a');
  // weak point indicator
  rect(x+8, y+2, 8, 2, '#7ff2e2');
  // telegraph indicator above head
  if(boss.telegraphT>0 && boss.actKind){
    const ty = y - 14;
    const pulse = Math.floor(boss.telegraphT/4)%2;
    const bg = pulse ? '#fff4d6' : '#0b1020';
    const fg = pulse ? '#0b1020' : '#fff4d6';
    rect(x+6, ty, 12, 10, bg);
    if(boss.actKind==='spread'){
      // 3 dots fanning up
      px(x+9, ty+6, fg); px(x+12, ty+4, fg); px(x+15, ty+6, fg);
      px(x+9, ty+7, fg); px(x+12, ty+5, fg); px(x+15, ty+7, fg);
    } else if(boss.actKind==='slam'){
      // down arrow
      rect(x+11, ty+2, 2, 5, fg);
      rect(x+9, ty+5, 6, 1, fg);
      rect(x+10, ty+6, 4, 1, fg);
      rect(x+11, ty+7, 2, 1, fg);
    } else if(boss.actKind==='minions'){
      // small slime icons
      rect(x+8, ty+5, 3, 3, fg);
      rect(x+13, ty+5, 3, 3, fg);
      px(x+9, ty+6, bg); px(x+14, ty+6, bg);
    }
  }
}



// ---- WEATHER ----
function seedWeather(){
  weather=[];
  const biome = currentBiome();
  if(biome==='grove'){
    for(let i=0;i<24;i++) weather.push({type:'leaf', x:Math.random()*W, y:Math.random()*H, vx:-0.2-Math.random()*0.4, vy:0.3+Math.random()*0.4, t:Math.random()*Math.PI*2, size:1+(Math.random()<0.4?1:0), color: Math.random()<0.5?'#7ad88a':'#e8b455'});
  } else if(biome==='cave'){
    for(let i=0;i<40;i++) weather.push({type:'rain', x:Math.random()*W, y:Math.random()*H, vx:-0.6, vy:6+Math.random()*2});
  } else if(biome==='beach'){
    for(let i=0;i<14;i++) weather.push({type:'sand', x:Math.random()*W, y:H*(0.6+Math.random()*0.35), vx:1+Math.random()*1.2, vy:(Math.random()-0.5)*0.2, life:30+Math.random()*40});
  } else if(biome==='boss'){
    for(let i=0;i<14;i++) weather.push({type:'ember', x:Math.random()*W, y:H, vx:(Math.random()-0.5)*0.4, vy:-0.4-Math.random()*0.5, t:Math.random()*Math.PI*2});
  } else if(biome==='sky'){
    for(let i=0;i<20;i++) weather.push({type:'wisp', x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-0.5)*0.3, vy:-0.2-Math.random()*0.3, t:Math.random()*Math.PI*2, size:1});
  } else {
    weather=[];
  }
}
function updateWeather(dt){
  if(reducedMotion()){ if(weather.length>0) weather=[]; return; }
  if(weather.length===0) seedWeather();
  for(const w of weather){
    if(w.type==='leaf'){
      w.t += 0.05;
      w.x += w.vx + Math.sin(w.t)*0.3;
      w.y += w.vy;
      if(w.y>H+4) { w.y=-4; w.x=Math.random()*W; }
      if(w.x<-4) w.x=W+4;
    } else if(w.type==='rain'){
      w.x += w.vx; w.y += w.vy;
      if(w.y>H+4){ w.y=-4; w.x=Math.random()*(W+30)-10; }
    } else if(w.type==='sand'){
      w.x += w.vx; w.y += w.vy;
      w.life -= dt/16;
      if(w.x>W+4 || w.life<=0){ w.x=-4; w.y=H*(0.6+Math.random()*0.35); w.life=30+Math.random()*40; }
    } else if(w.type==='ember'){
      w.t += 0.05;
      w.x += w.vx + Math.sin(w.t)*0.3;
      w.y += w.vy;
      if(w.y<-4){ w.y=H+4; w.x=Math.random()*W; }
    } else if(w.type==='wisp'){
      w.t += 0.04;
      w.x += w.vx + Math.sin(w.t*0.7)*0.4;
      w.y += w.vy + Math.cos(w.t)*0.15;
      if(w.y < -4){ w.y = H+4; w.x = Math.random()*W; }
      if(w.x < -4) w.x = W+4;
      if(w.x > W+4) w.x = -4;
    }
  }
}
function drawWeather(camX, camY){
  if(weather.length===0) return;
  ctx.save();
  for(const w of weather){
    if(w.type==='leaf'){
      ctx.fillStyle=w.color;
      const sw = Math.cos(w.t)>0 ? w.size+1 : w.size;
      ctx.fillRect(Math.floor(w.x), Math.floor(w.y), sw, w.size);
    } else if(w.type==='rain'){
      ctx.strokeStyle='rgba(180,200,240,0.55)';
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y); ctx.lineTo(w.x+w.vx*0.6, w.y+w.vy*0.6);
      ctx.stroke();
    } else if(w.type==='sand'){
      ctx.fillStyle='rgba(255,236,176,0.6)';
      ctx.fillRect(Math.floor(w.x), Math.floor(w.y), 2, 1);
    } else if(w.type==='ember'){
      ctx.fillStyle = (Math.floor(w.t*4)%2) ? '#ffb04a' : '#ff6f88';
      ctx.fillRect(Math.floor(w.x), Math.floor(w.y), 2, 2);
    } else if(w.type==='wisp'){
      const pulse = 0.4 + Math.sin(w.t*1.3)*0.3;
      ctx.fillStyle = `rgba(220,240,255,${pulse.toFixed(2)})`;
      ctx.fillRect(Math.floor(w.x), Math.floor(w.y), 1, 1);
    }
  }
  ctx.restore();
}

// ---- TRANSITION ----
function startTransition(onMid){
  if(reducedMotion()){ if(onMid) onMid(); return; }
  transition.t = 0; transition.dir = 1; transition.onMid = onMid;
}
function drawTransition(){
  if(transition.t<=0) return;
  // Iris-style mosaic dissolve: black squares grow with progress
  const t = transition.t;
  ctx.save();
  ctx.fillStyle = '#0b1020';
  ctx.globalAlpha = Math.min(1, t*1.2);
  ctx.fillRect(0,0,W,H);
  ctx.restore();
}

function fmtTotalTime(seconds){
  const m = Math.floor(seconds/60), s = seconds - m*60;
  return (m>0 ? m+':' : '') + (s<10 && m>0 ? '0' : '') + s.toFixed(2) + (m===0?'s':'');
}
