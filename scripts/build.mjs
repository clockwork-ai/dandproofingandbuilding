import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const publicDir = path.join(root, "public");

// The Which? review count and rating live in lib/which.json. Fill them into every page in public.
// Any problem stops the build, so Vercel keeps the last good site and never shows a 0 or a blank.
const fail = (msg) => {
  console.error(`\nBuild stopped: ${msg}\nFix lib/which.json and try again. The live site has not changed.\n`);
  process.exit(1);
};
let which;
try {
  which = JSON.parse(await readFile(path.join(root, "lib", "which.json"), "utf8"));
} catch (err) {
  fail(`lib/which.json is missing or is not valid JSON (${err.message}).`);
}
if (!which || typeof which !== "object") fail("lib/which.json is not an object.");
if (!Number.isInteger(which.count) || which.count <= 0) fail(`"count" in lib/which.json must be a whole number above 0, not ${JSON.stringify(which.count)}.`);
if (typeof which.rating !== "string" || !/^[0-5]\.\d$/.test(which.rating)) fail(`"rating" in lib/which.json must look like "5.0", not ${JSON.stringify(which.rating)}.`);

await rm(publicDir, { recursive: true, force: true });
await mkdir(path.join(root, "api"), { recursive: true });
await mkdir(publicDir, { recursive: true });

await build({
  entryPoints: ["server/chat.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "api/chat.js",
  packages: "external",
  target: "node22",
  legalComments: "none",
});

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
  const after = before.replaceAll("{{WHICH_COUNT}}", String(which.count)).replaceAll("{{WHICH_RATING}}", which.rating);
  if (after.includes("{{WHICH_")) leftOver.push(path.relative(publicDir, file));
  if (after !== before) await writeFile(file, after);
}
if (leftOver.length) fail(`a {{WHICH_...}} placeholder was left in: ${leftOver.join(", ")}. Only {{WHICH_COUNT}} and {{WHICH_RATING}} exist.`);
console.log(`Which? reviews: ${which.count} at ${which.rating}, filled into ${pages.length} pages.`);
