export class SkyAudio {
  constructor(enabled = true) {
    this.enabled = Boolean(enabled);
    this.context = null;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.enabled) this.unlock();
  }

  unlock() {
    if (!this.enabled) return null;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!this.context) this.context = new AudioContextCtor();
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  tone(frequency, duration = .08, options = {}) {
    const context = this.unlock();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, options.to), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume || .055, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  chord(notes, step = .035, duration = .12, options = {}) {
    notes.forEach((note, index) => {
      globalThis.setTimeout(() => this.tone(note, duration, options), index * step * 1000);
    });
  }

  shot(type = 'normal') {
    if (type === 'bomb') this.tone(150, .12, { type: 'triangle', to: 90, volume: .07 });
    else if (type === 'rainbow') this.chord([520, 660, 820], .025, .1, { type: 'sine', volume: .045 });
    else this.tone(310, .07, { type: 'triangle', to: 390, volume: .04 });
  }

  bounce() { this.tone(470, .045, { type: 'square', to: 420, volume: .025 }); }

  pop(callout = 'POP') {
    const notes = callout === 'SKY FALL' ? [280, 390, 540, 760] : callout === 'AVALANCHE' ? [310, 430, 590] : [430, 560];
    this.chord(notes, .03, .085, { type: 'triangle', volume: .035 });
  }

  rescue() { this.chord([560, 700, 840], .045, .15, { type: 'sine', volume: .05 }); }
  collect() { this.chord([720, 910], .04, .12, { type: 'sine', volume: .045 }); }
  anchor() { this.tone(180, .16, { type: 'triangle', to: 110, volume: .075 }); }
  ceiling() { this.tone(115, .24, { type: 'sawtooth', to: 72, volume: .035 }); }
  lightning() {
    this.tone(92, .24, { type: 'sawtooth', to: 48, volume: .075 });
    globalThis.setTimeout(() => this.chord([760, 540, 360], .018, .09, { type: 'square', volume: .022 }), 28);
  }
  boss() { this.chord([170, 230, 310], .055, .18, { type: 'triangle', volume: .055 }); }
  win() { this.chord([440, 554, 659, 880], .07, .2, { type: 'sine', volume: .045 }); }
  loss() { this.chord([330, 277, 220], .08, .18, { type: 'triangle', volume: .04 }); }
}
