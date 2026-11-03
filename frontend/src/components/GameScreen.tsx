import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Adventure } from "../api/types";
import type { TurnFeedback } from "../hooks/useAdventure";
import type { Settings, TextSize } from "../hooks/useSettings";
import type { VoiceOptions } from "../hooks/useVoices";
import { audio } from "../lib/audio";
import { narrator } from "../lib/narrator";
import { ActionComposer } from "./actions/ActionComposer";
import { ChapterEnd } from "./ChapterEnd";
import { ArtStudio, ArtStudioOpener, type ArtTarget } from "./common/ArtStudio";
import { GlossaryProvider, RichText } from "./common/GlossaryText";
import { DiceOverlay, featuredRolls } from "./dice/DiceOverlay";
import { ChronicleViewer } from "./narrative/ChronicleViewer";
import { NarrativeLog } from "./narrative/NarrativeLog";
import { CharacterCard } from "./panels/CharacterCard";
import { SidePanels } from "./panels/SidePanels";
import { SceneView } from "./scene/SceneView";
import { SettingsMenu } from "./settings/SettingsMenu";

type Phase = "idle" | "dice" | "reveal";
type ChronicleView = "story" | "recaps" | "everything";

const TEXT_SCALE: Record<TextSize, number> = { small: 1, medium: 1.12, large: 1.3 };

interface GameScreenProps {
  adventure: Adventure;
  feedback: TurnFeedback | null;
  submitting: boolean;
  error: string | null;
  settings: Settings;
  voices: VoiceOptions;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onResetSettings: () => void;
  onSubmit: (text: string) => Promise<boolean>;
  onStoryAction: (action: "draft" | "begin" | "discard" | "control" | "dm" | "undo", value?: string | number) => Promise<boolean>;
  onLearnTechnique: (offerId: string) => void;
  onPaintArt: (target: ArtTarget, direction: string, reference: string | null) => Promise<void>;
  onChooseArt: (target: ArtTarget, keep: "new" | "old") => Promise<void>;
  onExit: () => void;
  onDismissError: () => void;
}

export function GameScreen({
  adventure,
  feedback,
  submitting,
  error,
  settings,
  voices,
  onSettingsChange,
  onResetSettings,
  onSubmit,
  onStoryAction,
  onLearnTechnique,
  onPaintArt,
  onChooseArt,
  onExit,
  onDismissError,
}: GameScreenProps) {
  const [artTarget, setArtTarget] = useState<ArtTarget | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [newEntryIds, setNewEntryIds] = useState<string[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chronicle, setChronicle] = useState<ChronicleView | null>(null);
  const [dismissedRecapTurn, setDismissedRecapTurn] = useState<number | null>(null);
  const [chapterDismissed, setChapterDismissed] = useState(false);
  useEffect(() => { setChapterDismissed(false); }, [adventure.chapter_number]);
  useEffect(() => {
    if (!feedback) { setPhase("idle"); setNewEntryIds([]); setHandledTurn(null); }
  }, [feedback, adventure.turn_number, adventure.chapter_number]);
  const [undoConfirm, setUndoConfirm] = useState<{ id: number; text: string } | null>(null);
  const [narrating, setNarrating] = useState(false);
  const partyNames = useMemo(() => adventure.party.map((h) => h.name), [adventure.party]);
  const inCombat = adventure.combat !== null;
  const textScale = TEXT_SCALE[settings.textSize];

  // A brand-new adventure narrates its opening; a continued one shows history.
  useEffect(() => {
    if (adventure.turn_number === 0 && !feedback) {
      setNewEntryIds(adventure.narrative_log.map((e) => e.id));
      setPhase("reveal");
    }
  }, [adventure.adventure_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The turn whose entries the log has been told about; until the effect below
  // runs for a fresh response, its entries stay hidden (avoids a one-frame flash).
  const [handledTurn, setHandledTurn] = useState<number | null>(null);
  const awaitingFeedback = feedback !== null && feedback.turnNumber !== handledTurn;

  useEffect(() => {
    if (!feedback) return;
    setHandledTurn(feedback.turnNumber);
    setNewEntryIds(feedback.newEntryIds);
    const featured = featuredRolls(feedback.rolls, partyNames);
    setPhase(settings.diceAnimations && featured.length ? "dice" : "reveal");
  }, [feedback]); // eslint-disable-line react-hooks/exhaustive-deps

  // The narrator reads this turn's story as soon as it starts appearing.
  useEffect(() => {
    if (phase !== "reveal" || !newEntryIds.length) return;
    const ids = new Set(newEntryIds);
    const lines = adventure.narrative_log
      .filter((entry) => ids.has(entry.id))
      .flatMap((entry) => {
        if (entry.kind === "narration") return [entry.text];
        if (entry.kind === "dialogue" && settings.readDialogue) return [`${entry.speaker_name} says: ${entry.text}`];
        return [];
      });
    narrator.enqueue(lines);
  }, [phase === "reveal", newEntryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => narrator.onSpeakingChange(setNarrating), []);
  useEffect(() => audio.setEnabled(settings.audioEnabled), [settings.audioEnabled]);
  useEffect(() => {
    audio.playAmbience(inCombat ? "combat" : adventure.scene.ambient_sound);
  }, [inCombat, adventure.scene.ambient_sound]);
  useEffect(
    () => () => {
      audio.stopAmbience();
      narrator.stop();
    },
    [],
  );

  const submit = useCallback(
    (text: string) => {
      // Runs inside the click/keypress, which lets mobile browsers play speech later.
      narrator.unlock();
      narrator.stop();
      return onSubmit(text);
    },
    [onSubmit],
  );
  const speak = useCallback((text: string) => {
    narrator.unlock();
    narrator.speakNow(text);
  }, []);

  const finishDice = useCallback(() => setPhase("reveal"), []);
  const finishReveal = useCallback(() => setPhase("idle"), []);
  const featured = feedback ? featuredRolls(feedback.rolls, partyNames) : [];
  const busy = submitting || phase !== "idle" || awaitingFeedback;
  const latestRecap = adventure.turn_recaps[adventure.turn_recaps.length - 1];
  const showRecapBar =
    settings.showTurnRecap && phase === "idle" && !awaitingFeedback && latestRecap?.turn_number === adventure.turn_number && dismissedRecapTurn !== latestRecap.turn_number;

  const sidebar = (
    <>
      {adventure.party.map((hero) => (
        <CharacterCard key={hero.id} hero={hero} scene={adventure.scene} inCombat={inCombat} />
      ))}
      <SidePanels adventure={adventure} />
    </>
  );

  return (
    <GlossaryProvider entries={adventure.glossary}>
    <ArtStudioOpener value={setArtTarget}>
    <div className={`relative flex h-full flex-col ${settings.reduceMotion ? "reduce-motion" : ""}`}>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between py-1 gap-2 border-b border-gold/10 bg-night-950/80 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onExit} className="font-display text-sm tracking-[0.3em] text-gold-soft hover:text-parchment" title="Return to title">
            ELDORIA
          </button>
          <span className="text-[0.6rem] text-mist min-[400px]:hidden">Ch {adventure.chapter_number} · Turn {adventure.turn_number}</span>
          <span className="hidden h-4 w-px bg-gold/20 sm:block" />
          <span className="hidden truncate font-serif italic text-parchment/70 sm:block">{adventure.chapter_title}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="mr-1 hidden text-[0.68rem] uppercase tracking-[0.2em] text-mist min-[400px]:inline">Chapter {adventure.chapter_number} · Turn {adventure.turn_number}</span>
          <select aria-label="Story control" className="max-w-[100px] rounded border border-gold/20 bg-night-950 p-1 text-xs text-parchment" value={adventure.story_control} disabled={submitting} onChange={(event) => void onStoryAction("control", Number(event.target.value))}>
            <option value={1}>1 · You DM</option><option value={2}>2 · You lead</option><option value={3}>3 · Shared</option><option value={4}>4 · AI leads</option><option value={5}>5 · AI DM</option>
          </select>
          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy || adventure.undo_snapshot_id === null} onClick={() => { if (adventure.undo_snapshot_id !== null) setUndoConfirm({ id: adventure.undo_snapshot_id, text: adventure.undo_action ?? "Last action" }); }}>↶ Undo</button>
          <IconButton
            label={settings.narratorEnabled ? "Turn narrator off" : "Turn narrator on"}
            active={settings.narratorEnabled}
            onClick={() => {
              narrator.unlock();
              onSettingsChange({ narratorEnabled: !settings.narratorEnabled });
            }}
          >
            {settings.narratorEnabled ? "🔊" : "🔇"}
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            ⚙
          </IconButton>
          <button className="btn-ghost !px-2.5 !py-1 text-xs lg:hidden" onClick={() => setDrawerOpen(true)}>
            Party
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-3 p-2 sm:p-3">
        <section className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
          <div className="relative h-[30vh] min-h-[190px] shrink-0 sm:h-[34vh] lg:h-[46vh]">
            <SceneView adventure={adventure} speakingId={speakingId} />
          </div>
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-gold/10 px-3 py-1.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="label">The Tale</span>
                {narrating && (
                  <button className="flex items-center gap-1.5 rounded-full border border-gold/30 px-2 py-0.5 text-[0.65rem] text-gold-soft" onClick={() => narrator.stop()} title="Stop narration">
                    <span className="inline-flex items-end gap-[2px]" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="w-[2px] rounded bg-gold" animate={{ height: [3, 9, 3] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </span>
                    Narrating · stop
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {adventure.turn_recaps.length > 0 && (
                  <button className="btn-ghost !px-2.5 !py-1 text-[0.7rem]" onClick={() => setChronicle("recaps")}>
                    Recaps
                  </button>
                )}
                <button className="btn-ghost !px-2.5 !py-1 text-[0.7rem]" onClick={() => setChronicle("story")} aria-label="Open the full chronicle">
                  ⤢ Chronicle
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <NarrativeLog
                entries={adventure.narrative_log}
                npcs={adventure.npcs}
                newEntryIds={awaitingFeedback && feedback ? feedback.newEntryIds : newEntryIds}
                revealActive={phase === "reveal" && !awaitingFeedback}
                holdNew={phase === "dice" || awaitingFeedback}
                textSpeed={settings.textSpeed}
                textScale={textScale}
                onSpeak={settings.narratorEnabled ? speak : undefined}
                onSpeakerChange={setSpeakingId}
                onRevealDone={finishReveal}
              />
            </div>
            <AnimatePresence>
              {showRecapBar && latestRecap && (
                <motion.div
                  className="flex items-center gap-2 border-t border-gold/15 bg-gold/[0.06] px-3 py-2 sm:px-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {/* A div, not a button: highlighted terms inside it are tappable on their own. */}
                  <div className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setChronicle("recaps")}>
                    <span className="label mr-2 text-gold/70">What just happened</span>
                    <span className="block truncate font-serif text-[0.98rem] text-parchment sm:inline">
                      <RichText text={latestRecap.headline} />
                    </span>
                  </div>
                  <button className="shrink-0 text-xs text-gold-soft underline-offset-4 hover:underline" onClick={() => setChronicle("recaps")}>
                    Details
                  </button>
                  <button className="shrink-0 px-1 text-mist hover:text-parchment" onClick={() => setDismissedRecapTurn(latestRecap.turn_number)} aria-label="Dismiss recap">
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {adventure.chapter_complete && chapterDismissed && <button className="chip mx-3 my-1 self-start" disabled={busy} onClick={() => setChapterDismissed(false)}>Continue the story</button>}
            <ActionComposer
              storyControl={adventure.story_control}
              onDm={(text) => onStoryAction("dm", text)}
              suggestions={adventure.suggested_actions}
              offers={adventure.technique_offers}
              onLearn={onLearnTechnique}
              disabled={busy}
              busy={submitting}
              inCombat={inCombat}
              onSubmit={submit}
            />
          </div>
        </section>
        <aside className="hidden w-[340px] shrink-0 flex-col gap-3 overflow-y-auto lg:flex">{sidebar}</aside>
      </main>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/70" onClick={() => setDrawerOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col gap-3 overflow-y-auto bg-night-950 p-3"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              exit={{ x: 40 }}
            >
              <button className="btn-ghost self-end !py-1 text-xs" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chronicle && <ChronicleViewer key="chronicle" adventure={adventure} initialView={chronicle} textScale={textScale} onSpeak={settings.narratorEnabled ? speak : undefined} onClose={() => setChronicle(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <SettingsMenu storyControl={adventure.story_control} storyBusy={submitting} onStoryControl={(level) => void onStoryAction("control", level)} key="settings" settings={settings} voices={voices} onChange={onSettingsChange} onReset={onResetSettings} onClose={() => setSettingsOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {artTarget && (
          <ArtStudio
            key={artTarget.kind === "scene" ? "scene" : artTarget.id}
            adventure={adventure}
            target={artTarget}
            onPaint={onPaintArt}
            onChoose={onChooseArt}
            onClose={() => setArtTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{phase === "dice" && featured.length > 0 && <DiceOverlay key={feedback?.turnNumber} rolls={featured} onComplete={finishDice} />}</AnimatePresence>

      <AnimatePresence>
        {(error || feedback?.degraded) && phase === "idle" && (
          <motion.div
            className={`fixed bottom-28 left-1/2 z-30 w-[min(560px,92vw)] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm shadow-panel ${
              error ? "border-ember/40 bg-night-900 text-ember" : "border-gold/30 bg-night-900 text-gold-soft"
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{error ?? "The AI Dungeon Master could not be reached (is Ollama running?), so the keyword reader handled this turn."}</span>
              {error && (
                <button className="text-mist hover:text-parchment" onClick={onDismissError} aria-label="Dismiss">
                  ✕
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {undoConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" role="dialog" aria-modal="true" aria-label="Undo last action">
        <div className="panel max-w-lg p-6"><h2 className="font-display text-xl text-gold-soft">Undo this action?</h2><p className="my-4 whitespace-pre-wrap break-words text-parchment">{undoConfirm.text}</p><p className="mb-4 text-sm text-mist">Restores the state before this action. Saved artwork files remain available.</p><div className="flex gap-3"><button disabled={submitting} className="btn-gold" onClick={async () => { narrator.stop(); if (await onStoryAction("undo", undoConfirm.id)) setUndoConfirm(null); }}>Undo action</button><button disabled={submitting} className="btn-ghost" onClick={() => setUndoConfirm(null)}>Cancel</button></div>{error && <p role="alert" className="mt-3 text-ember">{error}</p>}</div>
      </div>}
      {adventure.chapter_complete && phase === "idle" && !chapterDismissed && (
        <ChapterEnd busy={submitting} error={error} onDraft={(direction) => onStoryAction("draft", direction)} onBegin={() => onStoryAction("begin")} onDiscard={() => onStoryAction("discard")} adventure={adventure} onClose={() => setChapterDismissed(true)} onTitle={onExit} />
      )}
    </div>
    </ArtStudioOpener>
    </GlossaryProvider>
  );
}

function IconButton({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`btn-ghost h-8 w-8 !p-0 text-sm ${active ? "!border-gold/40 !text-gold-soft" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
