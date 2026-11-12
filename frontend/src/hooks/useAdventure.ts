import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Adventure, DiceRoll, Fate, GameRules, HeroBuild, HeroSheet, ProviderStatus, SaveSummary, TurnResponse } from "../api/types";

export interface TurnFeedback {
  turnNumber: number;
  rolls: DiceRoll[];
  newEntryIds: string[];
  degraded: boolean;
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
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TurnFeedback | null>(null);
  const inFlight = useRef(false);

  const refreshSaves = useCallback(() => {
    api.saves().then(setSaves).catch((e: ApiError) => setError(e.message));
  }, []);

  const retryConnection = useCallback(() => {
    setError(null);
    refreshSaves();
    api.health().then(setProviders).catch(() => setProviders(null));
  }, [refreshSaves]);

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
      setError((e as Error).message);
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
      setError((e as Error).message);
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
        setError((e as Error).message);
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
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const renameSave = useCallback(
    async (adventureId: string, name: string) => {
      try {
        await api.renameSave(adventureId, name);
      } catch (e) {
        setError((e as Error).message);
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
        setError((e as Error).message);
      }
      refreshSaves();
    },
    [refreshSaves],
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
      });
      return true;
    } catch (e) {
      setError((e as Error).message);
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
        setError((e as Error).message);
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
        setError((e as Error).message);
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
        setError((e as Error).message);
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
        setError((e as Error).message);
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
      setError((e as Error).message);
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
