/* Blip's Grove — physics: tile collision primitives + AABB + axis movement.
 *
 * Pure helpers. Reads globals (map, mapW, mapH, TS, movers) defined in engine.js.
 * Side effects limited to mutating the entity passed to moveX/moveY (its
 * position, velocity, onGround, hitWall, ridingMover) — exactly as before
 * the split.
 *
 * Extracted from engine.js v12 verbatim.
 */

function isSolidChar(c){ return c==='#'||c==='='||c==='B'||c==='P'||c==='?'||c==='['||c===']'||c==='J'||c==='l'||c==='q'||c==='e'||c==='i'||c==='n'||c==='>'||c==='<'; }
// Cloud platform tile 'c': solid only when freshly touched; handled in engine update.
const KEY_COLORS = ['#ff5a8a','#5ad6ff','#ffe25a','#a8ff5a']; // pink, cyan, yellow, green
function keyColorAt(tx, ty){ return KEY_COLORS[(tx + ty) % KEY_COLORS.length]; }
function cannonDirAt(tx, ty){
  // points away from nearest solid wall (cannon tile is solid; check neighbors)
  if(tx > 0 && map[ty][tx-1]==='#') return 1;       // wall on left -> shoots right
  if(tx < mapW-1 && map[ty][tx+1]==='#') return -1; // wall on right -> shoots left
  return 1;
}
function tileAt(tx,ty){ if(tx<0||tx>=mapW||ty<0||ty>=mapH) return '#'; return map[ty][tx]; }
function solidAt(tx,ty){ return isSolidChar(tileAt(tx,ty)); }
function hazardAt(tx,ty){ return tileAt(tx,ty)==='^'; }
function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }
function aabb(a,b){ return rectsOverlap(a.x,a.y,a.w,a.h,b.x,b.y,b.w,b.h); }

function moveX(ent,dx){
  ent.x+=dx; if(dx===0)return;
  const side=dx>0?ent.x+ent.w:ent.x;
  const t0=Math.floor(ent.y/TS), t1=Math.floor((ent.y+ent.h-1)/TS);
  const tx=Math.floor(side/TS);
  for(let ty=t0;ty<=t1;ty++){
    if(solidAt(tx,ty)){
      if(dx>0) ent.x=tx*TS-ent.w-0.001; else ent.x=(tx+1)*TS+0.001;
      ent.vx=0; ent.hitWall=true;
    }
  }
  for(const m of movers){
    if(rectsOverlap(ent.x,ent.y,ent.w,ent.h,m.x,m.y,m.w,m.h)){
      if(dx>0) ent.x=m.x-ent.w-0.001; else if(dx<0) ent.x=m.x+m.w+0.001;
      ent.vx=0; ent.hitWall=true;
    }
  }
}
function moveY(ent,dy){
  ent.y+=dy; ent.onGround=false; if(dy===0) return null;
  const side=dy>0?ent.y+ent.h:ent.y;
  const t0=Math.floor(ent.x/TS), t1=Math.floor((ent.x+ent.w-1)/TS);
  const ty=Math.floor(side/TS); let bumped=null;
  for(let tx=t0;tx<=t1;tx++){
    if(solidAt(tx,ty)){
      if(dy>0){ent.y=ty*TS-ent.h-0.001; ent.onGround=true;}
      else{ ent.y=(ty+1)*TS+0.001; if(tileAt(tx,ty)==='?') bumped={tx,ty}; }
      ent.vy=0;
    }
  }
  for(const m of movers){
    if(rectsOverlap(ent.x,ent.y,ent.w,ent.h,m.x,m.y,m.w,m.h)){
      if(dy>0&&(ent.y+ent.h)-m.y<12){ent.y=m.y-ent.h-0.001; ent.onGround=true; ent.ridingMover=m;}
      else if(dy<0){ ent.y=m.y+m.h+0.001; }
      ent.vy=0;
    }
  }
  return bumped;
}

function detectWall(p){
  // probe a thin sliver to either side of the player
  const t0=Math.floor((p.y+1)/TS), t1=Math.floor((p.y+p.h-2)/TS);
  let leftSolid=false, rightSolid=false;
  const lx=Math.floor((p.x-1)/TS), rx=Math.floor((p.x+p.w)/TS);
  for(let ty=t0;ty<=t1;ty++){ if(solidAt(lx,ty)) leftSolid=true; if(solidAt(rx,ty)) rightSolid=true; }
  p.wallSide = rightSolid ? 1 : (leftSolid ? -1 : 0);
}
