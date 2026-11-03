import { useCallback, useEffect, useState } from "react";
import { audio } from "../lib/audio";
import { narrator, type VoiceSource } from "../lib/narrator";

export type TextSpeed = "cinematic" | "fast" | "instant";
export type TextSize = "small" | "medium" | "large";
export type VoiceGenderPreference = "female" | "male";

export interface Settings {
  // Narrator voice
  narratorEnabled: boolean;
  narratorSource: VoiceSource;
  /** True once the player picks a source themselves; until then AI voices are preferred. */
  narratorSourceChosen: boolean;
  voiceGender: VoiceGenderPreference;
  deviceVoiceId: string | null;
  cloudVoiceId: string;
  narratorRate: number;
  narratorPitch: number;
  narratorVolume: number;
  readDialogue: boolean;
  // Reading
  textSpeed: TextSpeed;
  textSize: TextSize;
  showTurnRecap: boolean;
  // Sound
  audioEnabled: boolean;
  volume: number;
  // Display & gameplay
  diceAnimations: boolean;
  reduceMotion: boolean;
}

const STORAGE_KEY = "eldoria.settings.v1";
// One-time migration: the narrator used to default to on; switch it off once for existing players.
const NARRATOR_OFF_MIGRATION_KEY = "eldoria.migrations.narratorOff";
export const DEFAULT_SETTINGS: Settings = {
  narratorEnabled: false,
  narratorSource: "device",
  narratorSourceChosen: false,
  voiceGender: "male",
  deviceVoiceId: null,
  cloudVoiceId: "",
  narratorRate: 0.95,
  narratorPitch: 1,
  narratorVolume: 1,
  readDialogue: true,
  textSpeed: "cinematic",
  textSize: "medium",
  showTurnRecap: true,
  audioEnabled: true,
  volume: 0.6,
  diceAnimations: true,
  reduceMotion: false,
};

/** Runs once at module load (not inside React, whose dev mode double-invokes initialisers). */
function migrateNarratorOff() {
  try {
    if (window.localStorage.getItem(NARRATOR_OFF_MIGRATION_KEY)) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(raw), narratorEnabled: false }));
    window.localStorage.setItem(NARRATOR_OFF_MIGRATION_KEY, "1");
  } catch {
    /* storage unavailable: defaults already have the narrator off */
  }
}
migrateNarratorOff();

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings stay in memory */
    }
    audio.setVolume(settings.volume);
    narrator.configure({
      enabled: settings.narratorEnabled,
      source: settings.narratorSource,
      deviceVoiceId: settings.deviceVoiceId,
      cloudVoiceId: settings.cloudVoiceId,
      rate: settings.narratorRate,
      pitch: settings.narratorPitch,
      volume: settings.narratorVolume,
    });
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  return { settings, update, reset };
}
