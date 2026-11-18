/**
 * Read the public Which? profile and decide whether lib/which.json should change.
 * A bad fetch, a bad parse, or a figure that moves too far keeps the last file.
 * Review text is never kept. Only the count, the rating, the recommend
 * percent and the three sub-scores.
 */
import { checkWhich, type Which } from "./which.ts";

export const PROFILE_URL = "https://trustedtraders.which.co.uk/businesses/d-p-roofing-building-ltd/";
export const WIDGET_URL = "https://trustedtraders.which.co.uk/widgets/businesses/d-p-roofing-building-ltd/reviews";

export type WhichFigures = {
  count: number;
  rating: string;
  recommendPercent: number;
  scores: {
    customerService: string;
    quality: string;
    value: string;
  };
};

export type WhichDecision =
  | { action: "update"; next: Which; reason: string; warn: false }
  | { action: "keep"; reason: string; warn: boolean };

const RATING = /^[0-5]\.\d$/;
/** A handful of reviews can be taken down. More than this is treated as a bad read. */
const MAX_DROP = 5;
/** How many new reviews one quiet day can add before we assume the parse is wrong. */
const MAX_RISE_PER_DAY = 15;
const MAX_RISE = 40;
/** The printed score is one decimal. A jump bigger than this waits for a person. */
const MAX_SCORE_MOVE = 0.5;
const MAX_RECOMMEND_MOVE = 10;

function scoreIn(summary: string, name: string): string | null {
  const re = new RegExp(
    `review-single-attribute ${name}[\\s\\S]{0,800}?class="review-attribute-field review-figure">\\s*([0-5]\\.\\d)\\s*<`,
    "i",
  );
  const found = summary.match(re);
  return found ? found[1] : null;
}

/**
 * Read the reviews summary block Which? prints on the profile and the widget.
 * The JSON-LD block on the profile is ignored: it can lag the summary.
 * Returns null when the page does not contain a complete, consistent summary.
 */
export function parseWhichHtml(html: string): WhichFigures | null {
  if (typeof html !== "string" || html.length < 200) return null;
  const start = html.indexOf('class="reviews-summary"');
  if (start < 0) return null;
  const window = html.slice(start, start + 15000);
  const cuts = ["Sort by", 'class="list"'].map((mark) => window.indexOf(mark)).filter((at) => at > 0);
  const summary = window.slice(0, cuts.length ? Math.min(...cuts) : window.length);

  const rating = summary.match(/class="count"[^>]*>\s*([0-5]\.\d)\s*</);
  const countMatch = summary.match(/class="reviews-overall-total"[^>]*>\s*(\d+)\s+reviews\b/i);
  const recommend = summary.match(/by\s+(\d{1,3})%\s+of\s+customers/i);
  const customerService = scoreIn(summary, "customer-service");
  const quality = scoreIn(summary, "quality");
  const value = scoreIn(summary, "value");
  if (!rating || !countMatch || !recommend || !customerService || !quality || !value) return null;

  const count = Number(countMatch[1]);
  const recommendPercent = Number(recommend[1]);
  if (!Number.isInteger(count) || count <= 0 || count > 10000) return null;
  if (!Number.isInteger(recommendPercent) || recommendPercent < 0 || recommendPercent > 100) return null;
  if (!RATING.test(rating[1]) || !RATING.test(customerService) || !RATING.test(quality) || !RATING.test(value)) return null;

  // The profile also prints "N results". If that total is present and differs, do not guess.
  const totals = [...html.matchAll(/(\d+)\s+results on\s+\d+\s+pages/gi)].map((found) => Number(found[1]));
  if (totals.some((total) => total !== count)) return null;

  return {
    count,
    rating: rating[1],
    recommendPercent,
    scores: { customerService, quality, value },
  };
}

function sameFigures(a: WhichFigures, b: WhichFigures): boolean {
  return (
    a.count === b.count &&
    a.rating === b.rating &&
    a.recommendPercent === b.recommendPercent &&
    a.scores.customerService === b.scores.customerService &&
    a.scores.quality === b.scores.quality &&
    a.scores.value === b.scores.value
  );
}

function dayGap(previous: string, today: string): number {
  const from = Date.parse(`${previous}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 1;
  const days = Math.round((to - from) / 86_400_000);
  return days < 1 ? 1 : days;
}

export function londonDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function keep(reason: string, warn: boolean): WhichDecision {
  return { action: "keep", reason, warn };
}

/** Compare a parsed summary with the file. Identical figures are a keep, so the date alone never commits. */
export function decideWhichUpdate(current: Which, parsed: WhichFigures, checkedOn: string): WhichDecision {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) return keep("the check date is not a date", true);

  const unchanged =
    current.count === parsed.count &&
    current.rating === parsed.rating &&
    current.recommendPercent === parsed.recommendPercent &&
    current.scores.customerService === parsed.scores.customerService &&
    current.scores.quality === parsed.scores.quality &&
    current.scores.value === parsed.scores.value;
  if (unchanged) return keep("figures unchanged", false);

  const drop = current.count - parsed.count;
  if (drop > MAX_DROP) return keep(`count fell by ${drop}, which is more than ${MAX_DROP}`, true);
  const rise = parsed.count - current.count;
  const riseCap = Math.min(MAX_RISE, MAX_RISE_PER_DAY * dayGap(current.checkedOn, checkedOn));
  if (rise > riseCap) return keep(`count rose by ${rise}, which is more than ${riseCap}`, true);

  const moves: Array<[string, string, string]> = [
    ["rating", parsed.rating, current.rating],
    ["customer service", parsed.scores.customerService, current.scores.customerService],
    ["quality", parsed.scores.quality, current.scores.quality],
    ["value", parsed.scores.value, current.scores.value],
  ];
  for (const [label, next, prev] of moves) {
    if (Math.abs(Number(next) - Number(prev)) > MAX_SCORE_MOVE) {
      return keep(`${label} moved from ${prev} to ${next}`, true);
    }
  }
  if (Math.abs(parsed.recommendPercent - current.recommendPercent) > MAX_RECOMMEND_MOVE) {
    return keep(`recommend percent moved from ${current.recommendPercent} to ${parsed.recommendPercent}`, true);
  }

  let next: Which;
  try {
    next = checkWhich({
      count: parsed.count,
      rating: parsed.rating,
      recommendPercent: parsed.recommendPercent,
      scores: parsed.scores,
      checkedOn,
      profileUrl: current.profileUrl,
    });
  } catch (err) {
    return keep(err instanceof Error ? err.message : "parsed figures failed the check", true);
  }
  return { action: "update", next, reason: "figures changed", warn: false };
}

/**
 * profileHtml and widgetHtml are the two public pages. Either may be null when
 * the fetch failed. They must agree when both can be read. One good page is
 * enough. Two that disagree, or none, keep the last file.
 */
export function refreshFromHtml(
  current: Which,
  profileHtml: string | null,
  widgetHtml: string | null,
  checkedOn: string,
): WhichDecision {
  const profile = profileHtml ? parseWhichHtml(profileHtml) : null;
  const widget = widgetHtml ? parseWhichHtml(widgetHtml) : null;
  if (profile && widget && !sameFigures(profile, widget)) {
    return keep("the Which? profile and the review widget do not match", true);
  }
  const parsed = profile ?? widget;
  if (!parsed) return keep("could not read the Which? figures", true);
  const source = profile && widget ? "profile and widget agree" : profile ? "profile only" : "widget only";
  const decision = decideWhichUpdate(current, parsed, checkedOn);
  if (decision.action === "update" || decision.reason === "figures unchanged") {
    return { ...decision, reason: `${decision.reason} (${source})` };
  }
  return decision;
}
