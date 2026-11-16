import { PluginBase } from './PluginBase.js';

const PAD_NAMES = ['KICK','SNARE','HIHAT','OPEN HH','TOM 1','TOM 2','CLAP','CYMBAL','RIM','PERC 1','PERC 2','PERC 3','FX 1','FX 2','FX 3','FX 4'];
const PAD_COLS  = ['#c0392b','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e91e63','#00bcd4','#ff5722','#8bc34a','#00acc1','#7e57c2','#ff4081','#69f0ae','#40c4ff','#ea80fc'];

export class DrumPad extends PluginBase {
  constructor(id, cfg = {}) {
    super(id, cfg);
    this.name = 'Drum Pad';
    this.pluginKey = 'drumpad';

    this.bpm = 128;
    this.pads = Array.from({ length: 16 }, (_, i) => ({
      name: PAD_NAMES[i], color: PAD_COLS[i],
      buf: null, vol: 0.9, pitch: 1.0
    }));
    this.seq = Array.from({ length: 16 }, () => new Array(16).fill(false));
    this.step = 0;
    this.running = false;
    this._timer = null;
    this._out = null;
    this._padEls = [];
    this._seqEls = []; // 16×16 grid cells
    this._bpmLbl = null;
  }

  defaultConfig() { return {}; }

  initAudio(ae) {
    super.initAudio(ae);
    if (!ae) return;
    this._out = ae.createChannel();
    if (this._out) this._out.gain.value = 0.9;
    this._genSounds();
  }

  _genSounds() {
    const ae = this.ae;
    if (!ae) return;
    this.pads[0].buf  = ae.kick();
    this.pads[1].buf  = ae.snare();
    this.pads[2].buf  = ae.hihat(false);
    this.pads[3].buf  = ae.hihat(true);
    this.pads[4].buf  = ae.tom(100);
    this.pads[5].buf  = ae.tom(80);
    this.pads[6].buf  = ae.clap();
    this.pads[7].buf  = ae.cymbal();
    this.pads[8].buf  = ae.rim();
    for (let i = 9; i < 16; i++) this.pads[i].buf = ae.tom(55 + i * 12);
  }

  _hitPad(i) {
    if (!this.ae?.ctx || !this.pads[i]?.buf) return;
    const { ctx } = this.ae;
    const p = this.pads[i];
    const src = ctx.createBufferSource();
    src.buffer = p.buf; src.playbackRate.value = p.pitch;
    const g = ctx.createGain(); g.gain.value = p.vol;
    src.connect(g); g.connect(this._out || this.ae.master);
    src.start();

    const el = this._padEls[i];
    if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 100); }
  }

  /* ============ SEQUENCER ============ */

  startSeq() {
    if (this.running) return;
    this.running = true; this.step = 0;
    const ms = (60 / this.bpm / 4) * 1000;
    this._tick();
    this._timer = setInterval(() => this._tick(), ms);
  }

  stopSeq() {
    this.running = false;
    clearInterval(this._timer); this._timer = null;
    this.step = 0;
    this._seqEls.forEach(row => row.forEach(c => c?.classList.remove('cur')));
  }

  _tick() {
    const s = this.step;
    // Update step highlight
    this._seqEls.forEach((row, p) => {
      row.forEach((c, st) => {
        if (!c) return;
        c.classList.toggle('cur', st === s);
      });
    });
    // Play
    for (let p = 0; p < 16; p++) {
      if (this.seq[p][s]) this._hitPad(p);
    }
    this.step = (s + 1) % 16;
  }

  syncBPM(bpm) {
    this.bpm = bpm;
    if (this._bpmLbl) this._bpmLbl.textContent = `${bpm} BPM`;
    if (this.running) { this.stopSeq(); this.startSeq(); }
  }

  /* ============ VIEWS ============ */

  createTopView() {
    const wrap = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'pad-grid';
    grid.style.cssText = 'grid-template-columns:repeat(4,1fr);gap:3px;padding:5px;';
    this._padEls = [];

    this.pads.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = `pad${p.buf ? ' has-s' : ''}`;
      el.style.minHeight = '28px';
      el.style.borderLeft = `2px solid ${p.color}60`;
      el.innerHTML = `<div class="pad-lbl">${p.name}</div><div class="pad-dot"></div>`;
      el.addEventListener('click', () => { this._hitPad(i); if (this.ae) this.ae.resume(); });
      this._padEls.push(el);
      grid.appendChild(el);
    });

    // Bottom control bar
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--bg-dark);border-top:1px solid var(--bdr);';

    const bpmLbl = document.createElement('span');
    bpmLbl.style.cssText = 'font-size:9px;color:var(--txt-dim);';
    bpmLbl.textContent = `${this.bpm} BPM`;
    this._bpmLbl = bpmLbl;

    const seqBtn = this.makeBtn('▶ SEQ', 'cue-btn', () => {
      if (this.running) { this.stopSeq(); seqBtn.textContent = '▶ SEQ'; seqBtn.classList.remove('on'); }
      else { if (this.ae) this.ae.resume(); this.startSeq(); seqBtn.textContent = '■ STOP'; seqBtn.classList.add('on'); }
    });
    seqBtn.style.cssText += 'font-size:9px;padding:2px 7px;';

    bar.append(bpmLbl, seqBtn);
    wrap.append(grid, bar);
    return wrap;
  }

  createZoomView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    // Pads (large)
    const grid = document.createElement('div');
    grid.className = 'pad-grid';
    grid.style.cssText = 'grid-template-columns:repeat(4,1fr);gap:5px;padding:10px;background:var(--bg-dark);border-radius:6px;';
    this._padEls = [];

    this.pads.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = `pad${p.buf ? ' has-s' : ''}`;
      el.style.minHeight = '50px';
      el.style.borderLeft = `3px solid ${p.color}70`;
      el.innerHTML = `<div class="pad-lbl">${p.name}</div><div class="pad-dot"></div>`;
      el.addEventListener('click', () => { this._hitPad(i); if (this.ae) this.ae.resume(); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); this._loadPad(i, el); });
      el.title = 'Click: play  •  Right-click: load sample';
      this._padEls.push(el);
      grid.appendChild(el);
    });
    wrap.appendChild(grid);

    // Sequencer
    const seqSec = document.createElement('div');
    seqSec.style.cssText = 'padding:10px;background:var(--bg-dark);border-radius:6px;';

    const seqHdr = document.createElement('div');
    seqHdr.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;';

    const playBtn = this.makeBtn('▶ PLAY', 'play-btn', () => {
      if (this.running) { this.stopSeq(); playBtn.textContent = '▶ PLAY'; playBtn.classList.remove('on'); }
      else { if (this.ae) this.ae.resume(); this.startSeq(); playBtn.textContent = '■ STOP'; playBtn.classList.add('on'); }
    });

    const bpmIn = document.createElement('input');
    bpmIn.type = 'number'; bpmIn.value = this.bpm; bpmIn.min = 40; bpmIn.max = 300;
    bpmIn.style.cssText = 'width:55px;background:var(--bg);border:1px solid var(--bdr);color:var(--txt);font-family:monospace;font-size:14px;text-align:center;padding:2px;border-radius:3px;-moz-appearance:textfield;';
    bpmIn.addEventListener('change', () => this.syncBPM(parseInt(bpmIn.value)));

    const bpmLbl2 = document.createElement('span');
    bpmLbl2.style.cssText = 'font-size:10px;color:var(--txt-dim);';
    bpmLbl2.textContent = 'BPM';

    const clearBtn = this.makeBtn('CLEAR', 'stop-btn', () => {
      this.seq = Array.from({ length: 16 }, () => new Array(16).fill(false));
      this._rebuildSeqGrid(seqGrid);
    });

    seqHdr.append(playBtn, bpmIn, bpmLbl2, clearBtn);

    const seqGrid = document.createElement('div');
    this._seqEls = Array.from({ length: 16 }, () => new Array(16).fill(null));
    this._buildSeqGrid(seqGrid);

    seqSec.append(seqHdr, seqGrid);
    wrap.appendChild(seqSec);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:9px;color:var(--txt-off);text-align:center;';
    hint.textContent = 'Right-click a pad to load a custom audio sample';
    wrap.appendChild(hint);

    return wrap;
  }

  _buildSeqGrid(container) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;gap:3px;overflow-x:auto;';

    // Step header
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;gap:2px;margin-left:52px;';
    for (let s = 0; s < 16; s++) {
      const c = document.createElement('div');
      c.style.cssText = `width:16px;height:11px;text-align:center;font-size:7px;color:${s % 4 === 0 ? 'var(--accent)' : 'var(--txt-off)'};`;
      c.textContent = s + 1;
      hdr.appendChild(c);
    }
    container.appendChild(hdr);

    for (let p = 0; p < 8; p++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:2px;align-items:center;';

      const lbl = document.createElement('div');
      lbl.style.cssText = `width:50px;font-size:8px;color:${PAD_COLS[p]};text-align:right;padding-right:4px;white-space:nowrap;overflow:hidden;`;
      lbl.textContent = PAD_NAMES[p];
      row.appendChild(lbl);

      for (let s = 0; s < 16; s++) {
        const cell = document.createElement('div');
        cell.className = 'seq-cell';
        cell.style.background = this.seq[p][s] ? PAD_COLS[p] + 'cc' : 'var(--bg)';
        cell.style.borderColor = s % 4 === 0 ? 'var(--bdr-act)' : 'var(--bdr)';
        cell.addEventListener('click', () => {
          this.seq[p][s] = !this.seq[p][s];
          cell.style.background = this.seq[p][s] ? PAD_COLS[p] + 'cc' : 'var(--bg)';
        });
        this._seqEls[p][s] = cell;
        row.appendChild(cell);
      }
      container.appendChild(row);
    }
  }

  _rebuildSeqGrid(container) { this._seqEls = Array.from({ length: 16 }, () => new Array(16).fill(null)); this._buildSeqGrid(container); }

  _loadPad(i, el) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async e => {
      const f = e.target.files[0];
      if (!f || !this.ae) return;
      try {
        this.pads[i].buf  = await this.ae.loadFile(f);
        this.pads[i].name = f.name.replace(/\.[^.]+$/, '').slice(0, 8).toUpperCase();
        el.classList.add('has-s');
        el.querySelector('.pad-lbl').textContent = this.pads[i].name;
        el.querySelector('.pad-dot').classList.add('b');
      } catch(err) { console.error('[DrumPad] load:', err); }
    };
    inp.click();
  }

  createCfgPanel() {
    const div = document.createElement('div');
    const sec = document.createElement('div');
    sec.className = 'cfg-sec';
    sec.innerHTML = '<h3>Pad Volumes</h3>';

    this.pads.slice(0, 8).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'cfg-row';
      const lbl = document.createElement('label');
      lbl.style.color = PAD_COLS[i]; lbl.textContent = p.name;
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = 0; sl.max = 1; sl.step = .01; sl.value = p.vol;
      sl.addEventListener('input', () => { p.vol = parseFloat(sl.value); });
      row.append(lbl, sl);
      sec.appendChild(row);
    });
    div.appendChild(sec);
    return div;
  }

  demo() {
    if (!this.ae) return;
    this.ae.resume();
    const beat = [[0,4,8,12], [0,8], [4,12]]; // hh, kick, snare
    const ms = (60 / this.bpm / 4) * 1000;
    for (let s = 0; s < 32; s++) {
      setTimeout(() => {
        if (beat[0].includes(s % 16)) this._hitPad(2);
        if (beat[1].includes(s % 16)) this._hitPad(0);
        if (beat[2].includes(s % 16)) this._hitPad(1);
      }, s * ms);
    }
  }

  destroy() { this.stopSeq(); }

  getState() { return { bpm: this.bpm, seq: this.seq.map(r => [...r]) }; }
  setState(s) {
    if (s.bpm) this.bpm = s.bpm;
    if (s.seq) this.seq = s.seq.map(r => [...r]);
  }

  static drawPreview(ctx) {
    const { width: W, height: H } = ctx.canvas;
    ctx.fillStyle = '#111118'; ctx.fillRect(0, 0, W, H);
    const pad = (W - 16) / 4;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = 8 + c * pad, y = 8 + r * (H - 16) / 4;
      ctx.fillStyle = '#1a1a2a'; ctx.fillRect(x, y, pad - 3, (H - 16) / 4 - 3);
      ctx.strokeStyle = PAD_COLS[r * 4 + c] + '80'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, pad - 3, (H - 16) / 4 - 3);
    }
  }
}
