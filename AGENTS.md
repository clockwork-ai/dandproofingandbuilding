# D & P Roofing and Building site (clockwork-ai/dandproofingandbuilding)

Site rules for anyone, human or assistant, working in this repo. Claude Code reads this file as `CLAUDE.md`. Cursor reads the same text as `AGENTS.md`. Keep the two files identical. This is a Clockwork AI client site; the client is Dale.

## Standing rules

- Work from the latest default branch (`main`). Open a preview pull request for every change, with the template filled in. Callum approves merges. Do not merge without that approval, and never push to main.
- British English. No em dashes or en dashes in copy, code, or chat replies. Use full stops, commas or colons. Write ranges as "to".
- Do not change phone numbers. The site shows 01942 802880 (header) and 07587 415299 (emergency and Google). Any change needs Callum's approval, in writing, first. The same goes for any price or quote figure.
- Never touch the Search Console verification file `google8befe8a7d9c26cd2.html` at the repo root, and never add, move or edit any other verification file or meta tag.
- Do not invent reviews, ratings, years in business, accreditations, guarantees, insurance claims, prices or job examples. Use only what is published on the site. Which? review text is never stored in this repo.
- No keys, tokens or secrets in any file. The chat uses the deployment's own token; there is nothing to paste.
- Customer-facing work stays in a preview or a pull request until Callum says merge.

## Brand

D & P Roofing and Building. Canvas #0A0F16, surface #141B25, ink #EEF2F6, accent #DE213A, blue #0354B4. Display font Archivo, text font Geist.

## Where things are

- The chatbot is edited in `lib/business.ts`. Replies name pages in words. The widget adds the button. A reply must not contain a raw URL or a path.
- The Which? review count and rating live in `lib/which.json`. Change it there, nowhere else. The build fills them into every page and stops if the number is missing, 0 or not a whole number.
- `/photo-frame/` is Dale's private page (noindex, out of the sitemap). Leave it out of menus.
- Area pages are the `roofers-*` and `builders-*` folders plus `locations/`; the sitemap is `sitemap.xml`.

## How to test

    npm ci
    npm test            # node --test lib/*.test.ts
    npm run typecheck
    npm run build       # scripts/build.mjs, writes public/

Show the output in the pull request. Check changed pages at 390 and 1440 wide and attach both screenshots.

## How to deploy

Merging to `main` on GitHub deploys production through the Vercel Git integration (team clockwork-ai1, project dandproofingandbuilding, London region). Nothing else deploys production. Every pull request gets a preview at a `*-clockwork-ai1.vercel.app` address.

## How to roll back

Only Callum rolls back. Steps:

1. Find the previous production deployment id. Vercel dashboard: team clockwork-ai1, project dandproofingandbuilding, Deployments, filter Environment = Production. The top row is live; the row below is the previous one. Its id is the `dandproofingandbuilding-xxxxxxxxx` part of the deployment URL. From a terminal with the saved Vercel login: `npx -y vercel@latest ls dandproofingandbuilding --environment production --scope clockwork-ai1` lists the same rows, newest first.
2. Open that previous deployment and choose "Promote to Production" (or "Instant Rollback" on the current production deployment). CLI: `npx -y vercel@latest rollback <previous deployment url> --scope clockwork-ai1`.
3. Note the deployment id you promoted in the pull request or the hub log, then fix forward on a branch.
