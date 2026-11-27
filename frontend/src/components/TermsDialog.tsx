import { motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";
import type { AccountInfo } from "../api/types";

interface TermsDialogProps {
  /** The server's account mode: what is stored differs between password and Google accounts. */
  mode: AccountInfo["account_mode"] | null;
  onClose: () => void;
}

/** Shown where the owner's contact details belong until he fills them in. */
const CONTACT_LINE = "[Contact details to be added by the owner of this server]";
const LAST_UPDATED = "November 26, 2026";

/**
 * Terms and privacy, in plain words. A draft for the owner to review; it is not legal advice.
 * Keep it accurate: when what the server stores or where the AI runs changes, change this text too.
 */
export function TermsDialog({ mode, onClose }: TermsDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-center bg-ink/85 backdrop-blur-sm sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Terms and privacy"
    >
      <motion.div className="panel flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none !bg-night-950 sm:h-auto sm:max-h-full sm:rounded-xl" initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}>
        <header className="flex items-center justify-between gap-3 border-b border-gold/15 px-4 py-3">
          <h2 className="font-display text-lg tracking-wider text-gold-soft">Terms and privacy</h2>
          <button className="btn-ghost !px-3 !py-1.5" onClick={onClose} aria-label="Close terms and privacy">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 text-left text-sm leading-relaxed text-parchment/85 sm:px-8">
          <Section title="What Eldoria is">
            Eldoria is a story game run by one person as a personal project. New accounts can try it for free, for a
            limited number of moves. A paid subscription may be offered later; it would always be your choice, and
            nothing is charged today. It runs on a private
            home server, which may be offline at times, and it may change or stop without notice.
          </Section>
          <Section title="What is stored">
            {mode === "google" ? (
              <>
                When you sign in with Google, the server keeps your Google account's email address, your name as Google
                shows it, Google's account number for you, and when you signed up and last played. Your password never
                reaches this game; Google handles it.
              </>
            ) : (
              <>
                When you create an account, the server keeps your email address, the name you chose to show (if any),
                whether your email address has been confirmed, and when you signed up and last played. Your password
                itself is never stored: the server keeps only a scrambled form of it (an Argon2id hash) that can check a
                password but cannot be turned back into one. If this server sends email, it writes to you only to confirm
                your address or to help you choose a new password.
              </>
            )}{" "}
            It also keeps your tales (what you type, the story, your heroes), the pictures, music, sounds and narrator
            audio made for them, and a count of how many turns, pictures, music pieces and sounds you start each day. A
            cookie keeps you signed in on this device for up to 30 days after you last opened the game.
          </Section>
          <Section title="Content made by AI">
            The story, pictures, music, sounds and voices are made by AI (artificial intelligence) models. They can be
            wrong, strange or unsuitable, and they are not advice of any kind. Please do not put private or sensitive
            information about yourself or anyone else into a tale. You are responsible for what you type.
          </Section>
          <Section title="Your tales">
            Use Export to keep your own copy of a tale; a home server can fail and copies there may be lost. Deleting a
            tale removes it from your library; pictures and sounds already made for it may stay on the server. To have
            your account and everything stored for it removed, contact the owner.
          </Section>
          <Section title="Fair play">
            Do not try to break, overload or misuse the server, or reach other players' tales. Accounts that do may be
            switched off.
          </Section>
          <Section title="Contact">
            {CONTACT_LINE} If you forget your password and the game cannot email you a link, write to this contact.
          </Section>
          <p className="text-[0.72rem] text-mist">Last updated {LAST_UPDATED}.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 font-display text-xs uppercase tracking-[0.2em] text-gold">{title}</h3>
      <p>{children}</p>
    </section>
  );
}
