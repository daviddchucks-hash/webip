import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import * as cheerio from "cheerio";
import { logger } from "./logger";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB cap on any fetched response body
const MAX_HTML_SOURCE_BYTES = 1 * 1024 * 1024; // 1 MB cap on htmlSource returned to clients

/**
 * Blocks SSRF: rejects hostnames that resolve to private, loopback,
 * link-local, or other non-public IP ranges (including cloud metadata
 * endpoints like 169.254.169.254). Must be re-validated on every redirect hop
 * and on every auxiliary fetch (robots.txt, sitemap.xml), since DNS can
 * rebind between checks.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  // Reject literal IP addresses/hostnames that are obviously unsafe before
  // even resolving, in case dns lookups are bypassed by IP literals.
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new WebsiteInspectError("Refusing to fetch a private or reserved IP address");
    }
    return;
  }

  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    throw new WebsiteInspectError("Refusing to fetch a local hostname");
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new WebsiteInspectError(`Could not resolve hostname "${hostname}"`);
  }

  if (addresses.length === 0) {
    throw new WebsiteInspectError(`Could not resolve hostname "${hostname}"`);
  }

  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new WebsiteInspectError("Refusing to fetch a private or reserved IP address");
    }
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this" network
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast/reserved (224.0.0.0+)
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 address; check the embedded IPv4 part
      const mapped = lower.split(":").pop() ?? "";
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true; // unknown format -- fail closed
}

export interface KeyValue {
  key: string;
  value: string;
}

export interface DnsRecords {
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  cname: string[];
}

export interface SslInfo {
  valid: boolean;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  protocol: string | null;
  error: string | null;
}

export interface HeadingGroup {
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
}

export interface SeoFinding {
  severity: "good" | "warning" | "error";
  message: string;
}

export interface WebsiteInspectionResult {
  requestedUrl: string;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  openGraph: KeyValue[];
  twitterCard: KeyValue[];
  charset: string | null;
  language: string | null;
  favicon: string | null;
  httpStatus: number;
  responseHeaders: KeyValue[];
  redirectChain: string[];
  sslInfo: SslInfo;
  dns: DnsRecords;
  registrarInfo: string | null;
  robotsTxt: string | null;
  sitemapXml: string | null;
  internalLinks: string[];
  externalLinks: string[];
  cssFiles: string[];
  jsFiles: string[];
  images: string[];
  fonts: string[];
  formsCount: number;
  buttonsCount: number;
  tablesCount: number;
  headings: HeadingGroup;
  structuredData: string[];
  jsonLd: string[];
  technologies: string[];
  analyticsDetected: string[];
  seoAudit: SeoFinding[];
  accessibilitySuggestions: SeoFinding[];
  performanceSuggestions: SeoFinding[];
  htmlSource: string;
}

/** Client-fault error: invalid/unsafe input. Maps to HTTP 400. */
export class WebsiteInspectError extends Error {}

/** Upstream-fault error: the target site could not be reached. Maps to HTTP 502. */
export class WebsiteFetchError extends Error {}

function normalizeUrl(input: string): URL {
  let candidate = input.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    return new URL(candidate);
  } catch {
    throw new WebsiteInspectError(`"${input}" is not a valid URL`);
  }
}

/** Rejects any scheme other than http/https, and re-validates the resolved
 * host against the SSRF blocklist -- must be called before every fetch,
 * including each redirect hop, since redirects can point anywhere. */
async function assertSafeToFetch(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebsiteInspectError(`Unsupported URL scheme "${url.protocol}"`);
  }
  await assertPublicHost(url.hostname);
}

/** Reads a fetch Response body up to a byte cap, aborting the stream once
 * exceeded rather than buffering unbounded data into memory. */
async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

async function fetchWithRedirects(
  startUrl: URL,
): Promise<{
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
  redirectChain: string[];
}> {
  const redirectChain: string[] = [];
  let current = startUrl;

  for (let i = 0; i < 10; i++) {
    await assertSafeToFetch(current);

    const res = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WebIPBot/1.0; +https://webip.drexxora.name.ng)",
      },
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) {
        const body = await readBodyCapped(res, MAX_BODY_BYTES);
        return { finalUrl: current.toString(), status: res.status, headers: res.headers, body, redirectChain };
      }
      redirectChain.push(current.toString());
      current = new URL(location, current);
      continue;
    }

    const body = await readBodyCapped(res, MAX_BODY_BYTES);
    return { finalUrl: current.toString(), status: res.status, headers: res.headers, body, redirectChain };
  }

  throw new WebsiteInspectError("Too many redirects");
}

async function fetchTextSafe(url: string): Promise<string | null> {
  try {
    const target = new URL(url);
    await assertSafeToFetch(target);
    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WebIPBot/1.0)" },
    });
    if (!res.ok) return null;
    return await readBodyCapped(res, MAX_BODY_BYTES);
  } catch {
    return null;
  }
}

async function resolveDns(hostname: string): Promise<DnsRecords> {
  const result: DnsRecords = { a: [], aaaa: [], mx: [], ns: [], txt: [], cname: [] };
  const tasks: Array<Promise<void>> = [
    dns
      .resolve4(hostname)
      .then((r) => {
        result.a = r;
      })
      .catch(() => {}),
    dns
      .resolve6(hostname)
      .then((r) => {
        result.aaaa = r;
      })
      .catch(() => {}),
    dns
      .resolveMx(hostname)
      .then((r) => {
        result.mx = r.map((m) => `${m.exchange} (priority ${m.priority})`);
      })
      .catch(() => {}),
    dns
      .resolveNs(hostname)
      .then((r) => {
        result.ns = r;
      })
      .catch(() => {}),
    dns
      .resolveTxt(hostname)
      .then((r) => {
        result.txt = r.map((t) => t.join(""));
      })
      .catch(() => {}),
    dns
      .resolveCname(hostname)
      .then((r) => {
        result.cname = r;
      })
      .catch(() => {}),
  ];
  await Promise.all(tasks);
  return result;
}

function fetchSslInfo(hostname: string): Promise<SslInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, timeout: 8000 },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol();
          if (!cert || Object.keys(cert).length === 0) {
            resolve({
              valid: false,
              issuer: null,
              subject: null,
              validFrom: null,
              validTo: null,
              daysRemaining: null,
              protocol: protocol ?? null,
              error: "No certificate presented",
            });
          } else {
            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.round(
              (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            );
            resolve({
              valid: socket.authorized,
              issuer: cert.issuer ? formatCertName(cert.issuer) : null,
              subject: cert.subject ? formatCertName(cert.subject) : null,
              validFrom: cert.valid_from ?? null,
              validTo: cert.valid_to ?? null,
              daysRemaining,
              protocol: protocol ?? null,
              error: socket.authorized
                ? null
                : String(socket.authorizationError ?? "Certificate not authorized"),
            });
          }
        } finally {
          socket.end();
        }
      },
    );
    socket.on("error", (err) => {
      resolve({
        valid: false,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        protocol: null,
        error: err.message,
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        valid: false,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        protocol: null,
        error: "Connection timed out",
      });
    });
  });
}

function formatCertName(name: Record<string, string | string[] | undefined>): string {
  return Object.entries(name)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`)
    .join(", ");
}

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const TECH_SIGNATURES: Array<{ name: string; test: (html: string, headers: Headers) => boolean }> = [
  { name: "WordPress", test: (html) => /wp-content|wp-includes/i.test(html) },
  { name: "Shopify", test: (html) => /cdn\.shopify\.com/i.test(html) },
  { name: "React", test: (html) => /data-reactroot|__next|react/i.test(html) },
  { name: "Next.js", test: (html) => /__next|_next\/static/i.test(html) },
  { name: "Vue.js", test: (html) => /data-v-|__vue__|vue\.js/i.test(html) },
  { name: "Angular", test: (html) => /ng-version|angular\.js/i.test(html) },
  { name: "jQuery", test: (html) => /jquery(\.min)?\.js/i.test(html) },
  { name: "Bootstrap", test: (html) => /bootstrap(\.min)?\.css/i.test(html) },
  { name: "Tailwind CSS", test: (html) => /tailwind/i.test(html) },
  { name: "Cloudflare", test: (_h, headers) => /cloudflare/i.test(headers.get("server") ?? "") },
  { name: "Nginx", test: (_h, headers) => /nginx/i.test(headers.get("server") ?? "") },
  { name: "Apache", test: (_h, headers) => /apache/i.test(headers.get("server") ?? "") },
  { name: "Vercel", test: (_h, headers) => /vercel/i.test(headers.get("server") ?? "") || !!headers.get("x-vercel-id") },
];

const ANALYTICS_SIGNATURES: Array<{ name: string; test: (html: string) => boolean }> = [
  { name: "Google Analytics", test: (html) => /gtag\(|google-analytics\.com|googletagmanager\.com\/gtag/i.test(html) },
  { name: "Google Tag Manager", test: (html) => /googletagmanager\.com\/gtm/i.test(html) },
  { name: "Facebook Pixel", test: (html) => /connect\.facebook\.net.*fbevents/i.test(html) },
  { name: "Hotjar", test: (html) => /static\.hotjar\.com/i.test(html) },
  { name: "Segment", test: (html) => /cdn\.segment\.com/i.test(html) },
  { name: "Plausible", test: (html) => /plausible\.io\/js/i.test(html) },
  { name: "Mixpanel", test: (html) => /cdn\.mxpnl\.com/i.test(html) },
];

export async function inspectWebsite(inputUrl: string): Promise<WebsiteInspectionResult> {
  const url = normalizeUrl(inputUrl);

  let fetched;
  try {
    fetched = await fetchWithRedirects(url);
  } catch (err) {
    logger.warn({ err, url: inputUrl }, "website fetch failed");
    // WebsiteInspectError means the input itself was rejected (invalid
    // scheme, SSRF-blocked host, unresolvable hostname, etc.) -- that is a
    // client-fault (400). Anything else is a network/upstream failure (502).
    if (err instanceof WebsiteInspectError) throw err;
    throw new WebsiteFetchError(
      err instanceof Error ? err.message : "Failed to fetch the requested website",
    );
  }

  const finalUrlObj = new URL(fetched.finalUrl);
  const $ = cheerio.load(fetched.body);

  const title = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr("href") || null;
  const metaRobots = $('meta[name="robots"]').attr("content") || null;
  const charset =
    $("meta[charset]").attr("charset") ||
    $('meta[http-equiv="Content-Type"]').attr("content")?.match(/charset=([^;]+)/i)?.[1] ||
    null;
  const language = $("html").attr("lang") || null;

  const faviconHref =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    "/favicon.ico";
  const favicon = absoluteUrl(fetched.finalUrl, faviconHref);

  const openGraph: KeyValue[] = [];
  $('meta[property^="og:"]').each((_, el) => {
    const key = $(el).attr("property");
    const value = $(el).attr("content");
    if (key && value != null) openGraph.push({ key, value });
  });

  const twitterCard: KeyValue[] = [];
  $('meta[name^="twitter:"]').each((_, el) => {
    const key = $(el).attr("name");
    const value = $(el).attr("content");
    if (key && value != null) twitterCard.push({ key, value });
  });

  const responseHeaders: KeyValue[] = [];
  fetched.headers.forEach((value, key) => responseHeaders.push({ key, value }));

  const internalLinksSet = new Set<string>();
  const externalLinksSet = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const abs = absoluteUrl(fetched.finalUrl, href);
    if (!abs) return;
    try {
      const linkHost = new URL(abs).hostname;
      if (linkHost === finalUrlObj.hostname) internalLinksSet.add(abs);
      else externalLinksSet.add(abs);
    } catch {
      /* ignore */
    }
  });

  const cssFiles = new Set<string>();
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    const abs = href && absoluteUrl(fetched.finalUrl, href);
    if (abs) cssFiles.add(abs);
  });

  const jsFiles = new Set<string>();
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    const abs = src && absoluteUrl(fetched.finalUrl, src);
    if (abs) jsFiles.add(abs);
  });

  const images = new Set<string>();
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    const abs = src && absoluteUrl(fetched.finalUrl, src);
    if (abs) images.add(abs);
  });

  const fonts = new Set<string>();
  $('link[href*="font"], link[as="font"]').each((_, el) => {
    const href = $(el).attr("href");
    const abs = href && absoluteUrl(fetched.finalUrl, href);
    if (abs) fonts.add(abs);
  });
  $("style, link[rel=stylesheet]").each((_, el) => {
    const content = $(el).html() ?? "";
    const matches = content.matchAll(/url\((['"]?)([^'")]+\.(?:woff2?|ttf|otf|eot))\1\)/gi);
    for (const m of matches) {
      const abs = absoluteUrl(fetched.finalUrl, m[2]);
      if (abs) fonts.add(abs);
    }
  });

  const headings: HeadingGroup = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  (["h1", "h2", "h3", "h4", "h5", "h6"] as const).forEach((tag) => {
    $(tag).each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings[tag].push(text);
    });
  });

  const structuredData: string[] = [];
  $('[itemscope]').each((_, el) => {
    const itemtype = $(el).attr("itemtype");
    if (itemtype) structuredData.push(itemtype);
  });

  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html();
    if (content) jsonLd.push(content.trim());
  });

  const formsCount = $("form").length;
  const buttonsCount = $("button, input[type=button], input[type=submit]").length;
  const tablesCount = $("table").length;

  const technologies = TECH_SIGNATURES.filter((t) => t.test(fetched.body, fetched.headers)).map(
    (t) => t.name,
  );
  const analyticsDetected = ANALYTICS_SIGNATURES.filter((a) => a.test(fetched.body)).map(
    (a) => a.name,
  );

  const [robotsTxt, sitemapXml, dnsRecords, sslInfo] = await Promise.all([
    fetchTextSafe(new URL("/robots.txt", finalUrlObj).toString()),
    fetchTextSafe(new URL("/sitemap.xml", finalUrlObj).toString()),
    resolveDns(finalUrlObj.hostname),
    finalUrlObj.protocol === "https:"
      ? fetchSslInfo(finalUrlObj.hostname)
      : Promise.resolve<SslInfo>({
          valid: false,
          issuer: null,
          subject: null,
          validFrom: null,
          validTo: null,
          daysRemaining: null,
          protocol: null,
          error: "Site is not served over HTTPS",
        }),
  ]);

  const seoAudit: SeoFinding[] = [];
  seoAudit.push(
    title
      ? { severity: "good", message: `Title tag present (${title.length} characters)` }
      : { severity: "error", message: "Missing <title> tag" },
  );
  if (title && (title.length < 10 || title.length > 60)) {
    seoAudit.push({ severity: "warning", message: "Title length should ideally be 10-60 characters" });
  }
  seoAudit.push(
    metaDescription
      ? { severity: "good", message: `Meta description present (${metaDescription.length} characters)` }
      : { severity: "warning", message: "Missing meta description" },
  );
  seoAudit.push(
    canonicalUrl
      ? { severity: "good", message: "Canonical URL is set" }
      : { severity: "warning", message: "No canonical URL found" },
  );
  seoAudit.push(
    headings.h1.length === 1
      ? { severity: "good", message: "Exactly one H1 heading found" }
      : headings.h1.length === 0
        ? { severity: "error", message: "No H1 heading found" }
        : { severity: "warning", message: `Multiple H1 headings found (${headings.h1.length})` },
  );
  seoAudit.push(
    robotsTxt
      ? { severity: "good", message: "robots.txt found" }
      : { severity: "warning", message: "No robots.txt found" },
  );
  seoAudit.push(
    sitemapXml
      ? { severity: "good", message: "sitemap.xml found" }
      : { severity: "warning", message: "No sitemap.xml found at default location" },
  );
  seoAudit.push(
    openGraph.length > 0
      ? { severity: "good", message: "Open Graph tags present" }
      : { severity: "warning", message: "No Open Graph tags found" },
  );

  const accessibilitySuggestions: SeoFinding[] = [];
  const imagesWithoutAlt = $("img:not([alt])").length;
  accessibilitySuggestions.push(
    imagesWithoutAlt === 0
      ? { severity: "good", message: "All images have alt attributes" }
      : { severity: "warning", message: `${imagesWithoutAlt} image(s) missing alt attributes` },
  );
  accessibilitySuggestions.push(
    language
      ? { severity: "good", message: `Document language declared (${language})` }
      : { severity: "error", message: "Missing lang attribute on <html>" },
  );
  const formInputsWithoutLabel = $("input:not([type=hidden])").filter((_, el) => {
    const id = $(el).attr("id");
    return !id || $(`label[for="${id}"]`).length === 0;
  }).length;
  accessibilitySuggestions.push(
    formInputsWithoutLabel === 0
      ? { severity: "good", message: "Form inputs appear to have associated labels" }
      : { severity: "warning", message: `${formInputsWithoutLabel} form input(s) may be missing labels` },
  );

  const performanceSuggestions: SeoFinding[] = [];
  performanceSuggestions.push(
    jsFiles.size <= 10
      ? { severity: "good", message: `Reasonable number of script files (${jsFiles.size})` }
      : { severity: "warning", message: `High number of script files (${jsFiles.size}) may slow page load` },
  );
  performanceSuggestions.push(
    cssFiles.size <= 8
      ? { severity: "good", message: `Reasonable number of stylesheet files (${cssFiles.size})` }
      : { severity: "warning", message: `High number of stylesheet files (${cssFiles.size})` },
  );
  const bodySizeKb = Buffer.byteLength(fetched.body, "utf8") / 1024;
  performanceSuggestions.push(
    bodySizeKb <= 300
      ? { severity: "good", message: `HTML document size is ${bodySizeKb.toFixed(0)} KB` }
      : { severity: "warning", message: `HTML document is large (${bodySizeKb.toFixed(0)} KB)` },
  );
  performanceSuggestions.push(
    fetched.headers.get("content-encoding")
      ? { severity: "good", message: `Response is compressed (${fetched.headers.get("content-encoding")})` }
      : { severity: "warning", message: "Response is not compressed (no content-encoding header)" },
  );

  return {
    requestedUrl: inputUrl,
    finalUrl: fetched.finalUrl,
    title,
    metaDescription,
    canonicalUrl,
    metaRobots,
    openGraph,
    twitterCard,
    charset,
    language,
    favicon,
    httpStatus: fetched.status,
    responseHeaders,
    redirectChain: fetched.redirectChain,
    sslInfo,
    dns: dnsRecords,
    registrarInfo: null,
    robotsTxt,
    sitemapXml,
    internalLinks: [...internalLinksSet],
    externalLinks: [...externalLinksSet],
    cssFiles: [...cssFiles],
    jsFiles: [...jsFiles],
    images: [...images],
    fonts: [...fonts],
    formsCount,
    buttonsCount,
    tablesCount,
    headings,
    structuredData,
    jsonLd,
    technologies,
    analyticsDetected,
    seoAudit,
    accessibilitySuggestions,
    performanceSuggestions,
    htmlSource:
      Buffer.byteLength(fetched.body, "utf8") > MAX_HTML_SOURCE_BYTES
        ? `${fetched.body.slice(0, MAX_HTML_SOURCE_BYTES)}\n\n<!-- truncated: source exceeded ${MAX_HTML_SOURCE_BYTES / 1024}KB -->`
        : fetched.body,
  };
}
