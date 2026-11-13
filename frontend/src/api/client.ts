import { backendFetch, remoteBackend } from "./connection";
import type { Adventure, CreationOptions, Fate, GameRules, HeroBuild, HeroDraftResponse, HeroSheet, ImageReference, LatestAdventure, ProviderStatus, SaveSummary, TurnResponse, VoiceCatalog } from "./types";

const CAMPAIGN_ID = "whispering_darkness";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await backendFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, remoteBackend
      ? "Cannot reach your private Eldoria server. Check that your PC is on and sign in to the server, then retry."
      : "Cannot reach the Eldoria server. Is the backend running on port 8000?");
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep status text */
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  if (remoteBackend && !response.headers.get("Content-Type")?.includes("application/json")) {
    throw new ApiError(502, "Your private server did not return game data. Sign in to the server and retry.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  draftChapter: (id: string, direction: string) => request<Adventure>(`/api/adventures/${id}/chapters/draft`, { method: "POST", body: JSON.stringify({ direction }) }),
  beginChapter: (id: string) => request<Adventure>(`/api/adventures/${id}/chapters/begin`, { method: "POST" }),
  discardChapter: (id: string) => request<Adventure>(`/api/adventures/${id}/chapters/draft`, { method: "DELETE" }),
  richNarration: (id: string, rich: boolean) => request<Adventure>(`/api/adventures/${id}/narration`, { method: "POST", body: JSON.stringify({ rich }) }),
  storyControl: (id: string, level: number) => request<Adventure>(`/api/adventures/${id}/story-control`, { method: "POST", body: JSON.stringify({ level }) }),
  dm: (id: string, text: string) => request<Adventure>(`/api/adventures/${id}/dm`, { method: "POST", body: JSON.stringify({ text }) }),
  undo: (id: string, snapshotId: number) => request<Adventure>(`/api/adventures/${id}/undo`, { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId }) }),
  health: () => request<ProviderStatus>("/api/health"),
  latest: () => request<LatestAdventure | null>("/api/adventures/latest"),
  creationOptions: () => request<CreationOptions>(`/api/campaigns/${CAMPAIGN_ID}/creation`),
  /** Starts a story with the heroes the player designed, or the campaign's own heroes when none are given. */
  create: (heroes: HeroBuild[] | null = null) =>
    request<Adventure>("/api/adventures", { method: "POST", body: JSON.stringify({ campaign_id: CAMPAIGN_ID, heroes }) }),
  /** A hero from the player's own words: a full sheet to edit, plus any questions the storyteller has. */
  draftHero: (description: string, premise: string, companions: string[], answers: { question: string; answer: string }[], established = "") =>
    request<HeroDraftResponse>("/api/creation/draft", { method: "POST", body: JSON.stringify({ description, premise, companions, answers, established }) }),
  /** Starts an open tale with the player's own heroes. */
  createSandbox: (sheets: HeroSheet[], premise: string, rules: GameRules, wishes: string[]) =>
    request<Adventure>("/api/adventures", { method: "POST", body: JSON.stringify({ campaign_id: "sandbox", sheets, premise, rules, wishes }) }),
  setRules: (id: string, rules: GameRules, wishes: string[]) =>
    request<Adventure>(`/api/adventures/${id}/rules`, { method: "POST", body: JSON.stringify({ rules, wishes }) }),
  /** Tells the last turn again: same action and dice, a different story, steered by the player's note. */
  retry: (id: string, snapshotId: number, direction: string, remember: boolean) =>
    request<TurnResponse>(`/api/adventures/${id}/retry`, { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId, direction, remember }) }),
  editHero: (id: string, heroId: string, sheet: HeroSheet) =>
    request<Adventure>(`/api/adventures/${id}/heroes/${encodeURIComponent(heroId)}`, { method: "PATCH", body: JSON.stringify(sheet) }),
  load: (id: string) => request<Adventure>(`/api/adventures/${id}`),
  saves: () => request<SaveSummary[]>("/api/adventures"),
  renameSave: (id: string, name: string) =>
    request<void>(`/api/adventures/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteSave: (id: string) => request<void>(`/api/adventures/${id}`, { method: "DELETE" }),
  turn: (id: string, actionText: string, fate: Fate | null = null) =>
    request<TurnResponse>(`/api/adventures/${id}/turns`, {
      method: "POST",
      body: JSON.stringify({ action_text: actionText, fate }),
    }),
  learnTechnique: (id: string, offerId: string) =>
    request<Adventure>(`/api/adventures/${id}/techniques/${encodeURIComponent(offerId)}`, { method: "POST" }),
  paintPortrait: (id: string, characterId: string, direction: string, reference: string | null) =>
    request<Adventure>(`/api/adventures/${id}/portraits/${characterId}`, { method: "POST", body: JSON.stringify({ direction, reference }) }),
  chooseArt: (id: string, target: string, keep: "new" | "old") =>
    request<Adventure>(`/api/adventures/${id}/art-choice/${target}`, { method: "POST", body: JSON.stringify({ keep }) }),
  paintScene: (id: string, direction: string, reference: string | null) =>
    request<Adventure>(`/api/adventures/${id}/scene-art`, { method: "POST", body: JSON.stringify({ direction, reference }) }),
  image: (key: string) => request<ImageReference>(`/api/images/${key}`),
  /** Compose the music for the current moment if it does not exist yet, or (newTrack) another piece for it. */
  music: (id: string, newTrack: boolean, direction: string) =>
    request<Adventure>(`/api/adventures/${id}/music`, { method: "POST", body: JSON.stringify({ new_track: newTrack, direction }) }),
  musicStatus: (key: string) => request<ImageReference>(`/api/music/${key}`),
  voices: () => request<VoiceCatalog>("/api/voices"),
};
