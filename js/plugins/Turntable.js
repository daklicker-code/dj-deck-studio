import { PluginBase } from './PluginBase.js';
import { drawBody, drawButton, drawLED, drawScrew, drawFaderV, aluminumGrad, chromeGrad, lighten, darken, rr } from '../DrawUtils.js';

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
    const scale = W / 230; // normalize to design size

    ctx.clearRect(0, 0, W, H);

    // Body
    drawBody(ctx, 0, 0, W, H, 0, '#161620');

    // Subtle surface texture lines (brushed aluminum strip, top)
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.015 - i * 0.004})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 2 + i*1.5); ctx.lineTo(W, 2 + i*1.5); ctx.stroke();
    }

    const cx = W * 0.44, cy = H * 0.5, R = Math.min(W, H) * 0.38;

    // Platter well (recessed area)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath(); ctx.arc(cx, cy, R + 5*scale, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Chrome platter ring
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    ctx.fillStyle = chromeGrad(ctx, cx, cy, R * 0.85, R + 4*scale);
    ctx.beginPath(); ctx.arc(cx, cy, R + 4*scale, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Rubber mat (dark charcoal circle on platter)
    const matG = ctx.createRadialGradient(cx - R*.12, cy - R*.15, R*.1, cx, cy, R*.92);
    matG.addColorStop(0, '#252530'); matG.addColorStop(.6, '#1a1a22'); matG.addColorStop(1, '#111118');
    ctx.fillStyle = matG;
    ctx.beginPath(); ctx.arc(cx, cy, R * .92, 0, Math.PI*2); ctx.fill();

    // Spinning record group
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(this.angle); ctx.translate(-cx, -cy);

    const vR = R * 0.88;
    // Vinyl — slightly reflective black
    const vg = ctx.createRadialGradient(cx - vR*.08, cy - vR*.1, vR*.05, cx, cy, vR);
    vg.addColorStop(0,   '#1e1e28');
    vg.addColorStop(0.3, '#0e0e18');
    vg.addColorStop(0.7, '#131320');
    vg.addColorStop(1,   '#0a0a14');
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.arc(cx, cy, vR, 0, Math.PI*2); ctx.fill();

    // Vinyl grooves — many fine rings
    for (let i = 0; i < 42; i++) {
      const gr = vR * (0.17 + i * 0.0195);
      if (gr > vR * 0.97) break;
      const opacity = 0.55 - i * 0.008;
      ctx.strokeStyle = `rgba(80,80,100,${Math.max(0.08, opacity)})`;
      ctx.lineWidth = i % 4 === 0 ? 0.9 : 0.4;
      ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.stroke();
    }

    // Label disc
    const lR = vR * .28;
    const lg = ctx.createRadialGradient(cx - lR*.3, cy - lR*.35, lR*.05, cx, cy, lR);
    lg.addColorStop(0, lighten(this.config.labelColor, 0.2));
    lg.addColorStop(0.4, this.config.labelColor);
    lg.addColorStop(1, darken(this.config.labelColor, 0.3));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(cx, cy, lR, 0, Math.PI*2); ctx.fill();
    // label ring highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, lR, 0, Math.PI*2); ctx.stroke();
    // label text
    const fs = Math.max(6, lR * 0.19);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${fs}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dn = this.sampleName.length > 9 ? this.sampleName.slice(0, 9) + '…' : this.sampleName;
    ctx.fillText(dn, cx, cy - lR*.1);
    ctx.font = `${Math.max(4.5, lR*0.145)}px 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`${this.rpm} RPM`, cx, cy + lR*.32);

    // Spindle (chrome peg)
    const spG = ctx.createRadialGradient(cx-2*scale, cy-2*scale, 0, cx, cy, 4*scale);
    spG.addColorStop(0, '#e8e8f0'); spG.addColorStop(0.4, '#a0a0b0'); spG.addColorStop(1, '#404050');
    ctx.fillStyle = spG;
    ctx.beginPath(); ctx.arc(cx, cy, 4*scale, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1a28';
    ctx.beginPath(); ctx.arc(cx, cy, 1.5*scale, 0, Math.PI*2); ctx.fill();

    ctx.restore(); // end spinning group

    // Tonearm
    this._drawArm(ctx, cx, cy, R, W, H, scale);
    // Controls
    this._drawOverlay(ctx, W, H, scale);
  }

  _drawArm(ctx, cx, cy, R, W, H, scale = 1) {
    const pivX = cx + R * 1.1, pivY = cy + R * .32;
    const armAng = -Math.PI * 0.7;
    const armLen = R * 0.86;
    const ex = pivX + Math.cos(armAng) * armLen;
    const ey = pivY + Math.sin(armAng) * armLen;

    // Arm shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.0)'; // shadow only via fillStyle trick
    ctx.lineWidth = 4*scale; ctx.lineCap = 'round';
    ctx.strokeStyle = '#080810';
    ctx.beginPath(); ctx.moveTo(pivX+1, pivY+2); ctx.lineTo(ex+1, ey+2); ctx.stroke();
    ctx.restore();

    // Arm tube — metallic gradient along the arm
    const ag = ctx.createLinearGradient(pivX, pivY, ex, ey);
    ag.addColorStop(0, '#7a7a8c'); ag.addColorStop(0.4, '#5a5a6e'); ag.addColorStop(1, '#3c3c50');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
    ctx.strokeStyle = ag; ctx.lineWidth = 3*scale; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pivX, pivY); ctx.lineTo(ex, ey); ctx.stroke();
    // Specular highlight on arm
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1*scale;
    ctx.beginPath(); ctx.moveTo(pivX-0.5, pivY-0.5); ctx.lineTo(ex-0.5, ey-0.5); ctx.stroke();
    ctx.restore();

    // Headshell
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(armAng + 0.3);
    const hg = ctx.createLinearGradient(-2, -6, 6, 6);
    hg.addColorStop(0, '#6a6a7c'); hg.addColorStop(1, '#38384a');
    ctx.fillStyle = hg; rr(ctx, -2.5, -5.5*scale, 8*scale, 11*scale, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5; ctx.stroke();
    // Stylus tip
    ctx.fillStyle = '#a8a8c0';
    ctx.beginPath(); ctx.arc(2.5*scale, 4*scale, 1.5*scale, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Pivot housing
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
    const pivRad = 7*scale;
    const pivG = ctx.createRadialGradient(pivX-pivRad*.3, pivY-pivRad*.3, 0, pivX, pivY, pivRad);
    pivG.addColorStop(0, '#8a8a9e'); pivG.addColorStop(0.5, '#5a5a6e'); pivG.addColorStop(1, '#252535');
    ctx.fillStyle = pivG;
    ctx.beginPath(); ctx.arc(pivX, pivY, pivRad, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(pivX, pivY, pivRad, 0, Math.PI*2); ctx.stroke();
    // center dot
    ctx.fillStyle = '#1a1a26';
    ctx.beginPath(); ctx.arc(pivX, pivY, 2.5*scale, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Counterweight
    const cwLen = 15*scale;
    const cwX = pivX + Math.cos(armAng + Math.PI) * cwLen;
    const cwY = pivY + Math.sin(armAng + Math.PI) * cwLen;
    const cwR = 5*scale;
    ctx.save();
    const cwG = ctx.createRadialGradient(cwX-cwR*.3, cwY-cwR*.3, 0, cwX, cwY, cwR);
    cwG.addColorStop(0, '#7a7a8c'); cwG.addColorStop(1, '#282835');
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.fillStyle = cwG;
    ctx.beginPath(); ctx.arc(cwX, cwY, cwR, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Pitch slider (right side)
    const sX = W - 11*scale, sTop = H * .18, sH = H * .58;
    drawFaderV(ctx, sX - 5*scale, sTop, 11*scale, sH, (this.pitch + 8) / 16);
    // pitch label
    ctx.fillStyle = 'rgba(170,170,190,0.65)';
    ctx.font = `${6.5*scale}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${this.pitch >= 0 ? '+' : ''}${this.pitch.toFixed(1)}%`, sX, sTop - 5*scale);
    ctx.fillText('PITCH', sX, sTop + sH + 9*scale);
  }

  _drawOverlay(ctx, W, H, scale = 1) {
    // Corner screws
    [[5,5],[W-5,5],[5,H-5],[W-5,H-5]].forEach(([x,y]) => drawScrew(ctx, x, y, 3*scale));

    // Power LED (top-right)
    drawLED(ctx, W - 10*scale, 9*scale, 4*scale, { lit: this.isPlaying, color: '#00ff44' });

    // 33/45 RPM buttons (bottom-left)
    const bx = 8*scale, by = H - 20*scale;
    [[33.3, '33'], [45, '45']].forEach(([v, t], i) => {
      drawButton(ctx, bx + i*26*scale, by, 22*scale, 14*scale, {
        label: t, lit: this.rpm === v, litColor: '#3a9bd5', r: 2, fontSize: 7*scale
      });
    });

    // "TECHNICS" brand text (bottom center)
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = `bold ${7*scale}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TECHNICS  SL-1210', W * 0.5, H - 8*scale);

    // "REV" indicator if reversed
    if (this.isReversed) {
      ctx.fillStyle = 'rgba(255,100,0,0.8)';
      ctx.font = `bold ${7*scale}px 'Courier New', monospace`;
      ctx.fillText('⟵ REV', W * 0.5, 9*scale);
    }
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
    drawBody(ctx, 0, 0, W, H, 0, '#161620');
    const cx = W * .44, cy = H * .5, R = Math.min(W, H) * .38;
    // platter well
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI*2); ctx.fill();
    // chrome ring
    ctx.fillStyle = chromeGrad(ctx, cx, cy, R * 0.85, R + 4);
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI*2); ctx.fill();
    // vinyl
    const vg = ctx.createRadialGradient(cx - R*.08, cy - R*.1, R*.05, cx, cy, R*.92);
    vg.addColorStop(0, '#1e1e28'); vg.addColorStop(0.5, '#0e0e18'); vg.addColorStop(1, '#0a0a14');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(cx, cy, R*.92, 0, Math.PI*2); ctx.fill();
    // grooves
    for (let i = 3; i < 20; i++) {
      const gr = R * .92 * (0.2 + i * 0.038);
      if (gr > R * .88) break;
      ctx.strokeStyle = `rgba(80,80,100,${0.4 - i*0.015})`; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.stroke();
    }
    // label disc
    const lR = R * .28;
    const lg = ctx.createRadialGradient(cx - lR*.3, cy - lR*.3, 0, cx, cy, lR);
    lg.addColorStop(0, '#d03030'); lg.addColorStop(1, '#7a1010');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, lR, 0, Math.PI*2); ctx.fill();
    // spindle
    ctx.fillStyle = '#c0c0cc'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
    // tonearm
    const ag = ctx.createLinearGradient(cx + R*1.1, cy + R*.3, cx + R*.1, cy - R*.4);
    ag.addColorStop(0, '#6a6a7c'); ag.addColorStop(1, '#3c3c50');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.strokeStyle = ag; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + R*1.1, cy + R*.3); ctx.lineTo(cx + R*.1, cy - R*.4); ctx.stroke();
    ctx.restore();
  }
}
