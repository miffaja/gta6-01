// All sound is synthesized with WebAudio: no audio files, no network. Engine hum,
// sirens, gunshots, crashes, pickups and a small procedural music loop.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.musicOn = false;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenTimer = 0; this.sirenHigh = false;
    this.musicTimer = null; this.musicStep = 0; this.nextNote = 0;
    this.lastShot = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: sawtooth through a low-pass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: square wave, two alternating tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.engineGain) this.engineGain.gain.value = 0; if (this.sirenGain) this.sirenGain.gain.value = 0; }
  _tone(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination); src.start();
  }
  click() { this._tone(660, 0.06, 'square', 0.08); }
  pickup() { this._tone(880, 0.09, 'sine', 0.18); this._tone(1318, 0.14, 'sine', 0.16, 0.08); }
  cash() { this._tone(1046, 0.08, 'triangle', 0.18); this._tone(1568, 0.16, 'triangle', 0.16, 0.07); }
  shot() {
    const now = performance.now();
    if (now - this.lastShot < 60) return;
    this.lastShot = now; this._noise(0.12, 0.35, 3000); this._tone(160, 0.1, 'sine', 0.25);
  }
  crash(strength = 1) { this._noise(0.25, 0.3 * strength, 500); this._tone(70, 0.2, 'sine', 0.3 * strength); }
  horn() { this._tone(370, 0.18, 'square', 0.1); this._tone(466, 0.18, 'square', 0.08); }
  // The big rigs honk lower and longer — trucks and buses get their own voice.
  hornBig() { this._tone(185, 0.32, 'square', 0.12); this._tone(233, 0.32, 'square', 0.1); }
  // Stunt-ramp launch: a rising chirp so airtime feels like a reward.
  stunt() { this._tone(523, 0.1, 'triangle', 0.14); this._tone(784, 0.12, 'triangle', 0.14, 0.07); this._tone(1046, 0.16, 'triangle', 0.12, 0.14); }
  pass() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.18, i * 0.09)); }
  fail() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.22, 'sawtooth', 0.12, i * 0.12)); }
  bust() { [440, 415, 392, 370].forEach((f, i) => this._tone(f, 0.25, 'square', 0.12, i * 0.14)); }
  wasted() { [330, 294, 262, 196].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.14, i * 0.16)); }
  engine(speed01, driving, pitch = 1) {
    if (!this.ctx || !this.engineGain) return;
    const target = this.muted ? 0 : (driving ? 0.05 + speed01 * 0.09 : 0);
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    // pitch: sports cars rev higher, trucks/buses rumble lower.
    this.engineOsc.frequency.setTargetAtTime((55 + speed01 * 140) * pitch, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime((300 + speed01 * 900) * pitch, this.ctx.currentTime, 0.1);
  }
  siren(on, dt) {
    if (!this.ctx || !this.sirenGain) return;
    if (on && !this.muted) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) { this.sirenTimer = 0; this.sirenHigh = !this.sirenHigh; this.sirenOsc.frequency.value = this.sirenHigh ? 880 : 660; }
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
    } else this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }
  // Music: a lazy 100 BPM loop — bass line, hats, a sparse lead. Scheduled ahead.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this.musicStep = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    const lead = [220, 0, 0, 262, 0, 0, 330, 0, 0, 294, 0, 0, 262, 0, 196, 0];
    const stepDur = 60 / 100 / 2; // 8th notes at 100 BPM
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        const i = this.musicStep % 16;
        if (!this.muted) {
          if (bass[i]) this._toneAt(bass[i], stepDur * 0.9, 'triangle', 0.11, this.nextNote);
          if (lead[i]) this._toneAt(lead[i], stepDur * 0.8, 'sine', 0.05, this.nextNote);
          if (this.musicStep % 2 === 0) this._noiseAt(0.03, 0.03, 6000, this.nextNote);
        }
        this.nextNote += stepDur; this.musicStep++;
      }
      this.musicTimer = setTimeout(tick, 120);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; if (this.musicTimer) clearTimeout(this.musicTimer); }
  _toneAt(freq, dur, type, vol, when) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(this.ctx.destination); o.start(when); o.stop(when + dur + 0.02);
  }
  _noiseAt(dur, vol, freq, when) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination); src.start(when);
  }
}
