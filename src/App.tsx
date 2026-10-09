import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { initialCandidateState } from './models/onboarding';
import { canAdvanceFrom, getPreviousRoute, getProgress, openingRoute } from './navigation/routes';
import { implementedScreens, screenFor } from './navigation/screens';
import { CandidateServices, mockCandidateServices } from './services/candidateServices';
import { installNotificationHandler } from './services/push';
import { deviceMemory } from './services/deviceMemory';
import { RungScreen } from './screens/RungScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ChatScreen } from './screens/ChatScreen';
import { TourScreen } from './screens/TourScreen';
import { AgentLiveScreen, BuildingAgentScreen } from './screens/AgentScreens';
import {
  BasicInfoScreen,
  ClaimCodeScreen,
  EntryScreen,
  JoinCodeScreen,
  WelcomeScreen,
} from './screens/EntryScreens';
import { candidateReducer } from './state/candidateReducer';
import { colors, layout, pointer, radii, spacing, type } from './theme/tokens';

interface Props {
  services?: CandidateServices;
  corridorKey?: string;
  /** Supplied by the service boundary in index.js. See ResolvedServices. */
  registerSessionLost?: (handler: () => void) => void;
}

export default function App({
  services = mockCandidateServices,
  corridorKey = 'sample',
  registerSessionLost,
}: Props) {
  const [state, dispatch] = useReducer(candidateReducer, initialCandidateState);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(true);

  /**
   * A returning person lands on their profile, not on the welcome screen.
   *
   * The token has always been in storage; nothing read it, so somebody who
   * closed the tab came back to an empty ladder while their claims sat in the
   * database with no way to ask for them. This asks.
   *
   * A failure here is the ordinary case, not an error: it means nobody is
   * signed in, and the app starts where it always did.
   */
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      services.person.load(undefined).catch(() => undefined),
      deviceMemory.hasSeenIntro(),
    ])
      .then(([snapshot, seenIntro]) => {
        if (cancelled) return;
        if (snapshot) {
          dispatch({ type: 'HYDRATE', snapshot });
          dispatch({ type: 'SET_AUTH_SESSION', session: { personId: snapshot.person.personId } });
        }
        dispatch({
          type: 'NAVIGATE',
          route: openingRoute({ signedIn: Boolean(snapshot), seenIntro }),
        });
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [services]);

  // Reaching the door means the introduction has been given. Remembered on the
  // device rather than in the session, so signing out does not make somebody a
  // first-time visitor again.
  useEffect(() => {
    if (state.route === 'Entry') void deviceMemory.rememberIntroSeen();
  }, [state.route]);

  // A refresh that failed means the session is gone. The shell decides what
  // that looks like; the API client only reports it.
  useEffect(() => {
    // The token is already cleared by the client at this point, so this only
    // has to reset what the screens are looking at.
    registerSessionLost?.(() => dispatch({ type: 'LOGOUT' }));
  }, [registerSessionLost]);

  /**
   * Fraunces and Inter, declared in the theme and until now never loaded, so
   * every `fontFamily` in the app silently fell back to a system face. The
   * shell waits for them rather than rendering once in the wrong type and
   * again in the right one.
   */
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  /**
   * Signing out clears the stored token before it clears state.
   *
   * LOGOUT only ever reset the reducer, which was harmless while nothing read
   * storage at boot. Now that a session is restored on start, resetting state
   * alone would have signed the person straight back in on the next reload.
   */
  const handleSignOut = useCallback(async () => {
    try {
      await services.session.signOut(state.authSession);
    } finally {
      dispatch({ type: 'LOGOUT' });
    }
  }, [services, state.authSession]);

  // Held in a ref, not state: the push handler is installed once and outlives
  // any render, so it needs a getter rather than a captured value.
  const chatVisible = useRef(false);
  const onChatVisibilityChange = useCallback((visible: boolean) => {
    chatVisible.current = visible;
  }, []);

  useEffect(() => {
    installNotificationHandler(() => chatVisible.current);
  }, []);

  // Registered once there is a session to register against. Failure is silent
  // by design: the escalation poll in ChatScreen is the guarantee, push is the
  // addition for when the app is not in front.
  useEffect(() => {
    if (!state.authSession) return;
    void services.notifications.register(state.authSession);
  }, [services, state.authSession]);

  // The ladder does not exist until the corridor answers. Nothing renders a
  // step before then, because there are no steps yet.
  useEffect(() => {
    let cancelled = false;
    services.corridor
      .load(corridorKey)
      .then((corridor) => {
        if (!cancelled) dispatch({ type: 'SET_CORRIDOR', corridor });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'SET_CORRIDOR_ERROR', message: 'We could not load your steps.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services, corridorKey]);

  const progress = getProgress(state);
  const previous = getPreviousRoute(state);
  const screen = screenFor(state.route);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {/* The chrome is bounded to the same column as the content, so a wide
          window does not leave Back adrift in the top corner. */}
      <View style={styles.chrome}>
        <View style={styles.chromeColumn}>
          <Text style={styles.brand}>Kormic <Text style={type.caption}>Careers</Text></Text>
          <View style={styles.header}>
            {previous ? (
              <Pressable
                onPress={() => dispatch({ type: 'BACK' })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.backHit, pointer, pressed && styles.backPressed]}
              >
                <Text style={styles.back}>← Back</Text>
              </Pressable>
            ) : (
              <View />
            )}
            {progress ? (
              <Text style={type.caption}>
                Step {progress.current} of {progress.total}
              </Text>
            ) : null}
          </View>

          {progress ? (
            <View style={styles.track} accessibilityRole="progressbar">
              <View style={[styles.fill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        {loading || restoring || !fontsLoaded ? (
          <ActivityIndicator color={colors.coral} />
        ) : state.corridorError ? (
          <View style={styles.centred}>
            <Text style={type.body}>{state.corridorError}</Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                services.corridor
                  .load(corridorKey)
                  .then((corridor) => dispatch({ type: 'SET_CORRIDOR', corridor }))
                  .catch(() => dispatch({ type: 'SET_CORRIDOR_ERROR', message: 'We could not load your steps.' }))
                  .finally(() => setLoading(false));
              }}
              accessibilityRole="button"
            >
              <Text style={styles.back}>Try again</Text>
            </Pressable>
          </View>
        ) : screen === 'rung' ? (
          // Keyed by route. Every rung renders the same component, so without
          // this React keeps the instance across the route change and the
          // draft written on one rung is submitted as the next one's answer.
          <RungScreen key={state.route} state={state} dispatch={dispatch} services={services} />
        ) : screen === 'profile' ? (
          <ProfileScreen
            state={state}
            dispatch={dispatch}
            services={services}
            onSignOut={handleSignOut}
          />
        ) : screen === 'chat' ? (
          <ChatScreen
            state={state}
            services={services}
            onVisibilityChange={onChatVisibilityChange}
          />
        ) : screen === 'building' ? (
          <BuildingAgentScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'agentLive' ? (
          <AgentLiveScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'tour' ? (
          <TourScreen state={state} dispatch={dispatch} />
        ) : screen === 'welcome' ? (
          <WelcomeScreen state={state} dispatch={dispatch} />
        ) : screen === 'entry' ? (
          <EntryScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'joinCode' ? (
          <JoinCodeScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'claimCode' ? (
          <ClaimCodeScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'basicInfo' ? (
          <BasicInfoScreen state={state} dispatch={dispatch} services={services} />
        ) : (
          <View style={styles.centred}>
            <Text style={type.title}>{state.route}</Text>
            <Text style={type.caption}>
              {implementedScreens.includes(screen) ? 'Loading' : 'Not built yet.'}
            </Text>
            <Pressable
              onPress={() => dispatch({ type: 'NEXT' })}
              disabled={!canAdvanceFrom(state)}
              accessibilityRole="button"
            >
              <Text style={[styles.back, !canAdvanceFrom(state) && styles.disabled]}>Continue</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { ...type.bodyStrong, fontSize: 21, marginBottom: spacing.sm },
  root: { flex: 1, backgroundColor: colors.ink },
  chrome: { alignItems: 'center', paddingHorizontal: layout.gutter },
  chromeColumn: { width: '100%', maxWidth: layout.maxWidth },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  backHit: { paddingVertical: spacing.xs, paddingRight: spacing.md, marginLeft: -spacing.xxs },
  backPressed: { opacity: 0.6 },
  back: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.coral },
  disabled: { color: colors.muted },
  track: {
    height: 4,
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: { height: 4, backgroundColor: colors.coral, borderRadius: radii.pill },
  body: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
});
