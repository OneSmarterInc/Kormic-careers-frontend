import { applicableRungs, findRung } from '../models/corridor';
import {
  CandidateState,
  PersonSnapshot,
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
      : ['Welcome', 'Tour', 'Entry', 'JoinCode', 'BasicInfo'];

  const rungs: Route[] = state.corridor
    ? applicableRungs(state.corridor).map((rung) => rungRoute(rung.key))
    : [];

  return [...head, ...rungs, 'BuildingAgent', 'AgentLive'];
}

/** Fresh launches show Welcome unless an existing session opens Profile. */
export function openingRoute(device: { signedIn: boolean; seenIntro: boolean }): Route {
  return device.signedIn ? 'Profile' : 'Welcome';
}

/**
 * Where a person goes once the code has checked out.
 *
 * The same door signs in and signs up — the code cannot tell us which just
 * happened, so we look at what came back. Somebody whose details are already
 * on file has been here before and wants their profile, not a form asking for
 * a name we already know.
 *
 * "Already on file" is the person's own details rather than their claims. A
 * person who filled the form and stopped before a single rung is still a
 * returning person, and the profile tells them what is outstanding.
 */
export function routeAfterSignIn(snapshot: PersonSnapshot | undefined): Route {
  if (snapshot && isPersonComplete(snapshot.person)) return 'Profile';
  return 'BasicInfo';
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
  if (state.history?.length) return state.history[state.history.length - 1]?.route;
  if (state.route === 'Chat') return 'Profile';
  // Profile is home. Back used to lead to the handover screen, which is a
  // one-time moment in signing up — sending a person who opened the app this
  // morning back to "Meet your Navigator" is not a back button, it is a
  // detour into somebody else's first day.
  if (state.route === 'Profile') return undefined;
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
      // A session object with no access token is not a session, and the entry
      // screen must never hand out an empty one: that reads as signed in for
      // the length of the ladder and then fails on the first submission.
      // Neither path mints a session here. Both leave with an address and a
      // code on its way, and the session arrives one screen later.
      return state.entryMode === 'claim'
        ? Boolean(state.claim)
        : Boolean(state.signup?.codeSent);
    case 'JoinCode':
      return Boolean(state.authSession?.access);
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
