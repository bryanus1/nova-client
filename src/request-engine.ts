import { NovaRequest, NovaEnvironment } from './types';
import { VariableResolver } from './variable-resolver';

export interface NovaResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
  size: number; // in bytes
}

export class RequestEngine {
  /**
   * Executes a NovaRequest and returns a NovaResponse.
   */
  public static async execute(
    request: NovaRequest,
    activeEnv?: NovaEnvironment | null
  ): Promise<NovaResponse> {
    // 1. Resolve URL
    let rawUrl = '';
    if (typeof request.url === 'string') {
      rawUrl = request.url;
    } else if (request.url && request.url.raw) {
      rawUrl = request.url.raw;
    }

    const resolvedUrl = VariableResolver.resolve(rawUrl, activeEnv);
    if (!resolvedUrl) {
      throw new Error('Request URL is empty or invalid.');
    }

    // Ensure protocol is present, default to http:// if missing
    let urlWithProtocol = resolvedUrl;
    if (!/^https?:\/\//i.test(resolvedUrl)) {
      urlWithProtocol = 'http://' + resolvedUrl;
    }

    // 2. Resolve Method
    const method = (request.method || 'GET').toUpperCase();

    // 3. Resolve Headers
    const headersMap = new Map<string, string>();
    
    // Add default user-agent
    headersMap.set('User-Agent', 'Nova-Client-VSCode');

    if (request.header) {
      for (const h of request.header) {
        if (h.key && !h.disabled) {
          const resolvedKey = VariableResolver.resolve(h.key, activeEnv);
          const resolvedVal = VariableResolver.resolve(h.value || '', activeEnv);
          headersMap.set(resolvedKey, resolvedVal);
        }
      }
    }

    // 4. Resolve Body
    let requestBody: any = undefined;
    if (request.body && method !== 'GET' && method !== 'HEAD') {
      const mode = request.body.mode;
      if (mode === 'raw' && request.body.raw) {
        requestBody = VariableResolver.resolve(request.body.raw, activeEnv);
        
        // Auto-detect JSON and set header if not set explicitly
        if (!this.hasHeader(headersMap, 'content-type')) {
          const lang = request.body.options?.raw?.language;
          if (lang === 'json' || (requestBody.trim().startsWith('{') && requestBody.trim().endsWith('}'))) {
            headersMap.set('Content-Type', 'application/json');
          } else {
            headersMap.set('Content-Type', 'text/plain');
          }
        }
      } else if (mode === 'urlencoded' && request.body.urlencoded) {
        const params = new URLSearchParams();
        for (const p of request.body.urlencoded) {
          if (p.key && !p.disabled) {
            params.append(
              VariableResolver.resolve(p.key, activeEnv),
              VariableResolver.resolve(p.value || '', activeEnv)
            );
          }
        }
        requestBody = params.toString();
        if (!this.hasHeader(headersMap, 'content-type')) {
          headersMap.set('Content-Type', 'application/x-www-form-urlencoded');
        }
      } else if (mode === 'formdata' && request.body.formdata) {
        // Build boundary and body manually or use standard multipart
        // For simplicity we will build a basic multipart body if needed or urlencoded
        // Let's implement URL-encoded fallback or basic FormData string mapping.
        // Node 18 supports globalThis.FormData!
        const fd = new (globalThis as any).FormData();
        for (const field of request.body.formdata) {
          if (field.key && !field.disabled) {
            fd.append(
              VariableResolver.resolve(field.key, activeEnv),
              VariableResolver.resolve(field.value || '', activeEnv)
            );
          }
        }
        requestBody = fd;
        // Fetch will automatically set Content-Type with boundary for FormData
      }
    }

    // Convert HeadersMap to standard object
    const headers: Record<string, string> = {};
    headersMap.forEach((v, k) => {
      headers[k] = v;
    });

    const startTime = Date.now();
    
    try {
      const response = await fetch(urlWithProtocol, {
        method,
        headers,
        body: requestBody,
        // Disable automatic redirect following if needed, but standard is fine
        redirect: 'follow',
      });

      const duration = Date.now() - startTime;

      // Extract response headers
      const resHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });

      // Extract body as text
      const bodyText = await response.text();
      
      // Calculate approximate size in bytes
      const size = Buffer.byteLength(bodyText, 'utf8');

      return {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
        body: bodyText,
        duration: duration,
        size: size,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: `Request failed: ${error.message || error}\n\nMake sure the URL is correct, the server is running, and you have network connectivity.`,
        duration: duration,
        size: 0,
      };
    }
  }

  private static hasHeader(headers: Map<string, string>, name: string): boolean {
    const lowerName = name.toLowerCase();
    for (const key of headers.keys()) {
      if (key.toLowerCase() === lowerName) {
        return true;
      }
    }
    return false;
  }
}
