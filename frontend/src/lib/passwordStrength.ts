/**
 * The strong-password rule, shown as you type. A convenience only: the server checks every password again
 * with its own estimator (backend/app/passwords.py) and its answer is the one that counts.
 *
 * Same rule as the server: at least the minimum length (15 by default) and at most 128 characters, not
 * the name part of the email, not the word "eldoria", and hard to guess: the zxcvbn estimator must expect
 * at least 10^12 guesses. The estimator and its word lists (about a megabyte) load only when an account
 * form opens. Nothing is sent anywhere while you type.
 */

export const MAX_PASSWORD_LENGTH = 128;
export const MIN_GUESSES_LOG10 = 12;

export function passwordRuleSentence(minLength: number): string {
  return `Use at least ${minLength} characters: a phrase of four or more unrelated words works well. Avoid your email name, "eldoria" and common passwords.`;
}

export interface StrengthReport {
  /** 0 (empty) to 4 (strong enough). */
  level: 0 | 1 | 2 | 3 | 4;
  strong: boolean;
  /** What to change, in plain words, or null when nothing needs changing. */
  advice: string | null;
}

type Estimator = (password: string, hints: string[]) => { guessesLog10: number; warning: string | null };
let estimatorLoading: Promise<Estimator> | null = null;

function loadEstimator(): Promise<Estimator> {
  if (!estimatorLoading) {
    estimatorLoading = Promise.all([import("@zxcvbn-ts/core"), import("@zxcvbn-ts/language-common"), import("@zxcvbn-ts/language-en")])
      .then(([core, common, english]) => {
        const factory = new core.ZxcvbnFactory({
          translations: english.translations,
          graphs: common.adjacencyGraphs,
          dictionary: { ...common.dictionary, ...english.dictionary },
        });
        return (password: string, hints: string[]) => {
          const result = factory.check(password.slice(0, 72), hints);
          return { guessesLog10: result.guessesLog10, warning: result.feedback.warning ?? null };
        };
      })
      .catch((error) => {
        estimatorLoading = null; // try again next time
        throw error;
      });
  }
  return estimatorLoading;
}

function emailName(email: string): string {
  return email.trim().toLowerCase().split("@")[0] ?? "";
}

/** The parts of the rule that need no estimator. */
export function basicProblem(password: string, email: string, minLength: number): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters (this one has ${password.length}).`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  const lowered = password.toLowerCase();
  const name = emailName(email);
  const squash = (text: string) => text.replace(/[\W_]+/g, "");
  if (name.length >= 3 && (lowered.includes(name) || (squash(name).length >= 3 && squash(lowered).includes(squash(name))))) {
    return "Do not use the name part of your email address.";
  }
  if (lowered.includes("eldoria")) return 'Do not use the word "eldoria".';
  return null;
}

export async function checkStrength(password: string, email: string, displayName: string, minLength: number): Promise<StrengthReport> {
  if (!password) return { level: 0, strong: false, advice: null };
  const basic = basicProblem(password, email, minLength);
  let guessesLog10 = 0;
  let warning: string | null = null;
  try {
    const estimate = (await loadEstimator())(password, [email, emailName(email), displayName, "eldoria"].filter(Boolean));
    guessesLog10 = estimate.guessesLog10;
    warning = estimate.warning;
  } catch {
    // The estimator did not load: show the basic rule only; the server still checks everything.
    return { level: basic ? 1 : 3, strong: !basic, advice: basic };
  }
  const level = guessesLog10 >= MIN_GUESSES_LOG10 ? 4 : guessesLog10 >= 10 ? 3 : guessesLog10 >= 7 ? 2 : 1;
  if (basic) return { level: Math.min(level, 1) as 1, strong: false, advice: basic };
  if (level < 4) {
    return { level, strong: false, advice: `Too easy to guess${warning ? ` (${warning.replace(/\.$/, "").toLowerCase()})` : ""}. Add more unrelated words.` };
  }
  return { level: 4, strong: true, advice: null };
}
