import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { SuggestedAction, TechniqueOffer } from "../../api/types";

interface ActionComposerProps {
  storyControl: number;
  onDm: (text: string) => Promise<boolean>;
  suggestions: SuggestedAction[];
  offers: TechniqueOffer[];
  onLearn: (offerId: string) => void;
  disabled: boolean;
  busy: boolean;
  inCombat: boolean;
  onSubmit: (text: string) => Promise<boolean>;
}

const MAX_LENGTH = 600;

export function ActionComposer({ storyControl, onDm, suggestions, offers, onLearn, disabled, busy, inCombat, onSubmit }: ActionComposerProps) {
  const [text, setText] = useState("");
  const [dm, setDm] = useState(false);
  const dmActive = dm && storyControl < 5;

  const submit = async (value: string) => {
    if (!value.trim() || disabled) return;
    const ok = await (dmActive ? onDm(value) : onSubmit(value));
    if (ok) setText("");
  };

  return (
    <div className="border-t border-gold/10 bg-night-950/80 px-3 pb-3 pt-2.5 backdrop-blur sm:px-5">
      <div className="mx-auto max-w-3xl">
        {storyControl < 5 && <div className="mb-2">
          {storyControl < 4 ? <button type="button" className={storyControl === 1 ? "btn-gold !py-1 text-xs" : "chip"} disabled={disabled} aria-pressed={dmActive} onClick={() => setDm(!dm)}>✒ {dmActive ? "Speaking as DM" : "Speak as DM"}</button>
            : <details><summary className="cursor-pointer text-xs text-mist">Story tools</summary><button type="button" className="chip mt-1" disabled={disabled} aria-pressed={dmActive} onClick={() => setDm(!dm)}>✒ {dmActive ? "Speaking as DM" : "Speak as DM"}</button></details>}
          {dmActive && <p className="mt-1 text-xs text-gold-soft">Your words become DM narration. Explicit effects are translated and checked by the game.</p>}
        </div>}
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.p
              key="busy"
              className="flex h-[2.6rem] items-center gap-3 font-serif text-lg italic text-gold-soft/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="inline-flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-gold"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </span>
              The Dungeon Master weighs your fate…
            </motion.p>
          ) : (
            <motion.div
              key="suggestions"
              className="flex flex-wrap gap-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {offers.map((offer) => (
                <button
                  key={offer.id}
                  className="chip !border-[#9fc98a]/50 !text-[#cfe6c2] hover:!border-[#9fc98a]"
                  disabled={disabled}
                  onClick={() => onLearn(offer.id)}
                  title={`Keep “${offer.composition.name}” as ${offer.hero_name}'s signature move: ${offer.summary}`}
                >
                  <span className="mr-1.5 text-[#9fc98a]">✦</span>
                  Learn {offer.composition.name}
                  <span className="ml-1.5 text-[0.7em] text-mist">{offer.hero_name}</span>
                </button>
              ))}
              {(dmActive ? [] : suggestions).map((suggestion) => (
                <button
                  key={suggestion.action_text}
                  className="chip"
                  disabled={disabled}
                  onClick={() => submit(suggestion.action_text)}
                  title={suggestion.action_text}
                >
                  <span className="mr-1.5 text-gold/80">{inCombat ? "⚔" : "❖"}</span>
                  {suggestion.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          className="mt-2.5 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(text);
          }}
        >
          <label className="sr-only" htmlFor="action-input">
            Describe your action
          </label>
          <textarea
            id="action-input"
            value={text}
            maxLength={dmActive ? 6000 : MAX_LENGTH}
            rows={2}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit(text);
              }
            }}
            placeholder={
              dmActive ? "Describe the world or give explicit DM instructions…" : inCombat
                ? "Give each hero an action — e.g. “Edgar binds the stag with Umbra while Elara lashes it with thorns”"
                : "What do Edgar and Elara do? Anything you can imagine…"
            }
            className="min-h-[3rem] flex-1 resize-none rounded-lg border border-gold/20 bg-night-900/90 px-3.5 py-2.5 font-serif text-[1.05rem] text-parchment placeholder:font-sans placeholder:text-sm placeholder:text-mist/50 focus:border-gold/60 focus:outline-none disabled:opacity-50"
          />
          <button type="submit" className="btn-gold h-[3rem] px-5" disabled={disabled || !text.trim()}>
            {dmActive ? "Narrate" : "Act"}
          </button>
        </form>
      </div>
    </div>
  );
}
