/* Blip's Grove — audio.js
 *
 * All sound, fully synthesized with the Web Audio API — no audio files.
 *   - Gain graph: master → sfx / music / ambient buses (mixed in Settings)
 *   - sfx*() one-shots built from beep() (jump, dash, gem, hurt, boss hit, …)
 *   - startMusic(biome) / stopMusic()       — per-biome looping melody
 *   - startAmbient(biome) / stopAmbient()   — per-biome ambient bed
 *   - startTitleMusic() / stopTitleMusic()  — title-screen theme
 *
 * ensureAudio() lazily creates the AudioContext on first user gesture
 * (browser autoplay policy). applyVolumes() re-reads the settings mix.
 */
let audioCtx=null, muted=false, musicNodes=null, ambientNodes=null;
let masterGainNode=null, sfxGainNode=null, musicGainNode=null, ambientGainNode=null;

function ensureAudio(){
  if(!audioCtx){
    try{
      audioCtx=new(window.AudioContext||window.webkitAudioContext)();
      masterGainNode=audioCtx.createGain();
      sfxGainNode=audioCtx.createGain();
      musicGainNode=audioCtx.createGain();
      ambientGainNode=audioCtx.createGain();
      masterGainNode.connect(audioCtx.destination);
      sfxGainNode.connect(masterGainNode);
      musicGainNode.connect(masterGainNode);
      ambientGainNode.connect(masterGainNode);
      applyVolumes();
    }catch(e){ audioCtx=null; }
  }
  return audioCtx;
}
function applyVolumes(){
  if(!audioCtx) return;
  const m = muted ? 0 : (settings.volMaster||0);
  masterGainNode.gain.setTargetAtTime(m, audioCtx.currentTime, 0.02);
  sfxGainNode.gain.setTargetAtTime(settings.volSfx||0, audioCtx.currentTime, 0.02);
  musicGainNode.gain.setTargetAtTime(settings.volMusic||0, audioCtx.currentTime, 0.02);
  ambientGainNode.gain.setTargetAtTime((settings.volMusic||0)*0.7, audioCtx.currentTime, 0.05);
}

function beep(freq=440,dur=0.08,type='square',vol=0.15,slide=0){
  const a=ensureAudio(); if(!a) return;
  const t=a.currentTime; const o=a.createOscillator(); const g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(sfxGainNode||a.destination); o.start(t); o.stop(t+dur+0.02);
}

const sfxJump=()=>beep(660,0.08,'square',0.15,200);
const sfxDouble=()=>{beep(880,0.06,'square',0.15);setTimeout(()=>beep(1175,0.07,'square',0.13),60);};
const sfxDash=()=>beep(220,0.08,'sawtooth',0.18,200);
const sfxStomp=()=>{beep(180,0.06,'square',0.18,-80);setTimeout(()=>beep(120,0.08,'square',0.16,-40),40);};
const sfxHeadBounce=()=>beep(440,0.06,'triangle',0.15,200);
const sfxGem=()=>{beep(880,0.05,'square',0.18);setTimeout(()=>beep(1320,0.08,'square',0.16),60);};
const sfxHurt=()=>beep(300,0.15,'sawtooth',0.2,-180);
const sfxWin=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'triangle',0.16),i*110));
const sfxBump=()=>beep(250,0.06,'square',0.13,-40);
const sfxCheckpoint=()=>{beep(660,0.08,'triangle',0.16);setTimeout(()=>beep(990,0.1,'triangle',0.16),80);};
const sfxShoot=()=>beep(600,0.06,'sawtooth',0.07,-200);
const sfxWarp=()=>{beep(880,0.05,'square',0.12);setTimeout(()=>beep(660,0.05,'square',0.12),50);setTimeout(()=>beep(440,0.08,'square',0.12),100);};
const sfxBossHit=()=>{beep(140,0.12,'square',0.2,-40);setTimeout(()=>beep(80,0.15,'sawtooth',0.18,-30),80);};

function startMusic(biome){
  // Stop title music before starting biome music
  stopTitleMusic();
  if(musicNodes) return;
  const a=ensureAudio(); if(!a) return;
  const tunes = {
    grove:[262,330,392,330,294,349,440,349],
    beach:[262,392,440,494,392,330,392,440],
    cave:[196,247,294,247,220,262,330,262],
    boss:[131,156,165,196,156,131,165,196],
    bonus:[523,659,784,659,587,659,784,1047],
    sky:[523,587,659,784,659,587,523,494]
  };
  const notes = tunes[biome] || tunes.grove;
  let i=0;
  const step=()=>{
    if(!musicNodes) return;
    const t=a.currentTime; const o=a.createOscillator(); const g=a.createGain();
    o.type='square'; o.frequency.value = notes[i%notes.length]/2;
    g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.18);
    o.connect(g).connect(musicGainNode); o.start(t); o.stop(t+0.2);
    i++; musicNodes.timeout=setTimeout(step,220);
  };
  musicNodes={timeout:null}; step();
  startAmbient(biome);
}
function stopMusic(){
  if(musicNodes){ clearTimeout(musicNodes.timeout); musicNodes=null; }
  stopAmbient();
  // Also stop title music if it was playing
  stopTitleMusic();
}

// Per-biome ambient drone layer — continuous pads/textures under the melody.
function startAmbient(biome){
  const a=ensureAudio(); if(!a) return;
  stopAmbient();
  ambientNodes = { sources:[], lfos:[] };

  const make = (freq, type='sine', vol=0.06, detune=0) => {
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.value = vol;
    o.connect(g).connect(ambientGainNode);
    o.start();
    ambientNodes.sources.push(o); ambientNodes.sources.push(g);
    return {o,g};
  };

  if(biome==='grove'){
    // Soft pad: 5th + octave
    make(196, 'sine', 0.08);
    make(294, 'sine', 0.06, 5);
    // Bird-like tweet via slow LFO mod
    const t = make(1200, 'triangle', 0.0);
    const lfo = a.createOscillator(); const lfoG = a.createGain();
    lfo.frequency.value = 0.2; lfoG.gain.value = 0.025;
    lfo.connect(lfoG).connect(t.g.gain); lfo.start();
    ambientNodes.lfos.push(lfo); ambientNodes.lfos.push(lfoG);
  } else if(biome==='beach'){
    // Wash sound: filtered noise pulses
    const buf = a.createBuffer(1, a.sampleRate*2, a.sampleRate);
    const d = buf.getChannelData(0);
    for(let j=0;j<d.length;j++) d[j] = (Math.random()*2-1) * 0.4;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = a.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=600;
    const g = a.createGain(); g.gain.value=0.08;
    src.connect(filt).connect(g).connect(ambientGainNode);
    src.start();
    // Slow swell
    const lfo = a.createOscillator(); const lfoG = a.createGain();
    lfo.frequency.value = 0.18; lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(g.gain); lfo.start();
    ambientNodes.sources.push(src); ambientNodes.sources.push(g);
    ambientNodes.lfos.push(lfo); ambientNodes.lfos.push(lfoG);
    // Low pad
    make(110, 'sine', 0.05);
  } else if(biome==='cave'){
    // Deep drone + occasional drip
    make(82, 'sine', 0.1);
    make(123, 'sine', 0.04, 7);
    // Echo drips: short tone every few seconds
    const dripTimer = setInterval(()=>{
      if(!ambientNodes) return;
      const t = a.currentTime;
      const o = a.createOscillator(); const g = a.createGain();
      o.type='sine'; o.frequency.value = 1400 + Math.random()*600;
      g.gain.setValueAtTime(0.0,t);
      g.gain.linearRampToValueAtTime(0.05,t+0.01);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
      o.connect(g).connect(ambientGainNode); o.start(t); o.stop(t+0.7);
    }, 3500 + Math.random()*2000);
    ambientNodes.dripTimer = dripTimer;
  } else if(biome==='boss'){
    // Tense low pulse + dissonant interval
    make(110, 'sawtooth', 0.06);
    make(116, 'sawtooth', 0.05);
    make(220, 'sawtooth', 0.03, -8);
  } else if(biome==='bonus'){
    // Sparkly major chord shimmer
    make(523, 'triangle', 0.04);
    make(659, 'triangle', 0.04, 4);
    make(784, 'triangle', 0.04, -3);
  } else if(biome==='sky'){
    // Airy open-fifth pad — high and floaty
    make(392, 'sine', 0.07);
    make(588, 'sine', 0.05, 6);   // fifth above, slight detune
    make(784, 'sine', 0.03, -4);  // octave, slightly flat for shimmer
    // Slow tremolo on the top voice
    const top = make(1047, 'triangle', 0.0);
    const lfo = a.createOscillator(); const lfoG = a.createGain();
    lfo.frequency.value = 0.35; lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(top.g.gain); lfo.start();
    ambientNodes.lfos.push(lfo); ambientNodes.lfos.push(lfoG);
  }
}
function stopAmbient(){
  if(!ambientNodes) return;
  if(ambientNodes.dripTimer) clearInterval(ambientNodes.dripTimer);
  for(const n of ambientNodes.sources){ try{ if(n.stop) n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} }
  for(const n of ambientNodes.lfos){ try{ if(n.stop) n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} }
  ambientNodes = null;
}

// ─── Title / menu theme ───────────────────────────────────────────────────────
// A gentle major-key arpeggio with a warm pad — loops while the menu is open.
let _titleMusicNodes = null;

function startTitleMusic() {
  // Stop any in-game music first
  if(musicNodes){ clearTimeout(musicNodes.timeout); musicNodes=null; }
  stopAmbient();
  if (_titleMusicNodes) return;
  const a = ensureAudio(); if (!a) return;
  if (muted) return;

  // Melody: gentle pentatonic arpeggio in C major
  const melody = [523, 659, 784, 1047, 784, 659, 523, 392];
  let mi = 0;
  let _step;
  _titleMusicNodes = { timeout: null, osc: null };

  _step = () => {
    if (!_titleMusicNodes) return;
    const freq = melody[mi % melody.length];
    mi++;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(0.07, a.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.38);
    o.connect(g).connect(musicGainNode);
    o.start(a.currentTime);
    o.stop(a.currentTime + 0.4);
    _titleMusicNodes.timeout = setTimeout(_step, 340);
  };
  _step();

  // Warm pad underneath — two detuned sines on the tonic
  const pad1 = a.createOscillator();
  const pad2 = a.createOscillator();
  const padG  = a.createGain();
  pad1.type = 'sine'; pad1.frequency.value = 130;
  pad2.type = 'sine'; pad2.frequency.value = 131.5; // slight detune for warmth
  padG.gain.value = 0.055;
  pad1.connect(padG); pad2.connect(padG);
  padG.connect(musicGainNode);
  pad1.start(); pad2.start();
  _titleMusicNodes.pads = [pad1, pad2, padG];
}

function stopTitleMusic() {
  if (!_titleMusicNodes) return;
  if (_titleMusicNodes.timeout) clearTimeout(_titleMusicNodes.timeout);
  if (_titleMusicNodes.pads) {
    for (const n of _titleMusicNodes.pads) {
      try { if (n.stop) n.stop(); } catch(e) {}
      try { n.disconnect(); } catch(e) {}
    }
  }
  _titleMusicNodes = null;
}

function toggleMute(){
  muted = !muted;
  const btn = document.getElementById('muteBtn');
  if(btn) btn.textContent = muted ? '×' : '♪';
  applyVolumes();
}
