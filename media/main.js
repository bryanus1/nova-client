// Nova REST Client Frontend Controller
(function () {
  const vscode = acquireVsCodeApi();

  // State Variables
  let currentRequestItem = null;
  let currentRequestNode = null;
  let activeEnvironmentId = null;

  // DOM Elements
  const methodSelect = document.getElementById('method-select');
  const urlInput = document.getElementById('url-input');
  const sendBtn = document.getElementById('send-btn');
  const saveBtn = document.getElementById('save-btn');
  const requestNameInput = document.getElementById('request-name-input');
  const envSelect = document.getElementById('env-select');

  const loadingOverlay = document.getElementById('loading-overlay');
  
  // Response details
  const responsePlaceholder = document.getElementById('response-placeholder');
  const responseContent = document.getElementById('response-content');
  const responseStatusInfo = document.getElementById('response-status-info');
  const statusCodeBadge = document.getElementById('status-code');
  const responseTimeSpan = document.getElementById('response-time');
  const responseSizeSpan = document.getElementById('response-size');
  const responseBodyCode = document.getElementById('response-body-code');
  const responseHeadersTableBody = document.querySelector('#res-headers-table tbody');

  // Initialize Webview
  vscode.postMessage({ command: 'ready' });

  // 1. Tab Switching Logic
  setupTabs('request-tabs', (tabId) => {
    // Show/hide sub tab contents
    document.querySelectorAll('.request-pane .tab-content').forEach(c => {
      c.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });

  setupTabs('response-tabs', (tabId) => {
    document.querySelectorAll('.response-pane .tab-content').forEach(c => {
      c.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });

  function setupTabs(containerId, onTabChange) {
    const container = document.getElementById(containerId);
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabId = btn.getAttribute('data-tab');
      onTabChange(tabId);
    });
  }

  // 2. Request Body Type Toggles
  const bodyRadios = document.querySelectorAll('input[name="body-type"]');
  bodyRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      
      // Hide all body containers
      document.querySelectorAll('.body-container').forEach(c => {
        c.classList.remove('active-body-tab');
      });

      // Show matching body container
      document.getElementById(`body-${type}-container`).classList.add('active-body-tab');
    });
  });

  // 2.5. Authorization Type Toggles
  const authTypeSelect = document.getElementById('auth-type-select');
  authTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    document.querySelectorAll('.auth-fields-container').forEach(c => {
      c.style.display = 'none';
    });
    document.getElementById(`auth-${type}-container`).style.display = 'flex';
  });

  // 3. Dynamic Key-Value Tables Handler
  setupKeyValueTable('params-table', 'add-param-btn');
  setupKeyValueTable('headers-table', 'add-header-btn');
  setupKeyValueTable('urlencoded-table', 'add-urlencoded-btn');
  setupKeyValueTable('formdata-table', 'add-formdata-btn');

  function setupKeyValueTable(tableId, addBtnId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    const addBtn = document.getElementById(addBtnId);

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addRow(tbody, '', '', '', true);
      });
    }

    // Event delegation for deleting rows
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-row-btn');
      if (!btn) return;
      const row = btn.closest('tr');
      row.remove();
      
      // Ensure there's always at least one row, or leave empty
      if (tbody.children.length === 0) {
        addRow(tbody, '', '', '', true);
      }

      // If it's params table, update URL in real time
      if (tableId === 'params-table') {
        updateUrlFromParamsTable();
      }
    });

    // Listen to changes in key-values to trigger URL parameters sync in real time
    tbody.addEventListener('input', (e) => {
      if (tableId === 'params-table') {
        updateUrlFromParamsTable();
      }
    });
  }

  function addRow(tbody, key = '', value = '', desc = '', enabled = true) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input row-key" placeholder="Key" value="${escapeHtml(key)}" />
      </td>
      <td>
        <input type="text" class="table-input row-value" placeholder="Value" value="${escapeHtml(value)}" />
      </td>
      <td>
        <input type="text" class="table-input row-desc" placeholder="Description" value="${escapeHtml(desc)}" />
      </td>
      <td>
        <button class="delete-row-btn" title="Delete Row">×</button>
      </td>
    `;
    tbody.appendChild(tr);
    return tr;
  }

  function getTableData(tableId) {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    const data = [];
    rows.forEach(row => {
      const key = row.querySelector('.row-key').value.trim();
      const val = row.querySelector('.row-value').value;
      const desc = row.querySelector('.row-desc').value.trim();
      if (key) {
        data.push({
          key: key,
          value: val,
          description: desc,
          disabled: false
        });
      }
    });
    return data;
  }

  function populateTable(tableId, dataList) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    
    if (dataList && dataList.length > 0) {
      dataList.forEach(item => {
        addRow(tbody, item.key, item.value, item.description || '', !item.disabled);
      });
    } else {
      // Add one default empty row
      addRow(tbody, '', '', '', true);
    }
  }

  // Sync parameters table back to URL input query params
  function updateUrlFromParamsTable() {
    const params = getTableData('params-table');
    let url = urlInput.value.trim();
    if (!url) return;

    // Split base URL and existing query params
    const qIndex = url.indexOf('?');
    const baseUrl = qIndex !== -1 ? url.slice(0, qIndex) : url;

    if (params.length === 0) {
      urlInput.value = baseUrl;
      return;
    }

    const searchParams = new URLSearchParams();
    params.forEach(p => {
      searchParams.append(p.key, p.value);
    });

    const queryString = searchParams.toString();
    urlInput.value = queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  // Parse URL query string and sync to parameters table
  urlInput.addEventListener('input', () => {
    syncParamsTableFromUrl();
  });

  function syncParamsTableFromUrl() {
    const url = urlInput.value.trim();
    const qIndex = url.indexOf('?');
    if (qIndex === -1) {
      return; // No query string to parse
    }

    const queryString = url.slice(qIndex + 1);
    const searchParams = new URLSearchParams(queryString);
    
    const tbody = document.querySelector('#params-table tbody');
    tbody.innerHTML = '';

    let count = 0;
    searchParams.forEach((value, key) => {
      addRow(tbody, key, value, '', true);
      count++;
    });

    if (count === 0) {
      addRow(tbody, '', '', '', true);
    }
  }

  // 4. Handle Incoming IPC Messages
  window.addEventListener('message', async (event) => {
    const message = event.data;
    switch (message.command) {
      case 'loadRequest':
        loadRequestData(message.node, message.requestItem, message.environments, message.activeEnvironmentId);
        break;
      case 'setLoading':
        setLoadingState(message.loading);
        break;
      case 'responseReceived':
        setLoadingState(false);
        renderResponse(message.response);
        break;
    }
  });

  function loadRequestData(node, requestItem, environments, activeEnvId) {
    currentRequestNode = node;
    currentRequestItem = requestItem;
    activeEnvironmentId = activeEnvId;

    // Persist Webview State (for VS Code Webview Panel Serializer)
    vscode.setState({
      node: node,
      activeEnvironmentId: activeEnvId
    });

    // Set headers
    requestNameInput.value = requestItem.name || 'Untitled Request';
    
    const req = requestItem.request || {};
    methodSelect.value = (req.method || 'GET').toUpperCase();
    
    // URL
    let rawUrl = '';
    if (typeof req.url === 'string') {
      rawUrl = req.url;
    } else if (req.url && req.url.raw) {
      rawUrl = req.url.raw;
    }
    urlInput.value = rawUrl;

    // Environments Dropdown
    envSelect.innerHTML = '<option value="none">No Environment</option>';
    if (environments) {
      environments.forEach(env => {
        const opt = document.createElement('option');
        opt.value = env.id || env.name;
        opt.textContent = env.name;
        if (opt.value === activeEnvId) {
          opt.selected = true;
        }
        envSelect.appendChild(opt);
      });
    }

    // Sync parameters from loaded URL
    syncParamsTableFromUrl();

    // Headers Table
    populateTable('headers-table', req.header);

    // Body
    const body = req.body || { mode: 'none' };
    const mode = body.mode || 'none';
    
    // Set radio buttons
    const matchingRadio = document.querySelector(`input[name="body-type"][value="${mode}"]`);
    if (matchingRadio) {
      matchingRadio.checked = true;
      matchingRadio.dispatchEvent(new Event('change'));
    }

    // Populate body values based on mode
    if (mode === 'raw') {
      document.getElementById('body-raw-textarea').value = body.raw || '';
      const lang = body.options?.raw?.language || 'json';
      document.getElementById('body-language-select').value = lang;
    } else if (mode === 'urlencoded') {
      populateTable('urlencoded-table', body.urlencoded);
    } else if (mode === 'formdata') {
      // Map postman formdata to key-value structure
      const list = (body.formdata || []).map(f => ({
        key: f.key,
        value: f.value || '',
        description: f.description || '',
        disabled: !!f.disabled
      }));
      populateTable('formdata-table', list);
    }

    // 2.5. Populate Authorization Details
    const auth = req.auth || { type: 'none' };
    const authType = auth.type || 'none';
    authTypeSelect.value = authType;
    authTypeSelect.dispatchEvent(new Event('change'));

    // Reset inputs
    document.getElementById('auth-bearer-token').value = '';
    document.getElementById('auth-basic-username').value = '';
    document.getElementById('auth-basic-password').value = '';
    document.getElementById('auth-apikey-key').value = '';
    document.getElementById('auth-apikey-value').value = '';
    document.getElementById('auth-apikey-in').value = 'header';

    if (authType === 'bearer' && auth.bearer) {
      document.getElementById('auth-bearer-token').value = auth.bearer.find(b => b.key === 'token')?.value || '';
    } else if (authType === 'basic' && auth.basic) {
      document.getElementById('auth-basic-username').value = auth.basic.find(b => b.key === 'username')?.value || '';
      document.getElementById('auth-basic-password').value = auth.basic.find(b => b.key === 'password')?.value || '';
    } else if (authType === 'apikey' && auth.apikey) {
      document.getElementById('auth-apikey-key').value = auth.apikey.find(k => k.key === 'key')?.value || '';
      document.getElementById('auth-apikey-value').value = auth.apikey.find(v => v.key === 'value')?.value || '';
      document.getElementById('auth-apikey-in').value = auth.apikey.find(i => i.key === 'in')?.value || 'header';
    }
  }

  function setLoadingState(loading) {
    if (loading) {
      loadingOverlay.style.display = 'flex';
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    } else {
      loadingOverlay.style.display = 'none';
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  }

  // Assemble current form parameters into a standard Postman-like NovaItem request payload
  function assembleCurrentRequest() {
    const name = requestNameInput.value.trim() || 'Untitled Request';
    const method = methodSelect.value;
    const url = urlInput.value.trim();

    // Body
    const bodyMode = document.querySelector('input[name="body-type"]:checked').value;
    const reqBody = {
      mode: bodyMode
    };

    if (bodyMode === 'raw') {
      reqBody.raw = document.getElementById('body-raw-textarea').value;
      const lang = document.getElementById('body-language-select').value;
      reqBody.options = {
        raw: {
          language: lang
        }
      };
    } else if (bodyMode === 'urlencoded') {
      reqBody.urlencoded = getTableData('urlencoded-table');
    } else if (bodyMode === 'formdata') {
      reqBody.formdata = getTableData('formdata-table').map(f => ({
        key: f.key,
        value: f.value,
        type: 'text',
        disabled: false
      }));
    }

    // Assemble Authorization Configuration
    const authType = authTypeSelect.value;
    const reqAuth = {
      type: authType
    };

    if (authType === 'bearer') {
      reqAuth.bearer = [
        { key: 'token', value: document.getElementById('auth-bearer-token').value, type: 'string' }
      ];
    } else if (authType === 'basic') {
      reqAuth.basic = [
        { key: 'username', value: document.getElementById('auth-basic-username').value, type: 'string' },
        { key: 'password', value: document.getElementById('auth-basic-password').value, type: 'string' }
      ];
    } else if (authType === 'apikey') {
      reqAuth.apikey = [
        { key: 'key', value: document.getElementById('auth-apikey-key').value, type: 'string' },
        { key: 'value', value: document.getElementById('auth-apikey-value').value, type: 'string' },
        { key: 'in', value: document.getElementById('auth-apikey-in').value, type: 'string' }
      ];
    }

    return {
      id: currentRequestItem ? currentRequestItem.id : '',
      name: name,
      request: {
        method: method,
        url: {
          raw: url,
          protocol: url.split('://')[0] || 'http',
        },
        header: getTableData('headers-table'),
        body: reqBody,
        auth: reqAuth
      }
    };
  }

  // 5. Send & Save Execution Triggers
  sendBtn.addEventListener('click', () => {
    const payload = assembleCurrentRequest();
    vscode.postMessage({
      command: 'sendRequest',
      request: payload
    });
  });

  saveBtn.addEventListener('click', () => {
    const payload = assembleCurrentRequest();
    vscode.postMessage({
      command: 'saveRequest',
      request: payload
    });
  });

  // Switch environment selector
  envSelect.addEventListener('change', () => {
    const val = envSelect.value;
    activeEnvironmentId = val === 'none' ? null : val;
    // Notify VS Code to toggle workspace active env
    vscode.postMessage({
      command: 'ready', // Re-fetch variables list
    });
  });

  // 6. Response Renderer
  function renderResponse(res) {
    responsePlaceholder.style.display = 'none';
    responseContent.style.display = 'flex';
    responseStatusInfo.style.display = 'flex';

    // Status Badge Color Coding
    statusCodeBadge.textContent = `${res.status} ${res.statusText}`;
    statusCodeBadge.className = 'status-badge'; // reset
    if (res.status >= 200 && res.status < 300) {
      statusCodeBadge.classList.add('status-success');
    } else if (res.status >= 300 && res.status < 400) {
      statusCodeBadge.classList.add('status-warning');
    } else {
      statusCodeBadge.classList.add('status-error');
    }

    // Execution time & payload sizes
    responseTimeSpan.textContent = `${res.duration} ms`;
    responseSizeSpan.textContent = formatBytes(res.size);

    // Formatted Body Output
    const bodyStr = res.body;
    let formattedBody = bodyStr;
    try {
      // Try to prettify JSON
      const json = JSON.parse(bodyStr);
      formattedBody = JSON.stringify(json, null, 2);
    } catch (e) {
      // Not JSON, leave raw text
    }
    responseBodyCode.textContent = formattedBody;

    // Headers Table
    responseHeadersTableBody.innerHTML = '';
    if (res.headers) {
      for (const [key, value] of Object.entries(res.headers)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(key)}</strong></td>
          <td>${escapeHtml(value)}</td>
        `;
        responseHeadersTableBody.appendChild(tr);
      }
    }
  }

  // Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
})();
