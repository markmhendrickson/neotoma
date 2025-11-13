// Configuration
let apiBase = 'http://localhost:8080';
let bearerToken = '';
let table = null;
let allRecords = [];
let filteredRecords = [];
let selectedRecord = null;
let types = [];
const DEFAULT_COLUMNS = ['status', 'id', 'type', 'created_at', 'updated_at', 'file_urls'];

let columnConfig = {
  visible: {
    status: true,
    id: true,
    type: true,
    created_at: true,
    updated_at: true,
    file_urls: true,
  },
  order: ['status', 'id', 'type', 'created_at', 'updated_at', 'file_urls'],
};
const pendingUploads = new Map();

const STATUS_ORDER = {
  Uploading: 0,
  Failed: 1,
  Ready: 2,
};

function normalizeRecord(record) {
  if (!record) return record;
  return {
    ...record,
    id: record.id,
    type: record.type || '',
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString(),
    file_urls: Array.isArray(record.file_urls) ? record.file_urls : [],
    properties: record.properties || {},
    _status: record._status || 'Ready',
  };
}

function getCombinedRecords() {
  return [...pendingUploads.values(), ...allRecords];
}

function addOrReplaceRecord(record) {
  const normalized = normalizeRecord(record);
  const existingIndex = allRecords.findIndex((r) => r.id === normalized.id);
  if (existingIndex >= 0) {
    allRecords[existingIndex] = normalized;
  } else {
    allRecords = [normalized, ...allRecords];
  }
}

function updatePendingRecord(tempId, updates) {
  if (!pendingUploads.has(tempId)) return;
  const updated = {
    ...pendingUploads.get(tempId),
    ...updates,
  };
  pendingUploads.set(tempId, updated);
  handleFilter();
}

// DOM elements
const els = {
  apiBase: document.getElementById('apiBase'),
  token: document.getElementById('token'),
  saveSettings: document.getElementById('saveSettings'),
  tableContainer: document.getElementById('tableContainer'),
  searchInput: document.getElementById('searchInput'),
  typeFilter: document.getElementById('typeFilter'),
  recordCount: document.getElementById('recordCount'),
  sidePanel: document.getElementById('sidePanel'),
  closePanel: document.getElementById('closePanel'),
  sidePanelContent: document.getElementById('sidePanelContent'),
  uploadDropzone: document.getElementById('uploadDropzone'),
  fileInput: document.getElementById('fileInput'),
  headerUploadProgress: document.getElementById('headerUploadProgress'),
  toastContainer: document.getElementById('toastContainer'),
  columnSettingsBtn: document.getElementById('columnSettingsBtn'),
  columnSettings: document.getElementById('columnSettings'),
  columnList: document.getElementById('columnList'),
  closeColumnSettings: document.getElementById('closeColumnSettings'),
};

// Initialize
function init() {
  loadSettings();
  setupEventListeners();
  fetchRecords();
  fetchTypes();
}

function loadSettings() {
  try {
    apiBase = localStorage.getItem('apiBase') || window.location.origin;
    bearerToken = localStorage.getItem('bearerToken') || '';
    if (els.apiBase) els.apiBase.value = apiBase;
    if (els.token) els.token.value = bearerToken;
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
}

function saveSettings() {
  try {
    apiBase = els.apiBase.value.trim() || window.location.origin;
    bearerToken = els.token.value.trim();
    localStorage.setItem('apiBase', apiBase);
    localStorage.setItem('bearerToken', bearerToken);
    showToast('Settings saved', 'success');
    fetchRecords();
  } catch (e) {
    console.warn('Failed to save settings', e);
  }
}

function setupEventListeners() {
  if (els.saveSettings) els.saveSettings.addEventListener('click', saveSettings);
  if (els.closePanel) els.closePanel.addEventListener('click', () => closeSidePanel());
  if (els.searchInput) els.searchInput.addEventListener('input', debounce(handleSearch, 300));
  if (els.typeFilter) els.typeFilter.addEventListener('change', handleFilter);

  // File upload - header dropzone
  if (els.uploadDropzone) {
    els.uploadDropzone.addEventListener('click', () => els.fileInput?.click());
    els.uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.uploadDropzone.classList.add('dragover');
    });
    els.uploadDropzone.addEventListener('dragleave', () => {
      els.uploadDropzone.classList.remove('dragover');
    });
    els.uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.uploadDropzone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      handleFileUpload(files);
    });
  }
  if (els.fileInput) {
    els.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      handleFileUpload(files);
    });
  }

  // Column settings
  if (els.columnSettingsBtn) {
    els.columnSettingsBtn.addEventListener('click', () => {
      if (els.columnSettings) {
        els.columnSettings.classList.toggle('open');
        renderColumnSettings();
      }
    });
  }
  if (els.closeColumnSettings) {
    els.closeColumnSettings.addEventListener('click', () => {
      if (els.columnSettings) {
        els.columnSettings.classList.remove('open');
      }
    });
  }

  loadColumnConfig();
}


async function handleFileUpload(files) {
  if (files.length === 0) return;

  if (!bearerToken) {
    showToast('Please set Bearer Token in settings', 'error');
    return;
  }

  const uploadItems = [];
  files.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'header-upload-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'header-upload-name';
    nameSpan.textContent = file.name;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'header-upload-status pending';
    statusSpan.textContent = 'Uploading...';
    item.appendChild(nameSpan);
    item.appendChild(statusSpan);
    uploadItems.push({ file, element: item, statusEl: statusSpan });
    if (els.headerUploadProgress) {
      els.headerUploadProgress.appendChild(item);
      els.headerUploadProgress.style.display = 'flex';
    }

    const tempId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    pendingUploads.set(
      tempId,
      normalizeRecord({
        id: `(uploading) ${file.name}`,
        type: 'uploading',
        created_at: now,
        updated_at: now,
        file_urls: [],
        properties: { source_file: file.name },
        _status: 'Uploading',
        _tempId: tempId,
        _fileName: file.name,
      })
    );
    uploadItems[uploadItems.length - 1].tempId = tempId;
    handleFilter();
  });

  for (const { file, element, tempId, statusEl } of uploadItems) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/upload_file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: formData,
      });

      if (response.ok) {
        const record = await response.json();
        // Update status element
        if (statusEl) {
          statusEl.textContent = '✓';
          statusEl.className = 'header-upload-status success';
        }
        showToast(`Uploaded: ${file.name}`, 'success');
        pendingUploads.delete(tempId);
        addOrReplaceRecord({ ...record, _status: 'Ready' });
        handleFilter();
        setTimeout(() => fetchRecords(), 500);
        // Remove item after 2 seconds
        setTimeout(() => {
          if (element.parentNode) {
            element.remove();
            if (els.headerUploadProgress && els.headerUploadProgress.children.length === 0) {
              els.headerUploadProgress.style.display = 'none';
            }
          }
        }, 2000);
      } else {
        let errorMessage = 'Upload failed';
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Unauthorized - check your Bearer Token';
        } else {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      // Update status element on error
      if (statusEl) {
        statusEl.textContent = '✗';
        statusEl.className = 'header-upload-status error';
      }
      showToast(`Failed: ${file.name} - ${error.message}`, 'error');
      // Remove item after 3 seconds on error
      setTimeout(() => {
        if (element.parentNode) {
          element.remove();
          if (els.headerUploadProgress && els.headerUploadProgress.children.length === 0) {
            els.headerUploadProgress.style.display = 'none';
          }
        }
      }, 3000);
      updatePendingRecord(tempId, {
        id: `(failed) ${file.name}`,
        _status: 'Failed',
        _error: error.message || 'Upload failed',
        updated_at: new Date().toISOString(),
      });
    }
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  if (els.toastContainer) {
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchRecords() {
  try {
    if (!bearerToken) {
      showToast('Please set Bearer Token in settings', 'error');
      return;
    }

    const response = await fetch(`${apiBase}/retrieve_records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        limit: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized - check your Bearer Token');
      } else if (response.status === 403) {
        throw new Error('Forbidden - invalid Bearer Token');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
    }

    const data = await response.json();
    allRecords = data.map((record) => normalizeRecord(record));
    handleFilter();
  } catch (error) {
    console.error('Error fetching records:', error);
    showToast(error.message || 'Failed to fetch records', 'error');
    allRecords = [];
    handleFilter();
  }
}

async function fetchTypes() {
  try {
    if (!bearerToken) {
      return;
    }

    const response = await fetch(`${apiBase}/types`, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      types = data.types || [];
      if (els.typeFilter) {
        els.typeFilter.innerHTML = '<option value="">All Types</option>';
        types.forEach((type) => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type;
          els.typeFilter.appendChild(option);
        });
      }
    }
  } catch (error) {
    console.error('Error fetching types:', error);
  }
}

async function handleSearch() {
  const query = els.searchInput?.value.trim() || '';
  if (!query) {
    fetchRecords();
    return;
  }

  if (!bearerToken) {
    showToast('Please set Bearer Token in settings', 'error');
    return;
  }

  try {
    const response = await fetch(`${apiBase}/retrieve_records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        limit: 500,
        search: query.split(/\s+/),
        search_mode: 'both',
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized - check your Bearer Token');
      } else if (response.status === 403) {
        throw new Error('Forbidden - invalid Bearer Token');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
    }

    const data = await response.json();
    allRecords = data.map((record) => normalizeRecord(record));
    handleFilter();
  } catch (error) {
    console.error('Search error:', error);
    showToast(error.message || 'Search failed', 'error');
  }
}

function handleFilter() {
  const selectedType = els.typeFilter?.value || '';
  const combined = getCombinedRecords();
  filteredRecords = combined.filter((record) => {
    if (record._status && record._status !== 'Ready') {
      return true;
    }
    if (!selectedType) {
      return true;
    }
    return record.type === selectedType;
  });

  filteredRecords.sort((a, b) => {
    const statusDiff =
      (STATUS_ORDER[a._status] ?? STATUS_ORDER.Ready) - (STATUS_ORDER[b._status] ?? STATUS_ORDER.Ready);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  renderTable();
}

function renderTable() {
  if (table) {
    table.destroy();
  }

  // Update record count
  if (els.recordCount) {
    els.recordCount.textContent = `${filteredRecords.length} record${filteredRecords.length !== 1 ? 's' : ''}`;
  }

  const columnDefinitions = {
    status: {
      title: 'Status',
      field: '_status',
      width: 120,
      sorter: (a, b) => (STATUS_ORDER[a] ?? STATUS_ORDER.Ready) - (STATUS_ORDER[b] ?? STATUS_ORDER.Ready),
      formatter: (cell) => {
        const value = cell.getValue() || 'Ready';
        if (value === 'Uploading') return 'Uploading…';
        if (value === 'Failed') return 'Failed';
        return 'Ready';
      },
    },
    id: { title: 'ID', field: 'id', width: 200, sorter: 'string' },
    type: { title: 'Type', field: 'type', width: 150, sorter: 'string' },
    created_at: {
      title: 'Created',
      field: 'created_at',
      width: 180,
      sorter: (a, b, aRow, bRow, column, dir, sorterParams) => {
        const dateA = new Date(a).getTime();
        const dateB = new Date(b).getTime();
        return dateA - dateB;
      },
      formatter: (cell) => {
        const date = new Date(cell.getValue());
        return date.toLocaleString();
      },
    },
    updated_at: {
      title: 'Updated',
      field: 'updated_at',
      width: 180,
      sorter: (a, b, aRow, bRow, column, dir, sorterParams) => {
        const dateA = new Date(a).getTime();
        const dateB = new Date(b).getTime();
        return dateA - dateB;
      },
      formatter: (cell) => {
        const date = new Date(cell.getValue());
        return date.toLocaleString();
      },
    },
    file_urls: {
      title: 'Files',
      field: 'file_urls',
      width: 100,
      formatter: (cell) => {
        const urls = cell.getValue() || [];
        return urls.length > 0 ? `${urls.length} file(s)` : '—';
      },
    },
  };

  const columns = columnConfig.order
    .filter((field) => columnConfig.visible[field])
    .map((field) => columnDefinitions[field])
    .filter(Boolean);

  if (columns.length === 0) {
    columns.push(columnDefinitions.id);
  }

  table = new Tabulator(els.tableContainer, {
    data: filteredRecords,
    layout: 'fitColumns',
    height: '100%',
    selectable: 1,
    movableColumns: true,
    virtualDom: true,
    virtualDomBuffer: 300,
    columns: columns,
    rowFormatter: (row) => {
      const data = row.getData();
      const el = row.getElement();
      el.classList.remove('row-uploading', 'row-error');
      if (data._status === 'Uploading') {
        el.classList.add('row-uploading');
      } else if (data._status === 'Failed') {
        el.classList.add('row-error');
      }
    },
  });

  table.on('rowClick', (e, row) => {
    selectedRecord = row.getData();
    showSidePanel(selectedRecord);
  });

  table.on('columnMoved', () => {
    const visibleColumns = table.getColumns().map((col) => col.getField());
    columnConfig.order = [
      ...visibleColumns,
      ...columnConfig.order.filter((f) => !visibleColumns.includes(f)),
    ];
    saveColumnConfig();
  });
}

function renderColumnSettings() {
  if (!els.columnList) return;

  els.columnList.innerHTML = '';

  const columnLabels = {
    status: 'Status',
    id: 'ID',
    type: 'Type',
    created_at: 'Created',
    updated_at: 'Updated',
    file_urls: 'Files',
  };

  columnConfig.order.forEach((field) => {
    if (!columnLabels[field]) {
      return;
    }
    const item = document.createElement('div');
    item.className = 'column-setting-item';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.padding = '8px';
    item.style.borderBottom = `1px solid var(--border)`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = columnConfig.visible[field];
    checkbox.addEventListener('change', () => {
      columnConfig.visible[field] = checkbox.checked;
      saveColumnConfig();
      renderTable();
    });

    const label = document.createElement('label');
    label.textContent = columnLabels[field] || field;
    label.style.flex = '1';
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => checkbox.click());

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.style.padding = '4px 8px';
    upBtn.disabled = columnConfig.order.indexOf(field) === 0;
    upBtn.addEventListener('click', () => {
      const index = columnConfig.order.indexOf(field);
      if (index > 0) {
        [columnConfig.order[index - 1], columnConfig.order[index]] = [
          columnConfig.order[index],
          columnConfig.order[index - 1],
        ];
        saveColumnConfig();
        renderColumnSettings();
        renderTable();
      }
    });

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.style.padding = '4px 8px';
    downBtn.disabled = columnConfig.order.indexOf(field) === columnConfig.order.length - 1;
    downBtn.addEventListener('click', () => {
      const index = columnConfig.order.indexOf(field);
      if (index < columnConfig.order.length - 1) {
        [columnConfig.order[index], columnConfig.order[index + 1]] = [
          columnConfig.order[index + 1],
          columnConfig.order[index],
        ];
        saveColumnConfig();
        renderColumnSettings();
        renderTable();
      }
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    item.appendChild(upBtn);
    item.appendChild(downBtn);
    els.columnList.appendChild(item);
  });
}

function loadColumnConfig() {
  try {
    const saved = localStorage.getItem('columnConfig');
    if (saved) {
      columnConfig = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load column config', e);
  }

  if (!columnConfig || typeof columnConfig !== 'object') {
    columnConfig = { visible: {}, order: [] };
  }
  if (!columnConfig.visible || typeof columnConfig.visible !== 'object') {
    columnConfig.visible = {};
  }
  if (!Array.isArray(columnConfig.order)) {
    columnConfig.order = [];
  }

  columnConfig.order = columnConfig.order.filter((field) => DEFAULT_COLUMNS.includes(field));
  DEFAULT_COLUMNS.forEach((field) => {
    if (columnConfig.visible[field] === undefined) {
      columnConfig.visible[field] = true;
    }
    if (!columnConfig.order.includes(field)) {
      columnConfig.order.push(field);
    }
  });
}

function saveColumnConfig() {
  try {
    localStorage.setItem('columnConfig', JSON.stringify(columnConfig));
  } catch (e) {
    console.warn('Failed to save column config', e);
  }
}


async function showSidePanel(record) {
  if (!els.sidePanelContent) return;

  const status = record._status || 'Ready';
  const statusDisplay = status === 'Uploading' ? 'Uploading…' : status;
  const createdAt = record.created_at ? new Date(record.created_at).toLocaleString() : '—';
  const updatedAt = record.updated_at ? new Date(record.updated_at).toLocaleString() : '—';

  // Build file URLs section
  let fileUrlsHtml = '<div class="field-value">—</div>';
  if ((record.file_urls || []).length > 0) {
    fileUrlsHtml = '<div class="file-urls">';
    for (const filePath of record.file_urls) {
      try {
        // Fetch signed URL for this file
        const response = await fetch(
          `${apiBase}/get_file_url?file_path=${encodeURIComponent(`files/${filePath}`)}`,
          {
            headers: {
              'Authorization': `Bearer ${bearerToken}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          fileUrlsHtml += `<div class="file-url"><a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.url)}</a></div>`;
        } else {
          // Fallback to showing path if URL fetch fails
          fileUrlsHtml += `<div class="file-url">${escapeHtml(filePath)}</div>`;
        }
      } catch (error) {
        // Fallback to showing path on error
        fileUrlsHtml += `<div class="file-url">${escapeHtml(filePath)}</div>`;
      }
    }
    fileUrlsHtml += '</div>';
  }

  els.sidePanelContent.innerHTML = `
    <div class="field">
      <div class="field-label">ID</div>
      <div class="field-value">${escapeHtml(record.id)}</div>
    </div>
    <div class="field">
      <div class="field-label">Type</div>
      <div class="field-value">${escapeHtml(record.type || '—')}</div>
    </div>
    <div class="field">
      <div class="field-label">Status</div>
      <div class="field-value">${escapeHtml(statusDisplay)}</div>
    </div>
    <div class="field">
      <div class="field-label">Created At</div>
      <div class="field-value">${escapeHtml(createdAt)}</div>
    </div>
    <div class="field">
      <div class="field-label">Updated At</div>
      <div class="field-value">${escapeHtml(updatedAt)}</div>
    </div>
    <div class="field">
      <div class="field-label">File URLs</div>
      ${fileUrlsHtml}
    </div>
    <div class="field">
      <div class="field-label">Properties</div>
      <div class="json-viewer">${escapeHtml(JSON.stringify(record.properties || {}, null, 2))}</div>
    </div>
    ${
      record._error
        ? `<div class="field field-error">
            <div class="field-label">Error</div>
            <div class="field-value">${escapeHtml(record._error)}</div>
          </div>`
        : ''
    }
  `;

  if (els.sidePanel) {
    els.sidePanel.classList.add('open');
  }
}

function closeSidePanel() {
  if (els.sidePanel) {
    els.sidePanel.classList.remove('open');
  }
  selectedRecord = null;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

