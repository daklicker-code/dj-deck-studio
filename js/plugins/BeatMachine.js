/**
 * BeatMachine — Roland TR-909 style 16-step drum machine
 */
import { PluginBase } from './PluginBase.js';
import { drawBody, drawButton, drawLED, drawDisplay, drawKnob, drawScrew, rr, lighten, darken } from '../DrawUtils.js';

const TRACKS = [
  { name: 'BASS DR', color: '#e53935', shortName: 'BD' },
  { name: 'SNARE',   color: '#fb8c00', shortName: 'SD' },
  { name: 'LOW TOM', color: '#fdd835', shortName: 'LT' },
  { name: 'MID TOM', color: '#43a047', shortName: 'MT' },
  { name: 'HI TOM',  color: '#1e88e5', shortName: 'HT' },
  { name: 'RIM',     color: '#8e24aa', shortName: 'RM' },
  { name: 'CLAP',    color: '#e91e63', shortName: 'CP' },
  { name: 'COWBELL', color: '#00acc1', shortName: 'CB' },
  { name: 'CYMBAL',  color: '#ff7043', shortName: 'CY' },
  { name: 'HI HAT',  color: '#c0ca33', shortName: 'HH' },
  { name: 'OPEN HH', color: '#26c6da', shortName: 'OH' },
];

export class BeatMachine extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'Beat Machine';
    this.pluginKey = 'beatmachine';

    this.bpm       = 128;
    this.steps     = 16;
    this.swing     = 0;
    this.running   = false;
    this.curStep   = 0;
    this.pattern   = Array.from({ length: TRACKS.length }, () => new Array(16).fill(false));
    this.volumes   = new Array(TRACKS.length).fill(0.85);
    this.bufs      = new Array(TRACKS.length).fill(null);
    this._out      = null;
    this._timer    = null;
    this._cvTop    = null;
    this._stepEls  = null; // flat array step indicators
    // Preset a basic kick/snare pattern
    this.pattern[0][0]  = true; this.pattern[0][4]  = true;
    this.pattern[0][8]  = true; this.pattern[0][12] = true;
    this.pattern[1][4]  = true; this.pattern[1][12] = true;
    this.pattern[8][2]  = true; this.pattern[8][6]  = true;
    this.pattern[8][10] = true; this.pattern[8][14] = true;
  }

  defaultConfig() { return {}; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = 0.9;
    this._genSounds();
  }

  _genSounds() {
    const ae = this.ae;
    if (!ae) return;
    const fns = [
      () => ae.kick(),
      () => ae.snare(),
      () => ae.tom(80),
      () => ae.tom(100),
      () => ae.tom(130),
      () => ae.rim(),
      () => ae.clap(),
      () => ae.tom(600),   // cowbell approximation
      () => ae.cymbal(),
      () => ae.hihat(false),
      () => ae.hihat(true),
    ];
    fns.forEach((fn, i) => { try { this.bufs[i] = fn(); } catch(e) {} });
  }

  _playStep(step) {
    if (!this.ae?.ctx) return;
    const { ctx } = this.ae;
    for (let t = 0; t < TRACKS.length; t++) {
      if (!this.pattern[t][step] || !this.bufs[t]) continue;
      const src = ctx.createBufferSource();
      src.buffer = this.bufs[t];
      const g = ctx.createGain(); g.gain.value = this.volumes[t];
      src.connect(g); g.connect(this._out || ae.master);
      src.start();
    }
  }

  _tick() {
    this._playStep(this.curStep);
    this.curStep = (this.curStep + 1) % this.steps;
    if (this._cvTop) this._draw(this._cvTop);
  }

  startSeq() {
    if (this.running) return;
    this.running = true; this.curStep = 0;
    const ms = (60 / this.bpm / 4) * 1000;
    this._tick();
    this._timer = setInterval(() => this._tick(), ms);
    if (this._cvTop) this._draw(this._cvTop);
  }

  stopSeq() {
    this.running = false;
    clearInterval(this._timer); this._timer = null;
    this.curStep = 0;
    if (this._cvTop) this._draw(this._cvTop);
  }

  syncBPM(bpm) {
    this.bpm = bpm;
    if (this.running) { this.stopSeq(); this.startSeq(); }
    if (this._cvTop) this._draw(this._cvTop);
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 220;
    cv.style.cursor = 'pointer';
    this._cvTop = cv;
    this._draw(cv);

    cv.addEventListener('click', (e) => {
      const r  = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (cv.width  / r.width);
      const my = (e.clientY - r.top)  * (cv.height / r.height);
      const W = cv.width, H = cv.height;

      // Grid area
      const gx = W * 0.11, gy = H * 0.14, gw = W * 0.74, gh = H * 0.80;
      const sw = gw / 16;
      const th = gh / TRACKS.length;
      if (mx >= gx && mx < gx + gw && my >= gy && my < gy + gh) {
        const col = Math.floor((mx - gx) / sw);
        const row = Math.floor((my - gy) / th);
        if (col >= 0 && col < 16 && row >= 0 && row < TRACKS.length) {
          this.pattern[row][col] = !this.pattern[row][col];
          this._draw(cv);
        }
        return;
      }

      // PLAY button area (right)
      if (mx > W * 0.88 && my > H * 0.1 && my < H * 0.4) {
        if (this.ae) this.ae.resume();
        if (this.running) this.stopSeq(); else this.startSeq();
      }
    });

    return cv;
  }

  _draw(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sc = W / 480;

    ctx.clearRect(0, 0, W, H);
    drawBody(ctx, 0, 0, W, H, 0, '#100e12');

    // Top bar: BPM display + transport
    drawDisplay(ctx, 6*sc, 4*sc, 80*sc, 18*sc,
      `${this.bpm.toFixed(0)} BPM`,
      { bg: '#060408', textColor: '#ff4444', glow: true, font: `bold ${9*sc}px 'Courier New',monospace` }
    );
    drawDisplay(ctx, 94*sc, 4*sc, 50*sc, 18*sc,
      this.running ? `STEP ${this.curStep + 1}` : 'STOPPED',
      { bg: '#060408', textColor: this.running ? '#44ff66' : '#884444', glow: this.running, font: `${7.5*sc}px 'Courier New',monospace` }
    );

    // Pattern grid
    const gx = W * 0.105, gy = H * 0.155, gw = W * 0.745, gh = H * 0.800;
    const sw = gw / 16, th = gh / TRACKS.length;

    // Group separators (every 4 steps)
    for (let g = 0; g <= 4; g++) {
      ctx.strokeStyle = `rgba(255,255,255,${g % 4 === 0 ? 0.18 : 0.06})`;
      ctx.lineWidth = g % 4 === 0 ? 1.2*sc : 0.5*sc;
      ctx.beginPath(); ctx.moveTo(gx + g*4*sw, gy); ctx.lineTo(gx + g*4*sw, gy + gh); ctx.stroke();
    }

    TRACKS.forEach((trk, t) => {
      const ty = gy + t * th;
      // Track label
      ctx.fillStyle = trk.color;
      ctx.font = `bold ${6.5*sc}px 'Courier New', monospace`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(trk.shortName, gx - 4*sc, ty + th/2);

      for (let s = 0; s < 16; s++) {
        const sx = gx + s * sw;
        const active = this.pattern[t][s];
        const isCurrent = this.running && s === this.curStep;
        const pad = { x: sx + 2*sc, y: ty + 2*sc, w: sw - 4*sc, h: th - 4*sc };

        // Step button
        ctx.save();
        if (isCurrent && active) {
          ctx.shadowColor = trk.color; ctx.shadowBlur = 10;
        } else if (isCurrent) {
          ctx.shadowColor = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 5;
        }
        if (active) {
          const bg = ctx.createLinearGradient(pad.x, pad.y, pad.x, pad.y + pad.h);
          bg.addColorStop(0, lighten(trk.color, 0.2));
          bg.addColorStop(1, darken(trk.color, 0.2));
          ctx.fillStyle = bg;
        } else {
          ctx.fillStyle = isCurrent ? '#252538' : (s % 4 < 2 ? '#1a1a24' : '#161620');
        }
        rr(ctx, pad.x, pad.y, pad.w, pad.h, 2*sc);
        ctx.fill();
        // highlight
        ctx.strokeStyle = active ? trk.color + '80' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.6*sc; ctx.stroke();
        ctx.restore();
      }
    });

    // Row separators
    for (let t = 0; t <= TRACKS.length; t++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(gx, gy + t*th); ctx.lineTo(gx + gw, gy + t*th); ctx.stroke();
    }

    // Right side: PLAY + SWING knob
    const rX = W * 0.885;
    drawButton(ctx, rX, H * 0.08, 55*sc, 24*sc, {
      label: this.running ? '■ STOP' : '▶ PLAY',
      lit: this.running, litColor: '#44ff66', r: 3*sc, fontSize: 8.5*sc
    });
    drawKnob(ctx, rX + 27*sc, H * 0.60, 13*sc,
      (this.swing / 100) * Math.PI * 1.5 - Math.PI * 1.1,
      { color: '#1c1820', accent: '#ff444440', dotColor: '#ff4444', label: 'SWING' }
    );

    // Current step accent line
    if (this.running) {
      const stepX = gx + this.curStep * sw + sw/2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = sw - 4*sc;
      ctx.beginPath(); ctx.moveTo(stepX, gy); ctx.lineTo(stepX, gy + gh); ctx.stroke();
      ctx.restore();
    }

    // Corner screws
    [[3,3],[W-3,3],[3,H-3],[W-3,H-3]].forEach(([x,y]) => drawScrew(ctx, x, y, 2.5*sc));

    // Brand
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.font = `bold ${6*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ROLAND  TR-909', W * 0.5, H * 0.967);
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:600px;';

    // Canvas view (larger)
    const cv = document.createElement('canvas');
    cv.width = 600; cv.height = 275;
    cv.style.cssText = 'width:100%;border-radius:6px;cursor:pointer;';
    wrap.appendChild(cv);

    const drawAndBind = () => {
      this._cvTop = cv;
      this._draw(cv);
      cv.onclick = this._cvTop.onclick; // rebind (handled in createTopView)
    };
    // Re-use the top view click handler on this canvas too
    this._cvTop = cv;
    this._draw(cv);

    cv.addEventListener('click', (e) => {
      const r  = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (cv.width  / r.width);
      const my = (e.clientY - r.top)  * (cv.height / r.height);
      const W = cv.width, H = cv.height;
      const gx = W*0.105, gy = H*0.155, gw = W*0.745, gh = H*0.800;
      const sw = gw/16, th = gh/TRACKS.length;
      if (mx >= gx && mx < gx+gw && my >= gy && my < gy+gh) {
        const col = Math.floor((mx-gx)/sw);
        const row = Math.floor((my-gy)/th);
        if (col >= 0 && col < 16 && row >= 0 && row < TRACKS.length) {
          this.pattern[row][col] = !this.pattern[row][col];
          this._draw(cv);
        }
        return;
      }
      if (mx > W*0.88 && my > H*0.1 && my < H*0.4) {
        if (this.ae) this.ae.resume();
        if (this.running) this.stopSeq(); else this.startSeq();
      }
    });

    // Controls
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:12px;align-items:center;';

    const playBtn = this.makeBtn(this.running ? '■ STOP' : '▶ PLAY', 'play-btn', () => {
      if (this.ae) this.ae.resume();
      if (this.running) this.stopSeq(); else this.startSeq();
      playBtn.textContent = this.running ? '■ STOP' : '▶ PLAY';
      playBtn.classList.toggle('on', this.running);
    });
    playBtn.classList.toggle('on', this.running);

    const clearBtn = this.makeBtn('CLEAR', 'stop-btn', () => {
      this.pattern.forEach(row => row.fill(false));
      if (cv) this._draw(cv);
    });

    ctrlRow.append(playBtn, clearBtn);
    ctrlRow.appendChild(this.makeKnob('SWING', 0, 100, this.swing, v => {
      this.swing = v;
      if (cv) this._draw(cv);
    }));

    wrap.appendChild(ctrlRow);
    return wrap;
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div'); sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Beat Machine</h3><p style="font-size:9px;color:var(--txt-dim)">11-track TR-909 style step sequencer. Click steps to toggle.</p>';
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    if (!this.running) this.startSeq();
    setTimeout(() => { if (this.running) this.stopSeq(); }, 4000);
  }

  destroy() {
    this.stopSeq();
  }

  getState() { return { bpm: this.bpm, pattern: this.pattern.map(r => [...r]), swing: this.swing }; }
  setState(s) {
    if (s.bpm) this.bpm = s.bpm;
    if (s.swing != null) this.swing = s.swing;
    if (s.pattern) s.pattern.forEach((row, i) => { if (this.pattern[i]) this.pattern[i] = [...row]; });
  }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    drawBody(ctx, 0, 0, W, H, 0, '#100e12');
    // display strip
    const dbg = ctx.createLinearGradient(0, 3, 0, H*0.2);
    dbg.addColorStop(0, '#060408'); dbg.addColorStop(1, '#040306');
    ctx.fillStyle = dbg; rr(ctx, 4, 3, W*0.5, H*0.19, 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 3;
    ctx.fillStyle = '#ff4444'; ctx.font = `bold 7px 'Courier New',monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('128 BPM', 8, H*0.12);
    ctx.restore();
    // step grid
    const gx = W*0.105, gy = H*0.24, gw = W*0.745, gh = H*0.68;
    const sw = gw/16, th = gh/8;
    for (let t = 0; t < 8; t++) {
      const trk = TRACKS[t] || TRACKS[0];
      for (let s = 0; s < 16; s++) {
        const active = t < 2 ? (s % 4 === 0 || (t === 1 && (s === 4 || s === 12))) : false;
        ctx.fillStyle = active ? trk.color + '90' : (s % 4 < 2 ? '#1a1a24' : '#161620');
        rr(ctx, gx+s*sw+1, gy+t*th+1, sw-2, th-2, 1); ctx.fill();
      }
    }
  }
}
