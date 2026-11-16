# DJ Deck Studio v0.1

A browser-based DJ equipment simulator built with vanilla JavaScript, the Web Audio API, and Canvas 2D — no build step, no dependencies.

![DJ Deck Studio](https://img.shields.io/badge/version-0.1-3a9bd5?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## Features

- **Plugin architecture** — every device is a self-contained ES module
- **Top-down views** — each device is drawn from above, faithful to the real hardware
- **Click to zoom** — expand any device for a full-detail view with all controls
- **Demo button** — every device plays a short audio demo
- **Dark theme** — carefully tuned contrast with coloured LEDs and accents
- **Persistent setup** — your deck layout is saved to `localStorage` automatically

## Devices (v0.1)

| Device | Description |
|--------|-------------|
| **Technics 1210** | Spinning platter, tonearm, pitch slider, 33/45 RPM, reverse, file load |
| **DJ Mixer** | 4-channel EQ (hi/mid/lo), channel faders, crossfader, CUE, MUTE |
| **Drum Pad** | 4×4 velocity-sensitive pads, 16-step sequencer, BPM sync, custom samples |
| **Synthesizer** | Dual oscillator, lowpass filter, ADSR, LFO (pitch/filter/amp), 2-octave keyboard |

## Getting Started

```bash
# Clone the repository
git clone https://github.com/<your-username>/dj-deck-studio.git
cd dj-deck-studio

# Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> **Note:** Opening `index.html` directly as a `file://` URL will fail because ES modules require HTTP. Use a local server.

## Project Structure

```
dj-deck-studio/
├── index.html              Main shell & modals
├── css/
│   └── style.css           Dark theme, layout, component styles
└── js/
    ├── AudioEngine.js      Web Audio API wrapper (drums, effects, routing)
    ├── DeckManager.js      Device lifecycle, modal UI, localStorage
    ├── main.js             Entry point, header controls
    └── plugins/
        ├── PluginBase.js   Abstract base class (knob helper, button helper)
        ├── Turntable.js    Technics 1210 turntable
        ├── Mixer.js        4-channel DJ mixer
        ├── DrumPad.js      Drum pad + 16-step sequencer
        └── Synth.js        Dual-oscillator synthesizer
```

## Plugin Architecture

Each device extends `PluginBase` and implements:

```js
class MyDevice extends PluginBase {
  constructor(id, cfg) { super(id, cfg); this.pluginKey = 'mydevice'; }
  initAudio(ae)    { /* create Web Audio nodes */ }
  createTopView()  { /* return compact DOM element for the stage */ }
  createZoomView() { /* return full-detail DOM element for the modal */ }
  createCfgPanel() { /* return configuration DOM */ }
  demo()           { /* play a short audio demo */ }
  getState()       { return { /* serialisable state */ }; }
  setState(s)      { /* restore from getState() */ }
  static drawPreview(ctx) { /* draw 120×80 canvas thumbnail */ }
}
```

Register your plugin in `main.js`:
```js
import { MyDevice } from './plugins/MyDevice.js';
dm.register(MyDevice);
```

## Controls

| Control | Action |
|---------|--------|
| Click device | Focus / interact with controls |
| ⤢ button | Open full zoom view |
| ▶ button | Play audio demo |
| ⚙ button | Open device config |
| ✕ button | Remove device from deck |
| BPM ±    | Adjust global tempo |
| TAP      | Tap to set BPM |
| ⟳ SYNC  | Sync all devices to current BPM |
| SAVE     | Download setup as JSON |
| LOAD     | Restore setup from JSON |

## Browser Compatibility

Requires a modern browser with Web Audio API and ES module support:
- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## Roadmap (v0.2+)

- [ ] Effects rack (reverb, delay, chorus, flanger)
- [ ] Sampler / loop recorder
- [ ] MIDI controller support
- [ ] Visualiser / spectrum analyser
- [ ] Export mix as audio file (MediaRecorder API)
- [ ] Additional turntable skins
- [ ] Touch support for tablets

## License

MIT © 2026
