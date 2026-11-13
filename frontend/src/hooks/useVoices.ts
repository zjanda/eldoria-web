import { useEffect, useState } from "react";
import { api } from "../api/client";
import { migrateDeviceVoiceId, narrator, pickVoice, type NarratorVoice } from "../lib/narrator";
import type { Settings } from "./useSettings";

export interface VoiceOptions {
  deviceVoices: NarratorVoice[];
  cloudVoices: NarratorVoice[];
  cloudAvailable: boolean;
}

/** Loads device + cloud voice catalogues and keeps a sensible narrator voice selected. */
export function useVoices(settings: Settings, update: (patch: Partial<Settings>) => void): VoiceOptions {
  const [deviceVoices, setDeviceVoices] = useState<NarratorVoice[]>([]);
  const [cloudVoices, setCloudVoices] = useState<NarratorVoice[]>([]);
  const [cloudAvailable, setCloudAvailable] = useState(false);

  useEffect(() => {
    narrator.loadDeviceVoices().then(setDeviceVoices);
    api
      .voices()
      .then((catalog) => {
        setCloudAvailable(catalog.cloud_available);
        setCloudVoices(
          catalog.voices.map((v) => ({
            id: v.id,
            label: v.label,
            gender: v.gender,
            source: "cloud",
            lang: "en",
            description: v.description,
            provider: v.provider,
            recommended: v.recommended,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!deviceVoices.length) return;
    if (!settings.deviceVoiceId || !deviceVoices.some((v) => v.id === settings.deviceVoiceId)) {
      // A choice saved by an older version (a bare voiceURI) keeps its voice under the new id form.
      const migrated = migrateDeviceVoiceId(settings.deviceVoiceId);
      if (migrated) return update({ deviceVoiceId: migrated });
      const pick = pickVoice(deviceVoices, settings.voiceGender);
      if (pick) update({ deviceVoiceId: pick.id });
    }
  }, [deviceVoices]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI voices are the default narrator whenever the server offers them.
  useEffect(() => {
    if (!cloudVoices.length) return;
    const patch: Partial<Settings> = {};
    if (!settings.narratorSourceChosen && settings.narratorSource !== "cloud") patch.narratorSource = "cloud";
    if (!cloudVoices.some((v) => v.id === settings.cloudVoiceId)) {
      const pick = pickVoice(cloudVoices, settings.voiceGender);
      if (pick) patch.cloudVoiceId = pick.id;
    }
    if (Object.keys(patch).length) update(patch);
  }, [cloudVoices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Fall back to device voices if AI voices were chosen but are not configured.
    if (settings.narratorSource === "cloud" && !cloudAvailable && cloudVoices.length === 0) {
      const timer = window.setTimeout(() => update({ narratorSource: "device" }), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [settings.narratorSource, cloudAvailable, cloudVoices.length, update]);

  return { deviceVoices, cloudVoices, cloudAvailable };
}
