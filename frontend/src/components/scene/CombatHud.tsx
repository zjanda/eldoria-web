import { motion } from "framer-motion";
import type { CombatView } from "../../api/types";
import { Sigil } from "../common/Sigil";
import { HealthBar } from "../common/HealthBar";

export function CombatHud({ combat }: { combat: CombatView }) {
  return (
    <>
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-6 sm:top-6">
        <motion.div
          className="rounded-md border border-ember/40 bg-ink/70 px-3 py-1 font-display text-xs uppercase tracking-[0.25em] text-ember backdrop-blur"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          Combat · Round {combat.round_number}
        </motion.div>
        <p className="hidden items-center gap-1.5 rounded border border-white/10 bg-ink/60 px-2 py-0.5 text-[0.65rem] text-mist backdrop-blur sm:flex" aria-label="Turn order">
          <span className="text-gold-soft">Your commands</span>
          <span aria-hidden>→</span>
          <span className="text-ember/90">
            {combat.enemies
              .filter((e) => e.hp > 0 && !e.cleansed)
              .map((e) => e.name)
              .join(", ")}{" "}
            respond
          </span>
        </p>
      </div>

      <div className="absolute inset-x-2 bottom-2 flex items-end justify-center gap-2 sm:inset-x-4 sm:bottom-6 sm:gap-5">
        {combat.enemies.map((enemy) => {
          const down = enemy.hp <= 0 || enemy.cleansed;
          const cleanseReady = enemy.cleansable && !enemy.cleansed && enemy.cleanse_threshold_hp !== null && enemy.hp <= enemy.cleanse_threshold_hp && enemy.hp > 0;
          return (
            <motion.div
              key={enemy.id}
              layout
              className={`panel w-1/2 max-w-[14rem] p-2 sm:w-56 sm:p-3 ${down ? "opacity-50" : ""}`}
              animate={down ? { opacity: 0.45, y: 6 } : { opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: enemy.accent_color, color: enemy.accent_color }}>
                  <Sigil name={enemy.sigil} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm text-parchment">{enemy.name}</p>
                  <p className="text-[0.65rem] text-mist">AC {enemy.armor_class}</p>
                </div>
              </div>
              <HealthBar className="mt-2" current={enemy.hp} max={enemy.max_hp} tone="enemy" />
              <div className="mt-1.5 flex min-h-[1rem] flex-wrap gap-1">
                {enemy.cleansed && <span className="text-[0.65rem] text-verdant">Cleansed</span>}
                {cleanseReady && <span className="animate-pulse text-[0.65rem] text-frost">Weak enough to cleanse</span>}
                {enemy.statuses.map((status) => (
                  <span key={status} className="rounded bg-umbral/20 px-1.5 text-[0.62rem] text-umbral">
                    {status}
                  </span>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
