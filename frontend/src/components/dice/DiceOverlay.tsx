import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DiceRoll } from "../../api/types";
import { audio } from "../../lib/audio";

const TUMBLE_MS = 900;
const HOLD_MS = 1100;
const MAX_FEATURED_ROLLS = 4;

const OUTCOME_STYLE: Record<string, { label: string; color: string }> = {
  critical_success: { label: "Critical Success", color: "#f3e2b0" },
  success: { label: "Success", color: "#7dbb77" },
  failure: { label: "Failure", color: "#d0644f" },
  critical_failure: { label: "Critical Failure", color: "#ff5a4a" },
};

/** Rolls worth a cinematic moment: party checks and attacks against a DC or AC. */
export function featuredRolls(rolls: DiceRoll[], partyNames: string[]): DiceRoll[] {
  return rolls
    .filter((r) => (r.target_label === "DC" || r.target_label === "AC") && partyNames.includes(r.actor_name))
    .slice(0, MAX_FEATURED_ROLLS);
}

function D20({ value, rolling, color, faded = false }: { value: number; rolling: boolean; color: string; faded?: boolean }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setDisplay(value);
      return;
    }
    const timer = window.setInterval(() => setDisplay(1 + Math.floor(Math.random() * 20)), 60);
    return () => window.clearInterval(timer);
  }, [rolling, value]);

  return (
    <motion.div
      className={`relative h-28 w-28 sm:h-36 sm:w-36 ${faded ? "opacity-30" : ""}`}
      animate={rolling ? { rotate: [0, 200, 340, 420], scale: [0.6, 1.1, 0.95, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: TUMBLE_MS / 1000, ease: "easeOut" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_0_18px_rgba(201,161,74,0.35)]">
        <defs>
          <linearGradient id="d20face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a2340" />
            <stop offset="1" stopColor="#0c0a14" />
          </linearGradient>
        </defs>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#d20face)" stroke={color} strokeWidth="2" />
        <polygon points="50,18 79,66 21,66" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1.4" />
        <path d="M50,3 L50,18 M93,27 L79,66 M7,27 L21,66 M50,97 L79,66 M50,97 L21,66 M93,73 L79,66 M7,73 L21,66 M93,27 L50,18 M7,27 L50,18" stroke={color} strokeOpacity="0.3" strokeWidth="1" />
        <text x="50" y="55" textAnchor="middle" dominantBaseline="middle" fontFamily="Cinzel, serif" fontSize="22" fontWeight="700" fill={color}>
          {display}
        </text>
      </svg>
    </motion.div>
  );
}

export function DiceOverlay({ rolls, onComplete }: { rolls: DiceRoll[]; onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [rolling, setRolling] = useState(true);
  const roll = rolls[index];

  useEffect(() => {
    if (!roll) {
      onComplete();
      return;
    }
    setRolling(true);
    audio.playDice();
    const land = window.setTimeout(() => {
      setRolling(false);
      audio.playOutcome(roll.outcome === "success" || roll.outcome === "critical_success");
    }, TUMBLE_MS);
    const next = window.setTimeout(() => setIndex((i) => i + 1), TUMBLE_MS + HOLD_MS);
    return () => {
      window.clearTimeout(land);
      window.clearTimeout(next);
    };
  }, [roll, onComplete]);

  if (!roll) return null;
  const style = OUTCOME_STYLE[roll.outcome] ?? { label: "", color: "#c9a14a" };
  const dieColor = rolling ? "#c9a14a" : style.color;
  const modifier = roll.modifier === 0 ? "" : roll.modifier > 0 ? ` + ${roll.modifier}` : ` − ${Math.abs(roll.modifier)}`;
  const dropped = roll.rolls.length > 1 ? (roll.rolls[0] === roll.kept[0] ? roll.rolls[1] : roll.rolls[0]) : null;

  return (
    <motion.div
      className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center bg-ink/60 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onComplete}
      role="dialog"
      aria-label="Dice roll"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={roll.id}
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          <p className="label mb-3">{roll.actor_name}</p>
          <p className="mb-4 font-display text-lg text-parchment sm:text-xl">{roll.purpose}</p>
          <div className="flex items-center gap-4">
            <D20 value={roll.kept[0]} rolling={rolling} color={dieColor} />
            {dropped !== null && <D20 value={dropped} rolling={rolling} color="#8a8f9e" faded={!rolling} />}
          </div>
          {roll.mode !== "normal" && <p className="mt-2 text-xs uppercase tracking-[0.2em] text-mist">{roll.mode}</p>}
          <motion.div className="mt-4 min-h-[4.5rem]" animate={{ opacity: rolling ? 0 : 1 }}>
            <p className="font-mono text-sm text-parchment/80">
              {roll.kept[0]}
              {modifier} = <span className="text-parchment">{roll.total}</span> vs {roll.target_label} {roll.target_number}
            </p>
            <p className="mt-1 font-display text-2xl uppercase tracking-[0.25em]" style={{ color: style.color, textShadow: `0 0 18px ${style.color}66` }}>
              {style.label}
            </p>
          </motion.div>
          <p className="mt-4 text-[0.65rem] uppercase tracking-[0.2em] text-mist/50">Click to skip</p>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
