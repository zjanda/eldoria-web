import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type { CreationQuestion, GameRules, HeroSheet } from "../../api/types";
import { Portrait } from "../common/Portrait";
import { SceneArt } from "../scene/SceneArt";
import { DEFAULT_RULES, DIFFICULTIES, RulesFields } from "../rules/RulesPanel";
import { SheetForm, blankSheet } from "./SheetForm";

const MAX_PARTY_SIZE = 4;

interface Answer {
  question: string;
  answer: string;
}

/** One hero being made: the player's words, the sheet drafted from them, and what the storyteller asked. */
interface Draft {
  description: string;
  sheet: HeroSheet | null;
  questions: CreationQuestion[];
  /** Typed or picked replies, by question, not yet sent. */
  replies: Record<string, string>;
  answers: Answer[];
  degraded: boolean;
}

const emptyDraft = (): Draft => ({ description: "", sheet: null, questions: [], replies: {}, answers: [], degraded: false });

// Everything typed here is kept in this browser as it is typed, so a reloaded page, a closed tab or a
// restarted server never costs the player a description they were in the middle of writing.
const STORAGE_KEY = "eldoria.forge.v1";

interface SavedForge {
  premise: string;
  rules: GameRules;
  wishes: string[];
  drafts: Draft[];
  active: number;
}

function loadForge(): SavedForge | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as SavedForge | null;
    if (!saved || !Array.isArray(saved.drafts) || saved.drafts.length === 0) return null;
    const drafts = saved.drafts.slice(0, MAX_PARTY_SIZE).map((draft) => ({ ...emptyDraft(), ...draft }));
    return {
      premise: typeof saved.premise === "string" ? saved.premise : "",
      rules: { ...DEFAULT_RULES, ...saved.rules },
      wishes: Array.isArray(saved.wishes) ? saved.wishes : [],
      drafts,
      active: Math.min(Math.max(0, Number(saved.active) || 0), drafts.length - 1),
    };
  } catch {
    return null; // unreadable or storage unavailable: start fresh
  }
}

/** Forget the unfinished party. Called once its tale has begun. */
export function clearForgeDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing was kept */
  }
}

const hasContent = (saved: SavedForge) =>
  saved.premise.trim() !== "" || saved.drafts.some((draft) => draft.description.trim() !== "" || draft.sheet !== null);

interface HeroForgeProps {
  busy: boolean;
  /** The server's reason when it refused the party. */
  error: string | null;
  onBegin: (sheets: HeroSheet[], premise: string, rules: GameRules, wishes: string[]) => void;
  onCancel: () => void;
}

/** Free-form character creation: describe anyone, get a full sheet, then change whatever you like. */
export function HeroForge({ busy, error, onBegin, onCancel }: HeroForgeProps) {
  const [saved] = useState(loadForge);
  const [premise, setPremise] = useState(saved?.premise ?? "");
  const [rules, setRules] = useState<GameRules>(saved?.rules ?? DEFAULT_RULES);
  const [wishes, setWishes] = useState<string[]>(saved?.wishes ?? []);
  const [drafts, setDrafts] = useState<Draft[]>(saved?.drafts ?? [emptyDraft()]);
  const [active, setActive] = useState(saved?.active ?? 0);
  const [forging, setForging] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [restored, setRestored] = useState(() => saved !== null && hasContent(saved));
  // Bumped by "Start over" so the rules fields (which keep their own text) start fresh too.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ premise, rules, wishes, drafts, active } satisfies SavedForge));
    } catch {
      /* storage full or unavailable: the screen still works, it just is not kept */
    }
  }, [premise, rules, wishes, drafts, active]);

  const startOver = () => {
    setPremise("");
    setRules(DEFAULT_RULES);
    setWishes([]);
    setDrafts([emptyDraft()]);
    setActive(0);
    setForgeError(null);
    setRestored(false);
    setGeneration((value) => value + 1);
  };

  const draft = drafts[active];
  const patch = (changes: Partial<Draft>) => setDrafts((all) => all.map((d, i) => (i === active ? { ...d, ...changes } : d)));

  const forge = async (answers: Answer[] = draft.answers) => {
    if (!draft.description.trim() || forging) return;
    setForging(true);
    setForgeError(null);
    try {
      const companions = drafts.filter((d, i) => i !== active && d.sheet).map((d) => `${d.sheet!.name}, ${d.sheet!.class_name}`);
      // Answering a question should change what it asked about, not rename the hero.
      const established = answers.length && draft.sheet ? [draft.sheet.name, draft.sheet.class_name, draft.sheet.role].filter(Boolean).join(", ") : "";
      const response = await api.draftHero(draft.description.trim(), premise.trim(), companions, answers, established);
      patch({ sheet: response.sheet, questions: response.questions, replies: {}, answers, degraded: response.degraded });
    } catch (e) {
      setForgeError((e as Error).message);
    } finally {
      setForging(false);
    }
  };

  const answerQuestions = () => {
    const fresh = draft.questions
      .map((q) => ({ question: q.question, answer: (draft.replies[q.question] ?? "").trim() }))
      .filter((a) => a.answer);
    if (fresh.length) void forge([...draft.answers, ...fresh]);
    else patch({ questions: [] });
  };

  const addHero = () => {
    setDrafts((all) => [...all, emptyDraft()]);
    setActive(drafts.length);
  };
  const removeHero = (index: number) => {
    setDrafts((all) => (all.length > 1 ? all.filter((_, i) => i !== index) : [emptyDraft()]));
    setActive((current) => Math.max(0, current >= index ? current - 1 : current));
  };

  const ready = drafts.filter((d) => d.sheet);
  const names = ready.map((d) => d.sheet!.name.trim().toLowerCase());
  const problem =
    ready.length === 0 ? "Describe at least one hero, then forge them."
    : drafts.some((d) => !d.sheet) ? "Forge or remove the unfinished hero."
    : names.some((name) => !name) ? "Every hero needs a name."
    : new Set(names).size !== names.length ? "Give each hero a different name."
    : null;

  return (
    <Backdrop>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-6 sm:px-5">
            <header className="text-center">
              <p className="label text-gold/70">A tale of your own</p>
              <h1 className="mt-2 font-display text-3xl tracking-[0.12em] text-gold-soft sm:text-4xl">Who walks into the story?</h1>
              <p className="mx-auto mt-3 max-w-2xl font-serif text-lg italic text-parchment/80">
                Describe anyone you can imagine. The tale will write their sheet, and every line of it stays yours to change.
              </p>
            </header>

            {restored && (
              <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-[0.82rem] text-parchment/90" role="status">
                <span>Picked up where you left off. What you write here is kept in this browser until the tale begins.</span>
                <span className="flex gap-3">
                  <button className="text-gold-soft underline-offset-4 hover:underline" onClick={() => setRestored(false)}>Keep going</button>
                  <button className="text-mist underline-offset-4 hover:text-ember hover:underline" onClick={startOver}>Start over</button>
                </span>
              </p>
            )}

            <section className="panel mt-6 p-4">
              <label className="block">
                <span className="label mb-1 block">Where does the tale begin?</span>
                <textarea
                  className="input resize-y font-serif text-base"
                  rows={2}
                  maxLength={2000}
                  value={premise}
                  onChange={(e) => setPremise(e.target.value)}
                  placeholder="A snowed-in mountain inn. A generation ship gone quiet. Leave it empty and the storyteller will invent a beginning."
                />
              </label>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gold-soft">
                  Rules of the tale: {DIFFICULTIES.find((d) => d.level === rules.difficulty)?.name}{rules.dice ? "" : ", no dice"}
                  <span className="ml-2 text-[0.72rem] text-mist">change them now or at any time during play</span>
                </summary>
                <div className="mt-3">
                  <RulesFields key={generation} rules={rules} wishes={wishes} onChange={(nextRules, nextWishes) => { setRules(nextRules); setWishes(nextWishes); }} />
                </div>
              </details>
            </section>

            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Heroes">
              {drafts.map((d, index) => (
                <button
                  key={index}
                  role="tab"
                  aria-selected={index === active}
                  onClick={() => setActive(index)}
                  className={`panel flex min-w-[10rem] flex-1 items-center gap-3 p-2.5 text-left transition ${index === active ? "!border-gold/70 shadow-glow" : "opacity-75 hover:opacity-100"}`}
                >
                  <Portrait name={d.sheet?.name || "?"} accent={d.sheet?.accent_color ?? "#c9a14a"} sigil={d.sheet?.sigil ?? "circle"} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base tracking-wide text-parchment">{d.sheet?.name.trim() || `Hero ${index + 1}`}</span>
                    <span className="block truncate text-[0.72rem] text-mist">{d.sheet ? [d.sheet.class_name, d.sheet.role].filter(Boolean).join(" · ") : "Not yet forged"}</span>
                  </span>
                </button>
              ))}
              {drafts.length < MAX_PARTY_SIZE && (
                <button className="btn-ghost" onClick={addHero}>+ Add a hero</button>
              )}
            </div>

            <section className="panel mt-4 p-4" role="tabpanel">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-base tracking-[0.14em] text-gold-soft">Describe this hero</h2>
                {drafts.length > 1 && (
                  <button className="text-xs text-mist hover:text-ember" onClick={() => removeHero(active)}>Remove this hero</button>
                )}
              </div>
              <p className="mb-2 mt-1 text-[0.78rem] leading-snug text-mist">
                Class, weapons, armor, powers, history, looks: say as much or as little as you like, in any words. Nothing comes from a list.
              </p>
              <textarea
                className="input resize-y font-serif text-base"
                rows={4}
                maxLength={2000}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="A priest of a drowned abbey who fights with a lantern on a chain and can look through other people's eyes…"
                aria-label="Hero description"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button className="btn-gold !px-4 !py-2 text-xs" onClick={() => forge()} disabled={forging || !draft.description.trim()}>
                  {forging ? "Forging…" : draft.sheet ? "Forge again from this description" : "Forge this hero"}
                </button>
                {!draft.sheet && (
                  <button className="text-xs text-mist underline-offset-4 hover:text-parchment hover:underline" onClick={() => patch({ sheet: blankSheet(), questions: [], degraded: false })} disabled={forging}>
                    Or write the sheet yourself
                  </button>
                )}
                {draft.sheet && !forging && <span className="text-[0.7rem] text-mist">Forging again replaces the sheet below, including your edits.</span>}
              </div>
              {forgeError && <p className="mt-2 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{forgeError}</p>}
              {draft.degraded && draft.sheet && (
                <p className="mt-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-[0.8rem] text-parchment/85">
                  The storyteller AI is not running, so this is a plain starter sheet. Edit it by hand below, or start the local model and forge again.
                </p>
              )}
            </section>

            {draft.sheet && draft.questions.length > 0 && (
              <section className="panel mt-4 border-gold/40 p-4" aria-label="The storyteller asks">
                <h2 className="font-display text-base tracking-[0.14em] text-gold-soft">The storyteller wonders…</h2>
                <p className="mb-3 mt-1 text-[0.78rem] text-mist">Answer any you like. Whatever you leave, the tale has already guessed.</p>
                <ul className="space-y-3">
                  {draft.questions.map((q) => (
                    <li key={q.question}>
                      <p className="font-serif text-base italic text-parchment/90">{q.question}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {q.suggestions.map((suggestion) => (
                          <button key={suggestion} type="button" aria-pressed={draft.replies[q.question] === suggestion}
                            className={`chip ${draft.replies[q.question] === suggestion ? "!border-gold/80 !bg-gold/15" : ""}`}
                            onClick={() => patch({ replies: { ...draft.replies, [q.question]: suggestion } })}>
                            {suggestion}
                          </button>
                        ))}
                        <input className="input !w-56" maxLength={300} placeholder="Or in your own words" aria-label={`Answer: ${q.question}`}
                          value={q.suggestions.includes(draft.replies[q.question] ?? "") ? "" : (draft.replies[q.question] ?? "")}
                          onChange={(e) => patch({ replies: { ...draft.replies, [q.question]: e.target.value } })} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-3">
                  <button className="btn-gold !px-4 !py-2 text-xs" onClick={answerQuestions} disabled={forging || !Object.values(draft.replies).some((reply) => reply.trim())}>
                    {forging ? "Forging…" : "Answer and reforge"}
                  </button>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => patch({ questions: [], replies: {} })} disabled={forging}>Let the tale decide</button>
                </div>
              </section>
            )}

            {draft.sheet && (
              <div className="mt-4">
                <SheetForm sheet={draft.sheet} onChange={(sheet) => patch({ sheet })} />
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-gold/15 bg-night-950/90 px-3 py-3 backdrop-blur sm:px-5">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>Back</button>
            <p className={`min-w-0 flex-1 text-sm ${error ? "text-ember" : "text-mist"}`} role="status">
              {error ?? problem ?? `${ready.length === 1 ? "Your hero is" : `${ready.length} heroes are`} ready.`}
            </p>
            <button className="btn-gold" onClick={() => onBegin(ready.map((d) => d.sheet!), premise.trim(), rules, wishes)} disabled={busy || forging || problem !== null}>
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
      <SceneArt artKey="hollow_gate" visualState="default" />
      <div className="absolute inset-0 bg-ink/85" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
