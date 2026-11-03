import { motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import type { Settings, TextSize, TextSpeed } from "../../hooks/useSettings";
import type { VoiceOptions } from "../../hooks/useVoices";
import { narrator, pickVoice, type NarratorVoice } from "../../lib/narrator";

const PREVIEW_LINE =
  "Beneath the Hollow Oak, something ancient stirs. Choose your path wisely, travellers — the darkness is listening.";

interface SettingsMenuProps {
  storyControl: number;
  storyBusy: boolean;
  onStoryControl: (level: number) => void;
  settings: Settings;
  voices: VoiceOptions;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function SettingsMenu({ storyControl, storyBusy, onStoryControl, settings, voices, onChange, onReset, onClose }: SettingsMenuProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/80 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <motion.div
        className="panel flex w-full max-w-2xl flex-col overflow-hidden rounded-none !bg-night-950 sm:max-h-[88vh] sm:rounded-xl"
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        exit={{ y: 24 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gold/15 px-5 py-4">
          <div>
            <p className="label">Eldoria</p>
            <h2 className="font-display text-xl tracking-wider text-gold-soft">Settings</h2>
          </div>
          <button className="btn-ghost !px-3 !py-1.5" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <Section title="Story control">
            <label className="block text-sm text-parchment">Who guides this tale?
              <select className="mt-2 block w-full rounded border border-gold/30 bg-night-900 p-2" value={storyControl} disabled={storyBusy} onChange={(event) => onStoryControl(Number(event.target.value))}>
                <option value={1}>1 · You are the DM</option><option value={2}>2 · You lead, AI adds touches</option><option value={3}>3 · Shared storytelling</option><option value={4}>4 · AI leads, you steer</option><option value={5}>5 · AI is the DM</option>
              </select>
            </label><p className="mt-2 text-xs text-mist">Saved with this adventure. Changes apply to the next turn; existing story stays as written. Levels 1–3 require your next-chapter direction.</p>
          </Section>
          <NarratorSection settings={settings} voices={voices} onChange={onChange} />

          <Section title="Reading">
            <Row label="Text reveal speed">
              <Segmented<TextSpeed>
                value={settings.textSpeed}
                options={[
                  ["cinematic", "Cinematic"],
                  ["fast", "Fast"],
                  ["instant", "Instant"],
                ]}
                onChange={(textSpeed) => onChange({ textSpeed })}
              />
            </Row>
            <Row label="Text size">
              <Segmented<TextSize>
                value={settings.textSize}
                options={[
                  ["small", "A"],
                  ["medium", "A+"],
                  ["large", "A++"],
                ]}
                onChange={(textSize) => onChange({ textSize })}
              />
            </Row>
            <Toggle
              label="Show “What just happened” after each turn"
              hint="A short recap of the turn's outcome and what was said."
              checked={settings.showTurnRecap}
              onChange={(showTurnRecap) => onChange({ showTurnRecap })}
            />
          </Section>

          <Section title="Sound">
            <Toggle label="Ambient sound & effects" checked={settings.audioEnabled} onChange={(audioEnabled) => onChange({ audioEnabled })} />
            <Slider label="Ambience volume" value={settings.volume} min={0} max={1} step={0.05} onChange={(volume) => onChange({ volume })} format={percent} />
          </Section>

          <Section title="Display & gameplay">
            <Toggle label="Animated dice rolls" checked={settings.diceAnimations} onChange={(diceAnimations) => onChange({ diceAnimations })} />
            <Toggle
              label="Reduce motion"
              hint="Calmer scenes: no drifting fog, floating motes or zooms."
              checked={settings.reduceMotion}
              onChange={(reduceMotion) => onChange({ reduceMotion })}
            />
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gold/15 px-5 py-3">
          <button className="text-xs text-mist underline-offset-4 hover:text-parchment hover:underline" onClick={onReset}>
            Restore defaults
          </button>
          <button className="btn-gold !px-6 !py-2" onClick={onClose}>
            Done
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function NarratorSection({ settings, voices, onChange }: { settings: Settings; voices: VoiceOptions; onChange: (patch: Partial<Settings>) => void }) {
  const [filter, setFilter] = useState<"female" | "male" | "all">(settings.voiceGender);
  const [englishOnly, setEnglishOnly] = useState(true);
  const cloud = settings.narratorSource === "cloud";
  const pool = cloud ? voices.cloudVoices : voices.deviceVoices;
  const selectedId = cloud ? settings.cloudVoiceId : settings.deviceVoiceId;

  const visible = useMemo(() => {
    let list = pool;
    if (!cloud && englishOnly) list = list.filter((v) => v.lang.toLowerCase().startsWith("en"));
    if (filter !== "all") list = list.filter((v) => v.gender === filter);
    return [...list].sort((a, b) => Number(!!b.natural) - Number(!!a.natural) || a.label.localeCompare(b.label));
  }, [pool, cloud, englishOnly, filter]);

  const select = (voice: NarratorVoice) => onChange(cloud ? { cloudVoiceId: voice.id } : { deviceVoiceId: voice.id });

  const chooseGender = (gender: "female" | "male" | "all") => {
    setFilter(gender);
    if (gender === "all") return;
    const patch: Partial<Settings> = { voiceGender: gender };
    const current = pool.find((v) => v.id === selectedId);
    if (!current || current.gender !== gender) {
      const pick = pickVoice(pool, gender);
      if (pick) Object.assign(patch, cloud ? { cloudVoiceId: pick.id } : { deviceVoiceId: pick.id });
    }
    onChange(patch);
  };

  const preview = (voice: NarratorVoice) =>
    narrator.speakNow(PREVIEW_LINE, {
      source: voice.source,
      deviceVoiceId: voice.source === "device" ? voice.id : settings.deviceVoiceId,
      cloudVoiceId: voice.source === "cloud" ? voice.id : settings.cloudVoiceId,
    });

  return (
    <Section title="Narrator voice">
      <Toggle
        label="Narrate the story aloud"
        hint="A single narrator reads the story and, optionally, what characters say."
        checked={settings.narratorEnabled}
        onChange={(narratorEnabled) => onChange({ narratorEnabled })}
      />

      <div className={settings.narratorEnabled ? "space-y-4" : "pointer-events-none space-y-4 opacity-40"}>
        <Row label="Voice source">
          <Segmented<"device" | "cloud">
            value={settings.narratorSource}
            options={[
              ["device", "Device voices"],
              ["cloud", "AI voices"],
            ]}
            disabled={voices.cloudAvailable ? [] : ["cloud"]}
            onChange={(narratorSource) => onChange({ narratorSource, narratorSourceChosen: true })}
          />
        </Row>
        {!voices.cloudAvailable && (
          <p className="-mt-2 text-[0.72rem] leading-snug text-mist">
            Natural AI narrators (ElevenLabs or OpenAI) switch on automatically once the server has a key: add{" "}
            <code className="text-gold-soft">ELEVENLABS_API_KEY</code> or <code className="text-gold-soft">OPENAI_API_KEY</code> to{" "}
            <code className="text-gold-soft">backend/.env</code> and restart the backend. Until then, your device's built-in voices are used.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented<"female" | "male" | "all">
              value={filter}
              options={[
                ["female", "Female"],
                ["male", "Male"],
                ["all", "All voices"],
              ]}
              onChange={chooseGender}
            />
            {!cloud && (
              <label className="flex items-center gap-2 text-xs text-mist">
                <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} className="accent-[#c9a14a]" />
                English only
              </label>
            )}
          </div>

          <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Narrator voice">
            {visible.length === 0 && (
              <li className="rounded border border-white/5 bg-ink/40 px-3 py-3 text-sm text-mist">
                {pool.length === 0 ? "Loading voices… (this browser may not offer any)" : "No voices match this filter. Try “All voices”."}
              </li>
            )}
            {visible.map((voice) => {
              const selected = voice.id === selectedId;
              return (
                <li key={voice.id}>
                  <div
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                      selected ? "border-gold/60 bg-gold/10" : "border-white/5 bg-ink/40 hover:border-gold/30"
                    }`}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" role="radio" aria-checked={selected} onClick={() => select(voice)}>
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${selected ? "border-gold bg-gold" : "border-mist/60"}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-parchment">{voice.label}</span>
                        <span className="block text-[0.68rem] text-mist">
                          {voice.recommended && <span className="mr-1 text-gold-soft">★ Narrator pick ·</span>}
                          {voice.provider === "elevenlabs" ? "ElevenLabs · " : voice.provider === "openai" ? "OpenAI · " : ""}
                          {voice.description ?? voice.lang}
                          {voice.gender !== "unknown" ? ` · ${voice.gender}` : ""}
                          {voice.natural ? " · natural" : ""}
                        </span>
                      </span>
                    </button>
                    <button className="btn-ghost shrink-0 !px-2.5 !py-1 text-xs" onClick={() => preview(voice)} aria-label={`Preview ${voice.label}`}>
                      ▶ Listen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <Slider label="Speaking speed" value={settings.narratorRate} min={0.7} max={1.3} step={0.05} onChange={(narratorRate) => onChange({ narratorRate })} format={(v) => `${v.toFixed(2)}×`} />
        {!cloud && (
          <Slider label="Pitch" value={settings.narratorPitch} min={0.6} max={1.4} step={0.05} onChange={(narratorPitch) => onChange({ narratorPitch })} format={(v) => v.toFixed(2)} />
        )}
        <Slider label="Narrator volume" value={settings.narratorVolume} min={0} max={1} step={0.05} onChange={(narratorVolume) => onChange({ narratorVolume })} format={percent} />
        <Toggle
          label="Also read character dialogue"
          hint="The narrator voices NPC lines too, e.g. “Queen Ysolde says…”."
          checked={settings.readDialogue}
          onChange={(readDialogue) => onChange({ readDialogue })}
        />
      </div>
    </Section>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label mb-3">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-parchment">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className="flex w-full items-center justify-between gap-4 text-left" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span>
        <span className="block text-sm text-parchment">{label}</span>
        {hint && <span className="block text-[0.72rem] leading-snug text-mist">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full border transition ${checked ? "border-gold/70 bg-gold/40" : "border-white/15 bg-ink"}`}>
        <span className={`absolute top-0.5 h-[1.1rem] w-[1.1rem] rounded-full transition-all ${checked ? "left-[1.35rem] bg-gold-soft" : "left-0.5 bg-mist/70"}`} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled = [],
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  disabled?: T[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-ink/60 p-0.5">
      {options.map(([option, label]) => (
        <button
          key={option}
          disabled={disabled.includes(option)}
          className={`rounded-md px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-35 ${
            value === option ? "bg-gold/25 text-gold-soft" : "text-mist hover:text-parchment"
          }`}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm text-parchment">
        {label}
        <span className="tabular-nums text-mist">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[#c9a14a]" />
    </label>
  );
}
