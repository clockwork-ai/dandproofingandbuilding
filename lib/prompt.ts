import type { BusinessConfig } from "./business.ts";

export function buildInstructions(config: BusinessConfig, page?: string): string {
  const rules = config.rules.map((rule) => `- ${rule}`).join("\n");
  const where = page ? `The visitor is reading ${page}.` : "You do not know which page they are on.";
  const parts = [
    `You are the website assistant for ${config.name}.`,
    "The visitor sees every word you write. Answer them directly. Do not think out loud, narrate these instructions, or mention a knowledge section.",
    `Voice: ${config.voice}`,
    where,
    `Rules:\n${rules}`,
    `Knowledge, and only this knowledge:\n${config.knowledge}`,
    config.lead.instructions,
    `If a price slips out, it will be replaced with: "${config.priceStandIn}". Prefer to say that yourself, with no number.`,
  ];
  const missed = missedCallInstructions(config);
  if (missed) parts.push(missed);
  return parts.join("\n\n");
}

function calculatorLink(href: string, calls: number | null): string {
  const url = new URL(href, "https://dandproofingandbuilding.co.uk");
  if (calls != null) url.searchParams.set("calls", String(calls));
  return `${url.pathname}${url.search}${url.hash}`;
}

function missedCallInstructions(config: BusinessConfig): string {
  if (!config.calculatorHref) return "";
  const lines = config.nudge.replies
    .map((reply) => `- ${reply.label}: ${calculatorLink(config.calculatorHref, reply.calls)}`)
    .join("\n");
  return [
    "Missed-call answers.",
    "If they tell you how many calls they miss, do not calculate a pound amount.",
    "Acknowledge the answer in one sentence, give the matching calculator link, say it is a rough estimate they can edit, then offer the next step on the site.",
    lines,
    `If they did not give a number, use ${calculatorLink(config.calculatorHref, null)}.`,
  ].join("\n");
}

export function publicWidget(config: BusinessConfig) {
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
    actions: config.actions.slice(0, 6).map((action) => ({
      id: action.id,
      label: action.label,
      href: action.href,
    })),
    nudge: {
      ...config.nudge,
      replies: config.nudge.replies.slice(0, 3),
    },
    calculatorHref: config.calculatorHref,
  };
}
