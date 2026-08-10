import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Where the session lives. Nothing secret is derived here and nothing is
 * decoded: the client holds two opaque strings and a person id, and every
 * decision about what they permit is the server's.
 *
 * expo-secure-store has no web implementation, so web falls back to
 * localStorage. That is a real downgrade and it is written down rather than
 * hidden: on web the tokens are readable by any script on the origin, which is
 * why the access token is short-lived and the refresh route is the only thing
 * that can mint a new one.
 */

export interface StoredSession {
  access: string;
  refresh: string;
  personId: string;
}

export interface TokenStore {
  read(): Promise<StoredSession | undefined>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'kormic.careers.session';

/** One key holding one JSON blob, so a partial write cannot leave a half session. */
function encode(session: StoredSession): string {
  return JSON.stringify(session);
}

function decode(raw: string | null): StoredSession | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;
    const record = parsed as Record<string, unknown>;
    const access = typeof record.access === 'string' ? record.access : '';
    const refresh = typeof record.refresh === 'string' ? record.refresh : '';
    const personId = typeof record.personId === 'string' ? record.personId : '';
    if (!access || !refresh || !personId) return undefined;
    return { access, refresh, personId };
  } catch {
    // A corrupt blob is treated as no session. The person signs in again,
    // which is better than crashing the shell on start.
    return undefined;
  }
}

function webStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return candidate ?? undefined;
}

export const secureTokenStore: TokenStore = {
  async read() {
    if (Platform.OS === 'web') return decode(webStorage()?.getItem(KEY) ?? null);
    return decode(await SecureStore.getItemAsync(KEY));
  },
  async write(session) {
    const raw = encode(session);
    if (Platform.OS === 'web') {
      webStorage()?.setItem(KEY, raw);
      return;
    }
    await SecureStore.setItemAsync(KEY, raw);
  },
  async clear() {
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  },
};

/** The injection point for tests and for the mock services. */
export function memoryTokenStore(initial?: StoredSession): TokenStore {
  let session = initial;
  return {
    async read() {
      return session;
    },
    async write(next) {
      session = next;
    },
    async clear() {
      session = undefined;
    },
  };
}

export { decode as decodeSession, encode as encodeSession };
