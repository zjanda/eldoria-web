import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { mediaUrl } from "../api/connection";
import type { Adventure, ImageReference, SoundLayer } from "../api/types";
import { audio, type NearbyLayer } from "../lib/audio";
import { assessTakeInBackground, monoSamples } from "../lib/soundCheck";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 100;

export type NearbyLayerStatus = "making" | "checking" | "playing" | "failed";

export interface NearbySoundStatus {
  id: string;
  label: string;
  status: NearbyLayerStatus;
  /** The player's words for their own version, if any. */
  direction: string;
}

export interface NearbySounds {
  status: "unavailable" | "off" | "active";
  layers: NearbySoundStatus[];
  /** Make the player's own version of one of the scene's sounds, steered by their words. */
  makeAgain: (layerId: string, direction: string) => Promise<void>;
}

/** What the check decided about a downloaded take. */
type Verdict = { url: string; buffer: AudioBuffer | null; ok: boolean };

/**
 * Plays the generated nearby sounds of the current scene (tavern murmur, cave drips, bats).
 *
 * The server chooses the sounds. They are generated only when this hook asks, which it does only
 * while the player has nearby sounds switched on. Each new take is measured before it is played;
 * a take that fails (a hum where drips were wanted) is sent back once for a retake with a new seed.
 */
export function useNearbySounds(adventure: Adventure, wanted: boolean, volumes: Record<string, number> = {}): NearbySounds {
  const available = Boolean(adventure.sounds_enabled);
  const active = available && wanted;
  const adventureId = adventure.adventure_id;
  // Layers returned by our own requests are newer than the adventure in hand until the next turn.
  const [override, setOverride] = useState<{ basis: string; layers: SoundLayer[] } | null>(null);
  const fromState = adventure.scene.sounds ?? null;
  const basis = JSON.stringify((fromState ?? []).map((layer) => [layer.id, layer.takes.map((take) => take.cache_key)]));
  const layers = override && override.basis === basis ? override.layers : fromState ?? [];
  const [references, setReferences] = useState<Record<string, ImageReference>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const requested = useRef(new Set<string>());
  const reported = useRef(new Set<string>());

  const keys = layers.flatMap((layer) => layer.takes.map((take) => take.cache_key));
  const keysSignature = keys.join(",");
  const current = (take: ImageReference) => {
    const latest = references[take.cache_key];
    return latest ?? take;
  };

  // Ask the server to make whatever the scene still lacks, once per set of sounds. A save opened
  // before nearby sounds existed (or before its first turn) names none yet: ask once for it too.
  const sceneId = adventure.scene.scene_id;
  useEffect(() => {
    if (!active) return;
    const unnamed = fromState === null && override === null;
    const missing = unnamed || layers.some((layer) => layer.takes.some((take) => current(take).status === "fallback"));
    const marker = unnamed ? `unnamed:${adventureId}:${sceneId}` : `${adventureId}:${keysSignature}`;
    if (!missing || requested.current.has(marker)) return;
    requested.current.add(marker);
    // Deliberately not cancelled on cleanup: the request is made once, and its answer is wanted
    // even if React re-ran this effect in between (as development mode does).
    api.sounds(adventureId)
      .then((view) => {
        if (view.scene.sounds) setOverride({ basis, layers: view.scene.sounds });
      })
      .catch(() => requested.current.delete(marker));
  }, [active, adventureId, sceneId, keysSignature, fromState === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll takes that are being made.
  const waiting = layers.flatMap((layer) => layer.takes).filter((take) => ["fallback", "pending"].includes(current(take).status));
  const waitingSignature = waiting.map((take) => take.cache_key).join(",");
  useEffect(() => {
    if (!active || !waiting.length) return;
    let cancelled = false;
    let polls = 0;
    let timer: number | undefined;
    const poll = async () => {
      const updates: Record<string, ImageReference> = {};
      await Promise.all(
        waiting.map(async (take) => {
          try {
            updates[take.cache_key] = await api.soundStatus(take.cache_key);
          } catch {
            /* try again next time */
          }
        }),
      );
      if (cancelled) return;
      setReferences((previous) => ({ ...previous, ...updates }));
      const stillWaiting = Object.values(updates).some((reference) => reference.status === "pending" || reference.status === "fallback");
      if ((stillWaiting || Object.keys(updates).length < waiting.length) && ++polls < MAX_POLLS) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, waitingSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Download, check and, when a take fails, ask for a retake.
  const readyTakes = layers.flatMap((layer) =>
    layer.takes.map((take) => ({ layer, take: current(take) })).filter(({ take }) => take.status === "ready" && take.url),
  );
  const readySignature = readyTakes.map(({ take }) => take.url).join(",");
  useEffect(() => {
    if (!active) return;
    for (const { layer, take } of readyTakes) {
      const url = mediaUrl(take.url!);
      if (verdicts[url]) continue;
      void audio.loadSound(url).then(async (buffer) => {
        if (!buffer) return;
        const result = await assessTakeInBackground(monoSamples(buffer), buffer.sampleRate, layer.detailed);
        const retake = !result.ok && !reported.current.has(take.url!);
        setVerdicts((previous) => ({ ...previous, [url]: { url, buffer, ok: result.ok || !retake } }));
        if (!retake) return;
        reported.current.add(take.url!);
        console.info(`Nearby sound "${layer.label}" failed its check (${result.reason}); asking for a retake.`);
        api.soundRetake(take.cache_key, take.url!)
          .then((reference) => {
            // Out of tries: the server keeps this take, so play it rather than nothing.
            if (reference.url === take.url) setVerdicts((previous) => ({ ...previous, [url]: { url, buffer, ok: true } }));
            setReferences((previous) => ({ ...previous, [take.cache_key]: reference }));
          })
          .catch(() => setVerdicts((previous) => ({ ...previous, [url]: { url, buffer, ok: true } })));
      });
    }
  }, [active, readySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand the usable takes to the audio engine.
  const playable: NearbyLayer[] = [];
  const statuses: NearbySoundStatus[] = [];
  for (const layer of layers) {
    const takes = layer.takes.map(current);
    const usable = takes
      .filter((take) => take.status === "ready" && take.url)
      .map((take) => verdicts[mediaUrl(take.url!)])
      .filter((verdict): verdict is Verdict => Boolean(verdict?.ok && verdict.buffer));
    if (usable.length) {
      playable.push({
        id: layer.id, kind: layer.kind, takes: usable.map((verdict) => verdict.buffer!),
        signature: usable.map((verdict) => verdict.url).join("|"), volume: volumes[layer.id] ?? 1,
      });
    }
    const status: NearbyLayerStatus = usable.length
      ? "playing"
      : takes.every((take) => take.status === "failed")
        ? "failed"
        : takes.some((take) => take.status === "ready")
          ? "checking"
          : "making";
    statuses.push({ id: layer.id, label: layer.label, status, direction: layer.direction });
  }
  const playableSignature = active ? playable.map((layer) => `${layer.id}=${layer.signature}@${layer.volume}`).join(";") : "";
  useEffect(() => {
    audio.setNearby(active ? playable : []);
  }, [playableSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => audio.setNearby([]), []);

  const makeAgain = useCallback(
    async (layerId: string, direction: string) => {
      const view = await api.sounds(adventureId, layerId, direction);
      if (view.scene.sounds) setOverride({ basis, layers: view.scene.sounds });
    },
    [adventureId, basis],
  );

  return { status: !available ? "unavailable" : !wanted ? "off" : "active", layers: statuses, makeAgain };
}
