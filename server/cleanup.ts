import { del, get, list } from "@vercel/blob";
import { business } from "../lib/business.ts";
import { runEnquiryCleanup } from "../lib/enquiry-cleanup.ts";
import { isLeadObjectPath, leadFolderPrefix } from "../lib/lead-path.ts";

export const maxDuration = 60;

const storagePrefix = business.lead.storagePrefix;
const listPrefix = leadFolderPrefix(storagePrefix);

async function readSavedAt(pathname: string): Promise<string | null> {
  if (!isLeadObjectPath(pathname, storagePrefix)) return null;
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  if (text.length > 8192) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !("savedAt" in parsed)) return null;
    const savedAt = (parsed as { savedAt?: unknown }).savedAt;
    return typeof savedAt === "string" ? savedAt : null;
  } catch {
    return null;
  }
}

export function GET(request: Request): Promise<Response> {
  return runEnquiryCleanup(
    request,
    {
      cronSecret: process.env.CRON_SECRET,
      blobToken: process.env.BLOB_READ_WRITE_TOKEN,
      blobStoreId: process.env.BLOB_STORE_ID,
    },
    {
      listPages: async ({ prefix, cursor }) => {
        if (prefix !== listPrefix) {
          throw new Error("refusing to list outside the enquiry prefix");
        }
        const page = await list({ prefix, cursor, limit: 1000 });
        return {
          blobs: page.blobs.map((blob) => ({
            pathname: blob.pathname,
            uploadedAt: blob.uploadedAt,
          })),
          cursor: page.cursor,
          hasMore: page.hasMore,
        };
      },
      deletePaths: async (pathnames) => {
        for (const pathname of pathnames) {
          if (!isLeadObjectPath(pathname, storagePrefix)) {
            throw new Error("refusing to delete outside the enquiry prefix");
          }
        }
        await del(pathnames);
      },
      readSavedAt,
    },
  );
}
