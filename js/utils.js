// ============================================================
// utils.js — shared helpers for WebIP static site
// ============================================================

const HIST_KEY = 'webip_history';
const MAX_HIST = 100;

// ── Toasts ──────────────────────────────────────────────────
export function toast(msg, type = 'info', ms = 3000) {
  let c = document.getElementById('toasts');
  if (!c) { c = Object.assign(document.createElement('div'), { id: 'toasts' }); document.body.appendChild(c); }
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.cssText = 'opacity:0;transform:translateX(100%);transition:.2s ease'; setTimeout(() => el.remove(), 210); }, ms);
}

// ── Clipboard ────────────────────────────────────────────────
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied!', 'success', 1800); return true; }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); document.body.removeChild(t);
    if (ok) toast('Copied!', 'success', 1800); return ok;
  }
}

// ── Download JSON ────────────────────────────────────────────
export function dlJson(data, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

// ── HTML escape ──────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── History ──────────────────────────────────────────────────
export function getHistory() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } }

export function addHistory(entry) {
  const h = getHistory().filter(x => !(x.type === entry.type && x.query === entry.query));
  h.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString(), fav: false });
  localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, MAX_HIST)));
}

export function removeHistory(id) {
  localStorage.setItem(HIST_KEY, JSON.stringify(getHistory().filter(h => h.id !== id)));
}

export function toggleFav(id) {
  const h = getHistory().map(x => x.id === id ? { ...x, fav: !x.fav } : x);
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
  return h.find(x => x.id === id)?.fav;
}

export function clearHistory() { localStorage.removeItem(HIST_KEY); }

// ── Time ─────────────────────────────────────────────────────
export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── IP validation ────────────────────────────────────────────
export function validIp(ip) {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (v4.test(ip)) return ip.split('.').every(n => +n <= 255);
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
}

export function ipVer(ip) { return ip.includes(':') ? 'IPv6' : 'IPv4'; }

// ── Country flag ─────────────────────────────────────────────
export function flag(code) {
  if (!code || code.length !== 2) return '🌐';
  const o = 0x1F1E6 - 65;
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o) +
         String.fromCodePoint(code.toUpperCase().charCodeAt(1) + o);
}

// ── URL normalization ────────────────────────────────────────
export function normalUrl(raw) {
  let u = raw.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { new URL(u); return u; } catch { return null; }
}

// ── Active nav ───────────────────────────────────────────────
export function markActiveNav() {
  const p = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    const h = a.getAttribute('href');
    a.classList.toggle('active', h === p || (h === 'index.html' && (p === '' || p === 'index.html')));
  });
}

// ── Tab system ───────────────────────────────────────────────
export function initTabs(root) {
  const el = typeof root === 'string' ? document.querySelector(root) : root;
  if (!el) return;
  el.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
      el.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('on'));
      btn.classList.add('on');
      const panel = el.querySelector(`#t-${btn.dataset.tab}`);
      if (panel) panel.classList.add('on');
    });
  });
}

// ── Copy button helper ───────────────────────────────────────
export function setupCopyBtn(btn, getValue) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (await copy(getValue())) {
      btn.textContent = 'Copied!'; btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 2000);
    }
  });
}

// ── Render KV table rows ─────────────────────────────────────
export function kvRows(pairs) {
  return pairs.map(([k, v, mono]) => `<tr>
    <td>${esc(k)}</td>
    <td ${mono ? 'class="v-mono"' : ''}>${v == null || v === '' ? '<span style="color:var(--muted)">—</span>' : esc(v)}</td>
  </tr>`).join('');
}

// ── Audit items ──────────────────────────────────────────────
export function auditHtml(items) {
  if (!items || !items.length) return '<div class="dns-nil">No audit data</div>';
  const ic = { good: '✓', warning: '⚠', error: '✕' };
  return `<div class="audit-list">${items.map(a => `
    <div class="ai ${a.severity}">
      <span class="ai-ic">${ic[a.severity] || '•'}</span>
      <span>${esc(a.message)}</span>
    </div>`).join('')}</div>`;
}

// ── DNS record list ──────────────────────────────────────────
export function dnsSection(label, records) {
  const recs = records && records.length
    ? records.map(r => `<div class="dns-rec">${esc(r)}</div>`).join('')
    : '<div class="dns-nil">No records found</div>';
  return `<div class="dns-sec"><h4>${label}</h4><div class="dns-recs">${recs}</div></div>`;
}

// ── IPv4 <-> 32-bit integer ────────────────────────────────────
export function ipToLong(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => isNaN(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
export function longToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}
export function prefixToMask(p) {
  return p <= 0 ? 0 : ((0xFFFFFFFF << (32 - p)) >>> 0);
}
export function maskToPrefix(mask) {
  const n = ipToLong(mask);
  if (n == null) return null;
  let bits = 0, x = n;
  for (let i = 31; i >= 0; i--) { if ((x >>> i) & 1) bits++; else break; }
  // verify contiguous mask
  return (prefixToMask(bits) === n) ? bits : null;
}
export function isPrivateIp4(ip) {
  const n = ipToLong(ip);
  if (n == null) return false;
  const ranges = [
    ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['100.64.0.0', 10],
  ];
  return ranges.some(([base, p]) => {
    const m = prefixToMask(p);
    return (n & m) === (ipToLong(base) & m);
  });
}
export function ipClass4(ip) {
  const first = +ip.split('.')[0];
  if (isNaN(first)) return '—';
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D (Multicast)';
  return 'E (Reserved)';
}

// ── Reverse-DNS PTR name builder ──────────────────────────────
export function ptrName(ip) {
  if (ip.includes(':')) {
    // IPv6 → expand and reverse nibbles
    const full = expandIPv6(ip);
    if (!full) return null;
    const nibbles = full.replace(/:/g, '').split('').reverse().join('.');
    return `${nibbles}.ip6.arpa`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts.reverse().join('.')}.in-addr.arpa`;
}
export function expandIPv6(ip) {
  try {
    let [head, tail] = ip.split('::');
    let headParts = head ? head.split(':') : [];
    let tailParts = tail ? tail.split(':') : [];
    if (ip.includes('::')) {
      const missing = 8 - headParts.length - tailParts.length;
      headParts = [...headParts, ...Array(missing).fill('0')];
    } else {
      headParts = ip.split(':');
      if (headParts.length !== 8) return null;
    }
    const all = [...headParts, ...tailParts].map(p => p.padStart(4, '0'));
    return all.length === 8 ? all.join(':') : null;
  } catch { return null; }
}
