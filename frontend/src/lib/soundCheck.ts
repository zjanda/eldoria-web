/**
 * A quick check that a generated nearby sound is what was asked for, run on the decoded audio
 * before it is ever played. The generator sometimes returns a steady hum, a musical loop or near
 * silence instead of drips or chatter; such a take is sent back for a retake with a new seed.
 *
 * Thresholds come from measuring approved and rejected clips (November 2026):
 * - tonal: share of energy in the 3 strongest pitch classes. Approved 0.33 to 0.66; a hum 0.99.
 * - beat: strongest self-similarity of the onset curve at 0.3 to 1.5 s. Approved 0.12 to 0.43;
 *   a looping musical phrase 0.63, a regular whine 0.92.
 * - events: short sharp sounds above 2 kHz per second. Approved drips and bats 10 to 21;
 *   rejected rumbles 0 to 0.4. Only required for "detailed" sounds (drips, wings, insects).
 */

export interface SoundAssessment {
  ok: boolean;
  /** Why a take failed, in plain words; empty when it passed. */
  reason: string;
  measures: { soundingShare: number; tonal: number; beat: number; eventsPerSecond: number };
}

export const LIMITS = { soundingShare: 0.3, tonal: 0.8, beat: 0.6, eventsPerSecond: 1 };
const SOUNDING_DBFS = -60;

/** In-place radix-2 FFT; `real` and `imag` have a power-of-two length. */
function fft(real: Float64Array, imag: Float64Array) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k += 1) {
        const cos = Math.cos(step * k);
        const sin = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = real[b] * cos - imag[b] * sin;
        const ti = real[b] * sin + imag[b] * cos;
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
      }
    }
  }
}

/** Power spectra of windowed frames (`size` samples, every `hop` samples). */
function spectra(samples: Float32Array, size: number, hop: number): Float64Array[] {
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const frames: Float64Array[] = [];
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let start = 0; start + size <= samples.length; start += hop) {
    for (let i = 0; i < size; i += 1) {
      real[i] = samples[start + i] * window[i];
      imag[i] = 0;
    }
    fft(real, imag);
    const power = new Float64Array(size / 2 + 1);
    for (let i = 0; i <= size / 2; i += 1) power[i] = real[i] * real[i] + imag[i] * imag[i] + 1e-18;
    frames.push(power);
  }
  return frames;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Measure a mono take. `detailed` sounds must contain short sharp events. */
export function assessTake(samples: Float32Array, sampleRate: number, detailed: boolean): SoundAssessment {
  // How much of the clip actually sounds (1-second windows above -60 dBFS).
  const seconds = Math.max(1, Math.floor(samples.length / sampleRate));
  let sounding = 0;
  for (let s = 0; s < seconds; s += 1) {
    let sum = 0;
    const from = s * sampleRate;
    const to = Math.min(samples.length, from + sampleRate);
    for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
    const dbfs = 10 * Math.log10(sum / Math.max(1, to - from) + 1e-15);
    if (dbfs > SOUNDING_DBFS) sounding += 1;
  }
  const soundingShare = sounding / seconds;

  // Tonal concentration and beat, from 4096-sample frames.
  const size = 4096;
  const hop = 1024;
  const frames = spectra(samples, size, hop);
  const binHz = sampleRate / size;
  const chroma = new Float64Array(12);
  for (const power of frames) {
    for (let bin = 1; bin < power.length; bin += 1) {
      const hz = bin * binHz;
      if (hz <= 65 || hz >= 2000) continue;
      const pitchClass = ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12) % 12;
      chroma[pitchClass] += power[bin];
    }
  }
  const chromaTotal = chroma.reduce((a, b) => a + b, 0) || 1;
  const tonal = [...chroma].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / chromaTotal;

  const flux: number[] = [];
  for (let f = 1; f < frames.length; f += 1) {
    let rise = 0;
    for (let bin = 0; bin < frames[f].length; bin += 1) {
      const step = Math.sqrt(frames[f][bin]) - Math.sqrt(frames[f - 1][bin]);
      if (step > 0) rise += step;
    }
    flux.push(rise);
  }
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, flux.length);
  const spread = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, flux.length)) || 1;
  const centred = flux.map((value) => (value - mean) / spread);
  const zeroLag = centred.reduce((a, b) => a + b * b, 0) || 1;
  const frameRate = sampleRate / hop;
  let beat = 0;
  for (let lag = Math.floor(0.3 * frameRate); lag <= Math.floor(1.5 * frameRate) && lag < centred.length; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < centred.length; i += 1) sum += centred[i] * centred[i + lag];
    beat = Math.max(beat, sum / zeroLag);
  }

  // Short sharp events above 2 kHz: 10 ms frames rising 12 dB over the clip's median level there.
  const eventHop = Math.round(sampleRate / 100);
  const highLevels: number[] = [];
  const small = spectra(samples, 512, eventHop);
  const firstHighBin = Math.ceil(2000 / (sampleRate / 512));
  for (const power of small) {
    let sum = 0;
    for (let bin = firstHighBin; bin < power.length; bin += 1) sum += power[bin];
    highLevels.push(10 * Math.log10(sum + 1e-15));
  }
  const typical = median(highLevels);
  let events = 0;
  for (let i = 1; i < highLevels.length; i += 1) if (highLevels[i] - typical > 12) events += 1;
  const eventsPerSecond = events / (samples.length / sampleRate);

  const measures = { soundingShare, tonal, beat, eventsPerSecond };
  let reason = "";
  if (soundingShare < LIMITS.soundingShare) reason = "it is nearly silent";
  else if (tonal > LIMITS.tonal) reason = "it is a steady tone or hum";
  else if (beat > LIMITS.beat) reason = "it has a musical beat";
  else if (detailed && eventsPerSecond < LIMITS.eventsPerSecond) reason = "it has none of the short sharp sounds asked for";
  return { ok: reason === "", reason, measures };
}

let worker: Worker | null = null;
let nextRequest = 0;
const waiting = new Map<number, (result: SoundAssessment) => void>();

/**
 * `assessTake` in a background worker (it takes about a second for a 30-second take), falling
 * back to the main thread where workers are unavailable. `samples` is copied, never transferred.
 */
export function assessTakeInBackground(samples: Float32Array, sampleRate: number, detailed: boolean): Promise<SoundAssessment> {
  try {
    if (!worker) {
      worker = new Worker(new URL("./soundCheck.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; result: SoundAssessment }>) => {
        waiting.get(event.data.id)?.(event.data.result);
        waiting.delete(event.data.id);
      };
      // If the worker cannot run, let waiting takes play unchecked rather than never.
      worker.onerror = () => {
        for (const resolve of waiting.values()) resolve({ ok: true, reason: "", measures: { soundingShare: 1, tonal: 0, beat: 0, eventsPerSecond: 0 } });
        waiting.clear();
        worker = null;
      };
    }
    const id = (nextRequest += 1);
    const copy = samples.slice();
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      worker!.postMessage({ id, samples: copy, sampleRate, detailed }, [copy.buffer]);
    });
  } catch {
    return Promise.resolve(assessTake(samples, sampleRate, detailed));
  }
}

/** Mix an AudioBuffer-like object down to mono for `assessTake`. */
export function monoSamples(buffer: { numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array }): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < mono.length; i += 1) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}
