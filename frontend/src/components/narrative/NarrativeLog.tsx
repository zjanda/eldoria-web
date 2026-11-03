import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NarrativeEntry, NonPlayerCharacter } from "../../api/types";
import type { TextSpeed } from "../../hooks/useSettings";
import { RichText } from "../common/GlossaryText";
import { Portrait } from "../common/Portrait";
import { Typewriter } from "./Typewriter";

const MS_PER_CHAR: Record<TextSpeed, number> = { cinematic: 22, fast: 7, instant: 0 };
const TYPED_KINDS = new Set(["narration", "dialogue"]);

interface NarrativeLogProps {
  entries: NarrativeEntry[];
  npcs: NonPlayerCharacter[];
  newEntryIds: string[];
  revealActive: boolean;
  /** Keep this turn's entries hidden (e.g. while dice are still rolling). */
  holdNew: boolean;
  textSpeed: TextSpeed;
  textScale: number;
  onSpeak?: (text: string) => void;
  onSpeakerChange: (speakerId: string | null) => void;
  onRevealDone: () => void;
}

export function NarrativeLog({ entries, npcs, newEntryIds, revealActive, holdNew, textSpeed, textScale, onSpeak, onSpeakerChange, onRevealDone }: NarrativeLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [skip, setSkip] = useState(false);
  const newIds = useMemo(() => new Set(newEntryIds), [newEntryIds]);
  const pending = useMemo(() => entries.filter((e) => newIds.has(e.id)), [entries, newIds]);
  const npcById = useMemo(() => new Map(npcs.map((npc) => [npc.id, npc])), [npcs]);

  useEffect(() => {
    setRevealIndex(0);
    setSkip(false);
  }, [newEntryIds]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [entries, revealIndex, revealActive, scrollToBottom]);

  const current = pending[revealIndex];
  useEffect(() => {
    if (!revealActive) return;
    if (!current) {
      onSpeakerChange(null);
      onRevealDone();
      return;
    }
    onSpeakerChange(current.kind === "dialogue" ? current.speaker_id : null);
    if (!TYPED_KINDS.has(current.kind)) {
      // Mechanical lines appear with a short beat between them.
      const timer = window.setTimeout(() => setRevealIndex((i) => i + 1), skip ? 0 : textSpeed === "instant" ? 0 : 180);
      return () => window.clearTimeout(timer);
    }
  }, [revealActive, current, skip, textSpeed, onSpeakerChange, onRevealDone]);

  const advance = useCallback(() => setRevealIndex((i) => i + 1), []);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-4 py-4 sm:px-6"
      style={{ fontSize: `${textScale}rem` }}
      onClick={() => revealActive && setSkip(true)}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {entries.map((entry) => {
          const isNew = newIds.has(entry.id);
          const order = isNew ? pending.indexOf(entry) : -1;
          if (isNew && (holdNew || (revealActive && order > revealIndex))) return null;
          const typing = isNew && revealActive && order === revealIndex && TYPED_KINDS.has(entry.kind);
          const text = typing ? (
            <Typewriter text={entry.text} msPerChar={MS_PER_CHAR[textSpeed]} skip={skip} onProgress={scrollToBottom} onDone={advance} />
          ) : (
            <RichText text={entry.text} />
          );
          return (
            <motion.div key={entry.id} initial={isNew ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <EntryView
                entry={entry}
                text={text}
                npc={entry.speaker_id ? npcById.get(entry.speaker_id) : undefined}
                onSpeak={onSpeak && !typing && (entry.kind === "narration" || entry.kind === "dialogue") ? onSpeak : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SpeakButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="ml-1.5 inline-flex h-6 w-6 translate-y-[-1px] items-center justify-center rounded-full align-middle text-[0.7rem] text-gold/50 opacity-70 transition hover:bg-gold/10 hover:text-gold hover:opacity-100"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label="Read aloud"
      title="Read aloud"
    >
      🔊
    </button>
  );
}

/** One log line. Font sizes are in em so the reader's text-size setting scales everything. */
export function EntryView({
  entry,
  text,
  npc,
  onSpeak,
}: {
  entry: NarrativeEntry;
  text: ReactNode;
  npc?: NonPlayerCharacter;
  onSpeak?: (text: string) => void;
}) {
  switch (entry.kind) {
    case "player":
      return (
        <div className="mt-3 flex justify-end">
          <p className="max-w-[85%] rounded-lg border border-gold/25 bg-gold/[0.06] px-3.5 py-2 text-[0.8em] italic text-gold-soft">
            <span className="label mr-2 not-italic text-gold/60">Your command</span>
            {text}
          </p>
        </div>
      );
    case "narration":
      return (
        <p className="narration-text whitespace-pre-line">
          {entry.speaker_name === "DM" && <span className="label mr-2 text-gold-soft">Dungeon Master</span>}
          {text}
          {onSpeak && <SpeakButton onClick={() => onSpeak(entry.text)} />}
        </p>
      );
    case "dialogue":
      return (
        <div className="flex gap-3">
          {npc ? (
            <Portrait name={npc.name} accent={npc.visual.accent_color} sigil={npc.visual.sigil} imageKey={npc.visual.portrait_image_key} size={40} />
          ) : (
            <div className="h-10 w-10" />
          )}
          <div className="flex-1 border-l border-gold/20 pl-3">
            <p className="font-display text-[0.65em] tracking-[0.15em]" style={{ color: npc?.visual.accent_color ?? "#c9a14a" }}>
              {entry.speaker_name}
            </p>
            <p className="font-serif text-[0.97em] italic leading-snug text-parchment/95">
              “{text}”{onSpeak && <SpeakButton onClick={() => onSpeak(`${entry.speaker_name} says: ${entry.text}`)} />}
            </p>
          </div>
        </div>
      );
    case "roll":
      return <RollLine text={entry.text} />;
    case "combat":
      return <p className="border-l-2 border-ember/50 pl-3 text-[0.72em] text-parchment/75">{text}</p>;
    default:
      return <p className="text-center text-[0.68em] italic tracking-wide text-gold/70">✦ {text}</p>;
  }
}

function RollLine({ text }: { text: string }) {
  const tone = text.includes("Critical success")
    ? "text-gold-soft border-gold/50"
    : text.includes("Success")
      ? "text-verdant border-verdant/40"
      : text.includes("Critical failure") || text.includes("Failure")
        ? "text-ember border-ember/40"
        : "text-mist border-white/10";
  return (
    <p className={`inline-flex w-fit max-w-full items-center gap-2 rounded-md border bg-ink/50 px-2.5 py-1 font-mono text-[0.64em] ${tone}`}>
      <span aria-hidden>⬢</span>
      <span>
        <RichText text={text} />
      </span>
    </p>
  );
}
