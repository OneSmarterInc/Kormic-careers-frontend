import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { CandidateState, NavigationPoint } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { getPreviousRoute } from './routes';
import { encodeRecovery, pointOf, RECOVERY_KEY, validPoint } from './recovery';

interface BrowserEntry { scope: string; epoch: string; index: number; point: NavigationPoint; history: NavigationPoint[] }
export function useNavigationHistory(state: CandidateState, dispatch: (action: CandidateAction) => void, ready: boolean, scope: string, epoch: string) {
  const latest = useRef(state);
  latest.current = state;
  const traversing = useRef(false);
  const previousEpoch = useRef<string | undefined>(undefined);
  const previousPoint = useRef('');

  useEffect(() => {
    if (!ready || Platform.OS !== 'web') return;
    const onPop = (event: PopStateEvent) => {
      const entry = event.state?.careers as BrowserEntry | undefined;
      if (!entry || entry.scope !== scope || entry.epoch !== epoch || !Array.isArray(entry.history) || !validPoint(entry.point, latest.current)) {
        // Old signed-out history or an invalid location cannot revive a session.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        previousPoint.current = '';
        dispatch({ type: 'RESTORE_LOCATION', point: pointOf(latest.current), history: latest.current.history ?? [] });
        return;
      }
      traversing.current = true;
      dispatch({ type: 'RESTORE_LOCATION', point: entry.point, history: entry.history.filter(p => validPoint(p, latest.current)) });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [ready, scope, epoch, dispatch]);

  useEffect(() => {
    if (!ready || Platform.OS !== 'web') return;
    try { window.sessionStorage.setItem(RECOVERY_KEY, encodeRecovery(state, scope, epoch)); } catch { /* Storage may be disabled. Navigation still works. */ }
    const point = pointOf(state);
    const key = JSON.stringify(point);
    const existing = window.history.state?.careers as BrowserEntry | undefined;
    const reset = previousEpoch.current !== undefined && previousEpoch.current !== epoch;
    if (reset) previousPoint.current = '';
    previousEpoch.current = epoch;
    const owned = !reset && existing?.scope === scope && existing?.epoch === epoch;
    const same = owned && JSON.stringify(existing.point) === key;
    if (!same) {
      const entry: BrowserEntry = { scope, epoch, index: owned && previousPoint.current ? existing.index + 1 : 0, point, history: state.history ?? [] };
      const url = `${window.location.pathname}${window.location.search}#/${encodeURIComponent(state.route)}${state.route === 'Tour' ? `/${state.tourIndex ?? 0}` : ''}`;
      if (owned && previousPoint.current && !traversing.current) window.history.pushState({ careers: entry }, '', url);
      else window.history.replaceState({ careers: entry }, '', url);
    }
    traversing.current = false;
    previousPoint.current = key;
  }, [state, ready, scope, epoch]);

  const back = useCallback(() => {
    if (!getPreviousRoute(latest.current)) return false;
    if (Platform.OS === 'web') {
      const entry = window.history.state?.careers as BrowserEntry | undefined;
      if (entry?.scope === scope && entry.epoch === epoch && entry.index > 0) { window.history.back(); return true; }
    }
    dispatch({ type: 'BACK' });
    return true;
  }, [dispatch, scope, epoch]);
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', back);
    return () => listener.remove();
  }, [back, ready]);
  return back;
}
