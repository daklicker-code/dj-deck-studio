/**
 * FXUnit — Multi-effect processor (Reverb, Delay, Filter, Distortion, Flanger, Phaser)
 * Modeled after Pioneer DJM-FX / RMX-1000 style
 */
import { PluginBase } from './PluginBase.js';
import { drawBody, drawKnob, drawButton, drawLED, drawDisplay, drawScrew, rr, lighten, darken } from '../DrawUtils.js';

const FX_LIST = [
  { name: 'REVERB',   color: '#3a9bd5' },
  { name: 'DELAY',    color: '#e08020' },
  { name: 'FILTER',   color: '#44cc66' },
  { name: 'DISTORT',  color: '#cc3333' },
  { name: 'FLANGER',  color: '#aa44cc' },
  { name: 'PHASER',   color: '#ccaa00' },
];

export class FXUnit extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'FX Unit';
    this.pluginKey = 'fxunit';

    this.activeFX   = 0;      // index into FX_LIST
    this.wet        = 0.5;    // 0..1
    this.param1     = 0.5;    // time/freq/amount
    this.param2     = 0.3;    // feedback/resonance/mix
    this.isEnabled  = false;
    this.tapBeat    = 0;
    this._tapTimes  = [];

    this._out     = null;
    this._dryGain = null;
    this._wetGain = null;
    this._fxNode  = null;
    this._cvTop   = null;
  }

  defaultConfig() { return {}; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = 0.9;
    this._rebuildFX();
  }

  _rebuildFX() {
    if (!this.ae?.ctx) return;
    const { ctx } = this.ae;
    // minimal effect chain: dry/wet mix
    this._dryGain = ctx.createGain(); this._dryGain.gain.value = 1 - this.wet;
    this._wetGain = ctx.createGain(); this._wetGain.gain.value = this.wet;
    const dest = this._out || this.ae.master;
    this._dryGain.connect(dest);
    this._wetGain.connect(dest);
    // Create the specific effect
    const fx = FX_LIST[this.activeFX];
    try {
      if (fx.name === 'REVERB') {
        const conv = ctx.createConvolver();
        const len = ctx.sampleRate * (this.param1 * 3 + 0.5);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1-(i/len), 2+this.param2*5);
        }
        conv.buffer = buf;
        this._fxNode = conv;
      } else if (fx.name === 'DELAY') {
        const delay = ctx.createDelay(2.0);
        delay.delayTime.value = 0.05 + this.param1 * 1.0;
        const fb = ctx.createGain(); fb.gain.value = this.param2 * 0.85;
        delay.connect(fb); fb.connect(delay);
        this._fxNode = delay;
      } else if (fx.name === 'FILTER') {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 80 + this.param1 * 15000;
        filt.Q.value = 1 + this.param2 * 20;
        this._fxNode = filt;
      } else if (fx.name === 'DISTORT') {
        const wave = ctx.createWaveShaper();
        const amount = 50 + this.param1 * 400;
        const n = 256;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i*2/n - 1);
          curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
        }
        wave.curve = curve;
        this._fxNode = wave;
      } else {
        // Flanger / Phaser — simple allpass for preview
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass'; ap.frequency.value = 200 + this.param1 * 3000; ap.Q.value = 5;
        this._fxNode = ap;
      }
      this._fxNode.connect(this._wetGain);
    } catch(e) { /* ignore */ }
  }

  getInput() { return this._dryGain; }

  /* ============ VIEWS ============ */

  createTopView() {
    const cv = document.createElement('canvas');
    cv.width = 280; cv.height = 160;
    cv.style.cursor = 'pointer';
    this._cvTop = cv;
    this._draw(cv);

    cv.addEventListener('click', (e) => {
      const r   = cv.getBoundingClientRect();
      const x   = (e.clientX - r.left) * (cv.width  / r.width);
      const y   = (e.clientY - r.top)  * (cv.height / r.height);
      const W = cv.width, H = cv.height;
      // FX selector buttons (top row)
      const btnW = W / FX_LIST.length;
      if (y < 28) {
        this.activeFX = Math.min(FX_LIST.length - 1, Math.floor(x / btnW));
        this._rebuildFX();
        this._draw(cv);
        return;
      }
      // ON/OFF area
      if (x > W * 0.78 && y > H * 0.5 && y < H * 0.78) {
        this.isEnabled = !this.isEnabled;
        this._draw(cv);
      }
    });

    return cv;
  }

  _draw(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sc = W / 280;

    ctx.clearRect(0, 0, W, H);
    drawBody(ctx, 0, 0, W, H, 0, '#131218');

    const fx = FX_LIST[this.activeFX];

    // FX selector row (top)
    const btnW = W / FX_LIST.length;
    FX_LIST.forEach((f, i) => {
      const bx = i * btnW;
      const active = i === this.activeFX;
      const bg2 = ctx.createLinearGradient(bx, 0, bx, 26*sc);
      if (active) {
        bg2.addColorStop(0, f.color + '55'); bg2.addColorStop(1, f.color + '22');
      } else {
        bg2.addColorStop(0, '#1c1c28'); bg2.addColorStop(1, '#141420');
      }
      ctx.fillStyle = bg2; rr(ctx, bx + 1, 1, btnW - 2, 26*sc, 2*sc); ctx.fill();
      if (active) {
        ctx.strokeStyle = f.color + '80'; ctx.lineWidth = 1;
        rr(ctx, bx + 1, 1, btnW - 2, 26*sc, 2*sc); ctx.stroke();
      }
      ctx.fillStyle = active ? f.color : 'rgba(255,255,255,0.3)';
      ctx.font = `bold ${6.5*sc}px 'Courier New', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.name.length > 5 ? f.name.slice(0,5) : f.name, bx + btnW/2, 13*sc);
    });

    // Current FX color strip below selector
    const stripG = ctx.createLinearGradient(0, 27*sc, W, 27*sc);
    stripG.addColorStop(0, fx.color + '00');
    stripG.addColorStop(0.5, fx.color + '60');
    stripG.addColorStop(1, fx.color + '00');
    ctx.fillStyle = stripG;
    ctx.fillRect(0, 27*sc, W, 2*sc);

    // Display area
    drawDisplay(ctx, 6*sc, 32*sc, W - 12*sc, 22*sc,
      `${fx.name}  WET:${Math.round(this.wet*100)}%`, {
        bg: '#060810', textColor: fx.color, glow: true, font: `${7*sc}px 'Courier New',monospace`
      }
    );

    // Main knobs: WET, PARAM1, PARAM2
    const knobLabels = ['WET', 'PARAM 1', 'PARAM 2'];
    const knobVals   = [this.wet, this.param1, this.param2];
    const knobX      = [W*0.17, W*0.42, W*0.65];

    knobLabels.forEach((lbl, i) => {
      const ang = knobVals[i] * Math.PI * 1.5 - Math.PI * 1.1;
      drawKnob(ctx, knobX[i], H * 0.68, 13*sc, ang, {
        color: '#1c1c2a', accent: fx.color + '40', dotColor: fx.color,
        label: lbl, labelColor: 'rgba(220,220,235,0.6)'
      });
    });

    // ON/OFF button
    drawButton(ctx, W * 0.80, H * 0.52, 44*sc, 22*sc, {
      label: this.isEnabled ? 'ON' : 'OFF',
      lit: this.isEnabled, litColor: fx.color, r: 3*sc, fontSize: 9*sc
    });

    // Status LED
    drawLED(ctx, W * 0.90, H * 0.87, 4*sc, { lit: this.isEnabled, color: fx.color });

    // TAP tempo button
    drawButton(ctx, W * 0.80, H * 0.78, 44*sc, 15*sc, {
      label: 'TAP', lit: false, r: 2*sc, fontSize: 7*sc
    });

    // Corner screws
    [[3,3],[W-3,3],[3,H-3],[W-3,H-3]].forEach(([x,y]) => drawScrew(ctx, x, y, 2.5*sc));

    // Brand
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = `bold ${6*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PIONEER  RMX-1000', W * 0.42, H * 0.94);
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:380px;';

    // FX type selector
    const fxRow = document.createElement('div');
    fxRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    FX_LIST.forEach((f, i) => {
      const btn = this.makeBtn(f.name, 'cue-btn', () => {
        this.activeFX = i;
        fxRow.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this._rebuildFX();
        if (this._cvTop) this._draw(this._cvTop);
        updateDisplay();
      });
      btn.style.cssText += `border-left:2px solid ${f.color}80;`;
      if (i === this.activeFX) btn.classList.add('on');
      fxRow.appendChild(btn);
    });
    wrap.appendChild(fxRow);

    // Knobs row
    const knobRow = document.createElement('div');
    knobRow.style.cssText = 'display:flex;gap:16px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;color:var(--txt-dim);margin-top:4px;';
    const updateDisplay = () => { lbl.textContent = `${FX_LIST[this.activeFX].name}`; };
    updateDisplay();

    knobRow.appendChild(this.makeKnob('WET', 0, 1, this.wet, v => {
      this.wet = v;
      if (this._dryGain) this._dryGain.gain.value = 1 - v;
      if (this._wetGain) this._wetGain.gain.value = v;
      if (this._cvTop) this._draw(this._cvTop);
    }));
    knobRow.appendChild(this.makeKnob('PARAM 1', 0, 1, this.param1, v => {
      this.param1 = v; this._rebuildFX(); if (this._cvTop) this._draw(this._cvTop);
    }));
    knobRow.appendChild(this.makeKnob('PARAM 2', 0, 1, this.param2, v => {
      this.param2 = v; this._rebuildFX(); if (this._cvTop) this._draw(this._cvTop);
    }));
    wrap.appendChild(lbl);
    wrap.appendChild(knobRow);

    // ON button
    const onBtn = this.makeBtn(this.isEnabled ? 'ENABLED' : 'BYPASSED', 'play-btn', () => {
      this.isEnabled = !this.isEnabled;
      onBtn.textContent = this.isEnabled ? 'ENABLED' : 'BYPASSED';
      onBtn.classList.toggle('on', this.isEnabled);
      if (this._cvTop) this._draw(this._cvTop);
    });
    onBtn.classList.toggle('on', this.isEnabled);
    wrap.appendChild(onBtn);

    return wrap;
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div'); sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>FX Unit</h3><p style="font-size:9px;color:var(--txt-dim)">Multi-effect processor with 6 algorithms.</p>';
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    this.isEnabled = true;
    // Sweep param1
    let t = 0;
    const sweep = setInterval(() => {
      this.param1 = (Math.sin(t * 0.4) + 1) / 2;
      this._rebuildFX();
      if (this._cvTop) this._draw(this._cvTop);
      t++;
      if (t > 30) { clearInterval(sweep); this.isEnabled = false; if (this._cvTop) this._draw(this._cvTop); }
    }, 100);
  }

  destroy() {
    try { this._fxNode?.disconnect(); } catch(e) {}
  }

  getState() { return { activeFX: this.activeFX, wet: this.wet, param1: this.param1, param2: this.param2, isEnabled: this.isEnabled }; }
  setState(s) { Object.assign(this, s); }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    drawBody(ctx, 0, 0, W, H, 0, '#131218');
    // FX selector row
    const btnW = W / 6;
    FX_LIST.forEach((f, i) => {
      const bx = i * btnW;
      ctx.fillStyle = i === 0 ? f.color + '30' : '#1c1c28';
      rr(ctx, bx+1, 2, btnW-2, H*0.22, 2); ctx.fill();
      ctx.fillStyle = i === 0 ? f.color : 'rgba(255,255,255,0.25)';
      ctx.font = `bold 5px 'Courier New', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.name.slice(0,3), bx + btnW/2, H*0.11);
    });
    // display
    const fg = ctx.createLinearGradient(0, H*0.26, 0, H*0.5);
    fg.addColorStop(0, '#060810'); fg.addColorStop(1, '#000508');
    ctx.fillStyle = fg; rr(ctx, 4, H*0.26, W-8, H*0.2, 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = FX_LIST[0].color; ctx.shadowBlur = 4;
    ctx.fillStyle = FX_LIST[0].color;
    ctx.font = `bold 7px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REVERB  WET:50%', W/2, H*0.37);
    ctx.restore();
    // knobs
    [[W*0.2, H*0.72],[W*0.5, H*0.72],[W*0.8, H*0.72]].forEach(([kx,ky]) => {
      ctx.fillStyle = '#252535'; ctx.beginPath(); ctx.arc(kx, ky, 8, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = FX_LIST[0].color + '80'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(kx, ky, 8, Math.PI*0.75, Math.PI*1.5); ctx.stroke();
    });
  }
}
