import { CorridorConfig, CorridorRung, VerificationClaim, VerificationMethod, applicableRungs, methodLabels } from '../models/corridor';
import { CandidateState, RungState, claimsForRung } from '../models/onboarding';
import { formatDate } from './rungModel';

/**
 * The profile as rows, one per rung. There is deliberately no function here
 * that returns an overall verified state, and adding one would undo the point
 * of the claim model.
 */

export interface ProfileRow {
  rungKey: string;
  displayName: string;
  requirement: CorridorRung['requirement'];
  rungState: RungState;
  /** The current claim for this rung, if one has been recorded. */
  claim?: VerificationClaim;
  methodLine: string;
  needsAttention: boolean;
  actionLabel?: string;
}

/**
 * Expiry is computed when the row is read, never trusted from the stored
 * status. A fact confirmed in March and read in September is not the same fact.
 */
export function effectiveStatus(claim: VerificationClaim, now: Date = new Date()): VerificationClaim['status'] {
  if (claim.status !== 'active') return claim.status;
  if (claim.expiresAt && new Date(claim.expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function methodLine(
  claim: VerificationClaim | undefined,
  rungState: RungState,
  now: Date = new Date(),
): string {
  if (!claim) {
    if (rungState === 'skipped') return 'Not added';
    if (rungState === 'submitted' || rungState === 'checking') return 'Checking now';
    return 'Not provided';
  }
  const status = effectiveStatus(claim, now);
  const checked = claim.checkedAt ? ` on ${formatDate(claim.checkedAt)}` : '';
  if (status === 'expired') {
    return `${methodLabels[claim.method]}${checked}, and now out of date`;
  }
  if (status === 'failed') {
    return 'We could not confirm this';
  }
  if (status === 'disputed') {
    return 'This is being looked into';
  }
  return `${methodLabels[claim.method]}${checked}`;
}

export function buildProfileRows(state: CandidateState, now: Date = new Date()): ProfileRow[] {
  if (!state.corridor) return [];
  return applicableRungs(state.corridor).map((rung) => {
    const claim = claimsForRung(state, rung.key).find((entry) => entry.status !== 'superseded');
    const rungState = state.rungs[rung.key]?.state ?? 'unsubmitted';
    const status = claim ? effectiveStatus(claim, now) : undefined;
    const needsAttention = rungState === 'needs_attention' || status === 'expired' || status === 'failed';
    return {
      rungKey: rung.key,
      displayName: rung.displayName,
      requirement: rung.requirement,
      rungState,
      claim,
      methodLine: methodLine(claim, rungState, now),
      needsAttention,
      actionLabel: actionFor(rung, rungState, status),
    };
  });
}

function actionFor(
  rung: CorridorRung,
  rungState: RungState,
  status: VerificationClaim['status'] | undefined,
): string | undefined {
  if (status === 'expired') return 'Update this';
  if (status === 'failed') return 'Try again';
  if (rungState === 'needs_attention') return 'Answer the question';
  if (rungState === 'skipped' || rungState === 'unsubmitted') return `Add ${rung.displayName.toLowerCase()}`;
  return undefined;
}

/**
 * A breakdown, not a verdict. The person and the practice both see how many
 * facts sit at each method, and never one word standing in for all of them.
 */
export function methodCounts(rows: ProfileRow[]): Record<VerificationMethod, number> {
  const counts: Record<VerificationMethod, number> = {
    primary_source: 0,
    source_checked: 0,
    org_vouched: 0,
    self_attested: 0,
  };
  rows.forEach((row) => {
    if (row.claim) counts[row.claim.method] += 1;
  });
  return counts;
}

/** Non-blocking prompts. The profile is usable while these are outstanding. */
export function outstandingPrompts(rows: ProfileRow[]): string[] {
  return rows
    .filter((row) => row.needsAttention || (row.requirement === 'required' && !row.claim))
    .map((row) => row.displayName);
}

export function corridorName(corridor: CorridorConfig | undefined): string {
  return corridor?.displayName ?? '';
}
