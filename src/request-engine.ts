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

    // 3.5. Resolve Authorization
    if (request.auth && request.auth.type && request.auth.type !== 'none') {
      const auth = request.auth;
      if (auth.type === 'bearer' && auth.bearer) {
        const tokenVal = auth.bearer.find(b => b.key === 'token')?.value || '';
        const resolvedToken = VariableResolver.resolve(tokenVal, activeEnv);
        if (resolvedToken) {
          headersMap.set('Authorization', `Bearer ${resolvedToken}`);
        }
      } else if (auth.type === 'basic' && auth.basic) {
        const user = auth.basic.find(b => b.key === 'username')?.value || '';
        const pass = auth.basic.find(b => b.key === 'password')?.value || '';
        const resolvedUser = VariableResolver.resolve(user, activeEnv);
        const resolvedPass = VariableResolver.resolve(pass, activeEnv);
        const credentials = Buffer.from(`${resolvedUser}:${resolvedPass}`).toString('base64');
        headersMap.set('Authorization', `Basic ${credentials}`);
      } else if (auth.type === 'apikey' && auth.apikey) {
        const key = auth.apikey.find(k => k.key === 'key')?.value || '';
        const val = auth.apikey.find(v => v.key === 'value')?.value || '';
        const position = auth.apikey.find(i => i.key === 'in')?.value || 'header';
        
        const resolvedKey = VariableResolver.resolve(key, activeEnv);
        const resolvedVal = VariableResolver.resolve(val, activeEnv);

        if (resolvedKey) {
          if (position === 'header') {
            headersMap.set(resolvedKey, resolvedVal);
          } else if (position === 'query') {
            const qChar = urlWithProtocol.includes('?') ? '&' : '?';
            urlWithProtocol = `${urlWithProtocol}${qChar}${encodeURIComponent(resolvedKey)}=${encodeURIComponent(resolvedVal)}`;
          }
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
