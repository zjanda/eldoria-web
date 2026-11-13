import { AnimatePresence, motion } from "framer-motion";
import type { Adventure, NonPlayerCharacter } from "../../api/types";
import { useImageReference } from "../../hooks/useImageUrl";
import { useOpenArt } from "../common/ArtStudio";
import { GpuWaitNote } from "../common/GpuWaitNote";
import { Portrait } from "../common/Portrait";
import { CombatHud } from "./CombatHud";
import { SceneArt } from "./SceneArt";

interface SceneViewProps {
  adventure: Adventure;
  speakingId: string | null;
}

// Softens the picture's own edges so it melts into the blurred fill around it.
const PICTURE_EDGE_FADE =
  "linear-gradient(to right, transparent, black 5%, black 95%, transparent), linear-gradient(to bottom, transparent, black 4%, black 96%, transparent)";

const LIGHTING_LABEL ={ radiant: "Radiant light", dim: "Dim light", dark: "Darkness" } as const;

export function SceneView({ adventure, speakingId }: SceneViewProps) {
  const { scene } = adventure;
  const image = useImageReference(scene.image?.cache_key, scene.image);
  const imageUrl = image?.status === "ready" ? image.url : null;
  const sceneKey = `${scene.scene_id}:${scene.visual_state}`;
  const presentNpcs = adventure.npcs.filter((npc) => scene.present_npc_ids.includes(npc.id));
  const openArt = useOpenArt();

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-gold/15 bg-ink shadow-panel">
      <AnimatePresence mode="sync">
        <motion.div
          key={sceneKey + (imageUrl ?? "")}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        >
          {imageUrl ? (
            <>
              {/* The whole picture is always shown. Where the frame is wider or taller than the picture,
                  a blurred, darkened copy of it fills the rest instead of cropping heads and feet. */}
              <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 animate-breathe object-cover opacity-60 blur-2xl brightness-[0.55]" />
              <img
                src={imageUrl}
                alt={scene.title}
                className="relative mx-auto block h-full w-auto max-w-full object-contain"
                style={{ maskImage: PICTURE_EDGE_FADE, WebkitMaskImage: PICTURE_EDGE_FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
              />
            </>
          ) : (
            <SceneArt artKey={scene.art_key} visualState={scene.visual_state} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Cinematic letterbox gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-ink/90 to-transparent" />

      <motion.div
        key={scene.scene_id}
        className="absolute left-5 top-4 sm:left-7 sm:top-6"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.2, delay: 0.4 }}
      >
        <p className="label text-shadow">{scene.location_name}</p>
        <h2 className="text-shadow max-w-[60vw] font-display text-lg tracking-wider text-parchment sm:max-w-none sm:text-3xl">{scene.title}</h2>
        <p className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-mist/80 text-shadow">
          {LIGHTING_LABEL[scene.lighting]}
          {image?.status === "pending" && !image.waiting && <span className="ml-3 animate-pulse text-gold/70">· painting the scene…</span>}
        </p>
        {image?.status === "pending" && image.waiting && <GpuWaitNote reference={image} compact />}
      </motion.div>

      <button
        className="absolute right-3 top-3 rounded-full border border-gold/25 bg-ink/60 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-gold-soft backdrop-blur transition hover:border-gold/60 hover:text-parchment sm:right-4 sm:top-4"
        onClick={() => openArt({ kind: "scene" })}
        aria-label="View or repaint the scene artwork"
        title="View or repaint the scene artwork"
      >
        ⤢ Scene art
      </button>

      {adventure.combat ? (
        <CombatHud combat={adventure.combat} />
      ) : (
        <PresentCast npcs={presentNpcs} speakingId={speakingId} />
      )}
    </div>
  );
}

function PresentCast({ npcs, speakingId }: { npcs: NonPlayerCharacter[]; speakingId: string | null }) {
  const openArt = useOpenArt();
  if (!npcs.length) return null;
  return (
    <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1.5 sm:bottom-6 sm:right-6">
    <p className="label text-shadow text-[0.6rem] text-gold/75" title="Allies in this scene with the heroes">
      With you
    </p>
    <div className="flex items-end gap-2 sm:gap-3">
      {npcs.map((npc) => {
        const speaking = npc.id === speakingId;
        return (
          <motion.div
            key={npc.id}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: speaking || !speakingId ? 1 : 0.55, y: speaking ? -6 : 0 }}
            transition={{ duration: 0.5 }}
          >
            <Portrait
              name={npc.name}
              accent={npc.visual.accent_color}
              sigil={npc.visual.sigil}
              imageKey={npc.visual.portrait_image_key}
              size={speaking ? 64 : 46}
              speaking={speaking}
              onOpen={() => openArt({ kind: "portrait", id: npc.id })}
            />
            <span className="mt-1 hidden max-w-[5.5rem] truncate text-center text-[0.65rem] text-parchment/70 text-shadow sm:block" title={npc.name}>
              {npc.name}
            </span>
          </motion.div>
        );
      })}
    </div>
    </div>
  );
}
