import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CandidateState } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { CandidateServices } from '../services/candidateServices';
import { colors, radii, spacing, type } from '../theme/tokens';
import { buildProfileRows } from './profileModel';
import {
  MAX_NAVIGATOR_NAME,
  buildProgress,
  buildSummaryLine,
  handoverLines,
  isNavigatorNameWellFormed,
  navigatorName,
} from './agentModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
  services: CandidateServices;
}

/**
 * The build. It reads what the person gave us and says so; it does not claim to
 * have confirmed any of it, because at this point nothing has come back from a
 * verifier and several rungs may never be checked at all.
 */
export function BuildingAgentScreen({ state, dispatch, services, stageMs = 900 }: Props & { stageMs?: number }) {
  const stages = services.buildAgent.stages;
  const progress = buildProgress(stages, state.buildStage);
  const rows = useMemo(() => buildProfileRows(state), [state]);

  useEffect(() => {
    if (progress.done) return undefined;
    const timer = setTimeout(
      () => dispatch({ type: 'SET_BUILD_STAGE', stage: state.buildStage + 1 }),
      stageMs,
    );
    return () => clearTimeout(timer);
  }, [dispatch, progress.done, state.buildStage, stageMs]);

  return (
    <View style={styles.screen}>
      <Text style={type.title}>Putting your profile together</Text>

      {progress.done ? (
        <Text style={type.body}>{buildSummaryLine(rows)}</Text>
      ) : (
        <View style={styles.stageBlock}>
          <ActivityIndicator color={colors.coral} />
          <Text style={type.body}>{progress.stage}</Text>
          <Text style={type.caption}>
            {progress.current} of {progress.total}
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.primary, !progress.done && styles.primaryBusy]}
        onPress={() => dispatch({ type: 'NEXT' })}
        disabled={!progress.done}
        accessibilityRole="button"
      >
        <Text style={styles.primaryLabel}>Continue</Text>
      </Pressable>
    </View>
  );
}

/**
 * The handover. The person meets the agent that answers for them, and can
 * rename it, which is the ownership cue the whole escalation model rests on.
 */
export function AgentLiveScreen({ state, dispatch, services }: Props) {
  const rows = useMemo(() => buildProfileRows(state), [state]);
  const lines = useMemo(() => handoverLines(state, rows), [state, rows]);

  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const displayName = navigatorName(saved);

  async function handleRename() {
    const next = name.trim();
    if (!isNavigatorNameWellFormed(next) || busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await services.chat.rename(state.authSession, next);
      setSaved(next);
      setName('');
    } catch {
      setFailure('That name did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>Meet your {displayName}</Text>
      <Text style={type.body}>
        It answers questions about this position using what the practice has told us. When the
        answer sits with them, it asks and tells you it is checking.
      </Text>

      {lines.length > 0 ? (
        <View style={styles.notes}>
          {lines.map((line) => (
            <Text key={line} style={type.caption}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={type.label}>Call it something else</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={displayName}
          placeholderTextColor={colors.muted}
          maxLength={MAX_NAVIGATOR_NAME}
          accessibilityLabel="Navigator name"
        />
        <Pressable
          onPress={handleRename}
          disabled={busy || !isNavigatorNameWellFormed(name)}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.inlineAction,
              (busy || !isNavigatorNameWellFormed(name)) && styles.disabled,
            ]}
          >
            {busy ? 'Saving' : 'Save name'}
          </Text>
        </Pressable>
        {failure ? <Text style={styles.error}>{failure}</Text> : null}
      </View>

      <Pressable
        style={styles.primary}
        onPress={() => dispatch({ type: 'NAVIGATE', route: 'Chat' })}
        accessibilityRole="button"
      >
        <Text style={styles.primaryLabel}>Ask about this position</Text>
      </Pressable>

      <Pressable
        onPress={() => dispatch({ type: 'NAVIGATE', route: 'Profile' })}
        accessibilityRole="button"
      >
        <Text style={styles.secondary}>See your profile</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.ink, flexGrow: 1 },
  stageBlock: { gap: spacing.sm, alignItems: 'flex-start' },
  notes: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.panel,
  },
  field: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.panel,
  },
  inlineAction: { ...type.label, color: colors.trustBlue },
  disabled: { color: colors.muted },
  error: { ...type.caption, color: colors.error },
  primary: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBusy: { opacity: 0.4 },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  secondary: { ...type.caption, textAlign: 'center', textDecorationLine: 'underline' },
});
