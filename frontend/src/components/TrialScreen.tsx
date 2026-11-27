import { motion } from "framer-motion";
import { useEffect } from "react";
import { type TrialInfo, type TrialOffer, trialIndicatorText, trialScreenContent } from "../lib/trial";

/**
 * "What comes next": the end of the one-time trial, also reachable at any time from the trial indicator.
 * A thank-you, the survey link (when the server has one), the subscription offer (shown but disabled
 * until payments exist; no price), and a reminder that the player's tales are kept.
 */
export function TrialScreen({ offer, onClose }: { offer: TrialOffer; onClose: () => void }) {
  const content = trialScreenContent(offer);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="What comes next">
      <div className="panel w-full max-w-md space-y-4 !bg-night-950 p-5 text-left">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg tracking-wider text-gold-soft">What comes next</h2>
          <button type="button" className="btn-ghost !px-2.5 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="font-serif text-lg italic text-parchment/90">{content.headline}</p>

        {content.surveyUrl && (
          <div className="space-y-2">
            <a className="btn-gold block w-full text-center" href={content.surveyUrl} target="_blank" rel="noopener noreferrer">
              Tell us what you think
            </a>
            <p className="text-[0.75rem] text-mist">It takes about two minutes, and your answers shape what gets built next.</p>
          </div>
        )}

        {content.showSubscription && (
          <section className="space-y-2 rounded-lg border border-gold/25 bg-night-900/70 p-4" aria-label="Subscription">
            <h3 className="font-display text-xs uppercase tracking-[0.2em] text-gold">Subscription</h3>
            <p className="text-sm text-parchment/85">
              Keep playing without the trial's limits: unlimited moves, and pictures, music and sounds for every tale.
            </p>
            <button type="button" className="btn-ghost w-full cursor-not-allowed opacity-60" disabled aria-disabled="true">
              Subscribe (coming soon)
            </button>
          </section>
        )}

        <p className="text-[0.75rem] text-parchment/75">
          Your tales are kept. You can still open and read them, and use Export on the title screen to keep your own copy.
        </p>
      </div>
    </motion.div>
  );
}

/** The small, unobtrusive trial counter. Clicking it opens "What comes next" at any time. */
export function TrialIndicator({ trial, onOpen }: { trial: TrialInfo; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="fixed bottom-10 right-3 z-40 rounded-full border border-gold/30 bg-night-950/80 px-3 py-1 text-[0.68rem] text-mist backdrop-blur hover:border-gold hover:text-gold-soft">
      {trialIndicatorText(trial)}
    </button>
  );
}
