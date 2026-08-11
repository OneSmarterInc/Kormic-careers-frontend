import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CandidateState, Person, isEmailEditable, isPersonComplete } from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { CandidateAction } from '../state/candidateReducer';
import { colors, radii, spacing, type } from '../theme/tokens';
import { CODE_LENGTH, attemptsLine, claimError, invitationOnlyNote, isCodeWellFormed } from './claimModel';
import { stepCountLine } from './tourModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
  services: CandidateServices;
}

// --- Welcome --------------------------------------------------------------

export function WelcomeScreen({ state, dispatch }: Omit<Props, 'services'>) {
  return (
    <View style={styles.centre}>
      <Text style={type.title}>Your work, checked once.</Text>
      <Text style={type.body}>
        Practices ask for the same records over and over. Give them once, and carry what was checked
        with you.
      </Text>
      <Pressable style={styles.primary} onPress={() => dispatch({ type: 'NEXT' })} accessibilityRole="button">
        <Text style={styles.primaryLabel}>See what it involves</Text>
      </Pressable>
      <Text style={type.caption}>{stepCountLine(state.corridor)}, free for you, always.</Text>
    </View>
  );
}

// --- Entry ----------------------------------------------------------------

export function EntryScreen({ state, dispatch, services }: Props) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [showNote, setShowNote] = useState(false);

  async function startClaim() {
    if (!token.trim()) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const { maskedEmail } = await services.claim.start(token.trim());
      dispatch({ type: 'SET_ENTRY_MODE', mode: 'claim' });
      dispatch({ type: 'SET_CLAIM', claim: { maskedEmail, token: token.trim(), verified: false } });
      dispatch({ type: 'NEXT' });
    } catch {
      // Deliberately the same message whether the list is unknown or the link is
      // wrong. Telling them apart is how a roster gets enumerated.
      setFailure('We could not find that invitation. Check the link and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>How are you joining?</Text>

      <View style={styles.card}>
        <Text style={type.label}>A practice invited me</Text>
        <Text style={type.caption}>Paste the code from your invitation.</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Invitation code"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          accessibilityLabel="Invitation code"
        />
        <Pressable style={styles.primary} onPress={startClaim} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryLabel}>Continue</Text>}
        </Pressable>
        {failure ? <Text style={styles.error}>{failure}</Text> : null}
      </View>

      {/* No session is handed out here. There is nothing to sign up to yet,
          and pretending otherwise is what made this a dead end. */}
      <Pressable onPress={() => setShowNote(true)} accessibilityRole="button">
        <Text style={styles.link}>I do not have a code</Text>
      </Pressable>
      {showNote ? <Text style={styles.note}>{invitationOnlyNote}</Text> : null}
    </ScrollView>
  );
}

// --- ClaimCode ------------------------------------------------------------

export function ClaimCodeScreen({ state, dispatch, services }: Props) {
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  async function verify() {
    if (!isCodeWellFormed(code) || !state.claim?.token) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await services.claim.verify(state.claim.token, code.trim());
      dispatch({
        type: 'CLAIM_VERIFIED',
        pinnedEmail: result.pinnedEmail,
        prefill: result.prefill,
        // Kept, because confirm spends it to mint the session.
        claimToken: result.claimToken,
      });
      dispatch({ type: 'NEXT' });
    } catch {
      setAttempts((current) => current + 1);
      setFailure(claimError('bad_code'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={type.title}>Check your email</Text>
      {/* The masked address is the only thing this screen may show before the
          code verifies. Nothing about the practice, the list, or the person. */}
      <Text style={type.body}>
        We sent a {CODE_LENGTH}-digit code to {state.claim?.maskedEmail ?? 'your listed address'}.
      </Text>

      <TextInput
        style={[styles.input, styles.code]}
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        accessibilityLabel="Verification code"
      />

      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      {attemptsLine(attempts) ? <Text style={type.caption}>{attemptsLine(attempts)}</Text> : null}

      <Pressable
        style={[styles.primary, (!isCodeWellFormed(code) || busy) && styles.disabled]}
        onPress={verify}
        disabled={!isCodeWellFormed(code) || busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryLabel}>Verify</Text>}
      </Pressable>
    </View>
  );
}

// --- BasicInfo ------------------------------------------------------------

const personFields: { key: keyof Person; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State or region' },
  { key: 'country', label: 'Country' },
];

export function BasicInfoScreen({ state, dispatch, services }: Props) {
  const emailLocked = !isEmailEditable(state);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  /**
   * This is where the claim is spent and the session begins.
   *
   * Continue used to only dispatch NEXT, so a person finished the claim, was
   * shown their own details, and walked the rest of the ladder holding no
   * token at all. Against mocks that looked fine because nothing checked; the
   * first real request answered 401.
   */
  async function handleContinue() {
    const claimToken = state.claim?.claimToken;
    if (busy) return;
    if (!claimToken) {
      // No claim to spend. Nothing else mints a session today, so there is
      // nothing to do here but carry on and let the gates hold.
      dispatch({ type: 'NEXT' });
      return;
    }

    setBusy(true);
    setFailure(undefined);
    try {
      const session = await services.claim.confirm(claimToken, state.person);
      dispatch({ type: 'SET_AUTH_SESSION', session });
      dispatch({ type: 'NEXT' });
    } catch {
      setFailure('We could not finish setting you up. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>About you</Text>

      {personFields.map((field) => {
        const locked = field.key === 'email' && emailLocked;
        return (
          <View key={field.key} style={styles.field}>
            <Text style={type.label}>{field.label}</Text>
            <TextInput
              style={[styles.input, locked && styles.lockedInput]}
              value={state.person[field.key]}
              editable={!locked}
              onChangeText={(text) => dispatch({ type: 'UPDATE_PERSON', field: field.key, value: text })}
              placeholderTextColor={colors.muted}
              autoCapitalize={field.key === 'email' ? 'none' : 'words'}
              accessibilityLabel={field.label}
            />
            {locked ? (
              <Text style={type.caption}>
                This is the address the practice listed, so we keep it as the one we check against.
              </Text>
            ) : null}
          </View>
        );
      })}

      {failure ? <Text style={styles.error}>{failure}</Text> : null}

      <Pressable
        style={[styles.primary, (!isPersonComplete(state.person) || busy) && styles.disabled]}
        onPress={handleContinue}
        disabled={!isPersonComplete(state.person) || busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryLabel}>Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.ink, flexGrow: 1 },
  centre: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  card: { backgroundColor: colors.panel, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
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
  lockedInput: { color: colors.muted, borderStyle: 'dashed' },
  code: { fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  primary: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  link: { ...type.caption, textAlign: 'center', textDecorationLine: 'underline' },
  note: { ...type.caption, textAlign: 'center' },
  error: { ...type.caption, color: colors.error },
});
