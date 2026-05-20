export class OfficeAudioManager {
  constructor(settings = {}) {
    this.settings = {
      musicEnabled: false,
      ambienceEnabled: false,
      musicVolume: 0.55,
      ambienceVolume: 0.58,
      ...settings
    };
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.ambienceGain = null;
    this.nodes = [];
    this.started = false;
  }

  ensureContext() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.ambienceGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.ambienceGain.connect(this.master);
    this._buildLoops();
  }

  async resume() {
    this.ensureContext();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    this.started = true;
    this.apply(this.settings);
  }

  async playLiftDing() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const dingGain = this.ctx.createGain();
    dingGain.gain.setValueAtTime(0.0001, now);
    dingGain.gain.exponentialRampToValueAtTime(0.42, now + 0.025);
    dingGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
    dingGain.connect(this.master);

    const makeTone = (freq, offset, duration, type = 'sine') => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.32, now + offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      osc.connect(gain);
      gain.connect(dingGain);
      osc.start(now + offset);
      osc.stop(now + offset + duration + 0.04);
    };

    makeTone(880, 0.0, 0.42);
    makeTone(1320, 0.04, 0.55, 'triangle');
    makeTone(1760, 0.18, 0.46);
    window.setTimeout(() => dingGain.disconnect(), 1250);
  }

  async playLiftButtonClick() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(940, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  async playLiftMoveRumble() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(82, now);
    osc.frequency.linearRampToValueAtTime(112, now + 0.42);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.95);
  }

  async playCoffeeStart() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this._shortTone(520, now, 0.08, 0.12, 'square');
    this._shortTone(780, now + 0.09, 0.12, 0.10, 'triangle');
  }

  async playCoffeePour() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const noise = this._noiseSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 760;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.06, now + 1.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(now);
    noise.stop(now + 2.45);
  }

  async playCoffeeSip() {
    await this.resume();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this._shortTone(330, now, 0.12, 0.06, 'sine');
    this._shortTone(440, now + 0.16, 0.18, 0.05, 'triangle');
  }

  apply(nextSettings = {}) {
    this.settings = { ...this.settings, ...nextSettings };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const musicTarget = this.settings.musicEnabled ? Number(this.settings.musicVolume ?? 0.28) : 0;
    const ambienceTarget = this.settings.ambienceEnabled ? Number(this.settings.ambienceVolume ?? 0.32) : 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.linearRampToValueAtTime(musicTarget, now + 0.18);
    this.ambienceGain.gain.linearRampToValueAtTime(ambienceTarget, now + 0.18);
  }

  setFocusMode(enabled) {
    if (!this.ctx) return;
    const scale = enabled ? 0.38 : 1;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(scale, now + 0.22);
  }

  _buildLoops() {
    if (!this.ctx || this.nodes.length) return;
    const masterFilter = this.ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 1450;
    masterFilter.Q.value = 0.35;
    masterFilter.connect(this.musicGain);
    this.nodes.push(masterFilter);

    const notes = [130.81, 196.0, 246.94, 329.63, 392.0];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = idx % 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      lfo.frequency.value = 0.035 + idx * 0.006;
      lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = idx < 2 ? 0.028 : 0.015;
      osc.connect(gain);
      gain.connect(masterFilter);
      osc.start(this.ctx.currentTime + idx * 0.08);
      lfo.start(this.ctx.currentTime + idx * 0.08);
      this.nodes.push(osc, gain, lfo, lfoGain);
    });

    this._scheduleSoftChord();
    this._scheduleGentleArp();

    const noise = this._noiseSource();
    const noiseGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.28;
    noiseGain.gain.value = 0.028;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ambienceGain);
    noise.start();
    this.nodes.push(noise, noiseGain, filter);

    for (let i = 0; i < 2; i++) this._scheduleClickLoop(i);
  }

  _noiseSource() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.18;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  _shortTone(freq, start, duration, volume, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  _scheduleClickLoop(seed) {
    const tick = () => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 420 + seed * 55 + Math.random() * 45;
      gain.gain.value = 0.018 + Math.random() * 0.014;
      osc.connect(gain);
      gain.connect(this.ambienceGain);
      const now = this.ctx.currentTime;
      osc.start(now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      osc.stop(now + 0.035);
      window.setTimeout(tick, 1200 + Math.random() * 2600 + seed * 480);
    };
    window.setTimeout(tick, 1200 + seed * 700);
  }

  _scheduleSoftChord() {
    const progression = [
      [261.63, 329.63, 392.0],
      [246.94, 329.63, 392.0],
      [220.0, 293.66, 369.99],
      [196.0, 261.63, 329.63]
    ];
    let index = 0;
    const play = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const chordGain = this.ctx.createGain();
      chordGain.gain.setValueAtTime(0.0001, now);
      chordGain.gain.linearRampToValueAtTime(0.035, now + 0.9);
      chordGain.gain.linearRampToValueAtTime(0.0001, now + 5.8);
      chordGain.connect(this.musicGain);
      for (const freq of progression[index % progression.length]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(chordGain);
        osc.start(now);
        osc.stop(now + 6.0);
      }
      index += 1;
      window.setTimeout(play, 6200);
    };
    window.setTimeout(play, 600);
  }

  _scheduleGentleArp() {
    const patterns = [
      [392.0, 493.88, 587.33, 659.25],
      [329.63, 392.0, 493.88, 587.33],
      [293.66, 369.99, 440.0, 554.37],
      [261.63, 329.63, 392.0, 523.25]
    ];
    let patternIndex = 0;
    const play = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.022;
      gain.connect(this.musicGain);
      const pattern = patterns[patternIndex % patterns.length];
      pattern.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        noteGain.gain.setValueAtTime(0.0001, now + idx * 0.32);
        noteGain.gain.linearRampToValueAtTime(0.08, now + idx * 0.32 + 0.04);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.32 + 0.28);
        osc.connect(noteGain);
        noteGain.connect(gain);
        osc.start(now + idx * 0.32);
        osc.stop(now + idx * 0.32 + 0.32);
      });
      patternIndex += 1;
      window.setTimeout(play, 8200 + Math.random() * 2400);
    };
    window.setTimeout(play, 3600);
  }
}
