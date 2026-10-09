import { ApiError, createApiClient } from '../src/services/api';
import { createLiveCandidateServices } from '../src/services/liveServices';
import { FALLBACK_CORRIDOR_KEY, readConfig } from '../src/services/config';
import { decodeSession, memoryTokenStore } from '../src/services/tokenStorage';
import { oauthPollPolicy, poll, pollHandle } from '../src/services/polling';
import { shouldNotify } from '../src/services/pushModel';
import { toAuthorizeUrl, toClaimVerify, toMe, toOAuthStatus, toPerson, toPersonUpdate } from '../src/services/contract';
import { implementedScreens, screenFor } from '../src/navigation/screens';
import { getPreviousRoute, openingRoute, orderedRoutes, routeAfterSignIn } from '../src/navigation/routes';
import { memoryDeviceMemory } from '../src/services/deviceMemory';
import { candidateReducer } from '../src/state/candidateReducer';
import { CandidateState, initialCandidateState } from '../src/models/onboarding';
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
import { rungStateFromClaim } from '../src/screens/rungModel';
import { joinOrSignInNote } from '../src/screens/claimModel';

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

// --- coming back ----------------------------------------------------------

describe('a returning person can read their record back', () => {
  const wireMe = {
    person: {
      person_id: 'p_1',
      full_name: 'Sample Person',
      email: 'person@example.com',
      phone: '555',
      city: '',
      region: '',
      country: 'United States',
      agent_name: 'Ada',
    },
    claims: [
      {
        rung_key: 'licence', fact_type: 'licence', fact_value: 'A1234',
        method: 'primary_source' as const, source_ref: null, verifier: null,
        verifier_version: null, checked_at: '2026-08-10T10:00:00Z',
        expires_at: null, status: 'active' as const,
      },
    ],
  };

  it('reads the person and their claims in one call', () => {
    const snapshot = toMe(wireMe);
    expect(snapshot.person.fullName).toBe('Sample Person');
    expect(snapshot.person.personId).toBe('p_1');
    expect(snapshot.claims).toHaveLength(1);
    expect(snapshot.claims[0]?.method).toBe('primary_source');
    expect(snapshot.agentName).toBe('Ada');
  });

  it('refuses a person with no identity rather than rendering a blank one', () => {
    expect(() => toPerson({ ...wireMe.person, person_id: null as unknown as string })).toThrow(
      /person_id/,
    );
    expect(() => toPerson({ ...wireMe.person, email: null as unknown as string })).toThrow(/email/);
  });

  it('reads the identity fields when the server sends them', () => {
    const person = toPerson({
      ...wireMe.person,
      date_of_birth: '1984-02-11',
      previous_names: ['Shelley Smith'],
    });
    expect(person.dateOfBirth).toBe('1984-02-11');
    expect(person.previousNames).toEqual(['Shelley Smith']);
  });

  it('treats a server that does not send them as a person who did not give them', () => {
    // Optional at the boundary, unlike person_id and email. Absent is a real
    // answer here — from an older server, and from the person.
    const person = toPerson(wireMe.person);
    expect(person.dateOfBirth).toBeUndefined();
    expect(person.previousNames).toBeUndefined();
  });

  it('sends the date of birth and previous names when saving', () => {
    // They were collected on screen and dropped from the save, so background
    // checks waited for details the person had already given.
    const body = toPersonUpdate({
      ...toPerson(wireMe.person),
      dateOfBirth: '1984-02-11',
      previousNames: ['Shelley Smith'],
    });
    expect(body.date_of_birth).toBe('1984-02-11');
    expect(body.previous_names).toEqual(['Shelley Smith']);
  });

  it('leaves out a half-typed date rather than failing the whole save', () => {
    for (const typed of ['1984-2-11', '11/02/1984', '1984', '']) {
      const body = toPersonUpdate({ ...toPerson(wireMe.person), dateOfBirth: typed });
      expect(body).not.toHaveProperty('date_of_birth');
      expect(body.full_name).toBe(wireMe.person.full_name);
    }
  });

  it('sends agreement as a yes or no and never a time', () => {
    // The server stamps when. A client-supplied time could backdate consent.
    const body = toPersonUpdate({ ...toPerson(wireMe.person), screeningConsent: true });
    expect(body.screening_consent).toBe(true);
    expect(body).not.toHaveProperty('screening_consent_at');
  });

  it('reads when the server recorded agreement', () => {
    const person = toPerson({ ...wireMe.person, screening_consent_at: '2026-10-01T15:00:00Z' });
    expect(person.screeningConsentAt).toBe('2026-10-01T15:00:00Z');
  });

  it('never sends the email the session was minted against', () => {
    expect(toPersonUpdate(toPerson(wireMe.person))).not.toHaveProperty('email');
  });

  it('treats an unnamed Navigator as absent, not as the string null', () => {
    expect(toMe({ ...wireMe, person: { ...wireMe.person, agent_name: null } }).agentName).toBe(
      undefined,
    );
  });

  it('never sends the address back when saving details', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return reply(200, wireMe);
    }) as unknown as typeof fetch;

    const services = createLiveCandidateServices({
      config: { apiHost: 'https://api.test', corridorKey: 'sample', useMocks: false, oauthRedirect: 'k://oauth' },
      tokens: signedIn(),
      fetchImpl,
    });

    await services.person.save(undefined, {
      fullName: 'Sample Person', email: 'someone.else@example.com',
      phone: '555', city: '', region: '', country: 'United States',
    });

    // The address is what the session was minted against. The server refuses
    // it; the client does not offer it either.
    expect(sent.email).toBe(undefined);
    expect(sent.person_id).toBe(undefined);
    expect(sent.full_name).toBe('Sample Person');
  });
});

// --- signing out ----------------------------------------------------------

describe('signing out forgets the session on this device', () => {
  it('clears the stored token, so a reload does not sign the person back in', async () => {
    const tokens = signedIn();
    const fetchImpl = (async () => reply(204, undefined)) as unknown as typeof fetch;
    const services = createLiveCandidateServices({
      config: { apiHost: 'https://api.test', corridorKey: 'sample', useMocks: false, oauthRedirect: 'k://oauth' },
      tokens,
      fetchImpl,
    });

    expect(await tokens.read()).not.toBe(undefined);
    await services.session.signOut({ access: 'old-access' });

    // The whole point. Resetting reducer state alone left the token in place,
    // and the boot-time restore would have picked it straight back up.
    expect(await tokens.read()).toBe(undefined);
  });

  it('still signs out when the device cannot be unregistered', async () => {
    const tokens = signedIn();
    const fetchImpl = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const services = createLiveCandidateServices({
      config: { apiHost: 'https://api.test', corridorKey: 'sample', useMocks: false, oauthRedirect: 'k://oauth' },
      tokens,
      fetchImpl,
    });

    await services.session.signOut({ access: 'old-access' });
    expect(await tokens.read()).toBe(undefined);
  });

  it('leaves nothing of the previous person behind in state', () => {
    let state = candidateReducer(initialCandidateState, { type: 'SET_CORRIDOR', corridor: sampleCorridor });
    state = candidateReducer(state, {
      type: 'HYDRATE',
      snapshot: {
        person: { fullName: 'First Person', email: 'first@example.com', phone: '', city: '', region: '', country: '' },
        claims: [{ rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2026-08-01T10:00:00Z' }],
        agentName: 'Ada',
      },
    });
    state = candidateReducer(state, { type: 'SET_AUTH_SESSION', session: { access: 'a' } });

    const after = candidateReducer(state, { type: 'LOGOUT' });

    // Signing out to look at another profile must not leave the first one's
    // facts on screen.
    expect(after.person.email).toBe('');
    expect(after.claims).toEqual([]);
    expect(after.agentName).toBe(undefined);
    expect(after.authSession).toBe(undefined);
  });

  it('keeps the corridor, which is configuration rather than the person', () => {
    // It is fetched once at start and the fetch does not re-run, so dropping
    // it on sign-out left the tour empty and the ladder with no rungs.
    let state = candidateReducer(initialCandidateState, { type: 'SET_CORRIDOR', corridor: sampleCorridor });
    state = candidateReducer(state, { type: 'SET_AUTH_SESSION', session: { access: 'a' } });
    const after = candidateReducer(state, { type: 'LOGOUT' });
    expect(after.corridor).toBe(sampleCorridor);
    expect(orderedRoutes(after).length).toBeGreaterThan(4);
  });

  it('lands on the door, not the pitch', () => {
    const state = candidateReducer(initialCandidateState, { type: 'SET_CORRIDOR', corridor: sampleCorridor });
    // Somebody who just signed out has read the welcome screen already.
    expect(candidateReducer(state, { type: 'LOGOUT' }).route).toBe('Entry');
  });

  it('tells a returning person the same address brings their profile back', () => {
    // Without this the only thing on the door reads "Join", and somebody who
    // signed out cannot tell it is also the way back in.
    expect(/coming back|already have/i.test(joinOrSignInNote)).toBe(true);
    expect(/sign in|profile/i.test(joinOrSignInNote)).toBe(true);
  });
});

// --- where the app opens --------------------------------------------------

describe('the introduction is given once, not every time', () => {
  it('takes a signed-in person straight to their profile', () => {
    expect(openingRoute({ signedIn: true, seenIntro: true })).toBe('Profile');
    expect(openingRoute({ signedIn: true, seenIntro: false })).toBe('Profile');
  });

  it('takes somebody who has been here before to the door, not the pitch', () => {
    // Signing out does not make a person a stranger. Showing them the welcome
    // screen and the tour again is the app forgetting who it is talking to.
    expect(openingRoute({ signedIn: false, seenIntro: true })).toBe('Entry');
  });

  it('still introduces itself to a first-time visitor', () => {
    expect(openingRoute({ signedIn: false, seenIntro: false })).toBe('Welcome');
  });

  it('remembers across a sign-out, because it is a fact about the device', () => {
    const device = memoryDeviceMemory();
    return device.hasSeenIntro().then(async (before) => {
      expect(before).toBe(false);
      await device.rememberIntroSeen();
      expect(await device.hasSeenIntro()).toBe(true);
    });
  });
});

describe('the door knows whether it just signed somebody in', () => {
  const complete = {
    fullName: 'Sample Person', email: 'p@example.com', phone: '555',
    city: '', region: '', country: 'United States',
    dateOfBirth: '1984-02-11', screeningConsentAt: '2026-10-01T15:00:00Z',
  };

  it('sends a returning person without a date of birth or agreement back to their details', () => {
    // Required since October 2026. Somebody who signed up before then has no
    // other way to add them, and their background checks would never run.
    expect(routeAfterSignIn({ person: { ...complete, dateOfBirth: undefined }, claims: [] })).toBe('BasicInfo');
    expect(routeAfterSignIn({ person: { ...complete, screeningConsentAt: null }, claims: [] })).toBe('BasicInfo');
  });

  it('sends a person who already has a profile to it', () => {
    // The bug: verify dispatched NEXT, which is BasicInfo, so somebody
    // signing back in was asked for their name again.
    expect(routeAfterSignIn({ person: complete, claims: [] })).toBe('Profile');
  });

  it('still asks a brand new person for their details', () => {
    expect(routeAfterSignIn({ person: { ...complete, fullName: '', phone: '', country: '' }, claims: [] })).toBe('BasicInfo');
    expect(routeAfterSignIn(undefined)).toBe('BasicInfo');
  });

  it('treats details on file as returning, even with no claims yet', () => {
    // Somebody who filled the form and stopped before a single rung has still
    // been here. The profile is where it tells them what is outstanding.
    expect(routeAfterSignIn({ person: complete, claims: [] })).toBe('Profile');
  });
});

describe('the profile is home', () => {
  function home(): CandidateState {
    return { ...candidateReducer(initialCandidateState, { type: 'SET_CORRIDOR', corridor: sampleCorridor }), route: 'Profile' };
  }

  it('has no back button, because there is nowhere behind it', () => {
    // Back used to lead to the handover screen, which is a one-time moment in
    // signing up. A person opening the app this morning does not want it.
    expect(getPreviousRoute(home())).toBe(undefined);
  });

  it('keeps the conversation reachable from it', () => {
    // Chat was only ever reachable from the handover screen, so a returning
    // person could not get to it at all.
    expect(getPreviousRoute({ ...home(), route: 'Chat' })).toBe('Profile');
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

  it('polls past the submission the server echoes back, to the verifier’s answer', async () => {
    /**
     * The bug this pins. `submit_rung` writes a self_attested claim the moment
     * a rung is handed in, so `claim_status` has something to return
     * immediately. A poll that stopped at the first claim therefore stopped
     * before any check had run, and the rung never picked up the real answer.
     */
    const claimAt = (method: 'self_attested' | 'primary_source') => ({
      rungKey: 'licence',
      factType: 'licence',
      factValue: 'A1234',
      method,
      status: 'active' as const,
      checkedAt: '2026-08-10T10:00:00Z',
    });

    let calls = 0;
    const result = await poll(
      { attempts: 6, intervalMs: 1 },
      async () => {
        calls += 1;
        // The server answers with the person's own submission until the bot
        // has finished, then raises the method.
        const claim = claimAt(calls < 3 ? 'self_attested' : 'primary_source');
        const next = rungStateFromClaim(claim);
        return next ? { claim, next } : undefined;
      },
      { wait: instant },
    );

    expect(calls).toBe(3);
    expect(result?.next).toBe('confirmed');
    expect(result?.claim.method).toBe('primary_source');
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
