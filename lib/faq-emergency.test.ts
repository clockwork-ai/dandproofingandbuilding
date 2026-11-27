import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { business } from "./business.ts";

const root = path.resolve(import.meta.dirname, "..");
const home = readFileSync(path.join(root, "index.html"), "utf8");
const emergency = readFileSync(path.join(root, "emergency/index.html"), "utf8");

const office = "01942 802880";
const officeTel = "+441942802880";
const emergencyPhone = "07587 415299";
const emergencyTel = "+447587415299";
const outOfHours =
  "Out of hours, WhatsApp a photo and your postcode to 07587 415299 and we will get back to you as soon as we can.";
const hours = "Monday to Friday 8am to 6pm, Saturday and Sunday 10am to 4pm.";

const existingFaqs = [
  {
    question: "Do you charge for a quote?",
    answer: "No. Quotes are free and there's no obligation, whether it's a few slipped tiles or a full re-roof.",
  },
  {
    question: "Will the price change once you start?",
    answer:
      'We give you a clear, detailed quote up front and stick to it. In one customer\'s words: "completed to a very high standard and exactly at the price we were quoted." (Nick Wilder)',
  },
  {
    question: "Do you use subcontractors?",
    answer:
      "Our own team does all the roofing and building work. For scaffolding, gas, electrics and plastering we bring in the same trusted specialists every time, so that work is certified and done to regulations.",
  },
  {
    question: "Do you organise scaffolding and skips?",
    answer: "Yes. We organise the scaffold and skips and deal with building control where it's needed.",
  },
  {
    question: "Is the work guaranteed?",
    answer: "All work is fully guaranteed. Re-roofs come with a 10 year guarantee.",
  },
  {
    question: "Do you do drone roof surveys?",
    answer:
      "Yes, free with every quote. See your roof the way we see it, in 4K, without scaffolding or anyone climbing up. We fly our DJI Mini 5 Pro over the whole roof, show you the photos, and quote from what you've both seen. More about drone surveys.",
  },
  {
    question: "Do you do emergency work?",
    answer:
      "Yes. For leaks and storm damage, ring 07587 415299. Out of hours, send us a WhatsApp with a photo and your postcode and we'll get back to you as soon as we can.",
  },
  {
    question: "When can I reach you?",
    answer: "Monday to Friday 8am to 6pm, Saturday and Sunday 10am to 4pm. Send a WhatsApp any time and we'll get back to you.",
  },
];

const tidyFaq = {
  question: "Will you leave my house and garden tidy?",
  answer: "Yes. The site is cleared every day.",
};
const areaFaq = {
  question: "Do you work in my area?",
  answer:
    "We're based on Park Road, Westhoughton BL5, working across the North West. The areas we cover are listed on this page.",
};

function textOf(html: string): string {
  return html
    .replace(/<i>\+<\/i>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function faqPairs(html: string): { question: string; answer: string }[] {
  const block = html.match(/<div class="faq"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(block, "FAQ block");
  const pairs: { question: string; answer: string }[] = [];
  for (const item of block[1].matchAll(/<details>([\s\S]*?)<\/details>/g)) {
    const question = item[1].match(/<summary>([\s\S]*?)<\/summary>/);
    const answer = item[1].match(/<p>([\s\S]*?)<\/p>/);
    assert.ok(question && answer);
    pairs.push({ question: textOf(question[1]), answer: textOf(answer[1]) });
  }
  return pairs;
}

type JsonLd = {
  "@type"?: string;
  mainEntity?: { name?: string; acceptedAnswer?: { text?: string } }[];
};

function jsonLd(html: string): JsonLd[] {
  const blocks: JsonLd[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    blocks.push(JSON.parse(match[1]) as JsonLd);
  }
  return blocks;
}

function phoneTokens(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\b0\d{4} \d{6}\b/g)) found.add(match[0]);
  for (const match of html.matchAll(/\+44\d{10}/g)) found.add(match[0]);
  return [...found].sort();
}

test("the eight existing homepage FAQs stay word for word", () => {
  const faqs = faqPairs(home);
  assert.equal(faqs.length, 10);
  assert.deepEqual(faqs.slice(0, 8), existingFaqs);
  assert.deepEqual(faqs.slice(8), [tidyFaq, areaFaq]);
});

test("the new area FAQ points at the home page areas list", () => {
  const area = home.match(/<details><summary>Do you work in my area\?<i>\+<\/i><\/summary><p>([\s\S]*?)<\/p><\/details>/);
  assert.ok(area);
  assert.match(area[1], /href="#areas"/);
  assert.equal(textOf(area[1]), areaFaq.answer);
});

test("homepage FAQPage schema matches the visible answers, and there is only one JSON-LD block", () => {
  const scripts = [...home.matchAll(/<script type="application\/ld\+json">/g)];
  assert.equal(scripts.length, 1);
  const blocks = jsonLd(home);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]["@type"], "RoofingContractor");
  const faqBlocks = blocks.filter((block) => block["@type"] === "FAQPage");
  assert.equal(faqBlocks.length, 0);
  const faqs = faqPairs(home);
  for (const block of faqBlocks) {
    assert.ok(Array.isArray(block.mainEntity));
    for (const entity of block.mainEntity) {
      const visible = faqs.find((item) => item.question === entity.name);
      assert.ok(visible, entity.name);
      assert.equal(entity.acceptedAnswer?.text, visible.answer);
    }
  }
});

test("the emergency page has a leaking roof section and keeps the hours line", () => {
  const section = emergency.match(/<section class="sec" id="leaking">([\s\S]*?)<\/section>/);
  assert.ok(section);
  assert.match(section[1], /<h2>If your roof is leaking<\/h2>/);
  assert.equal(
    textOf(section[1]),
    `If your roof is leaking Call ${emergencyPhone}. ${outOfHours}`,
  );
  assert.match(emergency, new RegExp(`<p class="hours">${outOfHours.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p>`));
  assert.match(emergency, new RegExp(hours.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(
    emergency,
    /send us a WhatsApp with a photo and your postcode and we'll get back to you as soon as we can\./,
  );
  assert.equal(/same day|turn up|call-?out time|acknowledgement|acknowledgment/i.test(section[1]), false);
  assert.equal(section[1].includes("stay off the roof"), false);
  assert.equal(section[1].includes("catch the drip"), false);
});

test("phone numbers on the home and emergency pages are unchanged", () => {
  assert.deepEqual(phoneTokens(home), [office, officeTel, emergencyPhone, emergencyTel].sort());
  assert.deepEqual(phoneTokens(emergency), [emergencyPhone, emergencyTel].sort());
  assert.match(home, new RegExp(`href="tel:\\${officeTel}"`));
  assert.match(home, /"telephone": "\+441942802880"/);
  assert.match(emergency, new RegExp(`href="tel:\\${emergencyTel}"`));
  assert.equal(emergency.includes(office), false);
  assert.equal(emergency.includes(officeTel), false);
  assert.equal(business.links.phone, office);
  assert.equal(business.links.phoneHref, `tel:${officeTel}`);
  assert.match(business.rules.join("\n"), new RegExp(emergencyPhone));
});

test("chat knowledge matches the new answers and does not name a path for them", () => {
  assert.match(business.knowledge, /Yes\. The site is cleared every day\./);
  assert.match(
    business.knowledge,
    /We're based on Park Road, Westhoughton BL5, working across the North West\./,
  );
  assert.match(business.knowledge, /areas list on the home page, in words/);
  assert.match(business.knowledge, new RegExp(outOfHours.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(business.knowledge, /Do not promise a same day visit/);
  assert.equal(business.pages.includes("/emergency"), false);
  assert.equal(business.knowledge.includes("/emergency"), false);
  const tidy = business.knowledge.match(/If someone asks whether the house and garden[\s\S]*?garden\./);
  const area = business.knowledge.match(/If someone asks whether you work[\s\S]*?not on the list\./);
  const leak = business.knowledge.match(/The leaking roof line[\s\S]*?do not add those\./);
  assert.ok(tidy && area && leak);
  for (const part of [tidy[0], area[0], leak[0]]) {
    assert.equal(part.includes("http"), false, part);
    assert.equal(/\/[a-z0-9]/i.test(part), false, part);
  }
});
