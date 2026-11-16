/**
 * SamplerPad — Akai MPC One style 4×4 sampler pad
 */
import { PluginBase } from './PluginBase.js';
import { drawBody, drawButton, drawLED, drawDisplay, drawKnob, drawPad, drawScrew, rr, lighten, darken } from '../DrawUtils.js';

export class SamplerPad extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'Sampler Pad';
    this.pluginKey = 'samplerpad';

    this.bank = 0; // A/B/C/D
    this.pads = Array.from({ length: 16 }, (_, i) => ({
      name: `PAD ${i + 1}`,
      buf: null, vol: 0.9, pitch: 1.0,
      color: SamplerPad.PAD_COLORS[i],
      lit: false,
    }));
    this.swing   = 0.5;
    this.level   = 0.8;
    this._out    = null;
    this._padEls = [];
    this._cvTop  = null;
    this._hitState = new Array(16).fill(0); // brightness 0..1 for flash
    this._raf    = null;
  }

  static PAD_COLORS = [
    '#e53935','#e53935','#fb8c00','#fb8c00',
    '#43a047','#43a047','#1e88e5','#1e88e5',
    '#8e24aa','#8e24aa','#00acc1','#00acc1',
    '#f4511e','#f4511e','#c0ca33','#c0ca33',
  ];

  defaultConfig() { return {}; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = this.level;
    this._genSounds();
  }

  _genSounds() {
    const ae = this.ae;
    if (!ae) return;
    const sounds = [ae.kick, ae.snare, ae.hihat, ae.hihat, ae.clap, ae.rim, ae.cymbal, ae.tom,
                    ae.snare, ae.kick, ae.hihat, ae.clap, ae.tom, ae.rim, ae.cymbal, ae.snare];
    sounds.forEach((fn, i) => {
      try {
        this.pads[i].buf = fn.call(ae, i % 2 === 0);
      } catch(e) {
        this.pads[i].buf = ae.kick?.();
      }
    });
  }

  hitPad(i) {
    if (!this.ae?.ctx || !this.pads[i]?.buf) return;
    const { ctx } = this.ae;
    const p = this.pads[i];
    const src = ctx.createBufferSource();
    src.buffer = p.buf; src.playbackRate.value = p.pitch;
    const g = ctx.createGain(); g.gain.value = p.vol;
    src.connect(g); g.connect(this._out || this.ae.master);
    src.start();
    this._hitState[i] = 1.0;
    if (!this._raf) this._animFlash();
    if (this._padEls[i]) {
      this._padEls[i].classList.add('flash');
      setTimeout(() => this._padEls[i]?.classList.remove('flash'), 100);
    }
  }

  _animFlash() {
    const anyLit = this._hitState.some(v => v > 0.01);
    if (!anyLit) { this._raf = null; return; }
    this._hitState = this._hitState.map(v => v * 0.75);
    if (this._cvTop) this._draw(this._cvTop);
    this._raf = requestAnimationFrame(() => this._animFlash());
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const cv = document.createElement('canvas');
    cv.width = 260; cv.height = 200;
    cv.style.cursor = 'pointer';
    this._cvTop = cv;
    this._draw(cv);

    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width  / r.width);
      const y = (e.clientY - r.top)  * (cv.height / r.height);
      const W = cv.width, H = cv.height;
      const padArea = { x: W*0.04, y: H*0.22, w: W*0.68, h: H*0.72 };
      if (x >= padArea.x && x < padArea.x + padArea.w &&
          y >= padArea.y && y < padArea.y + padArea.h) {
        const col = Math.floor((x - padArea.x) / (padArea.w / 4));
        const row = Math.floor((y - padArea.y) / (padArea.h / 4));
        const idx = row * 4 + col;
        if (idx >= 0 && idx < 16) {
          if (this.ae) this.ae.resume();
          this.hitPad(idx);
        }
      }
    });

    return cv;
  }

  _draw(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sc = W / 260;

    ctx.clearRect(0, 0, W, H);
    drawBody(ctx, 0, 0, W, H, 0, '#161218');

    // Top display strip
    drawDisplay(ctx, 6*sc, 5*sc, W*0.65 - 6*sc, 20*sc,
      `BANK ${['A','B','C','D'][this.bank]}  LEVEL:${Math.round(this.level*100)}%`,
      { bg: '#060608', textColor: '#ff8800', glow: true, font: `${7*sc}px 'Courier New',monospace` }
    );

    // Bank buttons (top right)
    ['A','B','C','D'].forEach((lbl, i) => {
      drawButton(ctx, W*0.72 + i*14*sc, 5*sc, 12*sc, 10*sc, {
        label: lbl, lit: this.bank === i, litColor: '#ff8800', r: 1*sc, fontSize: 6*sc
      });
    });

    // 4×4 pad grid
    const gx = W*0.04, gy = H*0.22, gw = W*0.68, gh = H*0.72;
    const pw = gw / 4, ph = gh / 4;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const idx = row * 4 + col;
        const px = gx + col * pw, py = gy + row * ph;
        const pad = this.pads[idx];
        const hit = this._hitState[idx];
        drawPad(ctx, px + 2*sc, py + 2*sc, pw - 4*sc, ph - 4*sc, {
          color: pad.color, lit: hit > 0.1,
          litColor: lighten(pad.color, 0.4 * hit),
          r: 3*sc
        });
        // pad name
        ctx.fillStyle = `rgba(255,255,255,${0.45 + hit * 0.5})`;
        ctx.font = `${5.5*sc}px 'Courier New', monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pad.name, px + pw/2, py + ph/2);
      }
    }

    // Right panel: SWING + LEVEL knobs
    const kx = W * 0.80;
    drawKnob(ctx, kx, H * 0.38, 11*sc,
      this.swing * Math.PI * 1.5 - Math.PI * 1.1,
      { color: '#1c1820', accent: '#ff880040', dotColor: '#ff8800', label: 'SWING' }
    );
    drawKnob(ctx, kx, H * 0.68, 11*sc,
      this.level * Math.PI * 1.5 - Math.PI * 1.1,
      { color: '#1c1820', accent: '#ff880040', dotColor: '#ff8800', label: 'LEVEL' }
    );

    // Corner screws
    [[3,3],[W-3,3],[3,H-3],[W-3,H-3]].forEach(([x,y]) => drawScrew(ctx, x, y, 2.5*sc));

    // Brand
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.font = `bold ${6*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('AKAI  MPC ONE', W * 0.84, H * 0.9);
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:380px;';

    const grid = document.createElement('div');
    grid.className = 'pad-grid';
    grid.style.cssText = 'grid-template-columns:repeat(4,1fr);gap:5px;padding:8px;background:var(--bg-dark);border-radius:6px;';
    this._padEls = [];

    this.pads.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'pad has-s';
      el.style.cssText = `min-height:40px;border-left:3px solid ${p.color};background:${p.color}22;`;
      el.innerHTML = `<div class="pad-lbl" style="font-size:8px;">${p.name}</div>`;
      el.addEventListener('click', () => { if (this.ae) this.ae.resume(); this.hitPad(i); });
      this._padEls.push(el);
      grid.appendChild(el);
    });
    wrap.appendChild(grid);

    // Controls
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:12px;align-items:center;';
    ctrlRow.appendChild(this.makeKnob('SWING', 0, 1, this.swing, v => {
      this.swing = v;
      if (this._cvTop) this._draw(this._cvTop);
    }));
    ctrlRow.appendChild(this.makeKnob('LEVEL', 0, 1, this.level, v => {
      this.level = v;
      if (this._out) this._out.gain.value = v;
      if (this._cvTop) this._draw(this._cvTop);
    }));

    // Bank selector
    const bankRow = document.createElement('div');
    bankRow.style.cssText = 'display:flex;gap:4px;align-items:center;font-size:9px;color:var(--txt-dim);';
    bankRow.innerHTML = '<span>BANK:</span>';
    ['A','B','C','D'].forEach((lbl, i) => {
      const btn = this.makeBtn(lbl, 'cue-btn', () => {
        this.bank = i;
        bankRow.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        if (this._cvTop) this._draw(this._cvTop);
      });
      if (this.bank === i) btn.classList.add('on');
      bankRow.appendChild(btn);
    });

    ctrlRow.appendChild(bankRow);
    wrap.appendChild(ctrlRow);
    return wrap;
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div'); sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Sampler Pad</h3><p style="font-size:9px;color:var(--txt-dim)">16-pad sampler with 4 banks. Load samples via the pad context menu.</p>';
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    const pattern = [0, 4, 2, 4, 0, 1, 4, 2];
    pattern.forEach((idx, i) => {
      setTimeout(() => this.hitPad(idx), i * 200);
    });
  }

  destroy() {
    cancelAnimationFrame(this._raf); this._raf = null;
  }

  getState() { return { bank: this.bank, swing: this.swing, level: this.level }; }
  setState(s) { Object.assign(this, s); }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    drawBody(ctx, 0, 0, W, H, 0, '#161218');
    // display
    const dbg = ctx.createLinearGradient(0, 4, 0, H*0.2);
    dbg.addColorStop(0, '#060608'); dbg.addColorStop(1, '#040406');
    ctx.fillStyle = dbg; rr(ctx, 4, 4, W*0.7-4, H*0.18, 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 3;
    ctx.fillStyle = '#ff8800'; ctx.font = `bold 7px 'Courier New',monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('BANK A', 8, H*0.11);
    ctx.restore();
    // 4×4 grid
    const gx = W*0.04, gy = H*0.22, gw = W*0.68, gh = H*0.72;
    const pw = gw/4, ph = gh/4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const idx = r*4+c;
        const col = SamplerPad.PAD_COLORS[idx];
        ctx.fillStyle = col + '55';
        rr(ctx, gx+c*pw+2, gy+r*ph+2, pw-4, ph-4, 2); ctx.fill();
        ctx.strokeStyle = col + '80'; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
  }
}
