import { CandidateState } from '../models/onboarding';
import { ProfileRow } from './profileModel';

/**
 * The two screens that close the ladder: the build, and the handover to the
 * Navigator. Both are pure here and rendered elsewhere, the same split the rest
 * of the app uses.
 */

// --- building -------------------------------------------------------------

export interface BuildProgress {
  stage: string;
  current: number;
  total: number;
  done: boolean;
}

/**
 * The stages come from the service, not from this file, so what the person
 * reads while they wait is not copy written against one corridor.
 */
export function buildProgress(stages: string[], index: number): BuildProgress {
  const total = stages.length;
  const clamped = Math.max(0, Math.min(index, total));
  return {
    stage: stages[Math.min(clamped, total - 1)] ?? '',
    current: Math.min(clamped + 1, total),
    total,
    done: total === 0 || clamped >= total,
  };
}

/**
 * What the build is allowed to say it did. It read what the person gave us; it
 * did not confirm any of it, and the wording may not drift into implying it
 * did. `methodLabels` remains the only vocabulary for what was checked.
 */
export function buildSummaryLine(rows: ProfileRow[]): string {
  const provided = rows.filter((row) => Boolean(row.claim)).length;
  if (provided === 0) return 'Nothing to put together yet.';
  return provided === 1
    ? 'One thing you gave us, ready for a practice to read.'
    : `${provided} things you gave us, ready for a practice to read.`;
}

// --- the Navigator --------------------------------------------------------

export const MAX_NAVIGATOR_NAME = 24;
export const DEFAULT_NAVIGATOR_NAME = 'Navigator';

/**
 * Renaming is the ownership cue: the person's agent answers to whatever they
 * call it. Length is bounded because the name appears inline in sentences.
 */
export function isNavigatorNameWellFormed(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAVIGATOR_NAME;
}

export function navigatorName(custom: string | undefined): string {
  const trimmed = custom?.trim();
  return trimmed && isNavigatorNameWellFormed(trimmed) ? trimmed : DEFAULT_NAVIGATOR_NAME;
}

/**
 * What the handover screen says is outstanding. Skipped and unprovided rungs
 * are named so the person knows what a practice will not see, and none of it
 * blocks: the profile is usable with every one of these open.
 */
export function handoverLines(state: CandidateState, rows: ProfileRow[]): string[] {
  const lines: string[] = [];
  const checking = rows.filter(
    (row) => row.rungState === 'checking' || row.rungState === 'submitted',
  );
  if (checking.length > 0) {
    lines.push(
      checking.length === 1
        ? `We are still checking ${checking[0]?.displayName}. It will update itself.`
        : `We are still checking ${checking.length} things. They will update themselves.`,
    );
  }

  const missing = rows.filter((row) => row.requirement === 'required' && !row.claim);
  if (missing.length > 0) {
    lines.push(`Still needed: ${missing.map((row) => row.displayName).join(', ')}.`);
  }

  const skipped = rows.filter((row) => row.rungState === 'skipped');
  if (skipped.length > 0) {
    lines.push(`You skipped ${skipped.map((row) => row.displayName).join(', ')}. Add them any time.`);
  }

  if (state.corridorError) lines.push(state.corridorError);
  return lines;
}
