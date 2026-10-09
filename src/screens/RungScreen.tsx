import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Body,
  Button,
  Caption,
  Card,
  ChoiceField,
  ErrorText,
  Eyebrow,
  Field,
  Screen,
  StatusLine,
  Title,
} from '../ui';
import { CorridorRung, findRung, runsOnJoin } from '../models/corridor';
import { CandidateState, claimsForRung, rungKeyOf } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { CandidateServices } from '../services/candidateServices';
import { oauthPollPolicy, poll, pollHandle, verifierPollPolicy } from '../services/polling';
import { colors, spacing, type } from '../theme/tokens';
import {
  RungDraft,
  canSkip,
  canSubmit,
  errorFor,
  OTHER_JURISDICTION,
  fieldsFor,
  jurisdictionForSubmission,
  filesFor,
  oauthResult,
  primaryActionLabel,
  rungStateFromClaim,
  statusLine,
  submissionSteps,
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
  const draftJurisdiction = jurisdictionForSubmission(draft);
  useEffect(() => {
    if (key) dispatch({ type: 'SAVE_RUNG_DRAFT', key, value: draft.value, jurisdiction: draftJurisdiction });
  }, [key, draft.value, draftJurisdiction, dispatch]);
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
      async () => {
        const claim = await services.verifier.status(state.authSession, key);
        if (!claim) return undefined;
        // Keep waiting while all that comes back is the person's own
        // submission. rungStateFromClaim is what decides that.
        const next = rungStateFromClaim(claim);
        return next ? { claim, next } : undefined;
      },
      { handle },
    ).then((result) => {
      if (!result || handle.cancelled) return;
      dispatch({ type: 'RECORD_CLAIM', claim: result.claim });
      dispatch({ type: 'SET_RUNG_STATE', key, state: result.next });
    });

    return () => handle.cancel();
    // state.authSession rather than state: the poll should not restart every
    // time an unrelated part of the ladder changes.
  }, [key, awaitsVerifier, services, state.authSession, dispatch]);

  if (!rung || !key) {
    return (
      <Screen centred scroll={false}>
        <Body>This step is not part of your corridor.</Body>
      </Screen>
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

      const result = oauthResult(current, outcome);

      if (outcome === 'connected') {
        const claim = await services.verifier.status(state.authSession, rungKey);
        if (claim) dispatch({ type: 'RECORD_CLAIM', claim });
        // The claim the provider produced decides the state where there is
        // one; a connection with a disagreeing check is not a confirmation.
        const next = claim ? rungStateFromClaim(claim) : undefined;
        dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: next ?? result.rungState });
        dispatch({ type: 'NEXT' });
        return;
      }

      dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: result.rungState });
      if (result.failure) setFailure(result.failure);
    } catch {
      dispatch({ type: 'SET_RUNG_STATE', key: rungKey, state: 'unsubmitted' });
      setFailure(`We could not reach ${current.displayName}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function addScreenshots() {
    try {
      const picked = await services.document.pickMany();
      if (picked.length === 0) return;
      setDraft((current) => ({
        ...current,
        attachments: [...(current.attachments ?? []), ...picked],
      }));
    } catch {
      setFailure('Those images could not be read. Try again.');
    }
  }

  function removeScreenshot(index: number) {
    setDraft((current) => ({
      ...current,
      attachments: (current.attachments ?? []).filter((_, at) => at !== index),
    }));
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
        setDraft((current) => ({
          ...current,
          documentName: file.name,
          documentUri: file.uri,
          documentFile: file.file,
        }));
      } catch {
        setFailure('That file could not be read. Choose a PDF or Word file.');
      }
      return;
    }

    // Screenshots accumulate. The first press opens the picker; once there is
    // at least one, the button submits and "Add more" opens it again.
    if (rung.input === 'screenshots' && (draft.attachments?.length ?? 0) === 0) {
      await addScreenshots();
      return;
    }

    if (!canSubmit(rung, draft)) return;

    setBusy(true);
    try {
      dispatch({
        type: 'SUBMIT_RUNG',
        key,
        value: draft.value,
        jurisdiction: jurisdictionForSubmission(draft),
      });

      // The order is `submissionSteps`' decision, not this component's, so the
      // rule that a file goes up before the claim is written is held by a test
      // rather than by the order two awaits happen to sit in.
      for (const step of submissionSteps(rung, draft)) {
        if (step === 'upload') {
          // filesFor decides what this rung carries, so the screen does not
          // have to know a document sits on one pair of fields and a set of
          // screenshots on another.
          for (const file of filesFor(rung, draft)) {
            await services.document.upload(state.authSession, corridorKey, key, file);
          }
          continue;
        }
        const claim = await services.verifier.submit(state.authSession, {
          corridorKey,
          rungKey: key,
          value: draft.value,
          jurisdiction: jurisdictionForSubmission(draft),
          documentUri: draft.documentUri,
        });
        dispatch({ type: 'RECORD_CLAIM', claim });
      }

      // Only a rung that actually runs on join goes to checking. A rung whose
      // authority charges stays submitted, because nothing is happening to it
      // until a practice decides to pay, and a spinner would say otherwise.
      if (runsOnJoin(rung)) dispatch({ type: 'SET_RUNG_STATE', key, state: 'checking' });
      dispatch({ type: 'NEXT' });
    } catch {
      setFailure('That did not save. Check your connection and try again.');
      dispatch({ type: 'SET_RUNG_STATE', key, state: 'unsubmitted' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View>
        <Title>{rung.displayName}</Title>
        {rung.requirement === 'optional' ? (
          <Caption>Optional. Adding it gives practices more to go on.</Caption>
        ) : null}
      </View>

      {fields.map((field) =>
        field.choices ? (
          <React.Fragment key={field.key}>
            <ChoiceField
              label={field.label}
              value={draft.jurisdiction}
              options={[
                ...field.choices.map((choice) => ({ value: choice.code, label: choice.label })),
                // Always last, and always present. Somebody whose regulator
                // nobody has integrated still has to be able to hand their
                // licence in — it is recorded as self_attested, which is the
                // truth, rather than being refused at the door.
                { value: OTHER_JURISDICTION, label: 'Somewhere else' },
              ]}
              onChange={(value) =>
                setDraft((current) => ({ ...current, jurisdiction: value }))
              }
            />
            {draft.jurisdiction === OTHER_JURISDICTION ? (
              <Field
                label="Where was it issued?"
                value={draft.jurisdictionOther ?? ''}
                placeholder="Country or state"
                onChangeText={(text) =>
                  setDraft((current) => ({ ...current, jurisdictionOther: text }))
                }
                accessibilityLabel="Where was it issued?"
                hint="We have no register for this one, so it will be recorded as something you told us."
              />
            ) : null}
          </React.Fragment>
        ) : (
          <Field
            key={field.key}
            label={field.label}
            value={draft[field.key] ?? ''}
            placeholder={field.placeholder}
            autoCapitalize="characters"
            onChangeText={(text) => setDraft((current) => ({ ...current, [field.key]: text }))}
            accessibilityLabel={field.label}
            error={field.key === 'value' ? validationError : undefined}
          />
        ),
      )}

      {rung.input === 'document_upload' && draft.documentName ? (
        <Card>
          <Eyebrow>Chosen</Eyebrow>
          <Text style={type.bodyStrong}>{draft.documentName}</Text>
        </Card>
      ) : null}

      {rung.input === 'screenshots' ? (
        <Card>
          <Eyebrow>
            {(draft.attachments?.length ?? 0) === 0
              ? 'Nothing added yet'
              : `${draft.attachments?.length} added`}
          </Eyebrow>
          {(draft.attachments ?? []).map((file, index) => (
            <View key={`${file.name}-${index}`} style={styles.attachment}>
              <Text style={type.bodyStrong} numberOfLines={1}>
                {file.name}
              </Text>
              <Pressable onPress={() => removeScreenshot(index)} accessibilityRole="button">
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          ))}
          {(draft.attachments?.length ?? 0) > 0 ? (
            <Button label="Add more" variant="quiet" onPress={addScreenshots} />
          ) : (
            <Caption>
              A profile rarely fits in one image. Add as many as it takes to show the whole thing.
            </Caption>
          )}
        </Card>
      ) : null}

      {status ? <StatusLine tone="checked">{status}</StatusLine> : null}
      {fields.length === 0 && validationError ? <ErrorText>{validationError}</ErrorText> : null}
      {failure ? <ErrorText>{failure}</ErrorText> : null}

      <Button label={primaryActionLabel(rung, progress, draft)} onPress={handlePrimary} busy={busy} />

      {canSkip(rung) ? (
        <Button
          label="Skip for now"
          variant="quiet"
          onPress={() => {
            dispatch({ type: 'SKIP_RUNG', key });
            dispatch({ type: 'NEXT' });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  remove: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: colors.error },
});
