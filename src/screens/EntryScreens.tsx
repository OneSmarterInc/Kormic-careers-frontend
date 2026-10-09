import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Body, Button, Caption, Card, CheckField, DateField, ErrorText, Eyebrow, Field, Screen, Title } from '../ui';
import {
  CandidateState,
  MIN_AGE_YEARS,
  Person,
  dateOfBirthProblem,
  hasScreeningConsent,
  isPersonComplete,
  missingDetails,
} from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { CandidateAction } from '../state/candidateReducer';
import { colors, fonts, layout, radii, spacing, type } from '../theme/tokens';
import { CODE_LENGTH, attemptsLine, claimError, isCodeWellFormed, joinOrSignInNote } from './claimModel';
import { stepCountLine } from './tourModel';
import { routeAfterSignIn } from '../navigation/routes';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
  services: CandidateServices;
}

// --- Welcome --------------------------------------------------------------

export function WelcomeScreen({ state, dispatch }: Omit<Props, 'services'>) {
  return (
    <Screen contentWidth={layout.welcome}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Kormic</Text>
        <Text accessibilityRole="header" style={styles.heroTitle}>Your agent{'\n'}<Text style={styles.accent}>starts here.</Text></Text>
        <Text style={styles.heroBody}>Give your professional records once, and carry what was checked with you. Your Navigator helps you ask about the position.</Text>
        <Button label="Get started" onPress={() => dispatch({ type: 'NEXT' })} />
        <Button label="Claim invitation" variant="secondary" onPress={() => { dispatch({ type: 'SET_ENTRY_MODE', mode: 'claim' }); dispatch({ type: 'NAVIGATE', route: 'Entry' }); }} />
        <Button label="Already started? Sign in" variant="quiet" onPress={() => { dispatch({ type: 'SET_ENTRY_MODE', mode: 'signup' }); dispatch({ type: 'NAVIGATE', route: 'Entry' }); }} />
        <Caption>{stepCountLine(state.corridor)}, free for you, always.</Caption>
      </View>
    </Screen>
  );
}

// --- Entry ----------------------------------------------------------------

export function EntryScreen({ state, dispatch, services }: Props) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const invitation = state.entryMode === 'claim';
  const setInvitation = (claim: boolean) => dispatch({ type: 'SET_ENTRY_VIEW', mode: claim ? 'claim' : 'signup' });
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
    if (!address || !/.+@.+\..+/.test(address)) { setFailure('Enter a valid email address.'); return; }
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
    <Screen contentWidth={layout.compact}>
      <Title>{invitation ? 'Claim your invitation.' : 'Let’s get you started.'}</Title>
      {!invitation ? (<>

      <Card>
        <Eyebrow>Join or sign in</Eyebrow>
        <Caption>{joinOrSignInNote}</Caption>
        <Field
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email address"
        />
        <Button
          label="Send me a code"
          onPress={startJoin}
          busy={busy === 'join'}
          disabled={busy !== undefined}
        />
      </Card>

      <Button label="Have an invitation?" disabled={busy !== undefined} variant="quiet" onPress={() => { setInvitation(true); setFailure(undefined); }} />
      </>) : (<>
      <Card>
        <Eyebrow>A practice invited me</Eyebrow>
        <Caption>Paste the code from your invitation.</Caption>
        <Field
          value={token}
          onChangeText={setToken}
          placeholder="Invitation code"
          autoCapitalize="none"
          accessibilityLabel="Invitation code"
        />
        <Button
          label="Continue"
          onPress={startClaim}
          variant="secondary"
          busy={busy === 'claim'}
          disabled={busy !== undefined}
        />
      </Card>

      <Button label="Join with your email instead" disabled={busy !== undefined} variant="quiet" onPress={() => { setInvitation(false); setFailure(undefined); }} />
      </>)}
      {failure ? <ErrorText>{failure}</ErrorText> : null}
    </Screen>
  );
}

// --- ClaimCode ------------------------------------------------------------

export function ClaimCodeScreen({ state, dispatch, services }: Props) {
  const requestLock = useRef(false);
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  async function verify() {
    if (requestLock.current || !isCodeWellFormed(code) || !state.claim?.token) return;
    requestLock.current = true;
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
      requestLock.current = false;
      setBusy(false);
    }
  }

  if (state.claim?.verified) return (
    <Screen centred contentWidth={layout.compact}><Title>Email confirmed</Title><Body>Your invitation email has already been confirmed.</Body>
      <Button label="Continue" onPress={() => dispatch({ type: 'NAVIGATE', route: 'BasicInfo' })} />
    </Screen>
  );

  return (
    <Screen centred contentWidth={layout.compact}>
      <Title>Check your email</Title>
      {/* The masked address is the only thing this screen may show before the
          code verifies. Nothing about the practice, the list, or the person. */}
      <Body>
        We sent a {CODE_LENGTH}-digit code to {state.claim?.maskedEmail ?? 'your listed address'}.
      </Body>

      <Field
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        returnKeyType="done"
        onSubmitEditing={() => { void verify(); }}
        accessibilityLabel="Verification code"
        style={styles.code}
        error={failure}
      />

      {attemptsLine(attempts) ? <Caption>{attemptsLine(attempts)}</Caption> : null}

      <Button label="Verify" onPress={verify} busy={busy} disabled={!isCodeWellFormed(code)} />
    </Screen>
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
  const requestLock = useRef(false);
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  async function verify() {
    const address = state.signup?.email;
    if (requestLock.current || !isCodeWellFormed(code) || !address) return;
    requestLock.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      const session = await services.signup.verify(address, code.trim());
      dispatch({ type: 'SET_AUTH_SESSION', session });

      // Ask who just came in. Advancing blindly sent a person with a finished
      // profile to a form asking for their name again.
      const snapshot = await services.person.load(session).catch(() => undefined);
      if (snapshot) dispatch({ type: 'HYDRATE', snapshot });
      dispatch({ type: 'NAVIGATE', route: routeAfterSignIn(snapshot) });
    } catch {
      setAttempts((current) => current + 1);
      setFailure(claimError('bad_code'));
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    const address = state.signup?.email;
    if (requestLock.current || !address) return;
    requestLock.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await services.signup.start(address);
      setAttempts(0);
      setCode('');
    } catch {
      setFailure('We could not send another code just then.');
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  if (state.authSession) return (
    <Screen centred contentWidth={layout.compact}><Title>Email confirmed</Title><Body>Your email has already been confirmed for this session.</Body>
      <Button label="Continue" onPress={() => dispatch({ type: 'NAVIGATE', route: 'BasicInfo' })} />
    </Screen>
  );

  return (
    <Screen centred contentWidth={layout.compact}>
      <Title>Check your email</Title>
      <Body>We sent a {CODE_LENGTH}-digit code to {state.signup?.email ?? 'your address'}.</Body>

      <Field
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        returnKeyType="done"
        onSubmitEditing={() => { void verify(); }}
        accessibilityLabel="Verification code"
        style={styles.code}
        error={failure}
      />

      {attemptsLine(attempts) ? <Caption>{attemptsLine(attempts)}</Caption> : null}

      <Button
        label="Verify"
        onPress={verify}
        busy={busy}
        disabled={!isCodeWellFormed(code)}
      />
      <Button label="Send another code" disabled={busy} onPress={resend} variant="quiet" />
    </Screen>
  );
}

// --- BasicInfo ------------------------------------------------------------

/**
 * Keys of Person whose value is plain text, so a list of text inputs cannot
 * accidentally include one that is not — `previousNames` is a list and would
 * render as `[object Object]` in a box nobody could use.
 */
type PersonTextField = {
  [K in keyof Person]-?: Person[K] extends string | undefined ? K : never;
}[keyof Person];

const personFields: { key: PersonTextField; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State or region' },
  { key: 'country', label: 'Country' },
];

/**
 * Date of birth, previous names, and agreement to background checks.
 *
 * Kept apart from the contact details and explained where they are asked,
 * because they are asked for one reason: federal exclusion lists are searched
 * by name, names collide, and the date of birth is what tells a stranger with
 * the same name apart — which more often clears somebody than flags them.
 *
 * The date is required and picked from a calendar, never typed. The agreement
 * is required too, and the box starts empty: nobody is searched for on a
 * federal list because a checkbox was ticked for them.
 */
export const SCREENING_CONSENT_TEXT =
  'I agree to Kormic checking my name, any previous names and my date of birth against the US ' +
  'federal exclusion lists (HHS-OIG and SAM.gov), now and when those lists are updated.';

function isoYearsAgo(years: number, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear() - years}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function IdentitySection({
  person,
  dispatch,
  showErrors,
}: {
  person: Person;
  dispatch: (action: CandidateAction) => void;
  showErrors: boolean;
}) {
  // Held locally as typed text so a half-entered list is not repeatedly split
  // and rejoined under the person's cursor.
  const sideBySide = useWindowDimensions().width >= 800;
  const [names, setNames] = useState((person.previousNames ?? []).join(', '));
  const [touched, setTouched] = useState(false);
  const dobProblem = dateOfBirthProblem(person.dateOfBirth);
  const agreed = hasScreeningConsent(person);

  return (
    <View style={styles.identity}>
      <Eyebrow>Background checks</Eyebrow>
      <Caption>
        Your date of birth and previous names help distinguish you from people with the same name.
      </Caption>

      <View style={[styles.identityFields, sideBySide && styles.identityFieldsWide]}>
      <View style={sideBySide ? styles.dobColumn : styles.fullField}><DateField
        label="Date of birth"
        value={person.dateOfBirth ?? ''}
        max={isoYearsAgo(MIN_AGE_YEARS)}
        min={isoYearsAgo(120)}
        accessibilityLabel="Date of birth"
        onChange={(value) => {
          setTouched(true);
          dispatch({ type: 'UPDATE_PERSON', field: 'dateOfBirth', value });
        }}
        error={(touched || showErrors) && dobProblem ? dobProblem : undefined}
        hint="Never shown to a practice."
      /></View>

      <View style={sideBySide ? styles.namesColumn : styles.fullField}><Field
        label="Any previous names (optional)"
        value={names}
        placeholder="Enter previous names"
        accessibilityLabel="Previous names"
        onChangeText={(text) => {
          setNames(text);
          dispatch({
            type: 'UPDATE_PREVIOUS_NAMES',
            names: text
              .split(',')
              .map((part) => part.trim())
              .filter((part) => part.length > 0),
          });
        }}
        hint="Include maiden or former names, separated by commas."
      /></View>
      </View>

      <CheckField
        checked={agreed}
        onChange={(value) => dispatch({ type: 'SET_SCREENING_CONSENT', agreed: value })}
        accessibilityLabel="Agree to background checks"
        error={showErrors && !agreed ? 'Agree to background checks to continue.' : undefined}
      >
        <Text style={type.body}>{SCREENING_CONSENT_TEXT}</Text>
        <Text style={type.caption}>
          A match is reviewed by a person before anything is shown to a practice.
        </Text>
      </CheckField>
    </View>
  );
}

export function BasicInfoScreen({ state, dispatch, services }: Props) {
  const emailLocked = true;
  const wide = useWindowDimensions().width >= 760;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [attempted, setAttempted] = useState(false);
  const complete = isPersonComplete(state.person);

  /**
   * This is where the claim is spent and the session begins.
   *
   * Continue used to only dispatch NEXT, so a person finished the claim, was
   * shown their own details, and walked the rest of the ladder holding no
   * token at all. Against mocks that looked fine because nothing checked; the
   * first real request answered 401.
   */
  async function handleContinue() {
    if (busy) return;
    // Say what is missing rather than sitting on a dead button. The date and
    // the agreement are new required fields, and a greyed-out Continue gave
    // no hint which one was holding things up.
    if (!complete) {
      setAttempted(true);
      setFailure(`Still needed: ${missingDetails(state.person).join(', ')}.`);
      return;
    }
    setBusy(true);
    setFailure(undefined);

    const claimToken = state.claim?.claimToken;
    try {
      if (claimToken && !state.authSession) {
        // The invitation path spends the claim here, and that is what mints
        // the session.
        const session = await services.claim.confirm(claimToken, state.person);
        dispatch({ type: 'SET_AUTH_SESSION', session });
      }

      // Both paths save. On the open path the session already exists from the
      // code, and these details were previously collected, shown back to the
      // person, and never sent anywhere.
      const snapshot = await services.person.save(state.authSession, state.person);
      dispatch({ type: 'HYDRATE', snapshot });
      dispatch({ type: 'NEXT' });
    } catch {
      setFailure('We could not save your details. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentWidth={layout.form}>
      <Title>About you</Title>
      <Caption>This is what a practice sees alongside what was checked.</Caption>

      <View style={[styles.formGrid, wide && styles.formGridWide]}>
      {personFields.map((field) => {
        const locked = field.key === 'email' && emailLocked;
        return (
          <View key={field.key} style={wide ? styles.halfField : styles.fullField}><Field
            label={field.label}
            value={state.person[field.key]}
            locked={locked}
            onChangeText={(text) => dispatch({ type: 'UPDATE_PERSON', field: field.key, value: text })}
            autoCapitalize={field.key === 'email' ? 'none' : 'words'}
            accessibilityLabel={field.label}
            hint={
              locked
                ? 'Your verified sign-in address.'
                : undefined
            }
          /></View>
        );
      })}
      </View>

      <IdentitySection person={state.person} dispatch={dispatch} showErrors={attempted} />

      {failure ? <ErrorText>{failure}</ErrorText> : null}

      <View style={{ width: '100%', maxWidth: wide ? 260 : undefined, alignSelf: 'flex-end', marginTop: spacing.sm }}><Button
        label="Continue"
        onPress={handleContinue}
        busy={busy}
      /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', maxWidth: 580, alignSelf: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  logo: { ...type.bodyStrong, fontSize: 28, textAlign: 'center', marginBottom: spacing.md },
  heroTitle: { ...type.display, textAlign: 'center', letterSpacing: -1.2 },
  accent: { fontFamily: fonts.accent, color: colors.coral },
  heroBody: { ...type.body, textAlign: 'center', fontSize: 17, lineHeight: 28, marginBottom: spacing.lg },
  formGrid: { gap: spacing.md },
  formGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  halfField: { width: '48%' },
  fullField: { width: '100%' },

  spacer: { height: spacing.sm },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  // Set apart from the contact fields, because these are asked for a different
  // reason and the reason is stated above them.
  identityFields: { gap: spacing.md },
  identityFieldsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  dobColumn: { width: 300 },
  namesColumn: { flex: 1, minWidth: 0 },
  identity: { marginTop: spacing.xs, gap: spacing.sm, padding: spacing.md, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card },
});
