import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Eyebrow, Screen, Title } from '../ui';
import { CandidateState } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { CandidateServices } from '../services/candidateServices';
import { colors, radii, spacing, type } from '../theme/tokens';
import { buildProfileRows } from './profileModel';
import { buildProgress, buildSummaryLine, handoverLines, navigatorName } from './agentModel';

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
    <Screen centred scroll={false}>
      <Title>Putting your profile together</Title>

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

      <Button label="Continue" onPress={() => dispatch({ type: 'NEXT' })} disabled={!progress.done} />
    </Screen>
  );
}

/**
 * The handover. The person meets the agent that answers for them, and can
 * rename it, which is the ownership cue the whole escalation model rests on.
 */
export function AgentLiveScreen({ state, dispatch, services }: Props) {
  const rows = useMemo(() => buildProfileRows(state), [state]);
  const lines = useMemo(() => handoverLines(state, rows), [state, rows]);

  // Naming happens on the profile, which is where a person can still reach it
  // tomorrow. This screen is the introduction, and it is shown once.
  const displayName = navigatorName(state.agentName);

  return (
    <Screen>
      <Title>Meet your {displayName}</Title>
      <Body>
        It answers questions about this position using what the practice has told us. When the
        answer sits with them, it asks and tells you it is checking.
      </Body>

      {lines.length > 0 ? (
        <Card>
          <Eyebrow>Where things stand</Eyebrow>
          {lines.map((line) => (
            <Text key={line} style={type.caption}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button
        label="Ask about this position"
        onPress={() => dispatch({ type: 'NAVIGATE', route: 'Chat' })}
      />
      <Button
        label="See your profile"
        variant="quiet"
        onPress={() => dispatch({ type: 'NAVIGATE', route: 'Profile' })}
      />
    </Screen>
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
