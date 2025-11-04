const els = {
  apiBase: document.getElementById('apiBase'),
  token: document.getElementById('token'),
  saveSettings: document.getElementById('saveSettings'),
  file: document.getElementById('file'),
  parseBtn: document.getElementById('parseBtn'),
  normalizeBtn: document.getElementById('normalizeBtn'),
  finalizeBtn: document.getElementById('finalizeBtn'),
  clearBtn: document.getElementById('clearBtn'),
  transformBtn: document.getElementById('transformBtn'),
  transformStatus: document.getElementById('transformStatus'),
  types: document.getElementById('types'),
  grid: document.getElementById('grid'),
  chat: document.getElementById('chat'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
};

let rows = [];
let normalized = [];
let chatMessages = [];
let gridInstance = null;

function loadSettings() {
  els.apiBase.value = localStorage.getItem('apiBase') || window.location.origin;
  els.token.value = localStorage.getItem('token') || '';
}

function saveSettings() {
  localStorage.setItem('apiBase', els.apiBase.value.trim());
  localStorage.setItem('token', els.token.value.trim());
}

function saveRowsCache() {
  try {
    const payload = JSON.stringify({ ts: Date.now(), rows });
    localStorage.setItem('csvRowsCache', payload);
  } catch (e) {
    console.warn('cache save failed', e);
  }
}

function loadRowsCache() {
  try {
    const txt = localStorage.getItem('csvRowsCache');
    if (!txt) return false;
    const obj = JSON.parse(txt);
    if (Array.isArray(obj?.rows) && obj.rows.length) {
      rows = obj.rows;
      renderGrid(rows);
      return true;
    }
  } catch (e) {
    console.warn('cache load failed', e);
  }
  return false;
}

function clearRowsCache() {
  localStorage.removeItem('csvRowsCache');
}

async function fetchJSON(path, opts = {}) {
  const base = els.apiBase.value.trim();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const token = els.token.value.trim();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(base + path, { ...opts, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function renderTypes(list) {
  els.types.innerHTML = '';
  list.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    els.types.appendChild(li);
  });
}

function renderGrid(data) {
  // Destroy existing Grid.js instance if present
  if (gridInstance) {
    try {
      gridInstance.destroy();
    } catch (e) {
      console.warn('grid destroy failed', e);
    }
    gridInstance = null;
  }
  els.grid.innerHTML = '';
  if (!data || !data.length) return;

  const sample = data[0];
  const base = sample.properties ? data.map(r => r.properties) : data;

  const columns = ['#', ...Array.from(new Set(base.flatMap(row => Object.keys(row))))];
  const gridRows = base.map((row, idx) => [String(idx + 1), ...columns.slice(1).map(key => {
    const v = row[key];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  })]);

  // Create new Grid.js instance and store reference
  gridInstance = new gridjs.Grid({
    columns,
    data: gridRows,
    search: true,
    sort: true,
    pagination: { enabled: true, limit: 25 },
    height: '60vh',
  }).render(els.grid);
}

function renderChat() {
  els.chat.innerHTML = '';
  chatMessages.forEach((m, idx) => {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    const text = document.createElement('div');
    text.textContent = `${m.role}: ${m.content}`;
    div.appendChild(text);

    if (m.role === 'assistant' && m.actions && Array.isArray(m.actions) && m.actions.length) {
      const btn = document.createElement('button');
      btn.textContent = `Apply (${m.actions.length})`;
      btn.style.marginTop = '6px';
      btn.addEventListener('click', () => {
        applyActions(m.actions);
      });
      div.appendChild(btn);
    }
    els.chat.appendChild(div);
  });
  els.chat.scrollTop = els.chat.scrollHeight;
}

function saveChat() {
  try { localStorage.setItem('csvChat', JSON.stringify(chatMessages)); } catch {}
}
function loadChat() {
  try { const t = localStorage.getItem('csvChat'); if (t) chatMessages = JSON.parse(t) || []; } catch {}
  renderChat();
}

function loadChatDraft() {
  const d = localStorage.getItem('csvChatDraft') || '';
  els.chatInput.value = d;
}

async function loadTypes() {
  try {
    const t = await fetchJSON('/types');
    renderTypes(t.types || []);
  } catch (e) {
    console.error(e);
  }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data),
      error: reject,
    });
  });
}

async function onParse() {
  if (!els.file.files[0]) return;
  rows = await parseCSV(els.file.files[0]);
  renderGrid(rows);
  saveRowsCache();
}

async function onNormalize() {
  const body = { rows };
  const res = await fetchJSON('/groom/preview', { method: 'POST', body: JSON.stringify(body) });
  normalized = res.normalized || [];
  renderGrid(normalized);
  // optional: persist normalized preview for restore
  try { localStorage.setItem('csvNormalizedCache', JSON.stringify({ ts: Date.now(), normalized })); } catch {}
}

async function onFinalize() {
  if (!normalized.length) return;
  const body = { records: normalized.map(r => ({ type: r.type, properties: r.properties, file_urls: r.file_urls || [] })) };
  const res = await fetchJSON('/groom/finalize', { method: 'POST', body: JSON.stringify(body) });
  alert(`Saved ${res.count || 0} records`);
}

async function onChatSend() {
  const content = els.chatInput.value.trim();
  if (!content) return;
  els.chatInput.value = '';
  chatMessages.push({ role: 'user', content });
  renderChat();
  saveChat();

  const sample = (normalized.length ? normalized : rows).slice(0, 25);
  const existingTypes = Array.from(els.types.querySelectorAll('li')).map(li => li.textContent);
  try {
    const res = await fetchJSON('/groom/assist', {
      method: 'POST',
      body: JSON.stringify({ messages: chatMessages.filter(m => m.role!=='system'), sample, existingTypes })
    });
    if (res?.message) {
      const enriched = { ...res.message };
      // Try to extract a ```json block with actions
      const match = /```json\n([\s\S]*?)\n```/.exec(enriched.content || '');
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && Array.isArray(parsed.actions)) {
            enriched.actions = parsed.actions;
          }
        } catch {}
      }
      chatMessages.push(enriched);
      renderChat();
      saveChat();
    }
  } catch (e) {
    chatMessages.push({ role: 'assistant', content: `Error: ${e.message || e}` });
    renderChat();
    saveChat();
  }
}

function applyActions(actions) {
  if (!actions || !actions.length) return;
  const target = (normalized.length ? normalized : rows).map(r => ({ ...r, properties: { ...(r.properties || r) } }));

  for (const action of actions) {
    switch (action.type) {
      case 'set_type':
        target.forEach(r => r.type = action.to);
        break;
      case 'map_type':
        (action.mappings || []).forEach(m => {
          target.forEach(r => { if ((r.type||'') === m.from) r.type = m.to; });
        });
        break;
      case 'set_field':
        target.forEach(r => {
          const cur = r.properties[action.field];
          const value = (typeof action.to === 'string' && action.to.includes('${value}')) ? (action.to.replace('${value}', cur ?? '')) : action.to;
          r.properties[action.field] = value;
        });
        break;
      case 'map_value':
        (action.mappings || []).forEach(m => {
          target.forEach(r => { if (r.properties[action.field] === m.from) r.properties[action.field] = m.to; });
        });
        break;
      case 'append':
        target.forEach(r => { const v = r.properties[action.field]; if (v != null) r.properties[action.field] = String(v) + (action.suffix||''); });
        break;
      case 'date_to_iso':
        target.forEach(r => { const v = r.properties[action.field]; const d = new Date(v); if (!isNaN(d.getTime())) r.properties[action.field] = d.toISOString(); });
        break;
      default:
        break;
    }
  }

  normalized = target.map(r => ({ type: r.type || 'unknown', properties: r.properties, file_urls: r.file_urls || [] }));
  renderGrid(normalized);
  try { localStorage.setItem('csvNormalizedCache', JSON.stringify({ ts: Date.now(), normalized })); } catch {}
}

async function onTransform() {
  const current = normalized.length ? normalized : rows;
  if (!current.length) {
    els.transformStatus.textContent = 'No rows to transform';
    els.transformStatus.className = 'status-indicator error';
    setTimeout(() => { els.transformStatus.textContent = ''; els.transformStatus.className = 'status-indicator'; }, 3000);
    return;
  }

  const t0 = Date.now();
  els.transformBtn.disabled = true;
  els.transformStatus.textContent = 'Transforming...';
  els.transformStatus.className = 'status-indicator pending';

  const instruction = els.chatInput.value.trim() || undefined;
  const batchSize = 100;
  let out = [];
  try {
    for (let i = 0; i < current.length; i += batchSize) {
      const body = { rows: current.slice(i, i + batchSize), instruction, return: 'json' };
      const res = await fetchJSON('/groom/transform', { method: 'POST', body: JSON.stringify(body) });
      if (res?.rows?.length) out = out.concat(res.rows);
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (out.length) {
      normalized = out;
      renderGrid(normalized);
      rows = normalized.map(r => ({ type: r.type, properties: { ...r.properties }, file_urls: r.file_urls || [] }));
      try {
        localStorage.setItem('csvNormalizedCache', JSON.stringify({ ts: Date.now(), normalized }));
        localStorage.setItem('csvRowsCache', JSON.stringify({ ts: Date.now(), rows }));
      } catch {}
      els.transformStatus.textContent = `Transformed ${out.length} rows in ${elapsed}s`;
      els.transformStatus.className = 'status-indicator success';
      setTimeout(() => { els.transformStatus.textContent = ''; els.transformStatus.className = 'status-indicator'; }, 5000);
    } else {
      els.transformStatus.textContent = `No rows returned (${elapsed}s)`;
      els.transformStatus.className = 'status-indicator error';
      setTimeout(() => { els.transformStatus.textContent = ''; els.transformStatus.className = 'status-indicator'; }, 3000);
    }
  } catch (e) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    els.transformStatus.textContent = `Error: ${e.message || e} (${elapsed}s)`;
    els.transformStatus.className = 'status-indicator error';
    setTimeout(() => { els.transformStatus.textContent = ''; els.transformStatus.className = 'status-indicator'; }, 5000);
  } finally {
    els.transformBtn.disabled = false;
  }
}

els.saveSettings.addEventListener('click', () => { saveSettings(); loadTypes(); });
els.parseBtn.addEventListener('click', onParse);
els.normalizeBtn.addEventListener('click', onNormalize);
els.finalizeBtn.addEventListener('click', onFinalize);
els.clearBtn.addEventListener('click', () => {
  clearRowsCache();
  normalized = [];
  if (gridInstance) {
    try { gridInstance.destroy(); } catch {}
    gridInstance = null;
  }
  els.grid.innerHTML = '';
});
els.chatSend.addEventListener('click', onChatSend);
els.transformBtn.addEventListener('click', onTransform);
els.chatInput.addEventListener('input', () => {
  try { localStorage.setItem('csvChatDraft', els.chatInput.value); } catch {}
});

loadSettings();
loadTypes();
// restore cached CSV on load
loadRowsCache();
loadChat();
loadChatDraft();

