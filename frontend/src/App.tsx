import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useState } from "react";
import { CharacterCreator } from "./components/creation/CharacterCreator";
import { HeroForge, clearForgeDraft } from "./components/creation/HeroForge";
import { GameScreen } from "./components/GameScreen";
import { TitleScreen } from "./components/TitleScreen";
import { useAdventure } from "./hooks/useAdventure";
import { useSettings } from "./hooks/useSettings";
import { useVoices } from "./hooks/useVoices";
import { narrator } from "./lib/narrator";

const CREATING_KEY = "eldoria.creating";

export default function App() {
  const game = useAdventure();
  const { settings, update, reset } = useSettings();
  const voices = useVoices(settings, update);
  // A new tale starts with character creation: the open forge, or the premade story's own heroes.
  // Which creation screen is open survives a reload of this tab, so the page comes back where it was.
  const [creating, setCreatingState] = useState<"sandbox" | "premade" | null>(() => {
    try {
      const open = window.sessionStorage.getItem(CREATING_KEY);
      return open === "sandbox" || open === "premade" ? open : null;
    } catch {
      return null;
    }
  });
  const setCreating = (kind: "sandbox" | "premade" | null) => {
    setCreatingState(kind);
    try {
      if (kind) window.sessionStorage.setItem(CREATING_KEY, kind);
      else window.sessionStorage.removeItem(CREATING_KEY);
    } catch {
      /* storage unavailable: the screen still opens, it just is not remembered */
    }
  };

  // Starting or continuing is a user gesture: unlock speech for mobile browsers.
  const withUnlock = (action: () => void) => () => {
    narrator.unlock();
    action();
  };

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>
      <AnimatePresence mode="wait">
        {game.adventure ? (
          <motion.div key="game" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <GameScreen
              adventure={game.adventure}
              feedback={game.feedback}
              submitting={game.submitting}
              error={game.error}
              settings={settings}
              voices={voices}
              onSettingsChange={update}
              onResetSettings={reset}
              onSubmit={game.submitAction}
              onRetell={game.retellTurn}
              onSetRules={game.setRules}
              onStoryAction={game.storyAction}
              onLearnTechnique={game.learnTechnique}
              onEditHero={game.editHero}
              onPaintArt={game.paintArt}
              onChooseArt={game.chooseArt}
              onExit={game.exitToTitle}
              onDismissError={game.clearError}
            />
          </motion.div>
        ) : creating === "sandbox" ? (
          <motion.div key="forge" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <HeroForge
              busy={game.loading}
              error={game.error}
              onBegin={async (sheets, premise, rules, wishes) => {
                narrator.unlock();
                if (await game.startSandbox(sheets, premise, rules, wishes)) {
                  clearForgeDraft(); // the party is in its tale now; the next New Tale starts empty
                  setCreating(null);
                }
              }}
              onCancel={() => {
                game.clearError();
                setCreating(null);
              }}
            />
          </motion.div>
        ) : creating === "premade" ? (
          <motion.div key="creation" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <CharacterCreator
              busy={game.loading}
              error={game.error}
              onBegin={async (heroes) => {
                narrator.unlock();
                if (await game.startNew(heroes)) setCreating(null);
              }}
              onCancel={() => {
                game.clearError();
                setCreating(null);
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="title" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <TitleScreen
              saves={game.saves}
              providers={game.providers}
              loading={game.loading}
              error={game.error}
              onOpen={(id) => withUnlock(() => game.openSave(id))()}
              onRename={game.renameSave}
              onDelete={game.deleteSave}
              onNew={(kind) => {
                game.clearError();
                setCreating(kind);
              }}
              onRetry={game.retryConnection}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
