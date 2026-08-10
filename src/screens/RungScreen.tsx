import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CorridorRung, findRung } from '../models/corridor';
import { CandidateState, claimsForRung, rungKeyOf } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { CandidateServices } from '../services/candidateServices';
import { oauthPollPolicy, poll, pollHandle, verifierPollPolicy } from '../services/polling';
import { colors, radii, spacing, type } from '../theme/tokens';
import {
  RungDraft,
  canSkip,
  canSubmit,
  errorFor,
  fieldsFor,
  primaryActionLabel,
  statusLine,
} from './rungModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
  services: CandidateServices;
}

/**
 * One screen for every rung the corridor can return. It reads the rung's input
 * shape and renders accordingly, and it knows the name of no credential.
 */
export function RungScreen({ state, dispatch, services }: Props) {
  const key = rungKeyOf(state.route);
  const rung: CorridorRung | undefined = key && state.corridor ? findRung(state.corridor, key) : undefined;
  const progress = key ? state.rungs[key] : undefined;
  // Not memoised by hand: it is a filter and a sort over a handful of rows, and
  // the React Compiler refuses to preserve a useMemo whose dependency it cannot
  // prove stable. Letting it do the work removes the only lint error here.
  const claims = key ? claimsForRung(state, key) : [];

  const [draft, setDraft] = useState<RungDraft>({ value: progress?.value, jurisdiction: progress?.jurisdiction });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const rungState = progress?.state;
  // An OAuth rung is polled by its own handler; polling it here as well would
  // ask the same question twice.
  const awaitsVerifier =
    Boolean(rung?.verifier) && rung?.input !== 'oauth' && rungState === 'checking';

  /**
   * A rung left checking resolves itself while the screen is open. Without
   * this the state was terminal in practice: the person could advance, but
   * nothing ever moved the rung off "checking this now", so a claim that came
   * back in thirty seconds still read as outstanding.
   *
   * It gives up quietly. An authority lookup can take days, and the profile
   * reads the claim on next load regardless.
   */
  useEffect(() => {
    if (!key || !awaitsVerifier) return undefined;
    const handle = pollHandle();

    void poll(
      verifierPollPolicy,
      () => services.verifier.status(state.authSession, key),
      { handle },
    ).then((claim) => {
      if (!claim || handle.cancelled) return;
      dispatch({ type: 'RECORD_CLAIM', claim });
      dispatch({ type: 'SET_RUNG_STATE', key, state: 'confirmed' });
    });

    return () => handle.cancel();
    // state.authSession rather than state: the poll should not restart every
    // time an unrelated part of the ladder changes.
  }, [key, awaitsVerifier, services, state.authSession, dispatch]);

  if (!rung || !key) {
    return (
      <View style={styles.screen}>
        <Text style={type.body}>This step is not part of your corridor.</Text>
      </View>
    );
  }

  const fields = fieldsFor(rung);
  const validationError = errorFor(rung, draft, touched);
  const status = statusLine(rung, progress, claims);

  async function handleOAuth(rungKey: string, current: CorridorRung) {
    setBusy(true);
    try {
      // Server-driven throughout. The client asks for a URL, opens it, and then
      // asks the server what happened. It never sees a username or a token, so
      // there is nothing here to leak and nothing to store.
      const url = await services.oauth.authorizeUrl(state.authSession, rungKey);
      dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: 'checking' });
      await services.oauth.launch(url);

      const outcome = await poll(oauthPollPolicy, async () => {
        const status = await services.oauth.poll(state.authSession, rungKey);
        return status === 'pending' ? undefined : status;
      });

      if (outcome === 'connected') {
        const claim = await services.verifier.status(state.authSession, rungKey);
        if (claim) dispatch({ type: 'RECORD_CLAIM', claim });
        dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: 'confirmed' });
        dispatch({ type: 'NEXT' });
        return;
      }

      if (outcome === 'error') {
        dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: 'unsubmitted' });
        setFailure(`${current.displayName} did not connect. Try again.`);
        return;
      }

      // Ran out of attempts. The rung stays checking rather than being called
      // failed, because the handshake may still land on the server after this.
      setFailure(`${current.displayName} is taking longer than expected. You can carry on.`);
    } catch {
      dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: 'unsubmitted' });
      setFailure(`We could not reach ${current.displayName}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimary() {
    // The corridor is what a claim is written against, so a submission cannot
    // be made before it has loaded. In practice `rung` came from it, so this
    // holds by construction; the check is what tells the compiler that.
    const corridorKey = state.corridor?.key;
    if (!rung || !key || !corridorKey) return;
    setTouched(true);
    setFailure(undefined);

    if (rung.input === 'oauth') {
      await handleOAuth(key, rung);
      return;
    }

    if (rung.input === 'document_upload' && !draft.documentName) {
      try {
        const file = await services.document.pick();
        setDraft((current) => ({ ...current, documentName: file.name, documentUri: file.uri }));
      } catch {
        setFailure('That file could not be read. Choose a PDF or Word file.');
      }
      return;
    }

    if (!canSubmit(rung, draft)) return;

    setBusy(true);
    try {
      dispatch({ type: 'SUBMIT_RUNG', key, value: draft.value, jurisdiction: draft.jurisdiction });

      // The file goes up before the claim is submitted. A claim recorded
      // against a document that never arrived is the kind of half-truth the
      // whole verification model exists to avoid.
      if (rung.input === 'document_upload' && draft.documentName) {
        await services.document.upload(state.authSession, key, {
          name: draft.documentName,
          uri: draft.documentUri,
        });
      }

      const claim = await services.verifier.submit(state.authSession, {
        corridorKey,
        rungKey: key,
        value: draft.value,
        jurisdiction: draft.jurisdiction,
        documentUri: draft.documentUri,
      });
      dispatch({ type: 'RECORD_CLAIM', claim });
      if (rung.verifier) dispatch({ type: 'SET_RUNG_STATE', key, state: 'checking' });
      dispatch({ type: 'NEXT' });
    } catch {
      setFailure('That did not save. Check your connection and try again.');
      dispatch({ type: 'SET_RUNG_STATE', key, state: 'unsubmitted' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={type.title}>{rung.displayName}</Text>
      {rung.requirement === 'optional' ? (
        <Text style={type.caption}>Optional. Adding it gives practices more to go on.</Text>
      ) : null}

      {fields.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={type.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={draft[field.key] ?? ''}
            placeholder={field.placeholder}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            onChangeText={(text) => setDraft((current) => ({ ...current, [field.key]: text }))}
            accessibilityLabel={field.label}
          />
        </View>
      ))}

      {rung.input === 'document_upload' && draft.documentName ? (
        <Text style={type.body}>{draft.documentName}</Text>
      ) : null}

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
      {failure ? <Text style={styles.error}>{failure}</Text> : null}

      <Pressable
        style={[styles.primary, busy && styles.primaryBusy]}
        onPress={handlePrimary}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryLabel}>{primaryActionLabel(rung, progress)}</Text>}
      </Pressable>

      {canSkip(rung) ? (
        <Pressable
          onPress={() => {
            dispatch({ type: 'SKIP_RUNG', key });
            dispatch({ type: 'NEXT' });
          }}
          accessibilityRole="button"
        >
          <Text style={styles.skip}>Skip for now</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.ink, flexGrow: 1 },
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
  status: { ...type.caption, color: colors.trustBlue },
  error: { ...type.caption, color: colors.error },
  primary: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBusy: { opacity: 0.7 },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  skip: { ...type.caption, textAlign: 'center', textDecorationLine: 'underline' },
});
