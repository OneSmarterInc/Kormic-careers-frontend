import Constants from 'expo-constants';

/**
 * Configuration, read once from `expo.extra`. The API host is never a literal
 * inside a service, so pointing a build at staging is a config change rather
 * than a code change.
 */

export interface AppConfig {
  apiHost: string;
  corridorKey: string;
  /**
   * Whether to run against `mockCandidateServices`. It is on in the checked-in
   * app.json so a clean clone starts without a backend, which is the first
   * thing the brief asks a new developer to do. Turning it off is the whole
   * switch to the real API; there is no other flag.
   */
  useMocks: boolean;
  /**
   * Where a provider sends the browser back to. Derived from the app's own
   * scheme so it cannot drift from app.json, and never a literal in a service.
   */
  oauthRedirect: string;
}

export const FALLBACK_CORRIDOR_KEY = 'sample';
export const FALLBACK_SCHEME = 'kormiccareers';

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pure, so the rules can be tested without a bundled app.json.
 *
 * A missing host throws rather than defaulting. A build that reaches the
 * network with no host configured would otherwise issue requests against
 * `undefined/api/...` and fail one screen later with a parse error, which is
 * the same class of deferred failure the contract adapters exist to stop.
 */
export function readConfig(extra: unknown, scheme?: string): AppConfig {
  const record: Record<string, unknown> =
    extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : {};

  const useMocks = record.useMocks === true;
  const host = text(record, 'apiHost').replace(/\/+$/, '');
  if (!host && !useMocks) {
    throw new Error('Configuration error: expo.extra.apiHost is missing');
  }

  return {
    apiHost: host,
    corridorKey: text(record, 'corridorKey') || FALLBACK_CORRIDOR_KEY,
    useMocks,
    oauthRedirect: `${scheme?.trim() || FALLBACK_SCHEME}://oauth`,
  };
}

export function appConfig(): AppConfig {
  const scheme = Constants.expoConfig?.scheme;
  return readConfig(
    Constants.expoConfig?.extra,
    typeof scheme === 'string' ? scheme : undefined,
  );
}
