import { ApiError, requestFailure } from '../services/api';
import { LineIcon } from '../ui/LineIcon';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Body,
  Button,
  Caption,
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
import { CandidateServices, PickedFile } from '../services/candidateServices';
import { oauthPollPolicy, poll, pollHandle, verifierPollPolicy } from '../services/polling';
import { ScreenActions } from '../ui/ScreenActions';
import { UploadField } from '../ui/UploadField';
import { fileSize, selectionProblem } from '../services/fileSelection';
import { colors, radii, spacing, type } from '../theme/tokens';
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
  const operation = useRef(false);
  const [picking, setPicking] = useState(false);
  const key = rungKeyOf(state.route);
  const rung: CorridorRung | undefined = key && state.corridor ? findRung(state.corridor, key) : undefined;
  const progress = key ? state.rungs[key] : undefined;
  // Not memoised by hand: it is a filter and a sort over a handful of rows, and
  // the React Compiler refuses to preserve a useMemo whose dependency it cannot
  // prove stable. Letting it do the work removes the only lint error here.
  const claims = key ? claimsForRung(state, key) : [];

  const [draft, setDraft] = useState<RungDraft>({
    value: progress?.value,
    jurisdiction: progress?.jurisdiction,
  });
  const draftJurisdiction = jurisdictionForSubmission(draft);
  useEffect(() => {
    if (key) dispatch({ type: 'SAVE_RUNG_DRAFT', key, value: draft.value, jurisdiction: draftJurisdiction });
  }, [key, draft.value, draftJurisdiction, dispatch]);
  const [reviewingPhotos, setReviewingPhotos] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<string | undefined>();

  const rungState = progress?.state;
  // An OAuth rung is polled by its own handler; polling it here as well would
  // ask the same question twice.
  const awaitsVerifier = Boolean(rung?.verifier) && rung?.input !== 'oauth' && rungState === 'checking';

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
      operation.current = false;
      setBusy(false);
    }
  }

  async function chooseFiles(images: boolean) {
    if (operation.current) return;
    operation.current = true;
    setPicking(true);
    try {
      const single = images ? undefined : await services.document.pick();
      const picked = images ? await services.document.pickMany() : single ? [single] : [];
      if (!picked.length) return;
      const problem = picked.map((file) => selectionProblem(file, images)).find(Boolean);
      if (problem) {
        setFailure(problem);
        return;
      }
      setDraft((current) =>
        images
          ? { ...current, attachments: [...(current.attachments ?? []), ...picked] }
          : {
              ...current,
              documentName: picked[0]!.name,
              documentUri: picked[0]!.uri,
              documentFile: picked[0]!.file,
              documentMimeType: picked[0]!.mimeType,
              documentSize: picked[0]!.size,
            },
      );
      setFailure(undefined);
      setTouched(false);
      setReceipt(undefined);
      setFieldErrors({});
    } catch {
      setFailure('The file could not be read. Please choose it again.');
    } finally {
      operation.current = false;
      setPicking(false);
    }
  }

  function removeScreenshot(index: number) {
    if (operation.current) return;
    setReceipt(undefined);
    setFieldErrors({});
    setFailure(undefined);
    if (draft.attachments?.length === 1) setReviewingPhotos(false);
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
    if (!rung || !key || !corridorKey || operation.current) return;
    if (receipt) {
      dispatch({ type: 'NEXT' });
      return;
    }
    setTouched(true);
    setFailure(undefined);
    setFieldErrors({});

    if (rung.input === 'oauth') {
      operation.current = true;
      await handleOAuth(key, rung);
      return;
    }

    if (!canSubmit(rung, draft)) return;

    operation.current = true;
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
      const reports: string[] = [];
      for (const step of submissionSteps(rung, draft)) {
        if (step === 'upload') {
          // filesFor decides what this rung carries, so the screen does not
          // have to know a document sits on one pair of fields and a set of
          // screenshots on another.
          for (const file of filesFor(rung, draft)) {
            const result = await services.document.upload(state.authSession, corridorKey, key, file);
            reports.push(
              `${file.name}: ${result?.facts === 0 ? 'received, but no information was extracted.' : result?.facts !== undefined ? 'received; the server reported extracted information. This is not verification with an issuing authority.' : 'received; the server did not report an extraction outcome.'}`,
            );
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
        dispatch({ type: 'SET_RUNG_STATE', key, state: rungStateFromClaim(claim) ?? (runsOnJoin(rung) ? 'checking' : 'submitted') });
      }

      if (reports.length) {
        setReceipt(reports.join('\n'));
        return;
      }
      dispatch({ type: 'NEXT' });
    } catch (error) {
      if (error instanceof ApiError) setFieldErrors(error.fields);
      setFailure(requestFailure(error, 'That did not save. Try again.'));
      dispatch({ type: 'SET_RUNG_STATE', key, state: 'unsubmitted' });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen onboarding>
      <View style={{ gap: 8 }}>
        <Eyebrow>Professional records</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Title onboarding>
            {rung.input === 'document_upload' ? `Your ${rung.displayName}` : rung.displayName}
          </Title>
          {rung.requirement === 'optional' ? (
            <View
              style={{
                backgroundColor: colors.panelRaised,
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Caption>Optional</Caption>
            </View>
          ) : null}
        </View>
        {rung.input === 'document_upload' ? (
          <Caption>Add your experience, qualifications and career history.</Caption>
        ) : rung.requirement === 'optional' ? (
          <Caption>Give practices a little more context about your experience.</Caption>
        ) : null}
      </View>

      {fields.map((field) =>
        field.choices ? (
          <React.Fragment key={field.key}>
            <ChoiceField
              label={field.label}
              error={fieldErrors.jurisdiction}
              value={draft.jurisdiction}
              options={[
                ...field.choices.map((choice) => ({ value: choice.code, label: choice.label })),
                // Always last, and always present. Somebody whose regulator
                // nobody has integrated still has to be able to hand their
                // licence in — it is recorded as self_attested, which is the
                // truth, rather than being refused at the door.
                { value: OTHER_JURISDICTION, label: 'Somewhere else' },
              ]}
              onChange={(value) => {
                setFieldErrors({});
                setFailure(undefined);
                setDraft((current) => ({ ...current, jurisdiction: value }));
              }}
            />
            {draft.jurisdiction === OTHER_JURISDICTION ? (
              <Field
                label="Where was it issued?"
                maxLength={255}
                error={fieldErrors.jurisdiction}
                value={draft.jurisdictionOther ?? ''}
                placeholder="Country or state"
                onChangeText={(text) => {
                  setFieldErrors({});
                  setFailure(undefined);
                  setDraft((current) => ({ ...current, jurisdictionOther: text }));
                }}
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
            onChangeText={(text) => {
              setFieldErrors({});
              setFailure(undefined);
              setDraft((current) => ({ ...current, [field.key]: text }));
            }}
            accessibilityLabel={field.label}
            maxLength={field.key === 'value' ? 500 : 255}
            error={fieldErrors[field.key] || (field.key === 'value' ? validationError : undefined)}
          />
        ),
      )}

      {rung.input === 'document_upload' ? (
        <>
          <UploadField
            title={`Add your ${rung.displayName}`}
            description="Choose the document you want to include with your profile."
            formats="PDF, DOC or DOCX · One document"
            chooseLabel="Choose file"
            onChoose={() => chooseFiles(false)}
            busy={busy || picking}
            selected={Boolean(draft.documentName)}
            error={fieldErrors.file || failure || validationError}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View
                style={{
                  width: 52,
                  height: 62,
                  borderRadius: 10,
                  backgroundColor: colors.panelRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={type.label}>{draft.documentName?.split('.').pop()?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{draft.documentName}</Text>
                <Caption>
                  {[
                    fileSize(filesFor(rung, draft)[0] ?? { name: '' }),
                    receipt ? 'Received; original file not retained' : 'Selected, not uploaded',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Caption>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                columnGap: 24,
                rowGap: 8,
                marginTop: 12,
              }}
            >
              <Button
                compact
                label="Replace file"
                variant="quiet"
                block={false}
                disabled={busy || picking}
                onPress={() => chooseFiles(false)}
              />
              <Button
                compact
                label="Remove"
                variant="danger"
                block={false}
                disabled={busy || picking}
                onPress={() => {
                  setDraft((current) => ({
                    ...current,
                    documentName: undefined,
                    documentUri: undefined,
                    documentFile: undefined,
                    documentMimeType: undefined,
                    documentSize: undefined,
                  }));
                  setFieldErrors({});
                  setReceipt(undefined);
                  setTouched(false);
                  setFailure(undefined);
                }}
              />
            </View>
          </UploadField>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <LineIcon name="lock" />
            <View style={{ flex: 1 }}>
              <Caption>
                Files are processed and then deleted by the server. Selecting a file does not verify its
                contents.
              </Caption>
            </View>
          </View>
        </>
      ) : null}

      {rung.input === 'screenshots' ? (
        <UploadField
          title={`Add your ${rung.displayName} screenshots`}
          description="Choose enough images to show the relevant parts of your profile."
          formats="Image files · Select multiple screenshots"
          chooseLabel="Choose screenshots"
          onChoose={() => chooseFiles(true)}
          busy={busy || picking}
          selected={Boolean(draft.attachments?.length)}
          error={fieldErrors.file || failure || validationError}
        >
          {draft.attachments?.length ? (
            <View style={styles.photoSummary}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Review ${draft.attachments.length} selected photos`}
                disabled={busy || picking}
                onPress={() => setReviewingPhotos(true)}
                style={styles.photoReview}
              >
                <View style={styles.previewStack}>
                  <PhotoPreview file={draft.attachments[0]!} />
                  {draft.attachments.length > 1 ? (
                    <View style={styles.photoCount}>
                      <Text style={styles.photoCountText}>+{draft.attachments.length - 1}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.photoCopy}>
                  <Text style={type.bodyStrong}>
                    {draft.attachments.length} {draft.attachments.length === 1 ? 'screenshot' : 'screenshots'}{' '}
                    selected
                  </Text>
                  <Text style={type.caption}>
                    {receipt ? 'Received; original files not retained' : 'Selected, not uploaded'}
                  </Text>
                  <Text style={[type.caption, { color: colors.coral, marginTop: 6 }]}>
                    Review or remove photos →
                  </Text>
                </View>
              </Pressable>
              <View style={{ alignSelf: 'flex-end' }}>
                <Button
                  compact
                  label="Add more"
                  variant="secondary"
                  block={false}
                  disabled={busy || picking}
                  onPress={() => chooseFiles(true)}
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptyPhotos}>
              <Eyebrow>Add screenshots</Eyebrow>
              <Caption>Choose images that show your profile. You can add multiple screenshots.</Caption>
            </View>
          )}
          <Modal
            visible={reviewingPhotos}
            transparent
            animationType="fade"
            onRequestClose={() => setReviewingPhotos(false)}
          >
            <View
              style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: spacing.lg }}
            >
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: radii.card,
                  padding: spacing.lg,
                  maxHeight: '85%',
                  width: '100%',
                  maxWidth: 600,
                  alignSelf: 'center',
                  gap: spacing.md,
                }}
              >
                <Text style={type.heading}>Selected photos ({draft.attachments?.length ?? 0})</Text>
                <ScrollView>
                  {(draft.attachments ?? []).map((file, index) => (
                    <View key={`${file.name}-${index}`} style={styles.attachment}>
                      <PhotoPreview file={file} />
                      <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Pressable
                        disabled={busy || picking}
                        style={{ minHeight: 44, justifyContent: 'center' }}
                        onPress={() => removeScreenshot(index)}
                        accessibilityLabel={`Remove ${file.name}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                <Button compact label="Done" onPress={() => setReviewingPhotos(false)} />
              </View>
            </View>
          </Modal>
        </UploadField>
      ) : null}

      {rung.input === 'screenshots' && canSkip(rung) ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <LineIcon name="lock" />
          <View style={{ flex: 1 }}>
            <Caption>
              Files are processed and then deleted by the server. You can skip this step and add screenshots
              later.
            </Caption>
          </View>
        </View>
      ) : null}
      {receipt ? <StatusLine>{receipt}</StatusLine> : null}
      {status ? (
        <StatusLine tone="checked">
          {rung.input === 'document_upload' || rung.input === 'screenshots'
            ? `Previous submission: ${status}`
            : status}
        </StatusLine>
      ) : null}
      {rung.input !== 'document_upload' &&
      rung.input !== 'screenshots' &&
      fields.length === 0 &&
      validationError ? (
        <ErrorText>{validationError}</ErrorText>
      ) : null}
      {rung.input !== 'document_upload' && rung.input !== 'screenshots' && failure ? (
        <ErrorText>{failure}</ErrorText>
      ) : null}

      <ScreenActions>
        <Button
          compact
          label={primaryActionLabel(rung, progress, draft)}
          onPress={handlePrimary}
          busy={busy}
          disabled={picking}
        />

        {canSkip(rung) && !receipt ? (
          <Button
            label="Skip for now"
            block={false}
            disabled={busy || picking}
            variant="quiet"
            onPress={() => {
              dispatch({ type: 'SKIP_RUNG', key });
              dispatch({ type: 'NEXT' });
            }}
          />
        ) : null}
      </ScreenActions>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoSummary: { gap: spacing.md },
  photoReview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  photoCopy: { flex: 1, gap: spacing.xxs },
  previewStack: { width: 72, height: 72 },
  photoCount: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoCountText: { ...type.bodyStrong, color: colors.panel, fontSize: 13 },
  emptyPhotos: { gap: spacing.sm },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  remove: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: colors.error },
});

function PhotoPreview({ file }: { file: PickedFile }) {
  const [uri, setUri] = useState(file.uri);
  useEffect(() => {
    if (file.file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(file.file);
      setUri(url);
      return () => URL.revokeObjectURL(url);
    }
    setUri(file.uri);
  }, [file]);
  return uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={file.name}
      style={{ width: 72, height: 72, borderRadius: radii.sm }}
    />
  ) : (
    <View
      style={{
        width: 72,
        height: 72,
        padding: spacing.xs,
        borderRadius: radii.sm,
        backgroundColor: colors.ink,
        justifyContent: 'center',
      }}
    >
      <Text style={[type.caption, { fontSize: 11 }]} numberOfLines={3}>
        {file.name}
      </Text>
    </View>
  );
}
