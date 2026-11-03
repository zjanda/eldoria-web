import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Adventure, DiceRoll, ProviderStatus, SaveSummary } from "../api/types";

export interface TurnFeedback {
  turnNumber: number;
  rolls: DiceRoll[];
  newEntryIds: string[];
  degraded: boolean;
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

  const startNew = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await api.create();
      setAdventure(created);
      setFeedback(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const submitAction = useCallback(
    async (actionText: string) => {
      if (!adventure || inFlight.current || !actionText.trim()) return false;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const response = await api.turn(adventure.adventure_id, actionText.trim());
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

  const storyAction = useCallback(async (action: "draft" | "begin" | "discard" | "control" | "dm" | "undo", value: string | number = "") => {
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
    retryConnection,
    openSave,
    renameSave,
    deleteSave,
    submitAction,
    storyAction,
    learnTechnique,
    paintArt,
    chooseArt,
    exitToTitle,
    clearError: () => setError(null),
  };
}
