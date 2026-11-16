import { PluginBase } from './PluginBase.js';
import { drawBody, drawKnob, drawButton, drawLED, drawFaderV, drawFaderH, drawVU, drawScrew, rr, lighten, darken } from '../DrawUtils.js';

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
    const sc = W / 320;

    ctx.clearRect(0, 0, W, H);
    drawBody(ctx, 0, 0, W, H, 0, '#141420');

    // Brand strip top
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, 7*sc);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = `bold ${6.5*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('PIONEER  DJ-700', 7*sc, 3.5*sc);

    const cw = (W * 0.70) / this.chCount;
    const bx = W * 0.03;
    const CH_COLORS = ['#e44','#e84','#4ae','#a4e'];

    for (let i = 0; i < this.chCount; i++) {
      const s = this.ch[i];
      const x = bx + i * cw;
      const mx = x + cw / 2;

      // Channel strip background — recessed panel
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      const sg = ctx.createLinearGradient(x, 7*sc, x, H - 18*sc);
      sg.addColorStop(0, '#1c1c2c'); sg.addColorStop(0.5, '#181824'); sg.addColorStop(1, '#141420');
      ctx.fillStyle = sg;
      rr(ctx, x + 1, 7*sc, cw - 2, H - 25*sc, 2*sc); ctx.fill();
      ctx.restore();

      // Top color accent strip for channel
      ctx.fillStyle = s.mute ? 'rgba(255,50,50,0.5)' : CH_COLORS[i] || '#3a9bd5';
      ctx.fillRect(x + 2, 7*sc, cw - 4, 3*sc);

      // Channel label
      ctx.fillStyle = s.mute ? '#ff4444' : 'rgba(255,255,255,0.7)';
      ctx.font = `bold ${7*sc}px 'Courier New', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`CH${i + 1}`, mx, 17*sc);

      // EQ knobs — Hi, Mid, Lo
      const eqLabels = ['HI','MD','LO'];
      const eqVals   = [s.eqHi, s.eqMid, s.eqLo];
      [28, 44, 60].forEach((ky, j) => {
        const ang = ((eqVals[j] + 12) / 24) * Math.PI * 1.5 - Math.PI * 1.1;
        drawKnob(ctx, mx, ky*sc, 5.5*sc, ang, {
          color: '#1e1e2c', accent: 'rgba(80,80,120,0.4)', dotColor: '#5ab8ff',
          label: eqLabels[j], shadow: false
        });
      });

      // Volume fader
      const fTop = 72*sc, fH = 60*sc;
      drawFaderV(ctx, mx - 5*sc, fTop, 10*sc, fH, s.vol);

      // VU meter (right of fader)
      const vuLevel = s.mute ? 0 : s.vol * 0.9 + Math.sin(Date.now() / 300 + i) * 0.07;
      drawVU(ctx, mx + 7*sc, fTop, 4*sc, fH, Math.max(0, Math.min(1, vuLevel)), true, 10);

      // MUTE indicator dot
      drawLED(ctx, mx, H - 10*sc, 3.5*sc, { lit: s.mute, color: '#ff3333' });
    }

    // Crossfader section
    const cfX = W * .03 + 2, cfW = W * .70 - 4, cfY = H - 10*sc;
    drawFaderH(ctx, cfX, cfY - 6*sc, cfW, 12*sc, this.xfader);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = `${6*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CROSSFADER', cfX + cfW/2, cfY - 10*sc);

    // Master section (right panel)
    const msX = W * .76, msW = W - msX - 4;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    const msg = ctx.createLinearGradient(msX, 8*sc, msX, H-8*sc);
    msg.addColorStop(0, '#202032'); msg.addColorStop(1, '#171726');
    ctx.fillStyle = msg;
    rr(ctx, msX, 8*sc, msW, H-16*sc, 3*sc); ctx.fill();
    ctx.restore();

    // Master accent bar
    ctx.fillStyle = '#3a9bd5';
    ctx.fillRect(msX + 2, 8*sc, msW - 4, 2.5*sc);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `bold ${6.5*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('MSTR', msX + msW/2, 17*sc);

    const mfX = msX + msW/2, mfTop = 25*sc, mfH = H - 40*sc;
    drawFaderV(ctx, mfX - 6*sc, mfTop, 12*sc, mfH, this.masterVol);

    // Master VU meters (stereo pair)
    drawVU(ctx, msX + 2, mfTop, 5*sc, mfH, this.masterVol * 0.85, true, 10);

    // Corner screws
    [[3,3],[W-3,3],[3,H-3],[W-3,H-3]].forEach(([x,y]) => drawScrew(ctx, x, y, 2.5*sc));
  }

  _miniKnob(ctx, x, y, r, val, min, max) {
    // legacy fallback, still used in _buildStrip indirectly
    const n  = (val - min) / (max - min);
    const sa = -Math.PI * .75;
    const ea = sa + n * Math.PI * 1.5;
    ctx.strokeStyle = '#252535'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, sa, sa + Math.PI * 1.5); ctx.stroke();
    if (val !== 0) { ctx.strokeStyle = '#3a9bd5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, sa + Math.PI * .75, ea); ctx.stroke(); }
    ctx.fillStyle = '#252535'; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a9bd5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ea) * (r - 2), y + Math.sin(ea) * (r - 2)); ctx.stroke();
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
    drawBody(ctx, 0, 0, W, H, 0, '#141420');
    const cw = (W * .70) / 4;
    const CH_COLORS = ['#e44','#e84','#4ae','#a4e'];
    for (let i = 0; i < 4; i++) {
      const x = W * .03 + i * cw;
      const sg = ctx.createLinearGradient(x, 8, x, H - 20);
      sg.addColorStop(0, '#1c1c2c'); sg.addColorStop(1, '#141420');
      ctx.fillStyle = sg; rr(ctx, x + 1, 8, cw - 2, H - 28, 2); ctx.fill();
      ctx.fillStyle = CH_COLORS[i];
      ctx.fillRect(x + 2, 8, cw - 4, 3);
      ctx.fillStyle = '#252545';
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x + cw / 2, 22 + j * 14, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#0a0a16'; rr(ctx, x + cw/2 - 2, 68, 4, 25, 2); ctx.fill();
      const sg2 = ctx.createLinearGradient(x, 0, x+cw, 0);
      sg2.addColorStop(0, '#5a5a6a'); sg2.addColorStop(0.5, '#4a4a5a'); sg2.addColorStop(1, '#252530');
      ctx.fillStyle = sg2; rr(ctx, x + cw/2 - 7, 76, 14, 7, 1); ctx.fill();
    }
    ctx.fillStyle = '#0a0a16'; rr(ctx, W * .03 + 2, H - 14, W * .68 - 4, 7, 3); ctx.fill();
    const sg3 = ctx.createLinearGradient(0, 0, W*.68, 0);
    sg3.addColorStop(0, '#5a5a6a'); sg3.addColorStop(0.5, '#4a4a5a'); sg3.addColorStop(1, '#252530');
    ctx.fillStyle = sg3; rr(ctx, W * .03 + W * .34 - 10, H - 16, 20, 11, 2); ctx.fill();
  }
}
