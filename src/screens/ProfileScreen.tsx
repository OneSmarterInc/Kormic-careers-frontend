import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CandidateState, rungRoute } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { colors, radii, spacing, type } from '../theme/tokens';
import { ProfileRow, buildProfileRows, methodCounts, outstandingPrompts } from './profileModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
}

/**
 * Every fact gets its own line, with how it was checked and when. No badge
 * anywhere on this screen speaks for the profile as a whole.
 */
export function ProfileScreen({ state, dispatch }: Props) {
  const rows = useMemo(() => buildProfileRows(state), [state]);
  const counts = useMemo(() => methodCounts(rows), [rows]);
  const prompts = useMemo(() => outstandingPrompts(rows), [rows]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>{state.person.fullName || 'Your profile'}</Text>
      <Text style={type.caption}>
        {counts.primary_source + counts.source_checked} checked, {counts.self_attested} provided by you
      </Text>

      {prompts.length > 0 ? (
        <View style={styles.prompt}>
          <Text style={type.body}>
            {prompts.length === 1
              ? `${prompts[0]} still needs your attention.`
              : `${prompts.length} things still need your attention.`}
          </Text>
        </View>
      ) : null}

      {rows.map((row) => (
        <ClaimRow key={row.rungKey} row={row} dispatch={dispatch} />
      ))}

      <Text style={styles.footnote}>
        Practices see what was checked and when. Anything you provided that nobody has checked is shown
        to them that way too.
      </Text>
    </ScrollView>
  );
}

function ClaimRow({ row, dispatch }: { row: ProfileRow; dispatch: (action: CandidateAction) => void }) {
  return (
    <View style={[styles.row, row.needsAttention && styles.rowAttention]}>
      <View style={styles.rowHead}>
        <Text style={type.label}>{row.displayName}</Text>
        {row.requirement === 'optional' && !row.claim ? (
          <Text style={type.caption}>Optional</Text>
        ) : null}
      </View>

      <Text style={[type.caption, row.claim ? styles.checked : undefined, row.needsAttention && styles.attentionText]}>
        {row.methodLine}
      </Text>

      {row.claim?.factValue ? <Text style={type.body}>{row.claim.factValue}</Text> : null}

      {row.actionLabel ? (
        <Pressable
          onPress={() => dispatch({ type: 'NAVIGATE', route: rungRoute(row.rungKey) })}
          accessibilityRole="button"
        >
          <Text style={styles.action}>{row.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.ink, flexGrow: 1 },
  prompt: {
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  row: {
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowAttention: { borderColor: colors.coral },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checked: { color: colors.trustBlue },
  attentionText: { color: colors.error },
  action: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.coral },
  footnote: { ...type.caption, marginTop: spacing.md },
});
