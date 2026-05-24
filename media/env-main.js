(function () {
  const vscode = acquireVsCodeApi();

  const envTitle = document.getElementById('env-title');
  const envTableBody = document.querySelector('#env-table tbody');
  const addVarBtn = document.getElementById('add-var-btn');
  const saveEnvBtn = document.getElementById('save-env-btn');

  let activeEnvironment = null;

  // Tell VS Code extension host we are ready to receive data
  vscode.postMessage({ command: 'ready' });

  // Handle incoming messages from the extension host
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
      case 'loadEnvironment':
        activeEnvironment = message.environment;
        renderEnvironment(message.environment);
        break;
    }
  });

  // Render environment details in UI
  function renderEnvironment(env) {
    envTitle.textContent = `Environment: ${env.name}`;
    envTableBody.innerHTML = '';

    if (env.values && env.values.length > 0) {
      env.values.forEach((val) => {
        addVariableRow(val.key, val.value, val.enabled !== false, val.description || '');
      });
    } else {
      // Add one empty row initially if list is empty
      addVariableRow('', '', true, '');
    }
  }

  // Add an interactive variable row to the table
  function addVariableRow(key = '', value = '', enabled = true, description = '') {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td style="text-align: center; vertical-align: middle;">
        <input type="checkbox" class="var-enabled" ${enabled ? 'checked' : ''} style="cursor: pointer; transform: scale(1.1);" />
      </td>
      <td>
        <input type="text" class="table-input var-key" placeholder="variableName" value="${escapeHtml(key)}" />
      </td>
      <td>
        <input type="text" class="table-input var-value" placeholder="Value" value="${escapeHtml(value)}" />
      </td>
      <td>
        <input type="text" class="table-input var-desc" placeholder="Optional description..." value="${escapeHtml(description)}" />
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <button class="delete-row-btn" title="Delete Variable">×</button>
      </td>
    `;

    // Hook up delete action
    const deleteBtn = row.querySelector('.delete-row-btn');
    deleteBtn.addEventListener('click', () => {
      row.remove();
      // Ensure there's always at least one row
      if (envTableBody.children.length === 0) {
        addVariableRow('', '', true, '');
      }
    });

    envTableBody.appendChild(row);
  }

  // Hook up Add Variable button
  addVarBtn.addEventListener('click', () => {
    addVariableRow('', '', true, '');
  });

  // Save active variables back to Extension Host
  saveEnvBtn.addEventListener('click', () => {
    const variables = [];
    const rows = envTableBody.querySelectorAll('tr');

    rows.forEach((row) => {
      const keyInput = row.querySelector('.var-key');
      const valInput = row.querySelector('.var-value');
      const descInput = row.querySelector('.var-desc');
      const enabledCheckbox = row.querySelector('.var-enabled');

      const key = keyInput.value.trim();
      const value = valInput.value;
      const description = descInput.value.trim();
      const enabled = enabledCheckbox.checked;

      // Only save if key is not completely empty
      if (key) {
        variables.push({
          key,
          value,
          enabled,
          description
        });
      }
    });

    vscode.postMessage({
      command: 'saveVariables',
      variables: variables
    });
  });

  // Utility helper to escape raw HTML text inputs
  function escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
