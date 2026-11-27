/**
 * The per-tale content switches ("Graphic violence" and "Sexual content (18+)"), as the page shows them.
 * The server decides what is allowed (GET /api/me reports the owner's setting and whether the player has
 * confirmed being 18 or older; POST /api/adventures/{id}/rules refuses what is not allowed). These helpers
 * only decide what to show and when to ask. Plain functions, so they are tested without a browser
 * (tests/contentSwitches.test.mjs).
 */

/** What GET /api/me says about the switches. */
export interface ContentAccount {
  account_mode?: string;
  /** The owner's ELDORIA_CONTENT_SWITCHES: "both", "violence" or "none". */
  content_switches?: string;
  /** True when no confirmation is needed here, or the account has confirmed being 18 or older. */
  adult_confirmed?: boolean;
}

export type ContentSwitch = "graphic_violence" | "sexual_content";

/** Which switches this server offers. A server that does not report the setting has no switches. */
export function availableSwitches(account: ContentAccount | null | undefined): Record<ContentSwitch, boolean> {
  const setting = account?.content_switches;
  return {
    graphic_violence: setting === "both" || setting === "violence",
    sexual_content: setting === "both",
  };
}

/**
 * The rules with every switch this server does not offer turned off, for a new tale whose rules were kept in the
 * browser from earlier (the server would refuse a switch it does not offer).
 */
export function withoutUnavailableSwitches<Rules extends { graphic_violence?: boolean; sexual_content?: boolean }>(
  rules: Rules,
  account: ContentAccount | null | undefined,
): Rules {
  const available = availableSwitches(account);
  return {
    ...rules,
    graphic_violence: available.graphic_violence && rules.graphic_violence === true,
    sexual_content: available.sexual_content && rules.sexual_content === true,
  };
}

/** Whether the age confirmation dialog must be shown before sexual content can be turned on. */
export function needsAdultConfirmation(account: ContentAccount | null | undefined): boolean {
  return account?.adult_confirmed !== true;
}

/**
 * What flipping a switch does: "apply" changes it at once; "confirm" first asks the player to confirm being
 * 18 or older (only when turning sexual content on without a confirmation on record).
 */
export function toggleAction(name: ContentSwitch, turningOn: boolean, account: ContentAccount | null | undefined): "apply" | "confirm" {
  return name === "sexual_content" && turningOn && needsAdultConfirmation(account) ? "confirm" : "apply";
}

export const SWITCH_LABELS: Record<ContentSwitch, string> = {
  graphic_violence: "Graphic violence",
  sexual_content: "Sexual content (18+)",
};

/** One plain sentence on what the switch changes, for its current state. */
export function switchNote(name: ContentSwitch, on: boolean): string {
  if (name === "graphic_violence") {
    return on
      ? "The storyteller may describe violence, injury and gore in graphic detail when the story calls for it."
      : "Fights and wounds stay at adventure-film level, without lingering on gore.";
  }
  return on
    ? "The storyteller may write sexual scenes between adult characters when you or the story lead there."
    : "Romance is fine; sexual scenes fade to black.";
}

export const PICTURES_NOTE = "Pictures never show sexual content, whatever these switches say.";

export const ADULT_STATEMENT = "I confirm that I am 18 years of age or older.";
