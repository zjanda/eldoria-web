import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Adventure, EntryKind } from "../../api/types";
import { RichText } from "../common/GlossaryText";
import { EntryView } from "./NarrativeLog";
import { TurnRecapCard } from "./TurnRecapCard";

type View = "story" | "recaps" | "everything";

const STORY_KINDS = new Set<EntryKind>(["narration", "dialogue", "player"]);

interface ChronicleViewerProps {
  adventure: Adventure;
  initialView?: View;
  textScale: number;
  onSpeak?: (text: string) => void;
  onClose: () => void;
}

/** A roomy, full-screen reader for the whole tale — built for phones. */
export function ChronicleViewer({ adventure, initialView = "story", textScale, onSpeak, onClose }: ChronicleViewerProps) {
  const [view, setView] = useState<View>(initialView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const npcById = useMemo(() => new Map(adventure.npcs.map((npc) => [npc.id, npc])), [adventure.npcs]);

  const entries = useMemo(
    () => (view === "story" ? adventure.narrative_log.filter((e) => STORY_KINDS.has(e.kind)) : adventure.narrative_log),
    [adventure.narrative_log, view],
  );
  const recaps = useMemo(() => [...adventure.turn_recaps].reverse(), [adventure.turn_recaps]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = view === "recaps" ? 0 : el.scrollHeight;
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs: [View, string][] = [
    ["story", "Story"],
    ["recaps", "Turn recaps"],
    ["everything", "Full log"],
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-center bg-ink/85 backdrop-blur-sm sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Chronicle"
    >
      <motion.div className="panel flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-none !bg-night-950 sm:rounded-xl" initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}>
        <header className="flex items-center justify-between gap-3 border-b border-gold/15 px-4 py-3">
          <div className="min-w-0">
            <p className="label">{adventure.campaign_title}</p>
            <h2 className="font-display text-lg tracking-wider text-gold-soft">The Chronicle</h2>
          </div>
          <button className="btn-ghost !px-3 !py-1.5" onClick={onClose} aria-label="Close chronicle">
            ✕
          </button>
        </header>
        <nav className="flex gap-1 border-b border-gold/10 px-3 py-2" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              className={`flex-1 rounded-md px-2 py-2 text-xs transition sm:text-sm ${view === id ? "bg-gold/20 text-gold-soft" : "text-mist hover:text-parchment"}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" style={{ fontSize: `${textScale}rem` }}>
          {view === "recaps" ? (
            <div className="space-y-3">
              {recaps.length === 0 && <p className="font-serif italic text-mist">No turns have been played yet.</p>}
              {recaps.map((recap) => (
                <TurnRecapCard key={recap.turn_number} recap={recap} onSpeak={onSpeak} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {entries.map((entry) => (
                <EntryView
                  key={entry.id}
                  entry={entry}
                  text={<RichText text={entry.text} />}
                  npc={entry.speaker_id ? npcById.get(entry.speaker_id) : undefined}
                  onSpeak={onSpeak && (entry.kind === "narration" || entry.kind === "dialogue") ? onSpeak : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
