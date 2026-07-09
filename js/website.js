// ============================================================
// website.js — Website Inspector page logic
// APIs used (all free, HTTPS, CORS-enabled):
//   • https://api.allorigins.win  — CORS proxy to fetch target HTML
//   • https://corsproxy.io/       — fallback CORS proxy
//   • https://dns.google/resolve  — DNS-over-HTTPS (A/AAAA/MX/NS/TXT/CNAME)
// SSL details (TLS handshake) require server-side access; noted in UI.
// WHOIS (TCP port 43) requires server-side access; external link provided.
// ============================================================

import { toast, copy, dlJson, esc, addHistory, normalUrl,
         markActiveNav, kvRows, initTabs, setupCopyBtn, dnsSection, auditHtml } from './utils.js';

const ALLORIGINS = url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
const CORSPROXY  = url => `https://corsproxy.io/?${encodeURIComponent(url)}`;
const DOH        = (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;

const $ = id => document.getElementById(id);

let state = null;

markActiveNav();
initTabs(document.body);

// ── Auto-load from URL param ──────────────────────────────────
const paramUrl = new URLSearchParams(location.search).get('url');
if (paramUrl) { $('url-input').value = paramUrl; inspect(paramUrl); }

// ── Events ───────────────────────────────────────────────────
$('inspect-btn')?.addEventListener('click', handleForm);
$('url-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleForm(); });
$('copy-json')?.addEventListener('click', () => state && copy(JSON.stringify(state, null, 2)));
$('dl-json')?.addEventListener('click', () => state && dlJson(state, `website-${new URL(state.finalUrl).hostname}.json`));
setupCopyBtn($('copy-src-btn'), () => state?.htmlSource || '');

// ── Source search ─────────────────────────────────────────────
$('src-search')?.addEventListener('input', function () {
  const q = this.value.toLowerCase();
  const pre = $('src-pre');
  if (!pre || !state?.htmlSource) return;
  if (!q) { pre.textContent = state.htmlSource; return; }
  const raw = state.htmlSource;
  pre.innerHTML = raw.split('\n').map(line => {
    if (line.toLowerCase().includes(q)) {
      return `<mark style="background:rgba(0,212,255,.25);color:var(--text)">${esc(line)}</mark>`;
    }
    return esc(line);
  }).join('\n');
});

// ── Form handler ──────────────────────────────────────────────
function handleForm() {
  const raw = $('url-input').value.trim();
  if (!raw) { toast('Enter a URL', 'warn'); return; }
  const url = normalUrl(raw);
  if (!url) { toast('Invalid URL — include a domain like example.com', 'error'); return; }
  inspect(url);
}

// ── Core inspection ───────────────────────────────────────────
async function inspect(targetUrl) {
  showLoading();
  try {
    const url = normalUrl(targetUrl) || targetUrl;
    const domain = new URL(url).hostname;

    // Fetch HTML via CORS proxy + DNS in parallel
    const [proxyResult, dnsResult] = await Promise.all([
      fetchViaProxy(url),
      resolveDns(domain),
    ]);

    const doc = parseHtml(proxyResult.html, url);
    state = buildState(url, proxyResult, doc, dnsResult, domain);
    render(state);
    addHistory({ type: 'website', query: url, summary: state.title || domain });
  } catch (e) {
    showErr(e.message || 'Failed to inspect this website');
  }
}

// ── CORS proxy fetch ──────────────────────────────────────────
async function fetchViaProxy(url) {
  // Try allorigins first, then corsproxy fallback
  for (const proxyFn of [ALLORIGINS, CORSPROXY]) {
    try {
      const res = await fetch(proxyFn(url), { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;

      if (proxyFn === ALLORIGINS) {
        const json = await res.json();
        return {
          html: json.contents || '',
          status: json.status?.http_code || 200,
          finalUrl: json.status?.url || url,
        };
      } else {
        const html = await res.text();
        return { html, status: 200, finalUrl: url };
      }
    } catch { /* try next proxy */ }
  }
  throw new Error('Could not fetch the website. It may block proxies or be unreachable.');
}

// ── DNS lookup (Google DoH) ───────────────────────────────────
async function resolveDns(domain) {
  const types = ['A','AAAA','MX','NS','TXT','CNAME'];
  const results = await Promise.allSettled(
    types.map(t => fetch(DOH(domain, t), { signal: AbortSignal.timeout(8000) }).then(r => r.json()))
  );
  const dns = { a:[], aaaa:[], mx:[], ns:[], txt:[], cname:[] };
  const map = { A:'a', AAAA:'aaaa', MX:'mx', NS:'ns', TXT:'txt', CNAME:'cname' };
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.Answer) {
      const key = map[types[i]];
      dns[key] = r.value.Answer
        .filter(rec => rec.type === dnsTypeNum(types[i]))
        .map(rec => {
          const d = rec.data.replace(/\.$/, '');
          return types[i] === 'MX' ? d : d;
        });
    }
  });
  return dns;
}
function dnsTypeNum(t) { return {A:1,AAAA:28,MX:15,NS:2,TXT:16,CNAME:5}[t]; }

// ── HTML parsing via DOMParser ─────────────────────────────────
function parseHtml(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return { doc, html, baseUrl };
}

// ── Build full inspection state ───────────────────────────────
function buildState(requestedUrl, proxy, { doc, html, baseUrl }, dns, domain) {
  const absUrl = (href) => {
    try { return new URL(href, baseUrl).toString(); } catch { return null; }
  };

  // Meta
  const title       = doc.title?.trim() || null;
  const metaDesc    = doc.querySelector('meta[name="description"]')?.content?.trim() || null;
  const canonical   = doc.querySelector('link[rel="canonical"]')?.href || null;
  const metaRobots  = doc.querySelector('meta[name="robots"]')?.content || null;
  const charset     = doc.querySelector('meta[charset]')?.getAttribute('charset') ||
                      (doc.querySelector('meta[http-equiv="Content-Type"]')?.content || '').match(/charset=([^;]+)/i)?.[1] || null;
  const language    = doc.documentElement?.lang || null;
  const faviconEl   = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  const favicon     = faviconEl ? absUrl(faviconEl.getAttribute('href')) : absUrl('/favicon.ico');

  // Open Graph
  const openGraph = [];
  doc.querySelectorAll('meta[property^="og:"]').forEach(el => {
    const k = el.getAttribute('property'); const v = el.getAttribute('content');
    if (k && v != null) openGraph.push({ key: k, value: v });
  });

  // Twitter Card
  const twitterCard = [];
  doc.querySelectorAll('meta[name^="twitter:"]').forEach(el => {
    const k = el.getAttribute('name'); const v = el.getAttribute('content');
    if (k && v != null) twitterCard.push({ key: k, value: v });
  });

  // Links
  const intLinks = new Set(), extLinks = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    const abs = absUrl(href); if (!abs) return;
    try { new URL(abs).hostname === domain ? intLinks.add(abs) : extLinks.add(abs); } catch {}
  });

  // Assets
  const cssFiles = new Set(), jsFiles = new Set(), images = new Set(), fonts = new Set();
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => { const h = absUrl(el.getAttribute('href')); if (h) cssFiles.add(h); });
  doc.querySelectorAll('script[src]').forEach(el => { const s = absUrl(el.getAttribute('src')); if (s) jsFiles.add(s); });
  doc.querySelectorAll('img[src]').forEach(el => { const s = absUrl(el.getAttribute('src')); if (s) images.add(s); });
  doc.querySelectorAll('link[as="font"], link[href*=".woff"]').forEach(el => { const h = absUrl(el.getAttribute('href')); if (h) fonts.add(h); });

  // Headings
  const headings = { h1:[], h2:[], h3:[], h4:[], h5:[], h6:[] };
  ['h1','h2','h3','h4','h5','h6'].forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => { const t = el.textContent.trim(); if (t) headings[tag].push(t); });
  });

  // Structured data
  const jsonLd = [], structuredData = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => { if (el.textContent) jsonLd.push(el.textContent.trim()); });
  doc.querySelectorAll('[itemtype]').forEach(el => { const t = el.getAttribute('itemtype'); if (t) structuredData.push(t); });

  // Counts
  const formsCount   = doc.querySelectorAll('form').length;
  const buttonsCount = doc.querySelectorAll('button, input[type=button], input[type=submit]').length;
  const tablesCount  = doc.querySelectorAll('table').length;

  // Tech detection
  const techs = [];
  const tSigs = [
    ['WordPress',   () => /wp-content|wp-includes/i.test(html)],
    ['Shopify',     () => /cdn\.shopify\.com/i.test(html)],
    ['Next.js',     () => /__next|_next\/static/i.test(html)],
    ['React',       () => /data-reactroot|__react/i.test(html)],
    ['Vue.js',      () => /data-v-|__vue__|vue\.global/i.test(html)],
    ['Angular',     () => /ng-version|angular\.min/i.test(html)],
    ['jQuery',      () => /jquery(\.min)?\.js/i.test(html)],
    ['Bootstrap',   () => /bootstrap(\.min)?\.css|bootstrap(\.min)?\.js/i.test(html)],
    ['Tailwind CSS',() => /tailwindcss|"tailwind/i.test(html)],
    ['Svelte',      () => /svelte/i.test(html)],
    ['Astro',       () => /astro-island|\.astro/i.test(html)],
    ['Nuxt',        () => /__nuxt|_nuxt\//i.test(html)],
    ['Gatsby',      () => /gatsby/i.test(html)],
  ];
  tSigs.forEach(([name, test]) => { if (test()) techs.push(name); });

  // Analytics detection
  const analytics = [];
  const aSigs = [
    ['Google Analytics',  () => /gtag\(|google-analytics\.com|googletagmanager\.com\/gtag/i.test(html)],
    ['Google Tag Manager',() => /googletagmanager\.com\/gtm/i.test(html)],
    ['Facebook Pixel',    () => /connect\.facebook\.net.*fbevents/i.test(html)],
    ['Hotjar',            () => /static\.hotjar\.com/i.test(html)],
    ['Segment',           () => /cdn\.segment\.com/i.test(html)],
    ['Plausible',         () => /plausible\.io\/js/i.test(html)],
    ['Mixpanel',          () => /cdn\.mxpnl\.com/i.test(html)],
    ['Heap',              () => /heapanalytics\.com/i.test(html)],
    ['PostHog',           () => /posthog\.com/i.test(html)],
  ];
  aSigs.forEach(([name, test]) => { if (test()) analytics.push(name); });

  // SEO audit
  const seoAudit = [];
  seoAudit.push(title
    ? { severity:'good', message:`Title tag present (${title.length} chars)` }
    : { severity:'error', message:'Missing <title> tag' });
  if (title && (title.length < 10 || title.length > 60))
    seoAudit.push({ severity:'warning', message:`Title length ${title.length} chars (ideal: 10-60)` });
  seoAudit.push(metaDesc
    ? { severity:'good', message:`Meta description present (${metaDesc.length} chars)` }
    : { severity:'warning', message:'Missing meta description' });
  seoAudit.push(canonical
    ? { severity:'good', message:'Canonical URL is set' }
    : { severity:'warning', message:'No canonical URL found' });
  seoAudit.push(headings.h1.length === 1
    ? { severity:'good', message:'Exactly one H1 heading found' }
    : headings.h1.length === 0
      ? { severity:'error', message:'No H1 heading found' }
      : { severity:'warning', message:`Multiple H1 headings (${headings.h1.length})` });
  seoAudit.push(openGraph.length > 0
    ? { severity:'good', message:`Open Graph tags present (${openGraph.length})` }
    : { severity:'warning', message:'No Open Graph tags found' });
  seoAudit.push(favicon
    ? { severity:'good', message:'Favicon declared' }
    : { severity:'warning', message:'No favicon found' });

  // Accessibility audit
  const accessAudit = [];
  const imgsNoAlt = doc.querySelectorAll('img:not([alt])').length;
  accessAudit.push(imgsNoAlt === 0
    ? { severity:'good', message:'All images have alt attributes' }
    : { severity:'warning', message:`${imgsNoAlt} image(s) missing alt attribute` });
  accessAudit.push(language
    ? { severity:'good', message:`Document language declared: "${language}"` }
    : { severity:'error', message:'Missing lang attribute on <html>' });

  // Performance audit
  const perfAudit = [];
  perfAudit.push(jsFiles.size <= 10
    ? { severity:'good', message:`${jsFiles.size} script file(s) — looks good` }
    : { severity:'warning', message:`${jsFiles.size} script files may slow page load` });
  perfAudit.push(cssFiles.size <= 6
    ? { severity:'good', message:`${cssFiles.size} stylesheet(s) — looks good` }
    : { severity:'warning', message:`${cssFiles.size} stylesheets — consider consolidating` });
  const sizeKb = Math.round(new Blob([html]).size / 1024);
  perfAudit.push(sizeKb <= 300
    ? { severity:'good', message:`HTML size: ${sizeKb} KB` }
    : { severity:'warning', message:`Large HTML: ${sizeKb} KB (ideal < 300 KB)` });

  // SSL — inferred from URL scheme only (no TLS from browser)
  const isHttps = requestedUrl.startsWith('https://');
  const sslInfo = {
    valid: isHttps,
    note: isHttps
      ? 'Site uses HTTPS — certificate details require server-side inspection'
      : 'Site is served over HTTP (not HTTPS)',
  };

  const MAX_SRC = 500_000;
  const htmlSource = html.length > MAX_SRC
    ? html.slice(0, MAX_SRC) + '\n\n<!-- truncated: source exceeded 500KB -->'
    : html;

  return {
    requestedUrl, finalUrl: proxy.finalUrl, httpStatus: proxy.status,
    title, metaDescription: metaDesc, canonicalUrl: canonical, metaRobots,
    charset, language, favicon, openGraph, twitterCard,
    redirectChain: [], // proxy follows redirects silently
    sslInfo, dns, registrarInfo: null,
    robotsTxt: null, sitemapXml: null, // fetched separately if needed
    internalLinks: [...intLinks], externalLinks: [...extLinks],
    cssFiles: [...cssFiles], jsFiles: [...jsFiles], images: [...images], fonts: [...fonts],
    formsCount, buttonsCount, tablesCount,
    headings, structuredData, jsonLd, technologies: techs, analyticsDetected: analytics,
    seoAudit, accessibilitySuggestions: accessAudit, performanceSuggestions: perfAudit,
    htmlSource,
  };
}

// ── Render all tabs ───────────────────────────────────────────
function render(s) {
  hideErr(); hideLoading();

  // ── Overview tab ──
  $('ov-url').textContent    = s.finalUrl;
  $('ov-status').textContent = s.httpStatus || '—';
  $('ov-status').className   = `badge ${s.httpStatus < 400 ? 'b-green' : 'b-red'}`;
  $('ov-title').textContent  = s.title || '(no title)';
  $('ov-desc').textContent   = s.metaDescription || '(none)';

  $('ov-kv').innerHTML = kvRows([
    ['Title',        s.title],
    ['Description',  s.metaDescription],
    ['Canonical URL',s.canonicalUrl, true],
    ['Meta Robots',  s.metaRobots],
    ['Charset',      s.charset],
    ['Language',     s.language],
    ['Favicon',      s.favicon, true],
    ['HTTP Status',  String(s.httpStatus)],
    ['Forms',        String(s.formsCount)],
    ['Buttons',      String(s.buttonsCount)],
    ['Tables',       String(s.tablesCount)],
    ['Technologies', s.technologies.join(', ') || null],
    ['Analytics',    s.analyticsDetected.join(', ') || null],
  ]);

  // SSL
  $('ssl-box').innerHTML = s.sslInfo.valid
    ? `<span class="badge b-green">🔒 HTTPS</span> <span style="color:var(--muted-l);font-size:13px;margin-left:8px">${esc(s.sslInfo.note)}</span>`
    : `<span class="badge b-amber">⚠ HTTP</span> <span style="color:var(--warn);font-size:13px;margin-left:8px">${esc(s.sslInfo.note)}</span>`;

  // Open Graph
  $('og-kv').innerHTML = s.openGraph.length
    ? `<table class="kv">${s.openGraph.map(({key,value}) => `<tr><td>${esc(key)}</td><td class="v-mono">${esc(value)}</td></tr>`).join('')}</table>`
    : '<div class="dns-nil">No Open Graph tags found</div>';

  // Twitter Card
  $('tw-kv').innerHTML = s.twitterCard.length
    ? `<table class="kv">${s.twitterCard.map(({key,value}) => `<tr><td>${esc(key)}</td><td class="v-mono">${esc(value)}</td></tr>`).join('')}</table>`
    : '<div class="dns-nil">No Twitter Card tags found</div>';

  // ── SEO tab ──
  $('seo-audit').innerHTML    = auditHtml(s.seoAudit);
  $('a11y-audit').innerHTML   = auditHtml(s.accessibilitySuggestions);
  $('perf-audit').innerHTML   = auditHtml(s.performanceSuggestions);

  // Headings
  const hRows = ['h1','h2','h3','h4','h5','h6'].flatMap(tag =>
    s.headings[tag].map(text => `<tr><td><span class="badge b-cyan">${tag.toUpperCase()}</span></td><td>${esc(text)}</td></tr>`)
  );
  $('headings-table').innerHTML = hRows.length
    ? hRows.join('')
    : '<tr><td colspan="2" style="color:var(--muted);font-size:13px">No headings found</td></tr>';

  // JSON-LD
  $('jsonld-box').textContent = s.jsonLd.join('\n\n') || '(none)';

  // ── DNS tab ──
  const d = s.dns;
  $('dns-all').innerHTML =
    dnsSection('A (IPv4)', d.a) + dnsSection('AAAA (IPv6)', d.aaaa) +
    dnsSection('MX (Mail)', d.mx) + dnsSection('NS (Nameserver)', d.ns) +
    dnsSection('TXT', d.txt) + dnsSection('CNAME', d.cname);

  // WHOIS link
  const domain = new URL(s.finalUrl).hostname;
  $('whois-link').href = `https://www.whois.com/whois/${encodeURIComponent(domain)}`;

  // Robots / Sitemap — fetch via proxy
  fetchAuxiliary(s.finalUrl, domain);

  // ── Links & Assets tab ──
  const linkHtml = (arr, max = 200) => arr.length
    ? `<div class="link-list">${arr.slice(0, max).map(u => `<a class="link-item" href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a>`).join('')}${arr.length > max ? `<div class="dns-nil">+${arr.length - max} more</div>` : ''}</div>`
    : '<div class="dns-nil">None found</div>';

  $('int-links').innerHTML = linkHtml(s.internalLinks);
  $('ext-links').innerHTML = linkHtml(s.externalLinks);
  $('css-files').innerHTML = linkHtml(s.cssFiles);
  $('js-files').innerHTML  = linkHtml(s.jsFiles);
  $('img-files').innerHTML = linkHtml(s.images);

  // Tech & analytics pills
  $('tech-pills').innerHTML = s.technologies.length
    ? s.technologies.map(t => `<span class="pill">${esc(t)}</span>`).join('')
    : '<span class="dns-nil">None detected</span>';
  $('analytics-pills').innerHTML = s.analyticsDetected.length
    ? s.analyticsDetected.map(a => `<span class="pill">${esc(a)}</span>`).join('')
    : '<span class="dns-nil">None detected</span>';

  // ── Source tab ──
  const pre = $('src-pre');
  pre.textContent = s.htmlSource;

  // Tab counts
  $('tc-int').textContent  = s.internalLinks.length;
  $('tc-ext').textContent  = s.externalLinks.length;
  $('tc-img').textContent  = s.images.length;
  $('tc-js').textContent   = s.jsFiles.length;
  $('tc-css').textContent  = s.cssFiles.length;

  $('results').classList.add('on');
  $('inspect-btn').disabled = false;
  $('inspect-btn').textContent = 'Inspect';
  setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// ── Fetch robots.txt / sitemap.xml via proxy ──────────────────
async function fetchAuxiliary(siteUrl, domain) {
  const base = new URL(siteUrl).origin;
  const fetchText = async url => {
    try {
      const r = await fetch(ALLORIGINS(url), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const j = await r.json();
      return j.contents || null;
    } catch { return null; }
  };
  const [robots, sitemap] = await Promise.all([
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/sitemap.xml`),
  ]);
  $('robots-box').textContent = robots || '(not found or blocked)';
  $('sitemap-box').textContent = sitemap || '(not found or blocked)';
  if (state) { state.robotsTxt = robots; state.sitemapXml = sitemap; }
}

// ── Loading / error ───────────────────────────────────────────
function showLoading() {
  $('results').classList.remove('on'); hideErr();
  $('inspect-btn').disabled = true;
  $('inspect-btn').innerHTML = '<span class="spin" style="width:13px;height:13px;border-width:1.5px"></span> Inspecting…';
}
function hideLoading() {
  $('inspect-btn').disabled = false;
  $('inspect-btn').textContent = 'Inspect';
}
function showErr(msg) {
  hideLoading();
  const el = $('err-box');
  el.innerHTML = `<span>⚠</span><span>${esc(msg)}</span>`;
  el.style.display = 'flex';
}
function hideErr() { $('err-box').style.display = 'none'; }
