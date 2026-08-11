import {
  ClaimStatus,
  CorridorConfig,
  CorridorRung,
  Requirement,
  RungInput,
  VerificationClaim,
  VerificationMethod,
  VerificationRoute,
} from '../models/corridor';
import { Person } from '../models/onboarding';
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
  order: number;
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
    order: present(wire.order, 'rung.order'),
  };
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
