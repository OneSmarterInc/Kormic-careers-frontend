import React from 'react';
import { useNavigationHistory } from '../src/navigation/useNavigationHistory';
import { initialCandidateState } from '../src/models/onboarding';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

describe('browser navigation history', () => {
  let tree: ReturnType<typeof create>;
  const point = { route: 'Tour' as const, tourIndex: 2 };
  const state = { ...initialCandidateState, ...point, history: [{ route: 'Tour' as const, tourIndex: 1 }] };
  const dispatch = jest.fn();
  let back: () => boolean;
  let pop: (event: unknown) => void;
  const history = { state: {} as unknown, back: jest.fn(), pushState: jest.fn(), replaceState: jest.fn() };
  function Harness({ ready, epoch }: { ready: boolean; epoch: string }) {
    back = useNavigationHistory(state, dispatch, ready, 'scope', epoch);
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    history.state = { careers: { scope: 'scope', epoch: 'saved', index: 2, point: { ...point, entryMode: undefined }, history: state.history } };
    Object.assign(window, {
      history, location: { pathname: '/', search: '' },
      sessionStorage: { setItem: jest.fn() },
      addEventListener: jest.fn((_name, listener) => { pop = listener; }),
      removeEventListener: jest.fn(),
    });
  });
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
  it('preserves the browser index when a saved epoch is restored after boot', async () => {
    await act(async () => { tree = create(<Harness ready={false} epoch="new-boot" />); });
    await act(async () => tree.update(<Harness ready epoch="saved" />));
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(history.pushState).not.toHaveBeenCalled();
    back!();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('restores a browser destination without pushing a new visit', async () => {
    await act(async () => { tree = create(<Harness ready epoch="saved" />); });
    pop!({ state: { careers: { scope: 'scope', epoch: 'saved', index: 1, point: { route: 'Tour', tourIndex: 1 }, history: [] } } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTORE_LOCATION', point: { route: 'Tour', tourIndex: 1 }, history: [] });
    expect(history.pushState).not.toHaveBeenCalled();
  });
  it('rejects a browser entry from a signed-out session', async () => {
    await act(async () => { tree = create(<Harness ready epoch="saved" />); });
    pop!({ state: { careers: { scope: 'scope', epoch: 'old-session', point: { route: 'Chat' }, history: [] } } });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(dispatch.mock.calls[0][0].point.route).toBe('Tour');
  });
});
