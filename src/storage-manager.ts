import * as vscode from 'vscode';
import { NovaCollection, NovaEnvironment } from './types';

export class StorageManager {
  private static instance: StorageManager;
  private onDidChangeDataEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeData = this.onDidChangeDataEmitter.event;

  private watchers: vscode.FileSystemWatcher[] = [];

  private constructor() {
    this.setupWatchers();
  }

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Refreshes file watchers when workspace folders change.
   */
  public setupWatchers() {
    // Clear existing watchers
    this.watchers.forEach(w => w.dispose());
    this.watchers = [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      const collectionsPattern = new vscode.RelativePattern(
        folder,
        '.vscode/nova-client/collections/**/*.json'
      );
      const environmentsPattern = new vscode.RelativePattern(
        folder,
        '.vscode/nova-client/environments/**/*.json'
      );

      const colWatcher = vscode.workspace.createFileSystemWatcher(collectionsPattern);
      const envWatcher = vscode.workspace.createFileSystemWatcher(environmentsPattern);

      const triggerChange = () => {
        this.onDidChangeDataEmitter.fire();
      };

      colWatcher.onDidCreate(triggerChange);
      colWatcher.onDidChange(triggerChange);
      colWatcher.onDidDelete(triggerChange);

      envWatcher.onDidCreate(triggerChange);
      envWatcher.onDidChange(triggerChange);
      envWatcher.onDidDelete(triggerChange);

      this.watchers.push(colWatcher, envWatcher);
    }
  }

  public dispose() {
    this.watchers.forEach(w => w.dispose());
  }

  /**
   * Gets the base directory for Nova Client in the first active workspace folder.
   */
  private getBaseUri(): vscode.Uri | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'nova-client');
  }

  private getCollectionsUri(): vscode.Uri | null {
    const base = this.getBaseUri();
    return base ? vscode.Uri.joinPath(base, 'collections') : null;
  }

  private getEnvironmentsUri(): vscode.Uri | null {
    const base = this.getBaseUri();
    return base ? vscode.Uri.joinPath(base, 'environments') : null;
  }

  /**
   * Ensures the directories for collections and environments exist.
   */
  private async ensureDirectoriesExist(): Promise<void> {
    const base = this.getBaseUri();
    const cols = this.getCollectionsUri();
    const envs = this.getEnvironmentsUri();

    if (!base || !cols || !envs) {
      throw new Error('No active workspace open.');
    }

    try {
      await vscode.workspace.fs.createDirectory(base);
      await vscode.workspace.fs.createDirectory(cols);
      await vscode.workspace.fs.createDirectory(envs);
    } catch (e) {
      // Ignore if directory already exists
    }
  }

  /**
   * Helper to write a JSON file to a given URI.
   */
  private async writeJsonFile(uri: vscode.Uri, data: any): Promise<void> {
    const encoder = new TextEncoder();
    const stringified = JSON.stringify(data, null, 2);
    const uint8 = encoder.encode(stringified);
    await vscode.workspace.fs.writeFile(uri, uint8);
  }

  /**
   * Helper to read a JSON file from a given URI.
   */
  private async readJsonFile<T>(uri: vscode.Uri): Promise<T> {
    const uint8 = await vscode.workspace.fs.readFile(uri);
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(uint8);
    return JSON.parse(text) as T;
  }

  /**
   * Loads all collections from workspace.
   */
  public async loadCollections(): Promise<{ filePath: string; collection: NovaCollection }[]> {
    const colsUri = this.getCollectionsUri();
    if (!colsUri) {
      return [];
    }

    await this.ensureDirectoriesExist();

    try {
      const files = await vscode.workspace.fs.readDirectory(colsUri);
      const collections: { filePath: string; collection: NovaCollection }[] = [];

      for (const [name, type] of files) {
        if (type === vscode.FileType.File && name.endsWith('.json')) {
          const fileUri = vscode.Uri.joinPath(colsUri, name);
          try {
            const collection = await this.readJsonFile<NovaCollection>(fileUri);
            collections.push({ filePath: fileUri.fsPath, collection });
          } catch (err) {
            console.error(`Error loading collection ${name}:`, err);
          }
        }
      }
      return collections;
    } catch (e) {
      return [];
    }
  }

  /**
   * Saves a collection.
   */
  public async saveCollection(fileName: string, collection: NovaCollection): Promise<string> {
    const colsUri = this.getCollectionsUri();
    if (!colsUri) {
      throw new Error('No active workspace open.');
    }

    await this.ensureDirectoriesExist();

    const cleanName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const fileUri = vscode.Uri.joinPath(colsUri, cleanName);

    await this.writeJsonFile(fileUri, collection);
    return fileUri.fsPath;
  }

  /**
   * Deletes a collection file.
   */
  public async deleteFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
    this.onDidChangeDataEmitter.fire();
  }

  /**
   * Loads all environments from workspace.
   */
  public async loadEnvironments(): Promise<{ filePath: string; environment: NovaEnvironment }[]> {
    const envsUri = this.getEnvironmentsUri();
    if (!envsUri) {
      return [];
    }

    await this.ensureDirectoriesExist();

    try {
      const files = await vscode.workspace.fs.readDirectory(envsUri);
      const environments: { filePath: string; environment: NovaEnvironment }[] = [];

      for (const [name, type] of files) {
        if (type === vscode.FileType.File && name.endsWith('.json')) {
          const fileUri = vscode.Uri.joinPath(envsUri, name);
          try {
            const environment = await this.readJsonFile<NovaEnvironment>(fileUri);
            environments.push({ filePath: fileUri.fsPath, environment });
          } catch (err) {
            console.error(`Error loading environment ${name}:`, err);
          }
        }
      }
      return environments;
    } catch (e) {
      return [];
    }
  }

  /**
   * Saves an environment.
   */
  public async saveEnvironment(fileName: string, environment: NovaEnvironment): Promise<string> {
    const envsUri = this.getEnvironmentsUri();
    if (!envsUri) {
      throw new Error('No active workspace open.');
    }

    await this.ensureDirectoriesExist();

    const cleanName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const fileUri = vscode.Uri.joinPath(envsUri, cleanName);

    await this.writeJsonFile(fileUri, environment);
    return fileUri.fsPath;
  }
}
