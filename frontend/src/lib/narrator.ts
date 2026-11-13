/**
 * The single narrator voice.
 *
 * Two sources:
 *  - "device": the browser's built-in voices (Web Speech API). Free, offline,
 *    quality depends on the OS (Edge/Windows "Natural" and iOS/macOS premium
 *    voices sound very good).
 *  - "cloud": studio voices synthesised by the backend (only when configured).
 *
 * Speech is queued so a turn's narration and dialogue are read in order.
 */

import { audio } from "./audio";
import { backendFetch, mediaUrl } from "../api/connection";

export type VoiceGender = "female" | "male" | "neutral" | "unknown";
export type VoiceSource = "device" | "cloud";

export interface NarratorVoice {
  id: string;
  label: string;
  gender: VoiceGender;
  source: VoiceSource;
  lang: string;
  description?: string;
  natural?: boolean;
  recommended?: boolean;
  provider?: string;
  /** Device voices only: how the voice sounds (see voiceQuality). */
  quality?: VoiceQuality;
}

export interface NarratorConfig {
  enabled: boolean;
  source: VoiceSource;
  deviceVoiceId: string | null;
  cloudVoiceId: string;
  rate: number;
  pitch: number;
  volume: number;
}

// Web Speech voices do not expose gender, so classify by well-known voice names.
const FEMALE_NAMES = [
  "female", "woman", "zira", "aria", "jenny", "michelle", "sonia", "libby", "natasha", "clara", "emma", "ava",
  "samantha", "karen", "moira", "tessa", "fiona", "victoria", "susan", "hazel", "catherine", "serena", "allison",
  "nicky", "kate", "heera", "joanna", "kendra", "kimberly", "salli", "ivy", "amy", "olivia", "linda", "heather",
  "elsa", "paulina", "amelie", "amélie", "monica", "luciana", "alice", "sara", "ellen", "anna", "nora", "kyoko",
  "yuna", "lekha", "emily", "jane", "nancy", "ana", "maisie", "abbi", "bella", "hollie", "jessa", "ashley", "cora",
  "elizabeth", "jane", "sapna", "neerja", "leah", "luna", "molly", "isabella", "freya", "sienna", "eva", "zoe",
];
const MALE_NAMES = [
  "male", "man", "david", "mark", "guy", "ryan", "thomas", "william", "christopher", "eric", "roger", "steffan",
  "brian", "andrew", "daniel", "alex", "fred", "oliver", "arthur", "gordon", "lee", "rishi", "aaron", "george",
  "james", "richard", "liam", "matthew", "justin", "joey", "tom", "ralph", "albert", "bruce", "reed", "rocko",
  "eddy", "jorge", "diego", "juan", "yuri", "xander", "davis", "tony", "jason", "brandon", "christopher", "connor",
  "elliot", "noah", "prabhat", "ravi", "william", "kenneth", "duncan", "alfie", "jack", "ethan", "hugo", "nathan",
];

function classifyGender(name: string): VoiceGender {
  const lower = name.toLowerCase();
  const tokens = lower.split(/[^a-zà-ÿ]+/).filter(Boolean);
  if (lower.includes("female") || tokens.some((t) => FEMALE_NAMES.includes(t))) return "female";
  if (/\bmale\b/.test(lower) || tokens.some((t) => MALE_NAMES.includes(t))) return "male";
  return "unknown";
}

/**
 * A stable, unique id for a browser voice. `voiceURI` alone is not unique on every browser
 * (several Android and iOS voices share one), so name and language are part of the id.
 */
export function deviceVoiceKey(voice: Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI">): string {
  return `${voice.name}|${voice.lang}|${voice.voiceURI}`;
}

/** The browser's voices without exact duplicates (some browsers list the same voice twice). */
function uniqueDeviceVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const seen = new Set<string>();
  return window.speechSynthesis.getVoices().filter((voice) => {
    const key = deviceVoiceKey(voice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Finds the browser voice for a stored id. Ids saved by older versions were the bare `voiceURI`;
 * those still resolve (to the first voice with that URI) so a player's choice survives the change.
 */
function findDeviceVoice(id: string | null): SpeechSynthesisVoice | null {
  if (!id) return null;
  const voices = uniqueDeviceVoices();
  return voices.find((voice) => deviceVoiceKey(voice) === id) ?? voices.find((voice) => voice.voiceURI === id) ?? null;
}

/** Converts a stored voice id to the current form, or null if no such voice exists here. */
export function migrateDeviceVoiceId(id: string | null): string | null {
  const voice = findDeviceVoice(id);
  return voice ? deviceVoiceKey(voice) : null;
}

/**
 * Android browsers often speak with the phone's own text-to-speech voice whatever voice a page
 * asks for (or honour only its language), so the settings say so there. Not detectable directly.
 */
export function deviceIgnoresVoiceChoice(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent ?? "");
}

/**
 * How a browser voice sounds, judged from its name and address (browsers do not say):
 * - "natural": neural or high-quality voices (Edge "Online (Natural)", Google, Apple enhanced/premium, phones).
 * - "basic": older robotic voices (Windows desktop voices such as David and Zira, Apple compact, eSpeak).
 * - "novelty": joke and character voices (Apple's Zarvox, Bubbles, Junior...), never offered.
 */
export type VoiceQuality = "natural" | "basic" | "novelty";

const NOVELTY_VOICES = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged", "fred", "good news",
  "hysterical", "jester", "junior", "kathy", "organ", "pipe organ", "princess", "ralph", "superstar",
  "trinoids", "whisper", "wobble", "zarvox",
]);

export function voiceQuality(voice: Pick<SpeechSynthesisVoice, "name" | "voiceURI">): VoiceQuality {
  const name = voice.name.toLowerCase();
  const address = (voice.voiceURI ?? "").toLowerCase();
  const baseName = name.replace(/\s*\(.*\)\s*$/, "").trim();
  if (NOVELTY_VOICES.has(baseName)) return "novelty";
  // Apple's old speech-synthesis voices are all robotic except Alex.
  if (address.includes("com.apple.speech.synthesis.voice.") && !address.endsWith(".alex")) return "novelty";
  if (/natural|neural|premium|enhanced|wavenet|studio|journey|siri/.test(name) || /premium|enhanced/.test(address)) return "natural";
  if (/espeak|eloquence|compact/.test(`${name} ${address}`)) return "basic";
  if (name.startsWith("microsoft ") && !name.includes("online")) return "basic";
  return "natural";
}

function friendlyLabel(voice: SpeechSynthesisVoice): string {
  return voice.name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online\s+\(Natural\)/i, " (Natural)")
    .replace(/\s+-\s+English.*$/i, "")
    .trim();
}

/** Split long text into sentence groups; some engines stop after ~15 seconds of one utterance. */
function chunkText(text: string, maxLength = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Best default narrator for a gender preference: English, natural-sounding, matching gender. */
export function pickVoice(voices: NarratorVoice[], gender: "female" | "male"): NarratorVoice | null {
  let best: NarratorVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    let score = 0;
    if (voice.lang.toLowerCase().startsWith("en")) score += 20;
    if (voice.gender === gender) score += 10;
    else if (voice.gender !== "unknown" && voice.gender !== "neutral") score -= 10;
    if (voice.natural) score += 5;
    if (voice.recommended) score += 8;
    if (/en-gb/i.test(voice.lang)) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

type Listener = (speaking: boolean) => void;

/** How one line is spoken, fixed when the line is queued so later setting changes cannot alter it. */
type SpeechSettings = Omit<NarratorConfig, "enabled">;

interface QueuedLine {
  text: string;
  settings: SpeechSettings;
  // Cloud lines start synthesising as soon as they are queued, so playback has no gaps.
  audio: Promise<string | null> | null;
}

/** How long a browser voice may take to start speaking before it is given up on. */
const START_TIMEOUT_MS = 6000;
const NO_ANSWER = "no answer from the voice";

/**
 * The voice to read with when an online voice fails: a voice on the device in the same language
 * (else the browser's default, null). Undefined when the failed voice was already on the device.
 */
function deviceFallbackVoice(failed: SpeechSynthesisVoice | null): SpeechSynthesisVoice | null | undefined {
  if (!failed || failed.localService) return undefined;
  const local = uniqueDeviceVoices().filter((voice) => voice.localService && voiceQuality(voice) !== "novelty");
  const language = failed.lang.toLowerCase();
  return (
    local.find((voice) => voice.lang.toLowerCase() === language) ??
    local.find((voice) => voice.lang.toLowerCase().slice(0, 2) === language.slice(0, 2)) ??
    null
  );
}

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export class Narrator {
  private config: NarratorConfig = {
    enabled: false,
    source: "device",
    deviceVoiceId: null,
    cloudVoiceId: "",
    rate: 1,
    pitch: 1,
    volume: 1,
  };
  private queue: QueuedLine[] = [];
  private generation = 0;
  /** Generation whose queue is being read (or about to be), so only one reader runs at a time. */
  private activeDrain: number | null = null;
  private speaking = false;
  private currentAudio: HTMLAudioElement | null = null;
  // Held so the browser cannot garbage-collect an utterance mid-speech (which silently ends it in Chromium).
  private liveUtterance: SpeechSynthesisUtterance | null = null;
  /** Resolves once the most recent utterance has ended or reported its cancellation. */
  private liveUtteranceDone: Promise<void> = Promise.resolve();
  private listeners = new Set<Listener>();
  private unlocked = false;
  /** How long a voice may take to start before it counts as failed (tests shorten it). */
  startTimeoutMs = START_TIMEOUT_MS;

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  configure(config: NarratorConfig) {
    const wasEnabled = this.config.enabled;
    this.config = config;
    if (wasEnabled && !config.enabled) this.stop();
    if (this.currentAudio) this.currentAudio.volume = config.volume;
  }

  onSpeakingChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSpeaking(value: boolean) {
    if (this.speaking === value) return;
    this.speaking = value;
    try {
      audio.setDucked(value);
    } catch (error) {
      console.warn("Could not lower the music for the narrator:", error); // never let it stop the voice
    }
    this.listeners.forEach((listener) => listener(value));
  }

  /** Must run inside a user gesture once, so mobile browsers allow later speech. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      if (this.supported) {
        const silent = new SpeechSynthesisUtterance(" ");
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
      const element = new Audio();
      element.muted = true;
      void element.play().catch(() => undefined);
    } catch {
      /* best effort */
    }
  }

  /**
   * The browser's voices worth offering: only natural-sounding ones when there are any, otherwise
   * the basic ones (so the narrator still works). Novelty voices are never offered.
   */
  deviceVoices(): NarratorVoice[] {
    if (!this.supported) return [];
    const voices = uniqueDeviceVoices()
      .map((voice) => ({ voice, quality: voiceQuality(voice) }))
      .filter(({ quality }) => quality !== "novelty");
    const best = voices.some(({ quality }) => quality === "natural") ? voices.filter(({ quality }) => quality === "natural") : voices;
    return best.map(({ voice, quality }) => ({
      id: deviceVoiceKey(voice),
      label: friendlyLabel(voice),
      gender: classifyGender(voice.name),
      source: "device" as const,
      lang: voice.lang,
      natural: /natural|neural|premium|enhanced/i.test(voice.name),
      quality,
    }));
  }

  /** Resolves once the browser has loaded its voice list (it loads asynchronously). */
  loadDeviceVoices(): Promise<NarratorVoice[]> {
    return new Promise((resolve) => {
      if (!this.supported) return resolve([]);
      const voices = this.deviceVoices();
      if (voices.length) return resolve(voices);
      const done = () => resolve(this.deviceVoices());
      window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      window.setTimeout(done, 1500);
    });
  }

  stop() {
    this.generation += 1;
    this.queue = [];
    this.activeDrain = null;
    if (this.supported) window.speechSynthesis.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.setSpeaking(false);
  }

  /** Queue lines to be read after anything already queued, with the current settings. */
  enqueue(lines: string[]) {
    if (!this.config.enabled) return;
    const cleaned = lines.map((line) => line.trim()).filter(Boolean);
    if (!cleaned.length) return;
    const settings = this.currentSettings();
    this.queue.push(...cleaned.map((text) => this.queueItem(text, settings)));
    if (this.activeDrain !== this.generation) void this.drain(this.generation);
  }

  /**
   * Interrupt and read this text now (replay buttons, voice previews). `overrides` apply to this
   * line only; the narrator's own settings are never changed, so nothing has to be restored.
   */
  speakNow(text: string, overrides?: Partial<NarratorConfig>) {
    this.stop();
    const generation = this.generation;
    this.queue.push(this.queueItem(text, { ...this.currentSettings(), ...overrides }));
    this.activeDrain = generation;
    this.setSpeaking(true);
    // Speech queued before the cancelled utterance has finished can be dropped or spoken with the
    // wrong voice in Chromium, so wait for it to end (at most 400 ms) and at least 60 ms.
    const cancelled = Promise.race([this.liveUtteranceDone, delay(400)]);
    void Promise.all([cancelled, delay(60)]).then(() => {
      if (generation === this.generation) void this.drain(generation);
    });
  }

  private currentSettings(): SpeechSettings {
    const { enabled: _enabled, ...settings } = this.config;
    return settings;
  }

  private async drain(generation: number) {
    this.activeDrain = generation;
    this.setSpeaking(true);
    while (this.queue.length && generation === this.generation) {
      const item = this.queue.shift()!;
      try {
        const url = item.audio ? await item.audio : null;
        if (url) await this.playAudio(url, item.settings, generation);
        // Device voice is the fallback if an AI voice line could not be generated.
        else if (generation === this.generation) await this.speakDevice(item.text, item.settings, generation);
      } catch (error) {
        console.warn("Narrator could not speak:", error);
      }
    }
    if (generation === this.generation) {
      this.activeDrain = null;
      this.setSpeaking(false);
    }
  }

  /**
   * Reads text with a browser voice, one chunk at a time. Online voices (Edge "Natural") can fail or
   * hang when their service does not answer, which used to leave the narrator silent. A chunk that
   * fails is tried once more, then read with a voice on the device for the rest of the line.
   */
  private speakDevice(text: string, settings: SpeechSettings, generation: number): Promise<void> {
    if (!this.supported) return Promise.resolve();
    const synth = window.speechSynthesis;
    let voice = findDeviceVoice(settings.deviceVoiceId);
    const chunks = chunkText(text);
    return new Promise((resolve) => {
      let index = 0;
      let retried = false;
      const say = (chunk: string) => {
        if (generation !== this.generation) return resolve();
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.rate = settings.rate;
        utterance.pitch = settings.pitch;
        utterance.volume = settings.volume;
        let markDone: () => void = () => undefined;
        this.liveUtteranceDone = new Promise<void>((done) => (markDone = done));
        this.liveUtterance = utterance;
        let finished = false;
        let started = false;
        const finish = (failure: string | null) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(watchdog);
          if (this.liveUtterance === utterance) this.liveUtterance = null;
          markDone();
          if (failure && generation === this.generation) {
            // A voice that never answered is not worth waiting for twice.
            const switching = retried || failure === NO_ANSWER;
            const fallback = switching ? deviceFallbackVoice(voice) : voice;
            if (fallback !== undefined) {
              console.warn(`Narrator voice ${voice?.name ?? "(default)"} failed (${failure}); ${switching ? `using ${fallback?.name ?? "the default voice"}` : "trying again"}.`);
              voice = fallback;
              retried = true;
              return say(chunk);
            }
            console.warn(`Narrator could not read a line (${failure}).`);
          }
          retried = false;
          next();
        };
        utterance.onstart = () => {
          started = true;
          window.clearTimeout(watchdog);
        };
        utterance.onend = () => finish(null);
        utterance.onerror = (event: SpeechSynthesisErrorEvent) =>
          finish(event.error === "interrupted" || event.error === "canceled" ? null : event.error || "error");
        // An online voice whose service never answers neither starts nor fails; give up on it.
        const watchdog = window.setTimeout(() => {
          if (started || finished) return;
          synth.cancel();
          finish(NO_ANSWER);
        }, this.startTimeoutMs);
        synth.speak(utterance);
      };
      const next = () => {
        if (generation !== this.generation || index >= chunks.length) return resolve();
        say(chunks[index++]);
      };
      next();
    });
  }

  private queueItem(text: string, settings: SpeechSettings): QueuedLine {
    const cloud = settings.source === "cloud" && settings.cloudVoiceId;
    return { text, settings, audio: cloud ? this.fetchAudio(text, settings.cloudVoiceId) : null };
  }

  private async fetchAudio(text: string, voiceId: string): Promise<string | null> {
    try {
      const response = await backendFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voiceId }),
      });
      if (!response.ok) throw new Error(`AI voice failed (${response.status})`);
      return mediaUrl(((await response.json()) as { url: string }).url);
    } catch (error) {
      console.warn("Narrator AI voice unavailable, using device voice:", error);
      return null;
    }
  }

  private async playAudio(url: string, settings: SpeechSettings, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    await new Promise<void>((resolve) => {
      const element = new Audio(url);
      element.volume = settings.volume;
      element.playbackRate = settings.rate;
      this.currentAudio = element;
      element.onended = () => resolve();
      element.onerror = () => resolve();
      element.play().catch(() => resolve());
    });
    this.currentAudio = null;
  }
}

export const narrator = new Narrator();
