import { PluginBase } from './PluginBase.js';
import { drawBody, drawKnob, drawButton, drawDisplay, drawScrew, rr, lighten, darken } from '../DrawUtils.js';

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK  = [1,3,6,8,10]; // indices that are sharps

function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

export class Synth extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'Synthesizer';
    this.pluginKey = 'synth';

    this.osc1Type  = 'sawtooth';
    this.osc2Type  = 'square';
    this.osc2Det   = 7;    // cents
    this.filterFreq = 2000;
    this.filterRes  = 1;
    this.attack  = 0.01;
    this.decay   = 0.3;
    this.sustain = 0.6;
    this.release = 0.4;
    this.lfoRate  = 2;
    this.lfoDepth = 0;
    this.lfoTarget = 'pitch'; // pitch|filter|amp
    this.masterVol = 0.7;
    this.octave = 4;

    this._active  = {}; // key → { osc1, osc2, env, lfo }
    this._out = null;
    this._filter = null;
    this._lfo    = null;
    this._lfoGain = null;
    this._demoKeys = [];
  }

  defaultConfig() { return {}; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    const { ctx } = ae;

    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = this.masterVol;

    this._filter = ctx.createBiquadFilter();
    this._filter.type = 'lowpass';
    this._filter.frequency.value = this.filterFreq;
    this._filter.Q.value = this.filterRes;
    this._filter.connect(this._out);

    this._lfo = ctx.createOscillator();
    this._lfoGain = ctx.createGain();
    this._lfo.frequency.value = this.lfoRate;
    this._lfoGain.gain.value = this.lfoDepth;
    this._lfo.connect(this._lfoGain);
    this._lfo.start();
  }

  _noteOn(midi) {
    if (!this.ae?.ctx) return;
    const { ctx } = this.ae;
    const freq = midiToFreq(midi);
    if (this._active[midi]) this._noteOff(midi);

    const env = ctx.createGain(); env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(1, ctx.currentTime + this.attack);
    env.gain.linearRampToValueAtTime(this.sustain, ctx.currentTime + this.attack + this.decay);
    env.connect(this._filter);

    const o1 = ctx.createOscillator();
    o1.type = this.osc1Type; o1.frequency.value = freq;
    o1.connect(env); o1.start();

    const o2 = ctx.createOscillator();
    o2.type = this.osc2Type;
    o2.frequency.value = freq * Math.pow(2, this.osc2Det / 1200);
    o2.connect(env); o2.start();

    // LFO routing
    if (this.lfoTarget === 'pitch') { this._lfoGain.connect(o1.frequency); this._lfoGain.connect(o2.frequency); }
    else if (this.lfoTarget === 'filter') { this._lfoGain.connect(this._filter.frequency); }
    else if (this.lfoTarget === 'amp') { this._lfoGain.connect(env.gain); }

    this._active[midi] = { o1, o2, env };
  }

  _noteOff(midi) {
    const v = this._active[midi]; if (!v) return;
    const { ctx } = this.ae;
    const { o1, o2, env } = v;
    const t = ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(env.gain.value, t);
    env.gain.linearRampToValueAtTime(0, t + this.release);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch(_){} }, (this.release + 0.1) * 1000);
    delete this._active[midi];
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;';

    // Mini oscilloscope canvas
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 48;
    canvas.style.cssText = 'width:100%;height:48px;background:#0a0a12;border-bottom:1px solid var(--bdr);';
    wrap.appendChild(canvas);
    this._drawScope(canvas);

    // Mini keyboard
    const kbWrap = document.createElement('div');
    kbWrap.style.cssText = 'position:relative;height:52px;padding:4px;background:var(--bg-dark);';
    this._buildMiniKeys(kbWrap);
    wrap.appendChild(kbWrap);

    // Label row
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:3px 8px;background:var(--bg-dark);border-top:1px solid var(--bdr);font-size:9px;color:var(--txt-dim);';
    bar.innerHTML = `<span>${this.osc1Type.slice(0,3).toUpperCase()}</span><span>+</span><span>${this.osc2Type.slice(0,3).toUpperCase()}</span><span style="margin-left:auto">Oct ${this.octave}</span>`;
    wrap.appendChild(bar);
    return wrap;
  }

  _drawScope(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Screen bezel
    ctx.save();
    ctx.shadowColor = 'rgba(0,180,255,0.3)'; ctx.shadowBlur = 8;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040810'); bg.addColorStop(1, '#000608');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Grid lines
    ctx.strokeStyle = 'rgba(0,100,160,0.18)'; ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(W*i/4, 2); ctx.lineTo(W*i/4, H-2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(2, H/2); ctx.lineTo(W-2, H/2); ctx.stroke();

    // Waveform with glow
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 6;
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const t = x / W * Math.PI * 4;
      let y;
      if (this.osc1Type === 'sawtooth')     y = H/2 - ((t % Math.PI) / Math.PI - 0.5) * (H * 0.65);
      else if (this.osc1Type === 'square')  y = H/2 - (Math.sin(t) > 0 ? 1 : -1) * (H * 0.33);
      else if (this.osc1Type === 'triangle')y = H/2 - (2/Math.PI * Math.asin(Math.sin(t))) * (H * 0.33);
      else                                  y = H/2 - Math.sin(t) * (H * 0.33);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Screen reflection
    const ref = ctx.createLinearGradient(0, 0, W*.4, H*.5);
    ref.addColorStop(0, 'rgba(255,255,255,0.04)'); ref.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ref; ctx.fillRect(0, 0, W, H);
  }

  _buildMiniKeys(container) {
    const octNotes = 12;
    const whites = [0,2,4,5,7,9,11];
    const wW = (container.clientWidth || 240) / 7 || 30;
    const wH = 44;

    whites.forEach((ni, i) => {
      const midi = this.octave * 12 + ni;
      const k = document.createElement('div');
      k.className = 'wkey';
      k.style.cssText = `position:absolute;left:${i*wW}px;top:0;width:${wW-1}px;height:${wH}px;`;
      k.addEventListener('mousedown', e => { e.preventDefault(); if (this.ae) this.ae.resume(); this._noteOn(midi); });
      k.addEventListener('mouseup', () => this._noteOff(midi));
      k.addEventListener('mouseleave', () => this._noteOff(midi));
      container.appendChild(k);
    });
    const blacks = [{n:1,pos:0.6},{n:3,pos:1.5},{n:6,pos:3.6},{n:8,pos:4.5},{n:10,pos:5.4}];
    blacks.forEach(({n, pos}) => {
      const midi = this.octave * 12 + n;
      const k = document.createElement('div');
      k.className = 'bkey';
      k.style.cssText = `position:absolute;left:${pos*wW}px;top:0;width:${wW*0.65}px;height:${wH*0.62}px;`;
      k.addEventListener('mousedown', e => { e.preventDefault(); if (this.ae) this.ae.resume(); this._noteOn(midi); });
      k.addEventListener('mouseup', () => this._noteOff(midi));
      k.addEventListener('mouseleave', () => this._noteOff(midi));
      container.appendChild(k);
    });
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    // Oscilloscope
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 60;
    canvas.style.cssText = 'width:100%;height:60px;background:#0a0a12;border-radius:4px;border:1px solid var(--bdr);';
    this._drawScope(canvas);
    wrap.appendChild(canvas);

    // Oscillators row
    const oscRow = document.createElement('div');
    oscRow.style.cssText = 'display:flex;gap:16px;';

    // OSC1
    const osc1Panel = this._makePanel('OSC 1');
    const osc1Sel = this._makeWaveSelect(this.osc1Type, v => { this.osc1Type = v; this._drawScope(canvas); });
    osc1Panel.appendChild(osc1Sel);
    osc1Panel.appendChild(this.makeKnob('OCT', 1, 8, this.octave, v => { this.octave = Math.round(v); }, 'sm'));
    oscRow.appendChild(osc1Panel);

    // OSC2
    const osc2Panel = this._makePanel('OSC 2');
    const osc2Sel = this._makeWaveSelect(this.osc2Type, v => { this.osc2Type = v; });
    osc2Panel.appendChild(osc2Sel);
    osc2Panel.appendChild(this.makeKnob('DET', -50, 50, this.osc2Det, v => { this.osc2Det = v; }, 'sm'));
    oscRow.appendChild(osc2Panel);

    // Filter
    const fltPanel = this._makePanel('FILTER');
    fltPanel.appendChild(this.makeKnob('FREQ', 20, 18000, this.filterFreq, v => {
      this.filterFreq = v;
      if (this._filter) this._filter.frequency.setTargetAtTime(v, this.ae.ctx.currentTime, 0.01);
    }, 'sm'));
    fltPanel.appendChild(this.makeKnob('RES', 0, 25, this.filterRes, v => {
      this.filterRes = v;
      if (this._filter) this._filter.Q.setTargetAtTime(v, this.ae.ctx.currentTime, 0.01);
    }, 'sm'));
    oscRow.appendChild(fltPanel);

    wrap.appendChild(oscRow);

    // ADSR row
    const adsrPanel = this._makePanel('ENVELOPE (ADSR)');
    adsrPanel.style.flexDirection = 'row'; adsrPanel.style.gap = '12px';
    adsrPanel.appendChild(this.makeKnob('ATK', 0.001, 2, this.attack, v => this.attack = v));
    adsrPanel.appendChild(this.makeKnob('DEC', 0.01, 2, this.decay, v => this.decay = v));
    adsrPanel.appendChild(this.makeKnob('SUS', 0, 1, this.sustain, v => this.sustain = v));
    adsrPanel.appendChild(this.makeKnob('REL', 0.01, 4, this.release, v => this.release = v));
    wrap.appendChild(adsrPanel);

    // LFO row
    const lfoPanel = this._makePanel('LFO');
    lfoPanel.style.flexDirection = 'row'; lfoPanel.style.gap = '12px';
    lfoPanel.appendChild(this.makeKnob('RATE', 0.1, 20, this.lfoRate, v => {
      this.lfoRate = v;
      if (this._lfo) this._lfo.frequency.setTargetAtTime(v, this.ae.ctx.currentTime, 0.01);
    }));
    lfoPanel.appendChild(this.makeKnob('DEPTH', 0, 100, this.lfoDepth, v => {
      this.lfoDepth = v;
      if (this._lfoGain) this._lfoGain.gain.setTargetAtTime(v, this.ae.ctx.currentTime, 0.01);
    }));
    const tgtSel = document.createElement('select');
    tgtSel.style.cssText = 'background:var(--bg);border:1px solid var(--bdr);color:var(--txt);padding:3px 6px;border-radius:3px;font-size:10px;align-self:flex-end;margin-bottom:4px;';
    ['pitch','filter','amp'].forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t.toUpperCase(); if (t === this.lfoTarget) o.selected = true; tgtSel.appendChild(o); });
    tgtSel.addEventListener('change', () => { this.lfoTarget = tgtSel.value; });
    const tgtWrap = document.createElement('div');
    tgtWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-self:flex-end;padding-bottom:4px;';
    const tgtLbl = document.createElement('div'); tgtLbl.style.cssText = 'font-size:9px;color:var(--txt-dim);'; tgtLbl.textContent = 'TARGET';
    tgtWrap.append(tgtLbl, tgtSel); lfoPanel.appendChild(tgtWrap);
    wrap.appendChild(lfoPanel);

    // 2-octave keyboard
    const kbPanel = this._makePanel('KEYBOARD (Oct ' + this.octave + ')');
    kbPanel.style.height = '70px'; kbPanel.style.position = 'relative';
    this._buildFullKeys(kbPanel);
    wrap.appendChild(kbPanel);

    return wrap;
  }

  _makePanel(title) {
    const p = document.createElement('div');
    p.style.cssText = 'flex:1;background:var(--bg-dark);border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;';
    if (title) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:9px;color:var(--accent);letter-spacing:1px;text-transform:uppercase;';
      h.textContent = title; p.appendChild(h);
    }
    return p;
  }

  _makeWaveSelect(val, onChange) {
    const sel = document.createElement('select');
    sel.style.cssText = 'background:var(--bg);border:1px solid var(--bdr);color:var(--txt);padding:3px 6px;border-radius:3px;font-size:10px;';
    ['sine','square','sawtooth','triangle'].forEach(t => {
      const o = document.createElement('option'); o.value = t; o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      if (t === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  _buildFullKeys(container) {
    // 2 octaves
    for (let oct = 0; oct < 2; oct++) {
      const whites = [0,2,4,5,7,9,11];
      const wW = 20;
      const offsetX = 10 + oct * whites.length * wW;
      whites.forEach((ni, i) => {
        const midi = (this.octave + oct) * 12 + ni;
        const k = document.createElement('div');
        k.className = 'wkey';
        k.style.cssText = `position:absolute;left:${offsetX + i * wW}px;top:4px;width:${wW-1}px;height:58px;`;
        k.addEventListener('mousedown', e => { e.preventDefault(); if (this.ae) this.ae.resume(); this._noteOn(midi); });
        k.addEventListener('mouseup', () => this._noteOff(midi));
        k.addEventListener('mouseleave', () => this._noteOff(midi));
        container.appendChild(k);
      });
      const blacks = [{n:1,pos:.6},{n:3,pos:1.5},{n:6,pos:3.6},{n:8,pos:4.5},{n:10,pos:5.4}];
      blacks.forEach(({n, pos}) => {
        const midi = (this.octave + oct) * 12 + n;
        const k = document.createElement('div');
        k.className = 'bkey';
        k.style.cssText = `position:absolute;left:${offsetX + pos*wW}px;top:4px;width:${wW*0.65}px;height:36px;`;
        k.addEventListener('mousedown', e => { e.preventDefault(); if (this.ae) this.ae.resume(); this._noteOn(midi); });
        k.addEventListener('mouseup', () => this._noteOff(midi));
        k.addEventListener('mouseleave', () => this._noteOff(midi));
        container.appendChild(k);
      });
    }
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div'); sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Synth Settings</h3>';

    const volRow = document.createElement('div'); volRow.className = 'cfg-row';
    const vl = document.createElement('label'); vl.textContent = 'Master Vol';
    const vs = document.createElement('input'); vs.type='range'; vs.min=0; vs.max=1; vs.step=.01; vs.value=this.masterVol;
    vs.addEventListener('input', () => { this.masterVol = parseFloat(vs.value); if (this._out) this._out.gain.value = this.masterVol; });
    volRow.append(vl, vs); sec.appendChild(volRow);

    const octRow = document.createElement('div'); octRow.className = 'cfg-row';
    const ol = document.createElement('label'); ol.textContent = 'Base Octave';
    const os = document.createElement('input'); os.type='range'; os.min=1; os.max=7; os.step=1; os.value=this.octave;
    os.addEventListener('input', () => { this.octave = parseInt(os.value); });
    octRow.append(ol, os); sec.appendChild(octRow);

    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    const melody = [60,62,64,65,67,65,64,62,60];
    melody.forEach((midi, i) => {
      setTimeout(() => { this._noteOn(midi); setTimeout(() => this._noteOff(midi), 280); }, i * 350);
    });
  }

  onZoomClose() {}
  syncBPM() {}
  destroy() { Object.keys(this._active).forEach(k => this._noteOff(k)); }

  getState() { return { osc1Type: this.osc1Type, osc2Type: this.osc2Type, osc2Det: this.osc2Det, filterFreq: this.filterFreq, filterRes: this.filterRes, attack: this.attack, decay: this.decay, sustain: this.sustain, release: this.release, lfoRate: this.lfoRate, lfoDepth: this.lfoDepth, lfoTarget: this.lfoTarget, masterVol: this.masterVol, octave: this.octave }; }
  setState(s) { Object.assign(this, s); }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    drawBody(ctx, 0, 0, W, H, 0, '#111118');
    // scope area
    const scopeH = H * 0.28;
    const sbg = ctx.createLinearGradient(0, 0, 0, scopeH);
    sbg.addColorStop(0, '#040810'); sbg.addColorStop(1, '#000608');
    ctx.fillStyle = sbg; rr(ctx, 4, 4, W-8, scopeH-4, 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 4;
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 4; x < W-4; x++) {
      const t = (x-4) / (W-8) * Math.PI * 4;
      const y = scopeH/2 - Math.sin(t) * (scopeH * 0.3);
      x === 4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // keyboard
    const kbY = scopeH, kbH = H - scopeH;
    const whites = 7, wW = W / whites;
    for (let i = 0; i < whites; i++) {
      const kg = ctx.createLinearGradient(0, kbY, 0, H);
      kg.addColorStop(0, '#e8e8d8'); kg.addColorStop(1, '#c8c8b8');
      ctx.fillStyle = kg; rr(ctx, i*wW+1, kbY+2, wW-2, kbH-4, 1); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
    }
    const bpos = [0.6,1.5,3.6,4.5,5.4];
    bpos.forEach(p => {
      const bg2 = ctx.createLinearGradient(0, kbY, 0, kbY + kbH*0.65);
      bg2.addColorStop(0, '#252525'); bg2.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = bg2; rr(ctx, p*wW+1, kbY+2, wW*0.65-1, kbH*0.6, 1); ctx.fill();
    });
  }
}
