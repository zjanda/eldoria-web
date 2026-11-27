import { motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import { ApiError, api } from "../api/client";
import type { AccountInfo } from "../api/types";
import { type StrengthReport, checkStrength, passwordRuleSentence } from "../lib/passwordStrength";

/**
 * Password mode: sign in, create an account, forgot password, choose a new password from a mailed link,
 * and change a password. The browser's checks are a convenience; the server decides.
 * `autocomplete` values follow the HTML standard so password managers fill and save correctly:
 * "username" for the email, "current-password" to sign in, "new-password" when choosing one.
 */

const inputClass =
  "w-full rounded border border-gold/40 bg-night-900 px-2.5 py-1.5 text-sm text-parchment placeholder:text-mist/50 focus:border-gold focus:outline-none";
const labelClass = "block text-left text-[0.72rem] text-mist";

function PasswordInput({ id, value, onChange, autoComplete, label, show }: {
  id: string; value: string; onChange: (value: string) => void; autoComplete: "current-password" | "new-password"; label: string; show: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input id={id} type={show ? "text" : "password"} value={value} autoComplete={autoComplete} maxLength={1024}
        spellCheck={false} autoCapitalize="none" onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </div>
  );
}

function ShowToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="text-[0.7rem] text-mist underline-offset-2 hover:text-gold hover:underline" onClick={onToggle} aria-pressed={show}>
      {show ? "Hide password" : "Show password"}
    </button>
  );
}

const METER_COLOURS = ["bg-mist/20", "bg-ember", "bg-gold-dim", "bg-gold", "bg-verdant"];
const METER_WORDS = ["", "Weak", "Fair", "Almost", "Strong"];

/** A new password, its confirmation, the rule in one sentence and a live strength meter. */
function NewPasswordFields({ email, displayName, minLength, password, confirm, onPassword, onConfirm, label = "Password" }: {
  email: string; displayName: string; minLength: number; password: string; confirm: string;
  onPassword: (value: string) => void; onConfirm: (value: string) => void; label?: string;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [report, setReport] = useState<StrengthReport>({ level: 0, strong: false, advice: null });
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void checkStrength(password, email, displayName, minLength).then((next) => current && setReport(next));
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [password, email, displayName, minLength]);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <div className="space-y-2">
      <p className="text-left text-[0.72rem] text-parchment/70">{passwordRuleSentence(minLength)}</p>
      <PasswordInput id={`${id}-new`} value={password} onChange={onPassword} autoComplete="new-password" label={label} show={show} />
      <div className="flex items-center gap-2" aria-live="polite">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span key={step} className={`h-1.5 flex-1 rounded ${report.level >= step ? METER_COLOURS[report.level] : METER_COLOURS[0]}`} />
          ))}
        </div>
        <span className="w-14 text-right text-[0.68rem] text-mist">{password ? METER_WORDS[report.level] : ""}</span>
      </div>
      {password && report.advice && <p className="text-left text-[0.7rem] text-ember">{report.advice}</p>}
      <PasswordInput id={`${id}-confirm`} value={confirm} onChange={onConfirm} autoComplete="new-password" label="The same password again" show={show} />
      {mismatch && <p className="text-left text-[0.7rem] text-ember">The two passwords are different.</p>}
      <div className="text-left"><ShowToggle show={show} onToggle={() => setShow((value) => !value)} /></div>
    </div>
  );
}

function newPasswordReady(password: string, confirm: string) {
  return password.length > 0 && password === confirm;
}

type PanelView = "sign-in" | "create" | "forgot";

interface PasswordAccountPanelProps {
  account: AccountInfo;
  busy: boolean;
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string, displayName: string) => Promise<boolean>;
}

/** Password mode, signed out: sign in, or create an account (one form with a toggle), and forgot password. */
export function PasswordAccountPanel({ account, busy, onSignIn, onRegister }: PasswordAccountPanelProps) {
  const id = useId();
  const minLength = account.password_min_length ?? 15;
  const [view, setView] = useState<PanelView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (next: PanelView) => {
    setView(next);
    setPassword("");
    setConfirm("");
    setNotice(null);
  };

  const submit = async () => {
    setNotice(null);
    if (view === "sign-in") await onSignIn(email, password);
    else if (view === "create") await onRegister(email, password, displayName);
    else {
      try {
        setNotice((await api.forgotPassword(email)).detail);
      } catch (error) {
        setNotice((error as Error).message);
      }
    }
  };

  const canSubmit = email.trim() !== "" && !busy && (
    view === "forgot" || (view === "sign-in" ? password !== "" : newPasswordReady(password, confirm)));

  return (
    <form className="panel space-y-3 p-4 text-left" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {view !== "forgot" && (
        <div className="flex gap-1" role="tablist" aria-label="Sign in or create an account">
          {(["sign-in", "create"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => switchTo(tab)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${view === tab ? "bg-gold/20 text-gold-soft" : "text-mist hover:text-parchment"}`}>
              {tab === "sign-in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}
      <p className="text-[0.78rem] text-parchment/80">
        {view === "forgot"
          ? "Forgot your password?"
          : "An account keeps your tales saved for you, and only you can open them."}
      </p>
      <div className="space-y-1">
        <label className={labelClass} htmlFor={`${id}-email`}>Email address</label>
        <input id={`${id}-email`} type="email" value={email} autoComplete="username" maxLength={320} required
          onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="you@example.com" />
      </div>
      {view === "sign-in" && (
        <>
          <PasswordInput id={`${id}-password`} value={password} onChange={setPassword} autoComplete="current-password" label="Password" show={showPassword} />
          <div className="flex items-center justify-between">
            <ShowToggle show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
            <button type="button" className="text-[0.7rem] text-mist underline-offset-2 hover:text-gold hover:underline" onClick={() => switchTo("forgot")}>
              Forgot password?
            </button>
          </div>
        </>
      )}
      {view === "create" && (
        <>
          <div className="space-y-1">
            <label className={labelClass} htmlFor={`${id}-name`}>Name to show (optional)</label>
            <input id={`${id}-name`} type="text" value={displayName} autoComplete="nickname" maxLength={60}
              onChange={(event) => setDisplayName(event.target.value)} className={inputClass} />
          </div>
          <NewPasswordFields email={email} displayName={displayName} minLength={minLength} password={password} confirm={confirm}
            onPassword={setPassword} onConfirm={setConfirm} />
        </>
      )}
      {view === "forgot" && !account.mail_enabled && (
        <p className="text-[0.75rem] text-parchment/80">
          This server cannot send email yet. To get back into your account, contact the owner of this server (see Terms and privacy).
        </p>
      )}
      {notice && <p className="text-[0.75rem] text-gold-soft">{notice}</p>}
      {(view !== "forgot" || account.mail_enabled) && (
        <button type="submit" className="btn-gold w-full" disabled={!canSubmit}>
          {busy ? "One moment…" : view === "sign-in" ? "Sign in" : view === "create" ? "Create account" : "Send me a link"}
        </button>
      )}
      {view === "forgot" && (
        <button type="button" className="w-full text-[0.72rem] text-mist hover:text-gold" onClick={() => switchTo("sign-in")}>
          Back to sign in
        </button>
      )}
    </form>
  );
}

/** Opened from a mailed (or owner-made) link: choose a new password. Signs in on success. */
export function ResetPasswordPanel({ token, minLength, onDone, onCancel }: {
  token: string; minLength: number; onDone: (account: AccountInfo) => void; onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onDone(await api.resetPassword(token, password));
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel space-y-3 p-4 text-left" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="font-display text-sm tracking-wide text-gold-soft">Choose a new password</p>
      {/* A hidden username field lets password managers store the new password under the right account. */}
      <input type="text" autoComplete="username" className="hidden" aria-hidden="true" tabIndex={-1} readOnly value="" />
      <NewPasswordFields email="" displayName="" minLength={minLength} password={password} confirm={confirm}
        onPassword={setPassword} onConfirm={setConfirm} label="New password" />
      {problem && <p className="text-[0.75rem] text-ember">{problem}</p>}
      <button type="submit" className="btn-gold w-full" disabled={busy || !newPasswordReady(password, confirm)}>
        {busy ? "One moment…" : "Save the new password"}
      </button>
      <button type="button" className="w-full text-[0.72rem] text-mist hover:text-gold" onClick={onCancel}>Cancel</button>
    </form>
  );
}

/** Signed in: change the password (needs the current one). Other devices are signed out. */
export function ChangePasswordDialog({ account, onClose }: { account: AccountInfo; onClose: () => void }) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.changePassword(current, password);
      setDone(true);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : "The password could not be changed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Change password">
      <form className="panel w-full max-w-sm space-y-3 !bg-night-950 p-5 text-left" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base tracking-wider text-gold-soft">Change password</h2>
          <button type="button" className="btn-ghost !px-2.5 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {done ? (
          <>
            <p className="text-sm text-parchment/85">Your password is changed. Other devices have been signed out.</p>
            <button type="button" className="btn-gold w-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <input type="email" autoComplete="username" className="hidden" aria-hidden="true" tabIndex={-1} readOnly value={account.email ?? ""} />
            <PasswordInput id={`${id}-current`} value={current} onChange={setCurrent} autoComplete="current-password" label="Current password" show={showCurrent} />
            <ShowToggle show={showCurrent} onToggle={() => setShowCurrent((value) => !value)} />
            <NewPasswordFields email={account.email ?? ""} displayName={account.display_name ?? ""} minLength={account.password_min_length ?? 15}
              password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} label="New password" />
            {problem && <p className="text-[0.75rem] text-ember">{problem}</p>}
            <button type="submit" className="btn-gold w-full" disabled={busy || current === "" || !newPasswordReady(password, confirm)}>
              {busy ? "One moment…" : "Change password"}
            </button>
          </>
        )}
      </form>
    </motion.div>
  );
}
