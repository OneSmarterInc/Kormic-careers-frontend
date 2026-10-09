import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Button, Caption, ConfirmDialog, ErrorText, Screen, Title } from '../ui';
import { CandidateState, rungRoute } from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { CandidateAction } from '../state/candidateReducer';
import { MAX_NAVIGATOR_NAME, isNavigatorNameWellFormed, navigatorName } from './agentModel';
import { colors, radii, spacing, type } from '../theme/tokens';
import {
  BackgroundCheck,
  ProfileRow,
  backgroundChecks,
  buildProfileRows,
  methodCounts,
  outstandingPrompts,
  signOutWarning,
  signedInAs,
} from './profileModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
  services: CandidateServices;
  /** Clears the session and returns to the front door. Supplied by the shell. */
  onSignOut?: () => Promise<void>;
}

/**
 * Every fact gets its own line, with how it was checked and when. No badge
 * anywhere on this screen speaks for the profile as a whole.
 */
export function ProfileScreen({ state, dispatch, services, onSignOut }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const grid = width >= 700;
  const [renameError, setRenameError] = useState<string>();
  const rows = useMemo(() => buildProfileRows(state), [state]);
  const counts = useMemo(() => methodCounts(rows), [rows]);
  const prompts = useMemo(() => outstandingPrompts(rows), [rows]);
  const checks = useMemo(() => backgroundChecks(state), [state]);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState<string | undefined>();
  const address = signedInAs(state);

  /**
   * Read what the server now holds each time the profile opens.
   *
   * Some claims are written as a side effect rather than in answer to
   * anything the app asked: background checks run when a step is submitted,
   * and their results never came back in that step's response. Without this
   * the profile showed "Not run yet" for checks that had already finished.
   * A failed refresh leaves what is on screen, which is still true.
   */
  useEffect(() => {
    let cancelled = false;
    services.person
      .load(state.authSession)
      .then((snapshot) => {
        if (!cancelled && snapshot) dispatch({ type: 'HYDRATE', snapshot });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Once per visit. Re-running on every state change would loop, because
    // hydrating changes the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const displayName = navigatorName(renamed ?? state.agentName);

  /**
   * Naming lives here rather than on the handover screen. That screen is shown
   * once during signing up, and once Profile became home it was unreachable —
   * which would have made the Navigator unnameable for everybody who had
   * already been through.
   */
  async function handleRename() {
    const next = name.trim();
    if (!isNavigatorNameWellFormed(next) || renaming) return;
    setRenaming(true);
    setRenameError(undefined);
    try {
      await services.chat.rename(state.authSession, next);
      setRenamed(next);
      setName('');
    } catch {
      setRenameError('The name could not be saved. Please try again.');
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Screen wide compactSpacing showsVerticalScrollIndicator={false}>
      <View style={[styles.profileHead, wide && styles.profileHeadWide]}>
        <View style={styles.profileTitle}><Text style={type.eyebrow}>Your profile</Text><Title>{state.person.fullName || 'Your profile'}</Title></View>
        <View style={styles.tally}>
          <View style={styles.pillChecked}>
            <Text style={styles.pillCheckedText}>
              {counts.primary_source + counts.source_checked} checked
            </Text>
          </View>
          <View style={styles.pillSelf}>
            <Text style={styles.pillSelfText}>{counts.self_attested} provided by you</Text>
          </View>
        </View>
      </View>

      {prompts.length > 0 ? (
        <View style={styles.prompt}>
          <Text style={type.bodyStrong}>
            {prompts.length === 1
              ? `${prompts[0]} still needs your attention.`
              : `${prompts.length} things still need your attention.`}
          </Text>
        </View>
      ) : null}

      <View style={[styles.columns, wide && styles.columnsWide]}>
      <View style={styles.records}>
      <Text style={type.eyebrow}>Professional records</Text>
      <View style={styles.recordGrid}>
      {rows.map((row) => (
        <View key={row.rungKey} style={grid ? styles.gridCell : styles.singleCell}><ClaimRow row={row} dispatch={dispatch} /></View>
      ))}
      </View>

      {/* Their own section, in their own words. A background check is a
          search of a list, not a fact about the person, so it never sits among
          the facts above or counts towards "checked". */}
      {checks.length > 0 ? (
        <View style={styles.checks}>
          <Text style={type.bodyStrong}>Background checks</Text>
          {checks.map((check) => (
            <CheckRow key={check.rungKey} check={check} />
          ))}
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Practices see what was checked and when. Anything you provided that nobody has checked is shown
        to them that way too.
      </Text>

      </View>
      <View style={[styles.sidebar, wide && styles.sidebarWide]}>
      {/* Home needs a way to the conversation. Chat used to be reachable only
          from the handover screen, so a returning person could not get to it
          at all. */}
      <View style={styles.navigatorHeading}><Text style={type.eyebrow}>Your Navigator</Text><Text style={type.heading}>{displayName}</Text><Caption>Ask questions about this position.</Caption></View>
      <Button
        label={`Ask ${displayName} about this position`}
        onPress={() => dispatch({ type: 'NAVIGATE', route: 'Chat' })}
      />

      <View style={styles.field}>
        <Text style={type.label}>Navigator name</Text>
        <View style={styles.renameRow}>
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
            disabled={renaming || !isNavigatorNameWellFormed(name)}
            accessibilityRole="button"
            style={styles.inlineAction}
          >
            <Text
              style={[
                styles.action,
                (renaming || !isNavigatorNameWellFormed(name)) && styles.disabled,
              ]}
            >
              {renaming ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>

      {renameError ? <ErrorText>{renameError}</ErrorText> : null}
      {onSignOut ? (
        <View style={styles.signOut}>
          {/* The address is shown next to it, so nobody signs out of the wrong
              profile, and so switching between two is unambiguous. */}
          {address ? <Caption>Signed in as {address}</Caption> : null}
          <Button label="Sign out" variant="quiet" onPress={() => setConfirming(true)} />
        </View>
      ) : null}

      </View>
      </View>
      <ConfirmDialog
        visible={confirming}
        title="Sign out?"
        body={signOutWarning}
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive
        busy={signingOut}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setSigningOut(true);
          await onSignOut?.();
        }}
      />
    </Screen>
  );
}

function CheckRow({ check }: { check: BackgroundCheck }) {
  return (
    <View style={styles.row}>
      <Text style={type.label}>{check.title}</Text>
      <Text
        style={[
          type.caption,
          check.state === 'no_match' && styles.checked,
          check.state === 'under_review' && styles.reviewText,
        ]}
      >
        {check.line}
      </Text>
      {check.detail ? <Text style={type.caption}>{check.detail}</Text> : null}
    </View>
  );
}

function ClaimRow({ row, dispatch }: { row: ProfileRow; dispatch: (action: CandidateAction) => void }) {
  const several = row.facts.length > 1;

  return (
    <View style={[styles.row, row.needsAttention && styles.rowAttention]}>
      <View style={styles.rowHead}>
        <Text style={[type.label, styles.recordTitle]}>{row.displayName}</Text>
        {row.actionLabel ? (
          <Pressable onPress={() => dispatch({ type: 'NAVIGATE', route: rungRoute(row.rungKey) })} accessibilityRole="button" style={styles.inlineAction}>
            <Text style={styles.action}>{row.actionLabel}</Text>
          </Pressable>
        ) : null}
        {row.requirement === 'optional' && row.facts.length === 0 ? (
          <Text style={type.caption}>Optional</Text>
        ) : null}
      </View>

      {/* One fact, or none: the rung's own line. Several, and each fact gets
          its own — a document that established a name, an institution and a
          work history has told a practice three separate things, each checked
          its own way. */}
      {several ? (
        <View style={styles.facts}>
          {row.facts.map((fact) => (
            <View key={fact.factType} style={styles.fact}>
              <Text style={type.caption}>{fact.label}</Text>
              <Text style={type.bodyStrong}>
                {fact.claim.factValue || '—'}
              </Text>
              <Text
                style={[
                  type.caption,
                  styles.checked,
                  fact.needsAttention && styles.attentionText,
                ]}
              >
                {fact.methodLine}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <Text
            style={[
              type.caption,
              row.headline ? styles.checked : undefined,
              row.needsAttention && styles.attentionText,
            ]}
          >
            {row.methodLine}
          </Text>
          {row.headline?.factValue ? (
            <Text style={type.body}>{row.headline.factValue}</Text>
          ) : null}
        </>
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  profileHead: { gap: spacing.sm },
  profileHeadWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileTitle: { flexShrink: 1, gap: spacing.xxs },
  navigatorHeading: { gap: spacing.xxs },
  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: { width: '48.5%' },
  singleCell: { width: '100%' },
  recordTitle: { flex: 1, minWidth: 0 },
  inlineAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  columns: { gap: spacing.md },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  records: { flex: 1, minWidth: 0, gap: spacing.sm },
  sidebar: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.panelRaised, borderRadius: radii.card },
  sidebarWide: { width: 300 },
  prompt: {
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  row: {
    backgroundColor: colors.panel,
    borderRadius: radii.input,
    padding: spacing.sm,
    gap: spacing.xxs,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,

  },
  tally: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  pillChecked: {
    backgroundColor: colors.trustWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillCheckedText: { ...type.caption, color: colors.trustBlue },
  pillSelf: {
    backgroundColor: colors.coralWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillSelfText: { ...type.caption, color: colors.coral },
  facts: { gap: spacing.sm, marginTop: spacing.xxs },
  fact: {
    gap: 2,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
  },
  rowAttention: { borderColor: colors.coral },
  rowHead: { flexWrap: 'wrap', gap: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checked: { color: colors.trustBlue },
  checks: { gap: spacing.sm, marginTop: spacing.xs },
  reviewText: { color: colors.coral },
  attentionText: { color: colors.error },
  action: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.coral },
  footnote: { ...type.caption, marginTop: spacing.xs },
  signOut: {
    marginTop: spacing.xxs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.onPrimary },
  field: { gap: spacing.xs },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
    backgroundColor: colors.panel,
  },
  disabled: { color: colors.muted },
});
