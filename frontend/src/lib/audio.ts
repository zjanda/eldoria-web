/**
 * Procedural ambience and sound effects with the Web Audio API: no audio files to ship.
 *
 * Each ambience is a quiet musical pad (a consonant chord whose voices swell in and out on their
 * own slow cycles), a breath of mid-range "air", and a few sparse notes, all in a soft reverb.
 * Nothing sits below about 130 Hz and no two voices are close enough in pitch to throb against
 * each other: low, beating tones are what make a drone sound like an engine.
 */

import { remoteBackend } from "../api/connection";

interface AmbiencePreset {
  /** Pad chord in Hz, lowest first. */
  chord: number[];
  padGain: number;
  /** Lowpass on the pad in Hz: lower is darker and softer. */
  warmth: number;
  /** Seconds for one swell of a voice; each voice drifts around this. */
  swell: number;
  /** Centre of the air band in Hz, and how loud it is. */
  airTone: number;
  airGain: number;
  /** Sparse single notes over the pad. */
  motif?: { notes: number[]; everySeconds: [number, number]; level: number; attack: number; decay: number };
}

const PRESETS: Record<string, AmbiencePreset> = {
  // Bright and open: A major with an added ninth, and small bell notes.
  fey_court: {
    chord: [220, 329.63, 493.88, 554.37], padGain: 0.03, warmth: 1800, swell: 14, airTone: 2400, airGain: 0.006,
    motif: { notes: [880, 987.77, 1108.73, 1318.51, 1479.98], everySeconds: [4, 9], level: 0.014, attack: 0.03, decay: 3.5 },
  },
  // Calm and open: D with fifths and a ninth, a little night air, a rare slow note.
  forest_night: {
    chord: [146.83, 220, 329.63, 440], padGain: 0.032, warmth: 1100, swell: 18, airTone: 900, airGain: 0.012,
    motif: { notes: [293.66, 329.63, 440, 493.88, 587.33], everySeconds: [9, 18], level: 0.012, attack: 0.5, decay: 5 },
  },
  // Uneasy but quiet: D minor with a flat sixth on top.
  shadow_road: {
    chord: [146.83, 220, 349.23, 466.16], padGain: 0.03, warmth: 900, swell: 20, airTone: 600, airGain: 0.01,
    motif: { notes: [293.66, 349.23, 440, 466.16], everySeconds: [12, 22], level: 0.011, attack: 0.8, decay: 6 },
  },
  // Hollow and still: bare fifths, with single high drops of sound.
  cave: {
    chord: [164.81, 246.94, 329.63], padGain: 0.028, warmth: 800, swell: 22, airTone: 450, airGain: 0.008,
    motif: { notes: [1318.51, 1567.98, 1975.53, 2349.32], everySeconds: [3, 8], level: 0.01, attack: 0.005, decay: 1.2 },
  },
  // Tense and moving: E minor, quicker swells, no drums.
  combat: {
    chord: [164.81, 246.94, 392, 493.88], padGain: 0.034, warmth: 1300, swell: 5, airTone: 1200, airGain: 0.008,
    motif: { notes: [329.63, 369.99, 392, 493.88], everySeconds: [2.5, 5], level: 0.014, attack: 0.15, decay: 2.2 },
  },
  // Ominous: a fifth with a tritone above it, dark and slow.
  gate: {
    chord: [130.81, 196, 277.18, 392], padGain: 0.03, warmth: 750, swell: 24, airTone: 500, airGain: 0.01,
    motif: { notes: [261.63, 277.18, 392], everySeconds: [14, 26], level: 0.011, attack: 1, decay: 7 },
  },
};

const between = (low: number, high: number) => low + Math.random() * (high - low);

// Equal-power fades, so two overlapping passes of a track keep a steady loudness.
const FADE_STEPS = 64;
const FADE_IN = Float32Array.from({ length: FADE_STEPS }, (_, i) => Math.sin((i / (FADE_STEPS - 1)) * (Math.PI / 2)));
const FADE_OUT = Float32Array.from({ length: FADE_STEPS }, (_, i) => Math.cos((i / (FADE_STEPS - 1)) * (Math.PI / 2)));

/** Loudness composed music is brought to, so it sits behind the story like the ambience does. */
const MUSIC_TARGET_RMS = 0.045;
/** Nearby sounds sit quietly under the music. */
const NEARBY_TARGET_RMS = 0.018;
const SILENCE_RMS = 0.006;

/**
 * The part of a track that actually sounds (generated tracks often open and close with silence),
 * and the gain that brings it to the background level.
 */
export function soundingRegion(
  buffer: AudioBuffer,
  { target = MUSIC_TARGET_RMS, minSeconds = 10 }: { target?: number; minSeconds?: number } = {},
): { start: number; length: number; level: number } {
  const samples = buffer.getChannelData(0);
  const window = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
  const loudness = (from: number) => {
    let sum = 0;
    const to = Math.min(samples.length, from + window);
    for (let i = from; i < to; i += 4) sum += samples[i] * samples[i];
    return Math.sqrt(sum / Math.max(1, (to - from) / 4));
  };
  let first = 0;
  while (first + window < samples.length && loudness(first) < SILENCE_RMS) first += window;
  let last = samples.length;
  while (last - window > first && loudness(last - window) < SILENCE_RMS) last -= window;
  // Too little left to loop: play the whole thing rather than a fragment.
  if ((last - first) / buffer.sampleRate < minSeconds) {
    first = 0;
    last = samples.length;
  }
  let sum = 0;
  let count = 0;
  for (let i = first; i < last; i += 16) {
    sum += samples[i] * samples[i];
    count += 1;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  return {
    start: first / buffer.sampleRate,
    length: (last - first) / buffer.sampleRate,
    level: Math.min(1, target / Math.max(rms, 0.005)),
  };
}

interface Loop {
  bus: GainNode;
  sources: AudioBufferSourceNode[];
  timers: number[];
  stopped: boolean;
}

/**
 * Loop one or more takes into `destination`, each pass fading into the next so the loop point is
 * not heard. With several takes, passes alternate between them. Each take's silent lead-in and
 * tail are skipped and its loudness is brought to `target`.
 */
function startLoop(context: AudioContext, destination: AudioNode, takes: AudioBuffer[], target: number): Loop {
  const regions = takes.map((take) => soundingRegion(take, { target }));
  const bus = context.createGain();
  bus.connect(destination);
  const loop: Loop = { bus, sources: [], timers: [], stopped: false };
  let index = 0;
  const pass = (at: number, fadeIn: number) => {
    if (loop.stopped) return;
    const which = index % takes.length;
    index += 1;
    const { start, length, level } = regions[which];
    const overlap = Math.min(6, Math.max(2, length * 0.12));
    const source = context.createBufferSource();
    source.buffer = takes[which];
    const loudness = context.createGain();
    loudness.gain.value = level;
    const fade = context.createGain();
    fade.gain.value = 0;
    fade.gain.setValueCurveAtTime(FADE_IN, at, fadeIn);
    fade.gain.setValueCurveAtTime(FADE_OUT, at + length - overlap, overlap);
    source.connect(loudness).connect(fade).connect(bus);
    source.start(at, start, length);
    source.stop(at + length + 0.1);
    loop.sources.push(source);
    source.onended = () => {
      loudness.disconnect();
      fade.disconnect();
      loop.sources = loop.sources.filter((other) => other !== source);
    };
    // Line up the next pass well ahead of time: timers in a background tab can run very late.
    const period = length - overlap;
    const wait = Math.max(0, at - context.currentTime) + period * 0.25;
    loop.timers.push(window.setTimeout(() => pass(at + period, overlap), wait * 1000));
  };
  pass(context.currentTime + 0.05, Math.min(3, Math.max(2, regions[0].length * 0.12)));
  return loop;
}

/** Fade a loop out over a few seconds and release it. */
function stopLoop(context: AudioContext, loop: Loop) {
  loop.stopped = true;
  loop.timers.forEach((timer) => window.clearTimeout(timer));
  loop.bus.gain.setTargetAtTime(0, context.currentTime, 0.8);
  for (const source of loop.sources) {
    try {
      source.stop(context.currentTime + 4);
    } catch {
      /* already stopped */
    }
  }
  window.setTimeout(() => loop.bus.disconnect(), 4500);
}

/** A nearby sound to play: loops repeat, one-offs are heard now and then. */
export interface NearbyLayer {
  id: string;
  kind: "loop" | "oneshot";
  /** Decoded takes, used interchangeably. */
  takes: AudioBuffer[];
  /** Identifies the takes, so the same layer is not restarted when nothing changed. */
  signature: string;
  /** The player's level for this sound: 1 is the normal level, 0 silent, up to 2 twice as loud. */
  volume: number;
}

interface NearbyPlaying {
  signature: string;
  loop: Loop | null;
  timer: number | undefined;
  /** The player's own level for this sound, between the sound and the master volume. */
  volume: GainNode;
}

export const MAX_NEARBY_VOLUME = 2;
const clampVolume = (volume: number) => Math.min(MAX_NEARBY_VOLUME, Math.max(0, Number.isFinite(volume) ? volume : 1));

/** True once the player has clicked or pressed a key on the page (always true where browsers cannot tell). */
function hasInteracted(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimers: number[] = [];
  private currentKey: string | null = null;
  private airBuffer: AudioBuffer | null = null;
  private reverbBuffer: AudioBuffer | null = null;
  /** Bumped whenever the ambience stops, so the note scheduling of the old one ends. */
  private session = 0;
  enabled = false;
  volume = 0.7;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * (this.ducked ? 0.35 : 1);
      this.master.connect(this.context.destination);
      this.resumeOnFirstGesture();
    }
    // Browsers let sound start only after the player has clicked or pressed a key on the page;
    // asking earlier is refused (with a console warning each time), so wait for that.
    if (this.context.state === "suspended" && hasInteracted()) void this.context.resume().catch(() => undefined);
    return this.context;
  }

  /** Sounds prepared before the player's first click or key press start playing with it. */
  private resumeOnFirstGesture() {
    if (hasInteracted()) return;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const resume = () => {
      events.forEach((name) => window.removeEventListener(name, resume, true));
      if (this.context?.state === "suspended") void this.context.resume().catch(() => undefined);
    };
    events.forEach((name) => window.addEventListener(name, resume, true));
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAmbience();
      this.fadeOutMusic();
      this.stopAllNearby();
      return;
    }
    if (this.wantedNearby.length) this.setNearby(this.wantedNearby);
    const track = this.wantedMusic;
    if (track && !this.music) {
      this.wantedMusic = null;
      void this.playMusic(track);
    }
    if (this.currentKey) this.playAmbience(this.currentKey, true);
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

  /** Short brown-ish noise, used for the dice clicks. */
  private noiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /** Twelve seconds of pink noise: long enough that the loop is not heard repeating. */
  private air(context: AudioContext): AudioBuffer {
    if (this.airBuffer) return this.airBuffer;
    const fade = Math.floor(context.sampleRate * 0.5);
    const length = context.sampleRate * 12;
    const raw = new Float32Array(length + fade);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    // Blend the tail into the start so the loop point makes no click.
    for (let i = 0; i < fade; i++) {
      const mix = i / fade;
      raw[i] = raw[i] * mix + raw[length + i] * (1 - mix);
    }
    const buffer = context.createBuffer(1, length, context.sampleRate);
    buffer.getChannelData(0).set(raw.subarray(0, length));
    return (this.airBuffer = buffer);
  }

  /** A soft hall: decaying noise used as a reverb impulse. */
  private hall(context: AudioContext): AudioBuffer {
    if (this.reverbBuffer) return this.reverbBuffer;
    const buffer = context.createBuffer(2, Math.floor(context.sampleRate * 3.2), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        // Smoothed so the tail is warm rather than hissy.
        smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = smooth * Math.pow(1 - i / data.length, 3.2);
      }
    }
    return (this.reverbBuffer = buffer);
  }

  stopAmbience() {
    this.session += 1;
    const context = this.context;
    for (const node of this.activeNodes) {
      try {
        if (node instanceof GainNode && context) {
          node.gain.setTargetAtTime(0, context.currentTime, 0.6);
          window.setTimeout(() => node.disconnect(), 3500);
        } else if (node instanceof AudioScheduledSourceNode) {
          node.stop((context?.currentTime ?? 0) + 3.5);
        }
      } catch {
        /* node already stopped */
      }
    }
    this.activeNodes = [];
    this.activeTimers.forEach((t) => window.clearTimeout(t));
    this.activeTimers = [];
  }

  // ---------------------------------------------------------------- composed music

  private music: (Loop & { url: string }) | null = null;
  /** The track that should be playing, whether or not it has loaded yet. */
  private wantedMusic: string | null = null;

  /**
   * Loop a composed track in place of the synthesized ambience. The track's silent lead-in and
   * tail are skipped, and each pass fades into the next so the loop point is not heard.
   * If the track cannot be loaded the ambience simply keeps playing.
   */
  async playMusic(url: string) {
    if (this.wantedMusic === url) return;
    this.wantedMusic = url;
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    let buffer: AudioBuffer;
    try {
      const response = await fetch(url, { credentials: remoteBackend ? "include" : "same-origin" });
      if (!response.ok) throw new Error(`music ${response.status}`);
      buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      if (this.wantedMusic === url) this.wantedMusic = null; // a later request may try again
      return;
    }
    if (this.wantedMusic !== url || !this.enabled || !this.master) return;
    this.fadeOutMusic();
    this.stopAmbience();
    this.music = Object.assign(startLoop(context, this.master, [buffer], MUSIC_TARGET_RMS), { url });
  }

  /** Stop the composed music and let the ambience return. */
  stopMusic() {
    this.wantedMusic = null;
    if (!this.music) return;
    this.fadeOutMusic();
    if (this.enabled && this.currentKey) this.playAmbience(this.currentKey, true);
  }

  private fadeOutMusic() {
    const playing = this.music;
    this.music = null;
    if (playing && this.context) stopLoop(this.context, playing);
  }

  // ---------------------------------------------------------------- nearby sounds

  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private nearby = new Map<string, NearbyPlaying>();
  private wantedNearby: NearbyLayer[] = [];

  /** Fetch and decode a generated sound once; later calls share the result. Null if it cannot load. */
  loadSound(url: string): Promise<AudioBuffer | null> {
    const cached = this.decoded.get(url);
    if (cached) return cached;
    const context = this.ensureContext();
    if (!context) return Promise.resolve(null);
    const loading = fetch(url, { credentials: remoteBackend ? "include" : "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`sound ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch(() => {
        this.decoded.delete(url); // a later request may try again
        return null;
      });
    this.decoded.set(url, loading);
    return loading;
  }

  /**
   * Play these nearby sounds quietly under the music and ambience, replacing the previous set.
   * Layers already playing with the same takes carry on undisturbed; only their level follows
   * the player's volume for them.
   */
  setNearby(layers: NearbyLayer[]) {
    this.wantedNearby = layers;
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const wanted = new Map(layers.filter((layer) => layer.takes.length).map((layer) => [layer.id, layer]));
    for (const [id, playing] of this.nearby) {
      const layer = wanted.get(id);
      if (layer?.signature !== playing.signature) this.stopNearbyLayer(id);
      else playing.volume.gain.setTargetAtTime(clampVolume(layer.volume), context.currentTime, 0.1);
    }
    for (const layer of wanted.values()) {
      if (this.nearby.has(layer.id)) continue;
      const volume = context.createGain();
      volume.gain.value = clampVolume(layer.volume);
      volume.connect(this.master);
      const playing: NearbyPlaying = { signature: layer.signature, loop: null, timer: undefined, volume };
      this.nearby.set(layer.id, playing);
      if (layer.kind === "loop") playing.loop = startLoop(context, volume, layer.takes, NEARBY_TARGET_RMS);
      else this.scheduleOneShot(layer, playing, between(6, 20));
    }
  }

  /** What is playing now, for checks: layer id, its takes, and the player's level for it. */
  nearbyPlaying(): { id: string; signature: string; looping: boolean; volume: number }[] {
    return [...this.nearby.entries()].map(([id, playing]) => ({
      id, signature: playing.signature, looping: playing.loop !== null, volume: playing.volume.gain.value,
    }));
  }

  /** A one-off sound (an owl, bats) now and then, from a random side. */
  private scheduleOneShot(layer: NearbyLayer, playing: NearbyPlaying, afterSeconds: number) {
    playing.timer = window.setTimeout(() => {
      const context = this.context;
      if (this.nearby.get(layer.id) !== playing || !context || !this.master || !this.enabled) return;
      const take = layer.takes[Math.floor(Math.random() * layer.takes.length)];
      const { start, length, level } = soundingRegion(take, { target: NEARBY_TARGET_RMS * 1.2, minSeconds: 0 });
      const duration = Math.min(length, 12);
      const now = context.currentTime + 0.05;
      const source = context.createBufferSource();
      source.buffer = take;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(level, now, 0.15);
      gain.gain.setTargetAtTime(0, now + Math.max(0.2, duration - 0.8), 0.25);
      const pan = context.createStereoPanner();
      pan.pan.value = between(-0.7, 0.7);
      source.connect(gain).connect(pan).connect(playing.volume);
      source.start(now, start, duration);
      source.onended = () => {
        gain.disconnect();
        pan.disconnect();
      };
      this.scheduleOneShot(layer, playing, duration + between(20, 60));
    }, afterSeconds * 1000);
  }

  private stopNearbyLayer(id: string) {
    const playing = this.nearby.get(id);
    this.nearby.delete(id);
    if (!playing) return;
    window.clearTimeout(playing.timer);
    if (playing.loop && this.context) stopLoop(this.context, playing.loop);
    // A one-off may still be ringing out; release the level control once everything has faded.
    window.setTimeout(() => playing.volume.disconnect(), playing.loop ? 4600 : 13000);
  }

  private stopAllNearby() {
    for (const id of [...this.nearby.keys()]) this.stopNearbyLayer(id);
  }

  // ---------------------------------------------------------------- synthesized ambience

  playAmbience(key: string, force = false) {
    if (!force && key === this.currentKey && this.activeNodes.length) return;
    this.currentKey = key;
    if (!this.enabled) return;
    if (this.music) return; // composed music is playing; the ambience returns when it stops
    const context = this.ensureContext();
    if (!context || !this.master) return;
    this.stopAmbience();
    const preset = PRESETS[key] ?? PRESETS.forest_night;
    const now = context.currentTime;

    // Everything plays into one bus, heard directly and through the hall.
    const bus = context.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, now, 2.5);
    const dry = context.createGain();
    dry.gain.value = 0.75;
    const wet = context.createGain();
    wet.gain.value = 0.55;
    const reverb = context.createConvolver();
    reverb.buffer = this.hall(context);
    bus.connect(dry).connect(this.master);
    bus.connect(reverb).connect(wet).connect(this.master);
    this.activeNodes.push(bus, wet);

    // The pad: each chord tone is two gently detuned voices, swelling on its own slow cycle.
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = preset.warmth;
    tone.Q.value = 0.3;
    tone.connect(bus);
    preset.chord.forEach((frequency, index) => {
      // Higher voices sit further back, so the chord stays soft at the top.
      const level = preset.padGain / (1 + index * 0.45);
      const voice = context.createGain();
      voice.gain.value = level * 0.6;
      const swell = context.createOscillator();
      swell.frequency.value = 1 / (preset.swell * between(0.75, 1.35));
      const depth = context.createGain();
      depth.gain.value = level * 0.4;
      swell.connect(depth).connect(voice.gain);
      swell.start(now);
      voice.connect(tone);
      this.activeNodes.push(swell);
      for (const [type, cents, share] of [["sine", -3, 1], ["triangle", 3, 0.35]] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        oscillator.detune.value = cents;
        const part = context.createGain();
        part.gain.value = share;
        oscillator.connect(part).connect(voice);
        oscillator.start(now);
        this.activeNodes.push(oscillator);
      }
    });

    // The air: a narrow band of soft noise that rises and falls like slow breath.
    const air = context.createBufferSource();
    air.buffer = this.air(context);
    air.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = preset.airTone;
    band.Q.value = 0.7;
    const floor = context.createBiquadFilter();
    floor.type = "highpass";
    floor.frequency.value = 180;
    const airGain = context.createGain();
    airGain.gain.value = preset.airGain * 0.65;
    const gust = context.createOscillator();
    gust.frequency.value = 1 / between(11, 17);
    const gustDepth = context.createGain();
    gustDepth.gain.value = preset.airGain * 0.35;
    gust.connect(gustDepth).connect(airGain.gain);
    air.connect(band).connect(floor).connect(airGain).connect(bus);
    air.start(now, Math.random() * 5);
    gust.start(now);
    this.activeNodes.push(air, gust);

    // Sparse notes at uneven intervals, never the same one twice in a row.
    const motif = preset.motif;
    if (motif) {
      const session = this.session;
      let previous = -1;
      const next = () => {
        if (session !== this.session || !this.enabled) return;
        let pick = Math.floor(Math.random() * motif.notes.length);
        if (pick === previous) pick = (pick + 1) % motif.notes.length;
        previous = pick;
        this.note(bus, motif.notes[pick], motif.level * between(0.6, 1), motif.attack, motif.decay);
        this.activeTimers.push(window.setTimeout(next, between(motif.everySeconds[0], motif.everySeconds[1]) * 1000));
      };
      this.activeTimers.push(window.setTimeout(next, between(2, motif.everySeconds[0] + 2) * 1000));
    }
  }

  /** One soft sine note with its own attack and fade. */
  private note(destination: AudioNode, frequency: number, level: number, attack: number, decay: number) {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    oscillator.connect(gain).connect(destination);
    oscillator.start(now);
    oscillator.stop(now + attack + decay + 0.1);
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
