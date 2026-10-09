import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * What this device remembers about itself, as opposed to about the person.
 *
 * Only one thing so far: whether the introduction has been seen. It is
 * deliberately kept apart from the session, because the two answer different
 * questions and have different lifetimes — signing out ends a session, and it
 * does not make somebody a first-time visitor again.
 *
 * Nothing here is secret. Explicit sign-out calls forget() so a fresh visit
 * returns to Welcome; ordinary session restoration keeps this preference.
 */

export interface DeviceMemory {
  hasSeenIntro(): Promise<boolean>;
  rememberIntroSeen(): Promise<void>;
  forget(): Promise<void>;
}

const KEY = 'kormic.careers.seenIntro';

function webStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage ?? undefined;
}

export const deviceMemory: DeviceMemory = {
  async hasSeenIntro() {
    try {
      const raw =
        Platform.OS === 'web'
          ? webStorage()?.getItem(KEY) ?? null
          : await SecureStore.getItemAsync(KEY);
      return raw === '1';
    } catch {
      // A device that cannot tell us is treated as new. Showing the tour twice
      // is a small cost; hiding it from somebody who has never seen it is not.
      return false;
    }
  },

  async rememberIntroSeen() {
    try {
      if (Platform.OS === 'web') {
        webStorage()?.setItem(KEY, '1');
        return;
      }
      await SecureStore.setItemAsync(KEY, '1');
    } catch {
      /* not worth failing anything for */
    }
  },

  async forget() {
    try {
      if (Platform.OS === 'web') {
        webStorage()?.removeItem(KEY);
        return;
      }
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* ditto */
    }
  },
};

/** In-memory stand-in for tests and for the mock services. */
export function memoryDeviceMemory(seen = false): DeviceMemory {
  let value = seen;
  return {
    async hasSeenIntro() {
      return value;
    },
    async rememberIntroSeen() {
      value = true;
    },
    async forget() {
      value = false;
    },
  };
}
