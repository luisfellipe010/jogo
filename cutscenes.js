/* Blip's Grove — cutscenes.js  (M6.3)
 *
 * Story cutscenes: pixel canvas animations + speech bubbles.
 * Shown:
 *   - INTRO   before level 0 (Grove)
 *   - GROVE→BEACH transition
 *   - BEACH→CAVE transition
 *   - CAVE→SKY  transition
 *   - ENDING  after boss defeated
 *
 * Public API:
 *   cutscenePlay(id, onDone)    → play named cutscene, call onDone when done
 *   cutsceneSkip()              → skip currently playing cutscene
 *   cutsceneIsPlaying()         → bool
 *   CUTSCENE_IDS                → ['intro','grove_beach','beach_cave','cave_sky','ending']
 */

'use strict';

const CUTSCENE_IDS = ['intro', 'grove_beach', 'beach_cave', 'cave_sky', 'ending'];

// ─── Scene scripts ────────────────────────────────────────────────────────────
// Each scene is an array of "beats".
// beat: { bg, draw(ctx,t,W,H), lines: [{speaker, text}], duration (ms) }
// draw() is called every frame; lines are shown one at a time with typewriter.
const SCENE_SCRIPTS = {

  intro: [
    {
      bg: '#8bd6ff',
      duration: 4500,
      draw: (c, t, W, H) => {
        _sky(c, W, H, '#8bd6ff');
        _hills(c, t, W, H, '#7fb96e', '#3fa75a');
        _sun(c, t, W, H);
        _blip(c, W/2 - 30, H - 60, t, false);
        _blop(c, W/2 + 10, H - 60, t, true);
        _leaves(c, t, W, H);
      },
      lines: [
        { speaker: 'BLIP',  text: 'Another beautiful day in the Grove!' },
        { speaker: 'BLOP', text: 'I heard there\'s trouble at the Beach...' },
      ],
    },
    {
      bg: '#5a8a3a',
      duration: 3500,
      draw: (c, t, W, H) => {
        _sky(c, W, H, '#6aaa50');
        _hills(c, t, W, H, '#4a7a30', '#2a5a1a');
        _blip(c, W/2 - 30, H - 60, t, false);
        _blop(c, W/2 + 10, H - 60, t, true);
        // mysterious shadow in distance
        c.fillStyle = 'rgba(0,0,0,.25)';
        c.fillRect(W - 60, H - 80, 20, 40);
        c.fillRect(W - 90, H - 60, 10, 20);
      },
      lines: [
        { speaker: 'BLIP',  text: 'Those shadows on the horizon...' },
        { speaker: 'BLOP', text: 'Let\'s go! We can handle this together.' },
      ],
    },
  ],

  grove_beach: [
    {
      bg: '#87ceeb',
      duration: 4000,
      draw: (c, t, W, H) => {
        _sky(c, W, H, '#87ceeb');
        // Beach horizon
        c.fillStyle = '#f0c87a';
        c.fillRect(0, H - 30, W, 30);
        c.fillStyle = '#4ac8f0';
        c.fillRect(0, H - 50, W, 24);
        // Waves
        for (let i = 0; i < 4; i++) {
          const wx = ((t * 30 + i * 60) % (W + 40)) - 20;
          c.fillStyle = 'rgba(255,255,255,.4)';
          c.fillRect(Math.floor(wx), H - 48, 20, 4);
        }
        _blip(c, W/2 - 30, H - 60, t, false);
        _blop(c, W/2 + 10, H - 60, t, true);
      },
      lines: [
        { speaker: 'BLIP',  text: 'The beach! I can smell the salt air.' },
        { speaker: 'BLOP', text: 'And enemy patrols. Stay sharp.' },
      ],
    },
  ],

  beach_cave: [
    {
      bg: '#1a1a2e',
      duration: 4000,
      draw: (c, t, W, H) => {
        c.fillStyle = '#1a1a2e';
        c.fillRect(0, 0, W, H);
        // Cave entrance
        c.fillStyle = '#0a0a14';
        c.beginPath();
        c.arc(W/2, H + 10, 60, Math.PI, 0);
        c.fill();
        // Torch flicker
        const flicker = 0.8 + Math.sin(t * 12) * 0.2;
        const grad = c.createRadialGradient(W/2, H - 40, 2, W/2, H - 40, 40 * flicker);
        grad.addColorStop(0, 'rgba(255,160,50,.5)');
        grad.addColorStop(1, 'rgba(255,100,20,0)');
        c.fillStyle = grad;
        c.fillRect(W/2 - 40, H - 80, 80, 80);
        _blip(c, W/2 - 30, H - 60, t, false);
        _blop(c, W/2 + 10, H - 60, t, true);
      },
      lines: [
        { speaker: 'BLOP', text: 'It\'s so dark in here...' },
        { speaker: 'BLIP',  text: 'I\'ve got a good feeling about this cave.' },
        { speaker: 'BLOP', text: 'That\'s what worries me.' },
      ],
    },
  ],

  cave_sky: [
    {
      bg: '#a8d8f0',
      duration: 4000,
      draw: (c, t, W, H) => {
        _sky(c, W, H, '#a8d8f0');
        // Floating islands
        for (let i = 0; i < 3; i++) {
          const ix = 40 + i * 140 + Math.sin(t * 0.5 + i) * 4;
          const iy = 30 + i * 20 + Math.sin(t * 0.8 + i * 2) * 6;
          c.fillStyle = '#3fa75a';
          c.fillRect(Math.floor(ix), Math.floor(iy + 8), 60, 8);
          c.fillStyle = '#2c7a40';
          c.fillRect(Math.floor(ix), Math.floor(iy + 16), 60, 4);
        }
        // Wisps
        for (let i = 0; i < 6; i++) {
          const wx = ((t * 20 + i * 70) % (W + 20)) - 10;
          const wy = 20 + i * 15 + Math.sin(t + i) * 8;
          c.fillStyle = 'rgba(255,255,255,.7)';
          c.fillRect(Math.floor(wx), Math.floor(wy), 2, 2);
        }
        _blip(c, W/2 - 30, H - 60, t, false);
        _blop(c, W/2 + 10, H - 60, t, true);
      },
      lines: [
        { speaker: 'BLIP',  text: 'We made it above the clouds!' },
        { speaker: 'BLOP', text: 'The Sky Temple... the boss must be up here.' },
        { speaker: 'BLIP',  text: 'Then let\'s end this.' },
      ],
    },
  ],

  ending: [
    {
      bg: '#1a1a2e',
      duration: 3000,
      draw: (c, t, W, H) => {
        c.fillStyle = '#1a1a2e';
        c.fillRect(0, 0, W, H);
        // Boss defeated flash
        const flash = Math.max(0, 1 - t * 2);
        c.fillStyle = `rgba(255,200,50,${flash * 0.6})`;
        c.fillRect(0, 0, W, H);
        // Stars appearing
        for (let i = 0; i < 30; i++) {
          const sx = (i * 137) % W;
          const sy = (i * 97)  % (H * 0.7);
          const alpha = Math.min(1, Math.max(0, t * 3 - i * 0.05));
          c.fillStyle = `rgba(255,244,214,${alpha})`;
          c.fillRect(Math.floor(sx), Math.floor(sy), 1 + (i % 2), 1 + (i % 2));
        }
        if (t > 0.5) {
          _blip(c, W/2 - 30, H - 60, t, false);
          _blop(c, W/2 + 10, H - 60, t, true);
        }
      },
      lines: [
        { speaker: 'BLOP', text: 'We did it! The grove is safe again.' },
      ],
    },
    {
      bg: '#0a1428',
      duration: 4500,
      draw: (c, t, W, H) => {
        c.fillStyle = '#0a1428';
        c.fillRect(0, 0, W, H);
        // Full starfield
        for (let i = 0; i < 50; i++) {
          const sx = (i * 113 + 7) % W;
          const sy = (i * 79 + 3)  % (H - 60);
          const twinkle = 0.6 + Math.sin(t * 3 + i) * 0.4;
          c.fillStyle = `rgba(255,244,214,${twinkle})`;
          c.fillRect(sx, sy, 1, 1);
        }
        _hills(c, t * 0.1, W, H, '#1a3a1a', '#0a2a0a');
        _blip(c, W/2 - 50, H - 65, t, false);
        _blop(c, W/2 +  0, H - 65, t, true);
        // Rising sparkles
        for (let i = 0; i < 8; i++) {
          const age = (t * 0.5 + i / 8) % 1;
          const px = W/2 - 20 + i * 12;
          const py = H - 60 - age * 60;
          c.fillStyle = `rgba(255,216,102,${1 - age})`;
          c.fillRect(Math.floor(px), Math.floor(py), 2, 2);
        }
      },
      lines: [
        { speaker: 'BLIP',  text: 'The grove will always need protecting.' },
        { speaker: 'BLOP', text: 'And we\'ll always be here for it.' },
        { speaker: 'BLIP',  text: '... Ready for another run?' },
      ],
    },
  ],
};

// ─── Pixel sprite helpers ─────────────────────────────────────────────────────
function _sky(c, W, H, col) {
  c.fillStyle = col; c.fillRect(0, 0, W, H);
}

function _hills(c, t, W, H, col1, col2) {
  c.fillStyle = col1;
  for (let i = 0; i < 5; i++) {
    const cx = (i * 80 + (t * 10) % 80) % (W + 60) - 30;
    c.beginPath(); c.arc(cx, H - 18, 30, Math.PI, 0); c.fill();
  }
  c.fillStyle = col2;
  c.fillRect(0, H - 18, W, 18);
}

function _sun(c, t, W, H) {
  const sx = 40 + Math.sin(t * 0.3) * 6;
  const sy = 28 + Math.cos(t * 0.2) * 4;
  c.fillStyle = '#ffd866';
  c.fillRect(Math.floor(sx), Math.floor(sy), 12, 12);
  // rays
  c.fillStyle = 'rgba(255,216,102,.5)';
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + t * 0.5;
    c.fillRect(Math.floor(sx + 6 + Math.cos(a) * 10), Math.floor(sy + 6 + Math.sin(a) * 10), 2, 2);
  }
}

function _leaves(c, t, W, H) {
  for (let i = 0; i < 8; i++) {
    const lx = ((i * 60 + t * 25) % (W + 20)) - 10;
    const ly = 20 + (i * 11) % 40 + Math.sin(t + i) * 4;
    c.fillStyle = i % 2 ? '#7ad88a' : '#e8b455';
    c.fillRect(Math.floor(lx), Math.floor(ly), 3, 3);
  }
}

const P1_C = { base:'#2dd4bf', outline:'#083a33', hat:'#22a995' };
const P2_C = { base:'#ff9a3c', outline:'#3a1e04', hat:'#d07018' };

function _blip(c, x, y, t, flip) { _drawHero(c, x, y, t, flip, P1_C); }
function _blop(c, x, y, t, flip) { _drawHero(c, x, y, t, flip, P2_C); }

function _drawHero(c, x, y, t, flip, pal) {
  const bob = Math.floor(Math.sin(t * 3) * 1);
  const px = Math.floor(x), py = Math.floor(y + bob);
  c.save();
  if (flip) { c.translate(px + 12, py); c.scale(-1, 1); c.translate(-px, -py); }
  // Body
  c.fillStyle = pal.outline;
  c.fillRect(px + 2, py + 1, 8, 1); c.fillRect(px + 1, py + 2, 10, 11); c.fillRect(px + 2, py + 13, 8, 1);
  c.fillStyle = pal.base; c.fillRect(px + 2, py + 2, 8, 11);
  c.fillStyle = pal.outline; c.fillRect(px + 4, py + 5, 1, 1); c.fillRect(px + 7, py + 5, 1, 1);
  c.fillStyle = pal.hat; c.fillRect(px + 1, py + 1, 10, 1); c.fillRect(px + 3, py, 6, 1);
  c.restore();
}

// ─── Playback engine ──────────────────────────────────────────────────────────
let _csEl        = null;
let _csPlaying   = false;
let _csDoneCb    = null;
let _csRafHandle = null;
let _csBeatIdx   = 0;
let _csLineIdx   = 0;
let _csLineT     = 0;   // ms since line started (for typewriter)
let _csBeatT     = 0;   // ms since beat started
let _csLastT     = 0;
let _csCurrentId = null;
let _csBeats     = [];

const TYPEWRITER_MS = 30; // ms per character

function cutscenePlay(id, onDone) {
  const beats = SCENE_SCRIPTS[id];
  if (!beats || !beats.length) { if (onDone) onDone(); return; }

  // Check if player has seen it (only show once per save)
  const seenKey = 'blipgrove_seen_cs_' + id;
  // Always play — remove this check if you want to show only once:
  // if (localStorage.getItem(seenKey)) { if (onDone) onDone(); return; }
  try { localStorage.setItem(seenKey, '1'); } catch(e) {}

  _csBeats     = beats;
  _csBeatIdx   = 0;
  _csLineIdx   = 0;
  _csLineT     = 0;
  _csBeatT     = 0;
  _csLastT     = performance.now();
  _csDoneCb    = onDone;
  _csPlaying   = true;
  _csCurrentId = id;

  _ensureCSLayer();
  _csEl.style.display = 'flex';
  _csRafLoop();
}

function cutsceneSkip() {
  if (!_csPlaying) return;
  _csPlaying = false;
  if (_csRafHandle) { cancelAnimationFrame(_csRafHandle); _csRafHandle = null; }
  if (_csEl) _csEl.style.display = 'none';
  const cb = _csDoneCb; _csDoneCb = null;
  if (cb) cb();
}

function cutsceneIsPlaying() { return _csPlaying; }

function _csRafLoop() {
  if (!_csPlaying) return;
  const now = performance.now();
  const dt  = now - _csLastT;
  _csLastT  = now;

  _csBeatT += dt;
  _csLineT += dt;

  const beat = _csBeats[_csBeatIdx];
  if (!beat) { cutsceneSkip(); return; }

  // Draw frame
  const canvas = _csEl.querySelector('#csCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = canvas.width, H = canvas.height;
    // Background
    ctx.fillStyle = beat.bg || '#0b1020';
    ctx.fillRect(0, 0, W, H);
    // Scene draw
    if (beat.draw) beat.draw(ctx, _csBeatT / 1000, W, H);
    // Vignette
    const vig = ctx.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Typewriter text
  const lines = beat.lines || [];
  const line  = lines[_csLineIdx];
  const textEl = _csEl.querySelector('#csText');
  const speakerEl = _csEl.querySelector('#csSpeaker');

  if (line) {
    const charsShown = Math.floor(_csLineT / TYPEWRITER_MS);
    const displayed  = line.text.slice(0, charsShown);
    if (textEl)    textEl.textContent    = displayed;
    if (speakerEl) speakerEl.textContent = line.speaker + ':';

    // Auto-advance line when fully shown + brief pause
    if (charsShown >= line.text.length && _csLineT > line.text.length * TYPEWRITER_MS + 1200) {
      _csLineIdx++;
      _csLineT = 0;
      if (_csLineIdx >= lines.length) {
        // All lines shown — wait for beat duration or click
      }
    }
  } else {
    if (textEl)    textEl.textContent    = '';
    if (speakerEl) speakerEl.textContent = '';
  }

  // Auto-advance beat
  if (_csBeatT >= beat.duration && _csLineIdx >= lines.length) {
    _csBeatIdx++;
    _csBeatT   = 0;
    _csLineIdx = 0;
    _csLineT   = 0;
    if (_csBeatIdx >= _csBeats.length) {
      cutsceneSkip();
      return;
    }
  }

  _csRafHandle = requestAnimationFrame(_csRafLoop);
}

function _ensureCSLayer() {
  if (_csEl) return;

  const el = document.createElement('div');
  el.id = 'csLayer';
  el.style.cssText = [
    'position:absolute;inset:0;z-index:40;',
    'display:none;flex-direction:column;',
    'align-items:center;justify-content:flex-end;',
    'background:#000;',
  ].join('');

  el.innerHTML = `
    <canvas id="csCanvas" width="480" height="200"
      style="width:100%;max-width:480px;image-rendering:pixelated;display:block;"></canvas>
    <div id="csSpeechBox" style="
      width:100%;max-width:480px;
      background:rgba(11,16,32,.92);
      border-top:3px solid #ffd866;
      padding:10px 16px 14px;
      font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
      min-height:54px;position:relative;
    ">
      <div id="csSpeaker" style="font-size:9px;letter-spacing:2px;color:#ffd866;margin-bottom:4px;"></div>
      <div id="csText"    style="font-size:12px;letter-spacing:1px;color:#fff4d6;line-height:1.5;"></div>
      <div style="position:absolute;bottom:8px;right:12px;font-size:8px;letter-spacing:1px;color:rgba(255,244,214,.35);">
        TAP / CLICK TO SKIP
      </div>
    </div>
  `;

  el.addEventListener('click', () => {
    // First click: skip to end of current line; second click: advance beat
    const beat = _csBeats[_csBeatIdx];
    const line = beat?.lines?.[_csLineIdx];
    if (line) {
      const fullLen = line.text.length;
      const charsShown = Math.floor(_csLineT / TYPEWRITER_MS);
      if (charsShown < fullLen) {
        // Jump to end of line
        _csLineT = fullLen * TYPEWRITER_MS + 1300;
      } else {
        // Advance to next line or beat
        _csLineIdx++;
        _csLineT = 0;
        if (_csLineIdx >= (beat.lines || []).length) {
          _csBeatIdx++;
          _csBeatT   = beat.duration; // force beat advance
          _csLineIdx = 0;
          _csLineT   = 0;
          if (_csBeatIdx >= _csBeats.length) { cutsceneSkip(); return; }
        }
      }
    }
  });

  const stage = document.getElementById('stage') || document.body;
  stage.appendChild(el);
  _csEl = el;
}

// ─── Integration helpers ──────────────────────────────────────────────────────
// Call from engine.js / ui.js at the right moment:
//
//   Before level 0:   cutscenePlay('intro', () => startLevel(0))
//   After level N clear, before N+1:
//     const id = ['grove_beach','beach_cave','cave_sky'][N];  // N=0,1,2
//     if (id) cutscenePlay(id, () => startLevel(N+1));
//     else startLevel(N+1);
//   After boss defeated:  cutscenePlay('ending', () => showTitle())
