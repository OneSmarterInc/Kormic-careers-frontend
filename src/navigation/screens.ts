import { Route, rungKeyOf } from '../models/onboarding';

/**
 * Which screen a route mounts. Pure, so a test can prove the shell has a screen
 * for every route the corridor can produce rather than discovering a blank at
 * runtime.
 */
export type ScreenKey =
  | 'welcome'
  | 'tour'
  | 'entry'
  | 'joinCode'
  | 'claimCode'
  | 'basicInfo'
  | 'rung'
  | 'building'
  | 'agentLive'
  | 'profile'
  | 'chat';

export function screenFor(route: Route): ScreenKey {
  if (rungKeyOf(route)) return 'rung';
  switch (route) {
    case 'Welcome':
      return 'welcome';
    case 'Tour':
      return 'tour';
    case 'Entry':
      return 'entry';
    case 'JoinCode':
      return 'joinCode';
    case 'ClaimCode':
      return 'claimCode';
    case 'BasicInfo':
      return 'basicInfo';
    case 'BuildingAgent':
      return 'building';
    case 'AgentLive':
      return 'agentLive';
    case 'Profile':
      return 'profile';
    case 'Chat':
      return 'chat';
    default: {
      // Exhaustiveness: a new frame route fails to compile until it is mapped.
      const unreachable: never = route as never;
      return unreachable;
    }
  }
}

/**
 * Screens built so far. The rest render an honest placeholder rather than a
 * blank. Every route the corridor can produce now has one, so the list is the
 * full set of `ScreenKey`s and a test holds it to that.
 */
export const implementedScreens: ScreenKey[] = [
  'welcome',
  'tour',
  'entry',
  'joinCode',
  'claimCode',
  'basicInfo',
  'rung',
  'building',
  'agentLive',
  'profile',
  'chat',
];
