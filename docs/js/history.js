// ============================================================
// history.js — History & Favorites page logic
// ============================================================

import { esc, getHistory, removeHistory, toggleFav, clearHistory, timeAgo, markActiveNav } from './utils.js';

const $ = id => document.getElementById(id);
let filter = 'all';

markActiveNav();
render();

// ── Tab filter ───────────────────────────────────────────────
document.querySelectorAll('.hf-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hf-tab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    filter = btn.dataset.f;
    render();
  });
});

// ── Clear all ────────────────────────────────────────────────
$('clear-btn')?.addEventListener('click', () => {
  if (confirm('Clear all history and favorites?')) { clearHistory(); render(); }
});

// ── Render ───────────────────────────────────────────────────
function render() {
  let items = getHistory();
  if (filter === 'ip')      items = items.filter(h => h.type === 'ip');
  if (filter === 'website') items = items.filter(h => h.type === 'website');
  if (filter === 'fav')     items = items.filter(h => h.fav);

  const list = $('hist-list');

  if (!items.length) {
    list.innerHTML = `<div class="empty"><div class="ei">${filter === 'fav' ? '⭐' : '🕐'}</div>
      <p>${filter === 'fav' ? 'No favorites yet — star items from the IP or Website pages' : 'No history yet — start a lookup to see it here'}</p></div>`;
    return;
  }

  list.innerHTML = items.map(h => {
    const icon = h.type === 'ip' ? '🌐' : '🔍';
    const iconBg = h.type === 'ip' ? 'ci-cyan' : 'ci-purple';
    const link = h.type === 'ip'
      ? `ip.html?ip=${encodeURIComponent(h.query)}`
      : `website.html?url=${encodeURIComponent(h.query)}`;
    return `
    <div class="hist-item" id="h-${h.id}">
      <div class="hi-icon ${iconBg}">${icon}</div>
      <div class="hi-body">
        <div class="hi-q" title="${esc(h.query)}">${esc(h.query)}</div>
        <div class="hi-meta">${esc(h.type === 'ip' ? 'IP Lookup' : 'Website')} · ${h.summary ? esc(h.summary) + ' · ' : ''}${timeAgo(h.ts)}</div>
      </div>
      <div class="hi-acts">
        <button class="btn btn-sm btn-s fav-btn" data-id="${h.id}" title="${h.fav ? 'Unfavorite' : 'Favorite'}">${h.fav ? '⭐' : '☆'}</button>
        <a class="btn btn-sm btn-p" href="${link}">Re-run</a>
        <button class="btn btn-sm btn-g del-btn" data-id="${h.id}" title="Remove">✕</button>
      </div>
    </div>`;
  }).join('');

  // Favorite toggles
  list.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.id;
      const isFav = toggleFav(id);
      btn.textContent = isFav ? '⭐' : '☆';
      btn.title = isFav ? 'Unfavorite' : 'Favorite';
    });
  });

  // Delete buttons
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeHistory(+btn.dataset.id);
      document.getElementById(`h-${btn.dataset.id}`)?.remove();
      if (!$('hist-list').children.length) render();
    });
  });
}
