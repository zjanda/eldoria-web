import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, MAX_TALE_FILE_BYTES, api, isSignedOut, isUnreachable } from "../api/client";
import type { AccountInfo, Adventure, DiceRoll, Fate, GameRules, HeroBuild, HeroSheet, ProviderStatus, SaveSummary, TurnResponse } from "../api/types";

export interface TurnFeedback {
  turnNumber: number;
  rolls: DiceRoll[];
  newEntryIds: string[];
  degraded: boolean;
  degradedReason: string;
}

// After the trial's last move, how long the turn's story shows before "What comes next" opens.
const TRIAL_END_DELAY_MS = 4000;

// The tale open in this tab, so a reloaded page returns to it instead of the title screen.
const OPEN_TALE_KEY = "eldoria.openTale";

function rememberOpenTale(adventureId: string | null) {
  try {
    if (adventureId) window.sessionStorage.setItem(OPEN_TALE_KEY, adventureId);
    else window.sessionStorage.removeItem(OPEN_TALE_KEY);
  } catch {
    /* storage unavailable: a reload goes to the title screen, as before */
  }
}

function rememberedOpenTale(): string | null {
  try {
    return window.sessionStorage.getItem(OPEN_TALE_KEY);
  } catch {
    return null;
  }
}

/** Google and password mode: the server keeps its own accounts and a visitor must sign in to play. */
export function hasOwnAccounts(account: AccountInfo | null): boolean {
  return account?.account_mode === "google" || account?.account_mode === "password";
}

/** Google and password mode: whether this account view is signed out. */
export function signedOutOfAccount(account: AccountInfo | null): boolean {
  return hasOwnAccounts(account) && !account?.email;
}

export function useAdventure() {
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setErrorMessage] = useState<string | null>(null);
  /** Hosted page only: "offline" when the server cannot be reached, which is not shown as an error. */
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [feedback, setFeedback] = useState<TurnFeedback | null>(null);
  const inFlight = useRef(false);
  // The latest account, for failure handling that must not wait for a re-render.
  const accountRef = useRef<AccountInfo | null>(null);
  const applyAccount = useCallback((next: AccountInfo | null) => {
    accountRef.current = next;
    setAccount(next);
  }, []);
  /** The trial's "What comes next" screen: opened by the trial indicator, or when the trial runs out. */
  const [trialScreenOpen, setTrialScreenOpen] = useState(false);
  /** Asks the server for the account again (the trial's numbers live there, not in the page). */
  const refreshTrial = useCallback(() => {
    if (!hasOwnAccounts(accountRef.current)) return Promise.resolve(accountRef.current);
    return api.me().then((me) => {
      applyAccount(me);
      return me;
    }).catch(() => accountRef.current);
  }, [applyAccount]);

  // Every failure in this hook is reported through here, so an unreachable server never shows an error.
  const fail = useCallback((e: unknown) => {
    const current = accountRef.current;
    if (e instanceof ApiError && e.code === "trial_ended") {
      // The server says the trial is used up: show what comes next instead of an error.
      void refreshTrial();
      setTrialScreenOpen(true);
      return;
    }
    if (isSignedOut(e) && hasOwnAccounts(current) && current) {
      // The session lapsed (expired, signed out elsewhere, or switched off). Back to the sign-in screen;
      // the open tale is remembered and typed actions are kept in this browser, so nothing is lost.
      const wasSignedIn = Boolean(current.email);
      applyAccount({ ...current, email: null, display_name: null, plan: null });
      setAdventure(null);
      setFeedback(null);
      setSaves([]);
      setErrorMessage(wasSignedIn ? "Your sign-in has ended. Sign in again to carry on; what you were typing is kept." : null);
      return;
    }
    if (isUnreachable(e)) {
      setConnection("offline");
      return;
    }
    setErrorMessage((e as Error).message);
  }, [applyAccount, refreshTrial]);
  const setError = useCallback((message: string | null) => setErrorMessage(message), []);

  const refreshSaves = useCallback(() => {
    if (signedOutOfAccount(accountRef.current)) return;
    api.saves().then(setSaves).catch(fail);
  }, [fail]);

  /** Reopens the tale this tab was playing (after a reload or a new sign-in). If it is gone, stays quietly on the title. */
  const reopenRememberedTale = useCallback(() => {
    const wanted = rememberedOpenTale();
    if (!wanted) return () => undefined;
    let cancelled = false;
    api
      .load(wanted)
      .then((loaded) => !cancelled && setAdventure((current) => current ?? loaded))
      .catch((e: unknown) => {
        // Signed out: keep it, to reopen once the player signs in again.
        if (!isSignedOut(e)) rememberOpenTale(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryConnection = useCallback(() => {
    setError(null);
    // Who is signed in comes first: with accounts a signed-out visitor has no saves to list.
    api.me()
      .then((me) => {
        applyAccount(me);
        refreshSaves();
      })
      .catch(() => {
        applyAccount(null);
        refreshSaves();
      });
    api.health()
      .then((status) => {
        setProviders(status);
        setConnection("online");
      })
      .catch((e: unknown) => {
        setProviders(null);
        setConnection("offline");
        if (!isUnreachable(e)) fail(e);
      });
  }, [applyAccount, refreshSaves, setError, fail]);

  useEffect(retryConnection, [retryConnection]);

  const openTaleId = adventure?.adventure_id ?? null;
  useEffect(() => {
    if (openTaleId) rememberOpenTale(openTaleId);
  }, [openTaleId]);

  // After a reload: reopen the tale this tab was playing. If it is gone, stay on the title screen quietly.
  useEffect(reopenRememberedTale, [reopenRememberedTale]);

  /** Google and password mode: what to do once the server has started a session. */
  const signedIn = useCallback((me: AccountInfo) => {
    applyAccount(me);
    setError(null);
    refreshSaves();
    reopenRememberedTale();
  }, [applyAccount, refreshSaves, reopenRememberedTale, setError]);

  /** Google mode: the ID token the Google button produced. Resolves true once signed in. */
  const signInWithGoogle = useCallback(async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      signedIn(await api.signInWithGoogle(credential));
      return true;
    } catch (e) {
      if (isUnreachable(e) && !isSignedOut(e)) setConnection("offline");
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [setError, signedIn]);

  /** Password mode: sign in, or create an account (resolves true once signed in; the reason is left in `error`). */
  const signInWithPassword = useCallback(async (email: string, password: string) => runSignIn(() => api.signIn(email, password)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const register = useCallback(async (email: string, password: string, displayName: string) =>
    runSignIn(() => api.register(email, password, displayName)), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Asks the server again who is signed in (after confirming an email or changing a password). */
  const refreshAccount = useCallback(() => {
    api.me().then(applyAccount).catch(() => undefined);
  }, [applyAccount]);

  /**
   * The player confirms being 18 or older (google and password mode), so a tale's sexual content can be
   * turned on. Resolves true once the server recorded it; on a refusal the reason is left in `error`.
   */
  const confirmAdult = useCallback(async () => {
    setError(null);
    try {
      applyAccount(await api.confirmAdult());
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }, [applyAccount, fail, setError]);

  /** Local test servers only: sign in as any address. */
  const fakeSignIn = useCallback(async (email: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      signedIn(await api.fakeSignIn(email, name));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [setError, signedIn]);

  async function runSignIn(request: () => Promise<AccountInfo>): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      signedIn(await request());
      return true;
    } catch (e) {
      if (isUnreachable(e) && !isSignedOut(e)) setConnection("offline");
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  /** Google and password mode: ends this browser's session on the server, and forgets the open tale. */
  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } catch (e) {
      if (!isSignedOut(e)) {
        fail(e);
        return;
      }
    }
    rememberOpenTale(null);
    setAdventure(null);
    setFeedback(null);
    setSaves([]);
    setError(null);
    const current = accountRef.current;
    applyAccount(current ? { ...current, email: null, display_name: null, plan: null } : null);
  }, [applyAccount, fail, setError]);

  /** Resolves true once the story has begun; on a refusal the reason is left in `error`. */
  const startNew = useCallback(async (heroes: HeroBuild[] | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const created = await api.create(heroes);
      setAdventure(created);
      setFeedback(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Begins an open tale with the player's own heroes. Resolves true once it has begun. */
  const startSandbox = useCallback(async (sheets: HeroSheet[], premise: string, rules: GameRules, wishes: string[]) => {
    setLoading(true);
    setError(null);
    try {
      setAdventure(await api.createSandbox(sheets, premise, rules, wishes));
      setFeedback(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Rewrites a hero's sheet during play. Resolves true when the server accepted it. */
  const editHero = useCallback(
    async (heroId: string, sheet: HeroSheet) => {
      if (!adventure) return false;
      setError(null);
      try {
        setAdventure(await api.editHero(adventure.adventure_id, heroId, sheet));
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [adventure],
  );

  const openSave = useCallback(async (adventureId: string) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await api.load(adventureId);
      setAdventure(loaded);
      setFeedback(null);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const renameSave = useCallback(
    async (adventureId: string, name: string) => {
      try {
        await api.renameSave(adventureId, name);
      } catch (e) {
        fail(e);
      }
      refreshSaves();
    },
    [refreshSaves],
  );

  const deleteSave = useCallback(
    async (adventureId: string) => {
      try {
        await api.deleteSave(adventureId);
      } catch (e) {
        fail(e);
      }
      refreshSaves();
    },
    [refreshSaves],
  );

  /** Downloads a tale as one file, named after the save. */
  const exportSave = useCallback(
    async (adventureId: string, saveName: string) => {
      setError(null);
      try {
        const file = await api.exportSave(adventureId);
        const slug = saveName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tale";
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = `eldoria-${slug}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Give the browser a moment to start the download before the file's address is released.
        window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      } catch (e) {
        fail(e);
      }
    },
    [fail, setError],
  );

  /** Adds an exported tale file as a new save. Resolves true when it was imported. */
  const importSave = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_TALE_FILE_BYTES) {
        setError(`That file is too large to be a tale (the limit is ${MAX_TALE_FILE_BYTES / (1024 * 1024)} MB).`);
        return false;
      }
      setLoading(true);
      try {
        await api.importSave(await file.text());
        refreshSaves();
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fail, refreshSaves, setError],
  );

  /** Runs one turn-shaped request and shows its result like any turn. */
  const takeTurn = useCallback(async (request: () => Promise<TurnResponse>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await request();
      setAdventure(response.adventure);
      setFeedback({
        turnNumber: response.adventure.turn_number,
        rolls: response.rolls,
        newEntryIds: response.new_entries.map((e) => e.id),
        degraded: response.degraded,
        degradedReason: response.degraded_reason ?? "",
      });
      if (accountRef.current?.trial) {
        // A move was counted: update the trial indicator. After the last one, show what comes next once
        // the player has had a moment to read how the turn turned out.
        void refreshTrial().then((me) => {
          if (me?.trial?.ended) window.setTimeout(() => setTrialScreenOpen(true), TRIAL_END_DELAY_MS);
        });
      }
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  /** `fate`: with dice off, how the player says this action turns out. */
  const submitAction = useCallback(
    async (actionText: string, fate: Fate | null = null) => {
      if (!adventure || !actionText.trim()) return false;
      return takeTurn(() => api.turn(adventure.adventure_id, actionText.trim(), fate));
    },
    [adventure, takeTurn],
  );

  /** Tells the last turn again, steered by the player's note. */
  const retellTurn = useCallback(
    async (snapshotId: number, direction: string, remember: boolean) => {
      if (!adventure) return false;
      // The turn is about to be replaced: drop its feedback so the new telling plays from the start.
      setFeedback(null);
      return takeTurn(() => api.retry(adventure.adventure_id, snapshotId, direction, remember));
    },
    [adventure, takeTurn],
  );

  /** Reshapes the tale's rules and standing wishes. Resolves true when the server accepted them. */
  const setRules = useCallback(
    async (rules: GameRules, wishes: string[]) => {
      if (!adventure) return false;
      setError(null);
      try {
        setAdventure(await api.setRules(adventure.adventure_id, rules, wishes));
        setFeedback(null);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [adventure],
  );

  const learnTechnique = useCallback(
    async (offerId: string) => {
      if (!adventure) return;
      try {
        setAdventure(await api.learnTechnique(adventure.adventure_id, offerId));
      } catch (e) {
        fail(e);
      }
    },
    [adventure],
  );

  const paintArt = useCallback(
    async (target: { kind: "portrait"; id: string } | { kind: "scene" }, direction: string, reference: string | null) => {
      if (!adventure) return;
      try {
        setAdventure(
          target.kind === "scene"
            ? await api.paintScene(adventure.adventure_id, direction, reference)
            : await api.paintPortrait(adventure.adventure_id, target.id, direction, reference),
        );
      } catch (e) {
        fail(e);
      }
    },
    [adventure],
  );

  const chooseArt = useCallback(
    async (target: { kind: "portrait"; id: string } | { kind: "scene" }, keep: "new" | "old") => {
      if (!adventure) return;
      try {
        setAdventure(await api.chooseArt(adventure.adventure_id, target.kind === "scene" ? "scene" : target.id, keep));
      } catch (e) {
        fail(e);
      }
    },
    [adventure],
  );

  const storyAction = useCallback(async (action: "draft" | "begin" | "discard" | "control" | "narration" | "dm" | "undo", value: string | number | boolean = "") => {
    if (!adventure || inFlight.current) return false;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const id = adventure.adventure_id;
      const next = action === "draft" ? await api.draftChapter(id, String(value))
        : action === "begin" ? await api.beginChapter(id)
        : action === "discard" ? await api.discardChapter(id)
        : action === "control" ? await api.storyControl(id, Number(value))
        : action === "narration" ? await api.richNarration(id, Boolean(value))
        : action === "dm" ? await api.dm(id, String(value))
        : await api.undo(id, Number(value));
      setAdventure(next);
      setFeedback(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [adventure]);

  const exitToTitle = useCallback(() => {
    rememberOpenTale(null);
    setAdventure(null);
    setFeedback(null);
    refreshSaves();
  }, [refreshSaves]);

  return {
    adventure,
    saves,
    providers,
    account,
    connection,
    loading,
    submitting,
    error,
    feedback,
    startNew,
    startSandbox,
    editHero,
    retryConnection,
    openSave,
    renameSave,
    deleteSave,
    exportSave,
    importSave,
    submitAction,
    retellTurn,
    setRules,
    storyAction,
    learnTechnique,
    paintArt,
    chooseArt,
    exitToTitle,
    trialScreenOpen,
    openTrialScreen: () => setTrialScreenOpen(true),
    closeTrialScreen: () => setTrialScreenOpen(false),
    signInWithGoogle,
    signInWithPassword,
    register,
    adoptSession: signedIn,
    refreshAccount,
    confirmAdult,
    fakeSignIn,
    signOut,
    clearError: () => setError(null),
  };
}
