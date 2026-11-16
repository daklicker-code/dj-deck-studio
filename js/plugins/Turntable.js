import { PluginBase } from './PluginBase.js';

export class Turntable extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'Technics 1210';
    this.pluginKey = 'turntable';

    this.isPlaying = false;
    this.isReversed = false;
    this.curSpeed = 0;        // 0-1 actual speed factor
    this.angle = 0;
    this.rpm = 33.3;
    this.pitch = 0;           // -8 to +8 %
    this.sampleName = 'No Sample';

    this.audioBuffer = null;
    this.srcNode = null;
    this.gainNode = null;

    this._raf = null;
    this._lastT = 0;
    this._activeCanvas = null;
    this._topCanvasEl = null;
  }

  defaultConfig() {
    return { labelColor: '#c02020', brakeTime: 1.5 };
  }

  initAudio(ae) {
    super.initAudio(ae);
    if (ae) {
      this.gainNode = ae.createChannel();
      if (this.gainNode) this.gainNode.gain.value = 0.85;
    }
  }

  /* ============ DRAWING ============ */

  _draw(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e1e2e';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    const cx = W * 0.44, cy = H * 0.5, R = Math.min(W, H) * 0.38;

    // Platter shadow
    ctx.fillStyle = '#080810';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 3, R + 5, 0, Math.PI * 2); ctx.fill();

    // Platter
    const pg = ctx.createRadialGradient(cx - R * .2, cy - R * .2, R * .05, cx, cy, R);
    pg.addColorStop(0, '#6a6a7a'); pg.addColorStop(.4, '#4a4a5a'); pg.addColorStop(1, '#252535');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // Spinning record group
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(this.angle); ctx.translate(-cx, -cy);

    const rr = R * 0.88;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    rg.addColorStop(0, '#252535'); rg.addColorStop(1, '#0e0e1a');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();

    // Vinyl grooves
    for (let i = 3; i < 28; i++) {
      const gr = rr * (.2 + i * .029);
      if (gr > rr * .97) break;
      ctx.strokeStyle = `rgba(55,55,70,${0.7 - i * .02})`;
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2); ctx.stroke();
    }

    // Label disc
    const lR = rr * .3;
    const lg = ctx.createRadialGradient(cx - lR * .3, cy - lR * .3, 2, cx, cy, lR);
    lg.addColorStop(0, this.config.labelColor);
    lg.addColorStop(1, this._darken(this.config.labelColor));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(cx, cy, lR, 0, Math.PI * 2); ctx.fill();

    const fs = Math.max(6, lR * 0.19);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = `bold ${fs}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dname = this.sampleName.length > 10 ? this.sampleName.slice(0, 10) + '…' : this.sampleName;
    ctx.fillText(dname, cx, cy - lR * .12);
    ctx.font = `${Math.max(5, lR * 0.15)}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText(`${this.rpm} RPM`, cx, cy + lR * .32);

    // Spindle
    ctx.fillStyle = '#ccc';
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // Tonearm
    this._drawArm(ctx, cx, cy, R, W, H);

    // Controls overlay
    this._drawOverlay(ctx, W, H);
  }

  _drawArm(ctx, cx, cy, R, W, H) {
    const pivX = cx + R * 1.08, pivY = cy + R * .28;
    const armAng = -Math.PI * 0.72;
    const armLen = R * 0.9;
    const ex = pivX + Math.cos(armAng) * armLen;
    const ey = pivY + Math.sin(armAng) * armLen;

    // Shadow
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pivX + 1, pivY + 2); ctx.lineTo(ex + 1, ey + 2); ctx.stroke();

    // Arm
    const ag = ctx.createLinearGradient(pivX, pivY, ex, ey);
    ag.addColorStop(0, '#5a5a6a'); ag.addColorStop(1, '#3a3a4a');
    ctx.strokeStyle = ag; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pivX, pivY); ctx.lineTo(ex, ey); ctx.stroke();

    // Headshell
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(armAng + .3);
    ctx.fillStyle = '#4a4a5a'; ctx.fillRect(-2, -5, 7, 10);
    ctx.fillStyle = '#6a6a7a'; ctx.fillRect(-1, -4, 5, 4);
    ctx.restore();

    // Pivot
    const pivG = ctx.createRadialGradient(pivX - 2, pivY - 2, 1, pivX, pivY, 8);
    pivG.addColorStop(0, '#7a7a8a'); pivG.addColorStop(1, '#252535');
    ctx.fillStyle = pivG;
    ctx.beginPath(); ctx.arc(pivX, pivY, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a4a5a'; ctx.lineWidth = 1; ctx.stroke();

    // Counterweight
    const cwX = pivX + Math.cos(armAng + Math.PI) * 14;
    const cwY = pivY + Math.sin(armAng + Math.PI) * 14;
    ctx.fillStyle = '#5a5a6a';
    ctx.beginPath(); ctx.arc(cwX, cwY, 5, 0, Math.PI * 2); ctx.fill();

    // Pitch slider on right edge
    const sX = W - 14, sTop = H * .15, sH = H * .62;
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(sX - 2, sTop, 4, sH);
    ctx.strokeStyle = '#252538'; ctx.lineWidth = 1;
    ctx.strokeRect(sX - 2, sTop, 4, sH);

    const mid = sTop + sH / 2;
    ctx.strokeStyle = '#3a9bd5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sX - 5, mid); ctx.lineTo(sX + 2, mid); ctx.stroke();

    const norm = (this.pitch + 8) / 16;
    const tY = sTop + (1 - norm) * sH;
    ctx.fillStyle = '#5a5a6a';
    ctx.fillRect(sX - 5, tY - 4, 10, 8);
    ctx.strokeStyle = '#8a8a9a'; ctx.lineWidth = 1;
    ctx.strokeRect(sX - 5, tY - 4, 10, 8);

    ctx.fillStyle = '#5a5a7a'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${this.pitch >= 0 ? '+' : ''}${this.pitch.toFixed(1)}%`, sX, sTop - 3);
  }

  _drawOverlay(ctx, W, H) {
    // Power LED
    ctx.fillStyle = this.isPlaying ? '#00ff44' : '#003300';
    if (this.isPlaying) { ctx.shadowColor = '#00ff44'; ctx.shadowBlur = 7; }
    ctx.beginPath(); ctx.arc(W - 11, 11, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 33/45 buttons
    const bx = 8, by = H - 18;
    [[33.3, '33'], [45, '45']].forEach(([v, t], i) => {
      ctx.fillStyle = this.rpm === v ? '#3a9bd5' : '#1a1a2a';
      ctx.fillRect(bx + i * 24, by, 20, 12);
      ctx.fillStyle = this.rpm === v ? '#fff' : '#5a5a6a';
      ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(t, bx + i * 24 + 10, by + 9);
    });
  }

  _darken(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (n >> 16) - 50);
    const g = Math.max(0, ((n >> 8) & 0xff) - 50);
    const b = Math.max(0, (n & 0xff) - 50);
    return `rgb(${r},${g},${b})`;
  }

  /* ============ ANIMATION ============ */

  _startAnim(canvas) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._activeCanvas = canvas;
    this._lastT = 0;
    const loop = (ts) => {
      if (!this._lastT) this._lastT = ts;
      const dt = Math.min((ts - this._lastT) / 1000, 0.05);
      this._lastT = ts;

      const target = this.isPlaying ? 1 : 0;
      const brake = 1.5 / (this.config.brakeTime || 1.5);
      this.curSpeed += (target - this.curSpeed) * Math.min(1, dt * (this.isPlaying ? 4 : brake));

      const rps = (this.rpm * (1 + this.pitch / 100)) / 60;
      const dir = this.isReversed ? -1 : 1;
      this.angle += dir * rps * this.curSpeed * Math.PI * 2 * dt;

      this._draw(canvas);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopAnim() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._lastT = 0;
  }

  /* ============ PLAYBACK ============ */

  play() {
    this.isPlaying = true;
    if (this.audioBuffer && this.ae) this._startSrc();
  }
  pause() {
    this.isPlaying = false;
    if (this.srcNode) { try { this.srcNode.stop(); } catch(e) {} this.srcNode = null; }
  }
  stop() { this.pause(); this.angle = 0; }
  toggle() { this.isPlaying ? this.pause() : this.play(); }

  _startSrc() {
    if (!this.ae?.ctx || !this.audioBuffer) return;
    if (this.srcNode) { try { this.srcNode.stop(); } catch(e) {} }
    const src = this.ae.ctx.createBufferSource();
    src.buffer = this.audioBuffer;
    src.loop = true;
    src.playbackRate.value = (1 + this.pitch / 100) * (this.isReversed ? -1 : 1);
    src.connect(this.gainNode || this.ae.master);
    src.start();
    this.srcNode = src;
  }

  async loadFile(file) {
    if (!file || !this.ae) return;
    try {
      this.audioBuffer = await this.ae.loadFile(file);
      this.sampleName = file.name.replace(/\.[^.]+$/, '');
      if (this.isPlaying) this._startSrc();
    } catch (e) { console.error('[Turntable] load:', e); }
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';

    const cv = document.createElement('canvas');
    cv.width = 230; cv.height = 185;
    cv.style.cursor = 'pointer';
    this._topCanvasEl = cv;
    wrap.appendChild(cv);
    this._startAnim(cv);

    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width / r.width);
      const y = (e.clientY - r.top)  * (cv.height / r.height);
      const cx = cv.width * 0.44, cy = cv.height * 0.5, R = Math.min(cv.width, cv.height) * 0.38;
      if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) {
        this.toggle();
        if (this.ae) this.ae.resume();
      }
      // 33/45 buttons
      const bx = 8, by = cv.height - 18;
      if (y > by && y < by + 12) {
        if (x > bx && x < bx + 20) this.rpm = 33.3;
        else if (x > bx + 24 && x < bx + 44) this.rpm = 45;
      }
    });

    return wrap;
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 370;
    cv.style.cssText = 'display:block;border:1px solid var(--bdr);border-radius:6px;cursor:pointer;margin:0 auto;';
    wrap.appendChild(cv);

    this._stopAnim();
    this._startAnim(cv);

    cv.addEventListener('click', () => { this.toggle(); if (this.ae) this.ae.resume(); updateBtns(); });

    // Controls
    const ctrls = document.createElement('div');
    ctrls.className = 'tt-ctrls';

    const playBtn = this.makeBtn('▶ PLAY', 'play-btn', () => { this.toggle(); if (this.ae) this.ae.resume(); updateBtns(); });
    const stopBtn = this.makeBtn('■ STOP', 'stop-btn', () => { this.stop(); updateBtns(); });
    const revBtn  = this.makeBtn('⟵ REV', 'cue-btn', () => { this.isReversed = !this.isReversed; revBtn.classList.toggle('on', this.isReversed); });
    const loadBtn = this.makeBtn('📂 LOAD', 'cue-btn', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*';
      inp.onchange = e => this.loadFile(e.target.files[0]);
      inp.click();
    });

    const updateBtns = () => {
      playBtn.textContent = this.isPlaying ? '⏸ PAUSE' : '▶ PLAY';
      playBtn.classList.toggle('on', this.isPlaying);
    };

    ctrls.append(playBtn, stopBtn, revBtn, loadBtn);
    wrap.appendChild(ctrls);

    // Pitch
    const pitchRow = document.createElement('div');
    pitchRow.className = 'pitch-row';
    pitchRow.innerHTML = '<span>PITCH</span>';

    const pSlider = document.createElement('input');
    pSlider.type = 'range'; pSlider.min = -8; pSlider.max = 8; pSlider.step = 0.1; pSlider.value = this.pitch;
    const pVal = document.createElement('span');
    pVal.className = 'pitch-val';

    const updPitch = () => {
      this.pitch = parseFloat(pSlider.value);
      pVal.textContent = `${this.pitch >= 0 ? '+' : ''}${this.pitch.toFixed(1)}%`;
      if (this.srcNode) this.srcNode.playbackRate.value = 1 + this.pitch / 100;
    };
    updPitch();
    pSlider.addEventListener('input', updPitch);
    pitchRow.append(pSlider, pVal);
    wrap.appendChild(pitchRow);

    // RPM
    const rpmRow = document.createElement('div');
    rpmRow.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--bg-dark);border-top:1px solid var(--bdr);';
    rpmRow.innerHTML = '<span style="font-size:9px;color:var(--txt-dim);">RPM:</span>';
    [33.3, 45].forEach(r => {
      const b = this.makeBtn(r, 'cue-btn', () => {
        this.rpm = r;
        rpmRow.querySelectorAll('.cue-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
      if (this.rpm === r) b.classList.add('on');
      rpmRow.appendChild(b);
    });
    wrap.appendChild(rpmRow);

    return wrap;
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div');
    sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Turntable</h3>';

    const colorRow = document.createElement('div');
    colorRow.className = 'cfg-row';
    colorRow.innerHTML = '<label>Label Color</label>';
    const colorIn = document.createElement('input');
    colorIn.type = 'color'; colorIn.value = this.config.labelColor;
    colorIn.addEventListener('change', () => { this.config.labelColor = colorIn.value; });
    colorRow.appendChild(colorIn);

    const brakeRow = document.createElement('div');
    brakeRow.className = 'cfg-row';
    brakeRow.innerHTML = '<label>Brake Time (s)</label>';
    const brakeIn = document.createElement('input');
    brakeIn.type = 'range'; brakeIn.min = 0.2; brakeIn.max = 5; brakeIn.step = 0.1; brakeIn.value = this.config.brakeTime;
    const brakeV = document.createElement('span');
    brakeV.style.cssText = 'font-size:10px;color:var(--accent);width:28px;';
    brakeV.textContent = this.config.brakeTime;
    brakeIn.addEventListener('input', () => { this.config.brakeTime = parseFloat(brakeIn.value); brakeV.textContent = brakeIn.value; });
    brakeRow.append(brakeIn, brakeV);

    sec.append(colorRow, brakeRow);
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    const ctx = this.ae.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 1.5);
    g.gain.setValueAtTime(.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + 2.5);
    osc.connect(g); g.connect(this.gainNode || this.ae.master);
    osc.start(); osc.stop(ctx.currentTime + 2.5);
    this.play();
  }

  onZoomClose() {
    this._stopAnim();
    if (this._topCanvasEl) this._startAnim(this._topCanvasEl);
  }

  destroy() {
    this._stopAnim();
    if (this.srcNode) { try { this.srcNode.stop(); } catch(e) {} }
  }

  getState() { return { rpm: this.rpm, pitch: this.pitch, sampleName: this.sampleName, labelColor: this.config.labelColor }; }
  setState(s) {
    if (s.rpm)        this.rpm = s.rpm;
    if (s.pitch != null) this.pitch = s.pitch;
    if (s.sampleName) this.sampleName = s.sampleName;
    if (s.labelColor) this.config.labelColor = s.labelColor;
  }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    ctx.fillStyle = '#0f0f1a'; ctx.fillRect(0, 0, W, H);
    const cx = W * .44, cy = H * .5, R = Math.min(W, H) * .38;
    ctx.fillStyle = '#3a3a4a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(cx, cy, R * .88, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c02020'; ctx.beginPath(); ctx.arc(cx, cy, R * .3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a5a6a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + R * 1.1, cy + R * .3); ctx.lineTo(cx + R * .1, cy - R * .4); ctx.stroke();
  }
}
