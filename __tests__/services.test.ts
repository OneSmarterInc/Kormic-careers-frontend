import { ApiError, createApiClient } from '../src/services/api';
import { createLiveCandidateServices } from '../src/services/liveServices';
import { FALLBACK_CORRIDOR_KEY, readConfig } from '../src/services/config';
import { decodeSession, memoryTokenStore } from '../src/services/tokenStorage';
import { oauthPollPolicy, poll, pollHandle } from '../src/services/polling';
import { shouldNotify } from '../src/services/pushModel';
import { toAuthorizeUrl, toClaimVerify, toOAuthStatus } from '../src/services/contract';
import { implementedScreens, screenFor } from '../src/navigation/screens';
import { orderedRoutes } from '../src/navigation/routes';
import { candidateReducer } from '../src/state/candidateReducer';
import { initialCandidateState } from '../src/models/onboarding';
import { sampleCorridor } from '../src/services/candidateServices';
import {
  DEFAULT_NAVIGATOR_NAME,
  buildProgress,
  buildSummaryLine,
  handoverLines,
  isNavigatorNameWellFormed,
  navigatorName,
} from '../src/screens/agentModel';
import { buildProfileRows } from '../src/screens/profileModel';

// --- helpers --------------------------------------------------------------

/** Only the three members `api.ts` touches, so no real Response is needed. */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    },
  } as unknown as Response;
}

function authHeader(init?: RequestInit): string | undefined {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.Authorization;
}

interface Scripted {
  fetchImpl: typeof fetch;
  refreshCalls(): number;
  protectedCalls(): number;
}

/**
 * A backend that refuses the old access token, mints exactly one new one, and
 * accepts anything presented with it.
 */
function scriptedBackend(options: { refreshFails?: boolean } = {}): Scripted {
  let refreshCalls = 0;
  let protectedCalls = 0;

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/api/auth/refresh/')) {
      refreshCalls += 1;
      return options.refreshFails
        ? reply(401, { code: 'unauthorised', detail: 'refresh rejected' })
        : reply(200, { access: 'new-access' });
    }
    protectedCalls += 1;
    return authHeader(init) === 'Bearer new-access'
      ? reply(200, { fine: true })
      : reply(401, { code: 'unauthorised', detail: 'stale' });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    refreshCalls: () => refreshCalls,
    protectedCalls: () => protectedCalls,
  };
}

function signedIn() {
  return memoryTokenStore({ access: 'old-access', refresh: 'r1', personId: 'p1' });
}

// --- the api client -------------------------------------------------------

describe('refresh-and-retry exists exactly once', () => {
  it('refreshes on a 401 and replays the original request', async () => {
    const backend = scriptedBackend();
    const tokens = signedIn();
    const api = createApiClient({ host: 'https://api.test', tokens, fetchImpl: backend.fetchImpl });

    const result = await api.send<{ fine: boolean }>({ path: '/api/corridors/sample/' });

    expect(result.fine).toBe(true);
    expect(backend.refreshCalls()).toBe(1);
    expect(backend.protectedCalls()).toBe(2); // the 401, then the replay
    expect((await tokens.read())?.access).toBe('new-access');
  });

  /**
   * The reason this layer exists. In the student app the JSON path and the blob
   * path each carried their own copy of the retry, and they were not identical.
   * A multipart upload here goes through the same `send`, so it cannot have a
   * different one.
   */
  it('retries a multipart upload through the same path as a JSON call', async () => {
    const backend = scriptedBackend();
    const api = createApiClient({
      host: 'https://api.test',
      tokens: signedIn(),
      fetchImpl: backend.fetchImpl,
    });

    const form = new FormData();
    form.append('file', 'stand-in');
    await api.send({ path: '/api/claims/cv/document/', method: 'POST', form });

    expect(backend.refreshCalls()).toBe(1);
    expect(backend.protectedCalls()).toBe(2);
  });

  it('refreshes once for concurrent 401s rather than once each', async () => {
    const backend = scriptedBackend();
    const api = createApiClient({
      host: 'https://api.test',
      tokens: signedIn(),
      fetchImpl: backend.fetchImpl,
    });

    await Promise.all([
      api.send({ path: '/api/agent/history/' }),
      api.send({ path: '/api/claims/licence/' }),
      api.send({ path: '/api/corridors/sample/' }),
    ]);

    // Three refreshes would mean the second presents a token the first already
    // rotated, and the person is signed out for being quick.
    expect(backend.refreshCalls()).toBe(1);
  });

  it('gives up after one retry instead of looping', async () => {
    let protectedCalls = 0;
    const fetchImpl = (async (url: string) => {
      if (String(url).endsWith('/api/auth/refresh/')) return reply(200, { access: 'still-bad' });
      protectedCalls += 1;
      return reply(401, { code: 'unauthorised', detail: 'no' });
    }) as unknown as typeof fetch;

    const api = createApiClient({ host: 'https://api.test', tokens: signedIn(), fetchImpl });

    await expect(api.send({ path: '/api/agent/history/' })).rejects.toBeInstanceOf(ApiError);
    expect(protectedCalls).toBe(2);
  });

  it('clears the session and reports it when the refresh itself is refused', async () => {
    const backend = scriptedBackend({ refreshFails: true });
    const tokens = signedIn();
    let lost = 0;
    const api = createApiClient({
      host: 'https://api.test',
      tokens,
      fetchImpl: backend.fetchImpl,
      onSessionLost: () => {
        lost += 1;
      },
    });

    await expect(api.send({ path: '/api/agent/history/' })).rejects.toMatchObject({
      code: 'unauthorised',
    });
    expect(await tokens.read()).toBe(undefined);
    expect(lost).toBe(1);
  });

  it('never refreshes for the claim front door, which is unauthenticated', async () => {
    const backend = scriptedBackend();
    const api = createApiClient({
      host: 'https://api.test',
      tokens: signedIn(),
      fetchImpl: backend.fetchImpl,
    });

    await expect(
      api.send({ path: '/api/claim/start/', method: 'POST', body: { token: 't' }, auth: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(backend.refreshCalls()).toBe(0);
  });

  it('calls a dropped connection network, not a server error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const api = createApiClient({ host: 'https://api.test', tokens: signedIn(), fetchImpl });

    await expect(api.send({ path: '/api/agent/history/' })).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('does not let a proxy error page masquerade as a domain code', async () => {
    const fetchImpl = (async () => reply(502, undefined)) as unknown as typeof fetch;
    const api = createApiClient({ host: 'https://api.test', tokens: signedIn(), fetchImpl });

    await expect(api.send({ path: '/api/agent/history/' })).rejects.toMatchObject({
      code: 'server',
    });
  });
});

// --- what the submission actually puts on the wire -------------------------

describe('a rung submission names its corridor', () => {
  /**
   * The backend validates `corridor_key` on the submission and a rung key is
   * only unique within a corridor, so leaving it out was a 404 on every
   * submission. This pins the payload so the two sides cannot drift apart
   * again without a test saying so.
   */
  it('sends corridor_key alongside the rung, in snake case', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return reply(201, {
        rung_key: 'licence',
        fact_type: 'licence',
        fact_value: 'A1234',
        method: 'self_attested',
        source_ref: null,
        verifier: null,
        verifier_version: null,
        checked_at: '2026-08-07T10:00:00Z',
        expires_at: null,
        status: 'active',
      });
    }) as unknown as typeof fetch;

    const services = createLiveCandidateServices({
      config: {
        apiHost: 'https://api.test',
        corridorKey: 'sample',
        useMocks: false,
        oauthRedirect: 'kormiccareers://oauth',
      },
      tokens: signedIn(),
      fetchImpl,
    });

    const claim = await services.verifier.submit(undefined, {
      corridorKey: 'sample',
      rungKey: 'licence',
      value: 'A1234',
      jurisdiction: 'New York',
    });

    expect(sent.corridor_key).toBe('sample');
    expect(sent.rung_key).toBe('licence');
    expect(sent.value).toBe('A1234');
    expect(sent.jurisdiction).toBe('New York');
    // No camel case leaks onto the wire.
    expect(sent.corridorKey).toBe(undefined);
    expect(sent.rungKey).toBe(undefined);
    // And the reply comes back as a domain claim, not a wire row.
    expect(claim.checkedAt).toBe('2026-08-07T10:00:00Z');
    expect(claim.method).toBe('self_attested');
  });

  it('sends null for a field the rung does not ask for, which the server accepts', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return reply(201, {
        rung_key: 'cv',
        fact_type: 'cv',
        fact_value: '',
        method: 'self_attested',
        source_ref: null,
        verifier: null,
        verifier_version: null,
        checked_at: '2026-08-07T10:00:00Z',
        expires_at: null,
        status: 'active',
      });
    }) as unknown as typeof fetch;

    const services = createLiveCandidateServices({
      config: {
        apiHost: 'https://api.test',
        corridorKey: 'sample',
        useMocks: false,
        oauthRedirect: 'kormiccareers://oauth',
      },
      tokens: signedIn(),
      fetchImpl,
    });

    await services.verifier.submit(undefined, { corridorKey: 'sample', rungKey: 'cv' });

    expect(sent.value).toBe(null);
    expect(sent.jurisdiction).toBe(null);
  });
});

// --- configuration --------------------------------------------------------

describe('configuration fails loudly rather than silently', () => {
  it('refuses a live build with no host', () => {
    expect(() => readConfig({ useMocks: false })).toThrow(/apiHost/);
  });

  it('allows a mock build with no host, which is the checked-in state', () => {
    const config = readConfig({ useMocks: true });
    expect(config.useMocks).toBe(true);
    expect(config.corridorKey).toBe(FALLBACK_CORRIDOR_KEY);
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(readConfig({ apiHost: 'https://api.test/' }).apiHost).toBe('https://api.test');
  });

  it('derives the oauth redirect from the app scheme rather than a literal', () => {
    expect(readConfig({ apiHost: 'https://api.test' }, 'kormiccareers').oauthRedirect).toBe(
      'kormiccareers://oauth',
    );
  });
});

describe('stored session', () => {
  it('treats a half-written session as no session', () => {
    expect(decodeSession(JSON.stringify({ access: 'a', personId: 'p' }))).toBe(undefined);
    expect(decodeSession('not json')).toBe(undefined);
    expect(decodeSession(JSON.stringify({ access: 'a', refresh: 'r', personId: 'p' }))).toEqual({
      access: 'a',
      refresh: 'r',
      personId: 'p',
    });
  });
});

// --- polling --------------------------------------------------------------

describe('the poller both rungs share', () => {
  const instant = async () => {};

  it('keeps the student app shape: twenty attempts at two seconds', () => {
    expect(oauthPollPolicy).toEqual({ attempts: 20, intervalMs: 2000 });
  });

  it('stops at the first answer', async () => {
    let calls = 0;
    const result = await poll(
      { attempts: 5, intervalMs: 1 },
      async () => {
        calls += 1;
        return calls === 2 ? 'connected' : undefined;
      },
      { wait: instant },
    );
    expect(result).toBe('connected');
    expect(calls).toBe(2);
  });

  it('counts a thrown attempt rather than abandoning the handshake', async () => {
    let calls = 0;
    const result = await poll(
      { attempts: 3, intervalMs: 1 },
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('dropped');
        return calls === 2 ? 'connected' : undefined;
      },
      { wait: instant },
    );
    expect(result).toBe('connected');
  });

  it('gives up quietly when the attempts run out', async () => {
    let calls = 0;
    const result = await poll(
      { attempts: 3, intervalMs: 1 },
      async () => {
        calls += 1;
        return undefined;
      },
      { wait: instant },
    );
    expect(result).toBe(undefined);
    expect(calls).toBe(3);
  });

  it('stops when the screen that started it goes away', async () => {
    const handle = pollHandle();
    let calls = 0;
    const result = await poll(
      { attempts: 5, intervalMs: 1 },
      async () => {
        calls += 1;
        handle.cancel();
        return undefined;
      },
      { wait: instant, handle },
    );
    expect(result).toBe(undefined);
    expect(calls).toBe(1);
  });
});

// --- push -----------------------------------------------------------------

describe('push does not duplicate what the person is already reading', () => {
  it('stays silent for an answer that lands while the thread is open', () => {
    expect(shouldNotify('active', true)).toBe(false);
  });

  it('notifies when the app is closed, backgrounded, or elsewhere in the ladder', () => {
    expect(shouldNotify('background', true)).toBe(true);
    expect(shouldNotify('inactive', true)).toBe(true);
    expect(shouldNotify('active', false)).toBe(true);
  });
});

// --- the shell has no placeholders left ------------------------------------

describe('every route in the ladder has a screen', () => {
  it('renders no "not built yet" placeholder on either entry path', () => {
    const signup = candidateReducer(
      candidateReducer(initialCandidateState, { type: 'SET_ENTRY_MODE', mode: 'signup' }),
      { type: 'SET_CORRIDOR', corridor: sampleCorridor },
    );
    const claim = candidateReducer(signup, { type: 'SET_ENTRY_MODE', mode: 'claim' });

    [...orderedRoutes(signup), ...orderedRoutes(claim), 'Profile' as const, 'Chat' as const].forEach(
      (route) => {
        expect(implementedScreens).toContain(screenFor(route));
      },
    );
  });
});

// --- the two screens that were placeholders --------------------------------

describe('the build screen', () => {
  const stages = ['Reading your profile', 'Checking what you gave us', 'Putting it together'];

  it('walks the stages the service named rather than copy of its own', () => {
    expect(buildProgress(stages, 0)).toMatchObject({ stage: stages[0], current: 1, total: 3, done: false });
    expect(buildProgress(stages, 2)).toMatchObject({ stage: stages[2], current: 3, done: false });
    expect(buildProgress(stages, 3).done).toBe(true);
  });

  it('finishes immediately when a corridor names no stages', () => {
    expect(buildProgress([], 0).done).toBe(true);
  });

  it('says what it read, never that it confirmed it', () => {
    let state = candidateReducer(initialCandidateState, {
      type: 'SET_CORRIDOR',
      corridor: sampleCorridor,
    });
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: {
        rungKey: 'cv',
        factType: 'employment',
        factValue: 'Three roles',
        method: 'self_attested',
        status: 'active',
        checkedAt: '2026-08-02T10:00:00Z',
      },
    });
    const line = buildSummaryLine(buildProfileRows(state, new Date('2026-08-07T12:00:00Z')));
    expect(line).toBe('One thing you gave us, ready for a practice to read.');
    expect(/verified|confirmed/i.test(line)).toBe(false);
  });
});

describe('the handover screen', () => {
  it('falls back to a name rather than rendering an empty one', () => {
    expect(navigatorName(undefined)).toBe(DEFAULT_NAVIGATOR_NAME);
    expect(navigatorName('   ')).toBe(DEFAULT_NAVIGATOR_NAME);
    expect(navigatorName('Ada')).toBe('Ada');
  });

  it('bounds the name, because it appears inline in sentences', () => {
    expect(isNavigatorNameWellFormed('Ada')).toBe(true);
    expect(isNavigatorNameWellFormed('')).toBe(false);
    expect(isNavigatorNameWellFormed('x'.repeat(25))).toBe(false);
  });

  it('names what is outstanding without blocking on any of it', () => {
    let state = candidateReducer(initialCandidateState, {
      type: 'SET_CORRIDOR',
      corridor: sampleCorridor,
    });
    state = candidateReducer(state, { type: 'SKIP_RUNG', key: 'registry' });
    const lines = handoverLines(state, buildProfileRows(state, new Date('2026-08-07T12:00:00Z')));

    expect(lines.some((line) => line.includes('Registry number'))).toBe(true);
    expect(lines.some((line) => line.includes('Licence'))).toBe(true);
  });
});

// --- new contract adapters -------------------------------------------------

describe('the adapters added for the live services', () => {
  it('refuses a verified claim with no pinned address', () => {
    expect(() =>
      toClaimVerify({
        claim_token: 'c1',
        pinned_email: null as unknown as string,
        prefill: {},
      }),
    ).toThrow(/pinned_email/);
  });

  it('keeps the prefill optional rather than inventing an empty person', () => {
    const result = toClaimVerify({
      claim_token: 'c1',
      pinned_email: 'roster@example.com',
      prefill: { fullName: 'Sample Person' },
    });
    expect(result.prefill.fullName).toBe('Sample Person');
    expect(result.prefill.phone).toBe(undefined);
  });

  it('refuses an authorize response with no url instead of opening about:blank', () => {
    expect(() => toAuthorizeUrl({ authorize_url: null as unknown as string })).toThrow(
      /authorize_url/,
    );
    expect(toAuthorizeUrl({ authorize_url: 'https://provider.test/auth' })).toBe(
      'https://provider.test/auth',
    );
  });

  it('reads the oauth status as the server sent it', () => {
    expect(toOAuthStatus({ status: 'connected' })).toBe('connected');
  });
});
