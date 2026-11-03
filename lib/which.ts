/**
 * The Which? review count and rating, read from lib/which.json.
 * Change the number in lib/which.json, nowhere else.
 */
import data from "./which.json" with { type: "json" };

export type Which = { count: number; rating: string; checkedOn: string; profileUrl: string };

/** Throws if the numbers could put a 0, a blank or nonsense on the site. */
export function checkWhich(value: unknown): Which {
  const w = value as Partial<Which> | null;
  if (!w || typeof w !== "object") throw new Error("lib/which.json is not an object");
  if (!Number.isInteger(w.count) || (w.count as number) <= 0) throw new Error(`lib/which.json "count" must be a whole number above 0, got ${JSON.stringify(w.count)}`);
  if (typeof w.rating !== "string" || !/^[0-5]\.\d$/.test(w.rating)) throw new Error(`lib/which.json "rating" must look like "5.0", got ${JSON.stringify(w.rating)}`);
  if (typeof w.profileUrl !== "string" || !w.profileUrl.startsWith("https://trustedtraders.which.co.uk/")) throw new Error(`lib/which.json "profileUrl" must be the Which? profile link`);
  return w as Which;
}

export const which: Which = checkWhich(data);
