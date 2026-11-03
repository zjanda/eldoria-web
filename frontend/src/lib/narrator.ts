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

class Narrator {
  private config: NarratorConfig = {
    enabled: false,
    source: "device",
    deviceVoiceId: null,
    cloudVoiceId: "",
    rate: 1,
    pitch: 1,
    volume: 1,
  };
  // Cloud lines start synthesising as soon as they are queued, so playback has no gaps.
  private queue: { text: string; audio: Promise<string | null> | null }[] = [];
  private generation = 0;
  private speaking = false;
  private currentAudio: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private unlocked = false;

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
    audio.setDucked(value);
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

  deviceVoices(): NarratorVoice[] {
    if (!this.supported) return [];
    return window.speechSynthesis.getVoices().map((voice) => ({
      id: voice.voiceURI,
      label: friendlyLabel(voice),
      gender: classifyGender(voice.name),
      source: "device" as const,
      lang: voice.lang,
      natural: /natural|neural|premium|enhanced/i.test(voice.name),
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
    if (this.supported) window.speechSynthesis.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.setSpeaking(false);
  }

  /** Queue lines to be read after anything already queued. */
  enqueue(lines: string[]) {
    if (!this.config.enabled) return;
    const cleaned = lines.map((line) => line.trim()).filter(Boolean);
    if (!cleaned.length) return;
    this.queue.push(...cleaned.map((text) => this.queueItem(text)));
    if (!this.speaking) void this.drain(this.generation);
  }

  /** Interrupt and read this text now (replay buttons, voice previews). */
  speakNow(text: string, overrides?: Partial<NarratorConfig>) {
    this.stop();
    const previous = this.config;
    if (overrides) this.config = { ...this.config, ...overrides, enabled: true };
    this.queue.push(this.queueItem(text));
    const generation = this.generation;
    // Chrome can silently drop an utterance queued in the same tick as cancel().
    window.setTimeout(() => {
      void this.drain(generation).finally(() => {
        if (overrides) this.config = previous;
      });
    }, 60);
  }

  private async drain(generation: number) {
    this.setSpeaking(true);
    while (this.queue.length && generation === this.generation) {
      const item = this.queue.shift()!;
      try {
        const url = item.audio ? await item.audio : null;
        if (url) await this.playAudio(url, generation);
        // Device voice is the fallback if an AI voice line could not be generated.
        else if (generation === this.generation) await this.speakDevice(item.text, generation);
      } catch (error) {
        console.warn("Narrator could not speak:", error);
      }
    }
    if (generation === this.generation) this.setSpeaking(false);
  }

  private speakDevice(text: string, generation: number): Promise<void> {
    if (!this.supported) return Promise.resolve();
    const synth = window.speechSynthesis;
    const voice = synth.getVoices().find((v) => v.voiceURI === this.config.deviceVoiceId) ?? null;
    const chunks = chunkText(text);
    return new Promise((resolve) => {
      let index = 0;
      const next = () => {
        if (generation !== this.generation || index >= chunks.length) return resolve();
        const utterance = new SpeechSynthesisUtterance(chunks[index++]);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.rate = this.config.rate;
        utterance.pitch = this.config.pitch;
        utterance.volume = this.config.volume;
        utterance.onend = next;
        utterance.onerror = next;
        synth.speak(utterance);
      };
      next();
    });
  }

  private queueItem(text: string) {
    const cloud = this.config.source === "cloud" && this.config.cloudVoiceId;
    return { text, audio: cloud ? this.fetchAudio(text, this.config.cloudVoiceId) : null };
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

  private async playAudio(url: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    await new Promise<void>((resolve) => {
      const element = new Audio(url);
      element.volume = this.config.volume;
      element.playbackRate = this.config.rate;
      this.currentAudio = element;
      element.onended = () => resolve();
      element.onerror = () => resolve();
      element.play().catch(() => resolve());
    });
    this.currentAudio = null;
  }
}

export const narrator = new Narrator();
