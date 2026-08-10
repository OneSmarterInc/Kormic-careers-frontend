import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { initialCandidateState } from './models/onboarding';
import { canAdvanceFrom, getPreviousRoute, getProgress } from './navigation/routes';
import { implementedScreens, screenFor } from './navigation/screens';
import { CandidateServices, mockCandidateServices } from './services/candidateServices';
import { installNotificationHandler } from './services/push';
import { RungScreen } from './screens/RungScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ChatScreen } from './screens/ChatScreen';
import { TourScreen } from './screens/TourScreen';
import { AgentLiveScreen, BuildingAgentScreen } from './screens/AgentScreens';
import { BasicInfoScreen, ClaimCodeScreen, EntryScreen, WelcomeScreen } from './screens/EntryScreens';
import { candidateReducer } from './state/candidateReducer';
import { colors, radii, spacing, type } from './theme/tokens';

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

  // A refresh that failed means the session is gone. The shell decides what
  // that looks like; the API client only reports it.
  useEffect(() => {
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
    Inter_400Regular,
    Inter_600SemiBold,
  });

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
      <View style={styles.header}>
        {previous ? (
          <Pressable onPress={() => dispatch({ type: 'BACK' })} accessibilityRole="button">
            <Text style={styles.back}>Back</Text>
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

      <View style={styles.body}>
        {loading || !fontsLoaded ? (
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
          <RungScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'profile' ? (
          <ProfileScreen state={state} dispatch={dispatch} />
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
        ) : screen === 'claimCode' ? (
          <ClaimCodeScreen state={state} dispatch={dispatch} services={services} />
        ) : screen === 'basicInfo' ? (
          <BasicInfoScreen state={state} dispatch={dispatch} />
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
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.coral },
  disabled: { color: colors.muted },
  track: {
    height: 3,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: { height: 3, backgroundColor: colors.coral },
  body: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
