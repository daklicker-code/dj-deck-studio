import { PluginBase } from './PluginBase.js';

export class Mixer extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'DJ Mixer';
    this.pluginKey = 'mixer';

    this.chCount = 4;
    this.ch = Array.from({ length: this.chCount }, () => ({
      gain: 0.8, eqHi: 0, eqMid: 0, eqLo: 0, vol: 0.8, mute: false, cue: false
    }));
    this.xfader = 0.5;
    this.masterVol = 0.8;

    this._nodes = []; // audio nodes per channel
    this._cvTop = null;
  }

  defaultConfig() { return { channels: 4 }; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    const { ctx, master } = ae;

    this._nodes = this.ch.map((s) => {
      const inp = ctx.createGain();
      const hi  = ctx.createBiquadFilter();
      const mid = ctx.createBiquadFilter();
      const lo  = ctx.createBiquadFilter();
      const vol = ctx.createGain();

      hi.type  = 'highshelf'; hi.frequency.value  = 8000;
      mid.type = 'peaking';   mid.frequency.value = 1000; mid.Q.value = 1;
      lo.type  = 'lowshelf';  lo.frequency.value  = 200;

      inp.connect(hi); hi.connect(mid); mid.connect(lo); lo.connect(vol);
      vol.connect(master);
      vol.gain.value = s.vol;

      return { inp, hi, mid, lo, vol };
    });
  }

  getChannelInput(i) { return this._nodes[i]?.inp || null; }

  /* ============ TOP VIEW (canvas) ============ */

  createTopView() {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 165;
    cv.style.cursor = 'pointer';
    this._cvTop = cv;
    this._drawTop(cv);

    // Redraw on click (for xfader drag simulation)
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width / r.width);
      const y = (e.clientY - r.top)  * (cv.height / r.height);
      const cfY = cv.height - 15;
      if (Math.abs(y - cfY) < 14) {
        this.xfader = Math.min(1, Math.max(0, (x - cv.width * .08) / (cv.width * .62)));
        this._drawTop(cv);
      }
    });

    return cv;
  }

  _drawTop(cv) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;

    ctx.fillStyle = '#131320'; ctx.fillRect(0, 0, W, H);

    const cw = (W * .68) / this.chCount;
    const bx = W * .06;

    for (let i = 0; i < this.chCount; i++) {
      const s = this.ch[i];
      const x = bx + i * cw;
      const mx = x + cw / 2;

      ctx.fillStyle = '#1a1a28';
      ctx.fillRect(x + 1, 8, cw - 2, H - 25);

      ctx.fillStyle = s.mute ? '#ff224480' : '#3a3a5a';
      ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`CH${i + 1}`, mx, 20);

      // EQ knobs (mini)
      ['Hi', 'Md', 'Lo'].forEach((_, j) => {
        const ky = 32 + j * 18;
        this._miniKnob(ctx, mx, ky, 6, [s.eqHi, s.eqMid, s.eqLo][j], -12, 12);
      });

      // Volume fader
      const fTop = 92, fH = 44;
      ctx.fillStyle = '#0a0a16';
      ctx.fillRect(mx - 2, fTop, 4, fH);
      const tY = fTop + (1 - s.vol) * fH;
      ctx.fillStyle = s.mute ? '#5a1a1a' : '#5a5a7a';
      ctx.fillRect(mx - 7, tY - 3, 14, 6);

      // VU bar
      if (!s.mute) {
        const vuH = fH * s.vol * 0.9;
        const vuG = ctx.createLinearGradient(0, fTop + fH, 0, fTop);
        vuG.addColorStop(0, '#00cc44'); vuG.addColorStop(.7, '#cccc00'); vuG.addColorStop(1, '#cc0000');
        ctx.fillStyle = vuG;
        ctx.fillRect(mx + 9, fTop + fH - vuH, 4, vuH);
      }
    }

    // Crossfader
    const cfX = W * .08, cfW = W * .62, cfY = H - 14;
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(cfX, cfY - 2, cfW, 4);
    ctx.strokeStyle = '#252538'; ctx.lineWidth = 1;
    ctx.strokeRect(cfX, cfY - 2, cfW, 4);
    const tx = cfX + this.xfader * cfW;
    ctx.fillStyle = '#5a5a7a';
    ctx.fillRect(tx - 9, cfY - 7, 18, 14);
    ctx.strokeStyle = '#8a8a9a'; ctx.lineWidth = 1;
    ctx.strokeRect(tx - 9, cfY - 7, 18, 14);
    ctx.fillStyle = '#5a5a7a'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('XFADER', W * .08 + cfW / 2, cfY - 11);

    // Master section
    const msX = W * .78;
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(msX, 8, W - msX - 8, H - 25);
    ctx.fillStyle = '#5a5a7a'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('MSTR', msX + (W - msX - 8) / 2, 20);

    const mfX = msX + (W - msX - 8) / 2, mfTop = 28, mfH = 60;
    ctx.fillStyle = '#0a0a16'; ctx.fillRect(mfX - 2, mfTop, 4, mfH);
    const mtY = mfTop + (1 - this.masterVol) * mfH;
    ctx.fillStyle = '#3a9bd5'; ctx.fillRect(mfX - 7, mtY - 3, 14, 6);
    ctx.strokeStyle = '#5ab8ff'; ctx.lineWidth = 1; ctx.strokeRect(mfX - 7, mtY - 3, 14, 6);
  }

  _miniKnob(ctx, x, y, r, val, min, max) {
    const n  = (val - min) / (max - min);
    const sa = -Math.PI * .75;
    const ea = sa + n * Math.PI * 1.5;

    ctx.strokeStyle = '#252535'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, sa, sa + Math.PI * 1.5); ctx.stroke();

    if (val !== 0) {
      ctx.strokeStyle = '#3a9bd5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, sa + Math.PI * .75, ea); ctx.stroke();
    }

    ctx.fillStyle = '#252535'; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#3a9bd5'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ea) * (r - 2), y + Math.sin(ea) * (r - 2));
    ctx.stroke();
  }

  /* ============ ZOOM VIEW ============ */

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;min-width:600px;';

    // Channel strips
    const strips = document.createElement('div');
    strips.style.cssText = 'display:flex;gap:8px;padding:14px;background:var(--bg-dark);border-radius:6px;';

    for (let i = 0; i < this.chCount; i++) strips.appendChild(this._buildStrip(i));
    wrap.appendChild(strips);

    // Crossfader row
    const cfRow = document.createElement('div');
    cfRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:12px;background:var(--bg-dark);border-radius:6px;';
    cfRow.innerHTML = '<span style="font-size:9px;color:var(--txt-dim);letter-spacing:.1em;">CROSSFADER</span>';

    const cfSlider = document.createElement('input');
    cfSlider.type = 'range'; cfSlider.min = 0; cfSlider.max = 1; cfSlider.step = .01; cfSlider.value = this.xfader;
    cfSlider.addEventListener('input', () => { this.xfader = parseFloat(cfSlider.value); if (this._cvTop) this._drawTop(this._cvTop); });

    const cfLbls = document.createElement('div');
    cfLbls.style.cssText = 'display:flex;justify-content:space-between;font-size:9px;color:var(--txt-off);';
    cfLbls.innerHTML = '<span>◀ CH1</span><span>CH2 ▶</span>';

    cfRow.append(cfSlider, cfLbls);
    wrap.appendChild(cfRow);

    return wrap;
  }

  _buildStrip(i) {
    const s = this.ch[i];
    const strip = document.createElement('div');
    strip.className = 'ch-strip';
    strip.style.cssText += 'flex:1;';
    strip.innerHTML = `<h4>CH ${i + 1}</h4>`;

    // EQ knobs
    const eqRow = document.createElement('div');
    eqRow.className = 'eq-row';

    const eqDefs = [
      { lbl: 'HI',  key: 'eqHi',  node: 'hi' },
      { lbl: 'MID', key: 'eqMid', node: 'mid' },
      { lbl: 'LO',  key: 'eqLo',  node: 'lo' },
    ];

    eqDefs.forEach(d => {
      const k = this.makeKnob(d.lbl, -12, 12, s[d.key], v => {
        s[d.key] = v;
        const node = this._nodes[i]?.[d.node];
        if (node) node.gain.value = v;
      }, 'sm');
      eqRow.appendChild(k);
    });
    strip.appendChild(eqRow);

    // Volume fader
    const fwrap = document.createElement('div');
    fwrap.className = 'fader-wrap';
    fwrap.innerHTML = '<div class="fader-lbl">VOL</div>';

    const fader = document.createElement('input');
    fader.type = 'range'; fader.className = 'vfader';
    fader.min = 0; fader.max = 1; fader.step = .01; fader.value = s.vol;
    fader.addEventListener('input', () => {
      s.vol = parseFloat(fader.value);
      const n = this._nodes[i]?.vol;
      if (n && !s.mute) n.gain.value = s.vol;
      if (this._cvTop) this._drawTop(this._cvTop);
    });
    fwrap.appendChild(fader);
    strip.appendChild(fwrap);

    // CUE + MUTE
    const cue  = this.makeBtn('CUE',  'cue-btn',  () => { s.cue = !s.cue; cue.classList.toggle('on', s.cue); });
    const mute = this.makeBtn('MUTE', 'stop-btn', () => {
      s.mute = !s.mute;
      mute.classList.toggle('on', s.mute);
      const n = this._nodes[i]?.vol;
      if (n) n.gain.value = s.mute ? 0 : s.vol;
      if (this._cvTop) this._drawTop(this._cvTop);
    });
    mute.style.cssText += 'font-size:9px;padding:3px 6px;';
    cue.style.cssText  += 'font-size:9px;padding:3px 6px;';
    strip.append(cue, mute);

    return strip;
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div');
    sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Mixer</h3>';

    const row = document.createElement('div');
    row.className = 'cfg-row';
    row.innerHTML = '<label>Channels</label>';
    const sel = document.createElement('select');
    [2, 4].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = `${n} Channel`; if (n === this.chCount) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { /* future: re-init */ });
    row.appendChild(sel);
    sec.appendChild(row);
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae?.ctx) return;
    this.ae.resume();
    const ctx = this.ae.ctx;
    [60, 90, 120, 150].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this._nodes[0]?.vol || this.ae.master);
      const t = ctx.currentTime + i * .4;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.2, t + .05);
      g.gain.exponentialRampToValueAtTime(.001, t + .35);
      osc.start(t); osc.stop(t + .4);
    });
  }

  destroy() {
    this._nodes.forEach(n => { try { n?.vol?.disconnect(); } catch(e) {} });
    this._nodes = [];
  }

  getState() { return { ch: this.ch.map(s => ({ ...s })), xfader: this.xfader, masterVol: this.masterVol }; }
  setState(s) {
    if (s.xfader != null) this.xfader = s.xfader;
    if (s.masterVol != null) this.masterVol = s.masterVol;
    if (s.ch) s.ch.forEach((c, i) => { if (this.ch[i]) Object.assign(this.ch[i], c); });
  }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    ctx.fillStyle = '#131320'; ctx.fillRect(0, 0, W, H);
    const cw = (W * .7) / 4;
    for (let i = 0; i < 4; i++) {
      const x = W * .06 + i * cw;
      ctx.fillStyle = '#252535'; ctx.fillRect(x + 1, 8, cw - 2, H - 28);
      ctx.fillStyle = '#3a3a4a';
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x + cw / 2, 22 + j * 14, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#1a1a2a'; ctx.fillRect(x + cw / 2 - 2, 68, 4, 20);
      ctx.fillStyle = '#5a5a7a'; ctx.fillRect(x + cw / 2 - 6, 80, 12, 5);
    }
    ctx.fillStyle = '#1a1a2a'; ctx.fillRect(W * .06, H - 15, W * .68, 4);
    ctx.fillStyle = '#5a5a7a'; ctx.fillRect(W * .06 + W * .34 - 8, H - 19, 16, 10);
  }
}
