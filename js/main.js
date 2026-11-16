/**
 * DJ Deck Studio — main entry point
 * Wires up the AudioEngine, DeckManager, and all plugin registrations.
 */

import { AudioEngine }  from './AudioEngine.js';
import { DeckManager }  from './DeckManager.js';
import { Turntable }    from './plugins/Turntable.js';
import { Mixer }        from './plugins/Mixer.js';
import { DrumPad }      from './plugins/DrumPad.js';
import { Synth }        from './plugins/Synth.js';
import { CDJ }          from './plugins/CDJ.js';
import { FXUnit }       from './plugins/FXUnit.js';
import { SamplerPad }   from './plugins/SamplerPad.js';
import { BeatMachine }  from './plugins/BeatMachine.js';

/* ── Globals ── */
const ae  = new AudioEngine();
const dm  = new DeckManager(ae);

/* ── Register all plugins ── */
dm.register(Turntable);
dm.register(Mixer);
dm.register(DrumPad);
dm.register(Synth);
dm.register(CDJ);
dm.register(FXUnit);
dm.register(SamplerPad);
dm.register(BeatMachine);

/* ── Header: BPM controls ── */
const bpmInput   = document.getElementById('master-bpm');
const tapBtn     = document.getElementById('tap-tempo');
const masterVol  = document.getElementById('master-vol');
const mvolVal    = document.getElementById('mvol-val');
const bpmDn      = document.getElementById('bpm-dn');
const bpmUp      = document.getElementById('bpm-up');
const syncAll    = document.getElementById('sync-all');
const btnSave    = document.getElementById('btn-save');
const btnLoad    = document.getElementById('btn-load');

bpmInput?.addEventListener('change', () => {
  const bpm = Math.max(40, Math.min(300, parseInt(bpmInput.value) || 128));
  bpmInput.value = bpm;
  ae.setBPM(bpm);
});

bpmDn?.addEventListener('click', () => { const v = Math.max(40, (parseInt(bpmInput?.value) || 128) - 1); if (bpmInput) bpmInput.value = v; ae.setBPM(v); ae.resume(); });
bpmUp?.addEventListener('click', () => { const v = Math.min(300, (parseInt(bpmInput?.value) || 128) + 1); if (bpmInput) bpmInput.value = v; ae.setBPM(v); ae.resume(); });

syncAll?.addEventListener('click', () => { ae.resume(); ae.setBPM(parseInt(bpmInput?.value) || 128); });

btnSave?.addEventListener('click', () => {
  const data = localStorage.getItem('dj-deck-state') || '[]';
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dj-deck-setup.json'; a.click();
});

btnLoad?.addEventListener('click', () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { try { localStorage.setItem('dj-deck-state', ev.target.result); location.reload(); } catch(_){} };
    r.readAsText(f);
  };
  inp.click();
});

// Tap Tempo
let tapTimes = [];
tapBtn?.addEventListener('click', () => {
  const now = performance.now();
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length >= 2) {
    let gaps = 0;
    for (let i = 1; i < tapTimes.length; i++) gaps += tapTimes[i] - tapTimes[i - 1];
    const avgMs = gaps / (tapTimes.length - 1);
    const bpm = Math.round(60000 / avgMs);
    if (bpm >= 40 && bpm <= 300) {
      bpmInput.value = bpm;
      ae.setBPM(bpm);
    }
  }
  // Reset tap buffer after 3s inactivity
  clearTimeout(tapBtn._resetTimer);
  tapBtn._resetTimer = setTimeout(() => { tapTimes = []; }, 3000);
  ae.resume();
});

masterVol?.addEventListener('input', () => {
  const v = parseInt(masterVol.value) / 100;
  ae.setMasterVol(v);
  if (mvolVal) mvolVal.textContent = masterVol.value;
  ae.resume();
});

/* ── Keyboard shortcut: Space → resume AudioContext ── */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === ' ') { e.preventDefault(); ae.resume(); }
});

/* ── First user interaction → start AudioEngine ── */
document.addEventListener('click', () => ae.start(), { once: true });
document.addEventListener('keydown', () => ae.start(), { once: true });

/* ── Restore saved setup ── */
dm.restoreSaved();

/* ── Show version in console ── */
console.log('%cDJ Deck Studio v0.2', 'color:#3a9bd5;font-size:16px;font-weight:bold;');
console.log('%c8 devices: Turntable, Mixer, DrumPad, Synth, CDJ, FX Unit, Sampler Pad, Beat Machine', 'color:#888;');
