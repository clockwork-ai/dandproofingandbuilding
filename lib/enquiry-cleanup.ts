import { timingSafeEqual } from "node:crypto";
import { business } from "./business.ts";
import { isLeadObjectPath, leadFolderPrefix } from "./lead-path.ts";

/** Saved chat enquiries are deleted after this many calendar months. */
export const ENQUIRY_RETENTION_MONTHS = 12;

const DELETE_BATCH = 100;
const MAX_LIST_PAGES = 1000;

export type EnquiryListBlob = {
  pathname: string;
  uploadedAt?: Date | string | null;
  savedAt?: string | null;
};

export type EnquiryListPage = {
  blobs: EnquiryListBlob[];
  cursor?: string;
  hasMore: boolean;
};

export type EnquiryCleanupClient = {
  now?: Date;
  listPages: (options: { prefix: string; cursor?: string }) => Promise<EnquiryListPage>;
  deletePaths: (pathnames: string[]) => Promise<void>;
  readSavedAt?: (pathname: string) => Promise<string | null>;
};

export type CleanupEnv = {
  cronSecret?: string;
  blobToken?: string;
  blobStoreId?: string;
};

export type EnquiryCleanupReport = {
  prefix: string;
  dryRun: boolean;
  deleted: number;
  due: number;
  kept: number;
  undated: number;
};

export function subtractUtcMonths(from: Date, months: number): Date {
  const monthIndex = from.getUTCMonth() - months;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), monthIndex, 1));
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

export function retentionCutoff(now: Date, months = ENQUIRY_RETENTION_MONTHS): Date {
  return subtractUtcMonths(now, months);
}

/** True when the save is strictly older than the retention period. */
export function isOlderThanRetention(saved: Date, now: Date, months = ENQUIRY_RETENTION_MONTHS): boolean {
  return saved.getTime() < retentionCutoff(now, months).getTime();
}

export function cleanupIsDryRun(url: URL): boolean {
  return url.searchParams.get("dry") === "1";
}

export function authoriseCron(
  authorization: string | null,
  secret: string | undefined,
): { ok: true } | { ok: false; status: number; error: string } {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    return { ok: false, status: 503, error: "CRON_SECRET is not set" };
  }
  const expected = `Bearer ${secret}`;
  if (authorization == null || !fixedEqual(authorization, expected)) {
    return { ok: false, status: 401, error: "Unauthorised" };
  }
  return { ok: true };
}

function fixedEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseTime(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * uploadedAt is the clock on the blob. The savedAt field inside the JSON
 * is used only when uploadedAt is missing or not a real time.
 */
async function savedTime(
  blob: EnquiryListBlob,
  readSavedAt?: (pathname: string) => Promise<string | null>,
): Promise<Date | null> {
  const uploaded = parseTime(blob.uploadedAt);
  if (uploaded) return uploaded;
  const inline = parseTime(blob.savedAt);
  if (inline) return inline;
  if (!readSavedAt) return null;
  try {
    return parseTime(await readSavedAt(blob.pathname));
  } catch {
    return null;
  }
}

function assertEnquiryPaths(pathnames: string[], storagePrefix: string): void {
  for (const pathname of pathnames) {
    if (!isLeadObjectPath(pathname, storagePrefix)) {
      throw new Error("refusing to delete outside the enquiry prefix");
    }
  }
}

async function deleteInBatches(
  pathnames: string[],
  storagePrefix: string,
  deletePaths: (pathnames: string[]) => Promise<void>,
): Promise<number> {
  let deleted = 0;
  for (let index = 0; index < pathnames.length; index += DELETE_BATCH) {
    const batch = pathnames.slice(index, index + DELETE_BATCH);
    assertEnquiryPaths(batch, storagePrefix);
    await deletePaths(batch);
    deleted += batch.length;
  }
  return deleted;
}

export async function cleanupEnquiryBlobs(
  client: EnquiryCleanupClient,
  now: Date,
  dryRun: boolean,
): Promise<EnquiryCleanupReport> {
  const storagePrefix = business.lead.storagePrefix;
  const prefix = leadFolderPrefix(storagePrefix);
  let cursor: string | undefined;
  const seen = new Set<string>();
  let deleted = 0;
  let due = 0;
  let kept = 0;
  let undated = 0;

  for (let pageNumber = 1; pageNumber <= MAX_LIST_PAGES; pageNumber += 1) {
    const page = await client.listPages({ prefix, cursor });
    const batch: string[] = [];
    for (const blob of page.blobs) {
      if (!isLeadObjectPath(blob.pathname, storagePrefix)) continue;
      const when = await savedTime(blob, client.readSavedAt);
      if (!when) {
        undated += 1;
        continue;
      }
      if (!isOlderThanRetention(when, now)) {
        kept += 1;
        continue;
      }
      batch.push(blob.pathname);
    }
    due += batch.length;
    if (!dryRun && batch.length > 0) {
      deleted += await deleteInBatches(batch, storagePrefix, client.deletePaths);
    }
    if (!page.hasMore) {
      return { prefix, dryRun, deleted, due, kept, undated };
    }
    if (!page.cursor || seen.has(page.cursor)) {
      throw new Error("lead cleanup: list pagination stopped");
    }
    seen.add(page.cursor);
    cursor = page.cursor;
  }
  throw new Error("lead cleanup: list pagination stopped");
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function runEnquiryCleanup(
  request: Request,
  env: CleanupEnv,
  client: EnquiryCleanupClient,
): Promise<Response> {
  const auth = authoriseCron(request.headers.get("authorization"), env.cronSecret);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.blobToken && !env.blobStoreId) {
    console.error("lead cleanup: Blob is not connected");
    return json({ error: "storage-not-configured" }, 503);
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  try {
    const result = await cleanupEnquiryBlobs(client, client.now ?? new Date(), cleanupIsDryRun(url));
    console.info(
      `lead cleanup: deleted=${result.deleted} due=${result.due} kept=${result.kept} undated=${result.undated} prefix=${result.prefix} dry=${result.dryRun}`,
    );
    return json(result, 200);
  } catch (error) {
    console.error("lead cleanup: failed", error instanceof Error ? error.name : "error");
    return json({ error: "cleanup-failed" }, 500);
  }
}
