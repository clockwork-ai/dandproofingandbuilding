// server/chat.ts
import { isStepCount, streamText, tool } from "ai";
import { z } from "zod";

// lib/business.ts
var towns = [
  "altrincham",
  "atherton",
  "bolton",
  "boothstown",
  "bramhall",
  "bury",
  "cheshire",
  "eccles",
  "farnworth",
  "hindley",
  "irlam",
  "kearsley",
  "leigh",
  "little-hulton",
  "manchester",
  "monton",
  "sale",
  "salford",
  "swinton",
  "trafford",
  "walkden"
];
var pages = [
  "/",
  "/index.html",
  "/404.html",
  "/contact-us",
  "/drone-roof-survey",
  "/free-drone-survey",
  "/gallery",
  "/locations",
  ...towns.flatMap((town) => [`/roofers-${town}`, `/builders-${town}`])
];
var business = {
  name: "D & P Roofing and Building",
  model: "openai/gpt-4.1-mini",
  voice: "Plain British English, like a helpful person in the office. Short. Contractions are fine. No jargon, no American spelling, no emoji, no exclamation marks, and no AI buzzwords. Two or three sentences, then stop. You are the D & P assistant, not Dale, not Chrissy and not Paul.",
  rules: [
    "Answer only from the knowledge below. If it is not there, say you don't have that and point them to the phone, WhatsApp or the quote page.",
    "No prices, estimates or ranges in pounds, digits or words, unless the exact string is in allowed prices. Nothing on the site states a job price. Say Dale will quote after seeing the job. You may say a quote is free, and that the drone survey is free with every quote, because the site says that. Discounts for NHS workers and OAPs are mentioned, but no amount is published, so do not invent a percentage.",
    "Never invent reviews, ratings, years in business, accreditations, guarantees, insurance, company numbers or job examples. Do not mention insurance at all. If a review score, a guarantee or a year is in the knowledge, use it only as written there. Do not quote a customer except the two short lines in the knowledge, and do not add to them.",
    "Emergencies: if there is an active leak, storm damage that is letting water in, or any danger, the first sentence must tell them to keep clear of water near electrics and to ring D & P directly on 07587 415299. Do not promise a callout time. The site does not give one. Out of hours, they can also WhatsApp a photo and their postcode, and the site says the team will get back as soon as they can.",
    "Reflect the visitor's problem before you steer them on: a leak, slipped tiles, storm damage, or a quote. Then point them to a quote, a phone call, or WhatsApp. Those are the actions already on the site.",
    "Stay on D & P's work: roofing, building, groundworks, drone surveys, the areas they cover, and how to ask for a quote. If the question is unrelated, politely decline in one sentence and offer to help with the roofing or building.",
    "Do not claim a lead was emailed, texted or sent to Dale's phone. This chat does not send email. You may say the details are saved for Dale only when saveLead returns ok. You may say the alert hook accepted them only when saveLead returns notified true.",
    "Never use an em dash or an en dash. Use a full stop, a comma, a colon, or the word to for a range."
  ],
  knowledge: `
Who. D & P Roofing and Building Ltd, based at 182 Park Road, Westhoughton, Bolton, BL5 3HB. Phone 07587 415299. Email info@dandproofingandbuilding.co.uk. WhatsApp uses the same number. Dale runs the jobs. Chrissy runs the office. Paul and the lads do the work. The person speaking here is the website assistant, not Dale. The line on the site is: "The price we quote is the price you pay." Proud sponsors of Langworth Reds. There is no company number on the site.

Hours. Monday to Friday 8am to 6pm. Saturday and Sunday 10am to 4pm. A WhatsApp can be sent at any time and the site says they will get back. Emergencies: ring 07587 415299. Out of hours, WhatsApp a photo and the postcode and they will get back as soon as they can. No arrival time is published.

What they do. Commercial or domestic, big or small. Their own roofing, building and groundworks teams. The site says they do not use outside contractors, and there are no pushy sales. They organise the scaffold and skips, and deal with building control where it is needed. The site is cleared every day.

Roofing. Full re-roofs, tiled and slate, with a 10 year guarantee on every re-roof. All of the work is fully guaranteed. Emergency roof repairs for leaks and storm damage. Repairs, slipped, broken and missing tiles. Flat and bay roofs, including extensions with leaks that keep coming back. Chimney repairs, repointing and chimney stack removal. Guttering and roofline: gutters, fascias, soffits and downpipes, including cast iron. A re-roof on the home page is shown in this order: scaffold up, stripped back to the timbers, felt and battens and tiles, ridge on, then finished and watertight with the 10 year guarantee. The scrolling film is an illustration based on their own drone photo, not a promise about a particular house.

Building. Extensions, single and double storey, project managed start to finish. Loft conversions and dormers. Wall removal, with the steelwork and building control sorted. Brickwork and pointing. Kitchen and bathroom renovations. Rendering. Groundworks: patios, driveways, fencing, decking, drainage, flagging, demolition and exterior painting, by their own groundworks team.

Drone survey. Free with every quote. A licensed, CAA-registered drone pilot from their own team flies a DJI Mini 5 Pro over the whole roof, usually around 15 to 30 minutes on site, weather permitting. Nobody goes on the roof and no scaffolding goes up for the survey. They show the 4K photos and video and quote from what both sides have seen. They check tiles and slates, ridge and hips, chimney stacks, valleys and leadwork, flat and bay roofs, gutters and roofline, skylights and dormers, moss and storm damage. The page is /drone-roof-survey/. /free-drone-survey/ is a page to book that free survey. The form opens WhatsApp. Nothing is sent until the visitor presses send in WhatsApp.

Quotes. Free and no obligation, for a few slipped tiles or a full re-roof. The quote forms on the home page and on /contact-us/ open WhatsApp with the message ready. Nothing is sent until the visitor presses send in WhatsApp. The form asks for name, phone, type of job, postcode, and anything they should know. Job types on the contact form: roof repair, full re-roof, emergency repair, flat roof, chimney, guttering, fascias or soffits, extension, loft conversion, groundworks, patio or driveway, or something else. Photos of the job go by WhatsApp. There is no pound figure on the site. Dale quotes after seeing the job. The site says the price they quote is the price you pay, and that they give a clear, detailed quote up front and stick to it. Discounts for NHS workers and OAPs are offered. The amount is not published.

Areas. Based on Park Road, Westhoughton BL5, working across the North West. The home page names Westhoughton and Worsley, then these towns with the miles from Westhoughton. Town pages also name the postcodes. Manchester has roofing and building pages for Manchester and the North West, and is not given a single mile figure.
- Hindley, 2 miles, WN2
- Atherton, 2 miles, M46
- Leigh, 4 miles, WN7
- Bolton, 4 miles, BL1, BL2, BL3
- Little Hulton, 5 miles, M38
- Farnworth, 5 miles, BL4
- Boothstown, 5 miles, M28
- Walkden, 5 miles, M28
- Kearsley, 6 miles, BL4
- Swinton, 8 miles, M27
- Monton, 8 miles, M30
- Irlam, 8 miles, M44
- Eccles, 9 miles, M30
- Bury, 10 miles, BL8, BL9
- Salford, 10 miles, M3, M5, M6, M7, M50
- Trafford, 11 miles, M16, M17, M32, M41
- Sale, 12 miles, M33
- Altrincham, 13 miles, WA14, WA15
- Cheshire, 14 miles, WA14, WA15, SK7, M33
- Bramhall, 20 miles, SK7
Worsley is named on the home page and in the site details. It has no town page and no postcode of its own on the site. Westhoughton is the base, BL5, including the office postcode BL5 3HB. If a place is not in this list, it is not on the areas page. The areas page says: not on the list, ask anyway. Do not promise cover. Tell them to ring or WhatsApp the postcode so Dale can confirm. The areas page is /locations/.

Trust, only as published. Which? Trusted Trader. Rated 5.0 from 142 reviews. Customer service, quality and value all score 5.0, and 99% of customers recommend them. Facebook: 887 followers, 100% recommend. Instagram: 731 posts, @dandp_roofing_and_buildingltd. The home page shows four of the 142 Which? reviews, and says to read every one on Which?: Highly Recommended (Jul 2026), Great Service (May 2026), Great work and service (May 2026), Realistically, would be a 10 Star Review (Jun 2026). Two short lines you may repeat exactly, and not extend: "They did not increase the roofing quote." and, from Nick Wilder, "completed to a very high standard and exactly at the price we were quoted." Thirty years on roofs and buildings across Bolton and Greater Manchester. Which? page: https://trustedtraders.which.co.uk/businesses/d-p-roofing-building-ltd/

Work shown. The gallery and the home page show photos of their own jobs across Greater Manchester, with captions such as full re-roof, flat roof, dormer, bay roof, extension, brickwork, gutter, parapet, church roof repairs, a terrace re-roof in September 2026 and a new ridge in September 2026. Do not invent a street, a price or a story about a photo. The gallery is /gallery/. More photos are on Facebook and Instagram.

Contact paths. Quote form: /contact-us/ and the home page section /#quote. Phone 07587 415299. WhatsApp https://wa.me/447587415299. Email info@dandproofingandbuilding.co.uk. Facebook https://www.facebook.com/Dandproofingandbuilding/. Instagram https://www.instagram.com/dandp_roofing_and_buildingltd/.
`.trim(),
  allowedPrices: [],
  priceStandIn: "Dale will quote after seeing the job",
  links: {
    audit: "/contact-us/",
    auditLabel: "Get a free quote",
    book: "https://wa.me/447587415299?text=Hi%20Dale%2C%20I%20found%20you%20online.%20I%27m%20after%20a%20quote%20for%3A%20",
    bookLabel: "WhatsApp",
    phone: "07587 415299",
    phoneHref: "tel:+447587415299",
    whatsapp: "https://wa.me/447587415299?text=Hi%20Dale%2C%20I%20found%20you%20online.%20I%27m%20after%20a%20quote%20for%3A%20",
    email: "info@dandproofingandbuilding.co.uk"
  },
  lead: {
    notifyName: "Dale",
    storagePrefix: "leads",
    webhookEnv: "LEAD_NOTIFY_URL",
    instructions: [
      "Lead capture.",
      "When someone wants a quote, a survey, a repair, or for someone to look at a job, your next reply must ask for four things: their name, their phone number, their postcode, and the job. In that same reply, ask them to WhatsApp a photo of the problem if they can. This chat cannot take picture files.",
      "When you have the name, phone, postcode and job, call saveLead before you confirm. Set photos to WhatsApp if they will send pictures, or none yet if they cannot. Do not call saveLead with blanks or guesses. Do not invent a postcode.",
      "Do not say the details were saved unless saveLead returns ok. Never say the lead was emailed or texted. This chat does not send email. If notified is true, you may say the alert hook accepted the lead. If notified is false or missing, say it is saved for Dale and has not been emailed.",
      "After a successful save, say Dale will quote after seeing the job, and give the phone number and the WhatsApp link so they can send photos.",
      "If saveLead fails, do not say the details were saved. Give them the phone, WhatsApp and the quote page.",
      "If they are only asking a question, answer it. Do not demand their details first.",
      "Quote page: /contact-us/. Phone: 07587 415299. WhatsApp: https://wa.me/447587415299. Email: info@dandproofingandbuilding.co.uk."
    ].join(" ")
  },
  replies: {
    rateLimit: "You've sent quite a few messages. Give it a minute, or ring 07587 415299.",
    storageFail: "I couldn't save that just now. Ring 07587 415299 or WhatsApp D & P, and Dale will take it from there.",
    saved: "{name}, that's saved for Dale. It has not been emailed. Ring or WhatsApp if you want to send photos.",
    savedNotified: "{name}, that's saved for Dale, and the alert hook accepted it. It has not been emailed from this chat. Ring or WhatsApp if you want to send photos.",
    emptySaved: "Thanks. That's saved for Dale. It has not been emailed. The phone and WhatsApp links are below if you want to send photos.",
    emptyMiss: "Sorry, I missed that. Ask me about the roof, your area, or a quote.",
    modelDown: "Sorry, I can't answer just now. Ring D & P on 07587 415299."
  },
  limits: {
    windowMs: 10 * 60 * 1e3,
    maxRequests: 24,
    maxUserChars: 600,
    maxMessages: 12,
    maxAssistantChars: 1200
  },
  pages,
  nudge: {
    text: "Leak, slipped tiles, or do you need a quote?",
    delayMs: 22e3,
    scroll: 0.45,
    replies: [
      { label: "There's a leak", message: "Water is coming through my ceiling.", calls: null },
      { label: "I need a quote", message: "I want a quote.", calls: null },
      { label: "Do you cover me?", message: "Do you cover my area?", calls: null }
    ]
  },
  calculatorHref: "",
  widget: {
    title: "Ask D & P",
    launcherLabel: "Open the chat",
    greeting: "Hello, this is the D & P assistant. I can help with roofing, building, the areas we cover, and quotes. What do you need?",
    placeholder: "Ask about a leak, a quote, or your area",
    suggestions: ["There's a leak", "Do you cover my area?", "I want a quote"],
    formTitle: "Add quote details",
    formSubmit: "Save for Dale"
  }
};

// lib/guard.ts
var buckets = /* @__PURE__ */ new Map();
function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : request.headers.get("x-real-ip");
  return ip || "unknown";
}
function takeRateLimit(key, now, windowMs, maxRequests) {
  const current = buckets.get(key);
  if (!current || now >= current.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (current.count >= maxRequests) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.reset - now) / 1e3)) };
  }
  current.count += 1;
  return { ok: true };
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function knownPage(page, pages2) {
  if (typeof page !== "string") return void 0;
  let path = page.split("?")[0]?.split("#")[0] ?? "";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.endsWith("/index.html")) {
    const trimmed = path.slice(0, -"/index.html".length);
    path = trimmed === "" ? "/" : trimmed;
  }
  return pages2.includes(path) ? path : void 0;
}
function normaliseMessages(input, limits) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, status: 400, error: "Send a message and I'll answer." };
  }
  if (input.length > limits.maxMessages) {
    return {
      ok: false,
      status: 400,
      error: "That's as far as this chat goes. Use the quote link, or ring the number on the site."
    };
  }
  const messages = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, error: "I couldn't read that. Try again." };
    }
    const role = item.role;
    const content = item.content;
    if (role !== "user" && role !== "assistant" || typeof content !== "string") {
      return { ok: false, status: 400, error: "I couldn't read that. Try again." };
    }
    const text = content.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (role === "user" && text.length > limits.maxUserChars) {
      return {
        ok: false,
        status: 400,
        error: "That message is a bit long. Try a shorter question."
      };
    }
    messages.push({
      role,
      content: role === "assistant" ? text.slice(0, limits.maxAssistantChars) : text
    });
  }
  if (!messages.some((message) => message.role === "user")) {
    return { ok: false, status: 400, error: "Send a message and I'll answer." };
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return { ok: false, status: 400, error: "Send a message and I'll answer." };
  }
  return { ok: true, messages };
}
var WORD_PRICE = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[\s-](?:and|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*\s+pounds?\b/gi;
var MONEY = /£\s?\d[\d,]*(?:\.\d+)?(?:\s*billion|\s*(?:\/|a |per )(?:month|mo))?|[$€]\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|a |per )(?:month|mo))?|\bgbp\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:pounds?|quid)\b|\b\d[\d,]*(?:\.\d+)?\s*(?:\/|a |per )(?:month|mo)\b/gi;
function stripDashes(text) {
  return text.replace(/(\d)\s*\u2013\s*(\d)/g, "$1 to $2").replace(/(\d)\s*\u2014\s*(\d)/g, "$1 to $2").replace(/\s*\u2014\s*/g, ", ").replace(/\s*\u2013\s*/g, " to ").replace(/[ \t]{2,}/g, " ").replace(/\s+,/g, ",");
}
function scrubPrices(text, allowed, standIn) {
  const slots = [];
  let safe = text;
  const phrases = [...allowed].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = new RegExp(`${escaped}(?![\\d,.])`, "g");
    safe = safe.replace(exact, (match) => {
      const index = slots.push(match) - 1;
      return `\0${index}\0`;
    });
  }
  safe = safe.replace(MONEY, standIn).replace(WORD_PRICE, standIn);
  safe = safe.replace(/\u0000(\d+)\u0000/g, (_match, index) => slots[Number(index)] ?? "");
  return stripDashes(safe);
}
function createPriceStream(allowed, standIn) {
  let held = "";
  const push = (chunk) => {
    held += chunk;
    const partial = held.match(/(?:£|\$|€|gbp\s?)\d[\d,]*(?:\.\d*)?$/i) ?? held.match(/(?:£|\$|€)$/) ?? held.match(/\d[\d,]{0,8}$/);
    const cut = partial?.index ?? held.length;
    const ready = held.slice(0, cut);
    held = held.slice(cut);
    return scrubPrices(ready, allowed, standIn);
  };
  const flush = () => {
    const rest = scrubPrices(held, allowed, standIn);
    held = "";
    return rest;
  };
  return { push, flush };
}
function isPhone(value) {
  const text = value.trim();
  if (text.length < 10 || text.length > 20) return false;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && /^[+\d][\d\s()-]+$/.test(text);
}
function normalisePostcode(value) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}
function cleanLine(value, max) {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// lib/leads.ts
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
function validateLead(input, source, knownPage2) {
  const name = cleanLine(typeof input.name === "string" ? input.name : "", 80);
  const phone = cleanLine(typeof input.phone === "string" ? input.phone : "", 20);
  const postcode = normalisePostcode(typeof input.postcode === "string" ? input.postcode : "");
  const job = cleanLine(typeof input.job === "string" ? input.job : "", 400);
  const photos = cleanLine(typeof input.photos === "string" ? input.photos : "", 160) || "none yet";
  if (name.length < 2) return { ok: false, error: "I need a name." };
  if (!isPhone(phone)) return { ok: false, error: "I need a phone number." };
  if (!postcode) return { ok: false, error: "I need a postcode, such as BL5 3HB." };
  if (job.length < 2) return { ok: false, error: "I need a short note on the job." };
  return {
    ok: true,
    lead: { name, phone, postcode, job, photos, page: knownPage2, source }
  };
}
function pathname(prefix, lead) {
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const hash = createHash("sha256").update(`${lead.phone.replace(/\D/g, "")}
${lead.job.toLowerCase()}`).digest("hex").slice(0, 16);
  return `${prefix}/${day}/${hash}.json`;
}
async function notify(config, lead) {
  const url = process.env[config.lead.webhookEnv];
  if (!url) return false;
  let target;
  try {
    target = new URL(url);
  } catch {
    console.error("lead notify: LEAD_NOTIFY_URL is not a URL");
    return false;
  }
  if (target.protocol !== "https:") {
    console.error("lead notify: LEAD_NOTIFY_URL must be https");
    return false;
  }
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: config.lead.notifyName,
        email: config.links.email,
        ...lead,
        receivedAt: (/* @__PURE__ */ new Date()).toISOString()
      }),
      signal: AbortSignal.timeout(4e3)
    });
    if (!response.ok) {
      console.error(`lead notify: webhook responded ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("lead notify: webhook failed", error instanceof Error ? error.name : "error");
    return false;
  }
}
async function saveLead(config, lead) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    console.error("lead storage: Blob is not connected");
    return { ok: false, error: "storage-not-configured" };
  }
  const record = {
    ...lead,
    notifyName: config.lead.notifyName,
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    await put(pathname(config.lead.storagePrefix, lead), JSON.stringify(record), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
  } catch (error) {
    console.error("lead storage: put failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "storage-failed" };
  }
  const notified = await notify(config, lead);
  console.info(`lead stored source=${lead.source} notified=${notified}`);
  return { ok: true, notified };
}

// lib/prompt.ts
function buildInstructions(config, page) {
  const rules = config.rules.map((rule) => `- ${rule}`).join("\n");
  const where = page ? `The visitor is reading ${page}.` : "You do not know which page they are on.";
  const parts = [
    `You are the website assistant for ${config.name}.`,
    "The visitor sees every word you write. Answer them directly. Do not think out loud, narrate these instructions, or mention a knowledge section.",
    `Voice: ${config.voice}`,
    where,
    `Rules:
${rules}`,
    `Knowledge, and only this knowledge:
${config.knowledge}`,
    config.lead.instructions,
    `If a price slips out, it will be replaced with: "${config.priceStandIn}". Prefer to say that yourself, with no number.`
  ];
  const missed = missedCallInstructions(config);
  if (missed) parts.push(missed);
  return parts.join("\n\n");
}
function calculatorLink(href, calls) {
  const url = new URL(href, "https://dandproofingandbuilding.co.uk");
  if (calls != null) url.searchParams.set("calls", String(calls));
  return `${url.pathname}${url.search}${url.hash}`;
}
function missedCallInstructions(config) {
  if (!config.calculatorHref) return "";
  const lines = config.nudge.replies.map((reply) => `- ${reply.label}: ${calculatorLink(config.calculatorHref, reply.calls)}`).join("\n");
  return [
    "Missed-call answers.",
    "If they tell you how many calls they miss, do not calculate a pound amount.",
    "Acknowledge the answer in one sentence, give the matching calculator link, say it is a rough estimate they can edit, then offer the next step on the site.",
    lines,
    `If they did not give a number, use ${calculatorLink(config.calculatorHref, null)}.`
  ].join("\n");
}
function publicWidget(config) {
  return {
    title: config.widget.title,
    launcherLabel: config.widget.launcherLabel,
    greeting: config.widget.greeting,
    placeholder: config.widget.placeholder,
    suggestions: config.widget.suggestions.slice(0, 3),
    formTitle: config.widget.formTitle,
    formSubmit: config.widget.formSubmit,
    auditHref: config.links.audit,
    auditLabel: config.links.auditLabel,
    bookHref: config.links.book,
    bookLabel: config.links.bookLabel,
    phoneHref: config.links.phoneHref,
    phone: config.links.phone,
    whatsappHref: config.links.whatsapp,
    nudge: {
      ...config.nudge,
      replies: config.nudge.replies.slice(0, 3)
    },
    calculatorHref: config.calculatorHref
  };
}

// server/chat.ts
var maxDuration = 30;
var leadSchema = z.object({
  name: z.string().describe("The visitor's name"),
  phone: z.string().describe("The phone number they gave"),
  postcode: z.string().describe("Their postcode"),
  job: z.string().describe("The job they want, in their words"),
  photos: z.string().describe("WhatsApp if they will send photos, otherwise none yet").optional()
});
function fill(template, name) {
  return template.replaceAll("{name}", name);
}
function json(body, status = 200, extra) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extra }
  });
}
function limited(retryAfter) {
  return json({ error: business.replies.rateLimit }, 429, { "retry-after": String(retryAfter) });
}
function GET() {
  return Response.json(publicWidget(business), {
    headers: { "cache-control": "public, max-age=300" }
  });
}
async function POST(request) {
  if (!sameOrigin(request)) {
    return json({ error: "Open the chat on the site and try again." }, 403);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 24e3) {
    return json({ error: "That message is a bit long. Try a shorter question." }, 413);
  }
  const limit = takeRateLimit(
    clientKey(request),
    Date.now(),
    business.limits.windowMs,
    business.limits.maxRequests
  );
  if (!limit.ok) return limited(limit.retryAfter);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "I couldn't read that. Try again." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "I couldn't read that. Try again." }, 400);
  }
  const page = knownPage(body.page, business.pages);
  const leadBody = body.lead;
  if (leadBody && typeof leadBody === "object") {
    const parsed = validateLead(leadBody, "chat-form", page);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const saved = await saveLead(business, parsed.lead);
    if (!saved.ok) return json({ error: business.replies.storageFail }, 503);
    const template = saved.notified ? business.replies.savedNotified : business.replies.saved;
    return json({
      ok: true,
      notified: saved.notified,
      message: fill(template, parsed.lead.name)
    });
  }
  const messages = normaliseMessages(body.messages, business.limits);
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
        description: "Save a quote lead for Dale once the visitor has given their name, phone, postcode and the job. Call this before confirming. Do not say it was emailed.",
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
              error: "The details could not be stored. Ask them to ring or WhatsApp D & P."
            };
          }
          return {
            ok: true,
            notified: saved.notified,
            note: saved.notified ? "Stored for Dale and the alert hook accepted it. Do not say it was emailed." : "Stored for Dale. Do not say it was emailed or texted."
          };
        }
      })
    },
    onError({ error }) {
      console.error("chat model error", error instanceof Error ? error.name : "error");
    }
  });
  const guard = createPriceStream(business.allowedPrices, business.priceStandIn);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
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
          const fallback = savedLead ? (notified ? business.replies.savedNotified : business.replies.emptySaved).replaceAll(
            "{name}",
            "Thanks"
          ) : business.replies.emptyMiss;
          controller.enqueue(encoder.encode(fallback));
        }
      } catch (error) {
        console.error("chat stream error", error instanceof Error ? error.name : "error");
        if (!wrote) controller.enqueue(encoder.encode(business.replies.modelDown));
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no"
    }
  });
}
export {
  GET,
  POST,
  maxDuration
};
