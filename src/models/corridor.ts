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
  | 'screenshots';

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

export interface CorridorRung {
  key: RungKey;
  displayName: string;
  requirement: Requirement;
  input: RungInput;
  /** Which helper bot services this rung, if any. Undefined means self-attested only. */
  verifier?: string;
  route?: VerificationRoute;
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
