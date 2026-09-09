/**
 * Pouring sounds are half the feel (HANDOVER.md §1).
 *
 * The continuous pour is synthesised from filtered noise rather than played
 * from a sample: pitch and gain have to track flow rate and fill level
 * continuously, which a looped sample cannot do convincingly, and it keeps the
 * asset budget at zero (§13). Howler stays the library for one-shot samples
 * once there are actual files to play.
 */

export interface PourSound {
  /** ml per second, 0 when not pouring. */
  flow: number;
  /** 0..1 fill of the vessel being poured into — raises the pitch as it fills. */
  fullness: number;
  /** The stream is landing on the counter, not in a glass. */
  missing: boolean;
  /** The target is full and liquid is going over the rim. */
  overflowing: boolean;
}

const MAX_FLOW = 100;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private noise: AudioBufferSourceNode | null = null;
  private bandpass: BiquadFilterNode | null = null;
  private streamGain: GainNode | null = null;

  private glug: OscillatorNode | null = null;
  private glugGain: GainNode | null = null;

  private shakeAccumulator = 0;
  private wasPouring = false;
  private muted = false;

  /** Browsers require a gesture before audio starts; call this on first press. */
  resume(): void {
    if (!this.ctx) this.build();
    void this.ctx?.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  private build(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // Two seconds of noise on a loop is the body of the pour.
    const frames = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    this.bandpass = ctx.createBiquadFilter();
    this.bandpass.type = 'bandpass';
    this.bandpass.frequency.value = 900;
    this.bandpass.Q.value = 1.2;

    this.streamGain = ctx.createGain();
    this.streamGain.gain.value = 0;

    this.noise.connect(this.bandpass).connect(this.streamGain).connect(this.master);
    this.noise.start();

    // A low sine under the noise: the hollow note a filling vessel makes.
    this.glug = ctx.createOscillator();
    this.glug.type = 'sine';
    this.glug.frequency.value = 180;
    this.glugGain = ctx.createGain();
    this.glugGain.gain.value = 0;
    this.glug.connect(this.glugGain).connect(this.master);
    this.glug.start();
  }

  /** Called every rendered frame with the current pour state. */
  update(sound: PourSound): void {
    if (!this.ctx || !this.bandpass || !this.streamGain || !this.glugGain || !this.glug) return;
    const now = this.ctx.currentTime;
    const pouring = sound.flow > 0;

    if (pouring && !this.wasPouring) this.startTransient();
    if (!pouring && this.wasPouring) this.stopTransient();
    this.wasPouring = pouring;

    const flowNorm = Math.min(1, sound.flow / MAX_FLOW);

    // A near-full glass resonates higher. This is the "near-full" cue in the
    // §7 acceptance list, and it is audible before it is visible.
    const pitchFromFill = 260 + sound.fullness * 900;
    const centre = sound.missing ? 2600 : pitchFromFill + flowNorm * 380;

    this.bandpass.frequency.setTargetAtTime(centre, now, 0.05);
    // A miss is a flat splatter with no resonance; a pour into a glass rings.
    this.bandpass.Q.setTargetAtTime(sound.missing ? 0.5 : 3.2, now, 0.05);

    const targetGain = pouring ? 0.05 + flowNorm * 0.2 : 0;
    this.streamGain.gain.setTargetAtTime(targetGain, now, 0.04);

    // Overflow gets its own ugly low burble so a mistake is louder than a
    // success (§9).
    const glugTarget = sound.overflowing ? 0.12 : pouring && !sound.missing ? 0.02 : 0;
    this.glugGain.gain.setTargetAtTime(glugTarget, now, 0.05);
    this.glug.frequency.setTargetAtTime(
      sound.overflowing ? 90 : 150 + sound.fullness * 130,
      now,
      0.08,
    );
  }

  /** The splash of a stream first hitting something. */
  private startTransient(): void {
    this.burst(1400, 0.16, 0.12);
  }

  /** The last drops and the bottle righting itself. */
  private stopTransient(): void {
    this.burst(700, 0.1, 0.09);
  }

  /** Ice landing in a glass. */
  clink(): void {
    this.burst(2600, 0.1, 0.07);
    this.burst(3400, 0.05, 0.04);
  }

  /** The jigger hitting a measuring mark — a small, definite click. */
  tick(): void {
    this.burst(5200, 0.06, 0.025);
  }

  /** Salt crunching onto a wet rim. */
  crunch(): void {
    this.burst(4200, 0.09, 0.16);
  }

  /** Something soft landing on a rim. */
  thud(): void {
    this.burst(420, 0.09, 0.09);
  }

  /** Everything going down the drain. */
  drain(): void {
    this.burst(900, 0.11, 0.34);
  }

  /** A drink handed over and accepted — a warm little chime, not a fanfare. */
  accepted(great: boolean): void {
    this.tone(great ? 660 : 480, 0.06, 0.16);
    if (great) this.tone(880, 0.05, 0.2);
  }

  /** A drink pushed back across the bar. Mistakes are louder (§9). */
  sentBack(): void {
    this.tone(190, 0.1, 0.3);
    this.burst(320, 0.08, 0.2);
  }

  /** Last call. */
  bell(): void {
    this.tone(520, 0.09, 0.7);
    this.tone(392, 0.07, 0.9);
  }

  /** A clean pitched note, for the things that are not impacts. */
  private tone(frequency: number, gain: number, durationSec: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;

    const level = ctx.createGain();
    const now = ctx.currentTime;
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(gain, now + 0.012);
    level.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(level).connect(master);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
    osc.onended = () => {
      osc.disconnect();
      level.disconnect();
    };
  }

  /** The vessel is full and will not take it. */
  reject(): void {
    this.burst(240, 0.1, 0.12);
  }

  /**
   * The shaker rattle. Continuous while shaking, and the ice inside is what
   * you can hear — intensity drives both how loud and how busy it is.
   */
  updateShake(intensity: number): void {
    if (!this.ctx) return;
    if (intensity <= 0.05) {
      this.shakeAccumulator = 0;
      return;
    }
    // Individual ice hits, fired faster the harder it is worked.
    this.shakeAccumulator += intensity;
    if (this.shakeAccumulator >= 1.6) {
      this.shakeAccumulator = 0;
      this.burst(1800 + Math.random() * 2200, 0.05 + intensity * 0.07, 0.05);
    }
  }

  private burst(frequency: number, gain: number, durationSec: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const frames = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Exponential decay so it reads as a hit, not a beep.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1;

    const level = ctx.createGain();
    level.gain.value = gain;

    source.connect(filter).connect(level).connect(master);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      level.disconnect();
    };
  }
}
