/**
 * The Which? figures, read from lib/which.json.
 * Change them there, nowhere else. The daily refresh writes this file,
 * and the build copies the figures into every page.
 */
import data from "./which.json" with { type: "json" };

export type WhichScores = {
  customerService: string;
  quality: string;
  value: string;
};

export type Which = {
  count: number;
  rating: string;
  recommendPercent: number;
  scores: WhichScores;
  checkedOn: string;
  profileUrl: string;
};

const RATING = /^[0-5]\.\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isScore(value: unknown): value is string {
  return typeof value === "string" && RATING.test(value);
}

/** Throws if the numbers could put a 0, a blank or nonsense on the site. */
export function checkWhich(value: unknown): Which {
  const w = value as Partial<Which> | null;
  if (!w || typeof w !== "object") throw new Error("lib/which.json is not an object");
  if (!Number.isInteger(w.count) || (w.count as number) <= 0) {
    throw new Error(`lib/which.json "count" must be a whole number above 0, got ${JSON.stringify(w.count)}`);
  }
  if (!isScore(w.rating)) throw new Error(`lib/which.json "rating" must look like "5.0", got ${JSON.stringify(w.rating)}`);
  if (!Number.isInteger(w.recommendPercent) || (w.recommendPercent as number) < 0 || (w.recommendPercent as number) > 100) {
    throw new Error(`lib/which.json "recommendPercent" must be a whole number from 0 to 100, got ${JSON.stringify(w.recommendPercent)}`);
  }
  const scores = w.scores as Partial<WhichScores> | undefined;
  if (!scores || typeof scores !== "object") throw new Error('lib/which.json "scores" must be an object');
  if (!isScore(scores.customerService) || !isScore(scores.quality) || !isScore(scores.value)) {
    throw new Error('lib/which.json scores for customer service, quality and value must each look like "5.0"');
  }
  if (typeof w.checkedOn !== "string" || !DATE.test(w.checkedOn)) {
    throw new Error(`lib/which.json "checkedOn" must be a date like "2026-11-18", got ${JSON.stringify(w.checkedOn)}`);
  }
  if (typeof w.profileUrl !== "string" || !w.profileUrl.startsWith("https://trustedtraders.which.co.uk/")) {
    throw new Error("lib/which.json \"profileUrl\" must be the Which? profile link");
  }
  return {
    count: w.count as number,
    rating: w.rating,
    recommendPercent: w.recommendPercent as number,
    scores: {
      customerService: scores.customerService,
      quality: scores.quality,
      value: scores.value,
    },
    checkedOn: w.checkedOn,
    profileUrl: w.profileUrl,
  };
}

/** Same words the home page uses, so the chat cannot drift from the page. */
export function whichScoresSentence(w: Pick<Which, "scores">): string {
  const { customerService, quality, value } = w.scores;
  if (customerService === quality && quality === value) {
    return `Customer service, quality and value all score ${customerService}`;
  }
  return `Customer service scores ${customerService}, quality ${quality} and value ${value}`;
}

/**
 * "Read this review and N more" names one review.
 * N is every other review, so it is the count minus 1.
 */
export function whichMoreCount(count: number): number {
  return count - 1;
}

/** Tokens the build replaces in every HTML page. Keys include the braces. */
export function whichPlaceholders(w: Which): Record<string, string> {
  return {
    "{{WHICH_COUNT}}": String(w.count),
    "{{WHICH_RATING}}": w.rating,
    "{{WHICH_RECOMMEND}}": String(w.recommendPercent),
    "{{WHICH_SCORE_SERVICE}}": w.scores.customerService,
    "{{WHICH_SCORE_QUALITY}}": w.scores.quality,
    "{{WHICH_SCORE_VALUE}}": w.scores.value,
    "{{WHICH_SCORES}}": whichScoresSentence(w),
    "{{WHICH_MORE}}": String(whichMoreCount(w.count)),
  };
}

/** The bytes the refresh writes, so a day with no change does not touch the file. */
export function formatWhich(w: Which): string {
  return `${JSON.stringify(
    {
      count: w.count,
      rating: w.rating,
      recommendPercent: w.recommendPercent,
      scores: {
        customerService: w.scores.customerService,
        quality: w.scores.quality,
        value: w.scores.value,
      },
      checkedOn: w.checkedOn,
      profileUrl: w.profileUrl,
    },
    null,
    2,
  )}\n`;
}

export const which: Which = checkWhich(data);
