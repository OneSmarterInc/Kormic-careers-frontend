import { CandidateState } from '../models/onboarding';

/**
 * The claim front door. The backend already refuses to reveal anything before
 * the code verifies: start returns a generic 404 so lists cannot be enumerated,
 * the code is hashed at rest with a short life and a five-attempt ceiling, and
 * verify hands back a signed session rather than trusting the client. These are
 * the client-side rules that follow from that.
 */

export const CODE_LENGTH = 6;
export const MAX_ATTEMPTS = 5;

export function isCodeWellFormed(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());
}

/**
 * Before the code verifies, the screen may show the masked address and nothing
 * else. Possession of a link is not evidence of anything.
 */
export function revealableBeforeVerify(state: CandidateState): string[] {
  return state.claim ? ['maskedEmail'] : [];
}

export function mayShowPrefill(state: CandidateState): boolean {
  return Boolean(state.claim?.verified);
}

/**
 * Failure messages. A wrong code and an unknown link read the same, because
 * telling them apart is how a list gets enumerated.
 */
export function claimError(kind: 'not_found' | 'bad_code' | 'expired' | 'locked' | 'network'): string {
  switch (kind) {
    case 'expired':
      return 'That code has run out. Ask for a new one.';
    case 'locked':
      return 'Too many tries. Ask for a new code.';
    case 'network':
      return 'We could not reach us just then. Try again.';
    case 'not_found':
    case 'bad_code':
    default:
      return 'That code did not match. Check it and try again.';
  }
}

/**
 * What someone without an invitation is told.
 *
 * There is no self-signup: a practice adds a person to its list and sends a
 * code, and the claim flow is the only thing that mints a session. Saying so
 * is the whole point of this string. The screen previously offered "I came
 * here on my own", handed out an empty session, and let the person walk four
 * screens before the first submission failed with nothing to explain it.
 *
 * It names no practice and promises no timeline, because we do not control
 * either.
 */
export const invitationOnlyNote =
  'Kormic works by invitation. A practice adds you to their list and sends you a code, ' +
  'and that code is what starts this. If you are speaking to a practice already, ask them for it.';

export function attemptsLine(used: number): string | undefined {
  const left = MAX_ATTEMPTS - used;
  if (used === 0 || left <= 0) return undefined;
  return left === 1 ? 'One try left before you need a new code.' : `${left} tries left.`;
}

/**
 * What the confirm step records. Anything the person changes from the roster
 * value is a divergence the practice countersigns, not a correction, so the
 * copy must not imply they are fixing somebody's mistake.
 */
export function divergenceNote(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1
    ? 'One detail differs from what the practice listed. We keep both.'
    : `${count} details differ from what the practice listed. We keep both.`;
}

export function countDivergences(
  rosterValues: Record<string, string | undefined>,
  personValues: Record<string, string | undefined>,
): number {
  return Object.keys(rosterValues).filter((key) => {
    const roster = rosterValues[key]?.trim();
    const person = personValues[key]?.trim();
    return Boolean(roster) && Boolean(person) && roster !== person;
  }).length;
}
