import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { ApiClient } from './api';
import { NotificationService } from './candidateServices';
import { endpoints } from './contract';
import { shouldNotify } from './pushModel';

/**
 * Push exists here for one job: delivering an escalation answer that lands
 * while the app is closed. Everything else the person is already looking at.
 *
 * The polling fallback is not in this file. `ChatScreen` polls the escalation
 * route while it is open, so a device that refused the permission, or one whose
 * token registration failed, still sees a pending bubble flip. Push is the
 * addition for when the app is not in front, never the only path.
 */

/**
 * Registers the handler that consults the gate. `isChatVisible` is a getter
 * rather than a value because the handler outlives any one render.
 */
export function installNotificationHandler(isChatVisible: () => boolean): void {
  try {
    Notifications.setNotificationHandler({
      async handleNotification() {
        const show = shouldNotify(AppState.currentState, isChatVisible());
        return {
          shouldShowBanner: show,
          shouldShowList: show,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });
  } catch {
    // Web has no notification presentation to configure, and Expo Go on Android
    // dropped remote notifications in SDK 53. Neither is a reason for the shell
    // to fail to mount, because the escalation poll covers both.
  }
}

/**
 * EAS injects the project id at build time. Without it `getExpoPushTokenAsync`
 * cannot name a project, so registration is skipped rather than throwing on a
 * bare `expo start`.
 */
function projectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const eas = (extra.eas ?? {}) as Record<string, unknown>;
  const id = eas.projectId;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * A simulator has no push service and `getExpoPushTokenAsync` throws there.
 * That throw is the device check: the caller already treats a failed
 * registration as "no push, poll only", so there is nothing to detect first.
 */
async function acquireToken(): Promise<string | undefined> {
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return undefined;

  const id = projectId();
  if (!id) return undefined;

  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return token.data;
}

export function createNotificationService(api: ApiClient): NotificationService {
  return {
    async register(session) {
      if (!session?.access) return;
      try {
        const token = await acquireToken();
        if (!token) return;

        // Android needs a channel before anything is delivered to it.
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('escalations', {
            name: 'Answers from the practice',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        await api.send({
          path: endpoints.pushRegister,
          method: 'POST',
          body: { expo_push_token: token, platform: Platform.OS },
        });
      } catch {
        // Registration is an enhancement. The in-app poll is the guarantee, so
        // a failure here never blocks the ladder or shows the person an error.
      }
    },

    async unregister(session) {
      if (!session?.access) return;
      try {
        await api.send({ path: endpoints.pushRegister, method: 'DELETE' });
      } catch {
        /* best effort */
      }
    },
  };
}
