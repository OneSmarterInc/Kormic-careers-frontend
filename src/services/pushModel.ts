import { AppStateStatus } from 'react-native';

/**
 * The push rules that are decisions rather than plumbing, kept away from
 * `push.ts` so they can be tested without importing expo-notifications. Same
 * split as the screens: the part that decides is pure, the part that talks to
 * the platform is not.
 */

/**
 * A reply that arrives while the person is reading the thread has already
 * flipped the bubble in front of them, and a banner on top of that is the app
 * telling them something they just watched happen. Anywhere else, notify.
 */
export function shouldNotify(appState: AppStateStatus, chatVisible: boolean): boolean {
  if (appState !== 'active') return true;
  return !chatVisible;
}
