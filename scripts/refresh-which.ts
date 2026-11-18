/**
 * Fetch the public Which? pages and, when the figures have changed and
 * still look right, rewrite lib/which.json. Any failure leaves the file as it is.
 *
 *   node --experimental-strip-types scripts/refresh-which.ts
 *   node --experimental-strip-types scripts/refresh-which.ts --dry-run
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkWhich, formatWhich } from "../lib/which.ts";
import { PROFILE_URL, WIDGET_URL, londonDate, refreshFromHtml } from "../lib/which-refresh.ts";

const dryRun = process.argv.includes("--dry-run");
const file = path.join(process.cwd(), "lib", "which.json");

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: "text/html",
        "user-agent": "DandPWhichRefresh/1.0 (+https://dandproofingandbuilding.co.uk/)",
      },
    });
    const finalHost = new URL(response.url).hostname;
    if (finalHost !== "trustedtraders.which.co.uk") return null;
    if (!response.ok) return null;
    const html = await response.text();
    if (html.length < 500 || html.length > 2_000_000) return null;
    return html;
  } catch {
    return null;
  }
}

const current = checkWhich(JSON.parse(await readFile(file, "utf8")));
const [profileHtml, widgetHtml] = await Promise.all([fetchHtml(PROFILE_URL), fetchHtml(WIDGET_URL)]);
const decision = refreshFromHtml(current, profileHtml, widgetHtml, londonDate());

console.log(`Which? refresh: ${decision.action}. ${decision.reason}`);
if (decision.warn) console.log(`::warning::Kept the last Which? figures. ${decision.reason}`);

if (decision.action === "update") {
  const next = formatWhich(decision.next);
  if (dryRun) {
    console.log(next);
    console.log("Dry run: lib/which.json was not written.");
  } else {
    await writeFile(file, next);
    console.log("Wrote lib/which.json.");
  }
} else if (dryRun) {
  console.log("Dry run: lib/which.json was not written.");
}
