import { WireError } from './contract';
import { StoredSession, TokenStore } from './tokenStorage';

/**
 * The HTTP client. The reason this file exists as its own layer is the one
 * thing the brief singles out: the student app's `api.ts` repeats
 * refresh-and-retry three times, across its JSON, blob and blob-URL paths,
 * nearly but not exactly identically. Here there is exactly one `send`, and
 * every caller — JSON body, multipart upload, unauthenticated claim route —
 * goes through it. Adding a fourth kind of request cannot add a fourth copy of
 * the retry, because there is nowhere else to put it.
 */

export type ApiErrorCode = WireError['code'] | 'network';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    // Required for `instanceof` to survive the transpile down-level.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON body. Mutually exclusive with `form`. */
  body?: unknown;
  /** Multipart body, for the document rung. Mutually exclusive with `body`. */
  form?: FormData;
  /** Defaults to true. The claim front door is the only thing that sets it false. */
  auth?: boolean;
}

export interface ApiClient {
  send<T>(request: ApiRequest): Promise<T>;
  /** Stores the session the claim flow just minted, so later calls are authenticated. */
  adopt(session: StoredSession): Promise<void>;
  signOut(): Promise<void>;
  currentPersonId(): Promise<string | undefined>;
}

export interface ApiDeps {
  host: string;
  tokens: TokenStore;
  /** Injected so the client can be tested without a network or a renderer. */
  fetchImpl?: typeof fetch;
  /** Where a refresh that fails sends the app. Set by the shell to force a sign-in. */
  onSessionLost?: () => void;
}

/** The refresh route lives here rather than in `contract.ts` because it is transport, not domain. */
const REFRESH_PATH = '/api/auth/refresh/';

function statusToCode(status: number): ApiErrorCode {
  if (status === 401 || status === 403) return 'unauthorised';
  if (status === 404) return 'not_found';
  if (status === 429) return 'locked';
  if (status >= 500) return 'server';
  return 'bad_code';
}

/**
 * The backend sends `{code, detail}` on a refusal. Anything else — an HTML
 * error page, a proxy timeout — is mapped by status rather than trusted, so a
 * gateway's error body can never masquerade as a domain code.
 */
function toApiError(status: number, payload: unknown): ApiError {
  const record =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const known: ApiErrorCode[] = [
    'not_found',
    'bad_code',
    'expired',
    'locked',
    'unauthorised',
    'server',
  ];
  const declared = record.code;
  const code =
    typeof declared === 'string' && (known as string[]).includes(declared)
      ? (declared as ApiErrorCode)
      : statusToCode(status);
  const detail = typeof record.detail === 'string' ? record.detail : `Request failed (${status})`;
  return new ApiError(code, status, detail);
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

export function createApiClient(deps: ApiDeps): ApiClient {
  const doFetch = deps.fetchImpl ?? fetch;

  /**
   * Single-flight. Five requests that all see a 401 at once must produce one
   * refresh, not five: the second refresh would present a token the first has
   * already rotated, and the person would be signed out for being fast.
   */
  let refreshing: Promise<string | undefined> | undefined;

  function url(path: string): string {
    return `${deps.host}${path}`;
  }

  function buildInit(request: ApiRequest, access: string | undefined): RequestInit {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (access && request.auth !== false) headers.Authorization = `Bearer ${access}`;

    let body: RequestInit['body'];
    if (request.form) {
      // Deliberately no Content-Type: the runtime sets it with the multipart
      // boundary, and setting it by hand is what breaks uploads.
      body = request.form;
    } else if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(request.body);
    }

    return { method: request.method ?? (body === undefined ? 'GET' : 'POST'), headers, body };
  }

  async function attempt(request: ApiRequest, access: string | undefined): Promise<Response> {
    try {
      return await doFetch(url(request.path), buildInit(request, access));
    } catch {
      // A transport failure is not a status code. It gets its own name so a
      // screen can say "we could not reach us" rather than "server error".
      throw new ApiError('network', 0, 'We could not reach the server.');
    }
  }

  async function runRefresh(): Promise<string | undefined> {
    const stored = await deps.tokens.read();
    if (!stored) return undefined;

    let response: Response;
    try {
      response = await doFetch(url(REFRESH_PATH), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: stored.refresh }),
      });
    } catch {
      // The network is down, not the session. Keep the tokens so the next
      // attempt after connectivity returns still has something to refresh.
      throw new ApiError('network', 0, 'We could not reach the server.');
    }

    if (!response.ok) {
      await deps.tokens.clear();
      deps.onSessionLost?.();
      return undefined;
    }

    const payload = await readBody(response);
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const access = typeof record.access === 'string' ? record.access : '';
    if (!access) {
      await deps.tokens.clear();
      deps.onSessionLost?.();
      return undefined;
    }

    // The backend may rotate the refresh token too. One name per field, so
    // there is no `refresh_token` alias to also check.
    const rotated = typeof record.refresh === 'string' ? record.refresh : stored.refresh;
    await deps.tokens.write({ ...stored, access, refresh: rotated });
    return access;
  }

  function refreshOnce(): Promise<string | undefined> {
    if (!refreshing) {
      refreshing = runRefresh().finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
  }

  async function send<T>(request: ApiRequest): Promise<T> {
    const stored = await deps.tokens.read();
    let response = await attempt(request, stored?.access);

    // The only refresh-and-retry in this app. One attempt, never a loop: if the
    // freshly minted token is also refused, the session is genuinely gone.
    if (response.status === 401 && request.auth !== false && stored) {
      const access = await refreshOnce();
      if (!access) {
        throw new ApiError('unauthorised', 401, 'Your session has ended. Sign in again.');
      }
      response = await attempt(request, access);
    }

    const payload = await readBody(response);
    if (!response.ok) throw toApiError(response.status, payload);
    return payload as T;
  }

  return {
    send,
    async adopt(session) {
      await deps.tokens.write(session);
    },
    async signOut() {
      await deps.tokens.clear();
    },
    async currentPersonId() {
      return (await deps.tokens.read())?.personId;
    },
  };
}
