import { NavigationPoint, Route } from '../models/onboarding';
const paths: Partial<Record<Route, string>> = {
  Welcome: '/welcome', JoinCode: '/verify-email', ClaimCode: '/verify-invitation',
  BasicInfo: '/personal-details', BuildingAgent: '/profile-setup',
  AgentLive: '/meet-your-navigator', Profile: '/profile', Chat: '/navigator/chat',
};
export function pathFor(point: NavigationPoint): string {
  if (point.route === 'Entry') return point.entryMode === 'claim' ? '/invitation' : '/sign-in';
  if (point.route === 'Tour') return `/tour/${(point.tourIndex ?? 0) + 1}`;
  if (point.route.startsWith('rung:')) return `/credentials/${encodeURIComponent(point.route.slice(5))}`;
  return paths[point.route] ?? '/welcome';
}
export function pointFromUrl(pathname: string, hash = ''): NavigationPoint | undefined {
  try {
    if (hash.startsWith('#/')) {
      const [route, index] = hash.slice(2).split('/').map(decodeURIComponent);
      if (!route) return;
      if (route === 'Entry') return { route };
      if (route === 'Tour' && /^\d+$/.test(index ?? '0')) return { route, tourIndex: Number(index ?? 0) };
      if (route in paths || route.startsWith('rung:')) return { route: route as Route };
      return pointFromUrl(hash.slice(1));
    }
    const path = pathname.replace(/\/$/, '') || '/';
    if (path === '/sign-in' || path === '/invitation') return { route: 'Entry', entryMode: path === '/invitation' ? 'claim' : 'signup' };
    const tour = /^\/tour\/([1-9]\d*)$/.exec(path);
    if (tour) return { route: 'Tour', tourIndex: Number(tour[1]) - 1 };
    const rung = /^\/credentials\/([^/]+)$/.exec(path);
    if (rung) return { route: `rung:${decodeURIComponent(rung[1]!)}` };
    const route = Object.entries(paths).find(([, value]) => value === path)?.[0] as Route | undefined;
    return route ? { route } : undefined;
  } catch { return undefined; }
}
