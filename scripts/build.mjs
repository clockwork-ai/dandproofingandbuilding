import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { checkWhich, whichPlaceholders } from "../lib/which.ts";

const root = process.cwd();
const publicDir = path.join(root, "public");

// The Which? figures live in lib/which.json. Fill them into every page in public.
// Any problem stops the build, so Vercel keeps the last good site and never shows a 0 or a blank.
const fail = (msg) => {
  console.error(`\nBuild stopped: ${msg}\nFix lib/which.json and try again. The live site has not changed.\n`);
  process.exit(1);
};
let which;
try {
  which = checkWhich(JSON.parse(await readFile(path.join(root, "lib", "which.json"), "utf8")));
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
const placeholders = whichPlaceholders(which);

await rm(publicDir, { recursive: true, force: true });
await mkdir(path.join(root, "api"), { recursive: true });
await mkdir(publicDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
    target: "node22",
    legalComments: "none",
  });
}

await bundle("server/chat.ts", "api/chat.js");
await bundle("server/cleanup.ts", "api/cleanup-enquiries.js");
await bundle("server/quote.ts", "api/quote.js");

const skip = new Set([
  "api",
  "lib",
  "server",
  "scripts",
  "node_modules",
  "public",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vercel.json",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
]);

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
  await cp(path.join(root, entry.name), path.join(publicDir, entry.name), { recursive: true });
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (entry.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const pages = await htmlFiles(publicDir);
const leftOver = [];
for (const file of pages) {
  const before = await readFile(file, "utf8");
  let after = before;
  for (const [token, value] of Object.entries(placeholders)) after = after.replaceAll(token, value);
  if (after.includes("{{WHICH_")) leftOver.push(path.relative(publicDir, file));
  if (after !== before) await writeFile(file, after);
}
if (leftOver.length) fail(`a {{WHICH_...}} placeholder was left in: ${leftOver.join(", ")}.`);
console.log(`Which? reviews: ${which.count} at ${which.rating}, ${which.recommendPercent}% recommend, filled into ${pages.length} pages.`);
