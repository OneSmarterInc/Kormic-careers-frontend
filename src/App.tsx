import { pointFromUrl } from './navigation/paths';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { decodeRecovery, pointOf, RECOVERY_KEY, shouldRestoreWebNavigation, validPoint } from './navigation/recovery';
import { useNavigationHistory } from './navigation/useNavigationHistory';
import { ApiError } from './services/api';
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
import { colors, layout, screenWidth, pointer, radii, spacing, type } from './theme/tokens';

interface Props {
  services?: CandidateServices;
  corridorKey?: string;
  /** Supplied by the service boundary in index.js. See ResolvedServices. */
  navigationScope?: string;
  registerSessionLost?: (handler: () => void) => void;
}

export default function App({
  services = mockCandidateServices,
  corridorKey = 'sample',
  registerSessionLost,
  navigationScope = `careers:${corridorKey}:${services === mockCandidateServices ? 'mock' : 'live'}`,
}: Props) {
  const viewport = useWindowDimensions();
  const [state, rawDispatch] = useReducer(candidateReducer, initialCandidateState);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(true);

  const [bootAttempt, setBootAttempt] = useState(0);
  const [restoreError, setRestoreError] = useState(false);
  const [epoch, setEpoch] = useState(() => `${Date.now()}-${Math.random()}`);
  const navigationBack = useRef<() => boolean>(() => false);
  const dispatch = useCallback((action: Parameters<typeof rawDispatch>[0]) => {
    if (action.type === 'BACK' && Platform.OS === 'web') { navigationBack.current(); return; }
    if (action.type === 'LOGOUT') {
      setEpoch(`${Date.now()}-${Math.random()}`);
      if (Platform.OS === 'web') { try { window.sessionStorage.removeItem(RECOVERY_KEY); } catch { /* unavailable */ } }
    }
    rawDispatch(action);
  }, []);
  const back = useNavigationHistory(state, rawDispatch, !restoring && !loading && !restoreError, navigationScope, epoch);
  navigationBack.current = back;

  useEffect(() => {
    let cancelled = false;
    setRestoring(true);
    setRestoreError(false);
    async function restore() {
      let saved;
      if (Platform.OS === 'web' && shouldRestoreWebNavigation(window.location.hash, window.location.pathname)) {
        try { saved = decodeRecovery(window.sessionStorage.getItem(RECOVERY_KEY), navigationScope); } catch { /* unavailable */ }
      }
      let snapshot;
      try { snapshot = await services.person.load(undefined); }
      catch (error) {
        // Keep the screen recoverable on a temporary outage; never mistake it for sign-out.
        if (saved?.signedIn && services !== mockCandidateServices && !(error instanceof ApiError && error.code === 'unauthorised')) {
          if (!cancelled) { setRestoreError(true); setRestoring(false); }
          return;
        }
      }
      const seenIntro = await deviceMemory.hasSeenIntro();
      if (cancelled) return;
      const samePerson = !snapshot || !saved?.personId || saved.personId === snapshot.person.personId;
      const canRecover = saved && samePerson && (!saved.signedIn || snapshot || services === mockCandidateServices);
      let next = { ...initialCandidateState, route: openingRoute({ signedIn: Boolean(snapshot), seenIntro }),
        ...(snapshot ? { person: snapshot.person, claims: snapshot.claims, agentName: snapshot.agentName, authSession: { personId: snapshot.person.personId } } : {}) };
      if (canRecover && saved) {
        next = { ...next, ...saved.state, authSession: snapshot ? { personId: snapshot.person.personId } : saved.signedIn && services === mockCandidateServices ? { personId: saved.personId } : undefined,
          claims: snapshot?.claims ?? saved.state.claims };
        if (Platform.OS === 'web') {
          // History traversal may reload a document instead of emitting popstate.
          // Its location wins over the last draft's location, but never its data.
          const entry = window.history.state?.careers;
          if (entry?.scope === navigationScope && entry.epoch === saved.epoch && entry.point && typeof entry.point.route === 'string' && Array.isArray(entry.history)) {
            next = { ...next, ...entry.point, history: entry.history };
          }
        }
        setEpoch(saved.epoch);
      }
      if (Platform.OS === 'web') {
        const requested = pointFromUrl(window.location.pathname, window.location.hash);
        if (requested) next = { ...next, ...requested };
      }
      // Corridor loads independently. Validate rung destinations only after it arrives.
      rawDispatch({ type: 'RESTORE', state: next });
      setRestoring(false);
    }
    void restore();
    return () => { cancelled = true; };
  }, [services, navigationScope, bootAttempt]);

  // Reaching entry remembers the introduction for later visits. Explicit
  // sign-out clears this flag so reopening the site returns to Welcome.
  useEffect(() => {
    if (state.route === 'Entry') void deviceMemory.rememberIntroSeen();
  }, [state.route]);

  // A refresh that failed means the session is gone. The shell decides what
  // that looks like; the API client only reports it.
  useEffect(() => {
    // The token is already cleared by the client at this point, so this only
    // has to reset what the screens are looking at.
    registerSessionLost?.(() => dispatch({ type: 'LOGOUT' }));
  }, [registerSessionLost, dispatch]);

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
      // Reopening the site after explicit sign-out should also show Welcome.
      await deviceMemory.forget();
      dispatch({ type: 'LOGOUT' });
    }
  }, [services, state.authSession, dispatch]);

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
  }, [services, state.authSession, dispatch]);

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
  }, [services, corridorKey, dispatch]);

  useEffect(() => {
    if (restoring || loading || !state.corridor || restoreError) return;
    if (!validPoint(pointOf(state), state)) {
      rawDispatch({ type: 'RESTORE_LOCATION', point: { route: state.authSession ? 'Profile' : 'Welcome', entryMode: state.entryMode }, history: [] });
    }
  }, [restoring, loading, state, restoreError]);

  const progress = getProgress(state);
  const previous = getPreviousRoute(state);
  const screen = screenFor(state.route);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {/* Header and content share the same responsive viewport gutters. */}
      <View style={[styles.chrome, { paddingHorizontal: viewport.width < 600 ? spacing.md : layout.gutter }]}>
        <View style={[styles.chromeColumn, { maxWidth: screenWidth(state.route) }]}>
          <Text style={styles.brand}>Kormic <Text style={type.caption}>Careers</Text></Text>
          {previous || progress ? <View style={styles.header}>
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
          </View> : null}

          {progress ? (
            <View style={styles.track} accessibilityRole="progressbar">
              <View style={[styles.fill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        {restoreError ? (
          <View style={styles.centred}>
            <Text style={type.body}>We could not restore your session. Your saved step is still available; retry when connected.</Text>
            <Pressable accessibilityRole="button" onPress={() => setBootAttempt(n => n + 1)}><Text style={styles.back}>Retry session</Text></Pressable>
          </View>
        ) : loading || restoring || !fontsLoaded ? (
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
  chrome: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs, paddingHorizontal: layout.gutter },
  chromeColumn: { width: '100%' },
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
  body: { flex: 1, minHeight: 0 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
});
