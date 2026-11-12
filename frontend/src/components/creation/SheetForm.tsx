import type { ReactNode } from "react";
import type { Ability, Attribute, Character, Composition, EffectBlock, Equipment, EquipmentSlot, HeroSheet, Pronouns } from "../../api/types";
import { Sigil } from "../common/Sigil";

// Mirrors SKILL_ATTRIBUTES in backend/app/models/state.py.
export const SKILLS: { id: string; attribute: Attribute }[] = [
  { id: "athletics", attribute: "might" },
  { id: "acrobatics", attribute: "agility" },
  { id: "stealth", attribute: "agility" },
  { id: "sleight_of_hand", attribute: "agility" },
  { id: "arcana", attribute: "wits" },
  { id: "investigation", attribute: "wits" },
  { id: "nature", attribute: "wits" },
  { id: "lore", attribute: "wits" },
  { id: "insight", attribute: "spirit" },
  { id: "perception", attribute: "spirit" },
  { id: "medicine", attribute: "spirit" },
  { id: "survival", attribute: "spirit" },
  { id: "animal_handling", attribute: "spirit" },
  { id: "persuasion", attribute: "presence" },
  { id: "deception", attribute: "presence" },
  { id: "intimidation", attribute: "presence" },
];
export const ATTRIBUTES: Attribute[] = ["might", "agility", "wits", "spirit", "presence"];
const ACCENT_COLORS = ["#8b6fd6", "#6fae6a", "#c9a14a", "#63b8e6", "#d67a6f", "#d6a3e0", "#e0a050", "#a9c6ff"];
const SIGILS = ["crystal", "leaf", "moon", "crown", "arrow", "eye", "antler", "gear", "spore", "circle"];
const PRONOUNS: { id: Pronouns; label: string }[] = [
  { id: "she", label: "She" },
  { id: "he", label: "He" },
  { id: "they", label: "They" },
];
const SLOT_LABELS: Record<EquipmentSlot, { heading: string; note: string; add: string }> = {
  weapon: { heading: "Weapons", note: "Anything this hero fights with, and how. Each weapon gives an attack.", add: "Add a weapon" },
  armor: { heading: "Armor", note: "What protects them. The bonus adds to Armor Class when you recalculate it.", add: "Add armor" },
  accessory: { heading: "Accessories", note: "Trinkets, tools and keepsakes. One can give advantage on chosen skills.", add: "Add an accessory" },
};
const ENEMY_CONDITIONS = ["restrained", "distracted", "blinded", "frightened"];
const ALLY_CONDITIONS = ["hidden", "guarding"];

const label = (text: string) => text.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const modifierOf = (score: number) => Math.floor((score - 10) / 2);
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
const toList = (text: string) => text.split(",").map((part) => part.trim()).filter(Boolean);
const whole = (text: string, fallback: number) => (Number.isFinite(parseInt(text, 10)) ? parseInt(text, 10) : fallback);

/** A sheet with nothing decided, for a player who would rather write every line themself. */
export function blankSheet(name = ""): HeroSheet {
  return {
    name, pronouns: "they", role: "", class_name: "Adventurer", concept: "", ancestry: "", biography: "", level: 1,
    attributes: { might: 10, agility: 10, wits: 10, spirit: 10, presence: 10 },
    proficient_skills: [], max_hp: 10, hp: null, armor_class: 10, resource_name: "Focus", resource_max: 4, resource_current: null,
    equipment: [], abilities: [], appearance: "", attire: "", features: [], palette: [], accent_color: "#c9a14a", sigil: "circle",
  };
}

/** The editable sheet of a hero already in play. */
export function sheetOf(hero: Character): HeroSheet {
  return {
    name: hero.name,
    pronouns: (["she", "he", "they"].includes(hero.pronouns) ? hero.pronouns : "they") as Pronouns,
    role: hero.role ?? "", class_name: hero.class_name, concept: hero.concept ?? "", ancestry: hero.ancestry ?? "", biography: hero.biography,
    level: hero.level, attributes: { ...(hero.attributes as Record<Attribute, number>) }, proficient_skills: [...hero.proficient_skills],
    max_hp: hero.max_hp, hp: hero.hp, armor_class: hero.armor_class, resource_name: hero.resource_name,
    resource_max: hero.resource_max, resource_current: hero.resource_current,
    equipment: (hero.equipment ?? []).map((item) => ({ ...item })), abilities: hero.abilities.map((ability) => ({ ...ability })),
    appearance: hero.visual.physical_description, attire: hero.visual.clothing_and_equipment,
    features: [...hero.visual.distinguishing_features], palette: [...hero.visual.color_palette],
    accent_color: hero.visual.accent_color, sigil: hero.visual.sigil,
  };
}

/** Armor Class from what is worn: 10 + armor bonuses + Agility (as far as the heaviest piece allows). */
export function armorClassFor(sheet: HeroSheet): number {
  const armor = sheet.equipment.filter((item) => item.slot === "armor");
  const caps = armor.map((item) => item.max_agility_bonus).filter((cap): cap is number => cap !== null);
  const agility = Math.min(modifierOf(sheet.attributes.agility), ...(caps.length ? caps : [99]));
  return 10 + armor.reduce((sum, item) => sum + item.armor_bonus, 0) + agility;
}

function newEquipment(slot: EquipmentSlot): Equipment {
  return {
    id: "", slot, name: "", description: "", how_used: "", qualities: [],
    attack_attribute: slot === "weapon" ? "might" : null, damage_dice: slot === "weapon" ? "1d8" : null, damage_type: "",
    armor_bonus: slot === "armor" ? 1 : 0, max_agility_bonus: null, advantage_on_skills: [],
  };
}

function newAbility(): Ability {
  return {
    id: "", name: "", description: "", kind: "technique", usable_in: "any", cost: 1, source: "created",
    composition: { name: "", flavor: "", check: "skill", attribute: "spirit", skill: null, resource_spent: 1, effects: [{ kind: "narrative", target: "self", power: "minor", condition: null }] },
  };
}

interface SheetFormProps {
  sheet: HeroSheet;
  onChange: (sheet: HeroSheet) => void;
  /** During play: also show current hit points and resource. */
  inPlay?: boolean;
}

/** Every field of a hero's sheet, editable. The structure is fixed; what goes in it is up to the player. */
export function SheetForm({ sheet, onChange, inPlay = false }: SheetFormProps) {
  const set = (changes: Partial<HeroSheet>) => onChange({ ...sheet, ...changes });
  const setEquipment = (index: number, changes: Partial<Equipment>) =>
    set({ equipment: sheet.equipment.map((item, i) => (i === index ? { ...item, ...changes } : item)) });
  const setAbility = (index: number, changes: Partial<Ability>) =>
    set({ abilities: sheet.abilities.map((ability, i) => (i === index ? { ...ability, ...changes } : ability)) });
  const toggleSkill = (skill: string) =>
    set({ proficient_skills: sheet.proficient_skills.includes(skill) ? sheet.proficient_skills.filter((s) => s !== skill) : [...sheet.proficient_skills, skill] });
  const suggestedArmor = armorClassFor(sheet);

  return (
    <div className="space-y-4">
      <Section heading="Who they are">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="input font-display text-lg tracking-wide" value={sheet.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Pronouns">
            <div className="flex gap-1.5">
              {PRONOUNS.map((p) => <Choice key={p.id} selected={sheet.pronouns === p.id} onClick={() => set({ pronouns: p.id })}>{p.label}</Choice>)}
            </div>
          </Field>
          <Field label="Class"><input className="input" value={sheet.class_name} maxLength={40} placeholder="Anything: Priest, Storm Duelist, Bone Gardener" onChange={(e) => set({ class_name: e.target.value })} /></Field>
          <Field label="Role"><input className="input" value={sheet.role} maxLength={60} placeholder="Their place in the party" onChange={(e) => set({ role: e.target.value })} /></Field>
          <Field label="Ancestry"><input className="input" value={sheet.ancestry} maxLength={60} placeholder="Their people or kind" onChange={(e) => set({ ancestry: e.target.value })} /></Field>
          <Field label="In one line"><input className="input" value={sheet.concept} maxLength={160} onChange={(e) => set({ concept: e.target.value })} /></Field>
        </div>
        <Field label="Background" className="mt-3"><textarea className="input resize-y" rows={3} maxLength={1200} value={sheet.biography} onChange={(e) => set({ biography: e.target.value })} /></Field>
      </Section>

      <Section heading="Body and training" note="The numbers behind the dice. Change any of them: your edit is final.">
        <div className="grid grid-cols-5 gap-1.5">
          {ATTRIBUTES.map((attribute) => (
            <label key={attribute} className="rounded border border-white/5 bg-ink/30 p-1.5 text-center">
              <span className="block text-[0.6rem] uppercase tracking-wider text-mist">{attribute}</span>
              <input className="w-full bg-transparent text-center font-display text-lg text-parchment focus:outline-none" inputMode="numeric" aria-label={attribute}
                value={sheet.attributes[attribute]} onChange={(e) => set({ attributes: { ...sheet.attributes, [attribute]: whole(e.target.value, 10) } })} />
              <span className="block text-[0.68rem] text-gold-soft">{signed(modifierOf(sheet.attributes[attribute]))}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Num label="Level" value={sheet.level} onChange={(level) => set({ level })} />
          <Num label="Max hit points" value={sheet.max_hp} onChange={(max_hp) => set({ max_hp })} />
          <div>
            <Num label="Armor Class" value={sheet.armor_class} onChange={(armor_class) => set({ armor_class })} />
            {suggestedArmor !== sheet.armor_class && (
              <button type="button" className="mt-1 text-[0.68rem] text-gold-soft underline-offset-4 hover:underline" onClick={() => set({ armor_class: suggestedArmor })}>
                From armor: {suggestedArmor}
              </button>
            )}
          </div>
          <Field label="Resource"><input className="input" value={sheet.resource_name} maxLength={24} placeholder="Faith, Mana, Rage…" onChange={(e) => set({ resource_name: e.target.value })} /></Field>
          <Num label={`Max ${sheet.resource_name || "resource"}`} value={sheet.resource_max} onChange={(resource_max) => set({ resource_max })} />
          {inPlay && <Num label="Hit points now" value={sheet.hp ?? sheet.max_hp} onChange={(hp) => set({ hp })} />}
          {inPlay && <Num label={`${sheet.resource_name || "Resource"} now`} value={sheet.resource_current ?? sheet.resource_max} onChange={(resource_current) => set({ resource_current })} />}
        </div>
        <p className="label mb-1.5 mt-4">Trained skills</p>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((skill) => <Choice key={skill.id} selected={sheet.proficient_skills.includes(skill.id)} onClick={() => toggleSkill(skill.id)}>{label(skill.id)}</Choice>)}
        </div>
      </Section>

      {(["weapon", "armor", "accessory"] as EquipmentSlot[]).map((slot) => (
        <Section key={slot} heading={SLOT_LABELS[slot].heading} note={SLOT_LABELS[slot].note}>
          <ul className="space-y-2">
            {sheet.equipment.map((item, index) => item.slot === slot && (
              <li key={index} className="rounded-lg border border-white/10 bg-ink/30 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <input className="input font-display tracking-wide" placeholder="Name" maxLength={60} value={item.name} aria-label={`${slot} name`} onChange={(e) => setEquipment(index, { name: e.target.value })} />
                  <input className="input" placeholder="What it is" maxLength={300} value={item.description} aria-label={`${slot} description`} onChange={(e) => setEquipment(index, { description: e.target.value })} />
                  <Remove onClick={() => set({ equipment: sheet.equipment.filter((_, i) => i !== index) })} what={item.name || slot} />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {slot === "weapon" && <input className="input" placeholder="How this hero uses it" maxLength={200} value={item.how_used} aria-label="How it is used" onChange={(e) => setEquipment(index, { how_used: e.target.value })} />}
                  <input className="input" placeholder="Qualities, separated by commas" value={item.qualities.join(", ")} aria-label="Qualities" onChange={(e) => setEquipment(index, { qualities: toList(e.target.value) })} />
                </div>
                {slot === "weapon" && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Pick label="Guided by" value={item.attack_attribute ?? "might"} options={ATTRIBUTES} onChange={(value) => setEquipment(index, { attack_attribute: value as Attribute })} />
                    <Field label="Damage dice"><input className="input" value={item.damage_dice ?? ""} placeholder="1d8" maxLength={12} onChange={(e) => setEquipment(index, { damage_dice: e.target.value })} /></Field>
                    <Field label="Damage type"><input className="input" value={item.damage_type} placeholder="slashing, frost…" maxLength={30} onChange={(e) => setEquipment(index, { damage_type: e.target.value })} /></Field>
                  </div>
                )}
                {slot === "armor" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Num label="Armor bonus" value={item.armor_bonus} onChange={(armor_bonus) => setEquipment(index, { armor_bonus })} />
                    <Field label="Most Agility can add">
                      <input className="input" inputMode="numeric" placeholder="No limit" value={item.max_agility_bonus ?? ""} onChange={(e) => setEquipment(index, { max_agility_bonus: e.target.value.trim() === "" ? null : whole(e.target.value, 0) })} />
                    </Field>
                  </div>
                )}
                {slot === "accessory" && (
                  <div className="mt-2">
                    <p className="label mb-1">Gives advantage on</p>
                    <div className="flex flex-wrap gap-1">
                      {SKILLS.map((skill) => {
                        const on = item.advantage_on_skills.includes(skill.id);
                        return <Choice key={skill.id} small selected={on} onClick={() => setEquipment(index, { advantage_on_skills: on ? item.advantage_on_skills.filter((s) => s !== skill.id) : [...item.advantage_on_skills, skill.id] })}>{label(skill.id)}</Choice>;
                      })}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost mt-2 !py-1.5 text-xs" onClick={() => set({ equipment: [...sheet.equipment, newEquipment(slot)] })}>+ {SLOT_LABELS[slot].add}</button>
        </Section>
      ))}

      <Section heading="Spells and abilities" note="Name anything. Each is built from effect blocks so the dice know what to do; the description is yours.">
        <ul className="space-y-2">
          {sheet.abilities.map((ability, index) => (
            <li key={index} className="rounded-lg border border-white/10 bg-ink/30 p-3">
              {ability.source === "equipment" ? (
                <p className="text-sm text-parchment/90">⚔ {ability.name} <span className="text-mist">· {ability.summary} · follows the weapon above</span></p>
              ) : (
                <AbilityEditor
                  ability={ability}
                  resource={sheet.resource_name}
                  onChange={(changes) => setAbility(index, changes)}
                  onRemove={() => set({ abilities: sheet.abilities.filter((_, i) => i !== index) })}
                />
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost mt-2 !py-1.5 text-xs" onClick={() => set({ abilities: [...sheet.abilities, newAbility()] })}>+ Add a spell or ability</button>
      </Section>

      <Section heading="Look" note="Portraits and the narrator draw on this.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Appearance"><textarea className="input resize-y" rows={2} maxLength={400} value={sheet.appearance} onChange={(e) => set({ appearance: e.target.value })} /></Field>
          <Field label="Attire and gear"><textarea className="input resize-y" rows={2} maxLength={400} value={sheet.attire} onChange={(e) => set({ attire: e.target.value })} /></Field>
          <Field label="Distinguishing marks"><input className="input" value={sheet.features.join(", ")} placeholder="Separated by commas" onChange={(e) => set({ features: toList(e.target.value) })} /></Field>
          <Field label="Colours"><input className="input" value={sheet.palette.join(", ")} placeholder="Separated by commas" onChange={(e) => set({ palette: toList(e.target.value) })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
            {ACCENT_COLORS.map((color) => (
              <button type="button" key={color} role="radio" aria-checked={sheet.accent_color === color} aria-label={`Colour ${color}`} onClick={() => set({ accent_color: color })}
                className={`h-6 w-6 rounded-full border-2 ${sheet.accent_color === color ? "border-parchment" : "border-transparent"}`} style={{ background: color }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Emblem">
            {SIGILS.map((name) => (
              <button type="button" key={name} role="radio" aria-checked={sheet.sigil === name} aria-label={`Emblem ${name}`} title={label(name)} onClick={() => set({ sigil: name })}
                className={`rounded border p-1 ${sheet.sigil === name ? "border-gold/70 bg-gold/10" : "border-white/10"}`} style={{ color: sheet.accent_color }}>
                <Sigil name={name} className="h-5 w-5" />
              </button>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function AbilityEditor({ ability, resource, onChange, onRemove }: { ability: Ability; resource: string; onChange: (changes: Partial<Ability>) => void; onRemove: () => void }) {
  const composition = ability.composition ?? null;
  const setComposition = (changes: Partial<Composition>) => composition && onChange({ composition: { ...composition, ...changes } });
  const setEffect = (index: number, changes: Partial<EffectBlock>) =>
    composition && setComposition({ effects: composition.effects.map((effect, i) => (i === index ? { ...effect, ...changes } : effect)) });
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_auto]">
        <input className="input font-display tracking-wide" placeholder="Name" maxLength={40} value={ability.name} aria-label="Ability name" onChange={(e) => onChange({ name: e.target.value })} />
        <label className="flex items-center gap-1.5 text-[0.7rem] text-mist" title={`${resource || "Resource"} spent each use`}>
          Cost
          <input className="input !px-2 text-center" inputMode="numeric" value={ability.cost} aria-label="Cost" onChange={(e) => onChange({ cost: Math.max(0, whole(e.target.value, 0)) })} />
        </label>
        <select className="input" value={ability.usable_in} aria-label="When it can be used" onChange={(e) => onChange({ usable_in: e.target.value as Ability["usable_in"] })}>
          <option value="any">Any time</option>
          <option value="combat">In a fight</option>
          <option value="exploration">Outside fights</option>
        </select>
        <Remove onClick={onRemove} what={ability.name || "ability"} />
      </div>
      <textarea className="input mt-2 resize-y" rows={2} maxLength={400} placeholder="What it is and what it looks like" value={ability.description} aria-label="Ability description" onChange={(e) => onChange({ description: e.target.value })} />
      {composition ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Pick label="Resolved by" value={composition.check} options={["attack", "save", "skill", "none"]}
              names={{ attack: "Attack roll", save: "Target resists", skill: "Skill check", none: "Automatic" }}
              onChange={(value) => setComposition({ check: value as Composition["check"] })} />
            <Pick label="Powered by" value={composition.attribute} options={ATTRIBUTES} onChange={(value) => setComposition({ attribute: value })} />
            {composition.check === "skill" && (
              <Pick label="Skill" value={composition.skill ?? ""} options={["", ...SKILLS.map((s) => s.id)]} names={{ "": "Best fit" }} onChange={(value) => setComposition({ skill: value || null })} />
            )}
          </div>
          {composition.effects.map((effect, index) => {
            const onEnemy = effect.target === "enemy" || effect.target === "all_enemies";
            const conditions = onEnemy ? ENEMY_CONDITIONS : ALLY_CONDITIONS;
            return (
              <div key={index} className="flex flex-wrap items-end gap-2 rounded border border-white/5 bg-night-900/60 p-2">
                <Pick label="Effect" value={effect.kind} options={["damage", "heal", "condition", "empower", "narrative"]}
                  names={{ empower: "Advantage", narrative: "Changes the world" }} onChange={(value) => setEffect(index, { kind: value as EffectBlock["kind"] })} />
                <Pick label="On" value={effect.target} options={["enemy", "all_enemies", "self", "ally", "party"]}
                  names={{ enemy: "One enemy", all_enemies: "Every enemy", ally: "One ally", party: "Whole party" }} onChange={(value) => setEffect(index, { target: value as EffectBlock["target"] })} />
                {effect.kind !== "narrative" && effect.kind !== "empower" && (
                  <Pick label="Strength" value={effect.power} options={["minor", "moderate", "major"]} onChange={(value) => setEffect(index, { power: value as EffectBlock["power"] })} />
                )}
                {effect.kind === "condition" && (
                  <>
                    <Pick label="Plays as" value={conditions.includes(effect.condition ?? "") ? (effect.condition as string) : conditions[0]} options={conditions} onChange={(value) => setEffect(index, { condition: value })} />
                    <Field label="Called"><input className="input !w-36" maxLength={30} placeholder="Your name for it" value={effect.label ?? ""} onChange={(e) => setEffect(index, { label: e.target.value || null })} /></Field>
                  </>
                )}
                <Remove onClick={() => setComposition({ effects: composition.effects.filter((_, i) => i !== index) })} what="effect" />
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="text-xs text-gold-soft underline-offset-4 hover:underline" onClick={() => setComposition({ effects: [...composition.effects, { kind: "damage", target: "enemy", power: "moderate", condition: null }] })}>
              + Add an effect
            </button>
            {ability.summary && <span className="text-[0.7rem] text-mist">As last saved: {ability.summary}{ability.house_ruled ? " · house-ruled" : ""}</span>}
          </div>
        </div>
      ) : (
        ability.kind === "attack" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Pick label="Guided by" value={ability.attack_attribute ?? "agility"} options={ATTRIBUTES} onChange={(value) => onChange({ attack_attribute: value as Attribute })} />
            <Field label="Damage dice"><input className="input" value={ability.damage_dice ?? ""} maxLength={12} onChange={(e) => onChange({ damage_dice: e.target.value })} /></Field>
          </div>
        )
      )}
    </>
  );
}

function Section({ heading, note, children }: { heading: string; note?: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="font-display text-base tracking-[0.14em] text-gold-soft">{heading}</h2>
      {note ? <p className="mb-3 mt-1 text-[0.78rem] leading-snug text-mist">{note}</p> : <div className="mt-3" />}
      {children}
    </section>
  );
}

function Field({ label: text, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="label mb-1 block">{text}</span>
      {children}
    </label>
  );
}

function Num({ label: text, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={text}>
      <input className="input" inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, whole(e.target.value, 0)))} />
    </Field>
  );
}

function Pick({ label: text, value, options, names = {}, onChange }: { label: string; value: string; options: string[]; names?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <Field label={text}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{names[option] ?? label(option)}</option>)}
      </select>
    </Field>
  );
}

function Choice({ selected, small = false, onClick, children }: { selected: boolean; small?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`chip ${small ? "!px-2.5 !py-1 !text-[0.72rem]" : ""} ${selected ? "!border-gold/80 !bg-gold/15 !text-parchment" : ""}`}>
      {children}
    </button>
  );
}

function Remove({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button type="button" className="h-9 shrink-0 rounded border border-white/10 px-2.5 text-sm text-mist hover:border-ember/60 hover:text-ember" onClick={onClick} aria-label={`Remove ${what}`} title={`Remove ${what}`}>
      ✕
    </button>
  );
}
