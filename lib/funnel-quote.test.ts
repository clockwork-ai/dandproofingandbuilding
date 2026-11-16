import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { business } from "./business.ts";
import {
  FUNNEL_MAX_REQUESTS,
  FUNNEL_SOURCE,
  handleFunnelQuote,
  isFunnelPreview,
  type FunnelQuoteDeps,
} from "./funnel-quote.ts";
import { resetRateLimits } from "./guard.ts";
import { leadObjectPath } from "./lead-path.ts";
import type { LeadInput, LeadResult } from "./leads.ts";

const root = path.resolve(import.meta.dirname, "..");
const now = 1_763_300_000_000;

function quoteRequest(
  overrides: Record<string, unknown> = {},
  ip = "203.0.113.20",
  origin?: string,
): Request {
  const body = {
    name: "Jane Smith",
    phone: "07700900123",
    postcode: "bl53hb",
    job: "Slipped tiles after the wind",
    dp_leave_blank: "",
    filledMs: 4000,
    page: "/quote/",
    ...overrides,
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "dandproofingandbuilding.co.uk",
    "x-forwarded-for": ip,
  };
  if (origin) headers.origin = origin;
  return new Request("https://dandproofingandbuilding.co.uk/api/quote", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function harness(preview = false) {
  const saved: LeadInput[] = [];
  const deps: FunnelQuoteDeps = {
    now,
    preview,
    save: async (lead) => {
      saved.push(lead);
      return { ok: true, notified: true } satisfies LeadResult;
    },
  };
  return { deps, saved };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("a valid quote is stored with source funnel-quote and the page", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(quoteRequest({ page: "/quote/" }, "203.0.113.21"), deps);
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, undefined);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.source, FUNNEL_SOURCE);
  assert.equal(saved[0]?.page, "/quote");
  assert.equal(saved[0]?.name, "Jane Smith");
  assert.equal(saved[0]?.phone, "07700900123");
  assert.equal(saved[0]?.postcode, "BL5 3HB");
  assert.equal(saved[0]?.job, "Slipped tiles after the wind");
  assert.equal(saved[0]?.photos, "no photo on this form");
  const pathname = leadObjectPath(business.lead.storagePrefix, "2026-11-16", "0123456789abcdef");
  assert.equal(pathname, "leads/2026-11-16/0123456789abcdef.json");
  assert.equal(business.lead.storagePrefix, "leads");
});

test("the bay quote page is stored as its own page", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(
    quoteRequest({ page: "/quote-bay/" }, "203.0.113.22"),
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(saved[0]?.source, "funnel-quote");
  assert.equal(saved[0]?.page, "/quote-bay");
});

test("a honeypot submission is rejected and not stored", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(
    quoteRequest({ dp_leave_blank: "Acme Ltd" }, "203.0.113.23"),
    deps,
  );
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
  const body = await bodyOf(response);
  assert.equal(body.ok, undefined);
});

test("a too-fast submission is rejected and not stored", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(quoteRequest({ filledMs: 2999 }, "203.0.113.24"), deps);
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
  const body = await bodyOf(response);
  assert.match(String(body.error), /wait a moment/i);
});

test("a bad phone number is rejected", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(quoteRequest({ phone: "12345" }, "203.0.113.25"), deps);
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
  const body = await bodyOf(response);
  assert.match(String(body.error), /phone/i);
});

test("a bad postcode is rejected", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const response = await handleFunnelQuote(quoteRequest({ postcode: "Bolton" }, "203.0.113.26"), deps);
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
  const body = await bodyOf(response);
  assert.match(String(body.error), /postcode/i);
});

test("preview mode validates and returns success without storing or notifying", async () => {
  resetRateLimits();
  const { deps, saved } = harness(true);
  const response = await handleFunnelQuote(quoteRequest({}, "203.0.113.27"), deps);
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.match(String(body.message), /Dale or the team will call you back/);
  assert.equal(saved.length, 0);
});

test("preview mode still rejects a bad phone and does not store it", async () => {
  resetRateLimits();
  const { deps, saved } = harness(true);
  const response = await handleFunnelQuote(quoteRequest({ phone: "nope" }, "203.0.113.28"), deps);
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
});

test("preview is only the Vercel preview environment", () => {
  assert.equal(isFunnelPreview("preview"), true);
  assert.equal(isFunnelPreview("production"), false);
  assert.equal(isFunnelPreview("development"), false);
  assert.equal(isFunnelPreview(undefined), false);
});

test("the preview route does not call storage or the notification hook", async () => {
  resetRateLimits();
  const previousEnv = process.env.VERCEL_ENV;
  const previousNotify = process.env.LEAD_NOTIFY_URL;
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  const previousStore = process.env.BLOB_STORE_ID;
  const fetches: string[] = [];
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = "preview";
  process.env.LEAD_NOTIFY_URL = "https://example.com/should-not-be-called";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches.push(String(input));
    return new Response("no", { status: 500 });
  }) as typeof fetch;
  try {
    const { POST } = await import("../server/quote.ts");
    const response = await POST(quoteRequest({}, "203.0.113.29"));
    assert.equal(response.status, 200);
    const body = await bodyOf(response);
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(fetches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousNotify == null) delete process.env.LEAD_NOTIFY_URL;
    else process.env.LEAD_NOTIFY_URL = previousNotify;
    if (previousToken == null) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    if (previousStore == null) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = previousStore;
  }
});

test("rate limit is per IP on the quote form", async () => {
  resetRateLimits();
  const { deps, saved } = harness(false);
  const ip = "203.0.113.30";
  for (let i = 0; i < FUNNEL_MAX_REQUESTS; i += 1) {
    const response = await handleFunnelQuote(quoteRequest({ job: `Tiles ${i}` }, ip), deps);
    assert.equal(response.status, 200);
  }
  const blocked = await handleFunnelQuote(quoteRequest({ job: "One more" }, ip), deps);
  assert.equal(blocked.status, 429);
  assert.equal(saved.length, FUNNEL_MAX_REQUESTS);
});

test("a storage failure is a friendly error and does not claim success", async () => {
  resetRateLimits();
  const deps: FunnelQuoteDeps = {
    now,
    preview: false,
    save: async () => ({ ok: false, error: "storage-failed" }),
  };
  const response = await handleFunnelQuote(quoteRequest({}, "203.0.113.31"), deps);
  assert.equal(response.status, 503);
  const body = await bodyOf(response);
  assert.equal(body.ok, undefined);
  assert.equal(String(body.error).includes("storage"), false);
  assert.match(String(body.error), /didn't send/);
});

async function htmlFiles(dir: string): Promise<string[]> {
  const skip = new Set(["node_modules", "public", "api", "lib", "server", "scripts"]);
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

test("the three ad pages stay noindex, off the sitemap, and unlinked", async () => {
  const quote = await readFile(path.join(root, "quote/index.html"), "utf8");
  const bay = await readFile(path.join(root, "quote-bay/index.html"), "utf8");
  const emergency = await readFile(path.join(root, "emergency/index.html"), "utf8");
  for (const html of [quote, bay, emergency]) {
    assert.match(html, /noindex,\s*nofollow/);
    assert.match(html, /EXAMPLE - NOT LIVE/);
    assert.match(html, /href="\/privacy\/"/);
    assert.equal(html.includes("privacy.html"), false);
    assert.equal(html.includes(".html"), false);
  }
  assert.match(emergency, /07587 415299/);
  assert.match(emergency, /tel:\+447587415299/);
  assert.equal(emergency.includes("<form"), false);
  assert.match(quote, /id="quoteForm"/);
  assert.match(bay, /id="quoteForm"/);
  assert.equal(quote.includes('type="file"'), false);
  assert.equal(bay.includes('type="file"'), false);

  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  assert.equal(sitemap.includes("/quote"), false);
  assert.equal(sitemap.includes("/emergency"), false);

  const robots = await readFile(path.join(root, "robots.txt"), "utf8");
  assert.match(robots, /Disallow: \/quote\//);
  assert.match(robots, /Disallow: \/quote-bay\//);
  assert.match(robots, /Disallow: \/emergency\//);

  const pages = await htmlFiles(root);
  const linkedFrom: string[] = [];
  for (const file of pages) {
    const rel = path.relative(root, file);
    if (rel === "quote/index.html" || rel === "quote-bay/index.html" || rel === "emergency/index.html") {
      continue;
    }
    const html = await readFile(file, "utf8");
    if (/href="\/quote\/?"/.test(html) || /href="\/quote-bay\/?"/.test(html) || /href="\/emergency\/?"/.test(html)) {
      linkedFrom.push(rel);
    }
  }
  assert.deepEqual(linkedFrom, []);
});
