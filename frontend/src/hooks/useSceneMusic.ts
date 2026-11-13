import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { mediaUrl } from "../api/connection";
import type { Adventure, ImageReference } from "../api/types";
import { audio } from "../lib/audio";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 100;

export type MusicStatus = "unavailable" | "off" | "composing" | "playing" | "failed";

export interface SceneMusic {
  status: MusicStatus;
  /** The player's words that shaped the current track, if any. */
  direction: string;
  /** Ask for a different piece for this moment, optionally steered by a description. */
  composeAnother: (direction: string) => Promise<void>;
}

/**
 * Plays the generated track that fits the current moment of the tale.
 *
 * The server works out which track fits and whether it exists. A track is composed only when this
 * hook asks for it, which it does only while the player has music switched on. Until a track is
 * ready, and whenever music is off or unavailable, the synthesized ambience plays instead.
 */
export function useSceneMusic(adventure: Adventure, wanted: boolean): SceneMusic {
  const available = Boolean(adventure.music_enabled);
  const active = available && wanted;
  const fromState = adventure.scene.music ?? null;
  // A track asked for here is newer than the adventure in hand until the next turn brings it along.
  const [override, setOverride] = useState<{ replaces: string | null; reference: ImageReference; direction: string } | null>(null);
  const stale = override !== null && override.replaces !== (fromState?.cache_key ?? null) && override.reference.cache_key !== fromState?.cache_key;
  const current = override && !stale ? override.reference : fromState;
  const [reference, setReference] = useState<ImageReference | null>(current);
  const requested = useRef(new Set<string>());
  const key = current?.cache_key ?? null;
  const adventureId = adventure.adventure_id;

  useEffect(() => {
    if (stale) setOverride(null);
  }, [stale]);

  // A save loaded before music existed (or before its first turn) names no track yet: ask for one.
  const sceneId = adventure.scene.scene_id;
  useEffect(() => {
    const marker = `unnamed:${adventureId}:${sceneId}`;
    if (!active || current || requested.current.has(marker)) return;
    requested.current.add(marker);
    // Deliberately not cancelled on cleanup: the request is made once, and its answer is wanted
    // even if React re-ran this effect in between (as development mode does).
    api.music(adventureId, false, "")
      .then((view) => {
        if (view.scene.music) setOverride({ replaces: null, reference: view.scene.music, direction: view.scene.music_direction ?? "" });
      })
      .catch(() => requested.current.delete(marker));
  }, [active, current === null, adventureId, sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReference(current);
    if (!active || !key || !current) return;
    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    const poll = async () => {
      try {
        const next = await api.musicStatus(key);
        if (cancelled) return;
        setReference(next);
        // "fallback" here means the request below has not reached the server yet: keep waiting.
        if (next.status === "ready" || next.status === "failed" || ++polls >= MAX_POLLS) return;
      } catch {
        if (cancelled || ++polls >= MAX_POLLS) return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    if (current.status === "fallback" && !requested.current.has(key)) {
      // Nobody has asked for this place's music yet: ask once. The polling below picks up the result.
      requested.current.add(key);
      api.music(adventureId, false, "").catch(() => requested.current.delete(key));
    }
    if (current.status === "fallback" || current.status === "pending") {
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, key, current?.status, adventureId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = active && reference?.cache_key === key && reference?.status === "ready" && reference.url ? mediaUrl(reference.url) : null;
  useEffect(() => {
    if (ready) void audio.playMusic(ready);
    else audio.stopMusic();
  }, [ready]);
  useEffect(() => () => audio.stopMusic(), []);

  const composeAnother = useCallback(
    async (direction: string) => {
      const view = await api.music(adventureId, true, direction);
      if (view.scene.music) setOverride({ replaces: key, reference: view.scene.music, direction: view.scene.music_direction ?? "" });
    },
    [adventureId, key],
  );

  const status: MusicStatus = !available ? "unavailable" : !wanted ? "off" : ready ? "playing" : reference?.status === "failed" ? "failed" : "composing";
  return { status, direction: override && !stale ? override.direction : adventure.scene.music_direction ?? "", composeAnother };
}
