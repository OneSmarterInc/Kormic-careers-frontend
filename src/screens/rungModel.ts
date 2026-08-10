import { CorridorRung, VerificationClaim, methodLabels } from '../models/corridor';
import { RungProgress, RungState } from '../models/onboarding';

/**
 * Everything the rung screen needs to decide, as pure functions. The component
 * renders this; it makes no decisions of its own. Keeps the screen testable
 * without a renderer, the way the student app tests gates rather than pixels.
 */

export interface RungField {
  key: 'value' | 'jurisdiction';
  label: string;
  placeholder: string;
}

export interface RungDraft {
  value?: string;
  jurisdiction?: string;
  documentName?: string;
  /** Held only long enough to upload. The file itself never enters app state. */
  documentUri?: string;
  attachmentCount?: number;
}

/** Copy comes from the corridor's own words, never from a hard-coded credential name. */
export function fieldsFor(rung: CorridorRung): RungField[] {
  switch (rung.input) {
    case 'identifier':
      return [{ key: 'value', label: `${rung.displayName} number`, placeholder: 'As it appears on the record' }];
    case 'identifier_with_jurisdiction':
      return [
        { key: 'value', label: `${rung.displayName} number`, placeholder: 'As it appears on the record' },
        { key: 'jurisdiction', label: 'Issued by', placeholder: 'The body that issued it' },
      ];
    default:
      return [];
  }
}

export function canSubmit(rung: CorridorRung, draft: RungDraft): boolean {
  switch (rung.input) {
    case 'identifier':
      return Boolean(draft.value?.trim());
    case 'identifier_with_jurisdiction':
      return Boolean(draft.value?.trim() && draft.jurisdiction?.trim());
    case 'document_upload':
      return Boolean(draft.documentName);
    case 'screenshots':
      return (draft.attachmentCount ?? 0) > 0;
    case 'oauth':
      return false; // the server drives this one; the button is not a submit
    default:
      return false;
  }
}

export function primaryActionLabel(rung: CorridorRung, progress?: RungProgress): string {
  if (progress?.state === 'needs_attention') return 'Answer the question';
  switch (rung.input) {
    case 'oauth':
      return `Connect ${rung.displayName}`;
    case 'document_upload':
      return progress?.documentName ? 'Continue' : 'Choose a file';
    case 'screenshots':
      return (progress?.state ?? 'unsubmitted') === 'unsubmitted' ? 'Add screenshots' : 'Continue';
    default:
      return 'Continue';
  }
}

export function canSkip(rung: CorridorRung): boolean {
  return rung.requirement === 'optional';
}

// --- handing a rung in ----------------------------------------------------

export type SubmissionStep = 'upload' | 'submit';

/**
 * What handing in this rung involves, in order.
 *
 * The upload goes first. A claim recorded against a document that never
 * arrived is exactly the half-truth the whole verification model exists to
 * avoid, so the ordering is a rule rather than an implementation detail, and
 * it lives here where a test can hold it.
 */
export function submissionSteps(rung: CorridorRung, draft: RungDraft): SubmissionStep[] {
  if (rung.input === 'document_upload' && draft.documentName) return ['upload', 'submit'];
  return ['submit'];
}

/**
 * What a polled claim means for the rung, or undefined if it means nothing yet.
 *
 * The submission endpoint writes a self_attested claim immediately, so polling
 * for "has the verifier answered" and accepting any claim at all stops on the
 * person's own submission echoed back. Only a method above self_attested is a
 * verifier having said something, and until then the poll keeps waiting.
 */
export function rungStateFromClaim(claim: VerificationClaim): RungState | undefined {
  if (claim.method === 'self_attested') return undefined;
  // A check that came back disagreeing is not a confirmation, and the
  // Navigator asks about it rather than the screen declaring it good.
  if (claim.status === 'failed' || claim.status === 'disputed') return 'needs_attention';
  return 'confirmed';
}

/**
 * What the OAuth handshake ending means. Running out of attempts is
 * deliberately not a failure: the server may still complete the handshake
 * after the client stops asking, so the rung stays checking rather than being
 * called failed and sent back to the start.
 */
export function oauthResult(
  rung: CorridorRung,
  outcome: 'connected' | 'error' | undefined,
): { rungState: RungState; failure?: string } {
  if (outcome === 'connected') return { rungState: 'confirmed' };
  if (outcome === 'error') {
    return {
      rungState: 'unsubmitted',
      failure: `${rung.displayName} did not connect. Try again.`,
    };
  }
  return {
    rungState: 'checking',
    failure: `${rung.displayName} is taking longer than expected. You can carry on.`,
  };
}

/**
 * What the person reads under the field. Never rolls several claims into one
 * word, and never says confirmed on the strength of a submission.
 */
export function statusLine(
  rung: CorridorRung,
  progress: RungProgress | undefined,
  claims: VerificationClaim[],
): string {
  const state = progress?.state ?? 'unsubmitted';
  if (state === 'needs_attention') {
    return 'Something here does not match your other records. Your Navigator will ask you about it.';
  }
  if (state === 'skipped') {
    return 'Skipped. You can add this later from your profile.';
  }
  if (state === 'checking' || (state === 'submitted' && rung.verifier)) {
    return 'Checking this now. You can carry on; we will tell you when it comes back.';
  }
  if (state === 'submitted') {
    return 'Saved. Nobody has checked this yet.';
  }
  const latest = claims[0];
  if (latest) {
    return `${methodLabels[latest.method]}${latest.checkedAt ? ` on ${formatDate(latest.checkedAt)}` : ''}`;
  }
  return '';
}

/** The check date is always shown next to the method. A method without a date is not a claim. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function errorFor(rung: CorridorRung, draft: RungDraft, touched: boolean): string | undefined {
  if (!touched || canSubmit(rung, draft)) return undefined;
  switch (rung.input) {
    case 'identifier':
      return `Enter your ${rung.displayName.toLowerCase()} number.`;
    case 'identifier_with_jurisdiction':
      return draft.value?.trim()
        ? 'Name the body that issued it.'
        : `Enter your ${rung.displayName.toLowerCase()} number.`;
    case 'document_upload':
      return 'Choose a PDF or Word file.';
    case 'screenshots':
      return 'Add at least one screenshot.';
    default:
      return undefined;
  }
}
