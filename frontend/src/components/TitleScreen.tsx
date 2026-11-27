import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { googleClientId, remoteBackend } from "../api/connection";
import type { AccountInfo, ProviderStatus, SaveSummary } from "../api/types";
import { hasOwnAccounts, signedOutOfAccount } from "../hooks/useAdventure";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { ChangePasswordDialog, PasswordAccountPanel, ResetPasswordPanel } from "./PasswordAccount";
import { TermsDialog } from "./TermsDialog";
import { SceneArt } from "./scene/SceneArt";

interface TitleScreenProps {
  saves: SaveSummary[];
  providers: ProviderStatus | null;
  loading: boolean;
  error: string | null;
  onOpen: (adventureId: string) => void;
  onRename: (adventureId: string, name: string) => void;
  onDelete: (adventureId: string) => void;
  /** Downloads a tale as one file. */
  onExport: (adventureId: string, name: string) => void;
  /** Adds an exported tale file as a new save; resolves true when it was imported. */
  onImport: (file: File) => Promise<boolean>;
  /** Who is signed in, when the server keeps each player's tales apart. */
  account: AccountInfo | null;
  /** "sandbox": an open tale with heroes of the player's own making. "premade": The Whispering Darkness. */
  onNew: (kind: "sandbox" | "premade") => void;
  /** Hosted page: whether the server answered. Only what works is shown. */
  connection: "checking" | "online" | "offline";
  /** Asks the server again after it was unreachable. */
  onRetry: () => void;
  /** Google mode: the ID token from the Google button. */
  onSignInWithGoogle: (credential: string) => void;
  /** Local test servers only: sign in as any address. */
  onFakeSignIn: (email: string, name: string) => void;
  /** Password mode: resolve true once signed in (the reason for a refusal is shown in `error`). */
  onSignInWithPassword: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string, displayName: string) => Promise<boolean>;
  /** Password mode: a reset link signed the player in. */
  onAdoptSession: (account: AccountInfo) => void;
  /** Asks the server again who is signed in (after an email was confirmed). */
  onRefreshAccount: () => void;
  onSignOut: () => void;
}

/** A link from an account email: #verify=TOKEN or #reset=TOKEN on the website's address. */
function readAccountLink(): { purpose: "verify" | "reset"; token: string } | null {
  const match = /^#(verify|reset)=([\w-]{10,200})$/.exec(window.location.hash);
  if (!match) return null;
  // Take the token out of the address bar and history at once.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { purpose: match[1] as "verify" | "reset", token: match[2] };
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

export function TitleScreen({
  saves, providers, loading, error, onOpen, onRename, onDelete, onExport, onImport, account, onNew, connection,
  onRetry, onSignInWithGoogle, onFakeSignIn, onSignInWithPassword, onRegister, onAdoptSession, onRefreshAccount, onSignOut,
}: TitleScreenProps) {
  // On the hosted page the game's buttons work only while the server answers and, with accounts, once signed in.
  const offline = remoteBackend && connection === "offline";
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const needsSignIn = signedOutOfAccount(account) || resetToken !== null;
  const playable = (!remoteBackend || connection === "online") && !needsSignIn;
  const latest = playable ? saves[0] ?? null : null;
  const [showSaves, setShowSaves] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const passwordMode = account?.account_mode === "password";
  const ownAccounts = hasOwnAccounts(account);
  const signedInAs = account?.account_mode === "access" ? account.email
    : ownAccounts && account?.email ? account.display_name || account.email : null;
  const offerTerms = remoteBackend || ownAccounts;
  const awaitingConfirmation = passwordMode && Boolean(account?.email) && account?.mail_enabled && !account?.email_verified;

  // Links from account emails (and from the owner's reset links) open here.
  useEffect(() => {
    const followLink = () => {
      const link = readAccountLink();
      if (!link) return;
      if (link.purpose === "reset") {
        setResetToken(link.token);
        return;
      }
      api.verifyEmail(link.token)
        .then((answer) => {
          setLinkNotice(answer.detail);
          onRefreshAccount();
        })
        .catch((problem: Error) => setLinkNotice(problem.message));
    };
    followLink();
    // Also when a link is opened in a tab that already shows the game.
    window.addEventListener("hashchange", followLink);
    return () => window.removeEventListener("hashchange", followLink);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resendConfirmation = () => {
    api.resendVerification().then((answer) => setLinkNotice(answer.detail)).catch((problem: Error) => setLinkNotice(problem.message));
  };
  const importChosenFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // choosing the same file again still imports it again
    if (file && (await onImport(file))) setShowSaves(true);
  };
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
          Cinematic Tales of Your Own Making
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
          Imagination is the only limit
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
          {playable && saves.length > 0 && (
            <button className="btn-ghost py-3 font-display uppercase tracking-[0.2em]" onClick={() => setShowSaves((v) => !v)} aria-expanded={showSaves}>
              Saved Tales ({saves.length})
            </button>
          )}
          {playable && <>
          <button className={latest ? "btn-ghost flex-col !gap-0.5 py-3 font-display uppercase tracking-[0.2em]" : "btn-gold flex-col !gap-0.5"} onClick={() => onNew("sandbox")} disabled={loading}>
            <span>{loading ? "Opening the tale…" : "New Tale"}</span>
            <span className="font-sans text-[0.68rem] normal-case tracking-normal text-mist">Your heroes, your world, no script</span>
          </button>
          <button className="btn-ghost flex-col !gap-0.5 py-2.5" onClick={() => onNew("premade")} disabled={loading}>
            <span className="font-display text-xs uppercase tracking-[0.2em]">The Whispering Darkness</span>
            <span className="text-[0.68rem] text-mist">A written story to play through</span>
          </button>
          {latest && <p className="text-[0.7rem] text-mist/70">A new tale is a separate story; your other saves are kept.</p>}
          <button
            className="text-[0.72rem] text-mist underline-offset-2 hover:text-gold hover:underline"
            onClick={() => fileInput.current?.click()}
            disabled={loading}
            title="Add a tale from a file made with Export"
          >
            Import a tale from a file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Tale file to import"
            onChange={(event) => void importChosenFile(event.currentTarget)}
          />
          </>}
          {linkNotice && <p className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold-soft">{linkNotice}</p>}
          {resetToken && !offline && (
            <ResetPasswordPanel
              token={resetToken}
              minLength={account?.password_min_length ?? 15}
              onDone={(signedIn) => {
                setResetToken(null);
                setLinkNotice("Your new password is saved. You are signed in.");
                onAdoptSession(signedIn);
              }}
              onCancel={() => setResetToken(null)}
            />
          )}
          {!resetToken && needsSignIn && !offline && account && (passwordMode ? (
            <PasswordAccountPanel account={account} busy={loading} onSignIn={onSignInWithPassword} onRegister={onRegister} />
          ) : (
            <SignInPanel account={account} busy={loading} onSignInWithGoogle={onSignInWithGoogle} onFakeSignIn={onFakeSignIn} />
          ))}
          {awaitingConfirmation && (
            <p className="text-[0.72rem] text-parchment/75">
              Please confirm your email address with the link we sent you.{" "}
              <button className="text-gold underline-offset-2 hover:underline" onClick={resendConfirmation}>Send a new link</button>
            </p>
          )}
          {offline && (
            <div className="space-y-3">
              <p className="text-sm text-parchment/80">
                The game server is offline right now. It runs on a home server; please try again later.
              </p>
              <button className="btn-ghost w-full py-2.5 font-display text-xs uppercase tracking-[0.2em]" onClick={onRetry}>
                Try again
              </button>
            </div>
          )}
          {error &&<p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
        </motion.div>

        <AnimatePresence>
          {playable && showSaves && saves.length > 0 && (
            <motion.ul
              className="mt-6 w-full max-w-xl space-y-2.5 text-left"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {saves.map((save) => (
                <SaveRow key={save.adventure_id} save={save} disabled={loading} onOpen={onOpen} onRename={onRename} onDelete={onDelete} onExport={onExport} />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      </div>

      {(providers || signedInAs || offerTerms) && (
        <p className="absolute bottom-4 left-0 right-0 z-10 px-4 text-center text-[0.7rem] text-mist/60">
          {signedInAs && <span className="break-all">Signed in as {signedInAs}</span>}
          {signedInAs && passwordMode && (
            <>
              {" · "}
              <button className="underline-offset-2 hover:text-gold hover:underline" onClick={() => setChangingPassword(true)}>
                Change password
              </button>
            </>
          )}
          {signedInAs && ownAccounts && (
            <>
              {" · "}
              <button className="underline-offset-2 hover:text-gold hover:underline" onClick={() => { setLinkNotice(null); onSignOut(); }}>
                Sign out
              </button>
            </>
          )}
          {signedInAs && providers && " · "}
          {providers && <>
            Dungeon Master: {providers.narrative_provider === "mock" ? "Offline storyteller" : providers.narrative_provider} · Artwork:{" "}
            {providers.images_enabled ? providers.image_provider : "illustrated fallbacks"}
          </>}
          {offerTerms && (
            <>
              {(signedInAs || providers) && " · "}
              <button className="underline-offset-2 hover:text-gold hover:underline" onClick={() => setShowTerms(true)}>
                Terms and privacy
              </button>
            </>
          )}
        </p>
      )}
      <AnimatePresence>{showTerms && <TermsDialog mode={account?.account_mode ?? null} onClose={() => setShowTerms(false)} />}</AnimatePresence>
      <AnimatePresence>
        {changingPassword && account && <ChangePasswordDialog account={account} onClose={() => setChangingPassword(false)} />}
      </AnimatePresence>
    </div>
  );
}

interface SignInPanelProps {
  account: AccountInfo;
  busy: boolean;
  onSignInWithGoogle: (credential: string) => void;
  onFakeSignIn: (email: string, name: string) => void;
}

/** Google mode, signed out: the Google button, one sentence on what signing in does, and on a local test server a stand-in. */
function SignInPanel({ account, busy, onSignInWithGoogle, onFakeSignIn }: SignInPanelProps) {
  const [testEmail, setTestEmail] = useState("");
  const googleReady = googleClientId !== "" && account.sign_in_available !== false;
  return (
    <div className="space-y-4">
      <p className="text-sm text-parchment/80">
        Signing in with Google gives you your own account, so your tales are saved for you and only you can open them.
      </p>
      {googleReady && <GoogleSignInButton clientId={googleClientId} disabled={busy} onCredential={onSignInWithGoogle} />}
      {!googleReady && !account.fake_sign_in && (
        <p className="text-xs text-mist">Sign-in is not available right now. Please try again later.</p>
      )}
      {account.fake_sign_in && (
        <form
          className="panel space-y-2 p-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            if (testEmail.trim()) onFakeSignIn(testEmail.trim(), testEmail.trim().split("@")[0]);
          }}
        >
          <label className="block text-[0.7rem] text-mist" htmlFor="local-test-email">
            Local test server: sign in without Google as
          </label>
          <input
            id="local-test-email"
            type="email"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            placeholder="tester@example.com"
            className="w-full rounded border border-gold/40 bg-night-900 px-2 py-1 text-sm text-parchment focus:outline-none"
          />
          <button type="submit" className="btn-ghost w-full !py-1.5 text-xs" disabled={busy || !testEmail.trim()}>
            Sign in (local test)
          </button>
        </form>
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
  onExport: (adventureId: string, name: string) => void;
}

function SaveRow({ save, disabled, onOpen, onRename, onDelete, onExport }: SaveRowProps) {
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
            {save.party.map((hero, index) => (
              <span key={`${index}-${hero.name}`} className="text-[0.68rem] text-mist">
                <span style={{ color: hero.accent_color }}>●</span> {hero.name} {hero.hp}/{hero.max_hp} HP
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button className="btn-gold !px-3 !py-1.5 text-xs" disabled={disabled} onClick={() => onOpen(save.adventure_id)}>
            Play
          </button>
          <button className="text-[0.7rem] text-mist hover:text-gold" disabled={disabled} onClick={() => onExport(save.adventure_id, save.name)} title="Download this tale as a file you can keep or import later">
            Export
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
