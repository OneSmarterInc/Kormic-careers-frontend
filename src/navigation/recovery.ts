import { CandidateState, NavigationPoint, Route, initialCandidateState } from '../models/onboarding';
import { applicableRungs } from '../models/corridor';

export const RECOVERY_KEY = 'kormic.careers.navigation.v1';
/** A bare site address starts a fresh visit; a screen URL can recover on refresh. */
export function shouldRestoreWebNavigation(hash: string): boolean {
  return hash.startsWith('#/') && hash.length > 2;
}
const TTL = 12 * 60 * 60 * 1000;
const frames: Route[] = ['Welcome', 'Tour', 'Entry', 'JoinCode', 'ClaimCode', 'BasicInfo', 'BuildingAgent', 'AgentLive', 'Profile', 'Chat'];
export interface Recovery { version: 1; scope: string; epoch: string; at: number; state: CandidateState; signedIn: boolean; personId?: string }
export function pointOf(state: CandidateState): NavigationPoint {
  return { route: state.route, entryMode: state.entryMode, tourIndex: state.tourIndex ?? 0 };
}
export function validPoint(point: NavigationPoint, state: CandidateState): boolean {
  if (!point || typeof point.route !== 'string') return false;
  if (!frames.includes(point.route) && !applicableRungs(state.corridor ?? { key: '', displayName: '', rungs: [] }).some(r => `rung:${r.key}` === point.route)) return false;
  if (point.tourIndex !== undefined && (!Number.isInteger(point.tourIndex) || point.tourIndex < 0 || point.tourIndex > 4)) return false;
  if (point.entryMode !== undefined && !['signup', 'claim'].includes(point.entryMode)) return false;
  if (['Welcome', 'Tour', 'Entry'].includes(point.route)) return true;
  if (point.route === 'JoinCode') return Boolean(state.signup?.codeSent);
  if (point.route === 'ClaimCode') return Boolean(state.claim?.token);
  if (point.route === 'BasicInfo') return Boolean(state.authSession || state.claim?.verified);
  return Boolean(state.authSession);
}
export function encodeRecovery(state: CandidateState, scope: string, epoch: string, now = Date.now()): string {
  // Tab-scoped drafts only. Access/refresh tokens remain in the existing token store.
  const { authSession, corridor, corridorError, ...draft } = state;
  const rungs = Object.fromEntries(Object.entries(draft.rungs).map(([key, rung]) => [key,
    rung.pending ? { ...rung, state: 'unsubmitted', pending: false } : rung,
  ]));
  return JSON.stringify({ version: 1, scope, epoch, at: now, signedIn: Boolean(authSession), personId: authSession?.personId,
    state: { ...draft, rungs } });
}
export function decodeRecovery(raw: string | null, scope: string, now = Date.now()): Recovery | undefined {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.version !== 1 || value.scope !== scope || typeof value.epoch !== 'string' || typeof value.at !== 'number' || now - value.at > TTL || value.at > now) return;
    const s = value.state;
    if (!s || !s.person || !['fullName', 'email', 'phone', 'city', 'region', 'country'].every(k => typeof s.person[k] === 'string') || !s.rungs || typeof s.rungs !== 'object' || Array.isArray(s.rungs) || !Array.isArray(s.claims)) return;
    if (s.history !== undefined && (!Array.isArray(s.history) || s.history.length > 100 || !s.history.every((point: NavigationPoint) => point && typeof point.route === 'string'))) return;
    if (!Object.values(s.rungs).every(rung => rung && typeof rung === 'object')) return;
    if (typeof s.route !== 'string' || (!frames.includes(s.route) && !s.route.startsWith('rung:'))) return;
    return { ...value, state: { ...initialCandidateState, ...s, authSession: undefined, corridor: undefined, corridorError: undefined } };
  } catch { return undefined; }
}
