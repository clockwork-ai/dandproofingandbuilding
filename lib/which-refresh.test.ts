import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWhich, type Which } from "./which.ts";
import { decideWhichUpdate, parseWhichHtml, refreshFromHtml } from "./which-refresh.ts";

const profileUrl = "https://trustedtraders.which.co.uk/businesses/d-p-roofing-building-ltd/";

function current(over: Partial<Which> = {}): Which {
  return checkWhich({
    count: 144,
    rating: "5.0",
    recommendPercent: 99,
    scores: { customerService: "5.0", quality: "5.0", value: "5.0" },
    checkedOn: "2026-11-18",
    profileUrl,
    ...over,
  });
}

/** A short copy of the Which? summary markup. No customer review text. */
function summary(opts: {
  count?: number;
  rating?: string;
  recommend?: number;
  service?: string;
  quality?: string;
  value?: string;
  results?: number | null;
  jsonLdCount?: number | null;
}): string {
  const count = opts.count ?? 144;
  const rating = opts.rating ?? "5.0";
  const recommend = opts.recommend ?? 99;
  const service = opts.service ?? "5.0";
  const quality = opts.quality ?? "5.0";
  const value = opts.value ?? "5.0";
  const jsonLd =
    opts.jsonLdCount == null
      ? ""
      : `<script type="application/ld+json">{"aggregateRating":{"reviewCount":${opts.jsonLdCount},"ratingValue":4.2}}</script>`;
  const results =
    opts.results === null ? "" : `<p class="page-totals"><span>${opts.results ?? count} results on 6 pages</span></p>`;
  return `<!doctype html><html><body>
    ${jsonLd}
    <div class="reviews-summary">
      <div class="count">
        ${rating}
      </div>
      <div class="reviews-overall-total">
        ${count} reviews
      </div>
      <div class="review-single-attribute customer-service clearfix">
        <span>Customer Service</span>
        <div class="review-attribute-field review-figure">${service}</div>
      </div>
      <div class="review-single-attribute quality clearfix">
        <span>Quality</span>
        <div class="review-attribute-field review-figure">${quality}</div>
      </div>
      <div class="review-single-attribute value clearfix">
        <span>Value</span>
        <div class="review-attribute-field review-figure">${value}</div>
      </div>
      <div class="count">by ${recommend}% of customers</div>
    </div>
    <div class="list">
      <div class="review-single-attribute quality clearfix">
        <div class="review-attribute-field review-figure">1.0</div>
      </div>
    </div>
    ${results}
  </body></html>`;
}

test("the summary is read and the stale JSON-LD count is ignored", () => {
  const parsed = parseWhichHtml(summary({ jsonLdCount: 142 }));
  assert.ok(parsed);
  assert.equal(parsed.count, 144);
  assert.equal(parsed.rating, "5.0");
  assert.equal(parsed.recommendPercent, 99);
  assert.deepEqual(parsed.scores, { customerService: "5.0", quality: "5.0", value: "5.0" });
});

test("a later review score is not used as the company score", () => {
  const parsed = parseWhichHtml(summary({ quality: "4.8" }));
  assert.equal(parsed?.scores.quality, "4.8");
});

test("a summary that does not add up is refused", () => {
  assert.equal(parseWhichHtml(summary({ results: 100 })), null);
  assert.equal(parseWhichHtml(summary({ rating: "five" })), null);
  assert.equal(parseWhichHtml(summary({ recommend: 150 })), null);
  assert.equal(parseWhichHtml(summary({ count: 0 })), null);
  assert.equal(parseWhichHtml("<html>no summary here, just a short page</html>"), null);
  assert.equal(parseWhichHtml(""), null);
});

test("an unchanged summary does not rewrite the file", () => {
  const decision = decideWhichUpdate(current(), parseWhichHtml(summary({}))!, "2026-11-19");
  assert.equal(decision.action, "keep");
  assert.equal(decision.warn, false);
});

test("a small move is accepted and a sharp move is kept", () => {
  const up = decideWhichUpdate(current(), parseWhichHtml(summary({ count: 145 }))!, "2026-11-19");
  assert.equal(up.action, "update");
  if (up.action === "update") {
    assert.equal(up.next.count, 145);
    assert.equal(up.next.checkedOn, "2026-11-19");
    assert.equal(up.next.profileUrl, profileUrl);
  }

  const down = decideWhichUpdate(current(), parseWhichHtml(summary({ count: 140 }))!, "2026-11-19");
  assert.equal(down.action, "update");

  const sharpDrop = decideWhichUpdate(current(), parseWhichHtml(summary({ count: 138 }))!, "2026-11-19");
  assert.equal(sharpDrop.action, "keep");
  assert.equal(sharpDrop.warn, true);

  const sharpRise = decideWhichUpdate(current(), parseWhichHtml(summary({ count: 200 }))!, "2026-11-19");
  assert.equal(sharpRise.action, "keep");
  assert.equal(sharpRise.warn, true);

  const score = decideWhichUpdate(current(), parseWhichHtml(summary({ rating: "4.4" }))!, "2026-11-19");
  assert.equal(score.action, "keep");

  const recommend = decideWhichUpdate(current(), parseWhichHtml(summary({ recommend: 80 }))!, "2026-11-19");
  assert.equal(recommend.action, "keep");
});

test("a missed week can accept more new reviews than one day", () => {
  const afterAWeek = decideWhichUpdate(current({ checkedOn: "2026-11-11" }), parseWhichHtml(summary({ count: 160 }))!, "2026-11-18");
  assert.equal(afterAWeek.action, "update");
  const stillTooMany = decideWhichUpdate(current({ checkedOn: "2026-10-01" }), parseWhichHtml(summary({ count: 200 }))!, "2026-11-18");
  assert.equal(stillTooMany.action, "keep");
});

test("a failed fetch or a disagreement keeps the last figures", () => {
  const saved = current();
  const page = summary({});
  const none = refreshFromHtml(saved, null, null, "2026-11-19");
  assert.equal(none.action, "keep");
  assert.equal(none.warn, true);

  const profileOnly = refreshFromHtml(saved, summary({ count: 145 }), null, "2026-11-19");
  assert.equal(profileOnly.action, "update");
  if (profileOnly.action === "update") assert.match(profileOnly.reason, /profile only/);

  const widgetOnly = refreshFromHtml(saved, null, summary({ count: 145 }), "2026-11-19");
  assert.equal(widgetOnly.action, "update");
  if (widgetOnly.action === "update") assert.match(widgetOnly.reason, /widget only/);

  const clash = refreshFromHtml(saved, summary({ count: 145 }), summary({ count: 146 }), "2026-11-19");
  assert.equal(clash.action, "keep");
  assert.match(clash.reason, /do not match/);

  const garbage = refreshFromHtml(saved, "not a which page at all ".repeat(20), page, "2026-11-19");
  assert.equal(garbage.action, "keep");
  assert.equal(garbage.reason, "figures unchanged (widget only)");

  assert.equal(saved.count, 144);
});
