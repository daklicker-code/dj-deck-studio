/**
 * DeckManager — manages the lifecycle of all device instances,
 * renders them into the stage, and handles modal UIs.
 */

export class DeckManager {
  constructor(ae) {
    this.ae = ae;
    this.devices = [];          // { plugin, card, topView }
    this._registry = {};        // pluginKey → class
    this._nextId = 1;

    this._rack    = document.getElementById('device-rack');
    this._stage   = document.getElementById('stage');
    this._empty   = document.getElementById('empty-state');
    this._modal   = document.getElementById('picker-modal');
    this._zModal  = document.getElementById('zoom-modal');
    this._cfgModal= document.getElementById('cfg-modal');
    this._grid    = document.getElementById('plugin-grid');
    this._zBody   = document.getElementById('zoom-body');
    this._zTitle  = document.getElementById('zoom-title');
    this._cfgBody = document.getElementById('cfg-body');
    this._cfgTitle= document.getElementById('cfg-title');
    if (this._rack) this._rack.style.display = '';

    this._activeZoom = null;
    this._bindPicker();
    this._bindZoomClose();
    this._bindCfgClose();
    this._loadState();
  }

  /* ───────────── Registry ───────────── */

  register(PluginClass) {
    this._registry[PluginClass.prototype.pluginKey || PluginClass.name.toLowerCase()] = PluginClass;
    this._renderPickerCard(PluginClass);
  }

  /* ───────────── Picker modal ───────────── */

  openPicker() { this._modal.classList.remove('hidden'); }

  _bindPicker() {
    document.getElementById('add-device')?.addEventListener('click', () => this.openPicker());
    document.getElementById('empty-add')?.addEventListener('click', () => this.openPicker());
    this._modal.querySelector('.modal-bg')?.addEventListener('click', () => this._modal.classList.add('hidden'));
    document.getElementById('picker-close')?.addEventListener('click', () => this._modal.classList.add('hidden'));
  }

  _renderPickerCard(PluginClass) {
    const proto = new PluginClass('__preview__');
    const card = document.createElement('div');
    card.className = 'plugin-card';

    const preview = document.createElement('canvas');
    preview.width = 120; preview.height = 80;
    preview.style.cssText = 'width:120px;height:80px;border-radius:4px;background:#111;';
    try { PluginClass.drawPreview(preview.getContext('2d')); } catch(_) {}

    const name = document.createElement('div');
    name.className = 'plugin-name';
    name.textContent = proto.name || PluginClass.name;

    card.append(preview, name);
    card.addEventListener('click', () => {
      this._modal.classList.remove('visible');
      this.addDevice(PluginClass);
    });
    this._grid.appendChild(card);
  }

  /* ───────────── Add / Remove devices ───────────── */

  addDevice(PluginClass, savedState = null) {
    const id = `dev_${this._nextId++}`;
    const plugin = new PluginClass(id);
    plugin.initAudio(this.ae);

    if (savedState) plugin.setState(savedState);

    // Wire BPM
    if (this.ae) {
      plugin.syncBPM(this.ae.bpm);
      this.ae.on('bpm', bpm => plugin.syncBPM(bpm));
    }

    const card = this._buildCard(plugin);
    const topView = plugin.createTopView();
    card.querySelector('.dev-body').appendChild(topView);

    const target = this._rack || this._stage;
    target.appendChild(card);
    this._empty?.classList.add('hidden');
    this.devices.push({ plugin, card, topView });
    this._saveState();
    return { plugin, card };
  }

  removeDevice(plugin) {
    const idx = this.devices.findIndex(d => d.plugin === plugin);
    if (idx === -1) return;
    const { card } = this.devices[idx];
    card.classList.add('removing');
    setTimeout(() => { card.remove(); }, 300);
    plugin.destroy();
    this.devices.splice(idx, 1);
    if (!this.devices.length) this._empty?.classList.remove('hidden');
    this._saveState();
  }

  /* ───────────── Device card ───────────── */

  _buildCard(plugin) {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.dataset.id = plugin.id;

    const hdr = document.createElement('div');
    hdr.className = 'dev-hdr';

    const led = document.createElement('div');
    led.className = 'led g';

    const title = document.createElement('span');
    title.className = 'dev-name';
    title.textContent = plugin.name;

    const btnRow = document.createElement('div');
    btnRow.className = 'dev-acts';

    const demoBtn = this._mkBtn('▶', 'dev-btn demo-btn', 'Demo', () => {
      this.ae?.resume(); plugin.demo();
    });
    const cfgBtn  = this._mkBtn('⚙', 'dev-btn cfg-btn', 'Config', () => this._openCfg(plugin));
    const zoomBtn = this._mkBtn('⤢', 'dev-btn zoom-btn', 'Expand', () => this._openZoom(plugin));
    const closeBtn= this._mkBtn('✕', 'dev-btn close-btn', 'Remove', () => this.removeDevice(plugin));

    btnRow.append(demoBtn, cfgBtn, zoomBtn, closeBtn);
    hdr.append(led, title, btnRow);

    const body = document.createElement('div');
    body.className = 'dev-body';

    card.append(hdr, body);
    return card;
  }

  _mkBtn(icon, cls, title, onClick) {
    const b = document.createElement('button');
    b.className = cls; b.textContent = icon; b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  /* ───────────── Zoom modal ───────────── */

  _openZoom(plugin) {
    this._activeZoom = plugin;
    this._zTitle.textContent = plugin.name;
    this._zBody.innerHTML = '';
    const view = plugin.createZoomView();
    this._zBody.appendChild(view);
    this._zModal.classList.remove('hidden');

    // Wire demo + cfg buttons in zoom modal
    document.getElementById('zoom-demo')?.addEventListener('click', () => { this.ae?.resume(); plugin.demo(); });
    document.getElementById('zoom-cfg')?.addEventListener('click', () => { this._zModal.classList.add('hidden'); this._openCfg(plugin); });
  }

  _bindZoomClose() {
    const close = () => {
      this._zModal.classList.add('hidden');
      if (this._activeZoom) { this._activeZoom.onZoomClose(); this._activeZoom = null; }
      this._zBody.innerHTML = '';
      this._saveState();
    };
    document.getElementById('zoom-close')?.addEventListener('click', close);
    this._zModal.querySelector('.modal-bg')?.addEventListener('click', close);
  }

  /* ───────────── Config modal ───────────── */

  _openCfg(plugin) {
    this._cfgTitle.textContent = plugin.name + ' — Config';
    this._cfgBody.innerHTML = '';
    this._cfgBody.appendChild(plugin.createCfgPanel());
    this._cfgModal.classList.remove('hidden');
  }

  _bindCfgClose() {
    const close = () => { this._cfgModal.classList.add('hidden'); this._saveState(); };
    document.getElementById('cfg-close')?.addEventListener('click', close);
    this._cfgModal.querySelector('.modal-bg')?.addEventListener('click', close);
  }

  /* ───────────── Persistence ───────────── */

  _saveState() {
    try {
      const state = this.devices.map(({ plugin }) => ({
        key: plugin.pluginKey,
        state: plugin.getState?.() ?? {}
      }));
      localStorage.setItem('dj-deck-state', JSON.stringify(state));
    } catch(e) { console.warn('[DeckManager] save:', e); }
  }

  _loadState() {
    // Deferred — called after all plugins are registered
    this._savedState = null;
    try {
      const raw = localStorage.getItem('dj-deck-state');
      if (raw) this._savedState = JSON.parse(raw);
    } catch(e) {}
  }

  restoreSaved() {
    if (!this._savedState?.length) return;
    this._savedState.forEach(({ key, state }) => {
      const Cls = Object.values(this._registry).find(C => {
        const p = new C('__check__'); return p.pluginKey === key;
      });
      if (Cls) this.addDevice(Cls, state);
    });
    this._savedState = null;
  }
}
