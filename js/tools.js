// ============================================================
// tools.js — Network Tools page logic
// DNS propagation: Google DoH + Cloudflare DoH
// Traceroute: HackerTarget API (free, rate-limited)
// Ping: HTTPS latency approximation (no raw ICMP in browser)
// Port scan: best-effort browser probe (common web ports only)
// WHOIS: RDAP (rdap.org) — works for domains & IPs
// CIDR / Subnet: pure client-side IPv4 math
// MAC vendor: api.macvendors.com via CORS proxy
// ============================================================

import { toast, esc, markActiveNav, initTabs, kvRows, validIp,
         ipToLong, longToIp, prefixToMask, maskToPrefix, isPrivateIp4, ipClass4 } from './utils.js';

const $ = id => document.getElementById(id);
markActiveNav();

// Tabs live in #tools-tabs, panels are direct children of <main> (not nested) — wire manually.
document.querySelectorAll('#tools-tabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tools-tabs .tab').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(`t-${btn.dataset.tab}`)?.classList.add('on');
  });
});
void initTabs; // kept imported for parity with other pages; unused here since panels aren't nested under the tab bar

// ── DNS Propagation Checker ─────────────────────────────────
const RESOLVERS = [
  { name: 'Google',     fn: dohGoogle },
  { name: 'Cloudflare', fn: dohCloudflare },
];

async function dohGoogle(name, type) {
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  return (d.Answer || []).map(a => a.data);
}
async function dohCloudflare(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000)
  });
  const d = await r.json();
  return (d.Answer || []).map(a => a.data);
}

$('dp-btn')?.addEventListener('click', async () => {
  const domain = $('dp-domain').value.trim().replace(/^https?:\/\//i, '').split('/')[0];
  const type = $('dp-type').value;
  if (!domain) { toast('Enter a domain', 'warn'); return; }
  const box = $('dp-results');
  box.innerHTML = '<p class="note">Querying resolvers…</p>';
  const results = await Promise.all(RESOLVERS.map(async r => {
    try { return { name: r.name, records: await r.fn(domain, type), ok: true }; }
    catch { return { name: r.name, records: [], ok: false }; }
  }));
  const sets = results.filter(r => r.ok).map(r => JSON.stringify([...r.records].sort()));
  const allMatch = sets.length > 1 && sets.every(s => s === sets[0]);
  box.innerHTML = `
    <div class="note" style="margin-bottom:10px">
      ${sets.length > 1 ? (allMatch ? '<span style="color:var(--success)">✓ All resolvers agree — fully propagated</span>' : '<span style="color:var(--warn)">⚠ Resolvers disagree — propagation in progress</span>') : ''}
    </div>
    <div class="g2">
      ${results.map(r => `
        <div class="card" style="padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:13.5px">${esc(r.name)}</b>
            <span class="badge ${r.ok ? 'b-green' : 'b-red'}">${r.ok ? 'OK' : 'Failed'}</span>
          </div>
          ${r.records.length ? r.records.map(x => `<div class="dns-rec">${esc(x)}</div>`).join('') : '<div class="dns-nil">No records</div>'}
        </div>`).join('')}
    </div>`;
});

// ── Traceroute (HackerTarget) ───────────────────────────────
$('tr-btn')?.addEventListener('click', async () => {
  const host = $('tr-host').value.trim().replace(/^https?:\/\//i, '').split('/')[0];
  if (!host) { toast('Enter a host', 'warn'); return; }
  const out = $('tr-out');
  out.textContent = 'Running traceroute… this can take up to 30s.';
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.hackertarget.com/traceroute/?q=${host}`)}`, { signal: AbortSignal.timeout(35000) });
    const text = (await r.text()).trim();
    out.textContent = text || 'No output returned.';
    if (/api count exceeded/i.test(text)) toast('HackerTarget free-tier daily limit reached', 'warn');
  } catch {
    out.textContent = 'Traceroute failed — the free API may be rate-limited. Try again later.';
  }
});

// ── Ping test (HTTPS latency) ───────────────────────────────
$('pg-btn')?.addEventListener('click', async () => {
  let host = $('pg-host').value.trim();
  if (!host) { toast('Enter a host', 'warn'); return; }
  host = host.replace(/^https?:\/\//i, '').split('/')[0];
  const url = `https://${host}/`;
  const box = $('pg-results');
  box.innerHTML = '<p class="note">Pinging…</p>';
  const times = [];
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) });
      times.push(performance.now() - t0);
    } catch { times.push(null); }
    await new Promise(r => setTimeout(r, 150));
  }
  const ok = times.filter(t => t != null);
  if (!ok.length) {
    box.innerHTML = '<p class="note">Host unreachable, blocked by CORS/mixed-content, or timed out.</p>';
    return;
  }
  const min = Math.min(...ok), max = Math.max(...ok), avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  const loss = Math.round((1 - ok.length / times.length) * 100);
  box.innerHTML = `
    <table class="kv">${kvRows([
      ['Host', host],
      ['Packets', `${ok.length}/${times.length} responded (${loss}% loss)`],
      ['Min', `${min.toFixed(0)} ms`],
      ['Avg', `${avg.toFixed(0)} ms`],
      ['Max', `${max.toFixed(0)} ms`],
    ])}</table>
    <p class="note" style="margin-top:10px">This is HTTPS round-trip time, not ICMP ping — browsers cannot send raw ICMP packets.</p>`;
});

// ── Port scanner (best-effort) ──────────────────────────────
const SCAN_PORTS = [80, 443, 8080, 8443, 3000, 5000, 8000, 8888, 8081, 9000];
$('ps-consent')?.addEventListener('change', e => {
  $('ps-host').disabled = !e.target.checked;
  $('ps-btn').disabled = !e.target.checked;
});
$('ps-btn')?.addEventListener('click', async () => {
  let host = $('ps-host').value.trim();
  if (!host) { toast('Enter a host', 'warn'); return; }
  host = host.replace(/^https?:\/\//i, '').split('/')[0];
  const box = $('ps-results');
  box.innerHTML = '<p class="note">Probing common ports…</p>';
  const rows = await Promise.all(SCAN_PORTS.map(async port => {
    const t0 = performance.now();
    try {
      await fetch(`https://${host}:${port}/`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(2500) });
      return { port, state: 'open/reachable', ms: performance.now() - t0 };
    } catch {
      const dt = performance.now() - t0;
      return { port, state: dt < 400 ? 'closed/refused' : 'filtered/no-response', ms: dt };
    }
  }));
  box.innerHTML = `
    <table class="kv"><tbody>
      ${rows.map(r => `<tr><td>Port ${r.port}</td><td>
        <span class="badge ${r.state.startsWith('open') ? 'b-green' : r.state.startsWith('closed') ? 'b-red' : 'b-amber'}">${esc(r.state)}</span>
        <span class="mono" style="color:var(--muted);font-size:11px;margin-left:8px">${r.ms.toFixed(0)}ms</span>
      </td></tr>`).join('')}
    </tbody></table>
    <p class="note" style="margin-top:10px">Browser-based results are heuristic (based on connection timing), not a reliable substitute for nmap. Ports outside this list are blocked by the browser itself for security.</p>`;
});

// ── WHOIS / RDAP ─────────────────────────────────────────────
$('wh-btn')?.addEventListener('click', async () => {
  let q = $('wh-query').value.trim();
  if (!q) { toast('Enter a domain or IP', 'warn'); return; }
  q = q.replace(/^https?:\/\//i, '').split('/')[0];
  const box = $('wh-results');
  box.innerHTML = '<p class="note">Querying RDAP…</p>';
  const isIp = validIp(q);
  const url = isIp ? `https://rdap.org/ip/${encodeURIComponent(q)}` : `https://rdap.org/domain/${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status === 404 ? 'Not found in RDAP' : `HTTP ${r.status}`);
    const d = await r.json();
    const reg = (d.events || []).find(e => /registration/i.test(e.eventAction))?.eventDate;
    const exp = (d.events || []).find(e => /expiration/i.test(e.eventAction))?.eventDate;
    const changed = (d.events || []).find(e => /last changed/i.test(e.eventAction))?.eventDate;
    const ns = (d.nameservers || []).map(n => n.ldhName).filter(Boolean);
    const org = d.entities?.[0]?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3];
    box.innerHTML = `
      <table class="kv">${kvRows([
        [isIp ? 'Network Name' : 'Domain', d.name || d.ldhName || q],
        ['Handle', d.handle, true],
        ['Status', (d.status || []).join(', ')],
        isIp ? ['Range', d.startAddress && d.endAddress ? `${d.startAddress} – ${d.endAddress}` : null, true] : ['Organization', org],
        ['Country', d.country],
        ['Registered', reg ? new Date(reg).toLocaleDateString() : null],
        ['Expires', exp ? new Date(exp).toLocaleDateString() : null],
        ['Last Changed', changed ? new Date(changed).toLocaleDateString() : null],
      ])}</table>
      ${ns.length ? `<p class="sec-lbl" style="margin-top:14px">Nameservers</p><div class="pills gap">${ns.map(n => `<span class="pill">${esc(n)}</span>`).join('')}</div>` : ''}
      <p style="margin-top:12px"><a class="btn btn-s btn-sm" href="https://www.whois.com/whois/${encodeURIComponent(q)}" target="_blank" rel="noreferrer">🔍 Full text WHOIS →</a></p>`;
  } catch (e) {
    box.innerHTML = `<p class="note">RDAP lookup failed: ${esc(e.message)}. <a href="https://www.whois.com/whois/${encodeURIComponent(q)}" target="_blank" rel="noreferrer">Try full WHOIS →</a></p>`;
  }
});

// ── CIDR calculator ──────────────────────────────────────────
$('cidr-btn')?.addEventListener('click', () => {
  const raw = $('cidr-input').value.trim();
  const m = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  const box = $('cidr-results');
  if (!m) { box.innerHTML = '<p class="note">Enter a valid CIDR, e.g. 192.168.1.0/24</p>'; return; }
  const [, ip, pStr] = m;
  const prefix = +pStr;
  if (prefix < 0 || prefix > 32 || ipToLong(ip) == null) { box.innerHTML = '<p class="note">Invalid IP or prefix.</p>'; return; }
  box.innerHTML = renderCidr(ip, prefix);
});

$('sn-btn')?.addEventListener('click', () => {
  const ip = $('sn-ip').value.trim();
  let maskRaw = $('sn-mask').value.trim();
  const box = $('sn-results');
  if (ipToLong(ip) == null) { box.innerHTML = '<p class="note">Invalid IP address.</p>'; return; }
  let prefix;
  if (maskRaw.startsWith('/')) prefix = +maskRaw.slice(1);
  else if (/^\d{1,2}$/.test(maskRaw)) prefix = +maskRaw;
  else prefix = maskToPrefix(maskRaw);
  if (prefix == null || prefix < 0 || prefix > 32) { box.innerHTML = '<p class="note">Invalid subnet mask — use dotted (255.255.255.0) or CIDR (/24).</p>'; return; }
  box.innerHTML = renderCidr(ip, prefix);
});

function renderCidr(ip, prefix) {
  const ipLong = ipToLong(ip);
  const maskLong = prefixToMask(prefix);
  const network = (ipLong & maskLong) >>> 0;
  const broadcast = (network | (~maskLong >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const usable = prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2;
  const first = prefix >= 31 ? network : (network + 1) >>> 0;
  const last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  return `<table class="kv">${kvRows([
    ['Network Address', longToIp(network), true],
    ['Broadcast Address', prefix >= 31 ? 'N/A' : longToIp(broadcast), true],
    ['Subnet Mask', longToIp(maskLong), true],
    ['Wildcard Mask', longToIp(~maskLong >>> 0), true],
    ['CIDR Prefix', `/${prefix}`],
    ['First Usable Host', longToIp(first), true],
    ['Last Usable Host', longToIp(last), true],
    ['Total Addresses', total.toLocaleString()],
    ['Usable Hosts', usable.toLocaleString()],
    ['IP Class', ipClass4(ip)],
    ['Private (RFC1918)', isPrivateIp4(ip) ? 'Yes' : 'No'],
  ])}</table>`;
}

// ── MAC vendor lookup ─────────────────────────────────────────
$('mv-btn')?.addEventListener('click', async () => {
  const raw = $('mv-mac').value.trim();
  const box = $('mv-results');
  const mac = raw.replace(/[^0-9a-fA-F]/g, '');
  if (mac.length < 6) { box.innerHTML = '<p class="note">Enter a valid MAC address, e.g. 3C:22:FB:00:00:00</p>'; return; }
  const prefix = mac.slice(0, 6).match(/.{2}/g).join(':');
  box.innerHTML = '<p class="note">Looking up vendor…</p>';
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.macvendors.com/${prefix}`)}`, { signal: AbortSignal.timeout(10000) });
    const text = (await r.text()).trim();
    if (!text || /not found|error|too many requests/i.test(text)) {
      box.innerHTML = `<p class="note">${esc(text || 'Vendor not found for this MAC prefix.')}</p>`;
    } else {
      box.innerHTML = `<table class="kv">${kvRows([
        ['MAC Prefix (OUI)', prefix.toUpperCase(), true],
        ['Vendor', text],
      ])}</table>`;
    }
  } catch {
    box.innerHTML = '<p class="note">Lookup failed or rate-limited. Try again shortly.</p>';
  }
});
