// ============================================================
// ip.js — IP lookup page logic
// APIs used (all free, HTTPS, CORS-enabled, no key required):
//   • https://api64.ipify.org  — detect own public IP
//   • https://ipwho.is/{ip}   — geolocation, ISP, ASN, network
// WHOIS & reverse DNS are server-side only; links provided.
// ============================================================

import { toast, copy, dlJson, esc, addHistory, validIp, ipVer, flag,
         markActiveNav, kvRows, dnsSection, auditHtml, ptrName } from './utils.js';

const IPIFY  = 'https://api64.ipify.org?format=json';
const IPWHO  = ip => `https://ipwho.is/${encodeURIComponent(ip)}`;
const DOH    = (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
const RDAP_IP  = ip => `https://rdap.org/ip/${encodeURIComponent(ip)}`;
const REVIP    = ip => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`)}`;

let map = null, marker = null;

// ── DOM refs ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const inputEl  = $('ip-input');
const lookupBtn= $('lookup-btn');
const ownBtn   = $('own-btn');
const resultsEl= $('results');
const errEl    = $('err-box');

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

  // Map
  renderMap(d.latitude, d.longitude, d.city, d.country);

  // Reverse DNS (automatic)
  loadReverseDns(d.ip);

  // WHOIS via RDAP (automatic, best-effort)
  loadWhoisRdap(d.ip);

  // Reverse IP lookup — on demand (rate-limited free API)
  $('revip-box').innerHTML = '';
  $('revip-btn').onclick = () => loadReverseIp(d.ip);

  resultsEl.classList.add('on');
  lookupBtn.disabled = false;
  lookupBtn.textContent = 'Look Up';
  setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// ── Map ──────────────────────────────────────────────────────
function renderMap(lat, lon, city, country) {
  const box = $('geo-map');
  if (lat == null || lon == null || typeof L === 'undefined') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  if (!map) {
    map = L.map('geo-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  }
  map.setView([lat, lon], 10);
  if (marker) marker.remove();
  marker = L.marker([lat, lon]).addTo(map).bindPopup([city, country].filter(Boolean).join(', ') || 'Location').openPopup();
  setTimeout(() => map.invalidateSize(), 150);
}

// ── Reverse DNS via Google DoH PTR query ───────────────────────
async function loadReverseDns(ip) {
  const box = $('rdns-box');
  const name = ptrName(ip);
  if (!name) { box.innerHTML = '<p class="note">Reverse DNS not supported for this address.</p>'; return; }
  box.innerHTML = '<p class="note">Looking up PTR record…</p>';
  try {
    const r = await fetch(DOH(name, 'PTR'), { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const hosts = (d.Answer || []).filter(a => a.type === 12).map(a => a.data.replace(/\.$/, ''));
    box.innerHTML = hosts.length
      ? kvHtml('Hostname', hosts.join('<br>'))
      : '<p class="note">No PTR record found for this IP.</p>';
  } catch {
    box.innerHTML = '<p class="note">Could not resolve PTR record.</p>';
  }
}

// ── Reverse IP lookup (domains sharing this IP) ────────────────
async function loadReverseIp(ip) {
  const box = $('revip-box');
  const btn = $('revip-btn');
  btn.disabled = true; btn.textContent = 'Looking up…';
  box.innerHTML = '';
  try {
    const r = await fetch(REVIP(ip), { signal: AbortSignal.timeout(12000) });
    const text = (await r.text()).trim();
    if (!text || /error|no dns|api count exceeded/i.test(text)) {
      box.innerHTML = `<p class="note">${esc(text || 'No other domains found on this IP, or lookup limit reached.')}</p>`;
    } else {
      const domains = text.split('\n').map(s => s.trim()).filter(Boolean);
      box.innerHTML = `<div class="pills gap">${domains.slice(0, 60).map(d => `<span class="pill">${esc(d)}</span>`).join('')}</div>` +
        (domains.length > 60 ? `<p class="note" style="margin-top:8px">+${domains.length - 60} more</p>` : '');
    }
  } catch {
    box.innerHTML = '<p class="note">Reverse IP lookup failed or rate-limited. Try again later.</p>';
  } finally { btn.disabled = false; btn.textContent = 'Find Domains on This IP'; }
}

// ── WHOIS via RDAP ───────────────────────────────────────────
async function loadWhoisRdap(ip) {
  const box = $('whois-box');
  box.innerHTML = '<p class="note">Fetching registration data…</p>';
  try {
    const r = await fetch(RDAP_IP(ip), { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('not found');
    const d = await r.json();
    const reg = (d.events || []).find(e => e.eventAction === 'registration')?.eventDate;
    const changed = (d.events || []).find(e => e.eventAction === 'last changed')?.eventDate;
    const org = d.entities?.[0]?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || d.name;
    box.innerHTML = `<table class="kv">${kvRows([
      ['Network Name', d.name],
      ['Organization', org],
      ['Range',        d.startAddress && d.endAddress ? `${d.startAddress} – ${d.endAddress}` : null, true],
      ['CIDR',          (d.cidr0_cidrs || []).map(c => `${c.v4prefix || c.v6prefix}/${c.length}`).join(', ') || null, true],
      ['Country',      d.country],
      ['Type',         d.type],
      ['Registered',   reg ? new Date(reg).toLocaleDateString() : null],
      ['Last Changed', changed ? new Date(changed).toLocaleDateString() : null],
    ])}</table>`;
  } catch {
    box.innerHTML = '<p class="note">RDAP lookup unavailable for this address. Use "Full WHOIS" below.</p>';
  }
}

function kvHtml(k, v) {
  return `<table class="kv"><tr><td>${esc(k)}</td><td>${v}</td></tr></table>`;
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
