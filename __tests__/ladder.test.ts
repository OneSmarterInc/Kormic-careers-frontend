import { toJurisdictions } from '../src/services/contract';
import { CorridorConfig, CorridorRung, Jurisdiction, VerificationClaim, awaitsPractice, runsOnJoin } from '../src/models/corridor';
import { CandidateState, initialCandidateState, rungRoute } from '../src/models/onboarding';
import { canAdvanceFrom, getProgress, orderedRoutes, skippedRungs } from '../src/navigation/routes';
import { candidateReducer } from '../src/state/candidateReducer';
import { sampleCorridor } from '../src/services/candidateServices';
import { OTHER_JURISDICTION, canSkip, canSubmit, errorFor, fieldsFor, filesFor, jurisdictionForSubmission, oauthResult, primaryActionLabel, rungStateFromClaim, statusLine, submissionSteps } from '../src/screens/rungModel';
import { screenFor } from '../src/navigation/screens';
import { buildProfileRows, factLabel, methodCounts, methodLine, outstandingPrompts } from '../src/screens/profileModel';
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
    dateOfBirth: '1984-02-11',
  };
  const filled = Object.entries(values).reduce(
    (next, [field, value]) =>
      candidateReducer(next, { type: 'UPDATE_PERSON', field: field as never, value }),
    state,
  );
  return candidateReducer(filled, { type: 'SET_SCREENING_CONSENT', agreed: true });
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
        { key: 'employment', displayName: 'Work history', requirement: 'required', input: 'document_upload', jurisdictions: [], order: 7 },
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
    // The entry screen used to hand out `{}` so a person could walk on. It read
    // as signed in for the whole ladder and then failed on the first
    // submission, with nothing on screen to explain why.
    //
    // The rule is unchanged; the gate that enforces it moved. Entry now mints
    // nothing on either path, so the session is checked one screen later, where
    // it actually arrives.
    const entry = { ...withCorridor(), route: 'Entry' as const };
    expect(canAdvanceFrom(entry)).toBe(false);
    expect(canAdvanceFrom({ ...entry, authSession: { access: 'a' } })).toBe(false);

    const code = { ...withCorridor(), route: 'JoinCode' as const };
    expect(canAdvanceFrom({ ...code, authSession: {} })).toBe(false);
    expect(canAdvanceFrom({ ...code, authSession: { refresh: 'r' } })).toBe(false);
    expect(canAdvanceFrom({ ...code, authSession: { access: 'a' } })).toBe(true);
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

  it('keeps the claim token, because confirm spends it to mint the session', () => {
    // Dropping it meant the person finished the claim, walked the whole
    // ladder, and every request went out with no Authorization header.
    let state = candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'claim' });
    state = candidateReducer(state, { type: 'SET_CLAIM', claim: { maskedEmail: 'p•••@•••.com', token: 't', verified: false } });
    expect(state.claim?.claimToken).toBe(undefined);
    state = candidateReducer(state, {
      type: 'CLAIM_VERIFIED',
      pinnedEmail: 'roster@example.com',
      prefill: {},
      claimToken: 'claim_abc',
    });
    expect(state.claim?.claimToken).toBe('claim_abc');
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

describe('a restored profile reads from the claims, not from this sitting', () => {
  const now = new Date('2026-08-11T12:00:00Z');

  function restored(): CandidateState {
    // What a returning person looks like: claims from the server and no
    // per-rung progress at all, because they did none of it in this sitting.
    return candidateReducer(withCorridor(), {
      type: 'HYDRATE',
      snapshot: {
        person: { fullName: 'Sample Person', email: 'p@example.com', phone: '555', city: '', region: '', country: 'US' },
        claims: [
          { rungKey: 'licence', factType: 'licence', factValue: 'A1234', method: 'primary_source', status: 'active', checkedAt: '2026-08-01T10:00:00Z' },
        ],
        agentName: 'Ada',
      },
    });
  }

  it('keeps the person, the claims and the Navigator name', () => {
    const state = restored();
    expect(state.person.fullName).toBe('Sample Person');
    expect(state.claims).toHaveLength(1);
    expect(state.agentName).toBe('Ada');
  });

  it('does not offer to add something already provided', () => {
    // The rung has no progress in this sitting, so keying the prompt off
    // rungState alone told a returning person to add their licence again.
    const rows = buildProfileRows(restored(), now);
    const licence = rows.find((row) => row.rungKey === 'licence');
    expect(licence?.methodLine).toContain('Confirmed with the issuing authority');
    expect(licence?.actionLabel).toBe(undefined);
  });

  it('still prompts for a rung that genuinely has nothing', () => {
    const rows = buildProfileRows(restored(), now);
    expect(rows.find((row) => row.rungKey === 'cv')?.actionLabel).toBe('Add cv');
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
    // Licence has a bot but its authority charges, so nothing is running and
    // the line must not claim otherwise.
    expect(statusLine(licence, { state: 'submitted' }, [])).toBe(
      'Saved. A practice can have this confirmed when they take you forward.',
    );
    expect(statusLine(registry, { state: 'submitted' }, [])).toBe(
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

  it('lets a screenshots rung be finished, not only skipped', () => {
    // attachmentCount was read by canSubmit and set by nothing, so the rung
    // could never be submitted. A corridor that made it required would have
    // been unfinishable.
    const linkedin = sampleCorridor.rungs[5]!;
    expect(canSubmit(linkedin, {})).toBe(false);
    expect(canSubmit(linkedin, { attachments: [{ name: 'top.png' }] })).toBe(true);
  });

  it('hands over every screenshot, not just the first', () => {
    const linkedin = sampleCorridor.rungs[5]!;
    const files = filesFor(linkedin, {
      attachments: [{ name: 'top.png' }, { name: 'experience.png' }],
    });
    expect(files.map((f) => f.name)).toEqual(['top.png', 'experience.png']);
    expect(submissionSteps(linkedin, { attachments: [{ name: 'top.png' }] })).toEqual([
      'upload',
      'submit',
    ]);
  });

  it('keeps Continue separate from screenshot selection', () => {
    const linkedin = sampleCorridor.rungs[5]!;
    expect(primaryActionLabel(linkedin, undefined, {})).toBe('Continue');
    expect(primaryActionLabel(linkedin, undefined, { attachments: [{ name: 'top.png' }] })).toBe(
      'Continue',
    );
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
    const github = { key: 'github', displayName: 'GitHub', requirement: 'optional' as const, input: 'oauth' as const, jurisdictions: [], order: 4 };
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

describe('a rung can establish more than one fact', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  function claim(factType: string, value: string, method: 'primary_source' | 'source_checked' | 'self_attested', status: 'active' | 'superseded' = 'active') {
    return {
      rungKey: 'cv', factType, factValue: value, method, status,
      checkedAt: '2026-08-12T10:00:00Z',
    } as const;
  }

  function withFacts() {
    // What a resume parser produces: one document, several facts, each with
    // its own method.
    return [
      claim('full_name', 'Sample Person', 'source_checked'),
      claim('institution', 'Somewhere University', 'source_checked'),
      claim('skills', 'Triage, Phlebotomy', 'source_checked'),
    ].reduce(
      (state, entry) => candidateReducer(state, { type: 'RECORD_CLAIM', claim: entry }),
      withCorridor(),
    );
  }

  it('shows every fact, not just the first', () => {
    const cv = buildProfileRows(withFacts(), now).find((row) => row.rungKey === 'cv');
    expect(cv?.facts.map((fact) => fact.factType).sort()).toEqual([
      'full_name',
      'institution',
      'skills',
    ]);
  });

  it('counts facts rather than rungs, because each carries its own method', () => {
    // A rung that established three things has told a practice three things.
    const counts = methodCounts(buildProfileRows(withFacts(), now));
    expect(counts.source_checked).toBe(3);
  });

  it('keeps the strongest claim when two describe the same fact', () => {
    let state = withFacts();
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: claim('institution', 'Somewhere University', 'primary_source'),
    });
    const cv = buildProfileRows(state, now).find((row) => row.rungKey === 'cv');
    const institution = cv?.facts.find((fact) => fact.factType === 'institution');
    expect(institution?.claim.method).toBe('primary_source');
    expect(cv?.facts.filter((fact) => fact.factType === 'institution')).toHaveLength(1);
  });

  it('leaves a superseded claim out entirely', () => {
    let state = withFacts();
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: claim('retired', 'Old', 'self_attested', 'superseded'),
    });
    const cv = buildProfileRows(state, now).find((row) => row.rungKey === 'cv');
    expect(cv?.facts.map((fact) => fact.factType)).not.toContain('retired');
  });

  it('leaves a list screen out of the facts entirely', () => {
    // An exclusion screen is legitimately primary_source — the list's
    // publisher really was asked. This row ranks by method, so left in it
    // would sort above every real credential and render as 'Confirmed with
    // the issuing authority' for having found nothing.
    let state = withFacts();
    state = candidateReducer(state, {
      type: 'RECORD_CLAIM',
      claim: {
        ...claim('oig_exclusion', 'no_match', 'primary_source'),
        shape: 'screens',
        sourceAsOf: '2026-08-01',
        matchedOn: ['full_name', 'npi'],
      },
    });

    const cv = buildProfileRows(state, now).find((row) => row.rungKey === 'cv');
    expect(cv?.facts.map((fact) => fact.factType)).not.toContain('oig_exclusion');
    // ...and the facts that were there still read as what they are.
    expect(cv?.facts.every((fact) => fact.claim.method === 'source_checked')).toBe(true);
  });

  it('treats a claim with no shape as a fact, not a screen', () => {
    // An older server does not send the field. Reading its silence as a
    // screen would empty the profile.
    const cv = buildProfileRows(withFacts(), now).find((row) => row.rungKey === 'cv');
    expect(cv?.facts).toHaveLength(3);
  });

  it('keeps previous names as a list, not as the text that was typed', () => {
    // The screen splits on commas; the reducer stores what a screen can search
    // on. Storing the raw string would send "Smith, Jones" as one name.
    const state = candidateReducer(withCorridor(), {
      type: 'UPDATE_PREVIOUS_NAMES',
      names: ['Shelley Smith', 'Shelley Jones'],
    });
    expect(state.person.previousNames).toEqual(['Shelley Smith', 'Shelley Jones']);
  });

  it('leaves the rest of the person alone when previous names change', () => {
    let state = candidateReducer(withCorridor(), {
      type: 'UPDATE_PERSON',
      field: 'fullName',
      value: 'Shelley Akey',
    });
    state = candidateReducer(state, { type: 'UPDATE_PREVIOUS_NAMES', names: ['Shelley Smith'] });
    expect(state.person.fullName).toBe('Shelley Akey');
  });

  it('names the fact readably without a table of credential names', () => {
    // A hardcoded vocabulary here would be the client knowing what a
    // credential is called, which is the one rule this codebase does not bend.
    expect(factLabel('work_experience_months')).toBe('Work experience months');
    expect(factLabel('full_name')).toBe('Full name');
  });

  it('still prompts for a required rung that established nothing', () => {
    const rows = buildProfileRows(withFacts(), now);
    expect(outstandingPrompts(rows)).toContain('Licence');
    expect(outstandingPrompts(rows)).not.toContain('CV');
  });
});

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
    expect(checked?.items).toContain('Registry number: we check it now');
    expect(checked?.items).toContain('Licence: checked if a practice takes you forward');
    expect(checked?.items).toContain('CV: you tell us');
  });

  it('changes with the corridor rather than being written copy', () => {
    const narrow: CorridorConfig = {
      ...sampleCorridor,
      rungs: [{ key: 'cv', displayName: 'CV', requirement: 'required', input: 'document_upload', jurisdictions: [], order: 1 }],
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
        { key: 'licence', display_name: 'Licence', requirement: 'required', input: 'identifier_with_jurisdiction', verifier: 'licence_bot', route: 'paid', jurisdictions: [], order: 1 },
        { key: 'cv', display_name: 'CV', requirement: 'required', input: 'document_upload', verifier: null, route: null, jurisdictions: [], order: 2 },
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

// --- the open door --------------------------------------------------------

describe('careers admits anyone', () => {
  it('puts a code step on the signup path, not just the invitation path', () => {
    const signup = orderedRoutes(withCorridor());
    const claim = orderedRoutes(
      candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'claim' }),
    );
    expect(signup).toContain('JoinCode');
    expect(signup).not.toContain('ClaimCode');
    expect(claim).toContain('ClaimCode');
    expect(claim).not.toContain('JoinCode');
  });

  it('leaves Entry with an address and a code sent, never with a session', () => {
    let state = candidateReducer(withCorridor(), { type: 'SET_ENTRY_MODE', mode: 'signup' });
    state = { ...state, route: 'Entry' };
    expect(canAdvanceFrom(state)).toBe(false);
    state = candidateReducer(state, {
      type: 'SET_SIGNUP',
      signup: { email: 'person@example.com', codeSent: true },
    });
    expect(canAdvanceFrom({ ...state, route: 'Entry' })).toBe(true);
    expect(state.authSession).toBe(undefined);
  });

  it('holds JoinCode until a real session with a token exists', () => {
    let state = candidateReducer(withCorridor(), {
      type: 'SET_SIGNUP',
      signup: { email: 'person@example.com', codeSent: true },
    });
    state = { ...state, route: 'JoinCode' };
    expect(canAdvanceFrom(state)).toBe(false);
    state = candidateReducer(state, { type: 'SET_AUTH_SESSION', session: {} });
    expect(canAdvanceFrom({ ...state, route: 'JoinCode' })).toBe(false);
    state = candidateReducer(state, {
      type: 'SET_AUTH_SESSION',
      session: { access: 'a', refresh: 'r', personId: 'p1' },
    });
    expect(canAdvanceFrom({ ...state, route: 'JoinCode' })).toBe(true);
  });

  it('leaves the address editable on the open path and pinned on the invitation one', () => {
    const joined = candidateReducer(withCorridor(), {
      type: 'SET_SIGNUP',
      signup: { email: 'person@example.com', codeSent: true },
    });
    expect(joined.person.email).toBe('person@example.com');
    const edited = candidateReducer(joined, {
      type: 'UPDATE_PERSON',
      field: 'email',
      value: 'other@example.com',
    });
    expect(edited.person.email).toBe('other@example.com');
  });

  it('has a screen for the new route', () => {
    expect(screenFor('JoinCode')).toBe('joinCode');
  });
});


// --- cost posture ---------------------------------------------------------

describe('a paid check waits for a practice to decide', () => {
  const licence = sampleCorridor.rungs[0]!; // has a bot, authority charges
  const registry = sampleCorridor.rungs[2]!; // has a bot, free route
  const cv = sampleCorridor.rungs[4]!; // no bot, no route

  it('runs on join only when the route is free and a bot exists', () => {
    expect(runsOnJoin(registry)).toBe(true);
    expect(runsOnJoin(licence)).toBe(false);
    expect(runsOnJoin(cv)).toBe(false);
  });

  it('treats an unestablished route as none, never as free', () => {
    const unknown = { ...licence, route: undefined };
    expect(runsOnJoin(unknown)).toBe(false);
    expect(awaitsPractice(unknown)).toBe(false);
  });

  it('never tells a candidate something is being checked when nothing is', () => {
    // The most common state in an open corridor: submitted, a bot exists, and
    // nothing will happen until somebody pays.
    expect(statusLine(licence, { state: 'submitted' }, [])).not.toContain('Checking this now');
  });

  it('says the same thing on the profile as on the rung screen', () => {
    expect(methodLine(undefined, 'submitted', new Date(), licence)).toBe(
      'Held. Confirmed if a practice takes you forward',
    );
    expect(methodLine(undefined, 'submitted', new Date(), registry)).toBe('Checking now');
    expect(methodLine(undefined, 'submitted', new Date(), cv)).toBe(
      'Provided by you, not yet checked',
    );
  });

  it('does not promise a check on join that a candidate cannot get', () => {
    const body = buildTour(sampleCorridor)
      .map((stop) => stop.body)
      .join(' ');
    expect(body).toContain('a practice decides that when they take you forward');
  });

  it('carries the posture across the wire, with null meaning none', () => {
    const corridor = toCorridor({
      key: 'sample',
      display_name: 'Sample corridor',
      rungs: [
        { key: 'a', display_name: 'A', requirement: 'required', input: 'identifier', verifier: 'bot', route: 'free', jurisdictions: [], order: 1 },
        { key: 'b', display_name: 'B', requirement: 'required', input: 'identifier', verifier: 'bot', route: null, jurisdictions: [], order: 2 },
      ],
    });
    expect(corridor.rungs[0]?.route).toBe('free');
    expect(corridor.rungs[1]?.route).toBe(undefined);
    expect(runsOnJoin(corridor.rungs[1]!)).toBe(false);
  });
});

describe('the rung state matches what is happening', () => {
  it('a paid rung stays submitted rather than entering checking', () => {
    // Held here rather than only in the copy: the state itself must be honest,
    // or the profile and any future screen inherits the same lie.
    const licence = sampleCorridor.rungs[0]!;
    const registry = sampleCorridor.rungs[2]!;
    expect(runsOnJoin(licence)).toBe(false);
    expect(runsOnJoin(registry)).toBe(true);
    expect(statusLine(licence, { state: 'submitted' }, [])).toBe(
      'Saved. A practice can have this confirmed when they take you forward.',
    );
  });
});

describe('jurisdiction picker', () => {
  const withJurisdictions = (jurisdictions: Jurisdiction[]): CorridorRung => ({
    key: 'licence',
    displayName: 'Licence',
    requirement: 'required',
    input: 'identifier_with_jurisdiction',
    jurisdictions,
    order: 1,
  });

  const listed: Jurisdiction[] = [
    { code: 'GB', label: 'United Kingdom (NMC)' },
    { code: 'US-CA', label: 'California, USA' },
  ];

  it('offers a picker when the corridor enumerated the places', () => {
    const field = fieldsFor(withJurisdictions(listed)).find((f) => f.key === 'jurisdiction');
    expect(field?.choices).toEqual(listed);
    // The old label asked for "the body that issued it", which invited an
    // answer the server's directory could never match.
    expect(field?.label).toBe('Where it was issued');
  });

  it('falls back to a text box when it did not', () => {
    const field = fieldsFor(withJurisdictions([])).find((f) => f.key === 'jurisdiction');
    expect(field?.choices).toBeUndefined();
  });

  it('will not submit on "somewhere else" alone', () => {
    const rung = withJurisdictions(listed);
    expect(canSubmit(rung, { value: 'X1', jurisdiction: OTHER_JURISDICTION })).toBe(false);
    expect(
      canSubmit(rung, { value: 'X1', jurisdiction: OTHER_JURISDICTION, jurisdictionOther: 'Kerala' }),
    ).toBe(true);
  });

  it('sends the typed place rather than the sentinel', () => {
    // "__other__" is a UI affordance, not a place. Letting it reach the server
    // would create a claim against a jurisdiction that does not exist.
    expect(
      jurisdictionForSubmission({ jurisdiction: OTHER_JURISDICTION, jurisdictionOther: ' Kerala ' }),
    ).toBe('Kerala');
    expect(jurisdictionForSubmission({ jurisdiction: 'GB' })).toBe('GB');
  });

  it('sends a chosen code, never its label', () => {
    // The code is matched; the label is only ever read by a person.
    expect(jurisdictionForSubmission({ jurisdiction: 'US-CA' })).toBe('US-CA');
  });

  it('survives a server that omits or malforms the list', () => {
    expect(toJurisdictions(undefined)).toEqual([]);
    expect(toJurisdictions(null)).toEqual([]);
    // An option with no code cannot be matched; one with no label cannot be
    // read. Both are dropped rather than shown as a broken row.
    expect(
      toJurisdictions([
        { code: 'GB', label: 'United Kingdom' },
        { code: '', label: 'Nowhere' },
        { code: 'X', label: '' },
      ] as never),
    ).toEqual([{ code: 'GB', label: 'United Kingdom' }]);
  });
});

describe('getting back into a rung you already answered', () => {
  const corridor: CorridorConfig = {
    key: 'sample',
    displayName: 'Sample',
    rungs: [
      {
        key: 'licence', displayName: 'Licence', requirement: 'required',
        input: 'identifier_with_jurisdiction', jurisdictions: [], order: 1,
      },
    ],
  };

  const withClaim = (method: VerificationClaim['method']): CandidateState => ({
    ...initialCandidateState,
    corridor,
    claims: [
      {
        rungKey: 'licence', factType: 'licence', factValue: 'RN-OK-1234',
        method, status: 'active', checkedAt: '2026-08-24T00:00:00Z',
      } as VerificationClaim,
    ],
  });

  it('offers a way back when nothing has been checked', () => {
    // The bug: once any claim existed the profile showed no action at all, so
    // a mistyped licence number could never be corrected by the person who
    // mistyped it.
    expect(buildProfileRows(withClaim('self_attested'))[0]?.actionLabel).toBe('Update this');
  });

  it('does not offer one once an issuing body has confirmed it', () => {
    // The register is the authority on the value at that point; changing it is
    // a different conversation from fixing your own typing.
    expect(buildProfileRows(withClaim('primary_source'))[0]?.actionLabel).toBeUndefined();
    expect(buildProfileRows(withClaim('source_checked'))[0]?.actionLabel).toBeUndefined();
  });

  it('still offers to add a rung with nothing on it', () => {
    expect(buildProfileRows({ ...initialCandidateState, corridor })[0]?.actionLabel).toBe('Add licence');
  });
});
