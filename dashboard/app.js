/* Token Radar — dashboard engine */
const RADAR = window.RADAR;
if (!RADAR) throw new Error('data.js not loaded');

const FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const FMT_PCT = new Intl.NumberFormat('en-US', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
const FMT_NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

let rows = [...RADAR.rows];
let view = 'board';
let selectedSlug = null;
let filterText = '';
let sortKey = 'rank';
let sortDir = 1;

const main = document.getElementById('board');

function render() {
  main.innerHTML = '';
  main.className = 'shell';
  main.append(
    renderTop(),
    renderLede(),
    renderScoreBars(),
    renderControls(),
    view === 'live' ? renderLive() : renderTable(),
    view === 'detail' && selectedSlug ? renderDetail() : '',
    renderModel(),
    renderFooter(),
  );
}

/* --- top --- */
function renderTop() {
  const el = ce('div', 'top');
  el.innerHTML = `<div class="brand"><div class="mark"></div><span class="brand-name">Token Radar</span></div>
  <div class="top-meta">
    <span><span class="dot"></span> ${RADAR.board_size} pre-token ranked</span>
    <span><span class="dot amber"></span> ${RADAR.live_size} live compared</span>
    <span>${RADAR.as_of}</span>
  </div>`;
  return el;
}

/* --- lede --- */
function renderLede() {
  const el = ce('div', 'lede');
  el.innerHTML = `<div>
    <h1>Pre-Token Protocols Ranked by Implied Launch Value</h1>
    <p>${RADAR.board_size} protocols with no token yet, scored from TVL, 7-day growth, and protocol age under model <b>${RADAR.model_version}</b>. The ${RADAR.early_size} below the $${FMT_NUM.format(RADAR.floor_usd)} watchlist floor are the radar's early finds. Use the board to spot which protocols are worth farming before they launch a token.</p>
  </div>
  <div class="facts">
    <div class="fact"><b>${RADAR.board_size}</b><span>Pre-Token Rows</span></div>
    <div class="fact"><b>${RADAR.early_size}</b><span>Early Radar</span></div>
    <div class="fact"><b>${RADAR.watchlist_size}</b><span>Watchlist Floor</span></div>
    <div class="fact"><b>${FMT.format(rows[0]?.implied_value_usd ?? 0)}</b><span>Top Implied</span></div>
    <div class="fact"><b>${RADAR.live_size}</b><span>Live Comps</span></div>
  </div>`;
  return el;
}

/* --- score bars --- */
function renderScoreBars() {
  const top = rows.slice(0, 5);
  const max = top[0]?.implied_value_usd || 1;
  const el = ce('div', 'score-bars');
  top.forEach(r => {
    const pct = Math.round((r.implied_value_usd / max) * 100);
    el.innerHTML += `<div class="score-bar">
      <span class="label">#${r.rank} ${esc(r.name)}</span>
      <div class="bar-track"><div class="bar-fill blue" style="width:${pct}%"></div></div>
      <span class="bar-val">${FMT.format(r.implied_value_usd)}</span>
    </div>`;
  });
  return el;
}

/* --- controls --- */
function renderControls() {
  const el = ce('div', 'controls');
  
  const search = ce('div', 'field');
  search.innerHTML = '<label>Search</label>';
  const inp = ce('input');
  inp.placeholder = 'Protocol name, slug, or chain…';
  inp.value = filterText;
  inp.addEventListener('input', e => {
    filterText = e.target.value.toLowerCase();
    applyFilter();
  });
  search.append(inp);
  el.append(search);

  const cat = ce('div', 'field');
  cat.innerHTML = '<label>Category</label>';
  const sel = ce('select');
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All categories</option>';
  cats.forEach(c => { sel.innerHTML += `<option>${esc(c)}</option>`; });
  sel.addEventListener('change', e => {
    filterText = e.target.value.toLowerCase();
    applyFilter();
  });
  cat.append(sel);
  el.append(cat);

  const tabs = ce('div', 'tabs');
  ['board', 'live'].forEach(v => {
    const btn = ce('button');
    btn.textContent = v === 'board' ? 'Pre-Token Board' : 'Live Tokens';
    btn.setAttribute('aria-pressed', view === v ? 'true' : 'false');
    btn.addEventListener('click', () => { view = v; selectedSlug = null; render(); });
    tabs.append(btn);
  });
  el.append(tabs);

  const cnt = ce('div', 'count');
  cnt.textContent = `Showing ${rows.length} row${rows.length !== 1 ? 's' : ''}`;
  el.append(cnt);

  return el;
}

/* --- table --- */
function renderTable() {
  const el = ce('div', 'panel');
  const wrap = ce('div', 'table-wrap');
  const t = ce('table');
  t.innerHTML = `<thead><tr>
    ${hdr('#', 'rank')}${hdr('Protocol', 'name')}${hdr('Category', 'category')}
    ${hdr('TVL', 'tvl_usd')}${hdr('7d Δ', 'change_7d')}
    ${hdr('Age', 'age_days')}${hdr('Implied Value', 'implied_value_usd')}
    <th>Chains</th>
  </tr></thead>`;
  const tb = ce('tbody');
  rows.forEach(r => {
    const tr = ce('tr');
    if (r.slug === selectedSlug) tr.setAttribute('data-selected', 'true');
    tr.addEventListener('click', () => { selectedSlug = r.slug; view = 'detail'; render(); });
    const maxI = rows[0]?.implied_value_usd || 1;
    const barW = Math.round((r.implied_value_usd / maxI) * 100);
    tr.innerHTML = `
      <td class="num">${r.rank}</td>
      <td><div class="name-cell"><b>${esc(r.name)}</b><span class="sub">${esc(r.slug)}</span></div></td>
      <td>${r.category ? `<span class="tag tag-muted">${esc(r.category)}</span>` : '—'}</td>
      <td class="num">${FMT.format(r.tvl_usd)}</td>
      <td class="num ${r.change_7d !== null && r.change_7d > 0 ? 'pos' : r.change_7d !== null && r.change_7d < 0 ? 'neg' : ''}">${r.change_7d !== null ? FMT_PCT.format(r.change_7d / 100) : '—'}</td>
      <td class="num">${r.age_days !== null ? `${r.age_days}d` : '—'}</td>
      <td><div class="ival"><span class="num">${FMT.format(r.implied_value_usd)}</span><div class="bar"><i style="width:${barW}%"></i></div></div></td>
      <td><div class="chains">${r.chains.slice(0, 3).map(c => `<span class="chain-tag">${esc(c)}</span>`).join('')}${r.chains.length > 3 ? `<span class="chain-tag">+${r.chains.length - 3}</span>` : ''}</div></td>
    `;
    tb.append(tr);
  });
  t.append(tb);
  wrap.append(t);
  el.append(wrap);
  return el;
}

function hdr(label, key) {
  const arrow = sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
  return `<th><button data-sort="${key}">${label}${arrow}</button></th>`;
}

/* --- live table --- */
function renderLive() {
  const el = ce('div', 'panel');
  const wrap = ce('div', 'table-wrap');
  const t = ce('table');
  t.innerHTML = `<thead><tr>
    <th>Protocol</th><th>Category</th><th>TVL</th><th>Market Cap</th><th>7d Δ</th><th>Chains</th>
  </tr></thead>`;
  const tb = ce('tbody');
  RADAR.live.forEach(r => {
    const tr = ce('tr');
    tr.innerHTML = `
      <td><div class="name-cell"><b>${esc(r.name)}</b><span class="sub">${esc(r.slug)}</span></div></td>
      <td>${r.category ? `<span class="tag tag-muted">${esc(r.category)}</span>` : '—'}</td>
      <td class="num">${FMT.format(r.tvl_usd)}</td>
      <td class="num">${r.mcap_usd !== null ? FMT.format(r.mcap_usd) : '—'}</td>
      <td class="num ${r.change_7d !== null && r.change_7d > 0 ? 'pos' : r.change_7d !== null && r.change_7d < 0 ? 'neg' : ''}">${r.change_7d !== null ? FMT_PCT.format(r.change_7d / 100) : '—'}</td>
      <td><div class="chains">${r.chains.slice(0, 3).map(c => `<span class="chain-tag">${esc(c)}</span>`).join('')}</div></td>
    `;
    tb.append(tr);
  });
  t.append(tb);
  wrap.append(t);
  el.append(wrap);
  return el;
}

/* --- detail --- */
function renderDetail() {
  const r = rows.find(r => r.slug === selectedSlug);
  if (!r) return ce('div');

  // Find full row from board
  const full = RADAR.rows.find(rr => rr.slug === selectedSlug);
  const el = ce('div', 'detail');
  
  el.innerHTML = `<div class="detail-head">
    <div>
      <h2>#${r.rank} ${esc(r.name)}</h2>
      <span class="sub">${esc(r.slug)}${r.category ? ` · ${esc(r.category)}` : ''}</span>
    </div>
    <div style="display:flex;align-items:center;gap:var(--step-3)">
      <span class="num" style="font-size:18px;font-weight:600">${FMT.format(r.implied_value_usd)}</span>
      <button class="detail-close" onclick="document.querySelector('[data-close]')?.click()">✕</button>
    </div>
  </div>
  <div class="detail-grid">
    <div class="detail-stat"><span class="label">Implied Value</span><span class="val">${FMT.format(r.implied_value_usd)}</span></div>
    <div class="detail-stat"><span class="label">TVL</span><span class="val">${FMT.format(r.tvl_usd)}</span></div>
    <div class="detail-stat"><span class="label">7-Day Change</span><span class="val ${r.change_7d !== null && r.change_7d > 0 ? 'pos' : r.change_7d !== null && r.change_7d < 0 ? 'neg' : ''}">${r.change_7d !== null ? FMT_PCT.format(r.change_7d / 100) : '—'}</span></div>
    <div class="detail-stat"><span class="label">Age</span><span class="val">${r.age_days !== null ? `${r.age_days} days` : 'unknown'}</span></div>
    <div class="detail-stat"><span class="label">Growth Multiplier</span><span class="val">${r.growth_multiplier.toFixed(3)}</span></div>
    <div class="detail-stat"><span class="label">Maturity Multiplier</span><span class="val">${r.maturity_multiplier.toFixed(3)}</span></div>
    <div class="detail-stat"><span class="label">Category</span><span class="val">${r.category || '—'}</span></div>
    <div class="detail-stat"><span class="label">Chains</span><span class="val" style="font-size:13px">${r.chains.slice(0, 5).join(', ')}${r.chains.length > 5 ? ` +${r.chains.length - 5} more` : ''}</span></div>
  </div>`;

  // Add farm steps from the full board data (we need to find it)
  // The full board is in window.RADAR but farm_steps are in the board.json
  // We'll extract from data.js if available
  if (full && RADAR._board) {
    const fb = RADAR._board.find(b => b.slug === selectedSlug);
    if (fb && fb.farm_steps) {
      const stepsEl = ce('div', 'detail-steps');
      stepsEl.innerHTML = '<h3>Farm Plan</h3>';
      fb.farm_steps.forEach((s, i) => {
        stepsEl.innerHTML += `<div class="step"><b>${i + 1}.</b> ${esc(s)}</div>`;
      });
      el.append(stepsEl);
    }
  }

  return el;
}

/* --- model --- */
function renderModel() {
  const m = RADAR.model;
  const el = ce('div', 'model-panel');
  el.innerHTML = `<h3>Model — ${RADAR.model_version}</h3>
  <div class="model-grid">
    <div class="model-item"><span class="label">Base Multiple</span><span class="val">${m.base_multiple} × TVL</span></div>
    <div class="model-item"><span class="label">Growth Weight</span><span class="val">${m.growth_weight}</span></div>
    <div class="model-item"><span class="label">Growth Range</span><span class="val">${m.growth_floor}% to ${m.growth_cap}%</span></div>
    <div class="model-item"><span class="label">Maturity Range</span><span class="val">${m.maturity_floor}–${(m.maturity_floor + m.maturity_range).toFixed(1)} over ${m.maturity_days}d</span></div>
    <div class="model-item"><span class="label">Unknown Age</span><span class="val">${m.unknown_age_days} days</span></div>
    <div class="model-item"><span class="label">Early Rows</span><span class="val">${RADAR.early_size} below $${FMT_NUM.format(RADAR.floor_usd)}</span></div>
  </div>`;
  return el;
}

function renderFooter() {
  const el = ce('footer');
  el.innerHTML = `<span>radar-2</span> · ${RADAR.source} · snapshot ${RADAR.as_of}`;
  return el;
}

/* --- filter --- */
function applyFilter() {
  if (!filterText) {
    rows = [...RADAR.rows];
  } else {
    const q = filterText.toLowerCase();
    rows = RADAR.rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.category && r.category.toLowerCase().includes(q)) ||
      r.chains.some(c => c.toLowerCase().includes(q))
    );
  }
  render();
}

/* --- sort --- */
document.addEventListener('click', e => {
  const btn = e.target.closest('th button');
  if (!btn) return;
  const key = btn.dataset.sort;
  if (!key) return;
  if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
  rows.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va === null || va === undefined) va = -Infinity;
    if (vb === null || vb === undefined) vb = -Infinity;
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
  });
  applyFilter();
});

/* --- helpers --- */
function ce(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

render();