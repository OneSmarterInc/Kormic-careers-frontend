import { CorridorConfig, VerificationClaim, RungKey } from './corridor';

/** Routes that exist regardless of corridor. */
export type FrameRoute =
  | 'Welcome'
  | 'Tour' // what the ladder will ask, shown before anyone signs on
  | 'Entry' // signup or claim, chosen here
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

export interface CandidateState {
  route: Route;
  corridor?: CorridorConfig;
  corridorError?: string;
  entryMode?: EntryMode;
  claim?: ClaimSession;
  authSession?: AuthSession;
  person: Person;
  rungs: Record<RungKey, RungProgress>;
  claims: VerificationClaim[];
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

export function isPersonComplete(person: Person): boolean {
  return Boolean(
    person.fullName.trim() &&
      person.email.trim() &&
      /.+@.+\..+/.test(person.email) &&
      person.phone.trim() &&
      person.country.trim(),
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
