import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

// Vercel compiles redirect sources with path-to-regexp 6.1.0, strict and
// case sensitive. A source shaped /:name(<pattern>) or /:name(<pattern>)/
// becomes ^(?:/(<pattern>))$ or ^(?:/(<pattern>))/$ . permanent true is a 308.
// trailingSlash is left unset: that flag uses the same 308, but it also
// redirects /api/chat, /api/quote and /api/cleanup-enquiries, and the cron
// must stay on the path with no slash.

const VERIFICATION_FILE = "google8befe8a7d9c26cd2.html";
const VERIFICATION_PATH = `/${VERIFICATION_FILE}`;
const VERIFICATION_BODY = "google-site-verification: google8befe8a7d9c26cd2.html\n";

type Redirect = {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
};

type VercelConfig = {
  trailingSlash?: boolean;
  cleanUrls?: boolean;
  redirects?: Redirect[];
  crons?: { path: string; schedule: string }[];
  functions?: Record<string, unknown>;
};

type Hop = { status: number; location: string };

function statusOf(redirect: Redirect): number {
  if (typeof redirect.permanent === "boolean") return redirect.permanent ? 308 : 307;
  if (typeof redirect.statusCode === "number") return redirect.statusCode;
  return 308;
}

function compileSource(source: string): { name: string; re: RegExp } {
  const match = /^\/:([A-Za-z_][A-Za-z0-9_]*)\((.*)\)(\/?)$/.exec(source);
  assert.ok(match, `redirect source is not a named pattern: ${source}`);
  const name = match[1];
  const pattern = match[2];
  const slash = match[3];
  return { name, re: new RegExp(`^(?:/(${pattern}))${slash}$`) };
}

function redirectHop(redirects: Redirect[] | undefined, pathname: string): Hop | null {
  for (const redirect of redirects ?? []) {
    const compiled = compileSource(redirect.source);
    const match = compiled.re.exec(pathname);
    if (!match) continue;
    return {
      status: statusOf(redirect),
      location: redirect.destination.replaceAll(`:${compiled.name}`, match[1]),
    };
  }
  return null;
}

// The routes Vercel adds when trailingSlash is true, before any redirects.
// A path whose last segment contains a dot is not given a slash. /.well-known
// is skipped. A file that already has a slash loses it.
function trailingSlashHop(enabled: boolean | undefined, pathname: string): Hop | null {
  if (enabled !== true) return null;
  if (/^\/\.well-known(?:\/.*)?$/.test(pathname)) return null;
  const add = /^\/((?:[^/]+\/)*[^/.]+)$/.exec(pathname);
  if (add) return { status: 308, location: `/${add[1]}/` };
  const strip = /^\/((?:[^/]+\/)*[^/]+\.\w+)\/$/.exec(pathname);
  if (strip) return { status: 308, location: `/${strip[1]}` };
  return null;
}

function hop(config: VercelConfig, pathname: string): Hop | null {
  return trailingSlashHop(config.trailingSlash, pathname) ?? redirectHop(config.redirects, pathname);
}

function sitemapPaths(xml: string): string[] {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locs.length > 0, "sitemap has no loc entries");
  return locs.map((loc) => {
    const url = new URL(loc);
    assert.equal(url.origin, "https://dandproofingandbuilding.co.uk");
    return url.pathname;
  });
}

test("every sitemap address is the slash form, and the verification file is not redirected", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8")) as VercelConfig;
  const sitemap = sitemapPaths(await readFile(new URL("../sitemap.xml", import.meta.url), "utf8"));
  const verification = await readFile(new URL(`../${VERIFICATION_FILE}`, import.meta.url), "utf8");

  assert.equal(verification, VERIFICATION_BODY);
  assert.equal(JSON.stringify(config).includes(VERIFICATION_FILE), false);
  assert.equal(config.cleanUrls, undefined);
  assert.equal(
    config.trailingSlash,
    undefined,
    "trailingSlash would 308 /api/chat, /api/quote and the cleanup cron as well as pages",
  );
  assert.deepEqual(config.redirects, [
    {
      source: "/:path((?!api(?:/|$))(?:[^/]+/)*[^/.]+)",
      destination: "/:path/",
      permanent: true,
    },
  ]);
  for (const redirect of config.redirects) {
    assert.equal(redirect.destination.startsWith("/"), true);
    assert.equal(redirect.destination.includes("://"), false);
    assert.equal(redirect.source.includes("://"), false);
  }

  for (const pathname of sitemap) {
    assert.equal(pathname.endsWith("/"), true, pathname);
    assert.equal(hop(config, pathname), null, pathname);
    if (pathname === "/") continue;
    const bare = pathname.slice(0, -1);
    const once = hop(config, bare);
    assert.deepEqual(once, { status: 308, location: pathname }, bare);
    assert.equal(hop(config, once.location), null, bare);
  }

  for (const pathname of [
    VERIFICATION_PATH,
    `${VERIFICATION_PATH}/`,
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
    "/pages.css",
    "/chat/widget.js",
    "/og.jpg",
    "/api",
    "/api/",
  ]) {
    assert.equal(hop(config, pathname), null, pathname);
  }

  const apiNames = (await readdir(new URL("../api/", import.meta.url))).filter((name) => name.endsWith(".js"));
  assert.ok(apiNames.length > 0);
  for (const name of apiNames) {
    const pathname = `/api/${name.slice(0, -3)}`;
    assert.equal(hop(config, pathname), null, pathname);
    assert.equal(hop(config, `${pathname}/`), null, pathname);
  }
  for (const cron of config.crons ?? []) {
    const pathname = new URL(cron.path, "https://dandproofingandbuilding.co.uk").pathname;
    assert.equal(hop(config, pathname), null, pathname);
  }
});
