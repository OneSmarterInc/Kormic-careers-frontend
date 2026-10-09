import { CorridorConfig, VerificationClaim, RungKey } from './corridor';

/** Routes that exist regardless of corridor. */
export type FrameRoute =
  | 'Welcome'
  | 'Tour' // what the ladder will ask, shown before anyone signs on
  | 'Entry' // signup or claim, chosen here
  | 'JoinCode' // signup path: prove control of the address the person gave
  | 'ClaimCode' // claim path only: prove control of the listed address
  | 'BasicInfo'
  | 'BuildingAgent'
  | 'AgentLive'
  | 'Profile'
  | 'Chat';

/** A rung route carries the corridor's key, so no rung is named in the type. */
export type RungRoute = `rung:${string}`;

export type Route = FrameRoute | RungRoute;

export function rungRoute(key: RungKey): RungRoute {
  return `rung:${key}`;
}

export function rungKeyOf(route: Route): RungKey | undefined {
  return route.startsWith('rung:') ? route.slice(5) : undefined;
}

export type EntryMode = 'signup' | 'claim';

/** Per-rung progress. Distinct from the claim's verification status. */
export type RungState =
  | 'unsubmitted'
  | 'submitted' // the person is done; the verifier may still be working
  | 'checking'
  | 'confirmed'
  | 'needs_attention' // the consistency engine disagreed; the Navigator asks
  | 'skipped';

export interface RungProgress {
  state: RungState;
  value?: string;
  jurisdiction?: string;
  documentName?: string;
  pending?: boolean;
  error?: string;
}

export interface Person {
  personId?: string; // never student_id
  fullName: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  country: string;

  /**
   * Identity resolution, for exclusion screening only.
   *
   * Both optional, and the product works without them — a screen run on a
   * name alone reports itself as weak rather than pretending to be
   * conclusive. They exist to tell this person apart from a stranger with
   * the same name on a federal exclusion list, which is as much about
   * clearing them as flagging them: a shared name with a different date of
   * birth is a different person.
   *
   * ISO `YYYY-MM-DD`, or undefined when not given.
   */
  dateOfBirth?: string;
  /** Maiden and prior names. An exclusion is recorded under the name held
   *  at the time, so the current one alone is not enough to search on. */
  previousNames?: string[];

  /**
   * Whether the person has agreed to be checked against the federal exclusion
   * lists. What they ticked in this sitting; the server records when.
   */
  screeningConsent?: boolean;
  /** When the server recorded their agreement. Null or absent if it has not. */
  screeningConsentAt?: string | null;
}

/**
 * The open path. Careers is not an invitation corridor: anyone may join, and
 * the practice pays to hire rather than to gate who exists. This holds the
 * address between asking for a code and proving it.
 */
export interface SignupSession {
  email: string;
  codeSent: boolean;
}

export interface ClaimSession {
  /** Masked until the code is verified. Nothing else is revealed before that. */
  maskedEmail: string;
  token?: string;
  verified: boolean;
  /** Set from the roster row and not editable by the claimant. */
  pinnedEmail?: string;
  /**
   * Handed back by verify and spent by confirm, which is what mints the
   * session. Dropping it meant the person finished the claim and still had no
   * token, so every later request went out unauthenticated.
   */
  claimToken?: string;
}

export interface AuthSession {
  access?: string;
  refresh?: string;
  personId?: string;
}

/**
 * Everything the server knows about a person, in one shape. Read at start so a
 * returning person sees their profile rather than an empty ladder.
 */
export interface PersonSnapshot {
  person: Person;
  claims: VerificationClaim[];
  /** What they call their Navigator, if they have named it. */
  agentName?: string;
}

export interface NavigationPoint {
  route: Route;
  tourIndex?: number;
  entryMode?: EntryMode;
}

export interface CandidateState {
  history?: NavigationPoint[];
  tourIndex?: number;
  route: Route;
  corridor?: CorridorConfig;
  corridorError?: string;
  entryMode?: EntryMode;
  signup?: SignupSession;
  claim?: ClaimSession;
  authSession?: AuthSession;
  person: Person;
  rungs: Record<RungKey, RungProgress>;
  claims: VerificationClaim[];
  /** What the person calls their Navigator, once they have named it. */
  agentName?: string;
  buildStage: number;
}

export const emptyPerson: Person = {
  fullName: '',
  email: '',
  phone: '',
  city: '',
  region: '',
  country: '',
};

export const initialCandidateState: CandidateState = {
  route: 'Welcome',
  person: emptyPerson,
  rungs: {},
  claims: [],
  buildStage: 0,
};

/** The youngest a person can be and still be signing up for work. */
export const MIN_AGE_YEARS = 16;

/**
 * Why a date of birth cannot be used, or undefined if it can.
 *
 * Required at signup, because background checks are searched on it: without
 * one, every stranger who shares a name with somebody excluded lands in a
 * manual queue. A date that is not a real day, is in the future, or makes the
 * person implausibly young or old is almost always a slip of the picker.
 */
export function dateOfBirthProblem(value: string | undefined, now: Date = new Date()): string | undefined {
  const text = (value ?? '').trim();
  if (!text) return 'Add your date of birth.';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return 'Pick a date from the calendar.';
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return 'That is not a real date.';
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today) return 'A date of birth cannot be in the future.';
  const youngest = Date.UTC(now.getFullYear() - MIN_AGE_YEARS, now.getMonth(), now.getDate());
  if (date.getTime() > youngest) return `You need to be at least ${MIN_AGE_YEARS}.`;
  if (year < now.getFullYear() - 120) return 'Check the year.';
  return undefined;
}

/** Agreed in this sitting, or recorded by the server on an earlier one. */
export function hasScreeningConsent(person: Person): boolean {
  return person.screeningConsent === true || Boolean(person.screeningConsentAt);
}

/** What still stands between this person and Continue, in words they will recognise. */
export function missingDetails(person: Person, now: Date = new Date()): string[] {
  const missing: string[] = [];
  if (!person.fullName.trim()) missing.push('your name');
  if (!person.email.trim() || !/.+@.+\..+/.test(person.email)) missing.push('a valid email');
  if (!person.phone.trim()) missing.push('your phone');
  if (!person.country.trim()) missing.push('your country');
  if (dateOfBirthProblem(person.dateOfBirth, now)) missing.push('your date of birth');
  if (!hasScreeningConsent(person)) missing.push('your agreement to background checks');
  return missing;
}

export function isPersonComplete(person: Person, now: Date = new Date()): boolean {
  return Boolean(
    person.fullName.trim() &&
      person.email.trim() &&
      /.+@.+\..+/.test(person.email) &&
      person.phone.trim() &&
      person.country.trim() &&
      // Both required: the checks are searched on the date, and are not run
      // at all without agreement.
      !dateOfBirthProblem(person.dateOfBirth, now) &&
      hasScreeningConsent(person),
  );
}

/** The email is pinned on the claim path and free on signup. */
export function isEmailEditable(state: CandidateState): boolean {
  return !(state.entryMode === 'claim' && Boolean(state.claim?.pinnedEmail));
}

/** Claims for one rung, most recent check first. No rollup. */
export function claimsForRung(state: CandidateState, key: RungKey): VerificationClaim[] {
  return state.claims
    .filter((claim) => claim.rungKey === key)
    .sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''));
}
