import type { BusinessConfig, ReplyActionId } from "./business.ts";

const buckets = new Map<string, { count: number; reset: number }>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0]?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

export function takeRateLimit(
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number,
): { ok: true } | { ok: false; retryAfter: number } {
  const current = buckets.get(key);
  if (!current || now >= current.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (current.count >= maxRequests) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.reset - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

/** Test helper. The live limiter is process-local on purpose. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function sameOrigin(request: Request): boolean {
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

export function knownPage(page: unknown, pages: readonly string[]): string | undefined {
  if (typeof page !== "string") return undefined;
  let path = page.split("?")[0]?.split("#")[0] ?? "";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.endsWith("/index.html")) {
    const trimmed = path.slice(0, -"/index.html".length);
    path = trimmed === "" ? "/" : trimmed;
  }
  return pages.includes(path) ? path : undefined;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function normaliseMessages(
  input: unknown,
  limits: BusinessConfig["limits"],
): { ok: true; messages: ChatTurn[] } | { ok: false; error: string; status: number } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, status: 400, error: "Send a message and I'll answer." };
  }
  if (input.length > limits.maxMessages) {
    return {
      ok: false,
      status: 400,
      error: "That's as far as this chat goes. Use the quote link, or ring the number on the site.",
    };
  }
  const messages: ChatTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, error: "I couldn't read that. Try again." };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return { ok: false, status: 400, error: "I couldn't read that. Try again." };
    }
    const text = content.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (role === "user" && text.length > limits.maxUserChars) {
      return {
        ok: false,
        status: 400,
        error: "That message is a bit long. Try a shorter question.",
      };
    }
    messages.push({
      role,
      content: role === "assistant" ? text.slice(0, limits.maxAssistantChars) : text,
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

const WORD_PRICE =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[\s-](?:and|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*\s+pounds?\b/gi;

const MONEY =
  /£\s?\d[\d,]*(?:\.\d+)?(?:\s*billion|\s*(?:\/|a |per )(?:month|mo))?|[$€]\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|a |per )(?:month|mo))?|\bgbp\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:pounds?|quid)\b|\b\d[\d,]*(?:\.\d+)?\s*(?:\/|a |per )(?:month|mo)\b/gi;

/** Safety net: model replies must not keep U+2014 or U+2013. Ranges read as "to". */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*\u2013\s*(\d)/g, "$1 to $2")
    .replace(/(\d)\s*\u2014\s*(\d)/g, "$1 to $2")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\s*\u2013\s*/g, " to ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",");
}

export function scrubPrices(text: string, allowed: readonly string[], standIn: string): string {
  const slots: string[] = [];
  let safe = text;
  const phrases = [...allowed].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = new RegExp(`${escaped}(?![\\d,.])`, "g");
    safe = safe.replace(exact, (match) => {
      const index = slots.push(match) - 1;
      return `\u0000${index}\u0000`;
    });
  }
  safe = safe.replace(MONEY, standIn).replace(WORD_PRICE, standIn);
  safe = safe.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => slots[Number(index)] ?? "");
  return stripDashes(safe);
}

const ACTION_MARK = "\u2063actions:";
const SITE_HOSTS = ["dandproofingandbuilding.co.uk", "localhost", "127.0.0.1"];

type LinkRules = BusinessConfig["replyLinks"];
type ActionCues = BusinessConfig["actionCues"];

function isSiteHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^www\./, "");
  return SITE_HOSTS.includes(bare) || bare.endsWith(".vercel.app");
}

function pathKey(pathname: string, hash: string): string {
  let path = pathname.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length) || "/";
  else if (path.endsWith(".html")) path = path.slice(0, -".html".length);
  if ((path === "/" || path === "") && hash === "#quote") return "/#quote";
  return path || "/";
}

function remember(action: ReplyActionId | undefined, actions: Set<ReplyActionId>): void {
  if (action) actions.add(action);
}

function lookupPath(key: string, rules: LinkRules, actions: Set<ReplyActionId>): string | undefined {
  const exact = rules.find((rule) => rule.path && rule.path.toLowerCase() === key);
  if (exact) {
    remember(exact.action, actions);
    return exact.words;
  }
  const prefixed = rules.find((rule) => rule.prefix && key.startsWith(rule.prefix.toLowerCase()));
  if (prefixed) {
    remember(prefixed.action, actions);
    return prefixed.words;
  }
  return undefined;
}

function lookupHost(host: string, rules: LinkRules, actions: Set<ReplyActionId>): string | undefined {
  const bare = host.toLowerCase().replace(/^www\./, "");
  const rule = rules.find((item) => item.host && bare === item.host.toLowerCase().replace(/^www\./, ""));
  if (!rule) return undefined;
  remember(rule.action, actions);
  return rule.words;
}

function splitEdge(raw: string): { core: string; edge: string } {
  const match = raw.match(/^(.*?)([.,;:!?)\]]*)$/);
  return { core: match?.[1] || raw, edge: match?.[2] ?? "" };
}

/** Spoken form of a URL or path. A removed address still keeps its closing punctuation. */
function wordsForTarget(raw: string, rules: LinkRules, actions: Set<ReplyActionId>): string {
  const { core, edge } = splitEdge(raw);
  const finish = (words: string) => (words ? `${words}${edge}` : edge);

  if (/^tel:/i.test(core)) {
    actions.add("phone");
    return finish("");
  }
  if (/^mailto:/i.test(core)) return finish(core.replace(/^mailto:/i, ""));

  let href = core;
  if (/^www\./i.test(href) || /^wa\.me\//i.test(href)) href = `https://${href}`;
  else if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(href)) href = `https://${href}`;

  if (core.startsWith("/")) {
    const hash = core.includes("#") ? `#${core.split("#")[1]?.split(/[?\s]/)[0] ?? ""}`.toLowerCase() : "";
    const pathname = core.split("#")[0]?.split("?")[0] ?? core;
    return finish(lookupPath(pathKey(pathname, hash), rules, actions) ?? "the site");
  }

  try {
    const url = new URL(href);
    const named = lookupHost(url.host, rules, actions);
    if (named && !isSiteHost(url.host)) return finish(named);
    if (isSiteHost(url.host)) {
      const key = pathKey(url.pathname, url.hash.toLowerCase());
      return finish(lookupPath(key, rules, actions) ?? (key === "/" ? "the home page" : "the site"));
    }
    return finish(named ?? "");
  } catch {
    return finish("");
  }
}

function replaceLinks(text: string, rules: LinkRules, actions: Set<ReplyActionId>): string {
  let safe = text.replace(/\n?\u2063actions:[a-z,]*/g, "");
  safe = safe.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (_match, href: string) =>
    wordsForTarget(href, rules, actions),
  );
  safe = safe.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const words = wordsForTarget(url, rules, actions);
    if (words) return words;
    return label.replace(/https?:\/\/\S+|\/[A-Za-z][\w./-]*/g, "").trim();
  });
  safe = safe.replace(
    /(?:this|the)\s+(?:link|url|website)\s*:\s*((?:https?:\/\/|www\.)[^\s<>"')\]]+|wa\.me\/[^\s<>"')\]]+|\/(?:#[A-Za-z][\w-]*|[A-Za-z][\w-]*)(?:\/[\w.-]*)*\/?)/gi,
    (_match, target: string) => wordsForTarget(target, rules, actions),
  );
  safe = safe.replace(
    /(?<![\w@])(?:(?:https?:\/\/|www\.)[^\s<>"')\]]+|wa\.me\/[^\s<>"')\]]+|(?:[a-z0-9-]+\.)+(?:co\.uk|com|app)(?:\/[^\s<>"')\]]*)?|tel:\+?[\d\s()-]+|mailto:[^\s<>"')\]]+)/gi,
    (target) => wordsForTarget(target, rules, actions),
  );
  safe = safe.replace(
    /(^|[\s(["'])(\/(?:#[A-Za-z][\w-]*|[A-Za-z][\w-]*)(?:\/[\w.-]*)*\/?)/g,
    (_match, lead: string, path: string) => `${lead}${wordsForTarget(path, rules, actions)}`,
  );
  safe = safe.replace(/<[^>\n]+>/g, "");
  return safe
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",");
}

export function inferActions(
  text: string,
  cues: ActionCues,
  order: readonly ReplyActionId[],
  max = 3,
): ReplyActionId[] {
  const found = new Set<ReplyActionId>();
  for (const cue of cues) {
    if (new RegExp(cue.pattern, "i").test(text)) found.add(cue.action);
  }
  return order.filter((id) => found.has(id)).slice(0, max);
}

export function scrubReply(
  text: string,
  allowed: readonly string[],
  standIn: string,
  rules: LinkRules,
  cues: ActionCues,
  order: readonly ReplyActionId[],
): { text: string; actions: ReplyActionId[] } {
  const found = new Set<ReplyActionId>();
  const safe = replaceLinks(scrubPrices(text, allowed, standIn), rules, found);
  for (const id of inferActions(safe, cues, order, order.length)) found.add(id);
  return { text: safe, actions: order.filter((id) => found.has(id)).slice(0, 3) };
}

function holdFrom(held: string): number {
  const cuts: number[] = [];
  const price =
    held.match(/(?:£|\$|€|gbp\s?)\d[\d,]*(?:\.\d*)?$/i) ??
    held.match(/(?:£|\$|€)$/) ??
    held.match(/\d[\d,]{0,8}$/);
  if (price?.index != null) cuts.push(price.index);
  const link = held.match(
    /(?:https?:?\/?\/?\S*|www\.\S*|wa\.me\/?\S*|tel:\+?[\d\s()-]*|mailto:\S*|\/(?:#[A-Za-z][\w-]*|[A-Za-z][\w.-]*)(?:\/[\w.-]*)*\/?)$/i,
  );
  if (link?.index != null) {
    const before = held.slice(0, link.index);
    const lead = before.match(/(?:(?:use|visit|see|open)\s+)?(?:this|the)\s+(?:link|url|website)\s*:\s*$/i);
    cuts.push(lead ? link.index - lead[0].length : link.index);
  } else {
    const lead = held.match(/(?:(?:use|visit|see|open)\s+)?(?:this|the)\s+(?:link|url|website)\s*:\s*$/i);
    if (lead?.index != null) cuts.push(lead.index);
  }
  if (!cuts.length) return held.length;
  return Math.min(...cuts);
}

/** Price, dash and raw-link scrubber. The action marker is added only on flush. */
export function createReplyStream(
  allowed: readonly string[],
  standIn: string,
  rules: LinkRules,
  cues: ActionCues,
  order: readonly ReplyActionId[],
) {
  let held = "";
  let visible = "";
  const found = new Set<ReplyActionId>();
  const release = (ready: string) => {
    if (!ready) return "";
    const cleaned = replaceLinks(scrubPrices(ready, allowed, standIn), rules, found);
    visible += cleaned;
    return cleaned;
  };
  const push = (chunk: string) => {
    held += chunk;
    const cut = holdFrom(held);
    const ready = held.slice(0, cut);
    held = held.slice(cut);
    return release(ready);
  };
  const flush = () => {
    let tail = release(held);
    held = "";
    const dropped = tail.replace(
      /(?:(?:use|visit|see|open)\s+)?(?:this|the)\s+(?:link|url|website)\s*:\s*$/i,
      "",
    );
    if (dropped !== tail) {
      visible = visible.slice(0, visible.length - tail.length) + dropped;
      tail = dropped;
    }
    for (const id of inferActions(visible, cues, order, order.length)) found.add(id);
    const picked = order.filter((id) => found.has(id)).slice(0, 3);
    return picked.length ? `${tail}\n${ACTION_MARK}${picked.join(",")}` : tail;
  };
  return { push, flush };
}

/** Holds back a trailing fragment that might still be a price. */
export function createPriceStream(allowed: readonly string[], standIn: string) {
  let held = "";
  const push = (chunk: string) => {
    held += chunk;
    const partial =
      held.match(/(?:£|\$|€|gbp\s?)\d[\d,]*(?:\.\d*)?$/i) ??
      held.match(/(?:£|\$|€)$/) ??
      held.match(/\d[\d,]{0,8}$/);
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

export function isValidContact(value: string): boolean {
  const text = value.trim();
  if (text.length < 6 || text.length > 120) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true;
  return isPhone(text);
}

export function isPhone(value: string): boolean {
  const text = value.trim();
  if (text.length < 10 || text.length > 20) return false;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && /^[+\d][\d\s()-]+$/.test(text);
}

export function normalisePostcode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

export function cleanLine(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
