import * as vscode from 'vscode';
import { StorageManager } from '../storage-manager';
import { NovaNode } from '../types';
import { NovaEditorPanel } from './panel';

export class NovaEnvironmentEditorPanel {
  public static currentPanel: NovaEnvironmentEditorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _currentNode: NovaNode | undefined;

  public static createOrShow(extensionUri: vscode.Uri, node: NovaNode) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel for this environment, reveal it.
    if (NovaEnvironmentEditorPanel.currentPanel && NovaEnvironmentEditorPanel.currentPanel.getNodeId() === node.filePath) {
      NovaEnvironmentEditorPanel.currentPanel._panel.reveal(column);
      return;
    }

    // If a panel is open but for a different environment, we can close it or revive it.
    if (NovaEnvironmentEditorPanel.currentPanel) {
      NovaEnvironmentEditorPanel.currentPanel.dispose();
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      'novaRESTEnvironmentEditor',
      `Env: ${node.name}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'out')
        ],
        retainContextWhenHidden: true,
      }
    );

    NovaEnvironmentEditorPanel.currentPanel = new NovaEnvironmentEditorPanel(panel, extensionUri, node);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, node: NovaNode) {
    if (NovaEnvironmentEditorPanel.currentPanel) {
      NovaEnvironmentEditorPanel.currentPanel.dispose();
    }
    NovaEnvironmentEditorPanel.currentPanel = new NovaEnvironmentEditorPanel(panel, extensionUri, node);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, node: NovaNode) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._currentNode = node;

    // Render HTML wrapper
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Listen for disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Keep track of panel state for session recovery
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready':
            await this.loadEnvironment(this._currentNode!);
            break;
          case 'saveVariables':
            await this.handleSaveVariables(message.variables);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public getNodeId(): string | undefined {
    return this._currentNode?.filePath;
  }

  public async loadEnvironment(node: NovaNode) {
    this._currentNode = node;
    this._panel.title = `Env: ${node.name}`;

    const storage = StorageManager.getInstance();
    const envs = await storage.loadEnvironments();
    const match = envs.find(e => e.filePath === node.filePath);

    if (!match) {
      vscode.window.showErrorMessage('Failed to load environment data.');
      return;
    }

    // Send environmental values to the webview UI
    this._panel.webview.postMessage({
      command: 'loadEnvironment',
      environment: match.environment,
      node: node,
    });
  }

  private async handleSaveVariables(variables: any[]) {
    if (!this._currentNode) {
      return;
    }

    try {
      const storage = StorageManager.getInstance();
      const envs = await storage.loadEnvironments();
      const match = envs.find(e => e.filePath === this._currentNode!.filePath);

      if (!match) {
        vscode.window.showErrorMessage('Failed to save variables: environment file not found.');
        return;
      }

      // Update variables values
      match.environment.values = variables;
      const fileName = vscode.Uri.file(match.filePath).path.split('/').pop()!;
      await storage.saveEnvironment(fileName, match.environment);

      vscode.window.showInformationMessage(`Environment "${match.environment.name}" variables saved.`);
      
      // Hot-reload request editor if active environment matches the saved one
      if (NovaEditorPanel.currentPanel) {
        await NovaEditorPanel.currentPanel.loadRequest(
          (NovaEditorPanel.currentPanel as any)._currentNode,
          match.filePath
        );
      }

      // Refresh Sidebar
      storage.setupWatchers();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save variables: ${err.message}`);
    }
  }

  public dispose() {
    NovaEnvironmentEditorPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'env-main.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>Nova Environment Editor</title>
      </head>
      <body>
        <div class="app-container">
          <header class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h2 id="env-title" style="margin: 0; font-size: 18px; font-weight: 600; background: var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Environment: loading...</h2>
                <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                  Define key-value pairs that can be referenced across request URLs, headers, and bodies as <code>{{variableName}}</code>.
                </div>
              </div>
              <div style="display: flex; gap: 10px;">
                <button id="save-env-btn" class="send-btn">Save Variables</button>
              </div>
            </div>
          </header>

          <div class="main-layout" style="height: calc(100vh - 100px);">
            <section class="pane" style="flex: 1; padding: 20px; overflow-y: auto;">
              <table class="kv-table" id="env-table">
                <thead>
                  <tr>
                    <th width="5%"></th>
                    <th width="30%">Variable Key</th>
                    <th width="40%">Value</th>
                    <th width="20%">Description</th>
                    <th width="5%"></th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Populated by JavaScript -->
                </tbody>
              </table>
              <button class="add-row-btn" id="add-var-btn">+ Add Variable</button>
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
