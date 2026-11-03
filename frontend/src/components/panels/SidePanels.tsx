import { useState } from "react";
import type { Adventure, DiceRoll } from "../../api/types";
import { useOpenArt } from "../common/ArtStudio";
import { RichText } from "../common/GlossaryText";
import { Portrait } from "../common/Portrait";

type Tab = "quests" | "inventory" | "journal" | "companions" | "dice";

const TABS: { id: Tab; label: string }[] = [
  { id: "quests", label: "Quests" },
  { id: "inventory", label: "Pack" },
  { id: "journal", label: "Journal" },
  { id: "companions", label: "Allies" },
  { id: "dice", label: "Dice" },
];

export function SidePanels({ adventure }: { adventure: Adventure }) {
  const [tab, setTab] = useState<Tab>("quests");
  return (
    // Fills spare sidebar space, but never shrinks below a readable height:
    // when the hero cards are tall, the sidebar scrolls to reveal it instead.
    <div className="panel flex min-h-[min(26rem,75dvh)] flex-1 flex-col">
      <div className="flex border-b border-gold/10 px-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`flex-1 px-1.5 py-2.5 font-display text-[0.62rem] uppercase tracking-[0.14em] transition ${
              tab === item.id ? "border-b border-gold text-gold-soft" : "text-mist hover:text-parchment"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {tab === "quests" && <QuestTab adventure={adventure} />}
        {tab === "inventory" && <InventoryTab adventure={adventure} />}
        {tab === "journal" && <JournalTab adventure={adventure} />}
        {tab === "companions" && <CompanionsTab adventure={adventure} />}
        {tab === "dice" && <DiceTab rolls={adventure.dice_history} />}
      </div>
    </div>
  );
}

function QuestTab({ adventure }: { adventure: Adventure }) {
  return (
    <div className="space-y-4">
      {adventure.quests.map((quest) => (
        <div key={quest.id}>
          <div className="flex items-center justify-between">
            <h4 className="font-display text-sm text-gold-soft">{quest.title}</h4>
            <span className={`text-[0.62rem] uppercase tracking-wider ${quest.status === "completed" ? "text-verdant" : "text-mist"}`}>{quest.status}</span>
          </div>
          <p className="mt-1 text-[0.78rem] text-mist">
            <RichText text={quest.description} />
          </p>
          <ul className="mt-2 space-y-1.5">
            {quest.objectives.map((objective) => (
              <li key={objective.id} className={`flex gap-2 text-[0.8rem] ${objective.completed ? "text-mist line-through decoration-gold/40" : "text-parchment"}`}>
                <span className={objective.completed ? "text-verdant" : "text-gold/70"}>{objective.completed ? "✓" : "◇"}</span>
                <span>
                  <RichText text={objective.description} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {adventure.decisions.length > 0 && (
        <div>
          <p className="label mb-1.5">Decisions</p>
          <ul className="space-y-1 text-[0.78rem] text-parchment/85">
            {adventure.decisions.map((decision, i) => (
              <li key={i}>
                • <RichText text={decision} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InventoryTab({ adventure }: { adventure: Adventure }) {
  return (
    <div className="space-y-4">
      {adventure.party.map((hero) => (
        <div key={hero.id}>
          <p className="label mb-1.5">{hero.name}</p>
          {hero.inventory.length === 0 && <p className="text-[0.78rem] text-mist">Empty-handed.</p>}
          <ul className="space-y-1.5">
            {hero.inventory.map((item) => (
              <li key={item.item_id} className="rounded border border-white/5 bg-ink/30 px-2.5 py-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-[0.82rem] text-parchment">{item.name}</span>
                  <span className="text-[0.68rem] text-mist">{item.quantity > 1 ? `×${item.quantity}` : item.kind}</span>
                </div>
                <p className="text-[0.7rem] leading-snug text-mist">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function JournalTab({ adventure }: { adventure: Adventure }) {
  if (!adventure.journal.length) return <p className="font-serif italic text-mist">The pages are still blank.</p>;
  return (
    <ul className="space-y-3">
      {[...adventure.journal].reverse().map((entry, i) => (
        <li key={i} className="border-l border-gold/30 pl-3">
          <p className="text-[0.6rem] uppercase tracking-[0.18em] text-gold/60">
            {entry.category} · turn {entry.turn_number}
          </p>
          <p className="font-display text-[0.85rem] text-parchment">{entry.title}</p>
          <p className="font-serif text-[0.95rem] leading-snug text-parchment/80">
            <RichText text={entry.text} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function dispositionLabel(value: number) {
  if (value >= 60) return "Devoted";
  if (value >= 30) return "Friendly";
  if (value >= 10) return "Warm";
  if (value > -10) return "Neutral";
  if (value > -40) return "Wary";
  return "Hostile";
}

function CompanionsTab({ adventure }: { adventure: Adventure }) {
  const here = adventure.npcs.filter((npc) => npc.present);
  const away = adventure.npcs.filter((npc) => !npc.present);
  return (
    <div className="space-y-4">
      {[
        { title: "With you here", hint: `In ${adventure.scene.title}`, npcs: here },
        { title: "Elsewhere", hint: "Not in this scene", npcs: away },
      ].map(
        (group) =>
          group.npcs.length > 0 && (
            <section key={group.title}>
              <p className="label mb-2 flex items-baseline justify-between gap-2">
                <span>{group.title}</span>
                <span className="text-[0.6rem] normal-case tracking-normal text-mist/70">{group.hint}</span>
              </p>
              <AllyList npcs={group.npcs} away={group.npcs === away} />
            </section>
          ),
      )}
    </div>
  );
}

function AllyList({ npcs, away }: { npcs: Adventure["npcs"]; away: boolean }) {
  const openArt = useOpenArt();
  return (
    <ul className="space-y-2.5">
      {npcs.map((npc) => (
        // Allies elsewhere stay in colour, just quieter; grey is kept for heroes who are down.
        <li key={npc.id} className={`flex gap-2.5 ${away ? "opacity-70" : ""}`}>
          <Portrait
            name={npc.name}
            accent={npc.visual.accent_color}
            sigil={npc.visual.sigil}
            imageKey={npc.visual.portrait_image_key}
            size={38}
            onOpen={() => openArt({ kind: "portrait", id: npc.id })}
          />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <span className="text-[0.82rem] text-parchment">{npc.name}</span>
              <span className="text-[0.65rem] text-mist">{dispositionLabel(npc.disposition)}</span>
            </div>
            <p className="text-[0.68rem] text-gold/60">
              {npc.title}
              {npc.is_companion ? " · companion" : ""}
            </p>
            <p className="text-[0.7rem] leading-snug text-mist">{npc.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DiceTab({ rolls }: { rolls: DiceRoll[] }) {
  if (!rolls.length) return <p className="text-mist">No dice have been cast yet.</p>;
  return (
    <ul className="space-y-1.5 font-mono text-[0.7rem]">
      {[...rolls].reverse().map((roll) => {
        const tone = roll.outcome.includes("success") ? "text-verdant" : roll.outcome.includes("failure") ? "text-ember" : "text-mist";
        return (
          <li key={roll.id} className="rounded border border-white/5 bg-ink/30 px-2 py-1">
            <div className="flex justify-between gap-2">
              <span className="text-parchment/90">{roll.actor_name}</span>
              <span className="text-mist">turn {roll.turn_number}</span>
            </div>
            <p className="text-mist">
              <RichText text={roll.purpose} />
            </p>
            <p className={tone}>
              [{roll.rolls.join(", ")}] {roll.expression} = {roll.total}
              {roll.target_number !== null && roll.target_label !== "Initiative" ? ` vs ${roll.target_label} ${roll.target_number}` : ""}
              {roll.mode !== "normal" ? ` (${roll.mode})` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
