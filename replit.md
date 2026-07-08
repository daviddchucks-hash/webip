# WebIP - IP & Website Inspector

A dark-mode-first diagnostics tool for developers and sysadmins: look up public IP address intelligence (geolocation, ISP/ASN, WHOIS, proxy/hosting detection) or inspect any public website (SEO tags, DNS, SSL certificate, headers, page source, tech stack, and an SEO/accessibility/performance audit). Targets the domain `https://webip.drexxora.name.ng`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/webip run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec after editing `lib/api-spec/openapi.yaml`

No database is used — search history and favorites are stored client-side in `localStorage`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`), HTML parsing via `cheerio`, DNS via `node:dns/promises`, TLS/SSL inspection via `node:tls`, WHOIS via a minimal TCP client to `whois.iana.org` + referral server
- Frontend: React + Vite + wouter + TanStack Query (`artifacts/webip`)
- Validation: Zod, generated from `lib/api-spec/openapi.yaml` via Orval

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for the `/ip-lookup` and `/website-inspect` contracts
- `artifacts/api-server/src/lib/ipLookup.ts` — IP geolocation (ip-api.com), reverse DNS, WHOIS
- `artifacts/api-server/src/lib/websiteInspect.ts` — fetch/redirect handling, SSRF guard, HTML/DNS/SSL/SEO analysis
- `artifacts/webip/src/pages/` — home, IP lookup, website inspector, history pages
- `artifacts/webip/src/hooks` — `useHistory`-style localStorage hook for search history/favorites
- `artifacts/webip/public/` — robots.txt, sitemap.xml, manifest.json, browserconfig.xml, offline.html (hardcoded to the `webip.drexxora.name.ng` domain)

## Architecture decisions

- No persistent server-side storage: history/favorites are a client-only feature by design, so there's no DB.
- `/website-inspect` fetches arbitrary user-supplied URLs, so it has an SSRF guard (`assertPublicHost`/`assertSafeToFetch` in `websiteInspect.ts`) that blocks private/loopback/link-local/reserved IP ranges (including cloud metadata `169.254.169.254`) and is re-checked on every redirect hop and auxiliary fetch (robots.txt, sitemap.xml) to prevent DNS-rebinding bypasses.
- Fetched response bodies are capped (5 MB) via a streaming reader with a hard cutoff, and `htmlSource` returned to clients is separately truncated (1 MB) to avoid huge payloads.
- Error responses distinguish client-fault (400, e.g. invalid/unsafe URL) from upstream-fault (502, e.g. target site unreachable) via two error classes (`WebsiteInspectError` vs `WebsiteFetchError`).
- WHOIS has no reliable free HTTP API, so it's implemented as a raw TCP client (port 43) querying IANA then following the registry referral — this can be slow or incomplete for some TLDs; treat `whois`/`registrarInfo` as best-effort.

## Product

- **IP Lookup** (`/ip`): enter any IPv4/IPv6 address (or leave blank to look up your own), see geolocation (with a Google Maps link), ISP/ASN/organization, proxy/hosting flags, and raw WHOIS text. Copy-to-clipboard on fields, JSON download, favorite/star, and local search history.
- **Website Inspector** (`/website`): enter a URL, see meta/SEO tags, Open Graph/Twitter Card, HTTP status/headers/redirect chain, SSL certificate details, DNS records, robots.txt/sitemap.xml, link/asset inventory, headings, structured data/JSON-LD, detected technologies and analytics, and a categorized SEO/accessibility/performance audit. Includes a raw HTML source viewer with search, copy, and download, plus local history/favorites.
- **History** (`/history`): combined view of both tools' local search history and favorites, with re-run and remove actions.

## User preferences

- Repo is mirrored to `https://github.com/daviddchucks-hash/webip.git` (`origin`, `main` branch) — push there after significant changes. Do not store the access token in files or command history longer than the single push command; keep the remote URL token-free between pushes.

## Gotchas

- ip-api.com's free tier is HTTP-only (no HTTPS) and rate-limited (~45 req/min) — expect occasional throttling under heavy use.
- In the Replit dev preview, "look up my own IP" resolves to the container's local address, not a real public IP — this is expected in dev and will behave correctly once deployed with real public ingress.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
