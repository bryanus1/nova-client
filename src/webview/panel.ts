import * as vscode from 'vscode';
import { StorageManager } from '../storage-manager';
import { RequestEngine } from '../request-engine';
import { VariableResolver } from '../variable-resolver';
import { NovaNode, NovaItem, NovaEnvironment } from '../types';

export class NovaEditorPanel {
  public static currentPanel: NovaEditorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  // Keeps track of the current request node being edited
  private _currentNode: NovaNode | undefined;
  private _activeEnvironment: NovaEnvironment | null = null;

  public static createOrShow(extensionUri: vscode.Uri, node: NovaNode, activeEnvId: string | null) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (NovaEditorPanel.currentPanel) {
      NovaEditorPanel.currentPanel._panel.reveal(column);
      NovaEditorPanel.currentPanel.loadRequest(node, activeEnvId);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      'novaRESTEditor',
      `Nova REST Client`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'out')
        ],
        retainContextWhenHidden: true, // Keep the webview state (tabs, inputs) when tab is unfocused
      }
    );

    NovaEditorPanel.currentPanel = new NovaEditorPanel(panel, extensionUri, node, activeEnvId);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, node: NovaNode, activeEnvId: string | null) {
    if (NovaEditorPanel.currentPanel) {
      NovaEditorPanel.currentPanel.dispose();
    }
    NovaEditorPanel.currentPanel = new NovaEditorPanel(panel, extensionUri, node, activeEnvId);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    node: NovaNode,
    activeEnvId: string | null
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._currentNode = node;

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready':
            await this.loadRequest(this._currentNode!, activeEnvId);
            break;
          case 'sendRequest':
            await this.handleSendRequest(message.request);
            break;
          case 'saveRequest':
            await this.handleSaveRequest(message.request);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public async loadRequest(node: NovaNode, activeEnvId: string | null) {
    this._currentNode = node;
    this._panel.title = `Nova: ${node.name}`;

    const storage = StorageManager.getInstance();
    
    // Load collection item
    const cols = await storage.loadCollections();
    const collectionEntry = cols.find(c => c.filePath === node.collectionId);
    if (!collectionEntry) {
      vscode.window.showErrorMessage('Failed to load request collection.');
      return;
    }

    const item = this.findItemByPathIndex(collectionEntry.collection.item, node.requestIndex!);
    if (!item || !item.request) {
      vscode.window.showErrorMessage('Failed to load request data.');
      return;
    }

    // Load environments for selector
    const envs = await storage.loadEnvironments();
    const envEntries = envs.map(e => e.environment);
    this._activeEnvironment = envs.find(e => e.environment.id === activeEnvId || e.filePath === activeEnvId)?.environment || null;

    // Load local .env
    await VariableResolver.loadLocalEnv();

    // Send payload to Webview
    this._panel.webview.postMessage({
      command: 'loadRequest',
      node: node,
      requestItem: item,
      environments: envEntries,
      activeEnvironmentId: activeEnvId,
    });
  }

  private async handleSendRequest(requestPayload: NovaItem) {
    if (!requestPayload.request) {
      return;
    }

    this._panel.webview.postMessage({ command: 'setLoading', loading: true });

    try {
      // Load local .env variables
      await VariableResolver.loadLocalEnv();

      // Execute request
      const response = await RequestEngine.execute(requestPayload.request, this._activeEnvironment);

      // Return response
      this._panel.webview.postMessage({
        command: 'responseReceived',
        response: response,
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Request execution error: ${err.message}`);
      this._panel.webview.postMessage({ command: 'setLoading', loading: false });
    }
  }

  private async handleSaveRequest(requestPayload: NovaItem) {
    if (!this._currentNode) {
      return;
    }

    const storage = StorageManager.getInstance();
    const cols = await storage.loadCollections();
    const collectionEntry = cols.find(c => c.filePath === this._currentNode!.collectionId);
    
    if (!collectionEntry) {
      vscode.window.showErrorMessage('Error saving: collection not found.');
      return;
    }

    // Modify the item in place in the collection tree
    const success = this.updateItemByPathIndex(
      collectionEntry.collection.item,
      this._currentNode!.requestIndex!,
      requestPayload
    );

    if (success) {
      await storage.saveCollection(
        vscode.Uri.file(this._currentNode!.collectionId!).path.split('/').pop()!,
        collectionEntry.collection
      );
      
      // Update label in UI tab if renamed
      this._currentNode.name = requestPayload.name;
      this._panel.title = `Nova: ${requestPayload.name}`;
      
      vscode.window.showInformationMessage('Request saved successfully.');
      storage.setupWatchers(); // Trigger explorer refresh
    } else {
      vscode.window.showErrorMessage('Error saving request data.');
    }
  }

  private findItemByPathIndex(items: NovaItem[], index: number[]): NovaItem | null {
    let current: NovaItem | null = null;
    let list = items;

    for (let i = 0; i < index.length; i++) {
      const idx = index[i];
      if (idx < 0 || idx >= list.length) {
        return null;
      }
      current = list[idx];
      if (i < index.length - 1) {
        if (!current.item) {
          return null;
        }
        list = current.item;
      }
    }

    return current;
  }

  private updateItemByPathIndex(items: NovaItem[], index: number[], updated: NovaItem): boolean {
    let list = items;

    for (let i = 0; i < index.length; i++) {
      const idx = index[i];
      if (idx < 0 || idx >= list.length) {
        return false;
      }
      if (i === index.length - 1) {
        // Preserving sub-items if present
        const subItems = list[idx].item;
        list[idx] = updated;
        if (subItems) {
          list[idx].item = subItems;
        }
        return true;
      } else {
        if (!list[idx].item) {
          return false;
        }
        list = list[idx].item!;
      }
    }
    return false;
  }

  public dispose() {
    NovaEditorPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Local path to main script/css run in the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );

    // Use a nonce to only allow specific scripts to run
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!--
          Use a content security policy to only allow loading images from https or our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>Nova REST Client</title>
      </head>
      <body>
        <div class="app-container">
           <!-- Header (Request Line) -->
          <header class="header">
            <div class="meta-line" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 20px;">
              <div class="request-name-container" style="flex-grow: 1; display: flex; align-items: center; gap: 8px;">
                <input type="text" id="request-name-input" class="request-name-input" placeholder="Request name..." style="font-size: 16px; font-weight: 600; border-bottom: 1px dashed var(--glass-border); padding: 4px 0; width: 100%;" />
              </div>
              <div class="environment-container" style="display: flex; align-items: center; gap: 8px;">
                <span class="label">Environment:</span>
                <select id="env-select" class="env-select">
                  <option value="none">No Environment</option>
                </select>
              </div>
            </div>
            <div class="request-line">
              <select id="method-select" class="method-select">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>
              <div class="input-container">
                <input type="text" id="url-input" class="url-input" placeholder="Enter request URL (e.g. {{baseUrl}}/users) ..." />
              </div>
              <button id="send-btn" class="send-btn">Send</button>
              <button id="save-btn" class="save-btn">Save</button>
            </div>
          </header>

          <!-- Main Layout Split: Left (Request details), Right (Response details) -->
          <div class="main-layout">
            <!-- Left Panel: Request Configuration -->
            <section class="pane request-pane">
              <div class="tabs-header" id="request-tabs">
                <button class="tab-btn active" data-tab="params">Params</button>
                <button class="tab-btn" data-tab="headers">Headers</button>
                <button class="tab-btn" data-tab="body">Body</button>
                <button class="tab-btn" data-tab="auth">Auth</button>
              </div>
              
              <div class="tab-content active" id="tab-params">
                <div class="section-title">Query Parameters</div>
                <table class="kv-table" id="params-table">
                  <thead>
                    <tr>
                      <th width="35%">Key</th>
                      <th width="45%">Value</th>
                      <th width="15%">Description</th>
                      <th width="5%"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- JS will populate rows dynamically -->
                  </tbody>
                </table>
                <button class="add-row-btn" id="add-param-btn">+ Add Parameter</button>
              </div>

              <div class="tab-content" id="tab-headers">
                <div class="section-title">Headers</div>
                <table class="kv-table" id="headers-table">
                  <thead>
                    <tr>
                      <th width="35%">Key</th>
                      <th width="45%">Value</th>
                      <th width="15%">Description</th>
                      <th width="5%"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- JS will populate rows dynamically -->
                  </tbody>
                </table>
                <button class="add-row-btn" id="add-header-btn">+ Add Header</button>
              </div>

              <div class="tab-content" id="tab-body">
                <div class="body-options-line">
                  <label><input type="radio" name="body-type" value="none" checked> None</label>
                  <label><input type="radio" name="body-type" value="raw"> Raw (JSON/Text)</label>
                  <label><input type="radio" name="body-type" value="urlencoded"> x-www-form-urlencoded</label>
                  <label><input type="radio" name="body-type" value="formdata"> form-data</label>
                </div>
                
                <div class="body-container none-body active-body-tab" id="body-none-container">
                  <div class="empty-state">This request does not have a body.</div>
                </div>

                <div class="body-container raw-body" id="body-raw-container">
                  <div class="raw-format-select-container">
                    <span>Language:</span>
                    <select id="body-language-select" class="mini-select">
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="html">HTML</option>
                      <option value="xml">XML</option>
                    </select>
                  </div>
                  <textarea id="body-raw-textarea" class="code-textarea" placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}"></textarea>
                </div>

                <div class="body-container urlencoded-body" id="body-urlencoded-container">
                  <table class="kv-table" id="urlencoded-table">
                    <thead>
                      <tr>
                        <th width="35%">Key</th>
                        <th width="45%">Value</th>
                        <th width="15%">Description</th>
                        <th width="5%"></th>
                      </tr>
                    </thead>
                    <tbody>
                    </tbody>
                  </table>
                  <button class="add-row-btn" id="add-urlencoded-btn">+ Add Form Field</button>
                </div>

                <div class="body-container formdata-body" id="body-formdata-container">
                  <table class="kv-table" id="formdata-table">
                    <thead>
                      <tr>
                        <th width="35%">Key</th>
                        <th width="45%">Value</th>
                        <th width="15%">Description</th>
                        <th width="5%"></th>
                      </tr>
                    </thead>
                    <tbody>
                    </tbody>
                  </table>
                  <button class="add-row-btn" id="add-formdata-btn">+ Add Field</button>
                </div>
              </div>

              <div class="tab-content" id="tab-auth">
                <div class="section-title">Authorization</div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                  <span class="label">Type:</span>
                  <select id="auth-type-select" class="mini-select">
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="apikey">API Key</option>
                  </select>
                </div>
                
                <div class="auth-fields-container active-auth-fields" id="auth-none-container">
                  <div class="empty-state" style="padding: 20px;">This request does not use authorization.</div>
                </div>

                <div class="auth-fields-container" id="auth-bearer-container" style="display: none; flex-direction: column; gap: 8px;">
                  <span class="label">Token:</span>
                  <input type="text" id="auth-bearer-token" class="table-input" placeholder="Enter Bearer Token (e.g. {{myToken}})" style="width: 100%;" />
                </div>

                <div class="auth-fields-container" id="auth-basic-container" style="display: none; flex-direction: column; gap: 8px;">
                  <div style="display: flex; gap: 10px;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      <span class="label">Username:</span>
                      <input type="text" id="auth-basic-username" class="table-input" placeholder="Username" />
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      <span class="label">Password:</span>
                      <input type="password" id="auth-basic-password" class="table-input" placeholder="Password" />
                    </div>
                  </div>
                </div>

                <div class="auth-fields-container" id="auth-apikey-container" style="display: none; flex-direction: column; gap: 8px;">
                  <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      <span class="label">Key:</span>
                      <input type="text" id="auth-apikey-key" class="table-input" placeholder="X-API-Key" />
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                      <span class="label">Value:</span>
                      <input type="text" id="auth-apikey-value" class="table-input" placeholder="Value" />
                    </div>
                  </div>
                  <span class="label">Add to:</span>
                  <select id="auth-apikey-in" class="mini-select" style="align-self: flex-start;">
                    <option value="header">Header</option>
                    <option value="query">Query Params</option>
                  </select>
                </div>
              </div>
            </section>

            <!-- Right Panel: Response Pane -->
            <section class="pane response-pane">
              <div class="response-header">
                <div class="response-title">Response</div>
                <div class="response-status-info" id="response-status-info" style="display: none;">
                  <span class="status-badge" id="status-code">200 OK</span>
                  <span class="status-meta">Time: <strong id="response-time">45 ms</strong></span>
                  <span class="status-meta">Size: <strong id="response-size">1.2 KB</strong></span>
                </div>
              </div>

              <!-- Loader -->
              <div class="loading-overlay" id="loading-overlay">
                <div class="spinner"></div>
                <div class="loading-text">Executing request...</div>
              </div>

              <div class="response-body-placeholder" id="response-placeholder">
                <div class="empty-state">
                  <div class="icon">⚡</div>
                  <div>Enter URL and click <strong>Send</strong> to execute the API call.</div>
                </div>
              </div>

              <div class="response-content" id="response-content" style="display: none;">
                <div class="tabs-header" id="response-tabs">
                  <button class="tab-btn active" data-tab="res-body">Body</button>
                  <button class="tab-btn" data-tab="res-headers">Headers</button>
                </div>
                
                <div class="tab-content active" id="tab-res-body">
                  <pre class="response-body-pre"><code id="response-body-code"></code></pre>
                </div>

                <div class="tab-content" id="tab-res-headers">
                  <table class="kv-table" id="res-headers-table">
                    <thead>
                      <tr>
                        <th width="40%">Header</th>
                        <th width="60%">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <!-- JS will populate -->
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
