import { pathFor, pointFromUrl } from '../src/navigation/paths';
import { shouldRestoreWebNavigation } from '../src/navigation/recovery';
import { NavigationPoint } from '../src/models/onboarding';
it.each<NavigationPoint>([
  { route: 'Welcome' }, { route: 'Entry', entryMode: 'signup' }, { route: 'Entry', entryMode: 'claim' },
  { route: 'Tour', tourIndex: 2 }, { route: 'BasicInfo' }, { route: 'rung:licence' },
  { route: 'BuildingAgent' }, { route: 'AgentLive' }, { route: 'Profile' }, { route: 'Chat' },
])('round trips a readable URL for $route', point => {
  const path = pathFor(point);
  expect(path).not.toContain('#');
  expect(pointFromUrl(path)).toEqual(point);
});
it('accepts old hash URLs without exposing internal names in new URLs', () => {
  expect(pathFor(pointFromUrl('/', '#/rung%3Alicence')!)).toBe('/credentials/licence');
  expect(pathFor(pointFromUrl('/', '#/Tour/2')!)).toBe('/tour/3');
});
it('rejects malformed paths and distinguishes a root launch from refresh', () => {
  expect(pointFromUrl('/credentials/%bad')).toBeUndefined();
  expect(pointFromUrl('/unknown')).toBeUndefined();
  expect(shouldRestoreWebNavigation('', '/profile')).toBe(true);
  expect(shouldRestoreWebNavigation('', '/')).toBe(false);
});
