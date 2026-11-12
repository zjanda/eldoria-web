import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { actionDraftKey, clearDraft, readDraft, writeDraft } from "../../lib/drafts";
import type { Fate, SuggestedAction, TechniqueOffer } from "../../api/types";

const FATES: { id: Fate | null; label: string; title: string }[] = [
  { id: null, label: "Succeed", title: "Your heroes' attempts work" },
  { id: "critical_success", label: "Triumph", title: "A critical success" },
  { id: "failure", label: "Fail", title: "Your heroes' attempts do not work" },
  { id: "critical_failure", label: "Disaster", title: "A critical failure" },
];

interface ActionComposerProps {
  storyControl: number;
  onDm: (text: string) => Promise<boolean>;
  suggestions: SuggestedAction[];
  offers: TechniqueOffer[];
  onLearn: (offerId: string) => void;
  disabled: boolean;
  busy: boolean;
  inCombat: boolean;
  /** The heroes' names, for the hint in the empty box. */
  heroNames: string[];
  /** The tale being played: the action being typed is kept per tale. */
  adventureId: string;
  /** Dice are off: the player chooses how each action turns out. */
  chooseFate: boolean;
  onSubmit: (text: string, fate: Fate | null) => Promise<boolean>;
}

const MAX_LENGTH = 600;

export function ActionComposer({ storyControl, onDm, suggestions, offers, onLearn, disabled, busy, inCombat, heroNames, adventureId, chooseFate, onSubmit }: ActionComposerProps) {
  const draftKey = actionDraftKey(adventureId);
  // What is being typed is kept as it is typed, so a reloaded page does not lose it.
  const [text, setText] = useState(() => readDraft<string>(draftKey) ?? "");
  useEffect(() => {
    if (text) writeDraft(draftKey, text);
    else clearDraft(draftKey);
  }, [draftKey, text]);
  const [fate, setFate] = useState<Fate | null>(null);
  const [first = "one hero", second = "the other"] = heroNames;
  const everyone = heroNames.length > 1 ? `${heroNames.slice(0, -1).join(", ")} and ${heroNames[heroNames.length - 1]}` : first;
  const [dm, setDm] = useState(false);
  const dmActive = dm && storyControl < 5;

  const submit = async (value: string) => {
    if (!value.trim() || disabled) return;
    const ok = await (dmActive ? onDm(value) : onSubmit(value, chooseFate ? fate : null));
    if (ok) {
      setText("");
      setFate(null);
    }
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

        {chooseFate && !dmActive && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Fate of this action">
            <span className="text-[0.68rem] uppercase tracking-[0.18em] text-mist">No dice. This action will</span>
            {FATES.map((option) => (
              <button key={option.label} type="button" role="radio" aria-checked={fate === option.id} title={option.title} disabled={disabled}
                className={`chip !px-2.5 !py-1 !text-[0.74rem] ${fate === option.id ? "!border-gold/80 !bg-gold/15 !text-parchment" : ""}`} onClick={() => setFate(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        )}
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
                ? `Give each hero an action — e.g. “${first} strikes the nearest foe while ${second} tends the wounded”`
                : `What ${heroNames.length === 1 ? "does" : "do"} ${everyone} do? Anything you can imagine…`
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
