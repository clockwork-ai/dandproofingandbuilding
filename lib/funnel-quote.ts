import { cleanLine, clientKey, knownPage, sameOrigin, takeRateLimit } from "./guard.ts";
import { validateLead, type LeadInput, type LeadResult } from "./leads.ts";

/**
 * Ad quote pages post here. Photos are not accepted: a picture would need its
 * own Blob object, and the nightly cleanup only deletes leads/YYYY-MM-DD/<id>.json.
 * The function body limit is also well under an 8 MB photo. The text record
 * uses the same saveLead path as a chat enquiry, including the notification.
 */

export const FUNNEL_SOURCE = "funnel-quote" as const;
export const FUNNEL_PAGES = ["/quote", "/quote-bay"] as const;
export const MIN_FILL_MS = 3000;
export const FUNNEL_WINDOW_MS = 10 * 60 * 1000;
export const FUNNEL_MAX_REQUESTS = 10;
const MAX_BODY = 12_000;

const THANKS = "Thanks, we've got your details. Dale or the team will call you back.";
const FAILED = "Sorry, that didn't send. Please try again in a moment.";
const TOO_FAST = "Please wait a moment and try again.";
const SPAM = "Sorry, that didn't send. Please try again.";

const FIELD_ERRORS: Record<string, string> = {
  "I need a name.": "Please add your name.",
  "I need a phone number.": "Please check the phone number.",
  "I need a postcode, such as BL5 3HB.": "Please check the postcode. It should look like BL5 3HB.",
  "I need a short note on the job.": "Please add a short note on the job.",
};

export type FunnelQuoteDeps = {
  now: number;
  /** True only when VERCEL_ENV is preview. Validate, then succeed with no save and no notification. */
  preview: boolean;
  save: (lead: LeadInput) => Promise<LeadResult>;
};

export function isFunnelPreview(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === "preview";
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function readFilledMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function honeypotTripped(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (typeof value !== "string") return true;
  return cleanLine(value, 200).length > 0;
}

export async function handleFunnelQuote(request: Request, deps: FunnelQuoteDeps): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: "Open the quote page on the site and try again." }, 403);
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) {
    return json({ error: "That note is a bit long. Please shorten it and try again." }, 413);
  }

  const limit = takeRateLimit(
    `funnel:${clientKey(request)}`,
    deps.now,
    FUNNEL_WINDOW_MS,
    FUNNEL_MAX_REQUESTS,
  );
  if (!limit.ok) {
    return json({ error: "Please wait a few minutes and try again." }, 429);
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return json({ error: FAILED }, 400);
  }
  if (raw.length > MAX_BODY) {
    return json({ error: "That note is a bit long. Please shorten it and try again." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Please check the details and try again." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Please check the details and try again." }, 400);
  }
  const input = body as Record<string, unknown>;

  if (honeypotTripped(input.dp_leave_blank)) {
    console.info("funnel quote rejected reason=honeypot");
    return json({ error: SPAM }, 400);
  }

  const filledMs = readFilledMs(input.filledMs);
  if (filledMs == null || filledMs < MIN_FILL_MS) {
    console.info("funnel quote rejected reason=too-fast");
    return json({ error: TOO_FAST }, 400);
  }

  const page = knownPage(input.page, FUNNEL_PAGES);
  if (!page) {
    return json({ error: "Please use the quote form on this page." }, 400);
  }

  const parsed = validateLead(
    {
      name: input.name,
      phone: input.phone,
      postcode: input.postcode,
      job: input.job,
      photos: "no photo on this form",
    },
    FUNNEL_SOURCE,
    page,
  );
  if (!parsed.ok) {
    return json({ error: FIELD_ERRORS[parsed.error] ?? "Please check the details and try again." }, 400);
  }

  if (deps.preview) {
    console.info(`funnel quote dry-run page=${page}`);
    return json({ ok: true, dryRun: true, message: THANKS });
  }

  let saved: LeadResult;
  try {
    saved = await deps.save(parsed.lead);
  } catch (error) {
    console.error("funnel quote: save threw", error instanceof Error ? error.name : "error");
    return json({ error: FAILED }, 503);
  }
  if (!saved.ok) {
    console.error(`funnel quote: save failed ${saved.error}`);
    return json({ error: FAILED }, 503);
  }
  return json({ ok: true, message: THANKS });
}
