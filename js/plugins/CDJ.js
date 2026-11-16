/**
 * CDJ — Pioneer CDJ-2000NXS2 style media player
 */
import { PluginBase } from './PluginBase.js';
import { drawBody, drawButton, drawLED, drawDisplay, drawKnob, drawScrew, drawFaderV, rr, lighten, darken, alpha } from '../DrawUtils.js';

export class CDJ extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'CDJ Player';
    this.pluginKey = 'cdj';

    this.isPlaying = false;
    this.isCue     = false;
    this.angle     = 0;
    this.pitch     = 0;       // -8..+8%
    this.track     = 'No Track';
    this.bpm       = 128;
    this.position  = 0;       // 0..1
    this.loopActive = false;
    this.loopStart = 0.25;
    this.loopEnd   = 0.5;
    this.jogMode   = 'vinyl'; // vinyl | cdj
    this.jogScratch = 0;

    this.audioBuffer = null;
    this.srcNode     = null;
    this.gainNode    = null;
    this._out        = null;
    this._raf        = null;
    this._lastT      = 0;
    this._cvTop      = null;
  }

  defaultConfig() { return { accentColor: '#e05020' }; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae?.ctx) return;
    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = 0.9;
  }

  _startAnim() {
    if (this._raf) return;
    const step = (t) => {
      if (!this.isPlaying) { this._raf = null; return; }
      const dt = this._lastT ? (t - this._lastT) / 1000 : 0;
      this._lastT = t;
      const spd = this.bpm / 128 * (1 + this.pitch / 100);
      this.angle  = (this.angle + dt * spd * Math.PI * 2 * (33.3/60)) % (Math.PI * 2);
      this.position = (this.position + dt * spd * 0.004) % 1;
      if (this._cvTop) this._draw(this._cvTop);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const cv = document.createElement('canvas');
    cv.width = 300; cv.height = 180;
    cv.style.cursor = 'pointer';
    this._cvTop = cv;
    this._draw(cv);

    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width  / r.width);
      const y = (e.clientY - r.top)  * (cv.height / r.height);
      const W = cv.width, H = cv.height;
      const cx = W * 0.38, cy = H * 0.52, R = Math.min(W, H) * 0.33;
      const dist = Math.hypot(x - cx, y - cy);

      if (dist < R + 10 && dist > R * 0.3) {
        // Jog wheel click — toggle play
        if (this.ae) this.ae.resume();
        this.isPlaying = !this.isPlaying;
        this._lastT = 0;
        if (this.isPlaying) this._startAnim();
        else this._draw(cv);
        return;
      }
      // CUE button area
      if (x > W * 0.72 && x < W * 0.95 && y > H * 0.5 && y < H * 0.75) {
        this.isCue = !this.isCue;
        this._draw(cv);
      }
    });

    return cv;
  }

  _draw(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sc = W / 300;

    ctx.clearRect(0, 0, W, H);
    drawBody(ctx, 0, 0, W, H, 0, '#121218');

    // Top info display
    drawDisplay(ctx, 6*sc, 6*sc, W - 12*sc, 28*sc, null, { bg: '#040810', glow: false });
    // Track name
    ctx.fillStyle = '#00e5ff'; ctx.font = `bold ${8*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 4;
    const tn = this.track.length > 22 ? this.track.slice(0, 22) + '…' : this.track;
    ctx.fillText(tn, 10*sc, 14*sc);
    // BPM
    ctx.textAlign = 'right';
    ctx.fillText(`${this.bpm.toFixed(1)} BPM`, W - 10*sc, 14*sc);
    // Position bar
    ctx.shadowBlur = 0;
    const pbarX = 10*sc, pbarY = 27*sc, pbarW = W - 20*sc, pbarH = 4*sc;
    ctx.fillStyle = '#0a1020'; rr(ctx, pbarX, pbarY, pbarW, pbarH, 1); ctx.fill();
    ctx.fillStyle = this.isPlaying ? '#00e5ff' : '#0060a0';
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 3;
    rr(ctx, pbarX, pbarY, pbarW * this.position, pbarH, 1); ctx.fill();
    ctx.shadowBlur = 0;

    // Jog wheel
    const cx = W * 0.37, cy = H * 0.54, R = Math.min(W, H) * 0.33;

    // Platter well
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#080810';
    ctx.beginPath(); ctx.arc(cx, cy, R + 5*sc, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Chrome ring
    const chromeRing = ctx.createRadialGradient(cx - R*.2, cy - R*.2, R*.8, cx, cy, R + 4*sc);
    chromeRing.addColorStop(0, '#d0d0dc');
    chromeRing.addColorStop(0.4, '#8a8a98');
    chromeRing.addColorStop(0.7, '#c0c0cc');
    chromeRing.addColorStop(1, '#6a6a78');
    ctx.fillStyle = chromeRing;
    ctx.beginPath(); ctx.arc(cx, cy, R + 4*sc, 0, Math.PI*2); ctx.fill();

    // Jog platter — spinning group
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(this.angle); ctx.translate(-cx, -cy);

    const jg = ctx.createRadialGradient(cx - R*.1, cy - R*.1, R*.05, cx, cy, R);
    jg.addColorStop(0, '#1c1c28'); jg.addColorStop(0.5, '#141420'); jg.addColorStop(1, '#0e0e18');
    ctx.fillStyle = jg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();

    // Jog platter ridges
    const ridgeCount = 32;
    for (let i = 0; i < ridgeCount; i++) {
      const ang = (i / ridgeCount) * Math.PI * 2;
      const r1 = R * 0.68, r2 = R * 0.95;
      ctx.strokeStyle = `rgba(60,60,90,${i % 2 === 0 ? 0.6 : 0.3})`;
      ctx.lineWidth = i % 2 === 0 ? 1.2*sc : 0.5*sc;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }

    // Center label disc
    const lR = R * 0.3;
    const accent = this.config.accentColor || '#e05020';
    const lg = ctx.createRadialGradient(cx - lR*.3, cy - lR*.3, 0, cx, cy, lR);
    lg.addColorStop(0, lighten(accent, 0.15));
    lg.addColorStop(0.5, accent);
    lg.addColorStop(1, darken(accent, 0.3));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(cx, cy, lR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold ${7*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CDJ', cx, cy - lR*.15);
    ctx.font = `${5.5*sc}px 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('2000NXS', cx, cy + lR*.3);

    // Spindle
    const spG = ctx.createRadialGradient(cx-1.5*sc, cy-1.5*sc, 0, cx, cy, 3.5*sc);
    spG.addColorStop(0, '#e8e8f0'); spG.addColorStop(1, '#404050');
    ctx.fillStyle = spG;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5*sc, 0, Math.PI*2); ctx.fill();

    ctx.restore(); // end spinning

    // Playing indicator dot on jog
    if (this.isPlaying) {
      const dotAng = this.angle + Math.PI * 0.5;
      const dotR = R * 0.82;
      ctx.save();
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(dotAng)*dotR, cy + Math.sin(dotAng)*dotR, 3*sc, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Right side controls
    const rX = W * 0.76;

    // PLAY button
    drawButton(ctx, rX, H * 0.1, 48*sc, 20*sc, {
      label: this.isPlaying ? '■ STOP' : '▶ PLAY',
      lit: this.isPlaying, litColor: '#00cc55', r: 3*sc, fontSize: 7.5*sc
    });

    // CUE button
    drawButton(ctx, rX, H * 0.38, 48*sc, 20*sc, {
      label: 'CUE', lit: this.isCue, litColor: '#e08020', r: 3*sc, fontSize: 7.5*sc
    });

    // LOOP button
    drawButton(ctx, rX, H * 0.63, 48*sc, 20*sc, {
      label: this.loopActive ? '⟳ LOOP' : 'LOOP',
      lit: this.loopActive, litColor: '#5050ff', r: 3*sc, fontSize: 7.5*sc
    });

    // Pitch slider
    drawFaderV(ctx, W - 14*sc, H * 0.12, 10*sc, H * 0.75, (this.pitch + 8) / 16);
    ctx.fillStyle = 'rgba(170,170,190,0.55)';
    ctx.font = `${6*sc}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${this.pitch >= 0 ? '+' : ''}${this.pitch.toFixed(1)}%`, W - 9*sc, H * 0.9 + 7*sc);

    // Status LEDs
    drawLED(ctx, rX + 6*sc,  H * 0.87, 3*sc, { lit: this.isPlaying, color: '#00ff55' });
    drawLED(ctx, rX + 18*sc, H * 0.87, 3*sc, { lit: this.isCue,     color: '#ff8800' });
    drawLED(ctx, rX + 30*sc, H * 0.87, 3*sc, { lit: this.loopActive,color: '#5555ff' });

    // Corner screws
    [[3,3],[W-3,3],[3,H-3],[W-3,H-3]].forEach(([x,y]) => drawScrew(ctx, x, y, 2.5*sc));
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:420px;';

    // Large waveform display
    const waveCanvas = document.createElement('canvas');
    waveCanvas.width = 420; waveCanvas.height = 70;
    waveCanvas.style.cssText = 'width:100%;border-radius:4px;';
    this._drawWaveform(waveCanvas);
    wrap.appendChild(waveCanvas);

    // Controls row
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:10px;align-items:center;';

    const playBtn = this.makeBtn(this.isPlaying ? '■ STOP' : '▶ PLAY', 'play-btn', () => {
      if (this.ae) this.ae.resume();
      this.isPlaying = !this.isPlaying;
      playBtn.textContent = this.isPlaying ? '■ STOP' : '▶ PLAY';
      playBtn.classList.toggle('on', this.isPlaying);
      this._lastT = 0;
      if (this.isPlaying) this._startAnim();
      else if (this._cvTop) this._draw(this._cvTop);
    });
    playBtn.classList.toggle('on', this.isPlaying);

    const cueBtn = this.makeBtn('CUE', 'cue-btn', () => {
      this.isCue = !this.isCue;
      cueBtn.classList.toggle('on', this.isCue);
      if (this._cvTop) this._draw(this._cvTop);
    });

    const loopBtn = this.makeBtn('LOOP', 'cue-btn', () => {
      this.loopActive = !this.loopActive;
      loopBtn.classList.toggle('on', this.loopActive);
      if (this._cvTop) this._draw(this._cvTop);
    });

    ctrlRow.append(playBtn, cueBtn, loopBtn);

    // Pitch knob
    const pitchKnob = this.makeKnob('PITCH', -8, 8, this.pitch, v => {
      this.pitch = v;
      if (this.srcNode) this.srcNode.playbackRate.value = 1 + v / 100;
    });

    ctrlRow.appendChild(pitchKnob);
    wrap.appendChild(ctrlRow);

    // Jog mode selector
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:9px;color:var(--txt-dim);';
    modeRow.innerHTML = '<span>JOG MODE:</span>';
    ['vinyl','cdj'].forEach(mode => {
      const btn = this.makeBtn(mode.toUpperCase(), 'cue-btn', () => {
        this.jogMode = mode;
        modeRow.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
      });
      if (this.jogMode === mode) btn.classList.add('on');
      modeRow.appendChild(btn);
    });
    wrap.appendChild(modeRow);

    return wrap;
  }

  _drawWaveform(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040810'); bg.addColorStop(1, '#000508');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,100,160,0.15)'; ctx.lineWidth = 0.5;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(W*i/8, 0); ctx.lineTo(W*i/8, H); ctx.stroke();
    }

    // Fake waveform
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 4;
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const freq = 0.04 + Math.sin(x * 0.01) * 0.02;
      const amp  = (0.3 + Math.abs(Math.sin(x * 0.015)) * 0.4) * H * 0.42;
      const y = H/2 - Math.sin(x * freq * Math.PI) * amp;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Playhead
    const px = this.position * W;
    ctx.save();
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.restore();
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div'); sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>CDJ Settings</h3>';
    const r1 = document.createElement('div'); r1.className = 'cfg-row';
    r1.innerHTML = '<label>Accent Color</label>';
    const col = document.createElement('input'); col.type='color'; col.value=this.config.accentColor||'#e05020';
    col.addEventListener('input', () => { this.config.accentColor = col.value; if (this._cvTop) this._draw(this._cvTop); });
    r1.appendChild(col); sec.appendChild(r1); div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    this.isPlaying = true;
    this._lastT = 0;
    this._startAnim();
    setTimeout(() => { this.isPlaying = false; if (this._cvTop) this._draw(this._cvTop); }, 3000);
  }

  destroy() {
    cancelAnimationFrame(this._raf); this._raf = null;
    try { this.srcNode?.stop(); } catch(e) {}
  }

  getState() { return { pitch: this.pitch, bpm: this.bpm, track: this.track, loopActive: this.loopActive, jogMode: this.jogMode }; }
  setState(s) { Object.assign(this, s); }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    drawBody(ctx, 0, 0, W, H, 0, '#121218');
    // display
    const dbg = ctx.createLinearGradient(0, 4, 0, H*0.3);
    dbg.addColorStop(0, '#040810'); dbg.addColorStop(1, '#000608');
    ctx.fillStyle = dbg; rr(ctx, 4, 4, W-8, H*0.28, 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 4;
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 4; x < W-4; x++) {
      const t = (x-4) / (W-8) * Math.PI * 3;
      const y = H*0.18 - Math.sin(t) * H * 0.07;
      x === 4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // jog wheel
    const cx = W*0.38, cy = H*0.63, R = Math.min(W,H)*0.3;
    const cring = ctx.createRadialGradient(cx-R*.2, cy-R*.2, R*.8, cx, cy, R+3);
    cring.addColorStop(0,'#c0c0cc'); cring.addColorStop(0.5,'#808090'); cring.addColorStop(1,'#606070');
    ctx.fillStyle = cring; ctx.beginPath(); ctx.arc(cx,cy,R+3,0,Math.PI*2); ctx.fill();
    const jg = ctx.createRadialGradient(cx,cy,0,cx,cy,R);
    jg.addColorStop(0,'#1c1c28'); jg.addColorStop(1,'#0e0e18');
    ctx.fillStyle=jg; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e05020'; ctx.beginPath(); ctx.arc(cx,cy,R*0.28,0,Math.PI*2); ctx.fill();
    // buttons right
    [[W*0.76, H*0.35,'#00cc55'],[W*0.76, H*0.58,'#e08020']].forEach(([bx,by,c]) => {
      ctx.fillStyle=c+'30'; rr(ctx,bx,by-6,W*0.2,12,2); ctx.fill();
      ctx.strokeStyle=c+'60'; ctx.lineWidth=0.8; ctx.stroke();
    });
  }
}
