import { business } from "../lib/business.ts";
import { handleFunnelQuote, isFunnelPreview } from "../lib/funnel-quote.ts";
import { saveLead } from "../lib/leads.ts";

export const maxDuration = 15;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function GET(): Response {
  return json({ error: "Send the quote form from the page." }, 405);
}

export function POST(request: Request): Promise<Response> {
  return handleFunnelQuote(request, {
    now: Date.now(),
    preview: isFunnelPreview(),
    save: (lead) => saveLead(business, lead),
  });
}
