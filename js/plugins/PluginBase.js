/* PluginBase — abstract base class for all DJ devices */
export class PluginBase {
  constructor(id, config = {}) {
    this.id = id;
    this.name = 'Unknown Device';
    this.pluginKey = 'base';
    this.config = { ...this.defaultConfig(), ...config };
    this.ae = null; // AudioEngine
  }

  defaultConfig() { return {}; }
  initAudio(ae)   { this.ae = ae; }
  createTopView() { return document.createElement('div'); }
  createZoomView(){ return document.createElement('div'); }
  createCfgPanel(){ return document.createElement('div'); }
  demo()          {}
  onZoomClose()   {}
  syncBPM()       {}
  destroy()       {}
  getState()      { return {}; }
  setState()      {}

  /* ---- Helper: knob ---- */
  makeKnob(label, min, max, init, onChange, size = '') {
    const wrap = document.createElement('div');
    wrap.className = 'knob-wrap';

    const knob = document.createElement('div');
    knob.className = `knob ${size}`;

    const ind = document.createElement('div');
    ind.className = 'knob-ind';
    knob.appendChild(ind);

    const lbl = document.createElement('div');
    lbl.className = 'knob-lbl';
    lbl.textContent = label;

    const val = document.createElement('div');
    val.className = 'knob-val';

    wrap.append(knob, lbl, val);

    let cur = init;
    const decimals = (max - min) < 10 ? 1 : 0;

    const setRot = (v) => {
      const n = (v - min) / (max - min);
      const ang = -135 + n * 270;
      ind.style.transform = `translateX(-50%) rotate(${ang}deg)`;
      val.textContent = v.toFixed(decimals);
      cur = v;
    };
    setRot(init);

    let drag = false, startY = 0, startV = init;

    knob.addEventListener('mousedown', e => {
      drag = true; startY = e.clientY; startV = cur;
      e.preventDefault();
    });

    const onMove = e => {
      if (!drag) return;
      const delta = (startY - e.clientY) / 150;
      const nv = Math.min(max, Math.max(min, startV + delta * (max - min)));
      setRot(nv);
      onChange(nv);
    };
    const onUp = () => { drag = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    knob.addEventListener('wheel', e => {
      e.preventDefault();
      const step = (max - min) / 100;
      const nv = Math.min(max, Math.max(min, cur + (e.deltaY < 0 ? step : -step)));
      setRot(nv);
      onChange(nv);
    }, { passive: false });

    wrap._cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    return wrap;
  }

  /* ---- Helper: simple button ---- */
  makeBtn(text, cls, onClick) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  /* ---- Static: draw preview thumbnail for picker ---- */
  static drawPreview(ctx) {
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a9bd5';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DEVICE', w / 2, h / 2);
  }
}
