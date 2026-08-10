import { CorridorConfig } from '../src/models/corridor';
import { CandidateState, initialCandidateState, rungRoute } from '../src/models/onboarding';
import { canAdvanceFrom, getProgress, orderedRoutes, skippedRungs } from '../src/navigation/routes';
import { candidateReducer } from '../src/state/candidateReducer';
import { sampleCorridor } from '../src/services/candidateServices';
import { canSkip, canSubmit, errorFor, fieldsFor, oauthResult, rungStateFromClaim, statusLine, submissionSteps } from '../src/screens/rungModel';
import { screenFor } from '../src/navigation/screens';
import { buildProfileRows, methodCounts, outstandingPrompts } from '../src/screens/profileModel';
import { escalationLine, mergeEscalations, openQueryIds, parseMessage } from '../src/screens/chatModel';
import { buildTour, stepCountLine } from '../src/screens/tourModel';
import { attemptsLine, claimError, countDivergences, divergenceNote, invitationOnlyNote, isCodeWellFormed, mayShowPrefill, revealableBeforeVerify } from '../src/screens/claimModel';
import { personIdField, toCorridor, toMessage, toSession, toVerificationClaim } from '../src/services/contract';

function withCorridor(corridor: CorridorConfig = sampleCorridor): CandidateState {
  return candidateReducer(
    candidateReducer(initialCandidateState, { type: 'SET_ENTRY_MODE', mode: 'signup' }),
    { type: 'SET_CORRIDOR', corridor },
  );
}

function completePerson(state: CandidateState): CandidateState {
  const values: Record<string, string> = {
    fullName: 'Sample Person',
    email: 'person@example.com',
    phone: '+1 555 123 4567',
    country: 'United States',
  };
  return Object.entries(values).reduce(
    (next, [field, value]) =>
      candidateReducer(next, { type: 'UPDATE_PERSON', field: field as never, value }),
    state,
  );
}

describe('ladder derives from corridor config', () => {
  it('renders only applicable rungs, in order', () => {
    const routes = orderedRoutes(withCorridor());
    expect(routes).toContain(rungRoute('licence'));
    expect(routes).toContain(rungRoute('linkedin'));
    expect(routes).not.toContain(rungRoute('github'));
    expect(routes.indexOf(rungRoute('licence'))).toBeLessThan(routes.indexOf(rungRoute('cv')));
  });

  it('adds a rung with no code change', () => {
    const extended: CorridorConfig = {
      ...sampleCorridor,
      rungs: [
        ...sampleCorridor.rungs,
        { key: 'employment', displayName: 'Work history', requirement: 'required', input: 'document_upload', order: 7 },
      ],
    };
    expect(orderedRoutes(withCorridor(extended))).toContain(rungRoute('employment'));
  });

  it('inserts the claim step only on the claim path', () => {
    const signup = orderedRoutes(withCorridor());
    const claim = orderedRoutes(
      candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'claim' }),
    );
    expect(signup).not.toContain('ClaimCode');
    expect(claim).toContain('ClaimCode');
  });

  it('counts the person\u2019s own steps, not the frame', () => {
    const state = { ...completePerson(withCorridor()), route: 'BasicInfo' as const };
    const progress = getProgress(state);
    expect(progress?.current).toBe(1);
    expect(progress?.total).toBe(6); // BasicInfo plus five applicable rungs
  });
});

describe('gates', () => {
  it('holds BasicInfo until the person is complete and the corridor has loaded', () => {
    const bare = { ...withCorridor(), route: 'BasicInfo' as const };
    expect(canAdvanceFrom(bare)).toBe(false);
    expect(canAdvanceFrom({ ...completePerson(bare), route: 'BasicInfo' })).toBe(true);
    const noCorridor = { ...completePerson(initialCandidateState), route: 'BasicInfo' as const };
    expect(canAdvanceFrom(noCorridor)).toBe(false);
  });

  it('does not let an empty session stand in for being signed in', () => {
    // The entry screen used to hand out `{}` so a person without an invitation
    // could walk on. It read as signed in for the whole ladder and then failed
    // on the first submission, with nothing on screen to explain why.
    const entry = { ...withCorridor(), route: 'Entry' as const };
    expect(canAdvanceFrom(entry)).toBe(false);
    expect(canAdvanceFrom({ ...entry, authSession: {} })).toBe(false);
    expect(canAdvanceFrom({ ...entry, authSession: { refresh: 'r' } })).toBe(false);
    expect(canAdvanceFrom({ ...entry, authSession: { access: 'a' } })).toBe(true);
  });

  it('advances a required rung on submitted, without waiting for the verifier', () => {
    let state: CandidateState = { ...withCorridor(), route: rungRoute('licence') };
    expect(canAdvanceFrom(state)).toBe(false);
    state = candidateReducer(state, { type: 'SUBMIT_RUNG', key: 'licence', value: 'A1234', jurisdiction: 'NY' });
    expect(canAdvanceFrom(state)).toBe(true);
    state = candidateReducer(state, { type: 'SET_RUNG_STATE', key: 'licence', state: 'checking' });
    expect(canAdvanceFrom(state)).toBe(true);
  });

  it('refuses to skip a required rung and allows an optional one', () => {
    const licence = candidateReducer(
      { ...withCorridor(), route: rungRoute('licence') } as CandidateState,
      { type: 'SKIP_RUNG', key: 'licence' },
    );
    expect(canAdvanceFrom(licence)).toBe(false);

    const registry = candidateReducer(
      { ...withCorridor(), route: rungRoute('registry') } as CandidateState,
      { type: 'SKIP_RUNG', key: 'registry' },
    );
    expect(canAdvanceFrom(registry)).toBe(true);
    expect(skippedRungs(registry)).toEqual(['Registry number']);
  });

  it('does not block on a rung the engine flagged', () => {
    let state: CandidateState = { ...withCorridor(), route: rungRoute('licence') };
    state = candidateReducer(state, { type: 'SUBMIT_RUNG', key: 'licence', value: 'A1234' });
    state = candidateReducer(state, { type: 'SET_RUNG_STATE', key: 'licence', state: 'needs_attention' });
    expect(canAdvanceFrom(state)).toBe(false);
  });
});

describe('claim path pins the address', () => {
  it('refuses an email edit after the roster value is pinned', () => {
    let state = candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'claim' });
    state = candidateReducer(state, { type: 'SET_CLAIM', claim: { maskedEmail: 'p\u2022\u2022\u2022@\u2022\u2022\u2022.com', verified: false } });
    state = candidateReducer(state, {
      type: 'CLAIM_VERIFIED',
      pinnedEmail: 'roster@example.com',
      prefill: { fullName: 'Sample Person' },
    });
    state = candidateReducer(state, { type: 'UPDATE_PERSON', field: 'email', value: 'other@example.com' });
    expect(state.person.email).toBe('roster@example.com');
    expect(state.person.fullName).toBe('Sample Person');
  });

  it('allows an email edit on signup', () => {
    const state = candidateReducer(withCorridor(), {
      type: 'UPDATE_PERSON',
      field: 'email',
      value: 'chosen@example.com',
    });
    expect(state.person.email).toBe('chosen@example.com');
  });
});

describe('verification is per claim', () => {
  it('keeps methods separate rather than rolling them up', () => {
    let state = withCorridor();
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: { rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2026-08-07T10:00:00Z' },
    });
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: { rungKey: 'cv', factType: 'employment', factValue: 'Three roles', method: 'self_attested', status: 'active', checkedAt: '2026-08-07T10:05:00Z' },
    });
    expect(state.claims.map((claim) => claim.method)).toEqual(['primary_source', 'self_attested']);
  });
});

// --- rung screen model ----------------------------------------------------

describe('rung screen model', () => {
  const licence = sampleCorridor.rungs[0]!; // identifier_with_jurisdiction
  const registry = sampleCorridor.rungs[2]!; // optional identifier
  const cv = sampleCorridor.rungs[4]!; // document_upload

  it('renders the fields the input shape calls for', () => {
    expect(fieldsFor(licence).map((f) => f.key)).toEqual(['value', 'jurisdiction']);
    expect(fieldsFor(registry).map((f) => f.key)).toEqual(['value']);
    expect(fieldsFor(cv)).toEqual([]);
  });

  it('holds submit until every field the shape needs is filled', () => {
    expect(canSubmit(licence, { value: 'A1234' })).toBe(false);
    expect(canSubmit(licence, { value: 'A1234', jurisdiction: 'New York' })).toBe(true);
    expect(canSubmit(cv, { documentName: 'cv.pdf' })).toBe(true);
  });

  it('names what is missing rather than saying invalid', () => {
    expect(errorFor(licence, { value: 'A1234' }, true)).toBe('Name the body that issued it.');
    expect(errorFor(licence, {}, true)).toBe('Enter your licence number.');
    expect(errorFor(licence, {}, false)).toBe(undefined);
  });

  it('never says confirmed on the strength of a submission', () => {
    expect(statusLine(licence, { state: 'submitted' }, [])).toBe(
      'Checking this now. You can carry on; we will tell you when it comes back.',
    );
    expect(statusLine(cv, { state: 'submitted' }, [])).toBe('Saved. Nobody has checked this yet.');
  });

  it('shows the method and the date together, never one without the other', () => {
    const line = statusLine(licence, { state: 'confirmed' }, [
      { rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2026-08-07T10:00:00Z' },
    ]);
    expect(line).toBe('Confirmed with the issuing authority on 7 Aug 2026');
  });

  it('offers skip only on optional rungs', () => {
    expect(canSkip(licence)).toBe(false);
    expect(canSkip(registry)).toBe(true);
  });

  it('uploads the file before writing the claim, never after', () => {
    // A claim recorded against a document that never arrived is the half-truth
    // the verification model exists to avoid, so the order is a rule.
    expect(submissionSteps(cv, { documentName: 'cv.pdf' })).toEqual(['upload', 'submit']);
    expect(submissionSteps(licence, { value: 'A1234', jurisdiction: 'NY' })).toEqual(['submit']);
    // Nothing chosen yet, so there is nothing to upload.
    expect(submissionSteps(cv, {})).toEqual(['submit']);
  });

  it('keeps waiting while the poll only returns the person’s own submission', () => {
    // The server writes a self_attested claim the moment a rung is handed in.
    // Treating that as the verifier's answer stops the poll before anything
    // has actually been checked.
    const base = { rungKey: 'licence', factType: 'licence', factValue: 'A1234', checkedAt: '2026-08-10T10:00:00Z' };
    expect(rungStateFromClaim({ ...base, method: 'self_attested', status: 'active' })).toBe(undefined);
    expect(rungStateFromClaim({ ...base, method: 'primary_source', status: 'active' })).toBe('confirmed');
    expect(rungStateFromClaim({ ...base, method: 'source_checked', status: 'active' })).toBe('confirmed');
  });

  it('does not call a check that came back disagreeing a confirmation', () => {
    const base = { rungKey: 'licence', factType: 'licence', factValue: 'A1234', checkedAt: '2026-08-10T10:00:00Z' };
    expect(rungStateFromClaim({ ...base, method: 'primary_source', status: 'failed' })).toBe('needs_attention');
    expect(rungStateFromClaim({ ...base, method: 'primary_source', status: 'disputed' })).toBe('needs_attention');
  });

  it('treats an oauth timeout as still checking, never as a failure', () => {
    // The server may complete the handshake after the client stops asking, so
    // calling it failed would send the person back to the start of a rung that
    // is about to succeed.
    const github = { key: 'github', displayName: 'GitHub', requirement: 'optional' as const, input: 'oauth' as const, order: 4 };
    expect(oauthResult(github, undefined).rungState).toBe('checking');
    expect(oauthResult(github, 'error').rungState).toBe('unsubmitted');
    expect(oauthResult(github, 'connected').rungState).toBe('confirmed');
    expect(oauthResult(github, 'connected').failure).toBe(undefined);
    // The rung is named from the corridor, never hard-coded in the copy.
    expect(oauthResult(github, 'error').failure).toContain('GitHub');
  });
});

// --- shell ----------------------------------------------------------------

describe('shell mounts every route the corridor can produce', () => {
  it('has a screen for each route in the ladder, on both entry paths', () => {
    const signup = withCorridor();
    const claim = candidateReducer(signup, { type: 'SET_ENTRY_MODE', mode: 'claim' });
    [...orderedRoutes(signup), ...orderedRoutes(claim), 'Profile' as const, 'Chat' as const].forEach((route) => {
      expect(typeof screenFor(route)).toBe('string');
    });
    expect(screenFor(rungRoute('anything_new'))).toBe('rung');
  });

  it('shows no progress on frame routes and full progress on the last counted step', () => {
    const state = withCorridor();
    expect(getProgress({ ...state, route: 'Welcome' })).toBe(undefined);
    const last = getProgress({ ...state, route: rungRoute('linkedin') });
    expect(last?.current).toBe(last?.total);
  });
});

// --- profile --------------------------------------------------------------

describe('profile shows facts separately', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  function withClaims(): CandidateState {
    let state = withCorridor();
    state = candidateReducer(state, { type: 'SUBMIT_RUNG', key: 'licence', value: 'A1234', jurisdiction: 'New York' });
    state = candidateReducer(state, { type: 'SET_RUNG_STATE', key: 'licence', state: 'confirmed' });
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: { rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2026-08-01T10:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
    });
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: { rungKey: 'cv', factType: 'employment', factValue: 'Three roles', method: 'self_attested', status: 'active', checkedAt: '2026-08-02T10:00:00Z' },
    });
    return state;
  }

  it('keeps one row per rung with its own method and date', () => {
    const rows = buildProfileRows(withClaims(), now);
    const licence = rows.find((row) => row.rungKey === 'licence');
    const cv = rows.find((row) => row.rungKey === 'cv');
    expect(licence?.methodLine).toBe('Confirmed with the issuing authority on 1 Aug 2026');
    expect(cv?.methodLine).toBe('Provided by you, not yet checked on 2 Aug 2026');
  });

  it('counts methods instead of producing a single verdict', () => {
    const counts = methodCounts(buildProfileRows(withClaims(), now));
    expect(counts.primary_source).toBe(1);
    expect(counts.self_attested).toBe(1);
    expect(counts.source_checked).toBe(0);
  });

  it('treats an expired claim as expired when read, not as confirmed', () => {
    let state = withCorridor();
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: { rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2025-01-01T10:00:00Z', expiresAt: '2026-01-01T00:00:00Z' },
    });
    const row = buildProfileRows(state, now).find((entry) => entry.rungKey === 'licence');
    expect(row?.methodLine).toBe('Confirmed with the issuing authority on 1 Jan 2025, and now out of date');
    expect(row?.needsAttention).toBe(true);
    expect(row?.actionLabel).toBe('Update this');
  });

  it('prompts on missing required rungs and leaves optional ones alone', () => {
    const prompts = outstandingPrompts(buildProfileRows(withClaims(), now));
    expect(prompts).toContain('Certification');
    expect(prompts).not.toContain('Registry number');
  });
});

// --- chat and escalation --------------------------------------------------

describe('escalation survives the client', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('keeps pending and query_id from the send reply', () => {
    const message = parseMessage({
      id: 7,
      role: 'assistant',
      content: 'Let me ask.',
      created_at: '2026-08-07T10:00:00Z',
      meta: { pending: true, query_id: 'q_1' },
    });
    expect(message.escalation?.queryId).toBe('q_1');
    expect(message.escalation?.status).toBe('pending');
  });

  it('reads the annotated shape history returns', () => {
    const message = parseMessage({
      id: 8,
      role: 'assistant',
      content: 'Checked.',
      created_at: '2026-08-07T10:00:00Z',
      escalation: { query_id: 'q_2', status: 'answered' },
    });
    expect(message.escalation?.status).toBe('answered');
  });

  it('flips a pending bubble without a new message arriving', () => {
    const before = [
      parseMessage({ id: 1, role: 'assistant', content: 'Asking.', created_at: '2026-08-07T10:00:00Z', meta: { pending: true, query_id: 'q_1' } }),
    ];
    const after = mergeEscalations(before, [{ queryId: 'q_1', status: 'answered' }]);
    expect(after[0]?.escalation?.status).toBe('answered');
    expect(after[0]?.text).toBe('Asking.');
    expect(openQueryIds(after)).toEqual([]);
  });

  it('tells the person how long it has been, and nothing about the practice inside', () => {
    const message = parseMessage({ id: 1, role: 'assistant', content: 'Asking.', created_at: '2026-08-07T10:00:00Z', meta: { pending: true, query_id: 'q_1' } });
    expect(escalationLine(message.escalation!, now)).toBe('Checking with the practice, asked 2 hours ago');
    expect(escalationLine({ queryId: 'q_1', status: 'answered' }, now)).toBe('Answered by the practice');
  });

  it('leaves ordinary messages alone', () => {
    const message = parseMessage({ id: 2, role: 'user', content: 'Thanks.', created_at: '2026-08-07T10:00:00Z' });
    expect(message.escalation).toBe(undefined);
    expect(message.role).toBe('person');
  });
});

// --- tour -----------------------------------------------------------------

describe('the tour is generated from the corridor', () => {
  it('lists exactly the rungs the ladder will ask for, marking the optional ones', () => {
    const stops = buildTour(sampleCorridor);
    const steps = stops.find((stop) => stop.key === 'steps');
    expect(steps?.items).toEqual([
      'Licence',
      'Certification',
      'Registry number (optional)',
      'CV',
      'LinkedIn (optional)',
    ]);
  });

  it('separates what gets checked from what the person tells us', () => {
    const checked = buildTour(sampleCorridor).find((stop) => stop.key === 'checked');
    expect(checked?.items).toContain('Licence: we check it');
    expect(checked?.items).toContain('CV: you tell us');
  });

  it('changes with the corridor rather than being written copy', () => {
    const narrow: CorridorConfig = {
      ...sampleCorridor,
      rungs: [{ key: 'cv', displayName: 'CV', requirement: 'required', input: 'document_upload', order: 1 }],
    };
    const stops = buildTour(narrow);
    expect(stops.find((stop) => stop.key === 'steps')?.items).toEqual(['CV']);
    expect(stops.find((stop) => stop.key === 'checked')).toBe(undefined);
  });

  it('states a step count and never a duration we have not measured', () => {
    expect(stepCountLine(sampleCorridor)).toBe('5 steps');
    const joined = buildTour(sampleCorridor).map((stop) => stop.body).join(' ');
    expect(/minute|minutes|quick|takes about/.test(joined)).toBe(false);
  });

  it('cannot be shown before the corridor has loaded', () => {
    const noCorridor = { ...initialCandidateState, route: 'Tour' as const };
    expect(canAdvanceFrom(noCorridor)).toBe(false);
    expect(canAdvanceFrom({ ...withCorridor(), route: 'Tour' })).toBe(true);
    expect(buildTour(undefined)).toEqual([]);
  });

  it('sits before entry on both paths', () => {
    const signup = orderedRoutes(withCorridor());
    expect(signup.indexOf('Tour')).toBeLessThan(signup.indexOf('Entry'));
  });
});

// --- claim front door -----------------------------------------------------

describe('claim entry reveals nothing before the code verifies', () => {
  it('exposes only the masked address up to that point', () => {
    let state = candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'claim' });
    state = candidateReducer(state, { type: 'SET_CLAIM', claim: { maskedEmail: 'p\u2022\u2022\u2022@\u2022\u2022\u2022.com', token: 't', verified: false } });
    expect(revealableBeforeVerify(state)).toEqual(['maskedEmail']);
    expect(mayShowPrefill(state)).toBe(false);
    state = candidateReducer(state, { type: 'CLAIM_VERIFIED', pinnedEmail: 'roster@example.com', prefill: { fullName: 'Sample Person' } });
    expect(mayShowPrefill(state)).toBe(true);
  });

  it('gives the same message for a wrong code and an unknown link', () => {
    expect(claimError('bad_code')).toBe(claimError('not_found'));
    expect(claimError('expired')).toBe('That code has run out. Ask for a new one.');
  });

  it('accepts only a well-formed code', () => {
    expect(isCodeWellFormed('123456')).toBe(true);
    expect(isCodeWellFormed('12345')).toBe(false);
    expect(isCodeWellFormed('12345a')).toBe(false);
  });

  it('counts tries down and stops at the ceiling', () => {
    expect(attemptsLine(0)).toBe(undefined);
    expect(attemptsLine(4)).toBe('One try left before you need a new code.');
    expect(attemptsLine(5)).toBe(undefined);
  });

  it('tells someone without a code how to get one, and promises nothing else', () => {
    // There is no self-signup, so this copy must not imply there is one, and
    // must not invent a timeline we do not control.
    expect(invitationOnlyNote).toContain('invitation');
    expect(/sign up|create an account|register/i.test(invitationOnlyNote)).toBe(false);
    expect(/soon|shortly|coming|waitlist/i.test(invitationOnlyNote)).toBe(false);
  });

  it('describes a changed detail as kept, not corrected', () => {
    const count = countDivergences({ fullName: 'Sam Person', phone: '555' }, { fullName: 'Samuel Person', phone: '555' });
    expect(count).toBe(1);
    expect(divergenceNote(count)).toBe('One detail differs from what the practice listed. We keep both.');
  });
});

// --- wire contract --------------------------------------------------------

describe('the wire contract holds the boundary', () => {
  it('maps a corridor without any screen seeing snake case', () => {
    const corridor = toCorridor({
      key: 'sample',
      display_name: 'Sample corridor',
      rungs: [
        { key: 'licence', display_name: 'Licence', requirement: 'required', input: 'identifier_with_jurisdiction', verifier: 'licence_bot', order: 1 },
        { key: 'cv', display_name: 'CV', requirement: 'required', input: 'document_upload', verifier: null, order: 2 },
      ],
    });
    expect(corridor.displayName).toBe('Sample corridor');
    expect(corridor.rungs[0]?.verifier).toBe('licence_bot');
    expect(corridor.rungs[1]?.verifier).toBe(undefined);
  });

  it('refuses a claim with no check date rather than rendering a bare method', () => {
    let threw = false;
    try {
      toVerificationClaim({
        rung_key: 'licence', fact_type: 'licence', fact_value: 'A1234', method: 'primary_source',
        source_ref: null, verifier: null, verifier_version: null, checked_at: null, expires_at: null, status: 'active',
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('carries escalation through from the wire shape', () => {
    const message = toMessage({
      id: 'm1', role: 'navigator', content: 'Asking the practice.', created_at: '2026-08-07T10:00:00Z',
      escalation: { query_id: 'q_1', status: 'pending' },
    });
    expect(message.escalation?.queryId).toBe('q_1');
    expect(message.escalation?.status).toBe('pending');
  });

  it('names the person field once, and it is not student_id', () => {
    expect(personIdField).toBe('person_id');
    const session = toSession({ access: 'a', refresh: 'r', person_id: 'p1' });
    expect(session.personId).toBe('p1');
  });
});
