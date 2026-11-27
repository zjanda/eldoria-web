/**
 * The one-time trial, as the page shows it. The server decides every number (GET /api/me and 402
 * "trial_ended" answers); these helpers only turn its answer into words and decide what the trial's
 * end screen shows. Plain functions, so they are tested without a browser (tests/trial.test.mjs).
 */

export interface TrialInfo {
  moves_allowed: number;
  moves_used: number;
  moves_left: number;
  ended: boolean;
}

/** What the end screen needs from GET /api/me. */
export interface TrialOffer {
  trial?: TrialInfo | null;
  survey_url?: string | null;
  subscriptions?: string;
}

/** The small indicator, such as "Trial: 14 of 20 moves left". */
export function trialIndicatorText(trial: TrialInfo): string {
  if (trial.ended) return "Trial over: what comes next";
  const moves = trial.moves_left === 1 ? "move" : "moves";
  return `Trial: ${trial.moves_left} of ${trial.moves_allowed} ${moves} left`;
}

/** Only a web address is ever opened from the survey button. */
export function safeSurveyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export interface TrialScreenContent {
  headline: string;
  surveyUrl: string | null;
  showSubscription: boolean;
}

export function trialScreenContent(offer: TrialOffer): TrialScreenContent {
  const trial = offer.trial ?? null;
  let headline: string;
  if (!trial || trial.ended) {
    headline = "Thank you for playing. Your trial is over.";
  } else {
    const moves = trial.moves_left === 1 ? "move" : "moves";
    headline = `Thank you for playing. You have ${trial.moves_left} trial ${moves} left, and you can come back to them any time.`;
  }
  return {
    headline,
    surveyUrl: safeSurveyUrl(offer.survey_url),
    showSubscription: offer.subscriptions === "coming_soon",
  };
}
