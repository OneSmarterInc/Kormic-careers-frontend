import {
  CorridorConfig,
  CorridorRung,
  VerificationClaim,
  VerificationMethod,
  applicableRungs,
  awaitsPractice,
  backgroundCheckRungs,
  methodLabels,
  runsOnJoin,
} from '../models/corridor';
import { CandidateState, RungState, claimsForRung } from '../models/onboarding';
import { formatDate } from './rungModel';

/**
 * The profile as rows, one per rung. There is deliberately no function here
 * that returns an overall verified state, and adding one would undo the point
 * of the claim model.
 */

/**
 * One fact recorded under a rung.
 *
 * A rung is where a fact came from, not what it is about. A CV asserts a name,
 * an institution and a work history, and a practice weighs those differently,
 * so each is its own row with its own method and date. Rolling them into one
 * line would be the profile-level verdict this model exists to avoid, just at
 * a smaller scale.
 */
export interface ProfileFact {
  factType: string;
  /** Readable, derived mechanically. See `factLabel`. */
  label: string;
  claim: VerificationClaim;
  methodLine: string;
  needsAttention: boolean;
}

export interface ProfileRow {
  rungKey: string;
  displayName: string;
  requirement: CorridorRung['requirement'];
  rungState: RungState;
  /** Every live fact under this rung, strongest method first. */
  facts: ProfileFact[];
  /** The one that stands for the rung, if any. */
  headline?: VerificationClaim;
  methodLine: string;
  needsAttention: boolean;
  actionLabel?: string;
}

const METHOD_STRENGTH: Record<VerificationMethod, number> = {
  primary_source: 0,
  source_checked: 1,
  org_vouched: 2,
  self_attested: 3,
};

/**
 * A readable name for a fact type, derived rather than looked up.
 *
 * There is deliberately no table of fact names in this app. The corridor names
 * its rungs and the backend names its facts, and a hardcoded vocabulary here
 * would be the client knowing what a credential is called — which is the one
 * rule this codebase does not bend. Mechanical is uglier and cannot go stale.
 */
export function factLabel(factType: string): string {
  const words = factType.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : factType;
}

/**
 * The live facts for a rung, one per fact type, strongest first.
 *
 * The server supersedes per fact type, so there should be one live claim each.
 * Deduping anyway costs nothing and means a backend that ever sends two does
 * not produce two rows saying different things about the same fact.
 */
export function factsForRung(
  state: CandidateState,
  rungKey: string,
  now: Date = new Date(),
): ProfileFact[] {
  const byType = new Map<string, VerificationClaim>();

  claimsForRung(state, rungKey)
    .filter((claim) => claim.status !== 'superseded')
    // A screen is not a fact about the person, and this function ranks by
    // method. An exclusion check is legitimately `primary_source`, so left in
    // it would sort above a real credential and render as 'Confirmed with the
    // issuing authority' — for having found nothing. Screens belong in their
    // own section, in their own words; they are not facts with a lower score.
    .filter((claim) => claim.shape !== 'screens')
    .forEach((claim) => {
      const existing = byType.get(claim.factType);
      if (!existing || METHOD_STRENGTH[claim.method] < METHOD_STRENGTH[existing.method]) {
        byType.set(claim.factType, claim);
      }
    });

  return [...byType.values()]
    .sort((a, b) => METHOD_STRENGTH[a.method] - METHOD_STRENGTH[b.method])
    .map((claim) => {
      const status = effectiveStatus(claim, now);
      return {
        factType: claim.factType,
        label: factLabel(claim.factType),
        claim,
        methodLine: methodLine(claim, 'confirmed', now),
        needsAttention: status === 'expired' || status === 'failed',
      };
    });
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
  rung?: CorridorRung,
): string {
  if (!claim) {
    if (rungState === 'skipped') return 'Not added';
    if (rungState === 'checking') return 'Checking now';
    if (rungState === 'submitted') {
      if (rung && runsOnJoin(rung)) return 'Checking now';
      if (rung && awaitsPractice(rung)) return 'Held. Confirmed if a practice takes you forward';
      return 'Provided by you, not yet checked';
    }
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
    const facts = factsForRung(state, rung.key, now);
    // The fact named after the rung is the one that stands for it; failing
    // that, the strongest. A licence rung's headline is the licence, not a
    // skills list the same document happened to produce.
    const headline =
      facts.find((fact) => fact.factType === rung.key)?.claim ?? facts[0]?.claim;
    const rungState = state.rungs[rung.key]?.state ?? 'unsubmitted';
    const status = headline ? effectiveStatus(headline, now) : undefined;
    const needsAttention =
      rungState === 'needs_attention' || facts.some((fact) => fact.needsAttention);
    return {
      rungKey: rung.key,
      displayName: rung.displayName,
      requirement: rung.requirement,
      rungState,
      facts,
      headline,
      methodLine: methodLine(headline, rungState, now, rung),
      needsAttention,
      actionLabel: actionFor(rung, rungState, status, facts.length > 0, headline),
    };
  });
}

function actionFor(
  rung: CorridorRung,
  rungState: RungState,
  status: VerificationClaim['status'] | undefined,
  hasClaim: boolean,
  headline: VerificationClaim | undefined,
): string | undefined {
  if (status === 'expired') return 'Update this';
  if (status === 'failed') return 'Try again';
  if (rungState === 'needs_attention') return 'Answer the question';
  // The claim decides, not the rung's progress. A person returning to their
  // profile has claims loaded from the server and no per-rung progress at all,
  // so keying the prompt off rungState alone offered to add things they had
  // already provided.
  if (!hasClaim && (rungState === 'skipped' || rungState === 'unsubmitted')) {
    return `Add ${rung.displayName.toLowerCase()}`;
  }
  // Nothing above what the person typed has been established, so what they
  // typed is all anybody has — and if it was wrong, this is the only way back
  // to fix it. Without this the profile offered no route into a rung that
  // already had a claim, which meant a mistyped licence number could never be
  // corrected by the person who mistyped it.
  //
  // Not offered once something has been confirmed with an issuing body: at
  // that point the register is the authority on the value, and editing it is a
  // different conversation from correcting your own typing.
  if (hasClaim && headline?.method === 'self_attested') return 'Update this';
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
  // Counted per fact, not per rung. Each fact carries its own method, and a
  // rung that established three of them has told a practice three things.
  rows.forEach((row) => {
    row.facts.forEach((fact) => {
      counts[fact.claim.method] += 1;
    });
  });
  return counts;
}

/** Non-blocking prompts. The profile is usable while these are outstanding. */
export function outstandingPrompts(rows: ProfileRow[]): string[] {
  return rows
    .filter((row) => row.needsAttention || (row.requirement === 'required' && row.facts.length === 0))
    .map((row) => row.displayName);
}

/**
 * What signing out actually costs, said before it happens.
 *
 * There is no password to come back with. The person needs a new code sent to
 * the same address, so a one-tap sign-out with no warning would strand anyone
 * who no longer has access to that inbox. The confirmation is the honesty, not
 * a nag.
 */
export const signOutWarning =
  'You will need a new code sent to your address to sign back in.';

/** Who this profile belongs to, so switching accounts is never ambiguous. */
export function signedInAs(state: CandidateState): string | undefined {
  return state.person.email || undefined;
}

export function corridorName(corridor: CorridorConfig | undefined): string {
  return corridor?.displayName ?? '';
}

// --- background checks ------------------------------------------------------

/**
 * One background check as the person sees it.
 *
 * Deliberately three outcomes and no more. The server never sends a possible
 * match to the person it is about — it arrives as `under_review` — because a
 * name hit on an exclusion list is usually somebody else, and nobody should
 * read "possible match" about themselves before a human has looked.
 */
export type BackgroundCheckState = 'waiting_for_details' | 'not_run' | 'no_match' | 'under_review';

export interface BackgroundCheck {
  rungKey: string;
  title: string;
  state: BackgroundCheckState;
  line: string;
  detail?: string;
}

const IDENTIFIER_WORDS: Record<string, string> = {
  full_name: 'your name',
  previous_names: 'your previous names',
  date_of_birth: 'your date of birth',
  npi: 'your NPI',
  licence_number: 'your licence number',
};

/** "your name and your date of birth", from the identifiers a screen used. */
export function identifierList(matchedOn: string[] | undefined): string {
  const words = (matchedOn ?? []).map(
    (id) => IDENTIFIER_WORDS[id] ?? factLabel(id).toLowerCase(),
  );
  if (words.length <= 1) return words[0] ?? 'nothing';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The background checks section.
 *
 * Every line carries the date of the list that was searched, because a monthly
 * list read today answers a question about last month. None says clear,
 * verified or passed: finding nothing on a list is not a credential, and the
 * wording must not let it read as one.
 */
export function backgroundChecks(state: CandidateState): BackgroundCheck[] {
  if (!state.corridor) return [];
  const hasDetails = Boolean(state.person.fullName?.trim() && state.person.dateOfBirth);
  const agreed = Boolean(state.person.screeningConsentAt) || state.person.screeningConsent === true;

  return backgroundCheckRungs(state.corridor).map((rung) => {
    const claim = claimsForRung(state, rung.key).find(
      (entry) => entry.shape === 'screens' && entry.status !== 'superseded',
    );
    const base = { rungKey: rung.key, title: rung.displayName };

    if (!claim && !agreed) {
      return {
        ...base,
        state: 'waiting_for_details' as const,
        line: 'Runs once you have agreed to background checks',
      };
    }

    if (!claim) {
      return hasDetails
        ? { ...base, state: 'not_run' as const, line: 'Not run yet' }
        : {
            ...base,
            state: 'waiting_for_details' as const,
            line: 'Runs once you have added your name and date of birth',
          };
    }

    if (claim.factValue === 'no_match') {
      const dated = claim.sourceAsOf ? ` dated ${formatDate(claim.sourceAsOf)}` : '';
      return {
        ...base,
        state: 'no_match' as const,
        line: `No matching record in the list${dated}`,
        detail: `Searched on ${identifierList(claim.matchedOn)}. This says the list has no record matching you, and nothing more.`,
      };
    }

    // Anything else — including a value this version of the app has never
    // seen — waits for a person. Showing an unknown outcome as a clean result
    // is the one mistake this section must not be able to make.
    return {
      ...base,
      state: 'under_review' as const,
      line: 'Under review',
      detail: 'Someone on our team is looking at this. It is often a different person with a similar name.',
    };
  });
}
