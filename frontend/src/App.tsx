import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { GameScreen } from "./components/GameScreen";
import { TitleScreen } from "./components/TitleScreen";
import { useAdventure } from "./hooks/useAdventure";
import { useSettings } from "./hooks/useSettings";
import { useVoices } from "./hooks/useVoices";
import { narrator } from "./lib/narrator";

export default function App() {
  const game = useAdventure();
  const { settings, update, reset } = useSettings();
  const voices = useVoices(settings, update);

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
              onStoryAction={game.storyAction}
              onLearnTechnique={game.learnTechnique}
              onPaintArt={game.paintArt}
              onChooseArt={game.chooseArt}
              onExit={game.exitToTitle}
              onDismissError={game.clearError}
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
              onNew={withUnlock(game.startNew)}
              onRetry={game.retryConnection}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
