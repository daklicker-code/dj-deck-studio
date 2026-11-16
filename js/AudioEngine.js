/* AudioEngine — Web Audio API wrapper */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.bpm = 128;
    this._listeners = {};
    // Create AudioContext immediately (starts suspended; browsers allow this)
    this._init();
  }

  _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch(e) {
      console.warn('[AudioEngine] Could not create AudioContext:', e);
    }
  }

  /** Call on first user interaction to unlock audio */
  start() {
    if (!this.ctx) this._init();
    this.resume();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMasterVol(v) {
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setBPM(bpm) { this.bpm = bpm; this._emit('bpm', bpm); }

  /* Creates a GainNode wired to master — use as channel output */
  createChannel() {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  /* ---- Programmatic drum sounds ---- */
  _buf(dur, fn) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    fn(b.getChannelData(0), this.ctx.sampleRate);
    return b;
  }

  kick() {
    return this._buf(0.5, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = Math.sin(2 * Math.PI * 150 * Math.exp(-t * 15) * t) * Math.exp(-t * 8);
      }
    });
  }

  snare() {
    return this._buf(0.3, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(2 * Math.PI * 200 * t) * 0.4 + (Math.random() * 2 - 1) * 0.6) * Math.exp(-t * 15);
      }
    });
  }

  hihat(open = false) {
    return this._buf(open ? 0.3 : 0.08, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * (open ? 8 : 45)) * 0.5;
      }
    });
  }

  clap() {
    return this._buf(0.2, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.random() * 2 - 1) * (Math.exp(-t * 15) + (t < 0.01 ? Math.exp(-t * 50) : 0)) * 0.7;
      }
    });
  }

  tom(freq = 100) {
    return this._buf(0.4, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = Math.sin(2 * Math.PI * freq * Math.exp(-t * 8) * t) * Math.exp(-t * 10) * 0.8;
      }
    });
  }

  cymbal() {
    return this._buf(0.9, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 5) * 0.35;
      }
    });
  }

  rim() {
    return this._buf(0.15, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(2 * Math.PI * 450 * t) * 0.3 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t * 25);
      }
    });
  }

  playBuf(buffer, out) {
    if (!this.ctx || !buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out || this.master);
    src.start();
    return src;
  }

  async loadFile(file) {
    if (!this.ctx) return null;
    const ab = await file.arrayBuffer();
    return this.ctx.decodeAudioData(ab);
  }

  /* Minimal event emitter */
  on(e, fn) { (this._listeners[e] = this._listeners[e] || []).push(fn); }
  off(e, fn) { this._listeners[e] = (this._listeners[e] || []).filter(f => f !== fn); }
  _emit(e, d) { (this._listeners[e] || []).forEach(f => f(d)); }
}
