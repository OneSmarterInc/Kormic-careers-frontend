import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CandidateState, Person, isEmailEditable, isPersonComplete } from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { CandidateAction } from '../state/candidateReducer';
import { colors, radii, spacing, type } from '../theme/tokens';
import { CODE_LENGTH, attemptsLine, claimError, isCodeWellFormed } from './claimModel';
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
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'join' | 'claim' | undefined>();
  const [failure, setFailure] = useState<string | undefined>();

  /**
   * Careers admits anyone. Kormic Student is the invitation corridor, where a
   * university hands over a list; here the person is the supply side and
   * gating who may exist would gate the thing a practice pays to see. So this
   * is the primary path, and the invitation below is the secondary one for
   * when a practice or a staffing partner does bring a roster.
   *
   * No session is minted here on either path. The person leaves with a code on
   * its way and the session arrives one screen later, which is what keeps the
   * old empty-session dead end shut.
   */
  async function startJoin() {
    const address = email.trim();
    if (!address) return;
    setBusy('join');
    setFailure(undefined);
    try {
      const result = await services.signup.start(address);
      dispatch({ type: 'SET_ENTRY_MODE', mode: 'signup' });
      dispatch({ type: 'SET_SIGNUP', signup: { email: result.email, codeSent: true } });
      dispatch({ type: 'NEXT' });
    } catch {
      setFailure('We could not send a code just then. Check the address and try again.');
    } finally {
      setBusy(undefined);
    }
  }

  async function startClaim() {
    if (!token.trim()) return;
    setBusy('claim');
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
      setBusy(undefined);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>How are you joining?</Text>

      <View style={styles.card}>
        <Text style={type.label}>Join</Text>
        <Text style={type.caption}>
          Give us an address and we will send you a code. Free, always.
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email address"
        />
        <Pressable
          style={styles.primary}
          onPress={startJoin}
          disabled={busy !== undefined}
          accessibilityRole="button"
        >
          {busy === 'join' ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.primaryLabel}>Send me a code</Text>
          )}
        </Pressable>
      </View>

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
        <Pressable
          style={styles.primary}
          onPress={startClaim}
          disabled={busy !== undefined}
          accessibilityRole="button"
        >
          {busy === 'claim' ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.primaryLabel}>Continue</Text>
          )}
        </Pressable>
      </View>

      {failure ? <Text style={styles.error}>{failure}</Text> : null}
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

// --- JoinCode -------------------------------------------------------------

/**
 * The signup path's code screen. Same discipline as the claim one, with one
 * deliberate difference: the address is shown in full because the person just
 * typed it, and it is not pinned afterwards, because on this path nobody else
 * asserted it. A wrong code and an unknown address read identically, so this
 * door cannot be used to find out who already has an account.
 */
export function JoinCodeScreen({ state, dispatch, services }: Props) {
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  async function verify() {
    const address = state.signup?.email;
    if (!isCodeWellFormed(code) || !address) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const session = await services.signup.verify(address, code.trim());
      dispatch({ type: 'SET_AUTH_SESSION', session });
      dispatch({ type: 'NEXT' });
    } catch {
      setAttempts((current) => current + 1);
      setFailure(claimError('bad_code'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const address = state.signup?.email;
    if (!address) return;
    setFailure(undefined);
    try {
      await services.signup.start(address);
      setAttempts(0);
      setCode('');
    } catch {
      setFailure('We could not send another code just then.');
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={type.title}>Check your email</Text>
      <Text style={type.body}>
        We sent a {CODE_LENGTH}-digit code to {state.signup?.email ?? 'your address'}.
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

      <Pressable onPress={resend} accessibilityRole="button">
        <Text style={styles.link}>Send another code</Text>
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
