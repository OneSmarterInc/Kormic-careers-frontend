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

export interface CorridorRung {
  key: RungKey;
  displayName: string;
  requirement: Requirement;
  input: RungInput;
  /** Which helper bot services this rung, if any. Undefined means self-attested only. */
  verifier?: string;
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

export function findRung(corridor: CorridorConfig, key: RungKey): CorridorRung | undefined {
  return corridor.rungs.find((rung) => rung.key === key);
}
