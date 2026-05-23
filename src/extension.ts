import * as vscode from 'vscode';
import { StorageManager } from './storage-manager';
import { NovaExplorerProvider } from './nova-explorer';
import { NovaEditorPanel } from './webview/panel';
import { NovaNode, NovaCollection, NovaItem, NovaEnvironment } from './types';

export function activate(context: vscode.ExtensionContext) {
  const storageManager = StorageManager.getInstance();
  const explorerProvider = new NovaExplorerProvider();

  // Register Tree View
  const treeView = vscode.window.createTreeView('nova-client-explorer', {
    treeDataProvider: explorerProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // Command: Refresh Explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.refreshExplorer', () => {
      explorerProvider.refresh();
      vscode.window.showInformationMessage('Nova Client explorer refreshed.');
    })
  );

  // Command: Create Collection
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.createCollection', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter Collection Name',
        placeHolder: 'e.g. User API',
        validateInput: (value) => (value.trim() ? null : 'Name is required'),
      });

      if (!name) {
        return;
      }

      const newCollection: NovaCollection = {
        info: {
          name: name,
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      try {
        await storageManager.saveCollection(`${name.toLowerCase().replace(/\s+/g, '-')}`, newCollection);
        explorerProvider.refresh();
        vscode.window.showInformationMessage(`Collection "${name}" created successfully.`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create collection: ${err.message}`);
      }
    })
  );

  // Command: Create Environment
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.createEnvironment', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter Environment Name',
        placeHolder: 'e.g. Local Development',
        validateInput: (value) => (value.trim() ? null : 'Name is required'),
      });

      if (!name) {
        return;
      }

      const newEnv: NovaEnvironment = {
        id: `env-${Date.now()}`,
        name: name,
        values: [
          { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
        ],
        _postman_variable_scope: 'environment',
      };

      try {
        await storageManager.saveEnvironment(`${name.toLowerCase().replace(/\s+/g, '-')}`, newEnv);
        explorerProvider.refresh();
        vscode.window.showInformationMessage(`Environment "${name}" created successfully.`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create environment: ${err.message}`);
      }
    })
  );

  // Command: Create Request
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.createRequest', async (node: NovaNode) => {
      if (!node || (node.type !== 'collection' && node.type !== 'folder')) {
        vscode.window.showErrorMessage('Please select a collection or a folder to create a request in.');
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter Request Name',
        placeHolder: 'e.g. Get User Profile',
        validateInput: (value) => (value.trim() ? null : 'Request name is required'),
      });

      if (!name) {
        return;
      }

      const newRequestItem: NovaItem = {
        id: `req-${Date.now()}`,
        name: name,
        request: {
          method: 'GET',
          url: '{{baseUrl}}/api/v1/resource',
          header: [
            { key: 'Accept', value: 'application/json', disabled: false }
          ],
          body: {
            mode: 'none'
          }
        }
      };

      try {
        const loadedCols = await storageManager.loadCollections();
        const collectionEntry = loadedCols.find(c => c.filePath === node.collectionId);
        if (!collectionEntry) {
          throw new Error('Collection not found.');
        }

        if (node.type === 'collection') {
          collectionEntry.collection.item.push(newRequestItem);
        } else if (node.type === 'folder') {
          const folder = findItemByPathIndex(collectionEntry.collection.item, node.requestIndex!);
          if (folder) {
            folder.item = folder.item || [];
            folder.item.push(newRequestItem);
          }
        }

        const fileName = vscode.Uri.file(node.collectionId!).path.split('/').pop()!;
        await storageManager.saveCollection(fileName, collectionEntry.collection);
        explorerProvider.refresh();
        vscode.window.showInformationMessage(`Request "${name}" created successfully.`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create request: ${err.message}`);
      }
    })
  );

  // Command: Create Folder
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.createFolder', async (node: NovaNode) => {
      if (!node || (node.type !== 'collection' && node.type !== 'folder')) {
        vscode.window.showErrorMessage('Select a collection or folder to add a sub-folder.');
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter Folder Name',
        placeHolder: 'e.g. Auth Flow',
        validateInput: (value) => (value.trim() ? null : 'Folder name is required'),
      });

      if (!name) {
        return;
      }

      const newFolderItem: NovaItem = {
        id: `folder-${Date.now()}`,
        name: name,
        item: []
      };

      try {
        const loadedCols = await storageManager.loadCollections();
        const collectionEntry = loadedCols.find(c => c.filePath === node.collectionId);
        if (!collectionEntry) {
          throw new Error('Collection not found.');
        }

        if (node.type === 'collection') {
          collectionEntry.collection.item.push(newFolderItem);
        } else if (node.type === 'folder') {
          const parentFolder = findItemByPathIndex(collectionEntry.collection.item, node.requestIndex!);
          if (parentFolder) {
            parentFolder.item = parentFolder.item || [];
            parentFolder.item.push(newFolderItem);
          }
        }

        const fileName = vscode.Uri.file(node.collectionId!).path.split('/').pop()!;
        await storageManager.saveCollection(fileName, collectionEntry.collection);
        explorerProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create folder: ${err.message}`);
      }
    })
  );

  // Command: Open Request in Webview
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.openRequest', (node: NovaNode) => {
      if (node && node.type === 'request') {
        NovaEditorPanel.createOrShow(
          context.extensionUri,
          node,
          explorerProvider.getActiveEnvironmentId()
        );
      }
    })
  );

  // Command: Select Environment
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.selectEnvironment', (node: NovaNode) => {
      if (node && node.type === 'environment') {
        const activeId = node.filePath!;
        explorerProvider.setActiveEnvironmentId(activeId);
        
        // Notify active panel if it exists to reload active env vars
        if (NovaEditorPanel.currentPanel) {
          NovaEditorPanel.currentPanel.loadRequest(
            (NovaEditorPanel.currentPanel as any)._currentNode,
            activeId
          );
        }
        
        vscode.window.showInformationMessage(`Active environment: "${node.name}"`);
      }
    })
  );

  // Command: Delete Item
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.deleteItem', async (node: NovaNode) => {
      if (!node) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${node.name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') {
        return;
      }

      try {
        if (node.type === 'collection' || node.type === 'environment') {
          // Delete file directly
          await storageManager.deleteFile(node.filePath!);
          if (node.type === 'environment' && explorerProvider.getActiveEnvironmentId() === node.filePath) {
            explorerProvider.setActiveEnvironmentId(null);
          }
          explorerProvider.refresh();
          vscode.window.showInformationMessage(`Deleted "${node.name}".`);
        } else if (node.type === 'request' || node.type === 'folder') {
          // Modify collection item in place
          const loadedCols = await storageManager.loadCollections();
          const collectionEntry = loadedCols.find(c => c.filePath === node.collectionId);
          if (!collectionEntry) {
            throw new Error('Collection file not found.');
          }

          deleteItemByPathIndex(collectionEntry.collection.item, node.requestIndex!);

          const fileName = vscode.Uri.file(node.collectionId!).path.split('/').pop()!;
          await storageManager.saveCollection(fileName, collectionEntry.collection);
          
          explorerProvider.refresh();
          vscode.window.showInformationMessage(`Deleted "${node.name}".`);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to delete item: ${err.message}`);
      }
    })
  );

  // Command: Rename Item
  context.subscriptions.push(
    vscode.commands.registerCommand('nova-client.renameItem', async (node: NovaNode) => {
      if (!node) {
        return;
      }

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${node.name}"`,
        value: node.name,
        validateInput: (val) => (val.trim() ? null : 'Name is required'),
      });

      if (!newName || newName === node.name) {
        return;
      }

      try {
        if (node.type === 'collection') {
          const loaded = await storageManager.loadCollections();
          const match = loaded.find(c => c.filePath === node.filePath);
          if (match) {
            match.collection.info.name = newName;
            const fileName = vscode.Uri.file(node.filePath!).path.split('/').pop()!;
            await storageManager.saveCollection(fileName, match.collection);
            explorerProvider.refresh();
          }
        } else if (node.type === 'environment') {
          const loaded = await storageManager.loadEnvironments();
          const match = loaded.find(c => c.filePath === node.filePath);
          if (match) {
            match.environment.name = newName;
            const fileName = vscode.Uri.file(node.filePath!).path.split('/').pop()!;
            await storageManager.saveEnvironment(fileName, match.environment);
            explorerProvider.refresh();
          }
        } else if (node.type === 'request' || node.type === 'folder') {
          const loadedCols = await storageManager.loadCollections();
          const collectionEntry = loadedCols.find(c => c.filePath === node.collectionId);
          if (!collectionEntry) {
             throw new Error('Collection file not found.');
          }

          const item = findItemByPathIndex(collectionEntry.collection.item, node.requestIndex!);
          if (item) {
            item.name = newName;
            const fileName = vscode.Uri.file(node.collectionId!).path.split('/').pop()!;
            await storageManager.saveCollection(fileName, collectionEntry.collection);
            explorerProvider.refresh();
          }
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to rename: ${err.message}`);
      }
    })
  );

  // Watch for workspace configuration or folder changes
  const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    storageManager.setupWatchers();
    explorerProvider.refresh();
  });

  context.subscriptions.push(workspaceListener);
}

export function deactivate() {
  StorageManager.getInstance().dispose();
}

// Tree Traversal Helpers
function findItemByPathIndex(items: NovaItem[], index: number[]): NovaItem | null {
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

function deleteItemByPathIndex(items: NovaItem[], index: number[]): boolean {
  let list = items;

  for (let i = 0; i < index.length; i++) {
    const idx = index[i];
    if (idx < 0 || idx >= list.length) {
      return false;
    }
    if (i === index.length - 1) {
      list.splice(idx, 1);
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
