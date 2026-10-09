import {
  Jurisdiction,
  ClaimShape,
  ClaimStatus,
  CorridorConfig,
  CorridorRung,
  Requirement,
  RungInput,
  VerificationClaim,
  VerificationMethod,
  VerificationRoute,
} from '../models/corridor';
import { Person, PersonSnapshot } from '../models/onboarding';
import { EscalationStatus, Message, RawMessage, parseMessage } from '../screens/chatModel';

/**
 * The wire contract. This file is the agreement between the app and the
 * backend, and it exists because the student client ended up carrying six
 * shapes for one LinkedIn response and two names for one access token, which is
 * what happens when a client is written against a contract that keeps moving.
 *
 * Rules this file enforces by construction:
 *   1. One name per field. No `access` or `access_token`. No optional aliases.
 *   2. Every wire type has exactly one adapter into a domain type, below.
 *   3. Screens never see a Wire type. Services call the adapter and return
 *      domain objects, so a backend rename touches this file and nothing else.
 *   4. Unknown fields are ignored, missing required fields throw here rather
 *      than surfacing as undefined three screens later.
 */

// --- Endpoints ------------------------------------------------------------

export const endpoints = {
  /** The person and their claims, in one call. What lets somebody come back. */
  me: '/api/me/',
  corridor: (key: string) => `/api/corridors/${key}/`,
  // The open front door. Careers is not invitation-only; the claim routes
  // below are the secondary path for when a practice brings a roster.
  signupStart: '/api/signup/start/',
  signupVerify: '/api/signup/verify/',
  claimStart: '/api/claim/start/',
  claimVerify: '/api/claim/verify/',
  claimConfirm: '/api/claim/confirm/',
  rungSubmit: '/api/claims/submit/',
  rungStatus: (rungKey: string) => `/api/claims/${rungKey}/`,
  rungDocument: (rungKey: string) => `/api/claims/${rungKey}/document/`,
  oauthAuthorize: (rungKey: string) => `/api/oauth/${rungKey}/authorize/`,
  oauthStatus: (rungKey: string) => `/api/oauth/${rungKey}/status/`,
  chatHistory: '/api/agent/history/',
  chatSend: '/api/agent/message/',
  chatRename: '/api/agent/name/',
  escalationStatuses: '/api/agent/escalations/',
  pushRegister: '/api/notifications/register/',
} as const;

// --- Wire types -----------------------------------------------------------

export interface WireCorridorRung {
  key: string;
  display_name: string;
  requirement: Requirement;
  input: RungInput;
  verifier: string | null;
  /** Null means nobody has established the cost. Read as 'none', never as free. */
  route: VerificationRoute | null;
  /** Absent on a server that predates the picker; read as "not enumerated". */
  jurisdictions?: WireJurisdiction[] | null;
  order: number;
}

export interface WireJurisdiction {
  code: string;
  label: string;
}

export interface WireCorridor {
  key: string;
  display_name: string;
  rungs: WireCorridorRung[];
}

export interface WireVerificationClaim {
  rung_key: string;
  fact_type: string;
  fact_value: string;
  method: VerificationMethod;
  source_ref: string | null;
  verifier: string | null;
  verifier_version: string | null;
  checked_at: string | null;
  expires_at: string | null;
  status: ClaimStatus;
  shape?: ClaimShape | null;
  source_as_of?: string | null;
  matched_on?: string[] | null;
}

export interface WireSignupStart {
  /** Echoed back normalised. Never the code, which would defeat the point. */
  email: string;
}

export interface WireClaimStart {
  masked_email: string;
}

export interface WireClaimVerify {
  claim_token: string;
  pinned_email: string;
  prefill: Partial<Record<keyof Person, string>>;
}

export interface WireSession {
  access: string;
  refresh: string;
  person_id: string;
}

export interface WireEscalationStatus {
  query_id: string;
  status: EscalationStatus;
}

export interface WirePerson {
  person_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  country: string;
  agent_name: string | null;
  date_of_birth?: string | null;
  previous_names?: string[] | null;
  screening_consent_at?: string | null;
}

export interface WireMe {
  person: WirePerson;
  claims: WireVerificationClaim[];
}

export interface WireOAuthAuthorize {
  authorize_url: string;
}

export interface WireOAuthStatus {
  status: 'pending' | 'connected' | 'error';
}

/**
 * The chat message shape. `pending` and `query_id` are required on the send
 * reply and `escalation` is required on history rows, because the backend
 * already computes both and the student client dropped them. Nullable, not
 * absent, so a missing field is a contract violation rather than an unanswered
 * question.
 */
export interface WireMessage {
  id: string;
  role: 'person' | 'navigator';
  content: string;
  created_at: string;
  escalation: { query_id: string; status: EscalationStatus } | null;
}

export interface WireError {
  code: 'not_found' | 'bad_code' | 'expired' | 'locked' | 'unauthorised' | 'server';
  detail: string;
}

// --- Adapters -------------------------------------------------------------

function present<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Contract violation: ${field} is missing`);
  }
  return value;
}

export function toCorridor(wire: WireCorridor): CorridorConfig {
  return {
    key: present(wire.key, 'corridor.key'),
    displayName: present(wire.display_name, 'corridor.display_name'),
    rungs: present(wire.rungs, 'corridor.rungs').map(toRung),
  };
}

export function toRung(wire: WireCorridorRung): CorridorRung {
  return {
    key: present(wire.key, 'rung.key'),
    displayName: present(wire.display_name, 'rung.display_name'),
    requirement: present(wire.requirement, 'rung.requirement'),
    input: present(wire.input, 'rung.input'),
    verifier: wire.verifier ?? undefined,
    route: wire.route ?? undefined,
    jurisdictions: toJurisdictions(wire.jurisdictions),
    order: present(wire.order, 'rung.order'),
  };
}

/**
 * Absent, null, malformed and empty all become an empty list, and the screen
 * falls back to a text box.
 *
 * Deliberately not `present()`: an unreachable authority list is a reason to
 * ask the person to type it, not to fail the whole corridor fetch and leave
 * them looking at an error. Entries missing a code or a label are dropped —
 * an option that cannot be matched or cannot be read is worse than absent.
 */
export function toJurisdictions(wire: WireJurisdiction[] | null | undefined): Jurisdiction[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .filter((entry) => entry && typeof entry.code === 'string' && typeof entry.label === 'string')
    .filter((entry) => entry.code.trim() !== '' && entry.label.trim() !== '')
    .map((entry) => ({ code: entry.code.trim(), label: entry.label.trim() }));
}

export function toVerificationClaim(wire: WireVerificationClaim): VerificationClaim {
  return {
    rungKey: present(wire.rung_key, 'claim.rung_key'),
    factType: present(wire.fact_type, 'claim.fact_type'),
    factValue: present(wire.fact_value, 'claim.fact_value'),
    method: present(wire.method, 'claim.method'),
    sourceRef: wire.source_ref ?? undefined,
    verifier: wire.verifier ?? undefined,
    verifierVersion: wire.verifier_version ?? undefined,
    // A method without a check date is not a claim, and the profile refuses to
    // render one, so it is required at the boundary rather than defaulted.
    checkedAt: present(wire.checked_at, 'claim.checked_at'),
    expiresAt: wire.expires_at,
    status: present(wire.status, 'claim.status'),
    // Optional at the boundary and defaulted to a fact, unlike the fields
    // above. An older server does not send these, and the honest reading of
    // its silence is that everything it sends is a fact — which is true. The
    // opposite default would relabel every claim a screen and empty the
    // profile. `present()` would be wrong here for the same reason: a missing
    // shape is a server that predates the concept, not a broken payload.
    shape: wire.shape === 'screens' ? 'screens' : 'asserts',
    sourceAsOf: wire.source_as_of ?? null,
    matchedOn: Array.isArray(wire.matched_on) ? wire.matched_on : [],
  };
}

export function toMessage(wire: WireMessage): Message {
  const raw: RawMessage = {
    id: present(wire.id, 'message.id'),
    role: wire.role,
    content: wire.content,
    created_at: present(wire.created_at, 'message.created_at'),
    escalation: wire.escalation
      ? { query_id: wire.escalation.query_id, status: wire.escalation.status }
      : undefined,
  };
  return parseMessage(raw);
}

export function toSession(wire: WireSession) {
  return {
    access: present(wire.access, 'session.access'),
    refresh: present(wire.refresh, 'session.refresh'),
    personId: present(wire.person_id, 'session.person_id'),
  };
}

export function toEscalationStatuses(
  wire: WireEscalationStatus[],
): { queryId: string; status: EscalationStatus }[] {
  return wire.map((entry) => ({
    queryId: present(entry.query_id, 'escalation.query_id'),
    status: present(entry.status, 'escalation.status'),
  }));
}

export function toSignupStart(wire: WireSignupStart): { email: string } {
  return { email: present(wire.email, 'signupStart.email') };
}

export function toPerson(wire: WirePerson): Person {
  return {
    // Identity, so both are required rather than defaulted. A person with no
    // id is not a person this app can write a claim against.
    personId: present(wire.person_id, 'person.person_id'),
    email: present(wire.email, 'person.email'),
    fullName: wire.full_name ?? '',
    phone: wire.phone ?? '',
    city: wire.city ?? '',
    region: wire.region ?? '',
    country: wire.country ?? '',
    // Optional at the boundary, unlike the identity fields above. A server
    // that has not been taught about them simply does not send them, and
    // absent is a legitimate answer from the person too.
    dateOfBirth: wire.date_of_birth ?? undefined,
    previousNames: Array.isArray(wire.previous_names) ? wire.previous_names : undefined,
    screeningConsentAt: wire.screening_consent_at ?? null,
  };
}

/**
 * What a person may change about themselves, on the way out.
 *
 * The date of birth and previous names were collected on screen and then left
 * out of this body, so they never reached the server and background checks
 * waited forever for details the person had already given.
 *
 * A date that is not YYYY-MM-DD is left out rather than sent. The server
 * refuses a malformed date, and that would fail the whole save — losing the
 * name and phone along with it — over one half-typed field.
 */
export function toPersonUpdate(person: Person): Record<string, unknown> {
  const body: Record<string, unknown> = {
    full_name: person.fullName,
    phone: person.phone,
    city: person.city,
    region: person.region,
    country: person.country,
  };
  const dob = person.dateOfBirth?.trim();
  if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) body.date_of_birth = dob;
  if (person.previousNames) body.previous_names = person.previousNames;
  // A yes or no only. The server stamps the time, so it cannot be backdated
  // from here.
  if (person.screeningConsent !== undefined) body.screening_consent = person.screeningConsent;
  return body;
}

export function toMe(wire: WireMe): PersonSnapshot {
  return {
    person: toPerson(present(wire.person, 'me.person')),
    claims: present(wire.claims, 'me.claims').map(toVerificationClaim),
    agentName: wire.person?.agent_name ?? undefined,
  };
}

export function toClaimStart(wire: WireClaimStart): { maskedEmail: string } {
  return { maskedEmail: present(wire.masked_email, 'claimStart.masked_email') };
}

export function toClaimVerify(wire: WireClaimVerify): {
  claimToken: string;
  pinnedEmail: string;
  prefill: Partial<Person>;
} {
  return {
    claimToken: present(wire.claim_token, 'claimVerify.claim_token'),
    // The address is pinned from the roster row and the app refuses to edit it,
    // so a missing one is a contract violation rather than an empty field.
    pinnedEmail: present(wire.pinned_email, 'claimVerify.pinned_email'),
    prefill: (wire.prefill ?? {}) as Partial<Person>,
  };
}

export function toAuthorizeUrl(wire: WireOAuthAuthorize): string {
  return present(wire.authorize_url, 'oauth.authorize_url');
}

export function toOAuthStatus(wire: WireOAuthStatus): 'pending' | 'connected' | 'error' {
  return present(wire.status, 'oauth.status');
}

/**
 * The person identifier is `person_id` everywhere. Not student_id, not user_id.
 * If the spine decision lands on StudentProfile as storage, the mapping happens
 * server side or in this file, never in a screen.
 */
export const personIdField = 'person_id' as const;
