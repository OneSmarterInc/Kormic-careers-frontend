import { CorridorRung, VerificationClaim, methodLabels } from '../models/corridor';
import { RungProgress } from '../models/onboarding';

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
