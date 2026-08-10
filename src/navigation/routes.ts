import { applicableRungs, findRung } from '../models/corridor';
import {
  CandidateState,
  Route,
  isPersonComplete,
  rungKeyOf,
  rungRoute,
} from '../models/onboarding';

/**
 * The ladder. Frame routes top and tail, corridor rungs in the middle.
 * There is no module-level array of steps in this app.
 */
export function orderedRoutes(state: CandidateState): Route[] {
  const head: Route[] =
    state.entryMode === 'claim'
      ? ['Welcome', 'Tour', 'Entry', 'ClaimCode', 'BasicInfo']
      : ['Welcome', 'Tour', 'Entry', 'BasicInfo'];

  const rungs: Route[] = state.corridor
    ? applicableRungs(state.corridor).map((rung) => rungRoute(rung.key))
    : [];

  return [...head, ...rungs, 'BuildingAgent', 'AgentLive'];
}

/** What the progress bar counts: the person's own work, not the frame. */
export function countedRoutes(state: CandidateState): Route[] {
  return orderedRoutes(state).filter(
    (route) => route === 'BasicInfo' || route.startsWith('rung:'),
  );
}

export function getNextRoute(state: CandidateState): Route | undefined {
  const routes = orderedRoutes(state);
  const index = routes.indexOf(state.route);
  return index >= 0 && index < routes.length - 1 ? routes[index + 1] : undefined;
}

export function getPreviousRoute(state: CandidateState): Route | undefined {
  if (state.route === 'Chat') return 'Profile';
  if (state.route === 'Profile') return 'AgentLive';
  const routes = orderedRoutes(state);
  const index = routes.indexOf(state.route);
  return index > 0 ? routes[index - 1] : undefined;
}

export function getProgress(
  state: CandidateState,
): { current: number; total: number; ratio: number } | undefined {
  const counted = countedRoutes(state);
  const index = counted.indexOf(state.route);
  if (index === -1) return undefined;
  const current = index + 1;
  return { current, total: counted.length, ratio: current / counted.length };
}

/**
 * A required rung advances on submitted, not on confirmed. An authority lookup
 * can take days, and holding the person on a screen until it answers would make
 * the ladder unfinishable.
 */
export function canAdvanceFrom(state: CandidateState): boolean {
  const key = rungKeyOf(state.route);
  if (key) {
    const rung = state.corridor ? findRung(state.corridor, key) : undefined;
    if (!rung || rung.requirement === 'not_applicable') return false;
    const progress = state.rungs[key]?.state ?? 'unsubmitted';
    const done =
      progress === 'submitted' || progress === 'checking' || progress === 'confirmed';
    if (rung.requirement === 'required') return done;
    return done || progress === 'skipped';
  }

  switch (state.route) {
    case 'Welcome':
      return true;
    case 'Tour':
      // The tour cannot be shown before the corridor says what it will ask.
      return Boolean(state.corridor);
    case 'Entry':
      // A session object with no access token is not a session. The entry
      // screen used to hand out an empty one so the person could walk on,
      // which read as signed in for the length of the ladder and then failed
      // on the first submission. Nothing mints a session outside the claim
      // flow, so requiring the token is what keeps that path honestly shut.
      return state.entryMode === 'claim'
        ? Boolean(state.claim)
        : Boolean(state.authSession?.access);
    case 'ClaimCode':
      return Boolean(state.claim?.verified);
    case 'BasicInfo':
      return isPersonComplete(state.person) && Boolean(state.corridor);
    case 'BuildingAgent':
      return true;
    default:
      return false;
  }
}

/** Optional rungs the person passed over, surfaced on the profile, never blocking. */
export function skippedRungs(state: CandidateState): string[] {
  if (!state.corridor) return [];
  return applicableRungs(state.corridor)
    .filter((rung) => state.rungs[rung.key]?.state === 'skipped')
    .map((rung) => rung.displayName);
}

/** Rungs the consistency engine flagged. The Navigator asks about these. */
export function rungsNeedingAttention(state: CandidateState): string[] {
  if (!state.corridor) return [];
  return applicableRungs(state.corridor)
    .filter((rung) => state.rungs[rung.key]?.state === 'needs_attention')
    .map((rung) => rung.displayName);
}
