// module-scoped to avoid duplicate global declarations
const apiBaseInput = document.getElementById('apiBase');
const bearerInput = document.getElementById('token');
const resultPre = document.getElementById('requestView');
const linkForm = document.getElementById('plaid_link_form');
const userIdInput = document.getElementById('field_user_id');
const clientNameInput = document.getElementById('field_client_name');

  function loadPersisted() {
    try {
      if (apiBaseInput) apiBaseInput.value = localStorage.getItem('sandbox_api_base') || 'http://localhost:8080';
      if (bearerInput) bearerInput.value = localStorage.getItem('sandbox_bearer') || '';
    } catch {}
  }

  function persist() {
    try {
      localStorage.setItem('sandbox_api_base', (apiBaseInput && apiBaseInput.value) || '');
      localStorage.setItem('sandbox_bearer', (bearerInput && bearerInput.value) || '');
    } catch {}
  }

let SANDBOX_DEFAULTS = null;

async function fetchDefaults() {
    const base = (apiBaseInput && apiBaseInput.value) || 'http://localhost:8080';
    try {
      const headers = {};
      if (bearerInput && bearerInput.value) {
        headers['Authorization'] = `Bearer ${bearerInput.value}`;
      }
      const resp = await fetch(`${base}/sandbox/config`, { headers });
      if (!resp.ok) return;
    const data = await resp.json();
    SANDBOX_DEFAULTS = data;
    if (userIdInput && data.user_id_default && !userIdInput.value) userIdInput.value = data.user_id_default;
    if (clientNameInput && data.client_name_default && !clientNameInput.value) clientNameInput.value = data.client_name_default;
    // Attempt to prefill any existing generic forms rendered from OpenAPI
    applyDefaultsToDocument();
    } catch {
      // ignore
    }
  }

function setIfEmpty(input, value) {
  if (!input) return;
  const current = (input.value || '').trim();
  if (!current && value) input.value = value;
}

function applyDefaultsToRoot(root) {
  if (!SANDBOX_DEFAULTS) return;
  const userId = root.querySelector('input[name="user_id"]');
  const clientName = root.querySelector('input[name="client_name"]');
  const products = root.querySelector('input[name="products"], textarea[name="products"]');
  const redirectUri = root.querySelector('input[name="redirect_uri"]');
  setIfEmpty(userId, SANDBOX_DEFAULTS.user_id_default);
  setIfEmpty(clientName, SANDBOX_DEFAULTS.client_name_default);
  // products in OpenAPI is an array; the generic form expects valid JSON
  if (products) {
    const current = (products.value || '').trim();
    if (!current) {
      const parts = (SANDBOX_DEFAULTS.products_default || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const asJson = JSON.stringify(parts.length ? parts : ['transactions']);
      products.value = asJson;
    } else if (!current.startsWith('[')) {
      // User typed a plain string; coerce to JSON array
      products.value = JSON.stringify([current]);
    }
  }
  setIfEmpty(redirectUri, SANDBOX_DEFAULTS.redirect_uri_default);
}

function applyDefaultsToDocument() {
  applyDefaultsToRoot(document);
}

// Ensure Plaid link section stays at the bottom of <main>
function ensurePlaidSectionLast() {
  const main = document.querySelector('main');
  const plaid = document.getElementById('plaid-link-token');
  if (!main || !plaid) return;
  // Only append if not already the last element to avoid mutation loops
  if (plaid.parentElement !== main || main.lastElementChild !== plaid) {
    main.appendChild(plaid);
  }
}

  async function callCreateLinkToken(payload) {
    const base = (apiBaseInput && apiBaseInput.value) || 'http://localhost:8080';
    const resp = await fetch(`${base}/plaid/link_token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(bearerInput && bearerInput.value) || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if (resultPre) resultPre.textContent = JSON.stringify(parsed, null, 2);
  }

  function onSubmit(e) {
    e.preventDefault();
    persist();
    const payload = {
      user_id: (userIdInput && userIdInput.value) || undefined,
      client_name: (clientNameInput && clientNameInput.value) || undefined,
    };
    callCreateLinkToken(payload);
  }

  function init() {
    ensurePlaidSectionLast();
    loadPersisted();
    if (linkForm && !linkForm.__bound) {
      linkForm.addEventListener('submit', onSubmit);
      linkForm.__bound = true;
    }
    fetchDefaults();
    // Observe dynamically generated forms and apply defaults when they appear
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches && node.matches('.form-section, form, section')) {
            applyDefaultsToRoot(node);
          } else if (node.querySelector) {
            applyDefaultsToRoot(node);
          }
        }
      }
      ensurePlaidSectionLast();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
// Optional generic OpenAPI sandbox bootstrap (only if those elements exist)
(function bootstrapGenericOpenAPISandbox() {
  const els = {
    apiBase: document.getElementById('apiBase'),
    token: document.getElementById('token'),
    saveSettings: document.getElementById('saveSettings'),
    endpointNav: document.getElementById('endpointNav'),
    formContainer: document.getElementById('formContainer'),
    executeBtn: document.getElementById('executeBtn'),
    requestView: document.getElementById('requestView'),
    responseView: document.getElementById('responseView'),
    status: document.getElementById('status'),
  };
  // If the generic UI is not present on this page, do nothing
  if (!els.apiBase || !els.token || !els.saveSettings || !els.endpointNav) return;
  let parser = null;
  let endpoints = [];
  let formGenerator = null;
  const endpointButtons = new Map();
  let selectedEndpoint = null;

  function loadSettings() {
    els.apiBase.value = localStorage.getItem('sandbox_apiBase') || window.location.origin;
    els.token.value = localStorage.getItem('sandbox_token') || '';
  }
  function saveSettings() {
    localStorage.setItem('sandbox_apiBase', els.apiBase.value.trim());
    localStorage.setItem('sandbox_token', els.token.value.trim());
  }
  async function loadOpenAPISpec() {
    const baseUrl = els.apiBase.value.trim() || window.location.origin;
    els.status.textContent = 'Loading OpenAPI spec...';
    els.status.className = 'status pending';
    const previouslySelectedId = selectedEndpoint ? selectedEndpoint.operationId : null;
    endpointButtons.clear();
    if (els.endpointNav) {
      els.endpointNav.innerHTML = '<div class="endpoint-nav-empty">Loading endpoints…</div>';
    }
    try {
      // Expect global fetchOpenAPISpec to be present when generic sandbox is used
      // eslint-disable-next-line no-undef
      parser = await fetchOpenAPISpec(baseUrl);
      endpoints = parser.getEndpoints();
      renderEndpointNav();
      if (previouslySelectedId && endpointButtons.has(previouslySelectedId)) {
        selectEndpoint(previouslySelectedId);
      }
      els.status.textContent = `Loaded ${endpoints.length} endpoints`;
      els.status.className = 'status success';
      setTimeout(() => {
        els.status.textContent = '';
        els.status.className = 'status';
      }, 3000);
    } catch (error) {
      els.status.textContent = `Error: ${error.message}`;
      els.status.className = 'status error';
      endpoints = [];
      renderEndpointNav();
      console.error('Failed to load OpenAPI spec:', error);
    }
  }
  function resetEndpointSelection() {
    selectedEndpoint = null;
    endpointButtons.forEach((button) => button.classList.remove('active'));
    els.formContainer.innerHTML = '';
    els.requestView.textContent = '';
    els.responseView.textContent = '';
  }

  function renderEndpointNav() {
    endpointButtons.clear();
    els.endpointNav.innerHTML = '';
    resetEndpointSelection();

    if (!endpoints.length) {
      const empty = document.createElement('div');
      empty.className = 'endpoint-nav-empty';
      empty.textContent = 'No endpoints loaded.';
      els.endpointNav.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'endpoint-nav-list';

    for (const endpoint of endpoints) {
      const item = document.createElement('li');
      item.className = 'endpoint-nav-item';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'endpoint-nav-button';
      button.dataset.operationId = endpoint.operationId;

      const methodTag = document.createElement('span');
      methodTag.className = `endpoint-method method-${endpoint.method.toLowerCase()}`;
      methodTag.textContent = endpoint.method.toUpperCase();

      const pathTag = document.createElement('span');
      pathTag.className = 'endpoint-path';
      pathTag.textContent = endpoint.path;

      button.append(methodTag, pathTag);
      button.addEventListener('click', () => selectEndpoint(endpoint.operationId));

      item.appendChild(button);
      list.appendChild(item);
      endpointButtons.set(endpoint.operationId, button);
    }

    els.endpointNav.appendChild(list);
  }

  function selectEndpoint(operationId) {
    const endpoint = endpoints.find((entry) => entry.operationId === operationId);
    if (!endpoint) return;

    selectedEndpoint = endpoint;
    endpointButtons.forEach((button, id) => {
      button.classList.toggle('active', id === operationId);
    });

    els.formContainer.innerHTML = '';
    // eslint-disable-next-line no-undef
    formGenerator = new FormGenerator(els.formContainer);
    formGenerator.generateForm(endpoint, parser);
    els.requestView.textContent = '';
    els.responseView.textContent = '';
  }
  async function executeRequest() {
    if (!selectedEndpoint) {
      alert('Please select an endpoint');
      return;
    }
    const endpoint = selectedEndpoint;
    const baseUrl = els.apiBase.value.trim() || window.location.origin;
    const token = els.token.value.trim();
    els.executeBtn.disabled = true;
    els.status.textContent = 'Executing request...';
    els.status.className = 'status pending';
    els.responseView.textContent = '';
    try {
      const formValues = formGenerator.collectFormValues(endpoint, parser);
      let url = baseUrl + endpoint.path;
      const queryParams = [];
      if (endpoint.parameters) {
        for (const param of endpoint.parameters) {
          if (param.in === 'query' && formValues[param.name] !== undefined) {
            queryParams.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(formValues[param.name])}`);
          } else if (param.in === 'path') {
            url = url.replace(`{${param.name}}`, encodeURIComponent(formValues[param.name] || ''));
          }
        }
      }
      if (queryParams.length > 0) {
        url += '?' + queryParams.join('&');
      }
      const options = { method: endpoint.method, headers: {} };
      if (token) options.headers['Authorization'] = `Bearer ${token}`;
      if (formValues.file) {
        const formData = new FormData();
        formData.append('file', formValues.file);
        if (formValues.multipart) {
          for (const [key, value] of Object.entries(formValues.multipart)) {
            formData.append(key, value);
          }
        }
        options.body = formData;
      } else if (formValues.body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(formValues.body);
      }
      const requestDisplay = {
        method: endpoint.method,
        url,
        headers: options.headers,
        body: formValues.body || (formValues.file ? '[FormData with file]' : null),
      };
      els.requestView.textContent = JSON.stringify(requestDisplay, null, 2);
      const response = await fetch(url, options);
      const responseText = await response.text();
      let responseData;
      try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }
      const responseHeaders = Object.fromEntries(response.headers.entries());
      let rawResponse = `HTTP/1.1 ${response.status} ${response.statusText}\n`;
      for (const [key, value] of Object.entries(responseHeaders)) rawResponse += `${key}: ${value}\n`;
      rawResponse += '\n';
      rawResponse += typeof responseData === 'object' && responseData !== null
        ? JSON.stringify(responseData, null, 2)
        : responseText;
      els.responseView.textContent = rawResponse;
      if (response.ok) {
        els.status.textContent = `Success: ${response.status} ${response.statusText}`;
        els.status.className = 'status success';
      } else {
        els.status.textContent = `Error: ${response.status} ${response.statusText}`;
        els.status.className = 'status error';
      }
    } catch (error) {
      els.status.textContent = `Error: ${error.message}`;
      els.status.className = 'status error';
      const errorResponse = `Error: ${error.message}\n\n${error.stack || ''}`;
      els.responseView.textContent = errorResponse;
      console.error('Request failed:', error);
    } finally {
      els.executeBtn.disabled = false;
    }
  }
  els.saveSettings.addEventListener('click', () => {
    saveSettings();
    loadOpenAPISpec();
  });
  els.executeBtn.addEventListener('click', executeRequest);
  loadSettings();
  // eslint-disable-next-line no-undef
  formGenerator = new FormGenerator(els.formContainer);
  loadOpenAPISpec();

    const demoLink = document.getElementById('plaid-demo-link');
    function updateDemoLink() {
      if (!demoLink) return;
      const base = (apiBaseInput && apiBaseInput.value) || window.location.origin;
      const token = bearerInput && bearerInput.value ? encodeURIComponent(bearerInput.value) : '';
      demoLink.href = token ? `${base}/plaid/link_demo?token=${token}` : `${base}/plaid/link_demo`;
    }
    updateDemoLink();
    if (bearerInput) {
      bearerInput.addEventListener('input', () => {
        persist();
        updateDemoLink();
      });
    }
    if (apiBaseInput) {
      apiBaseInput.addEventListener('input', () => {
        persist();
        updateDemoLink();
      });
    }
})(); 

