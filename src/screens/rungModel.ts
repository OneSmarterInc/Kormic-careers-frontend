import {
  CorridorRung,
  Jurisdiction,
  VerificationClaim,
  awaitsPractice,
  methodLabels,
  runsOnJoin,
} from '../models/corridor';
import { RungProgress, RungState } from '../models/onboarding';
import { PickedFile } from '../services/candidateServices';

/**
 * Everything the rung screen needs to decide, as pure functions. The component
 * renders this; it makes no decisions of its own. Keeps the screen testable
 * without a renderer, the way the student app tests gates rather than pixels.
 */

/** The option that keeps a person moving when their authority is not listed. */
export const OTHER_JURISDICTION = '__other__';

export interface RungField {
  key: 'value' | 'jurisdiction';
  label: string;
  placeholder: string;
  /**
   * Present when the corridor enumerated the choices, and the screen renders a
   * picker rather than a text box. Absent means free text.
   */
  choices?: Jurisdiction[];
}

export interface RungDraft {
  value?: string;
  jurisdiction?: string;
  /** Only meaningful while `jurisdiction` is OTHER_JURISDICTION. */
  jurisdictionOther?: string;
  documentName?: string;
  /** Held only long enough to upload. The file itself never enters app state. */
  documentUri?: string;
  /** On web the picker hands back a File, and FormData needs that, not the uri. */
  documentFile?: File;
  documentMimeType?: string;
  documentSize?: number;
  /**
   * For a rung that asks for screenshots. A LinkedIn profile does not fit in
   * one image, so this is a set the person builds up and can prune.
   */
  attachments?: PickedFile[];
}

/** Copy comes from the corridor's own words, never from a hard-coded credential name. */
export function fieldsFor(rung: CorridorRung): RungField[] {
  switch (rung.input) {
    case 'identifier':
      return [{ key: 'value', label: `${rung.displayName} number`, placeholder: 'As it appears on the record' }];
    case 'identifier_with_jurisdiction': {
      const choices = rung.jurisdictions ?? [];
      return [
        { key: 'value', label: `${rung.displayName} number`, placeholder: 'As it appears on the record' },
        {
          key: 'jurisdiction',
          // "Where" rather than the old "Issued by". The value is matched
          // against a directory of places, and asking for the body invited
          // "Nursing and Midwifery Council" — a perfectly sensible answer that
          // the lookup could never resolve.
          label: 'Where it was issued',
          placeholder: choices.length > 0 ? 'Choose one' : 'Country or state',
          ...(choices.length > 0 ? { choices } : {}),
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * What actually goes on the wire for the jurisdiction.
 *
 * "Other" is a UI affordance, not a place, so it is sent as blank. The server
 * then finds no authority and records the claim as self_attested — which is
 * exactly right for somewhere we cannot check, and better than blocking
 * somebody whose regulator nobody has integrated yet.
 */
export function jurisdictionForSubmission(draft: RungDraft): string | undefined {
  if (draft.jurisdiction === OTHER_JURISDICTION) return draft.jurisdictionOther?.trim() || '';
  return draft.jurisdiction;
}

export function canSubmit(rung: CorridorRung, draft: RungDraft): boolean {
  switch (rung.input) {
    case 'identifier':
      return Boolean(draft.value?.trim());
    case 'identifier_with_jurisdiction':
      if (!draft.value?.trim() || !draft.jurisdiction?.trim()) return false;
      // Picking "Somewhere else" is a question, not an answer — the person
      // still has to say where before this can be submitted.
      return draft.jurisdiction !== OTHER_JURISDICTION || Boolean(draft.jurisdictionOther?.trim());
    case 'document_upload':
      return Boolean(draft.documentName);
    case 'screenshots':
      return filesFor(rung, draft).length > 0;
    case 'oauth':
      return false; // the server drives this one; the button is not a submit
    default:
      return false;
  }
}

export function primaryActionLabel(
  rung: CorridorRung,
  progress?: RungProgress,
  draft?: RungDraft,
): string {
  if (progress?.state === 'needs_attention') return 'Answer the question';
  switch (rung.input) {
    case 'oauth':
      return `Connect ${rung.displayName}`;
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
  return filesFor(rung, draft).length > 0 ? ['upload', 'submit'] : ['submit'];
}

/**
 * Which files this rung hands over, in order.
 *
 * One place, so the screen does not have to know that a document rung carries
 * a single file on one pair of fields and a screenshots rung carries a list on
 * another.
 */
export function filesFor(rung: CorridorRung, draft: RungDraft): PickedFile[] {
  if (rung.input === 'document_upload') {
    return draft.documentName
      ? [{ name: draft.documentName, uri: draft.documentUri, file: draft.documentFile, mimeType: draft.documentMimeType, size: draft.documentSize }]
      : [];
  }
  if (rung.input === 'screenshots') return draft.attachments ?? [];
  return [];
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
  if (state === 'checking' || (state === 'submitted' && runsOnJoin(rung))) {
    return 'Checking this now. You can carry on; we will tell you when it comes back.';
  }
  if (state === 'submitted' && awaitsPractice(rung)) {
    // The honest third state. A verifier exists for this rung and nothing is
    // running, because confirming it against the authority costs money and
    // that is a practice's decision, not ours and not the candidate's. Saying
    // "checking" here would be a lie about the most common state in the app.
    return 'Saved. A practice can have this confirmed when they take you forward.';
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
      return 'Choose a PDF or Word document to continue.';
    case 'screenshots':
      return canSkip(rung) ? 'Choose at least one screenshot, or select Skip for now.' : 'Choose at least one screenshot to continue.';
    default:
      return undefined;
  }
}
