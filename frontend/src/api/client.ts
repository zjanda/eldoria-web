import { backendFetch, remoteBackend } from "./connection";
import type { Adventure, ImageReference, LatestAdventure, ProviderStatus, SaveSummary, TurnResponse, VoiceCatalog } from "./types";

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
  storyControl: (id: string, level: number) => request<Adventure>(`/api/adventures/${id}/story-control`, { method: "POST", body: JSON.stringify({ level }) }),
  dm: (id: string, text: string) => request<Adventure>(`/api/adventures/${id}/dm`, { method: "POST", body: JSON.stringify({ text }) }),
  undo: (id: string, snapshotId: number) => request<Adventure>(`/api/adventures/${id}/undo`, { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId }) }),
  health: () => request<ProviderStatus>("/api/health"),
  latest: () => request<LatestAdventure | null>("/api/adventures/latest"),
  create: () => request<Adventure>("/api/adventures", { method: "POST", body: JSON.stringify({}) }),
  load: (id: string) => request<Adventure>(`/api/adventures/${id}`),
  saves: () => request<SaveSummary[]>("/api/adventures"),
  renameSave: (id: string, name: string) =>
    request<void>(`/api/adventures/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteSave: (id: string) => request<void>(`/api/adventures/${id}`, { method: "DELETE" }),
  turn: (id: string, actionText: string) =>
    request<TurnResponse>(`/api/adventures/${id}/turns`, {
      method: "POST",
      body: JSON.stringify({ action_text: actionText }),
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
  voices: () => request<VoiceCatalog>("/api/voices"),
};
