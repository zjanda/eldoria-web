import { motion } from "framer-motion";
import { useState } from "react";
import type { Adventure } from "../api/types";

interface Props {
  adventure: Adventure;
  busy: boolean;
  error: string | null;
  onDraft: (direction: string) => Promise<boolean>;
  onBegin: () => Promise<boolean>;
  onDiscard: () => Promise<boolean>;
  onClose: () => void;
  onTitle: () => void;
}

export function ChapterEnd({ adventure, busy, error, onDraft, onBegin, onDiscard, onClose, onTitle }: Props) {
  const [direction, setDirection] = useState("");
  const quest = adventure.quests[adventure.quests.length - 1];
  const preview = adventure.pending_chapter;
  const needsDirection = adventure.story_control <= 3;
  const ending = adventure.decisions[adventure.decisions.length - 1] ?? `${quest?.title ?? adventure.chapter_title}: ${quest?.status ?? "complete"}`;
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-3 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="dialog" aria-modal="true" aria-label="Chapter complete">
      <motion.div className="panel max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 text-center sm:p-7" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <p className="label">Chapter {adventure.chapter_number} · {adventure.chapter_title}</p>
        <h2 className="mt-2 font-display text-3xl text-gold-soft">Chapter Complete</h2>
        <div className="gold-rule my-4" />
        <p className="font-serif text-lg italic text-parchment/85">{ending}</p>
        {preview ? <div className="mt-4 text-left">
          <h3 className="font-display text-xl text-gold-soft">Chapter {preview.number}: {preview.title}</h3>
          <p className="my-3 text-sm text-parchment">{preview.premise}</p>
          <p className="text-xs text-mist">Places: {preview.places.join(" · ")}</p>
          <p className="mt-2 text-xs text-mist">Foes: {preview.foes.join(", ")}</p>
          <ul className="my-3 list-inside list-disc text-sm text-parchment">{preview.objectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul>
          {preview.degraded && <p className="my-3 text-xs text-gold-soft">The offline template writer prepared this draft. Review it before beginning.</p>}
          <div className="flex flex-wrap gap-2"><button className="btn-gold" disabled={busy} onClick={() => void onBegin()}>Begin Chapter {preview.number}</button><button className="btn-ghost" disabled={busy} onClick={() => void onDiscard()}>Write another</button></div>
        </div> : <div className="mt-4 text-left">
          {adventure.story_control < 5 && <label className="block text-sm text-parchment">{needsDirection ? "Your direction for the next chapter (required)" : "What should happen next? (optional)"}<textarea aria-label="Next chapter direction" className="mt-2 w-full rounded border border-gold/25 bg-night-900 p-3 text-parchment" rows={4} maxLength={6000} value={direction} disabled={busy} onChange={(event) => setDirection(event.target.value)} /></label>}
          <button className="btn-gold mt-3 w-full" disabled={busy || (needsDirection && !direction.trim())} onClick={() => void onDraft(direction)}>Continue the story</button>
        </div>}
        {busy && <p role="status" className="mt-4 text-sm text-gold-soft">The Dungeon Master is writing… This may take 30–60 seconds, or longer for a large chapter.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button className="btn-ghost" disabled={busy} onClick={onClose}>Keep exploring</button><button className="btn-ghost" disabled={busy} onClick={onTitle}>Return to title</button></div>
      </motion.div>
    </motion.div>
  );
}
