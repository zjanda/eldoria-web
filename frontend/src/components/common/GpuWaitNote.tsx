import { useState } from "react";
import { api } from "../../api/client";
import type { ImageReference } from "../../api/types";

/* Shown while a picture waits for room on the graphics card (a game or another AI app is using it).
   The player can let it start anyway; the game may then slow down until it finishes. */
export function GpuWaitNote({ reference, compact = false }: { reference: ImageReference; compact?: boolean }) {
  const [sent, setSent] = useState(false);
  const goAhead = async () => {
    setSent(true);
    try {
      await api.goAhead(reference.cache_key);
    } catch {
      setSent(false);
    }
  };
  const button = (
    <button
      className={compact ? "ml-2 underline underline-offset-2 hover:text-parchment" : "btn-ghost self-start text-xs"}
      disabled={sent}
      onClick={goAhead}
      title="Start now. The computer may slow down until the picture is done."
    >
      {sent ? "Starting…" : "Paint anyway"}
    </button>
  );
  if (compact) {
    return (
      <p className="mt-1 text-[0.72rem] text-gold-soft/90 text-shadow" title={reference.waiting ?? undefined}>
        Art paused: the graphics card is busy.
        {button}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-2 text-sm text-gold-soft">
      <p>{reference.waiting} It will start on its own when room frees up, for example when you close a game.</p>
      {button}
    </div>
  );
}
