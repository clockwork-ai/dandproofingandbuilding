import { isStepCount, streamText, tool } from "ai";
import { z } from "zod";
import { business } from "../lib/business.ts";
import {
  clientKey,
  createReplyStream,
  knownPage,
  normaliseMessages,
  sameOrigin,
  takeRateLimit,
} from "../lib/guard.ts";
import { saveLead, validateLead } from "../lib/leads.ts";
import { buildInstructions, publicWidget } from "../lib/prompt.ts";

export const maxDuration = 30;

const leadSchema = z.object({
  name: z.string().describe("The visitor's name"),
  phone: z.string().describe("The phone number they gave"),
  postcode: z.string().describe("Their postcode"),
  job: z.string().describe("The job they want, in their words"),
  photos: z
    .string()
    .describe("WhatsApp if they will send photos, otherwise none yet")
    .optional(),
});

function fill(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extra },
  });
}

function limited(retryAfter: number): Response {
  return json({ error: business.replies.rateLimit }, 429, { "retry-after": String(retryAfter) });
}

export function GET(): Response {
  return Response.json(publicWidget(business), {
    headers: { "cache-control": "public, max-age=300" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: "Open the chat on the site and try again." }, 403);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 24_000) {
    return json({ error: "That message is a bit long. Try a shorter question." }, 413);
  }

  const limit = takeRateLimit(
    clientKey(request),
    Date.now(),
    business.limits.windowMs,
    business.limits.maxRequests,
  );
  if (!limit.ok) return limited(limit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "I couldn't read that. Try again." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "I couldn't read that. Try again." }, 400);
  }

  const page = knownPage((body as { page?: unknown }).page, business.pages);
  const leadBody = (body as { lead?: unknown }).lead;
  if (leadBody && typeof leadBody === "object") {
    const parsed = validateLead(leadBody, "chat-form", page);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const saved = await saveLead(business, parsed.lead);
    if (!saved.ok) return json({ error: business.replies.storageFail }, 503);
    const template = saved.notified ? business.replies.savedNotified : business.replies.saved;
    return json({
      ok: true,
      notified: saved.notified,
      message: fill(template, parsed.lead.name),
      actions: ["phone", "whatsapp"],
    });
  }

  const messages = normaliseMessages((body as { messages?: unknown }).messages, business.limits);
  if (!messages.ok) return json({ error: messages.error }, messages.status);

  const model = process.env.AI_GATEWAY_MODEL || business.model;
  let savedLead = false;
  let notified = false;
  const result = streamText({
    model,
    instructions: buildInstructions(business, page),
    messages: messages.messages,
    maxOutputTokens: 280,
    temperature: 0.2,
    reasoning: "none",
    stopWhen: isStepCount(4),
    tools: {
      saveLead: tool({
        description:
          "Save a quote lead for Dale once the visitor has given their name, phone, postcode and the job. Call this before confirming. Do not say it was emailed.",
        inputSchema: leadSchema,
        execute: async (input) => {
          const parsed = validateLead(input, "chat-tool", page);
          if (!parsed.ok) return { ok: false, error: parsed.error };
          const saved = await saveLead(business, parsed.lead);
          savedLead = saved.ok;
          notified = saved.ok && saved.notified;
          if (!saved.ok) {
            return {
              ok: false,
              error: "The details could not be stored. Ask them to ring or WhatsApp D & P.",
            };
          }
          return {
            ok: true,
            notified: saved.notified,
            note: saved.notified
              ? "Stored for Dale and the alert hook accepted it. Do not say it was emailed."
              : "Stored for Dale. Do not say it was emailed or texted.",
          };
        },
      }),
    },
    onError({ error }) {
      console.error("chat model error", error instanceof Error ? error.name : "error");
    },
  });

  const guard = createReplyStream(
    business.allowedPrices,
    business.priceStandIn,
    business.replyLinks,
    business.actionCues,
    business.actions.map((action) => action.id),
  );
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      try {
        for await (const delta of result.textStream) {
          const next = guard.push(delta);
          if (!next) continue;
          wrote = true;
          controller.enqueue(encoder.encode(next));
        }
        const tail = guard.flush();
        if (tail) {
          wrote = true;
          controller.enqueue(encoder.encode(tail));
        }
        if (!wrote) {
          const fallback = savedLead
            ? (notified ? business.replies.savedNotified : business.replies.emptySaved).replaceAll(
                "{name}",
                "Thanks",
              )
            : business.replies.emptyMiss;
          controller.enqueue(encoder.encode(fallback));
        }
      } catch (error) {
        console.error("chat stream error", error instanceof Error ? error.name : "error");
        if (!wrote) controller.enqueue(encoder.encode(business.replies.modelDown));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
