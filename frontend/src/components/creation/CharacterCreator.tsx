import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type { Attribute, CallingDefinition, CreationOptions, HeroBuild, HeroRole, Pronouns } from "../../api/types";
import { Portrait } from "../common/Portrait";
import { Sigil } from "../common/Sigil";
import { SceneArt } from "../scene/SceneArt";

interface CharacterCreatorProps {
  busy: boolean;
  /** The server's reason when it refused the party. */
  error: string | null;
  /** `null` plays the campaign's own heroes. */
  onBegin: (heroes: HeroBuild[] | null) => void;
  onCancel: () => void;
}

const ATTRIBUTE_NOTES: Record<Attribute, string> = {
  might: "Strength and toughness. Adds hit points; powers heavy blows and athletics.",
  agility: "Speed and precision. Adds armor class; powers stealth, acrobatics and finesse weapons.",
  wits: "Reason and memory. Powers arcana, lore, investigation and nature.",
  spirit: "Will and intuition. Powers healing, perception, insight and survival.",
  presence: "Force of personality. Powers persuasion, deception and the Shadow's hold on a foe.",
};
const PRONOUNS: { id: Pronouns; label: string }[] = [
  { id: "she", label: "She / her" },
  { id: "he", label: "He / him" },
];
const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]*[A-Za-z]$/;

const modifierOf = (score: number) => Math.floor((score - 10) / 2);
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The numbers the server will derive, so the player sees the sheet as they shape it. */
function derive(options: CreationOptions, role: HeroRole, build: HeroBuild) {
  const ancestry = options.ancestries.find((a) => a.id === build.ancestry);
  const calling = role.callings.find((c) => c.id === build.calling) ?? role.callings[0];
  const origin = role.origins.find((o) => o.id === build.origin) ?? role.origins[0];
  const totals = Object.fromEntries(
    options.attributes.map((attribute) => [attribute, build.attributes[attribute] + (ancestry?.bonuses[attribute] ?? 0)]),
  ) as Record<Attribute, number>;
  const spent = options.attributes.reduce((sum, attribute) => sum + (options.point_buy.costs[String(build.attributes[attribute])] ?? 0), 0);
  return {
    ancestry,
    calling,
    origin,
    totals,
    remaining: options.point_buy.budget - spent,
    hp: Math.max(1, calling.base_hp + options.point_buy.hp_per_might_modifier * modifierOf(totals.might)),
    armorClass: calling.base_armor_class + Math.min(modifierOf(totals.agility), calling.max_agility_bonus),
    skillChoices: calling.skill_choices.filter((skill) => skill !== origin.skill),
  };
}

/** Why this hero cannot begin yet, in the player's terms; null when the build is ready. */
function problem(options: CreationOptions, role: HeroRole, build: HeroBuild, otherName: string): string | null {
  const sheet = derive(options, role, build);
  const name = build.name.trim();
  if (name.length < 2) return `${role.name} needs a name.`;
  if (name.length > options.name_max_length || !NAME_PATTERN.test(name)) return `${name}: names use letters, with spaces, hyphens or apostrophes inside.`;
  if (name.toLowerCase() === otherName.trim().toLowerCase()) return "Give each hero a different name.";
  if (sheet.remaining < 0) return `${name} has spent ${-sheet.remaining} attribute point${sheet.remaining === -1 ? "" : "s"} too many.`;
  const picked = build.skills.filter((skill) => sheet.skillChoices.includes(skill)).length;
  if (picked !== sheet.calling.skill_picks) return `${name} needs ${sheet.calling.skill_picks} skills (${picked} chosen).`;
  return null;
}

export function CharacterCreator({ busy, error, onBegin, onCancel }: CharacterCreatorProps) {
  const [options, setOptions] = useState<CreationOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [builds, setBuilds] = useState<Record<string, HeroBuild>>({});
  const [activeId, setActiveId] = useState("");
  // Once the player sets attributes by hand, a new calling no longer replaces them with its recommended spread.
  const [handSet, setHandSet] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .creationOptions()
      .then((loaded) => {
        if (cancelled) return;
        setOptions(loaded);
        setBuilds(Object.fromEntries(loaded.roles.map((role) => [role.id, role.default_build])));
        setActiveId(loaded.roles[0]?.id ?? "");
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const problems = useMemo(() => {
    if (!options) return {};
    return Object.fromEntries(
      options.roles.map((role) => {
        const other = options.roles.find((r) => r.id !== role.id);
        return [role.id, builds[role.id] ? problem(options, role, builds[role.id], other ? (builds[other.id]?.name ?? "") : "") : "Loading"];
      }),
    ) as Record<string, string | null>;
  }, [options, builds]);

  if (!options || !activeId) {
    return (
      <Backdrop>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="font-serif text-xl italic text-parchment/80">{loadError ?? "Gathering the threads of your tale…"}</p>
          <button className="btn-ghost" onClick={onCancel}>Back</button>
        </div>
      </Backdrop>
    );
  }

  const role = options.roles.find((r) => r.id === activeId) ?? options.roles[0];
  const build = builds[role.id];
  const sheet = derive(options, role, build);
  const firstProblem = options.roles.map((r) => problems[r.id]).find(Boolean) ?? null;
  const patch = (changes: Partial<HeroBuild>) => setBuilds((all) => ({ ...all, [role.id]: { ...all[role.id], ...changes } }));

  const chooseCalling = (calling: CallingDefinition) => {
    const choices = calling.skill_choices.filter((skill) => skill !== sheet.origin.skill);
    patch({
      calling: calling.id,
      skills: build.skills.filter((skill) => choices.includes(skill)).slice(0, calling.skill_picks),
      ...(handSet[role.id] ? {} : { attributes: calling.recommended_attributes }),
    });
  };
  const chooseOrigin = (originId: string) => {
    const origin = role.origins.find((o) => o.id === originId);
    patch({ origin: originId, skills: build.skills.filter((skill) => skill !== origin?.skill) });
  };
  const step = (attribute: Attribute, delta: number) => {
    const next = build.attributes[attribute] + delta;
    if (next < options.point_buy.minimum || next > options.point_buy.maximum) return;
    setHandSet((all) => ({ ...all, [role.id]: true }));
    patch({ attributes: { ...build.attributes, [attribute]: next } });
  };
  const toggleSkill = (skill: string) => {
    if (build.skills.includes(skill)) patch({ skills: build.skills.filter((s) => s !== skill) });
    else if (build.skills.length < sheet.calling.skill_picks) patch({ skills: [...build.skills, skill] });
  };
  const skillName = (id: string) => options.skills.find((s) => s.id === id)?.name ?? id;
  const accent = build.accent_color ?? role.accent_color;
  const sigil = build.sigil ?? role.sigil;
  const begin = () => {
    if (firstProblem || busy) return;
    onBegin(options.roles.map((r) => ({ ...builds[r.id], name: builds[r.id].name.trim() })));
  };

  return (
    <Backdrop>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-3 pb-6 pt-6 sm:px-5">
            <header className="text-center">
              <p className="label text-gold/70">{options.campaign_title}</p>
              <h1 className="mt-2 font-display text-3xl tracking-[0.12em] text-gold-soft sm:text-4xl">Who answers the summons?</h1>
              <p className="mx-auto mt-3 max-w-2xl font-serif text-lg italic text-parchment/80">{options.premise}</p>
            </header>

            <div className="mt-6 grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Heroes">
              {options.roles.map((r) => {
                const selected = r.id === role.id;
                const b = builds[r.id];
                return (
                  <button
                    key={r.id}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveId(r.id)}
                    className={`panel flex items-center gap-3 p-3 text-left transition ${selected ? "!border-gold/70 shadow-glow" : "opacity-75 hover:opacity-100"}`}
                  >
                    <Portrait name={b.name || r.default_name} accent={b.accent_color ?? r.accent_color} sigil={b.sigil ?? r.sigil} size={46} />
                    <span className="min-w-0 flex-1">
                      <span className="label block">{r.name}</span>
                      <span className="block truncate font-display text-lg tracking-wide text-parchment">{b.name.trim() || "Unnamed"}</span>
                      <span className="block truncate text-[0.72rem] text-mist">{r.tagline}</span>
                    </span>
                    <span className={`text-sm ${problems[r.id] ? "text-mist" : "text-[#9fc98a]"}`} title={problems[r.id] ?? "Ready"}>
                      {problems[r.id] ? "…" : "✓"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]" role="tabpanel">
              <div className="space-y-4">
                <Section heading="Your place in the story" note={role.story}>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Field label="Name">
                      <input
                        value={build.name}
                        maxLength={options.name_max_length}
                        onChange={(event) => patch({ name: event.target.value })}
                        placeholder={role.default_name}
                        className="input font-display text-lg tracking-wide"
                        aria-label={`${role.name} name`}
                      />
                    </Field>
                    <Field label="Pronouns">
                      <div className="flex flex-wrap gap-1.5">
                        {PRONOUNS.map((p) => (
                          <Choice key={p.id} selected={build.pronouns === p.id} onClick={() => patch({ pronouns: p.id })}>{p.label}</Choice>
                        ))}
                      </div>
                    </Field>
                  </div>
                </Section>

                <Section heading={role.origin_question} note="Your past is part of this story: the opening remembers it, and it gives you an edge where it would matter.">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {role.origins.map((origin) => (
                      <Card key={origin.id} selected={build.origin === origin.id} onClick={() => chooseOrigin(origin.id)} title={origin.name}>
                        <p>{origin.summary}</p>
                        <p className="mt-1.5 text-gold-soft/90">Skilled in {skillName(origin.skill)}. {origin.story_edge}</p>
                      </Card>
                    ))}
                  </div>
                </Section>

                <Section heading="Ancestry" note="Who your people are. Each adds to the attributes you buy below.">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {options.ancestries.map((ancestry) => (
                      <Card key={ancestry.id} selected={build.ancestry === ancestry.id} onClick={() => patch({ ancestry: ancestry.id })} title={ancestry.name}>
                        <p>{ancestry.summary}</p>
                        <p className="mt-1.5 text-gold-soft/90">
                          {Object.entries(ancestry.bonuses).map(([attribute, bonus]) => `${signed(bonus ?? 0)} ${title(attribute)}`).join(" · ")}
                        </p>
                      </Card>
                    ))}
                  </div>
                </Section>

                <Section heading="Calling" note={`How you fight and what you trained in. ${role.resource_summary}`}>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {role.callings.map((calling) => (
                      <Card key={calling.id} selected={build.calling === calling.id} onClick={() => chooseCalling(calling)} title={calling.name}>
                        <p>{calling.summary}</p>
                        <p className="mt-1.5 text-gold-soft/90">
                          {calling.base_hp} HP · AC {calling.base_armor_class}+ · {calling.resource_max} {role.resource_name}
                        </p>
                        <p className="text-mist">
                          {calling.attacks.map((a) => `${a.name} (${a.damage_dice ?? "1d4"}, ${title(a.attack_attribute ?? "agility")})`).join(" · ")}
                        </p>
                      </Card>
                    ))}
                  </div>
                </Section>

                <Section
                  heading="Attributes"
                  note={`Spend ${options.point_buy.budget} points. Scores run ${options.point_buy.minimum} to ${options.point_buy.maximum} before your ancestry bonus; the last two steps cost double.`}
                  aside={
                    <span className={`font-display text-sm tracking-wider ${sheet.remaining < 0 ? "text-ember" : "text-gold-soft"}`} aria-live="polite">
                      {sheet.remaining} point{sheet.remaining === 1 ? "" : "s"} left
                    </span>
                  }
                >
                  <ul className="space-y-1.5">
                    {options.attributes.map((attribute) => {
                      const bought = build.attributes[attribute];
                      const bonus = sheet.ancestry?.bonuses[attribute] ?? 0;
                      const raise = (options.point_buy.costs[String(bought + 1)] ?? 0) - (options.point_buy.costs[String(bought)] ?? 0);
                      return (
                        <li key={attribute} className="flex items-center gap-2 rounded border border-white/5 bg-ink/30 px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-sm tracking-wider text-parchment">{title(attribute)}</p>
                            <p className="hidden text-[0.68rem] leading-snug text-mist sm:block">{ATTRIBUTE_NOTES[attribute]}</p>
                          </div>
                          <button className="stepper" onClick={() => step(attribute, -1)} disabled={bought <= options.point_buy.minimum} aria-label={`Lower ${attribute}`}>−</button>
                          <span className="w-16 text-center">
                            <span className="font-display text-lg text-parchment">{sheet.totals[attribute]}</span>
                            {bonus > 0 && <span className="ml-1 text-[0.62rem] text-gold-soft" title={`${bought} bought + ${bonus} from ${sheet.ancestry?.name}`}>+{bonus}</span>}
                          </span>
                          <button
                            className="stepper"
                            onClick={() => step(attribute, 1)}
                            disabled={bought >= options.point_buy.maximum || raise > sheet.remaining}
                            aria-label={`Raise ${attribute}`}
                            title={bought >= options.point_buy.maximum ? "At the maximum" : `Costs ${raise}`}
                          >
                            +
                          </button>
                          <span className="w-9 text-right font-display text-sm text-gold-soft" title="Modifier added to rolls">{signed(modifierOf(sheet.totals[attribute]))}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    className="mt-2 text-xs text-gold-soft underline-offset-4 hover:underline"
                    onClick={() => {
                      setHandSet((all) => ({ ...all, [role.id]: false }));
                      patch({ attributes: sheet.calling.recommended_attributes });
                    }}
                  >
                    Use the {sheet.calling.name}'s recommended spread
                  </button>
                </Section>

                <Section
                  heading="Skills"
                  note={`Choose ${sheet.calling.skill_picks} the ${sheet.calling.name} trained in. Your origin already taught you ${skillName(sheet.origin.skill)}.`}
                  aside={<span className="font-display text-sm tracking-wider text-gold-soft">{build.skills.length} / {sheet.calling.skill_picks}</span>}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip !cursor-default !border-gold/60 !text-gold-soft" title="From your origin">✦ {skillName(sheet.origin.skill)}</span>
                    {sheet.skillChoices.map((skill) => {
                      const selected = build.skills.includes(skill);
                      return (
                        <Choice key={skill} selected={selected} disabled={!selected && build.skills.length >= sheet.calling.skill_picks} onClick={() => toggleSkill(skill)}>
                          {skillName(skill)}
                        </Choice>
                      );
                    })}
                  </div>
                </Section>

                <Section heading="Look and legend" note="All optional. Portraits and the narrator draw on what you write; leave a field empty to use the default.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Appearance">
                      <textarea value={build.appearance} maxLength={240} rows={2} onChange={(e) => patch({ appearance: e.target.value })} placeholder={sheet.ancestry?.appearance} className="input resize-none" />
                    </Field>
                    <Field label="Attire and gear">
                      <textarea value={build.attire} maxLength={240} rows={2} onChange={(e) => patch({ attire: e.target.value })} placeholder={sheet.calling.attire} className="input resize-none" />
                    </Field>
                    <Field label="A distinguishing mark">
                      <input value={build.features[0] ?? ""} maxLength={80} onChange={(e) => patch({ features: e.target.value ? [e.target.value] : [] })} placeholder="A scar, a tattoo, a keepsake…" className="input" />
                    </Field>
                    <Field label="One thing the world should know">
                      <input value={build.backstory} maxLength={300} onChange={(e) => patch({ backstory: e.target.value })} placeholder="A debt, a vow, someone left behind…" className="input" />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
                      {options.accent_colors.map((color) => (
                        <button key={color} role="radio" aria-checked={accent === color} aria-label={`Colour ${color}`} onClick={() => patch({ accent_color: color })}
                          className={`h-6 w-6 rounded-full border-2 ${accent === color ? "border-parchment" : "border-transparent"}`} style={{ background: color }} />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Emblem">
                      {options.sigils.map((name) => (
                        <button key={name} role="radio" aria-checked={sigil === name} aria-label={`Emblem ${name}`} title={title(name)} onClick={() => patch({ sigil: name })}
                          className={`rounded border p-1 ${sigil === name ? "border-gold/70 bg-gold/10" : "border-white/10"}`} style={{ color: accent }}>
                          <Sigil name={name} className="h-5 w-5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </Section>
              </div>

              <aside className="panel h-fit p-4 lg:sticky lg:top-2">
                <div className="flex items-center gap-3">
                  <Portrait name={build.name || role.default_name} accent={accent} sigil={sigil} size={64} shape="frame" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl tracking-wide text-parchment">{build.name.trim() || "Unnamed"}</p>
                    <p className="text-[0.75rem] text-mist">{sheet.ancestry?.name} {sheet.calling.name}</p>
                    <p className="text-[0.72rem] text-gold-soft/90">{role.tagline}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <Stat label="Hit points" value={sheet.hp} />
                  <Stat label="Armor" value={sheet.armorClass} />
                  <Stat label={role.resource_name} value={sheet.calling.resource_max} />
                </div>
                <p className="label mt-4">Fights with</p>
                <ul className="mt-1 space-y-1 text-[0.78rem] text-parchment/90">
                  {sheet.calling.attacks.map((a) => <li key={a.id}>⚔ {a.name} <span className="text-mist">· {a.damage_dice}</span></li>)}
                </ul>
                <p className="label mt-3">Gifts of the story</p>
                <ul className="mt-1 space-y-1 text-[0.78rem] text-parchment/90">
                  {role.gifts.map((gift) => (
                    <li key={gift.id} title={gift.description}>✦ {gift.name}{gift.cost > 0 && <span className="text-mist"> · {gift.cost} {role.resource_name}</span>}</li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.7rem] leading-snug text-mist">Every {role.name.replace("The ", "")} carries these, whatever their calling. Hover a gift to read it.</p>
              </aside>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-gold/15 bg-night-950/90 px-3 py-3 backdrop-blur sm:px-5">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>Back</button>
            <p className={`min-w-0 flex-1 text-sm ${error ? "text-ember" : "text-mist"}`} role="status">
              {error ?? firstProblem ?? "Both heroes are ready."}
            </p>
            <button className="text-xs text-mist underline-offset-4 hover:text-parchment hover:underline" onClick={() => onBegin(null)} disabled={busy}>
              Skip: play {options.roles.map((r) => r.default_name).join(" & ")}
            </button>
            <button className="btn-gold" onClick={begin} disabled={busy || firstProblem !== null}>
              {busy ? "Opening the tale…" : "Begin the tale"}
            </button>
          </div>
        </footer>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden">
      <SceneArt artKey="fey_court" visualState="default" />
      <div className="absolute inset-0 bg-ink/85" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

function Section({ heading, note, aside, children }: { heading: string; note?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base tracking-[0.14em] text-gold-soft">{heading}</h2>
        {aside}
      </div>
      {note && <p className="mb-3 mt-1 text-[0.78rem] leading-snug text-mist">{note}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Card({ title: heading, selected, onClick, children }: { title: string; selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left text-[0.76rem] leading-snug text-parchment/85 transition ${
        selected ? "border-gold/70 bg-gold/10" : "border-white/10 bg-ink/30 hover:border-gold/40"
      }`}
    >
      <span className="mb-1 flex items-center justify-between font-display text-sm tracking-wider text-parchment">
        {heading}
        {selected && <span className="text-gold">◆</span>}
      </span>
      {children}
    </button>
  );
}

function Choice({ selected, disabled = false, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={`chip ${selected ? "!border-gold/80 !bg-gold/15 !text-parchment" : ""}`}>
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/5 bg-ink/40 py-1.5">
      <p className="font-display text-xl text-parchment">{value}</p>
      <p className="text-[0.58rem] uppercase tracking-wider text-mist">{label}</p>
    </div>
  );
}
