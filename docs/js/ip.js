// ============================================================
// ip.js — IP lookup page logic
// APIs used (all free, HTTPS, CORS-enabled, no key required):
//   • https://api64.ipify.org  — detect own public IP
//   • https://ipwho.is/{ip}   — geolocation, ISP, ASN, network
// WHOIS & reverse DNS are server-side only; links provided.
// ============================================================

import { toast, copy, dlJson, esc, addHistory, validIp, ipVer, flag,
         markActiveNav, kvRows, dnsSection, auditHtml } from './utils.js';

const IPIFY  = 'https://api64.ipify.org?format=json';
const IPWHO  = ip => `https://ipwho.is/${encodeURIComponent(ip)}`;

// ── DOM refs ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const inputEl  = $('ip-input');
const lookupBtn= $('lookup-btn');
const ownBtn   = $('own-btn');
const resultsEl= $('results');
const errEl    = $('err-box');
const loadEl   = $('loading');

let data = null;

markActiveNav();

// ── Auto-lookup from URL ?ip= ─────────────────────────────────
const urlIp = new URLSearchParams(location.search).get('ip');
if (urlIp) { inputEl.value = urlIp; performLookup(urlIp); }

// ── Events ───────────────────────────────────────────────────
ownBtn?.addEventListener('click', async () => {
  ownBtn.disabled = true;
  ownBtn.innerHTML = '<span class="spin" style="width:13px;height:13px;border-width:1.5px"></span>';
  try {
    const r = await fetch(IPIFY);
    const { ip } = await r.json();
    inputEl.value = ip;
    await performLookup(ip);
  } catch { toast('Could not detect your IP', 'error'); }
  finally { ownBtn.disabled = false; ownBtn.innerHTML = '📍 My IP'; }
});

lookupBtn?.addEventListener('click', handleForm);
inputEl?.addEventListener('keydown', e => { if (e.key === 'Enter') handleForm(); });

$('copy-json')?.addEventListener('click', () => data && copy(JSON.stringify(data, null, 2)));
$('dl-json')?.addEventListener('click', () => data && dlJson(data, `ip-${data.ip}.json`));

// ── Form handler ──────────────────────────────────────────────
function handleForm() {
  const raw = inputEl.value.trim();
  if (!raw) { toast('Enter an IP address', 'warn'); return; }
  if (!validIp(raw)) { toast('Invalid IPv4 or IPv6 address', 'error'); return; }
  performLookup(raw);
}

// ── Core lookup ───────────────────────────────────────────────
async function performLookup(ip) {
  showLoading();
  try {
    const res = await fetch(IPWHO(ip), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.message || 'Lookup failed');
    data = mapData(ip, d);
    render(data);
    addHistory({ type: 'ip', query: ip, summary: buildSummary(data) });
  } catch (e) {
    showErr(e.message || 'Could not look up this IP address');
  }
}

// ── Map ipwho.is → our schema ─────────────────────────────────
function mapData(ip, d) {
  return {
    ip: d.ip || ip,
    ipVersion: d.type || ipVer(ip),
    isp: d.connection?.isp ?? null,
    asn: d.connection?.asn ? `AS${d.connection.asn}` : null,
    asnName: d.connection?.org ?? null,
    domain: d.connection?.domain ?? null,
    continent: d.continent ?? null,
    country: d.country ?? null,
    countryCode: d.country_code ?? null,
    region: d.region ?? null,
    city: d.city ?? null,
    postalCode: d.postal ?? null,
    timezone: d.timezone?.id ?? null,
    utcOffset: d.timezone?.utc ?? null,
    currentTime: d.timezone?.current_time ?? null,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    mapsUrl: d.latitude && d.longitude ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}` : null,
    callingCode: d.calling_code ?? null,
    capital: d.capital ?? null,
    borders: d.borders ?? null,
    isEu: d.is_eu ?? null,
    flag: d.flag?.emoji ?? flag(d.country_code),
  };
}

function buildSummary(d) {
  return [d.city, d.country].filter(Boolean).join(', ') || d.ip;
}

// ── Render ───────────────────────────────────────────────────
function render(d) {
  hideErr(); hideLoading();

  // IP hero card
  $('res-ip').textContent   = d.ip;
  $('res-ver').textContent  = d.ipVersion || '—';
  $('res-flag').textContent = d.flag;
  $('res-loc').textContent  = [d.city, d.region, d.country].filter(Boolean).join(', ') || '—';

  const mapBtn = $('map-btn');
  if (d.mapsUrl) { mapBtn.href = d.mapsUrl; mapBtn.style.display = 'inline-flex'; }
  else mapBtn.style.display = 'none';

  // Geolocation card
  $('geo-kv').innerHTML = kvRows([
    ['Country',      d.country ? `${flag(d.countryCode)} ${d.country}${d.countryCode ? ` (${d.countryCode})` : ''}` : null],
    ['Continent',    d.continent],
    ['Region',       d.region],
    ['City',         d.city],
    ['Postal Code',  d.postalCode],
    ['Capital',      d.capital],
    ['Calling Code', d.callingCode ? `+${d.callingCode}` : null],
    ['EU Member',    d.isEu == null ? null : d.isEu ? 'Yes' : 'No'],
    ['Borders',      d.borders],
  ]);

  // Network card
  $('net-kv').innerHTML = kvRows([
    ['ISP',            d.isp, true],
    ['ASN',            d.asn, true],
    ['Organization',   d.asnName, true],
    ['Domain',         d.domain, true],
    ['IP Version',     d.ipVersion],
    ['Timezone',       d.timezone],
    ['UTC Offset',     d.utcOffset],
    ['Current Time',   d.currentTime],
    ['Coordinates',    d.latitude != null ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}` : null, true],
  ]);

  // WHOIS — link to external service
  $('whois-link').href = `https://www.whois.com/whois/${encodeURIComponent(d.ip)}`;
  $('rdns-link').href  = `https://mxtoolbox.com/ReverseLookup.aspx?domain=${encodeURIComponent(d.ip)}`;

  resultsEl.classList.add('on');
  lookupBtn.disabled = false;
  lookupBtn.textContent = 'Look Up';
  setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// ── State helpers ─────────────────────────────────────────────
function showLoading() {
  resultsEl.classList.remove('on'); hideErr();
  lookupBtn.disabled = true;
  lookupBtn.innerHTML = '<span class="spin" style="width:13px;height:13px;border-width:1.5px"></span> Looking up…';
}
function hideLoading() {
  lookupBtn.disabled = false; lookupBtn.textContent = 'Look Up';
}
function showErr(msg) {
  hideLoading();
  errEl.innerHTML = `<span>⚠</span><span>${esc(msg)}</span>`;
  errEl.style.display = 'flex';
}
function hideErr() { errEl.style.display = 'none'; }
