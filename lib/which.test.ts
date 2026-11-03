import { test } from "node:test";
import assert from "node:assert/strict";
import { business } from "./business.ts";
import { checkWhich, which } from "./which.ts";

test("the assistant's Which? line comes from lib/which.json", () => {
  assert.ok(business.knowledge.includes(`Rated ${which.rating} from ${which.count} reviews`));
  assert.ok(business.knowledge.includes(`four of the ${which.count} Which? reviews`));
  assert.ok(!business.knowledge.includes("${"), "no unfilled template left in the knowledge");
});

test("the assistant still refuses to invent reviews or ratings", () => {
  assert.ok(business.rules.some((rule) => rule.startsWith("Never invent reviews, ratings")));
});

test("bad Which? numbers are refused", () => {
  const ok = { count: 143, rating: "5.0", checkedOn: "2026-11-03", profileUrl: "https://trustedtraders.which.co.uk/businesses/d-p-roofing-building-ltd/" };
  assert.equal(checkWhich(ok).count, 143);
  for (const count of [0, -1, 1.5, "143", null]) assert.throws(() => checkWhich({ ...ok, count }));
  for (const rating of ["", "5", "five", 5]) assert.throws(() => checkWhich({ ...ok, rating }));
  assert.throws(() => checkWhich({ ...ok, profileUrl: "https://example.com/" }));
  assert.throws(() => checkWhich(null));
});
