import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_TALE_FILE_BYTES, api, isUnreachable } from "../api/client";
import type { AccountInfo, Adventure, DiceRoll, Fate, GameRules, HeroBuild, HeroSheet, ProviderStatus, SaveSummary, TurnResponse } from "../api/types";

export interface TurnFeedback {
  turnNumber: number;
  rolls: DiceRoll[];
  newEntryIds: string[];
  degraded: boolean;
  degradedReason: string;
}

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

export function useAdventure() {
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setErrorMessage] = useState<string | null>(null);
  /** Hosted demo only: "offline" when the private server cannot be reached, which is not shown as an error. */
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [feedback, setFeedback] = useState<TurnFeedback | null>(null);
  const inFlight = useRef(false);

  // Every failure in this hook is reported through here, so an unreachable server never shows an error.
  const fail = useCallback((e: unknown) => {
    if (isUnreachable(e)) {
      setConnection("offline");
      return;
    }
    setErrorMessage((e as Error).message);
  }, []);
  const setError = useCallback((message: string | null) => setErrorMessage(message), []);

  const refreshSaves = useCallback(() => {
    api.saves().then(setSaves).catch(fail);
  }, [fail]);

  const retryConnection = useCallback(() => {
    setError(null);
    refreshSaves();
    // Only for showing who is signed in; the game works the same without it.
    api.me().then(setAccount).catch(() => setAccount(null));
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
  }, [refreshSaves, setError, fail]);

  useEffect(retryConnection, [retryConnection]);

  const openTaleId = adventure?.adventure_id ?? null;
  useEffect(() => {
    if (openTaleId) rememberOpenTale(openTaleId);
  }, [openTaleId]);

  // After a reload: reopen the tale this tab was playing. If it is gone, stay on the title screen quietly.
  useEffect(() => {
    let wanted: string | null = null;
    try {
      wanted = window.sessionStorage.getItem(OPEN_TALE_KEY);
    } catch {
      return;
    }
    if (!wanted) return;
    let cancelled = false;
    api
      .load(wanted)
      .then((loaded) => !cancelled && setAdventure((current) => current ?? loaded))
      .catch(() => rememberOpenTale(null));
    return () => {
      cancelled = true;
    };
  }, []);

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
    clearError: () => setError(null),
  };
}
