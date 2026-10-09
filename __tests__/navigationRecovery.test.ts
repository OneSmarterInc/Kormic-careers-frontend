import { candidateReducer } from '../src/state/candidateReducer';
import { CandidateState, initialCandidateState } from '../src/models/onboarding';
import { sampleCorridor } from '../src/services/candidateServices';
import { decodeRecovery, encodeRecovery, pointOf, validPoint } from '../src/navigation/recovery';

const base: CandidateState = { ...initialCandidateState, corridor: sampleCorridor };
describe('visit history and refresh recovery', () => {
  it('returns to each tour page before leaving the tour', () => {
    let state = candidateReducer(base, { type: 'NEXT' });
    state = candidateReducer(state, { type: 'SET_TOUR_INDEX', index: 1 });
    state = candidateReducer(state, { type: 'SET_TOUR_INDEX', index: 2 });
    state = candidateReducer(state, { type: 'BACK' });
    expect([state.route, state.tourIndex]).toEqual(['Tour', 1]);
    state = candidateReducer(state, { type: 'BACK' });
    expect([state.route, state.tourIndex ?? 0]).toEqual(['Tour', 0]);
    expect(candidateReducer(state, { type: 'BACK' }).route).toBe('Welcome');
  });
  it('returns from a profile edit and chat to the actual originating screen', () => {
    const profile = { ...base, route: 'Profile' as const };
    const edit = candidateReducer(profile, { type: 'NAVIGATE', route: 'rung:cv' });
    expect(candidateReducer(edit, { type: 'BACK' }).route).toBe('Profile');
    const handover = { ...base, route: 'AgentLive' as const };
    const chat = candidateReducer(handover, { type: 'NAVIGATE', route: 'Chat' });
    expect(candidateReducer(chat, { type: 'BACK' }).route).toBe('AgentLive');
  });
  it('keeps invitation presentation in visit history', () => {
    const entry = { ...base, route: 'Entry' as const, entryMode: 'signup' as const };
    const claim = candidateReducer(entry, { type: 'SET_ENTRY_VIEW', mode: 'claim' });
    expect(candidateReducer(claim, { type: 'BACK' }).entryMode).toBe('signup');
  });
  it('round trips route and text drafts without copying auth tokens', () => {
    const state = { ...base, route: 'rung:licence' as const, authSession: { access: 'secret-access', refresh: 'secret-refresh', personId: 'p1' }, rungs: { licence: { state: 'unsubmitted' as const, value: 'draft' } } };
    const raw = encodeRecovery(state, 'live', 'epoch', 100);
    expect(raw).not.toContain('secret-access');
    expect(raw).not.toContain('secret-refresh');
    const saved = decodeRecovery(raw, 'live', 101)!;
    expect(saved.state.route).toBe(state.route);
    expect(saved.state.rungs.licence?.value).toBe('draft');
    expect(saved.state.authSession).toBeUndefined();
    expect(validPoint(pointOf(saved.state), { ...saved.state, corridor: sampleCorridor })).toBe(false);
  });
  it('never recovers an interrupted request as a completed submission', () => {
    const submitting = candidateReducer(base, { type: 'SUBMIT_RUNG', key: 'licence', value: 'draft' });
    const saved = decodeRecovery(encodeRecovery(submitting, 's', 'e', 1), 's', 2)!;
    expect(saved.state.rungs.licence?.state).toBe('unsubmitted');
    expect(saved.state.rungs.licence?.value).toBe('draft');
  });
  it('rejects expired, malformed and differently scoped recovery data', () => {
    const raw = encodeRecovery(base, 'mock', 'e', 1);
    expect(decodeRecovery(raw, 'live', 2)).toBeUndefined();
    expect(decodeRecovery(raw, 'mock', 13 * 60 * 60 * 1000)).toBeUndefined();
    expect(decodeRecovery('{', 'mock')).toBeUndefined();
  });
  it('validates code prerequisites, removed rungs and logout access', () => {
    expect(validPoint({ route: 'ClaimCode' }, base)).toBe(false);
    expect(validPoint({ route: 'JoinCode' }, base)).toBe(false);
    expect(validPoint({ route: 'rung:removed' }, { ...base, authSession: {} })).toBe(false);
    expect(validPoint({ route: 'Chat' }, candidateReducer({ ...base, authSession: {} }, { type: 'LOGOUT' }))).toBe(false);
  });
});
