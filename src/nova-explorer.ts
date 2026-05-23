import * as vscode from 'vscode';
import { StorageManager } from './storage-manager';
import { NovaNode, NovaItem } from './types';

export class NovaExplorerProvider implements vscode.TreeDataProvider<NovaNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<NovaNode | undefined | null | void> =
    new vscode.EventEmitter<NovaNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<NovaNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private storageManager = StorageManager.getInstance();
  private activeEnvironmentId: string | null = null;

  constructor() {
    // Listen to changes in the workspace files to refresh automatically
    this.storageManager.onDidChangeData(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getActiveEnvironmentId(): string | null {
    return this.activeEnvironmentId;
  }

  public setActiveEnvironmentId(id: string | null): void {
    this.activeEnvironmentId = id;
    this.refresh();
  }

  getTreeItem(element: NovaNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.name);
    item.id = element.id;

    if (element.type === 'collection') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      item.contextValue = 'collection';
      item.iconPath = new vscode.ThemeIcon('repo');
    } else if (element.type === 'folder') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      item.contextValue = 'folder';
      item.iconPath = new vscode.ThemeIcon('folder');
    } else if (element.type === 'request') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.None;
      item.contextValue = 'request';
      
      // Determine HTTP method and show it as description
      let method = 'GET';
      if (element.id) {
        // We'll read the request data
        const reqNode = element as any;
        if (reqNode.method) {
          method = reqNode.method.toUpperCase();
        }
      }
      item.description = method;
      item.iconPath = new vscode.ThemeIcon('api');
      
      // Add command to open request on double-click or click
      item.command = {
        command: 'nova-client.openRequest',
        title: 'Open Request',
        arguments: [element],
      };
    } else if (element.type === 'environments-header') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      item.contextValue = 'environments-header';
      item.iconPath = new vscode.ThemeIcon('variables');
    } else if (element.type === 'environment') {
      item.collapsibleState = vscode.TreeItemCollapsibleState.None;
      item.contextValue = 'environment';
      
      const isActive = element.environmentId === this.activeEnvironmentId;
      if (isActive) {
        item.description = 'Active';
        item.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
      } else {
        item.iconPath = new vscode.ThemeIcon('circle-outline');
      }

      item.command = {
        command: 'nova-client.selectEnvironment',
        title: 'Select Environment',
        arguments: [element],
      };
    }

    return item;
  }

  async getChildren(element?: NovaNode): Promise<NovaNode[]> {
    if (!element) {
      // 1. Load Collections & Environments
      const loadedCols = await this.storageManager.loadCollections();
      const loadedEnvs = await this.storageManager.loadEnvironments();

      // If both are completely empty, return [] to trigger VS Code's Welcome View
      if (loadedCols.length === 0 && loadedEnvs.length === 0) {
        return [];
      }

      const rootNodes: NovaNode[] = [];

      // Populate Collections
      for (const entry of loadedCols) {
        rootNodes.push({
          id: entry.filePath, // File path acts as unique ID for the collection
          name: entry.collection.info.name,
          type: 'collection',
          collectionId: entry.filePath,
          filePath: entry.filePath,
        });
      }

      // 2. Add Environments Header
      rootNodes.push({
        id: 'environments-header',
        name: 'Environments',
        type: 'environments-header',
      });

      return rootNodes;
    }

    if (element.type === 'environments-header') {
      // Render list of environments under the header
      const envs = await this.storageManager.loadEnvironments();
      return envs.map(entry => ({
        id: entry.filePath,
        name: entry.environment.name,
        type: 'environment',
        environmentId: entry.environment.id || entry.filePath,
        filePath: entry.filePath,
      }));
    }

    if (element.type === 'collection') {
      // Return top-level items of the collection
      const loadedCols = await this.storageManager.loadCollections();
      const match = loadedCols.find(c => c.filePath === element.filePath);
      if (!match) {
        return [];
      }
      return this.getItemsAsNodes(match.collection.item, element.filePath!, []);
    }

    if (element.type === 'folder') {
      // Navigate to folder and return its children
      const loadedCols = await this.storageManager.loadCollections();
      const match = loadedCols.find(c => c.filePath === element.collectionId);
      if (!match) {
        return [];
      }

      const folderItem = this.findItemByPathIndex(match.collection.item, element.requestIndex!);
      if (!folderItem || !folderItem.item) {
        return [];
      }

      return this.getItemsAsNodes(folderItem.item, element.collectionId!, element.requestIndex!);
    }

    return [];
  }

  private getItemsAsNodes(items: NovaItem[], collectionId: string, parentIndex: number[]): NovaNode[] {
    if (!items) {
      return [];
    }

    return items.map((item, idx) => {
      const currentIndex = [...parentIndex, idx];
      const isRequest = !!item.request;

      // Cast as dynamic to carry method info for rendering
      const node: any = {
        id: `${collectionId}-${currentIndex.join('-')}`,
        name: item.name,
        type: isRequest ? 'request' : 'folder',
        collectionId: collectionId,
        requestIndex: currentIndex,
      };

      if (isRequest && item.request) {
        node.method = typeof item.request.method === 'string' ? item.request.method : 'GET';
      }

      return node as NovaNode;
    });
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
}
