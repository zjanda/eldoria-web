import type { TurnRecap } from "../../api/types";
import { RichText } from "../common/GlossaryText";

/** “What just happened”: headline, key outcomes, and the lines that were spoken. */
export function TurnRecapCard({ recap, onSpeak }: { recap: TurnRecap; onSpeak?: (text: string) => void }) {
  const spoken = [recap.headline, ...recap.quotes.map((q) => `${q.speaker_name} says: ${q.text}`)].join(" ");
  return (
    <article className="rounded-lg border border-gold/20 bg-ink/50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-gold/60">Turn {recap.turn_number}</p>
          <p className="mt-0.5 text-[0.78rem] italic text-gold-soft/80">
            “<RichText text={recap.action_text} />”
          </p>
        </div>
        {onSpeak && (
          <button className="btn-ghost shrink-0 !px-2 !py-1 text-xs" onClick={() => onSpeak(spoken)} aria-label="Read this recap aloud">
            🔊
          </button>
        )}
      </div>
      <p className="mt-2 font-serif text-[1.08em] leading-snug text-parchment">
        <RichText text={recap.headline} />
      </p>
      {recap.happenings.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {recap.happenings.map((line, i) => (
            <li key={i} className="flex gap-2 text-[0.86em] leading-snug text-parchment/80">
              <span className="text-gold/70">•</span>
              <span>
                <RichText text={line} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {recap.quotes.length > 0 && (
        <div className="mt-2.5 space-y-1.5 border-t border-white/5 pt-2.5">
          {recap.quotes.map((quote, i) => (
            <p key={i} className="text-[0.86em] leading-snug">
              <span className="font-display text-[0.8em] tracking-wider text-gold-soft">{quote.speaker_name}: </span>
              <span className="font-serif italic text-parchment/85">
                “<RichText text={quote.text} />”
              </span>
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
