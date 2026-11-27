import { backendFetch, remoteBackend } from "./connection";
import type { AccountInfo, Adventure, CreationOptions, Fate, GameRules, HeroBuild, HeroDraftResponse, HeroSheet, ImageReference, LatestAdventure, ProviderStatus, SaveSummary, TurnResponse, VoiceCatalog } from "./types";

const CAMPAIGN_ID = "whispering_darkness";

export class ApiError extends Error {
  /**
   * `unreachable`: the server could not be reached at all, as opposed to a real problem it reported.
   * `code`: a machine-readable reason some refusals carry, such as "daily_limit_reached" (402).
   */
  constructor(public status: number, message: string, public unreachable = false, public code: string | null = null) {
    super(message);
  }
}

/** The hosted page stays quiet about a server it cannot reach: those failures only mark the game offline. */
export function isUnreachable(error: unknown): boolean {
  return remoteBackend && error instanceof ApiError && error.unreachable;
}

/** True when the server said no signed-in player came with the request (401). */
export function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** The largest tale file the server accepts (see MAX_IMPORT_BYTES in backend/app/main.py). */
export const MAX_TALE_FILE_BYTES = 8 * 1024 * 1024;

/** Sends a request and returns the response once it succeeded; every failure becomes an ApiError. */
async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await backendFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, remoteBackend
      ? "Cannot reach the Eldoria server right now. It runs on a home server that is sometimes offline; please try again later."
      : "Cannot reach the Eldoria server. Is the backend running on port 8000?", true);
  }
  if (!response.ok) {
    let detail = response.statusText;
    let code: string | null = null;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      code = typeof body.code === "string" ? body.code : null;
    } catch {
      /* keep status text */
    }
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      // No signed-in player came with the request. The hosted page treats this like a lapsed sign-in
      // (useAdventure returns to the sign-in screen in google mode); local play shows the server's explanation.
      throw new ApiError(401, remoteBackend ? "Your sign-in has ended. Sign in again to carry on." : detail, remoteBackend);
    }
    // 402 (google mode, paywall on): the server's message says which daily limit was reached and when it resets.
    throw new ApiError(response.status, detail, false, code);
  }
  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  if (response.status === 204) return undefined as T;
  if (remoteBackend && !response.headers.get("Content-Type")?.includes("application/json")) {
    throw new ApiError(502, "The Eldoria server did not return game data. Please try again later.", true);
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
  /** The whole tale as one JSON file, to keep or to import elsewhere. */
  exportSave: (id: string) => send(`/api/adventures/${id}/export`).then((response) => response.blob()),
  /** Adds an exported tale as a new save of this player's. Never replaces an existing one. */
  importSave: (fileText: string) => request<Adventure>("/api/adventures/import", { method: "POST", body: fileText }),
  me: () => request<AccountInfo>("/api/me"),
  /** Google mode: hand the server the ID token from the Google button; it starts a session (a cookie). */
  signInWithGoogle: (credential: string) =>
    request<AccountInfo>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  /** Local test servers only (scripts/sandbox_backend.py --account-mode google). */
  fakeSignIn: (email: string, name: string) =>
    request<AccountInfo>("/api/auth/fake", { method: "POST", body: JSON.stringify({ email, name }) }),
  /** Password mode. Passwords go only to this game's own server, over HTTPS when hosted. */
  register: (email: string, password: string, displayName: string) =>
    request<AccountInfo>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, display_name: displayName }) }),
  signIn: (email: string, password: string) =>
    request<AccountInfo>("/api/auth/sign-in", { method: "POST", body: JSON.stringify({ email, password }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
  forgotPassword: (email: string) =>
    request<{ detail: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<AccountInfo>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }),
  verifyEmail: (token: string) =>
    request<{ detail: string }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  /** Google and password mode: the player confirms being 18 or older (needed for a tale's sexual content). */
  confirmAdult: () => request<AccountInfo>("/api/auth/confirm-adult", { method: "POST", body: JSON.stringify({ confirm: true }) }),
  resendVerification: () => request<{ detail: string }>("/api/auth/resend-verification", { method: "POST" }),
  signOut: () => request<void>("/api/auth/sign-out", { method: "POST" }),
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
  /** Start a picture that is waiting for room on the graphics card anyway. */
  goAhead: (key: string) => request<ImageReference>(`/api/images/${key}/go-ahead`, { method: "POST" }),
  /** Compose the music for the current moment if it does not exist yet, or (newTrack) another piece for it. */
  music: (id: string, newTrack: boolean, direction: string) =>
    request<Adventure>(`/api/adventures/${id}/music`, { method: "POST", body: JSON.stringify({ new_track: newTrack, direction }) }),
  musicStatus: (key: string) => request<ImageReference>(`/api/music/${key}`),
  /** Generate the scene's nearby sounds that do not exist yet, or (layerId) the player's own version of one. */
  sounds: (id: string, layerId = "", direction = "") =>
    request<Adventure>(`/api/adventures/${id}/sounds`, { method: "POST", body: JSON.stringify({ layer_id: layerId, direction }) }),
  soundStatus: (key: string) => request<ImageReference>(`/api/sounds/${key}`),
  /** Report a take that failed the quality check; the server tries a new seed (a few times at most). */
  soundRetake: (key: string, url: string) =>
    request<ImageReference>(`/api/sounds/${key}/retake`, { method: "POST", body: JSON.stringify({ url }) }),
  voices: () => request<VoiceCatalog>("/api/voices"),
};
