// Corridor configuration, fetched at app start. Nothing in this file names a
// discipline, a credential or an authority. The app renders whatever the
// corridor returns.

export type RungKey = string;

export type Requirement = 'required' | 'optional' | 'not_applicable';

/** What the screen for a rung has to render. Drives the form, not the meaning. */
export type RungInput =
  | 'identifier' // a single number or code
  | 'identifier_with_jurisdiction' // a number plus the body that issued it
  | 'oauth' // server-driven third-party login
  | 'document_upload'
  | 'screenshots'
  // Nothing for the person to hand in: a background check run from details we
  // already hold. Never a step on the ladder; shown under background checks.
  | 'automatic';

/**
 * Whether reaching this rung's authority costs money.
 *
 * 'free' runs on its own when the person joins, because there is no decision to
 * make about spending nothing. 'paid' waits until a hiring human ticks that
 * person, since anything costing money is the client's decision. 'none' means
 * no programmatic route exists, so the claim stays where the person left it.
 *
 * Undefined means nobody has established the cost yet, and it behaves as
 * 'none'. A rung whose cost is unknown must never look free.
 */
export type VerificationRoute = 'free' | 'paid' | 'none';

/**
 * Somewhere a credential can be issued.
 *
 * `code` is matched against the server's authority directory and is never
 * shown; `label` is shown and never matched. Keeping them apart is the point —
 * the field used to be free text asking for "the body that issued it", so a
 * person typing exactly what was asked for produced something the lookup could
 * never find.
 */
export interface Jurisdiction {
  code: string;
  label: string;
}

export interface CorridorRung {
  key: RungKey;
  displayName: string;
  requirement: Requirement;
  input: RungInput;
  /** Which helper bot services this rung, if any. Undefined means self-attested only. */
  verifier?: string;
  route?: VerificationRoute;
  /**
   * Where this credential may be issued. Empty when the corridor has not
   * enumerated them, and the screen falls back to a text box — a rung stays
   * usable before anyone has done that research.
   */
  jurisdictions: Jurisdiction[];
  order: number;
}

export interface CorridorConfig {
  key: string;
  displayName: string;
  rungs: CorridorRung[];
}

// --- Verification, per claim ---------------------------------------------

export type VerificationMethod =
  | 'primary_source'
  | 'source_checked'
  | 'org_vouched'
  | 'self_attested';

export type ClaimStatus = 'active' | 'expired' | 'superseded' | 'failed' | 'disputed';

/**
 * What kind of statement a claim makes. Orthogonal to `method`, which says how
 * good the source was.
 *
 * A `screens` claim is the result of searching a list for the person — a
 * federal exclusion check, a debarment check. It is legitimately
 * `primary_source`, because the list's publisher really was asked, so `method`
 * alone cannot tell it apart from a confirmed credential. Every ranking in this
 * app orders by method, which means without this field an absence of bad news
 * sorts to the top and renders as 'Confirmed with the issuing authority'.
 */
export type ClaimShape = 'asserts' | 'screens';

/**
 * One row per fact. There is deliberately no profile-level `verified` boolean
 * anywhere in this app, and no function that computes one.
 */
export interface VerificationClaim {
  rungKey: RungKey;
  factType: string;
  factValue: string;
  method: VerificationMethod;
  sourceRef?: string;
  verifier?: string;
  verifierVersion?: string;
  checkedAt?: string;
  expiresAt?: string | null;
  status: ClaimStatus;
  /**
   * Absent means a fact, and that is the honest default rather than a
   * convenience: a server that has not been taught about screens only ever
   * sends facts. Defaulting the other way would relabel every claim a screen
   * and empty the profile. Read it as `claim.shape === 'screens'`, which is
   * correct for undefined without anyone having to remember a fallback.
   */
  shape?: ClaimShape;
  /** For a screen: the date of the data searched, which is not the date it was
   *  searched. A monthly file read today answers a question about last month. */
  sourceAsOf?: string | null;
  /** For a screen: the identifiers it searched on. The difference between a
   *  weak miss and a strong one. */
  matchedOn?: string[];
}

/** Display text for a method. The app never substitutes a looser word. */
export const methodLabels: Record<VerificationMethod, string> = {
  primary_source: 'Confirmed with the issuing authority',
  source_checked: 'Checked against a source',
  org_vouched: 'Confirmed by the practice',
  self_attested: 'Provided by you, not yet checked',
};

export function applicableRungs(corridor: CorridorConfig): CorridorRung[] {
  return corridor.rungs
    .filter((rung) => rung.requirement !== 'not_applicable')
    // A background check asks the person for nothing, so it is not a step.
    // Left in, the ladder would stop on a screen with no field to fill.
    .filter((rung) => rung.input !== 'automatic')
    .sort((a, b) => a.order - b.order);
}

/** The checks run from details we already hold, in corridor order. */
export function backgroundCheckRungs(corridor: CorridorConfig): CorridorRung[] {
  return corridor.rungs
    .filter((rung) => rung.requirement !== 'not_applicable' && rung.input === 'automatic')
    .sort((a, b) => a.order - b.order);
}

/**
 * Whether anything will happen to this rung without a practice paying. Used by
 * the app to decide whether a submitted rung is genuinely being checked or is
 * simply held, which are different things and must read differently.
 */
export function runsOnJoin(rung: CorridorRung): boolean {
  return rung.route === 'free' && Boolean(rung.verifier);
}

/** Whether a practice could pay to have this confirmed later. */
export function awaitsPractice(rung: CorridorRung): boolean {
  return rung.route === 'paid';
}

export function findRung(corridor: CorridorConfig, key: RungKey): CorridorRung | undefined {
  return corridor.rungs.find((rung) => rung.key === key);
}
