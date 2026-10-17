import { ApiError, AuthError, ValidationError } from './errors.js';

const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_REFRESH_MARGIN_SECONDS = 60;
const SUPERUSER_AUTH_ENDPOINT = '/api/collections/_superusers/auth-with-password';

export interface AuthOptions {
  token?: string;
  identity?: string;
  password?: string;
}

interface Credentials {
  identity: string;
  password: string;
}

function tokenExpiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp - Date.now() / 1000 < TOKEN_REFRESH_MARGIN_SECONDS;
  } catch {
    return false;
  }
}

export class HttpClient {
  private baseUrl: string;
  private token: string | null;
  // Superuser credentials for automatic (re-)login. Cleared by any manual auth change,
  // so they are never sent to a different base URL or mixed with another identity.
  private credentials: Credentials | null;
  private pendingAuth: Promise<void> | null = null;

  constructor(baseUrl: string, auth: AuthOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = auth.token || null;
    this.credentials =
      auth.identity && auth.password ? { identity: auth.identity, password: auth.password } : null;
  }

  setToken(token: string | null): void {
    this.token = token;
    this.credentials = null;
  }

  hasAutoAuth(): boolean {
    return this.credentials !== null;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    this.credentials = null;
  }

  private async ensureAuth(): Promise<void> {
    const credentials = this.credentials;
    if (!credentials || (this.token && !tokenExpiresSoon(this.token))) {
      return;
    }

    this.pendingAuth ??= this.loginWithCredentials(credentials).finally(() => {
      this.pendingAuth = null;
    });
    await this.pendingAuth;
  }

  private async loginWithCredentials(credentials: Credentials): Promise<void> {
    const response = await this.request<{ token?: string }>(
      'POST',
      SUPERUSER_AUTH_ENDPOINT,
      { identity: credentials.identity, password: credentials.password },
      undefined,
      false
    );

    if (!response.token) {
      throw new AuthError('Superuser login with environment credentials returned no token');
    }

    // Auth may have been changed manually while this login was in flight.
    if (this.credentials === credentials) {
      this.token = response.token;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(baseUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new ValidationError('Invalid parameter: url must be a valid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError('Invalid parameter: url must use http or https');
    }

    this.baseUrl = parsed.toString().replace(/\/$/, '');
    this.clearToken();
  }

  async request<T = unknown>(
    method: string,
    endpoint: string,
    data?: Record<string, unknown> | null,
    query?: Record<string, string | number>,
    useAuth = true
  ): Promise<T> {
    if (useAuth) {
      await this.ensureAuth();
    }

    let url = this.baseUrl + endpoint;

    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useAuth && this.token) {
      headers['Authorization'] = this.token;
    }

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (data !== null && data !== undefined && ['POST', 'PATCH', 'PUT'].includes(method)) {
      options.body = JSON.stringify(data);
    }

    let response: Response;
    let text: string;
    try {
      response = await fetch(url, options);
      text = await response.text();
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new ApiError(`Request failed: ${message}`, { details: { method, endpoint } });
    }

    let decoded: T | { message?: string } | undefined;
    try {
      decoded = text ? JSON.parse(text) : undefined;
    } catch {
      decoded = undefined;
    }

    if (!response.ok) {
      const message =
        (decoded && typeof decoded === 'object' && 'message' in decoded && decoded.message) ||
        `HTTP error ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new AuthError(message, {
          statusCode: response.status,
          details: { method, endpoint, response: decoded },
        });
      }

      throw new ApiError(message, {
        statusCode: response.status,
        details: { method, endpoint, response: decoded },
      });
    }

    return decoded as T;
  }
}
