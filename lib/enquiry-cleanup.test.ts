import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { business } from "./business.ts";
import {
  authoriseCron,
  cleanupIsDryRun,
  type CleanupEnv,
  type EnquiryCleanupClient,
  type EnquiryListBlob,
  type EnquiryListPage,
  isOlderThanRetention,
  retentionCutoff,
  runEnquiryCleanup,
  subtractUtcMonths,
} from "./enquiry-cleanup.ts";
import { isLeadObjectPath, leadFolderPrefix, leadObjectPath } from "./lead-path.ts";

const now = new Date("2026-11-16T03:30:00.000Z");
const secret = "cron-secret-for-tests";
const hash = "0123456789abcdef";

function enquiry(day: string, uploadedAt?: Date | string | null, extra: Partial<EnquiryListBlob> = {}): EnquiryListBlob {
  return {
    pathname: leadObjectPath(business.lead.storagePrefix, day, hash),
    uploadedAt,
    ...extra,
  };
}

function harness(blobs: EnquiryListBlob[] | EnquiryListPage[]) {
  const listed: { prefix: string; cursor?: string }[] = [];
  const deleted: string[][] = [];
  const reads: string[] = [];
  const pages: EnquiryListPage[] = Array.isArray(blobs) && blobs.length > 0 && "blobs" in blobs[0]
    ? (blobs as EnquiryListPage[])
    : [{ blobs: blobs as EnquiryListBlob[], hasMore: false }];
  let index = 0;
  const client: EnquiryCleanupClient = {
    now,
    listPages: async (options) => {
      listed.push({ prefix: options.prefix, cursor: options.cursor });
      const page = pages[index] ?? { blobs: [], hasMore: false };
      index += 1;
      return page;
    },
    deletePaths: async (pathnames) => {
      deleted.push([...pathnames]);
    },
    readSavedAt: async (pathname) => {
      reads.push(pathname);
      return null;
    },
  };
  return { client, listed, deleted, reads };
}

function call(path: string, client: EnquiryCleanupClient, env: CleanupEnv = {}) {
  return runEnquiryCleanup(
    new Request(`https://dandproofingandbuilding.co.uk${path}`, {
      headers: { authorization: `Bearer ${secret}` },
    }),
    {
      cronSecret: secret,
      blobToken: "blob-token",
      ...env,
    },
    client,
  );
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("the chat enquiry prefix is the single folder the cleanup lists", () => {
  assert.equal(business.lead.storagePrefix, "leads");
  assert.equal(leadFolderPrefix(business.lead.storagePrefix), "leads/");
  const pathname = leadObjectPath(business.lead.storagePrefix, "2024-06-01", hash);
  assert.equal(pathname, "leads/2024-06-01/0123456789abcdef.json");
  assert.equal(isLeadObjectPath(pathname, business.lead.storagePrefix), true);
  for (const other of [
    "leads-old/2024-06-01/0123456789abcdef.json",
    "lead/2024-06-01/0123456789abcdef.json",
    "other/2020-01-01/0123456789abcdef.json",
    "leads/notes.txt",
    "leads/2024-06-01/0123456789abcdef.json.bak",
    "leads/2024-06-01/0123456789ABCDEF.json",
    "leads/2024-6-01/0123456789abcdef.json",
    "leads/2024-06-01/../../secret.json",
    "leads/0123456789abcdef.json",
  ]) {
    assert.equal(isLeadObjectPath(other, business.lead.storagePrefix), false, other);
  }
  for (const bad of ["", "leads/extra", "leads/..", "../leads", "/leads", "Leads", "leads "]) {
    assert.throws(() => leadFolderPrefix(bad), bad);
  }
});

test("the cron route and the cleanup both take the prefix from the chat config", async () => {
  for (const file of ["enquiry-cleanup.ts", "../server/cleanup.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /business\.lead\.storagePrefix/);
    assert.equal(source.includes('"leads"'), false, file);
    assert.equal(source.includes("'leads'"), false, file);
  }
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  assert.deepEqual(vercel.crons, [{ path: "/api/cleanup-enquiries", schedule: "30 3 * * *" }]);
  assert.equal(/^\d{1,2} \d{1,2} \* \* \*$/.test(vercel.crons[0].schedule), true);
});

test("age is calendar months, and exactly 12 months is kept", () => {
  assert.equal(retentionCutoff(now).toISOString(), "2025-11-16T03:30:00.000Z");
  assert.equal(isOlderThanRetention(new Date("2025-11-16T03:29:59.999Z"), now), true);
  assert.equal(isOlderThanRetention(new Date("2025-11-16T03:30:00.000Z"), now), false);
  assert.equal(isOlderThanRetention(new Date("2025-11-16T03:30:00.001Z"), now), false);
  assert.equal(subtractUtcMonths(new Date("2028-02-29T12:00:00.000Z"), 12).toISOString(), "2027-02-28T12:00:00.000Z");
  assert.equal(subtractUtcMonths(new Date("2026-03-31T00:30:00.000Z"), 12).toISOString(), "2025-03-31T00:30:00.000Z");
  assert.equal(subtractUtcMonths(new Date("2026-11-16T00:30:00.000Z"), 12).toISOString(), "2025-11-16T00:30:00.000Z");
});

test("?dry=1 reports expired enquiries and does not delete", async () => {
  const { client, listed, deleted } = harness([
    enquiry("2024-11-15", new Date("2024-11-15T03:30:00.000Z")),
    enquiry("2025-11-16", new Date("2025-11-16T03:30:00.000Z"), { pathname: leadObjectPath("leads", "2025-11-16", "fedcba9876543210") }),
    { pathname: "other/2020-01-01/0123456789abcdef.json", uploadedAt: new Date("2020-01-01T00:00:00.000Z") },
    { pathname: "leads/notes.txt", uploadedAt: new Date("2020-01-01T00:00:00.000Z") },
  ]);
  const response = await call("/api/cleanup-enquiries?dry=1", client);
  const body = await bodyOf(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.dryRun, true);
  assert.equal(body.deleted, 0);
  assert.equal(body.due, 1);
  assert.equal(body.kept, 1);
  assert.equal(body.undated, 0);
  assert.equal(body.prefix, "leads/");
  assert.deepEqual(listed, [{ prefix: "leads/", cursor: undefined }]);
  assert.deepEqual(deleted, []);
});

test("a real run deletes only enquiry objects older than 12 months", async () => {
  const oldPath = leadObjectPath("leads", "2024-11-15", hash);
  const recentPath = leadObjectPath("leads", "2026-01-01", "aaaaaaaaaaaaaaaa");
  const { client, deleted, reads } = harness([
    { pathname: oldPath, uploadedAt: new Date("2024-11-15T03:30:00.000Z"), savedAt: "2026-11-01T00:00:00.000Z" },
    { pathname: recentPath, uploadedAt: "2026-01-01T00:00:00.000Z", savedAt: "2020-01-01T00:00:00.000Z" },
    { pathname: "leads-old/2020-01-01/0123456789abcdef.json", uploadedAt: new Date("2020-01-01T00:00:00.000Z") },
  ]);
  const response = await call("/api/cleanup-enquiries", client);
  const body = await bodyOf(response);
  assert.equal(body.dryRun, false);
  assert.equal(body.deleted, 1);
  assert.equal(body.due, 1);
  assert.equal(body.kept, 1);
  assert.deepEqual(deleted, [[oldPath]]);
  assert.deepEqual(reads, []);
});

test("savedAt is used when uploadedAt is missing, including ?dry=1", async () => {
  const pathname = leadObjectPath("leads", "2020-01-02", hash);
  const { client, deleted, reads } = harness([
    { pathname, uploadedAt: new Date(Number.NaN), savedAt: "2020-01-02T00:00:00.000Z" },
    {
      pathname: leadObjectPath("leads", "2026-02-02", "bbbbbbbbbbbbbbbb"),
      uploadedAt: null,
      savedAt: "2026-02-02T00:00:00.000Z",
    },
  ]);
  const response = await call("/api/cleanup-enquiries?dry=1", client);
  const body = await bodyOf(response);
  assert.equal(body.deleted, 0);
  assert.equal(body.due, 1);
  assert.equal(body.kept, 1);
  assert.deepEqual(deleted, []);
  assert.deepEqual(reads, []);
});

test("a missing uploadedAt can be read from the saved enquiry", async () => {
  const pathname = leadObjectPath("leads", "2020-03-03", hash);
  const { client, deleted, reads } = harness([{ pathname, uploadedAt: null }]);
  client.readSavedAt = async (asked) => {
    reads.push(asked);
    return asked === pathname ? "2020-03-03T00:00:00.000Z" : null;
  };
  const response = await call("/api/cleanup-enquiries", client);
  const body = await bodyOf(response);
  assert.equal(body.deleted, 1);
  assert.equal(body.undated, 0);
  assert.deepEqual(reads, [pathname]);
  assert.deepEqual(deleted, [[pathname]]);
});

test("an enquiry with no usable time is left in place", async () => {
  const pathname = leadObjectPath("leads", "2020-04-04", hash);
  const { client, deleted } = harness([{ pathname, uploadedAt: "not-a-time", savedAt: "" }]);
  const response = await call("/api/cleanup-enquiries", client);
  const body = await bodyOf(response);
  assert.equal(body.deleted, 0);
  assert.equal(body.undated, 1);
  assert.deepEqual(deleted, []);
});

test("dry=1 is the only dry-run switch", async () => {
  const pathname = leadObjectPath("leads", "2020-05-05", hash);
  const { client, deleted } = harness([{ pathname, uploadedAt: new Date("2020-05-05T00:00:00.000Z") }]);
  const response = await call("/api/cleanup-enquiries?dry=true", client);
  const body = await bodyOf(response);
  assert.equal(cleanupIsDryRun(new URL("https://dandproofingandbuilding.co.uk/api/cleanup-enquiries?dry=1")), true);
  assert.equal(cleanupIsDryRun(new URL("https://dandproofingandbuilding.co.uk/api/cleanup-enquiries?dry=true")), false);
  assert.equal(body.dryRun, false);
  assert.equal(body.deleted, 1);
  assert.deepEqual(deleted, [[pathname]]);
});

test("pages are deleted in batches and only under the enquiry prefix", async () => {
  const blobs: EnquiryListBlob[] = [];
  for (let index = 0; index < 101; index += 1) {
    const id = index.toString(16).padStart(16, "0");
    blobs.push({
      pathname: leadObjectPath("leads", "2019-01-01", id),
      uploadedAt: new Date("2019-01-01T00:00:00.000Z"),
    });
  }
  const extra = leadObjectPath("leads", "2019-01-02", hash);
  const { client, deleted, listed } = harness([
    {
      blobs: [...blobs, { pathname: "secrets/keep.json", uploadedAt: new Date("2019-01-01T00:00:00.000Z") }],
      hasMore: true,
      cursor: "page-2",
    },
    { blobs: [{ pathname: extra, uploadedAt: new Date("2019-01-02T00:00:00.000Z") }], hasMore: false },
  ]);
  const response = await call("/api/cleanup-enquiries", client);
  const body = await bodyOf(response);
  assert.equal(response.status, 200);
  assert.equal(body.deleted, 102);
  assert.equal(body.due, 102);
  assert.deepEqual(
    listed.map((entry) => entry.prefix),
    ["leads/", "leads/"],
  );
  assert.equal(listed[1].cursor, "page-2");
  const flat = deleted.flat();
  assert.equal(flat.length, 102);
  assert.equal(deleted[0].length, 100);
  assert.equal(deleted[1].length, 1);
  assert.equal(deleted[2].length, 1);
  for (const pathname of flat) assert.equal(isLeadObjectPath(pathname, "leads"), true);
  assert.equal(flat.includes("secrets/keep.json"), false);
  assert.equal(flat.includes(extra), true);
});

test("a repeated list cursor deletes nothing further and reports failure", async () => {
  const { client, deleted } = harness([
    { blobs: [enquiry("2019-01-01", new Date("2019-01-01T00:00:00.000Z"))], hasMore: true, cursor: "again" },
    { blobs: [], hasMore: true, cursor: "again" },
  ]);
  const response = await call("/api/cleanup-enquiries?dry=1", client);
  const body = await bodyOf(response);
  assert.equal(response.status, 500);
  assert.equal(body.error, "cleanup-failed");
  assert.deepEqual(deleted, []);
});

test("CRON_SECRET must be set and presented, or the route does not list or delete", async () => {
  const cases: { name: string; env: CleanupEnv; header?: string; status: number; error: string }[] = [
    { name: "missing", env: { blobToken: "blob-token" }, header: `Bearer ${secret}`, status: 503, error: "CRON_SECRET is not set" },
    { name: "blank", env: { cronSecret: "   ", blobToken: "blob-token" }, header: "Bearer    ", status: 503, error: "CRON_SECRET is not set" },
    { name: "wrong", env: { cronSecret: secret, blobToken: "blob-token" }, header: "Bearer wrong", status: 401, error: "Unauthorised" },
    { name: "absent", env: { cronSecret: secret, blobToken: "blob-token" }, status: 401, error: "Unauthorised" },
    { name: "no blob", env: { cronSecret: secret }, header: `Bearer ${secret}`, status: 503, error: "storage-not-configured" },
  ];
  for (const item of cases) {
    const { client, listed, deleted } = harness([enquiry("2019-01-01", new Date("2019-01-01T00:00:00.000Z"))]);
    const response = await runEnquiryCleanup(
      new Request("https://dandproofingandbuilding.co.uk/api/cleanup-enquiries?dry=1", {
        headers: item.header ? { authorization: item.header } : {},
      }),
      item.env,
      client,
    );
    const body = await bodyOf(response);
    assert.equal(response.status, item.status, item.name);
    assert.equal(body.error, item.error, item.name);
    assert.deepEqual(listed, [], item.name);
    assert.deepEqual(deleted, [], item.name);
  }
  assert.equal(authoriseCron(null, undefined).ok, false);
  assert.equal(authoriseCron(`Bearer ${secret}`, secret).ok, true);
});

test("logs the count deleted and not the secret", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = ((...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  }) as typeof console.info;
  try {
    const dry = harness([enquiry("2019-06-01", new Date("2019-06-01T00:00:00.000Z"))]);
    await call("/api/cleanup-enquiries?dry=1", dry.client);
    const live = harness([enquiry("2019-06-01", new Date("2019-06-01T00:00:00.000Z"))]);
    await call("/api/cleanup-enquiries", live.client);
  } finally {
    console.info = original;
  }
  assert.equal(lines.some((line) => line.includes("deleted=0") && line.includes("prefix=leads/") && line.includes("dry=true")), true);
  assert.equal(lines.some((line) => line.includes("deleted=1") && line.includes("prefix=leads/") && line.includes("dry=false")), true);
  assert.equal(lines.some((line) => line.includes(secret)), false);
});
