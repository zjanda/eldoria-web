/**
 * Unfinished typing, kept in this browser so a reloaded page, a discarded background tab or a
 * restarted server never costs the player what they were in the middle of writing.
 *
 * Storage can be missing or full (private windows, strict settings). Every call here fails quietly:
 * the screen keeps working, it just is not remembered.
 */

const PREFIX = "eldoria.draft.";

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* not kept */
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing was kept */
  }
}

/** Where a hero's unsaved sheet edits are kept. */
export const sheetDraftKey = (adventureId: string, heroId: string) => `sheet.${adventureId}.${heroId}`;

/** Where the action being typed for a tale is kept. */
export const actionDraftKey = (adventureId: string) => `action.${adventureId}`;
