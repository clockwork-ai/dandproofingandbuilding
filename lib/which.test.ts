import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { business } from "./business.ts";
import { checkWhich, formatWhich, which, whichMoreCount, whichPlaceholders, whichScoresSentence } from "./which.ts";

const profileUrl = "https://trustedtraders.which.co.uk/businesses/d-p-roofing-building-ltd/";

function sample(over: Record<string, unknown> = {}) {
  return {
    count: 144,
    rating: "5.0",
    recommendPercent: 99,
    scores: { customerService: "5.0", quality: "5.0", value: "5.0" },
    checkedOn: "2026-11-18",
    profileUrl,
    ...over,
  };
}

test("the assistant's Which? line comes from lib/which.json", () => {
  assert.ok(business.knowledge.includes(`Rated ${which.rating} from ${which.count} reviews`));
  assert.ok(business.knowledge.includes(`four of the ${which.count} Which? reviews`));
  assert.ok(business.knowledge.includes(whichScoresSentence(which)));
  assert.ok(business.knowledge.includes(`${which.recommendPercent}% of customers recommend them`));
  assert.ok(!business.knowledge.includes("${"), "no unfilled template left in the knowledge");
  assert.ok(!business.knowledge.includes("{{WHICH_"));
});

test("the assistant still refuses to invent reviews or ratings", () => {
  assert.ok(business.rules.some((rule) => rule.startsWith("Never invent reviews, ratings")));
});

test("bad Which? numbers are refused", () => {
  assert.equal(checkWhich(sample()).count, 144);
  for (const count of [0, -1, 1.5, "144", null]) assert.throws(() => checkWhich(sample({ count })));
  for (const rating of ["", "5", "five", 5, "5.00"]) assert.throws(() => checkWhich(sample({ rating })));
  for (const recommendPercent of [-1, 101, 99.5, "99", null]) assert.throws(() => checkWhich(sample({ recommendPercent })));
  assert.throws(() => checkWhich(sample({ scores: { customerService: "5.0", quality: "5", value: "5.0" } })));
  assert.throws(() => checkWhich(sample({ scores: null })));
  assert.throws(() => checkWhich(sample({ checkedOn: "18 November 2026" })));
  assert.throws(() => checkWhich(sample({ profileUrl: "https://example.com/" })));
  assert.throws(() => checkWhich(null));
});

test("the scores sentence stays one line when the three scores match", () => {
  assert.equal(
    whichScoresSentence(checkWhich(sample())),
    "Customer service, quality and value all score 5.0",
  );
  const split = checkWhich(sample({ scores: { customerService: "5.0", quality: "4.8", value: "4.9" } }));
  assert.equal(whichScoresSentence(split), "Customer service scores 5.0, quality 4.8 and value 4.9");
});

test("and N more is the count minus the one review the label names", () => {
  assert.equal(whichMoreCount(144), 143);
  assert.equal(whichPlaceholders(which)["{{WHICH_MORE}}"], String(which.count - 1));
  assert.equal(whichPlaceholders(which)["{{WHICH_COUNT}}"], String(which.count));
  assert.equal(whichPlaceholders(which)["{{WHICH_RECOMMEND}}"], String(which.recommendPercent));
});

test("lib/which.json is already in the shape the refresh writes", () => {
  assert.equal(formatWhich(which), readFileSync(new URL("./which.json", import.meta.url), "utf8"));
});

test("pages only use Which? tokens the build knows", () => {
  const known = new Set(Object.keys(whichPlaceholders(which)));
  const pages = ["index.html", "emergency/index.html", "quote/index.html", "quote-bay/index.html"];
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    for (const token of html.match(/\{\{WHICH_[A-Z0-9_]+\}\}/g) ?? []) {
      assert.ok(known.has(token), `${page} has unknown token ${token}`);
    }
  }
});
