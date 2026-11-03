import { motion } from "framer-motion";
import { createContext, useContext, useEffect, useState } from "react";
import { mediaUrl } from "../../api/connection";
import type { Adventure } from "../../api/types";
import { useImageReference } from "../../hooks/useImageUrl";
import { SceneArt } from "../scene/SceneArt";
import { Sigil } from "./Sigil";

/* A larger view of a portrait or the scene, where the player can paint it for the
   first time or repaint it with their own direction. */

export type ArtTarget = { kind: "portrait"; id: string } | { kind: "scene" };

const OpenArtContext = createContext<(target: ArtTarget) => void>(() => undefined);
export const ArtStudioOpener = OpenArtContext.Provider;
export const useOpenArt = () => useContext(OpenArtContext);

interface ArtStudioProps {
  adventure: Adventure;
  target: ArtTarget;
  onPaint: (target: ArtTarget, direction: string, reference: string | null) => Promise<void>;
  onChoose: (target: ArtTarget, keep: "new" | "old") => Promise<void>;
  onClose: () => void;
}

const MAX_REFERENCE_SIDE = 1536;

/** Shrinks a pasted or chosen image so it uploads quickly; the generator works at about a megapixel anyway. */
async function toReferenceDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_REFERENCE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function ArtStudio({ adventure, target, onPaint, onChoose, onClose }: ArtStudioProps) {
  const subject =
    target.kind === "portrait"
      ? adventure.party.find((hero) => hero.id === target.id) ?? adventure.npcs.find((npc) => npc.id === target.id)
      : undefined;
  const isScene = target.kind === "scene";
  const imageKey = isScene ? adventure.scene.image?.cache_key : subject?.visual.portrait_image_key;
  const reference = useImageReference(imageKey, isScene ? adventure.scene.image : undefined);
  const savedDirection = isScene ? adventure.scene.art_direction : subject?.visual.portrait_direction ?? "";
  const [direction, setDirection] = useState(savedDirection);
  const [sending, setSending] = useState(false);
  // A "refs/..." path already saved on the server, a freshly pasted data URL, or null for none.
  const savedReference = (isScene ? adventure.scene.art_reference : subject?.visual.portrait_reference) || null;
  const [guide, setGuide] = useState<string | null>(savedReference);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // After a repaint, the last accepted picture waits here until the player keeps one of the two.
  const previous = isScene ? adventure.scene.art_previous : subject?.visual.portrait_previous ?? null;
  const previousImage = useImageReference(previous?.image_key);
  const [choosing, setChoosing] = useState(false);

  const choose = async (keep: "new" | "old") => {
    setChoosing(true);
    try {
      await onChoose(target, keep);
      if (keep === "old" && previous) {
        setDirection(previous.direction);
        setGuide(previous.reference || null);
      }
    } finally {
      setChoosing(false);
    }
  };

  const useImage = async (file: Blob | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      setReferenceError("That isn't an image. Copy or choose a PNG, JPEG or WebP picture.");
      return;
    }
    try {
      setGuide(await toReferenceDataUrl(file));
      setReferenceError(null);
    } catch {
      setReferenceError("That image couldn't be read.");
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    // Ctrl+V anywhere in the studio: an image on the clipboard becomes the reference; text pastes as usual.
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
      if (!item) return;
      event.preventDefault();
      void useImage(item.getAsFile());
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isScene && !subject) return null;
  const name = isScene ? adventure.scene.title : subject!.name;
  const subtitle = isScene ? adventure.scene.location_name : subject!.title;
  const accent = isScene ? "#c9a14a" : subject!.visual.accent_color;
  const ready = reference?.status === "ready" && reference.url;
  const painting = sending || reference?.status === "pending";
  const failed = reference?.status === "failed";
  // Heroes have a default portrait queued automatically; allies and repaints are on request.
  const painted = Boolean(ready) || (isScene ? adventure.scene.art_version > 0 : (subject?.visual.portrait_version ?? 0) > 0);
  const oldUrl = previousImage?.status === "ready" ? previousImage.url : null;
  const deciding = Boolean(previous && oldUrl) && !painting;
  // While a repaint is in progress, show the last accepted picture for the whole time (it's what the next
  // comparison is against). Otherwise the discarded new one flashes up until the job is queued.
  const shownUrl = painting && oldUrl ? oldUrl : ready ? reference!.url : null;

  const paint = async () => {
    setSending(true);
    try {
      await onPaint(target, direction, guide);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={`${name} artwork`}
        className={`panel relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto p-4 sm:p-5 ${
          deciding ? "max-w-6xl" : "max-w-4xl sm:flex-row"
        }`}
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
      >
        <button className="absolute right-3 top-3 z-10 text-mist hover:text-parchment" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {deciding ? (
          <div className="w-full pr-6 sm:pr-0">
            <p className="mb-2 text-sm text-parchment/85">Which picture of {name} do you want to keep?</p>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3">
              {[
                { label: "Previous", url: oldUrl, keep: "old" as const, button: "btn-ghost" },
                { label: "New", url: ready ? reference!.url : null, keep: "new" as const, button: "btn-gold" },
              ].map((option) => (
                <div key={option.keep} className="flex min-w-0 flex-col gap-2">
                  <div className={`relative w-full overflow-hidden rounded-lg border border-gold/25 bg-ink ${isScene ? "aspect-[3/2]" : "aspect-[4/5] max-h-[58dvh]"}`}>
                    {option.url ? (
                      <img src={option.url} alt={`${option.label} picture of ${name}`} className="h-full w-full object-contain" />
                    ) : (
                      <p className="flex h-full items-center justify-center p-3 text-center text-sm text-ember">This painting failed.</p>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-gold-soft">
                      {option.label}
                    </span>
                  </div>
                  <button className={`${option.button} w-full`} disabled={choosing || !option.url} onClick={() => choose(option.keep)}>
                    Keep {option.label.toLowerCase()}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className={`mx-auto flex w-full shrink-0 flex-col gap-2 ${isScene ? "sm:w-[58%]" : "max-w-[22rem] sm:w-[42%]"}`}>
        <div className={`relative w-full overflow-hidden rounded-lg border border-gold/20 bg-ink ${isScene ? "aspect-[3/2]" : "aspect-[4/5]"}`}>
          {shownUrl ? (
            <img src={shownUrl} alt={name} className="h-full w-full object-cover" />
          ) : isScene ? (
            <SceneArt artKey={adventure.scene.art_key} visualState={adventure.scene.visual_state} />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: `radial-gradient(circle at 40% 30%, ${accent}55, #0c0e16 72%)`, color: accent }}>
              <Sigil name={subject!.visual.sigil} className="h-1/2 w-1/2" strokeWidth={1} />
            </div>
          )}
          {painting && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent px-3 pb-3 pt-8 text-center text-sm italic text-gold-soft">
              <span className="animate-pulse">Painting{isScene ? " the scene" : ` ${name}`}…</span>
            </div>
          )}
        </div>
        </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="pr-6">
            <p className="label">{isScene ? "Scene" : adventure.party.some((h) => h.id === target.id) ? "Hero" : "Ally"}</p>
            <h2 className="font-display text-xl tracking-wider text-parchment">{name}</h2>
            <p className="text-sm text-mist">{subtitle}</p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm text-parchment/80" htmlFor="art-direction">
            {isScene ? "How should the scene look?" : `How should ${name} look?`} <span className="text-xs text-mist">Optional. Leave blank to use the campaign's description.</span>
          </label>
          <textarea
            id="art-direction"
            value={direction}
            maxLength={400}
            rows={4}
            onChange={(event) => setDirection(event.target.value)}
            placeholder={isScene ? "e.g. a storm rolling in, lightning over the oak" : "e.g. older, a scar over one eye, hood drawn low, warm candlelight"}
            className="resize-none rounded-lg border border-gold/20 bg-night-900/90 px-3 py-2 font-serif text-[1rem] text-parchment placeholder:font-sans placeholder:text-sm placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
          />

          <div
            className={`flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition ${
              dragging ? "border-gold/70 bg-gold/[0.08]" : "border-gold/25 bg-night-900/60"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void useImage(event.dataTransfer.files[0]);
            }}
          >
            {guide ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-gold/30">
                <img src={guide.startsWith("data:") ? guide : mediaUrl(`/media/${guide}`)} alt="Reference" className="h-full w-full object-cover" />
                <button
                  className="absolute right-0.5 top-0.5 rounded-full bg-ink/80 px-1.5 text-xs text-parchment hover:text-ember"
                  onClick={() => setGuide(null)}
                  aria-label="Remove the reference image"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-white/10 text-2xl text-mist/60" aria-hidden>
                ⧉
              </span>
            )}
            <div className="min-w-0 text-xs text-mist">
              <p className="text-parchment/80">Reference image {guide ? "(used as the visual guide)" : "(optional)"}</p>
              <p>
                Paste one with <kbd className="rounded border border-white/15 px-1">Ctrl</kbd>+<kbd className="rounded border border-white/15 px-1">V</kbd>, drop it here, or{" "}
                <label className="cursor-pointer text-gold-soft underline underline-offset-2 hover:text-parchment">
                  choose a file
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void useImage(event.target.files?.[0])} />
                </label>
                .
              </p>
              {referenceError && <p className="text-ember">{referenceError}</p>}
            </div>
          </div>

          {adventure.images_enabled ? (
            <button className="btn-gold self-start" disabled={painting} onClick={paint}>
              {painting ? "Painting…" : painted ? "Regenerate" : isScene ? "Generate scene art" : "Generate portrait"}
            </button>
          ) : (
            <p className="rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-2 text-sm text-gold-soft">
              No image generator is connected yet, so the game uses its hand-drawn crests and scenes. Once one is set up, this button paints the artwork.
            </p>
          )}
          {failed && !painting && <p className="text-sm text-ember">The last painting failed. Try again, perhaps with a simpler description.</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}
