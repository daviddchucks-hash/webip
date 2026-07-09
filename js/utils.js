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
