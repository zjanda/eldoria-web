import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Ability, Character, SceneState } from "../../api/types";
import { useOpenArt } from "../common/ArtStudio";
import { HealthBar } from "../common/HealthBar";
import { Portrait } from "../common/Portrait";

const ATTRIBUTE_LABELS: Record<string, string> = { might: "MIG", agility: "AGI", wits: "WIT", spirit: "SPI", presence: "PRE" };
const KIND_ICON: Record<Ability["kind"], string> = {
  attack: "⚔",
  heal: "✚",
  control: "⛓",
  utility: "◈",
  transform: "❋",
  cleanse: "☾",
  revive: "❦",
  technique: "✦",
};

function modifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : `${value}`;
}

function unavailableReason(ability: Ability, hero: Character, scene: SceneState, inCombat: boolean): string | null {
  if (ability.blocked_by_radiance && scene.lighting === "radiant") return "Umbra cannot act in radiant light";
  if (ability.cost > hero.resource_current) return `Needs ${ability.cost} ${hero.resource_name}`;
  if (ability.usable_in === "combat" && !inCombat) return "Combat only";
  if (ability.usable_in === "exploration" && inCombat) return "Not in combat";
  return null;
}

export function CharacterCard({ hero, scene, inCombat }: { hero: Character; scene: SceneState; inCombat: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const openArt = useOpenArt();
  const down = hero.hp <= 0;
  return (
    <div className={`panel p-3 ${down ? "border-ember/40" : ""}`}>
      <div className="flex gap-3">
        <Portrait
          name={hero.name}
          accent={hero.visual.accent_color}
          sigil={hero.visual.sigil}
          imageKey={hero.visual.portrait_image_key}
          size={58}
          shape="frame"
          dimmed={down}
          onOpen={() => openArt({ kind: "portrait", id: hero.id })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-base tracking-wider text-parchment">{hero.name}</h3>
            <span className="text-[0.65rem] text-mist">AC {hero.armor_class}</span>
          </div>
          <p className="truncate text-[0.68rem] text-mist">{hero.title}</p>
          <HealthBar className="mt-1.5" current={hero.hp} max={hero.max_hp} />
          <div className="flex items-center gap-1.5" title={`${hero.resource_name}: ${hero.resource_current}/${hero.resource_max}`}>
            <span className="text-[0.62rem] uppercase tracking-wider text-mist">{hero.resource_name}</span>
            {Array.from({ length: hero.resource_max }, (_, i) => (
              <span
                key={i}
                className="h-2 w-2 rotate-45 border"
                style={{
                  borderColor: hero.visual.accent_color,
                  background: i < hero.resource_current ? hero.visual.accent_color : "transparent",
                  boxShadow: i < hero.resource_current ? `0 0 6px ${hero.visual.accent_color}` : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {hero.statuses.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {hero.statuses.map((status) => (
            <span key={status.id} className="rounded border border-umbral/30 bg-umbral/10 px-1.5 py-0.5 text-[0.62rem] text-umbral" title={status.description}>
              {status.name}
              {status.remaining_rounds ? ` · ${status.remaining_rounds}` : ""}
            </span>
          ))}
        </div>
      )}

      <button className="mt-2 flex w-full items-center justify-between text-[0.68rem] uppercase tracking-[0.18em] text-gold/70 hover:text-gold" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        Abilities &amp; attributes <span>{expanded ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 grid grid-cols-5 gap-1 text-center">
              {Object.entries(hero.attributes).map(([attribute, score]) => (
                <div key={attribute} className="rounded border border-white/5 bg-ink/40 py-1">
                  <p className="text-[0.55rem] tracking-wider text-mist">{ATTRIBUTE_LABELS[attribute] ?? attribute}</p>
                  <p className="font-display text-sm text-parchment">{modifier(score)}</p>
                </div>
              ))}
            </div>
            <ul className="mt-2 space-y-1.5">
              {hero.abilities.map((ability) => {
                const reason = unavailableReason(ability, hero, scene, inCombat);
                return (
                  <li key={ability.id} className={`rounded border border-white/5 bg-ink/30 px-2 py-1.5 ${reason ? "opacity-55" : ""}`} title={ability.description}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.78rem] text-parchment">
                        <span className="mr-1.5 text-gold/80">{KIND_ICON[ability.kind]}</span>
                        {ability.name}
                      </span>
                      {ability.cost > 0 && <span className="text-[0.62rem] text-mist">{ability.cost} {hero.resource_name}</span>}
                    </div>
                    <p className="mt-0.5 text-[0.66rem] leading-snug text-mist">{reason ?? ability.description}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[0.62rem] text-mist/80">Skilled in: {hero.proficient_skills.map((s) => s.replace(/_/g, " ")).join(", ")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
