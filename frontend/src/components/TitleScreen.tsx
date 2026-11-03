import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { backendUrl, remoteBackend } from "../api/connection";
import type { ProviderStatus, SaveSummary } from "../api/types";
import { SceneArt } from "./scene/SceneArt";

interface TitleScreenProps {
  saves: SaveSummary[];
  providers: ProviderStatus | null;
  loading: boolean;
  error: string | null;
  onOpen: (adventureId: string) => void;
  onRename: (adventureId: string, name: string) => void;
  onDelete: (adventureId: string) => void;
  onNew: () => void;
  onRetry: () => void;
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function TitleScreen({ saves, providers, loading, error, onOpen, onRename, onDelete, onNew, onRetry }: TitleScreenProps) {
  const latest = saves[0] ?? null;
  const [showSaves, setShowSaves] = useState(false);
  return (
    <div className="relative h-full overflow-hidden">
      <SceneArt artKey="hollow_gate" visualState="default" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/20 to-ink/90" />

      <div className="relative z-10 h-full overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center px-4 pb-14 pt-10 text-center">
        <motion.p
          className="label mb-6 text-gold/70"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1.2 }}
        >
          A Cinematic Tale of Shadow &amp; Wilds
        </motion.p>
        <motion.h1
          className="font-display text-6xl font-semibold tracking-[0.18em] sm:text-8xl"
          style={{
            background: "linear-gradient(180deg, #f3e2b0 0%, #c9a14a 55%, #7a5b26 100%)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 4px 24px rgba(201,161,74,0.25))",
          }}
          initial={{ opacity: 0, scale: 0.96, letterSpacing: "0.32em" }}
          animate={{ opacity: 1, scale: 1, letterSpacing: "0.18em" }}
          transition={{ duration: 2.2, ease: "easeOut" }}
        >
          ELDORIA
        </motion.h1>
        <motion.div
          className="my-6 flex w-72 items-center gap-3"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 1.0, duration: 1.2 }}
        >
          <div className="gold-rule flex-1" />
          <span className="text-gold">◆</span>
          <div className="gold-rule flex-1" />
        </motion.div>
        <motion.p
          className="font-serif text-2xl italic text-parchment/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1.5 }}
        >
          The Whispering Darkness
        </motion.p>

        <motion.div
          className="mt-12 flex w-full max-w-xs flex-col gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.0, duration: 1 }}
        >
          {latest && (
            <button className="btn-gold flex-col !gap-0.5" onClick={() => onOpen(latest.adventure_id)} disabled={loading}>
              <span>Continue Adventure</span>
              <span className="max-w-full truncate font-sans text-[0.68rem] normal-case tracking-normal text-mist">
                {latest.name} · {latest.scene_title} · Turn {latest.turn_number}
              </span>
            </button>
          )}
          {saves.length > 1 && (
            <button className="btn-ghost py-3 font-display uppercase tracking-[0.2em]" onClick={() => setShowSaves((v) => !v)} aria-expanded={showSaves}>
              Saved Tales ({saves.length})
            </button>
          )}
          <button className={latest ? "btn-ghost py-3 font-display uppercase tracking-[0.2em]" : "btn-gold"} onClick={onNew} disabled={loading}>
            {loading ? "Opening the tale…" : "New Adventure"}
          </button>
          {latest && <p className="text-[0.7rem] text-mist/70">A new adventure starts a separate story; your other saves are kept.</p>}
          {remoteBackend && <div className="space-y-2 text-sm text-mist">
            <p>{providers ? "Connected to your private server." : "Connect to your private server to play."}</p>
            <a className="block text-gold-soft underline" href={backendUrl("/api/health")} target="_blank" rel="noopener noreferrer">Sign in to private server</a>
            <button className="btn-ghost w-full" onClick={onRetry} disabled={loading}>Retry connection</button>
          </div>}
          {error && <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
        </motion.div>

        <AnimatePresence>
          {showSaves && saves.length > 1 && (
            <motion.ul
              className="mt-6 w-full max-w-xl space-y-2.5 text-left"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {saves.map((save) => (
                <SaveRow key={save.adventure_id} save={save} disabled={loading} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      </div>

      {providers && (
        <p className="absolute bottom-4 left-0 right-0 z-10 text-center text-[0.7rem] text-mist/60">
          Dungeon Master: {providers.narrative_provider === "mock" ? "Offline storyteller" : providers.narrative_provider} · Artwork:{" "}
          {providers.images_enabled ? providers.image_provider : "illustrated fallbacks"}
        </p>
      )}
    </div>
  );
}

interface SaveRowProps {
  save: SaveSummary;
  disabled: boolean;
  onOpen: (adventureId: string) => void;
  onRename: (adventureId: string, name: string) => void;
  onDelete: (adventureId: string) => void;
}

function SaveRow({ save, disabled, onOpen, onRename, onDelete }: SaveRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(save.name);
  const [confirming, setConfirming] = useState(false);

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== save.name) onRename(save.adventure_id, name.trim());
    else setName(save.name);
  };

  return (
    <li className="panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") {
                  setName(save.name);
                  setEditing(false);
                }
              }}
              aria-label="Save name"
              className="w-full rounded border border-gold/40 bg-night-900 px-2 py-0.5 font-display text-[0.95rem] tracking-wide text-parchment focus:outline-none"
            />
          ) : (
            <button className="group flex max-w-full items-center gap-2 text-left" onClick={() => setEditing(true)} title="Rename this save">
              <span className="truncate font-display text-[0.95rem] tracking-wide text-parchment">{save.name}</span>
              <span className="text-xs text-mist opacity-60 group-hover:opacity-100">✎</span>
            </button>
          )}
          <p className="text-[0.72rem] text-mist">
            {save.scene_title} · Turn {save.turn_number} · {timeAgo(save.updated_at)}
            {save.chapter_complete ? " · chapter complete" : ""}
          </p>
          {save.last_happened && <p className="mt-1 line-clamp-2 font-serif text-[0.85rem] italic text-parchment/70">{save.last_happened}</p>}
          <div className="mt-1.5 flex flex-wrap gap-3">
            {save.party.map((hero) => (
              <span key={hero.name} className="text-[0.68rem] text-mist">
                <span style={{ color: hero.accent_color }}>●</span> {hero.name} {hero.hp}/{hero.max_hp} HP
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button className="btn-gold !px-3 !py-1.5 text-xs" disabled={disabled} onClick={() => onOpen(save.adventure_id)}>
            Play
          </button>
          {confirming ? (
            <span className="flex items-center gap-2 text-[0.7rem]">
              <span className="text-ember">Delete forever?</span>
              <button className="text-ember underline" onClick={() => onDelete(save.adventure_id)}>
                Yes
              </button>
              <button className="text-mist underline" onClick={() => setConfirming(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="text-[0.7rem] text-mist hover:text-ember" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
