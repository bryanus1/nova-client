import * as vscode from 'vscode';
import { NovaEnvironment } from './types';

export class VariableResolver {
  private static localEnvVariables: Record<string, string> = {};

  /**
   * Loads local .env file variables from the workspace root if present.
   */
  public static async loadLocalEnv(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.localEnvVariables = {};
      return;
    }

    const envUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.env');
    try {
      const uint8 = await vscode.workspace.fs.readFile(envUri);
      const content = new TextDecoder('utf-8').decode(uint8);
      const parsed: Record<string, string> = {};
      
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual > 0) {
            const key = trimmed.slice(0, firstEqual).trim();
            let value = trimmed.slice(firstEqual + 1).trim();
            // Remove wrapping quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            parsed[key] = value;
          }
        }
      }
      this.localEnvVariables = parsed;
    } catch (e) {
      // .env doesn't exist or is not readable, ignore silently
      this.localEnvVariables = {};
    }
  }

  /**
   * Resolves a string containing {{variableName}} templates using the active environment and .env overrides.
   */
  public static resolve(text: string, activeEnv?: NovaEnvironment | null): string {
    if (!text) {
      return text;
    }

    // Build values mapping
    const valuesMap: Record<string, string> = {};

    // 1. Add active environment variables
    if (activeEnv && activeEnv.values) {
      for (const val of activeEnv.values) {
        if (val.enabled) {
          valuesMap[val.key] = val.value;
        }
      }
    }

    // 2. Override with local .env file values (highest priority for secret keys)
    for (const [key, value] of Object.entries(this.localEnvVariables)) {
      valuesMap[key] = value;
    }

    // Regex to match {{variableName}}
    const regex = /\{\{([^}]+)\}\}/g;
    return text.replace(regex, (match, key) => {
      const trimmedKey = key.trim();
      if (trimmedKey in valuesMap) {
        return valuesMap[trimmedKey];
      }
      return match; // Return unchanged if variable not found
    });
  }

  /**
   * Helper to resolve variables in an entire nested object or array.
   */
  public static resolveObject<T>(obj: T, activeEnv?: NovaEnvironment | null): T {
    if (typeof obj === 'string') {
      return this.resolve(obj, activeEnv) as unknown as T;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, activeEnv)) as unknown as T;
    }

    if (obj !== null && typeof obj === 'object') {
      const resolvedObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        resolvedObj[k] = this.resolveObject(v, activeEnv);
      }
      return resolvedObj as T;
    }

    return obj;
  }
}
