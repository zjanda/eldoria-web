import { useEffect, useState } from "react";
import { api } from "../api/client";
import { mediaUrl } from "../api/connection";
import type { ImageReference } from "../api/types";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 60;
const cache = new Map<string, ImageReference>();

/**
 * Resolves a cached image key to a URL, polling while generation is pending.
 * Returns null whenever fallback artwork should be shown.
 */
export function useImageUrl(key: string | null | undefined, initial?: ImageReference | null): string | null {
  const reference = useImageReference(key, initial);
  return reference?.status === "ready" ? reference.url : null;
}

/** Like useImageUrl, but also reports whether the image is still being painted or failed. */
export function useImageReference(key: string | null | undefined, initial?: ImageReference | null): ImageReference | null {
  const [reference, setReference] = useState<ImageReference | null>(() => {
    if (!key) return null;
    if (initial && initial.cache_key === key) return initial;
    return cache.get(key) ?? null;
  });

  useEffect(() => {
    if (!key) {
      setReference(null);
      return;
    }
    const seeded = initial && initial.cache_key === key ? initial : cache.get(key);
    if (seeded) setReference(seeded);
    if (seeded && (seeded.status === "ready" || seeded.status === "fallback" || seeded.status === "failed")) {
      cache.set(key, seeded);
      return;
    }
    let cancelled = false;
    let polls = 0;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await api.image(key);
        if (cancelled) return;
        cache.set(key, next);
        setReference(next);
        // A picture waiting for the graphics card can wait a long time; keep checking until it starts.
        if (next.status !== "pending" || (!next.waiting && ++polls >= MAX_POLLS)) return;
      } catch {
        if (cancelled || ++polls >= MAX_POLLS) return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, initial?.status, initial?.cache_key]); // eslint-disable-line react-hooks/exhaustive-deps

  return reference && reference.cache_key === key
    ? { ...reference, url: reference.url ? mediaUrl(reference.url) : null }
    : null;
}
