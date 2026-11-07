/** Tiny WebAudio synth – no assets needed. */
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/* Original arcade-style loop (A minor, 8 bars, 8th-note steps). 0 = rest. */
const BPM = 156;
const BASS_ROOTS = [45, 41, 48, 43, 45, 41, 40, 45];
const LEAD: number[][] = [
  [69, 0, 72, 69, 76, 0, 72, 69],
  [65, 0, 69, 65, 72, 0, 69, 65],
  [67, 0, 72, 67, 76, 0, 72, 67],
  [71, 0, 67, 71, 74, 0, 71, 67],
  [69, 72, 76, 0, 81, 76, 72, 0],
  [77, 0, 72, 69, 65, 0, 69, 72],
  [71, 0, 76, 71, 68, 0, 71, 76],
  [69, 0, 72, 76, 81, 0, 0, 0],
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  enabled = true;
  volume = 0.5;
  musicEnabled = true;
  musicVolume = 0.6;
  private wakaToggle = false;

  /** Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.applyVolume();
  }

  applyVolume() {
    if (this.master) this.master.gain.value = this.volume * 0.6;
    if (this.musicGain) this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 0.45 : 0;
  }

  /* ── background music ── */

  /** Restart the loop from the beginning next time it plays. */
  resetMusic() {
    this.step = 0;
  }

  /** Start/stop the loop. Safe to call every frame. */
  setMusicPlaying(play: boolean) {
    const want = play && this.musicEnabled && !!this.ctx && this.ctx.state === "running";
    if (want && this.timer === null) this.startMusic();
    else if (!want && this.timer !== null) this.stopMusic();
  }

  private startMusic() {
    if (!this.ctx || !this.musicGain) return;
    this.bus = this.ctx.createGain();
    this.bus.connect(this.musicGain);
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(), 40);
    this.pump();
  }

  private stopMusic() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const bus = this.bus;
    this.bus = null;
    if (bus && this.ctx) {
      const t = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => bus.disconnect(), 200);
    }
  }

  private pump() {
    if (!this.ctx || !this.bus) return;
    const stepDur = 60 / BPM / 2;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (LEAD.length * 8);
    }
  }

  private note(freq: number, t0: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.bus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private tick(t0: number) {
    if (!this.ctx || !this.bus) return;
    if (!this.noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.05);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = this.noiseBuf;
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    src.connect(g);
    g.connect(this.bus);
    src.start(t0);
  }

  private playStep(step: number, t0: number, stepDur: number) {
    const bar = Math.floor(step / 8) % LEAD.length;
    const i = step % 8;
    const root = BASS_ROOTS[bar];
    // bass: root on beats, octave bounce on the off-beats
    this.note(mtof(i % 2 === 0 ? root : root + 12), t0, stepDur * 0.9, "triangle", 0.55);
    // lead melody
    const m = LEAD[bar][i];
    if (m) this.note(mtof(m), t0, stepDur * 0.85, "square", 0.16);
    // light percussion on off-beats
    if (i % 2 === 1) this.tick(t0);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = "square",
    vol = 0.3,
    slideTo?: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  waka() {
    this.wakaToggle = !this.wakaToggle;
    if (this.wakaToggle) this.tone(520, 0.085, "triangle", 0.35, 260);
    else this.tone(260, 0.085, "triangle", 0.35, 520);
  }

  power() {
    for (let i = 0; i < 4; i++)
      this.tone(220 + i * 110, 0.09, "sawtooth", 0.16, 330 + i * 160, i * 0.05);
  }

  eatGhost() {
    this.tone(180, 0.28, "square", 0.25, 1500);
    this.tone(90, 0.28, "sawtooth", 0.15, 750);
  }

  fruit() {
    this.tone(880, 0.09, "square", 0.22);
    this.tone(1320, 0.18, "square", 0.22, undefined, 0.09);
  }

  extraLife() {
    [659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.12, "square", 0.2, undefined, i * 0.09),
    );
  }

  death() {
    for (let i = 0; i < 9; i++)
      this.tone(900 - i * 85, 0.13, "triangle", 0.3, 700 - i * 85, i * 0.11);
    this.tone(120, 0.2, "square", 0.3, 40, 1.05);
  }

  start() {
    const notes: [number, number][] = [
      [494, 0],
      [988, 0.11],
      [740, 0.22],
      [622, 0.33],
      [988, 0.44],
      [740, 0.55],
      [622, 0.66],
      [523, 0.88],
      [1047, 0.99],
      [784, 1.1],
      [659, 1.21],
      [1047, 1.32],
      [784, 1.43],
      [659, 1.54],
    ];
    notes.forEach(([f, d]) => this.tone(f, 0.1, "square", 0.17, undefined, d));
  }

  clear() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.14, "square", 0.18, undefined, i * 0.1),
    );
  }

  click() {
    this.tone(700, 0.04, "square", 0.12);
  }
}
