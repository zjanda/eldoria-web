/**
 * Procedural ambience and sound effects with the Web Audio API — no audio
 * files to ship. Each ambience is a soft drone plus filtered "wind" noise,
 * tuned per location.
 */

interface AmbiencePreset {
  drone: number[]; // Hz
  droneGain: number;
  noiseFilter: number; // Hz lowpass
  noiseGain: number;
  shimmer?: boolean;
  pulse?: number; // seconds between low pulses
}

const PRESETS: Record<string, AmbiencePreset> = {
  fey_court: { drone: [220, 277.2, 329.6], droneGain: 0.018, noiseFilter: 2200, noiseGain: 0.012, shimmer: true },
  forest_night: { drone: [98, 146.8], droneGain: 0.02, noiseFilter: 700, noiseGain: 0.05 },
  shadow_road: { drone: [61.7, 65.4, 92.5], droneGain: 0.03, noiseFilter: 400, noiseGain: 0.03 },
  cave: { drone: [82.4, 123.5], droneGain: 0.022, noiseFilter: 300, noiseGain: 0.03, pulse: 3.3 },
  combat: { drone: [55, 82.4], droneGain: 0.03, noiseFilter: 500, noiseGain: 0.035, pulse: 0.9 },
  gate: { drone: [41.2, 43.7, 61.7], droneGain: 0.04, noiseFilter: 250, noiseGain: 0.04 },
};

class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimers: number[] = [];
  private currentKey: string | null = null;
  enabled = false;
  volume = 0.7;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * (this.ducked ? 0.35 : 1);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopAmbience();
    else if (this.currentKey) this.playAmbience(this.currentKey, true);
  }

  private ducked = false;

  setVolume(volume: number) {
    this.volume = volume;
    this.applyVolume();
  }

  /** Lower the ambience while the narrator speaks. */
  setDucked(ducked: boolean) {
    this.ducked = ducked;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.master || !this.context) return;
    const target = this.volume * (this.ducked ? 0.35 : 1);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.25);
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Brown-ish noise: smoother, more like wind.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  stopAmbience() {
    const context = this.context;
    for (const node of this.activeNodes) {
      try {
        if (node instanceof GainNode && context) {
          node.gain.setTargetAtTime(0, context.currentTime, 0.6);
          window.setTimeout(() => node.disconnect(), 2500);
        } else if (node instanceof AudioScheduledSourceNode) {
          node.stop((context?.currentTime ?? 0) + 2.5);
        }
      } catch {
        /* node already stopped */
      }
    }
    this.activeNodes = [];
    this.activeTimers.forEach((t) => window.clearInterval(t));
    this.activeTimers = [];
  }

  playAmbience(key: string, force = false) {
    if (!force && key === this.currentKey && this.activeNodes.length) return;
    this.currentKey = key;
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    this.stopAmbience();
    const preset = PRESETS[key] ?? PRESETS.forest_night;

    const bus = context.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, context.currentTime, 1.5);
    bus.connect(this.master);
    this.activeNodes.push(bus);

    for (const frequency of preset.drone) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const lfo = context.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.1;
      const lfoGain = context.createGain();
      lfoGain.gain.value = frequency * 0.004;
      lfo.connect(lfoGain).connect(oscillator.frequency);
      const gain = context.createGain();
      gain.gain.value = preset.droneGain;
      oscillator.connect(gain).connect(bus);
      oscillator.start();
      lfo.start();
      this.activeNodes.push(oscillator, lfo);
    }

    const noise = context.createBufferSource();
    noise.buffer = this.noiseBuffer(context);
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = preset.noiseFilter;
    const noiseGain = context.createGain();
    noiseGain.gain.value = preset.noiseGain;
    noise.connect(filter).connect(noiseGain).connect(bus);
    noise.start();
    this.activeNodes.push(noise);

    if (preset.shimmer) {
      this.activeTimers.push(
        window.setInterval(() => this.chime(bus, 880 * [1, 1.25, 1.5, 2][Math.floor(Math.random() * 4)], 0.012), 2600),
      );
    }
    if (preset.pulse) {
      this.activeTimers.push(window.setInterval(() => this.thump(bus, 0.05), preset.pulse * 1000));
    }
  }

  private chime(destination: AudioNode, frequency: number, level: number) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(level, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.5);
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 2.6);
  }

  private thump(destination: AudioNode, level: number) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(90, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, context.currentTime + 0.3);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
  }

  /** Rattling dice: a burst of short filtered clicks. */
  playDice() {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    for (let i = 0; i < 7; i++) {
      const at = context.currentTime + i * 0.07 + Math.random() * 0.03;
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer(context);
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800 + Math.random() * 1600;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.25 * (1 - i / 9), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(at, Math.random());
      source.stop(at + 0.06);
    }
  }

  playOutcome(success: boolean) {
    if (!this.enabled || !this.master) return;
    this.chime(this.master, success ? 660 : 196, 0.05);
    if (success) window.setTimeout(() => this.master && this.chime(this.master, 990, 0.035), 120);
  }
}

export const audio = new AudioEngine();
