import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GameRules } from "../../api/types";

export const DIFFICULTIES: { level: number; name: string; summary: string }[] = [
  { level: 1, name: "Imagination", summary: "Your word is final. Powers are never resized, nothing forces a fight, and nothing can bring a hero down." },
  { level: 2, name: "Story", summary: "Generous. Powers are sized loosely and foes are weaker than the party." },
  { level: 3, name: "Adventure", summary: "Balanced. Powers are sized by a fair budget and foes match the party." },
  { level: 4, name: "Hard", summary: "Powers you design keep their strength but cost more to use. Foes outmatch the party, and defeat leaves you badly hurt." },
  { level: 5, name: "Deathmarch", summary: "Every point of power is paid for. Foes hit far harder, and defeat leaves you at 1 HP with nothing left." },
];

export const DEFAULT_RULES: GameRules = { difficulty: 3, dice: true, resource_costs: true, rest_limits: true, learn_by_doing: true, house_rules: [] };

const toLines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

interface RulesFieldsProps {
  rules: GameRules;
  wishes: string[];
  onChange: (rules: GameRules, wishes: string[]) => void;
}

/** The rules of a tale, all of them the player's to reshape: difficulty, dice, costs, rest, and rules in their own words. */
export function RulesFields({ rules, wishes, onChange }: RulesFieldsProps) {
  // Free text is kept as typed (blank lines and all) and split into lines only when it is handed on.
  const [houseText, setHouseText] = useState(rules.house_rules.join("\n"));
  const [wishText, setWishText] = useState(wishes.join("\n"));
  const set = (changes: Partial<GameRules>) => onChange({ ...rules, ...changes }, toLines(wishText));
  const difficulty = DIFFICULTIES.find((d) => d.level === rules.difficulty) ?? DIFFICULTIES[2];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="difficulty" className="label">Difficulty</label>
          <span className="font-display text-base tracking-wider text-gold-soft">{difficulty.name}</span>
        </div>
        <input
          id="difficulty"
          type="range"
          min={1}
          max={5}
          step={1}
          value={rules.difficulty}
          onChange={(event) => set({ difficulty: Number(event.target.value) })}
          className="mt-2 w-full accent-[#c9a14a]"
          aria-valuetext={difficulty.name}
        />
        <div className="flex justify-between text-[0.62rem] uppercase tracking-wider text-mist">
          <span>Imagination</span>
          <span>Deathmarch</span>
        </div>
        <p className="mt-2 text-[0.8rem] leading-snug text-parchment/85">{difficulty.summary}</p>
        <p className="mt-1 text-[0.72rem] leading-snug text-mist">
          Any power is allowed at every setting. Difficulty decides what it costs and how hard the world pushes back; foes are measured against your party as it stands.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Dice" on={rules.dice} onChange={(dice) => set({ dice })}
          note={rules.dice ? "Uncertain actions are rolled." : "No dice. Your heroes succeed unless you say otherwise; you choose each action's fate."} />
        <Toggle label="Powers cost resource" on={rules.resource_costs} onChange={(resource_costs) => set({ resource_costs })}
          note={rules.resource_costs ? "Abilities spend the hero's resource." : "Every ability is free to use."} />
        <Toggle label="Limited rest" on={rules.rest_limits} onChange={(rest_limits) => set({ rest_limits })}
          note={rules.rest_limits ? "One rest per place; full recovery only somewhere safe." : "Rest fully anywhere, as often as you like."} />
        <Toggle label="Gain powers by using them" on={rules.learn_by_doing} onChange={(learn_by_doing) => set({ learn_by_doing })}
          note={rules.learn_by_doing ? "Name a power a hero lacks and it becomes theirs; the game sets its cost." : "Heroes can only use what is on their sheet."} />
      </div>

      <label className="block">
        <span className="label mb-1 block">Your own rules</span>
        <textarea className="input resize-y" rows={3} value={houseText} placeholder={"One per line, in your own words.\nMagic always has a price.\nNo one dies unless I say so."}
          onChange={(event) => { setHouseText(event.target.value); onChange({ ...rules, house_rules: toLines(event.target.value) }, toLines(wishText)); }} />
        <span className="mt-1 block text-[0.72rem] text-mist">The storyteller treats these as overriding the defaults. Up to 12.</span>
      </label>

      <label className="block">
        <span className="label mb-1 block">Wishes for the story</span>
        <textarea className="input resize-y" rows={3} value={wishText} placeholder={"One per line.\nA peaceful journey, no forced combat.\nSlow-burn mystery, few characters."}
          onChange={(event) => { setWishText(event.target.value); onChange(rules, toLines(event.target.value)); }} />
        <span className="mt-1 block text-[0.72rem] text-mist">Standing direction for the storyteller. Asking for peace here means the story never starts a fight you did not pick.</span>
      </label>
    </div>
  );
}

function Toggle({ label, note, on, onChange }: { label: string; note: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`rounded-lg border p-3 text-left transition ${on ? "border-gold/50 bg-gold/10" : "border-white/10 bg-ink/30"}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-sm tracking-wider text-parchment">{label}</span>
        <span className={`text-[0.65rem] uppercase tracking-wider ${on ? "text-gold-soft" : "text-mist"}`}>{on ? "On" : "Off"}</span>
      </span>
      <span className="mt-1 block text-[0.72rem] leading-snug text-mist">{note}</span>
    </button>
  );
}

interface RulesPanelProps {
  rules: GameRules;
  wishes: string[];
  /** Resolves true when the server accepted the change. */
  onSave: (rules: GameRules, wishes: string[]) => Promise<boolean>;
  onClose: () => void;
}

/** Change the rules in the middle of a tale. The change can be undone like any other step. */
export function RulesPanel({ rules, wishes, onSave, onClose }: RulesPanelProps) {
  const [draft, setDraft] = useState<{ rules: GameRules; wishes: string[] }>({ rules, wishes });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const accepted = await onSave(draft.rules, draft.wishes);
    setSaving(false);
    if (accepted) onClose();
  };
  return createPortal(
    <Overlay label="Rules of the tale">
      <header className="shrink-0 border-b border-gold/15 px-4 py-3">
        <p className="label">Rules of the tale</p>
        <h2 className="font-display text-xl tracking-wide text-parchment">They are yours to change</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <RulesFields rules={draft.rules} wishes={draft.wishes} onChange={(nextRules, nextWishes) => setDraft({ rules: nextRules, wishes: nextWishes })} />
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-gold/15 px-4 py-3">
        <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn-gold !py-2" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rules"}</button>
      </footer>
    </Overlay>,
    document.body,
  );
}

interface RetellDialogProps {
  action: string;
  busy: boolean;
  error: string | null;
  /** Resolves true when the turn was told again. */
  onRetell: (direction: string, remember: boolean) => Promise<boolean>;
  onClose: () => void;
}

/** Tell the last turn again: same action, same dice, a different story, steered by the player's note. */
export function RetellDialog({ action, busy, error, onRetell, onClose }: RetellDialogProps) {
  const [direction, setDirection] = useState("");
  const [remember, setRemember] = useState(false);
  return createPortal(
    <Overlay label="Tell this turn again" narrow>
      <div className="p-5">
        <h2 className="font-display text-xl text-gold-soft">Tell this turn again?</h2>
        <p className="my-3 whitespace-pre-wrap break-words font-serif italic text-parchment/90">“{action}”</p>
        <p className="mb-3 text-sm text-mist">
          Your action and its dice stay exactly as they were. Only the story is told afresh: what the world does in answer, who appears, what is found.
        </p>
        <label className="block">
          <span className="label mb-1 block">Steer it (optional)</span>
          <textarea className="input resize-y" rows={3} maxLength={400} value={direction} autoFocus
            placeholder="Introduce the stranger in a passive way that does not force combat." onChange={(event) => setDirection(event.target.value)} />
        </label>
        <label className={`mt-2 flex items-center gap-2 text-sm ${direction.trim() ? "text-parchment/90" : "text-mist/60"}`}>
          <input type="checkbox" checked={remember && !!direction.trim()} disabled={!direction.trim()} onChange={(event) => setRemember(event.target.checked)} />
          Keep this as a standing wish for the rest of the tale
        </label>
        <div className="mt-4 flex gap-3">
          <button className="btn-gold !py-2" disabled={busy} onClick={async () => { if (await onRetell(direction.trim(), remember && !!direction.trim())) onClose(); }}>
            {busy ? "Retelling…" : "Tell it again"}
          </button>
          <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
        {error && <p role="alert" className="mt-3 text-ember">{error}</p>}
      </div>
    </Overlay>,
    document.body,
  );
}

function Overlay({ label, narrow = false, children }: { label: string; narrow?: boolean; children: ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 backdrop-blur-sm sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={label}>
      <div className={`flex max-h-full w-full flex-col overflow-hidden border-gold/20 bg-night-950 sm:rounded-xl sm:border ${narrow ? "max-w-lg" : "h-full max-w-2xl sm:h-auto"}`}>
        {children}
      </div>
    </motion.div>
  );
}
