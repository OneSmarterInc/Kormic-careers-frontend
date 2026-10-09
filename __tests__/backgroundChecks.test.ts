import { CorridorConfig, VerificationClaim, applicableRungs, backgroundCheckRungs } from '../src/models/corridor';
import { CandidateState, dateOfBirthProblem, initialCandidateState, isPersonComplete, missingDetails } from '../src/models/onboarding';
import { orderedRoutes } from '../src/navigation/routes';
import { backgroundChecks, buildProfileRows, identifierList, methodCounts } from '../src/screens/profileModel';

const corridor: CorridorConfig = {
  key: 'sample',
  displayName: 'Sample',
  rungs: [
    {
      key: 'licence', displayName: 'Licence', requirement: 'required',
      input: 'identifier', jurisdictions: [], order: 1,
    },
    {
      key: 'oig', displayName: 'OIG exclusion list', requirement: 'optional',
      input: 'automatic', verifier: 'oig', route: 'free', jurisdictions: [], order: 20,
    },
  ],
};

const screen = (factValue: string, extra: Partial<VerificationClaim> = {}): VerificationClaim => ({
  rungKey: 'oig', factType: 'oig_exclusion', factValue,
  method: 'primary_source', status: 'active', checkedAt: '2026-10-01T00:00:00Z',
  shape: 'screens', sourceAsOf: '2026-09-10', matchedOn: ['full_name', 'date_of_birth'],
  ...extra,
});

const state = (
  claims: VerificationClaim[] = [],
  dateOfBirth?: string,
  screeningConsentAt: string | null = dateOfBirth ? '2026-10-01T15:00:00Z' : null,
): CandidateState => ({
  ...initialCandidateState,
  corridor,
  person: { ...initialCandidateState.person, fullName: 'Nora Lane', dateOfBirth, screeningConsentAt },
  claims,
});

describe('background checks are not steps', () => {
  it('keeps an automatic check off the ladder', () => {
    // It asks for nothing. Left in, the ladder would stop on a screen with no
    // field to fill and no way past it.
    expect(applicableRungs(corridor).map((rung) => rung.key)).toEqual(['licence']);
    expect(orderedRoutes(state()).some((route) => route.includes('oig'))).toBe(false);
  });

  it('lists it as a background check instead', () => {
    expect(backgroundCheckRungs(corridor).map((rung) => rung.key)).toEqual(['oig']);
  });

  it('never counts towards what was checked', () => {
    // A primary_source screen counted as "checked" would make an absence of
    // bad news look like a confirmed credential.
    const counts = methodCounts(buildProfileRows(state([screen('no_match')], '1984-02-11')));
    expect(counts.primary_source).toBe(0);
  });
});

describe('what the person reads', () => {
  it('waits for a name and date of birth before anything runs', () => {
    expect(backgroundChecks(state())[0]?.state).toBe('waiting_for_details');
  });

  it('says not run yet once the details are there', () => {
    expect(backgroundChecks(state([], '1984-02-11'))[0]?.line).toBe('Not run yet');
  });

  it('dates a clean result and says what it searched on', () => {
    const [check] = backgroundChecks(state([screen('no_match')], '1984-02-11'));
    expect(check?.state).toBe('no_match');
    expect(check?.line).toBe('No matching record in the list dated 10 Sept 2026');
    expect(check?.detail).toContain('your name and your date of birth');
  });

  it('never words a clean result as a pass', () => {
    const [check] = backgroundChecks(state([screen('no_match')], '1984-02-11'));
    const text = `${check?.line} ${check?.detail}`.toLowerCase();
    for (const word of ['clear', 'verified', 'passed', 'approved']) {
      expect(text).not.toContain(word);
    }
  });

  it('shows a hit only as under review', () => {
    const [check] = backgroundChecks(state([screen('under_review')], '1984-02-11'));
    expect(check?.state).toBe('under_review');
    expect(check?.line).toBe('Under review');
  });

  it('treats an outcome it does not recognise as under review, never as clean', () => {
    const [check] = backgroundChecks(state([screen('possible_match')], '1984-02-11'));
    expect(check?.state).toBe('under_review');
  });

  it('ignores a superseded result', () => {
    const [check] = backgroundChecks(
      state([screen('no_match', { status: 'superseded' })], '1984-02-11'),
    );
    expect(check?.state).toBe('not_run');
  });
});

describe('identifier wording', () => {
  it('reads as a sentence', () => {
    expect(identifierList(['full_name'])).toBe('your name');
    expect(identifierList(['full_name', 'previous_names', 'date_of_birth'])).toBe(
      'your name, your previous names and your date of birth',
    );
  });
});

describe('agreement to background checks', () => {
  it('waits for agreement even when the details are there', () => {
    const [check] = backgroundChecks(state([], '1984-02-11', null));
    expect(check?.line).toBe('Runs once you have agreed to background checks');
  });
});

describe('date of birth at signup', () => {
  const now = new Date(2026, 9, 1);

  it('accepts a real past date', () => {
    expect(dateOfBirthProblem('1984-02-11', now)).toBeUndefined();
  });

  it('is required', () => {
    expect(dateOfBirthProblem(undefined, now)).toBe('Add your date of birth.');
    expect(dateOfBirthProblem('  ', now)).toBe('Add your date of birth.');
  });

  it('refuses a typed or half-typed date', () => {
    expect(dateOfBirthProblem('11/02/1984', now)).toBe('Pick a date from the calendar.');
    expect(dateOfBirthProblem('1984-2-11', now)).toBe('Pick a date from the calendar.');
  });

  it('refuses a day that does not exist', () => {
    expect(dateOfBirthProblem('1985-02-30', now)).toBe('That is not a real date.');
  });

  it('refuses the future and the implausibly young or old', () => {
    expect(dateOfBirthProblem('2027-01-01', now)).toBe('A date of birth cannot be in the future.');
    expect(dateOfBirthProblem('2015-01-01', now)).toBe('You need to be at least 16.');
    expect(dateOfBirthProblem('1890-01-01', now)).toBe('Check the year.');
  });
});

describe('signup cannot continue without a date of birth and agreement', () => {
  const person = {
    ...initialCandidateState.person,
    fullName: 'Nora Lane', email: 'n@example.com', phone: '555', country: 'US',
  };

  it('needs both', () => {
    expect(isPersonComplete(person)).toBe(false);
    expect(isPersonComplete({ ...person, dateOfBirth: '1984-02-11' })).toBe(false);
    expect(isPersonComplete({ ...person, dateOfBirth: '1984-02-11', screeningConsent: true })).toBe(true);
  });

  it('says what is missing in words the person will recognise', () => {
    expect(missingDetails(person)).toEqual([
      'your date of birth', 'your agreement to background checks',
    ]);
  });

  it('never treats an unticked box as agreement', () => {
    expect(isPersonComplete({ ...person, dateOfBirth: '1984-02-11', screeningConsent: false })).toBe(false);
  });
});
