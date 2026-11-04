import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("photo frame: the Google rating stays off, and the frame and captions stay on Which? figures", () => {
  const html = readFileSync("photo-frame/index.html", "utf8");
  assert.match(html, /const GOOGLE_RATING_ON = false;/);
  assert.match(html, /const REVIEWS_SUMMARY_URL = "";/);
  assert.ok(html.includes("Rated ${WHICH.rating} from ${WHICH.count} reviews on Which? Trusted Trader."));
  assert.doesNotMatch(html, /vercel|clockwork|jobflow|places api/i, "no vendor or tool names in the served page");
  assert.doesNotMatch(html, /authorName|d\.reviews|\.text\b/, "rating and count only");
  assert.doesNotMatch(html, /[–—]/);
});
