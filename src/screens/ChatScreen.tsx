import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../ui';
import { CandidateState } from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { colors, layout, radii, spacing, type } from '../theme/tokens';
import { Message, escalationLine, mergeEscalations, openQueryIds } from './chatModel';

interface Props {
  state: CandidateState;
  services: CandidateServices;
  /** Polling interval for open escalations. Injected so tests are not timing-bound. */
  pollMs?: number;
  /** Told to the push handler, so a reply read here does not also raise a banner. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function ChatScreen({ state, services, pollMs = 15000, onVisibilityChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyFailed, setHistoryFailed] = useState(false);
  const nearBottom = useRef(true);
  const sendLock = useRef(false);
  const scroller = useRef<ScrollView | null>(null);

  // The push handler suppresses a banner while this screen is in front, because
  // the bubble the person is looking at has already flipped.
  useEffect(() => {
    onVisibilityChange?.(true);
    return () => onVisibilityChange?.(false);
  }, [onVisibilityChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHistoryFailed(false);
    services.chat
      .history(state.authSession)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded);
      })
      .catch(() => {
        if (!cancelled) setHistoryFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services, state.authSession, historyAttempt]);

  const refreshEscalations = useCallback(async () => {
    const open = openQueryIds(messages);
    if (open.length === 0) return;
    try {
      const updates = await services.chat.escalationStatuses(state.authSession, open);
      setMessages((current) => mergeEscalations(current, updates));
    } catch {
      // A failed poll is not worth telling the person about; the next one runs.
    }
  }, [messages, services, state.authSession]);

  // Only poll while the app is in front. Answers that arrive while it is closed
  // come through the push notification instead.
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refreshEscalations();
    }, pollMs);
    return () => clearInterval(timer);
  }, [refreshEscalations, pollMs]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sendLock.current) return;
    sendLock.current = true;
    nearBottom.current = true;
    setSending(true);
    setFailure(undefined);
    const optimistic: Message = {
      id: `local_${Date.now()}`,
      role: 'person',
      text,
      sentAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    try {
      const reply = await services.chat.send(state.authSession, text);
      // The reply carries pending and query_id, and both are kept. This is the
      // line the student app leaves out.
      setMessages((current) => [...current, reply]);
    } catch {
      setFailure('That did not send. Try again.');
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(text);
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.heading}><Text accessibilityRole="header" style={type.heading}>{state.agentName || 'Your Navigator'}</Text><Text style={type.caption}>Questions about this position</Text></View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        ref={scroller}
        style={{ flex: 1, minHeight: 0 }}
        scrollEventThrottle={100}
        onScroll={({ nativeEvent: e }) => { nearBottom.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 80; }}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => { if (nearBottom.current) scroller.current?.scrollToEnd({ animated: true }); }}
      >
        {loading ? <ActivityIndicator color={colors.coral} /> : null}
        {historyFailed ? <View><Text style={styles.error}>We could not load this conversation.</Text><Button label="Retry loading" variant="secondary" onPress={() => setHistoryAttempt(n => n + 1)} /></View> : null}
        {!loading && !historyFailed && messages.length === 0 ? <Text style={type.body}>What would you like to know about this position?</Text> : null}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.role === 'person' ? styles.person : styles.navigator]}
          >
            <Text style={[type.body, message.role === 'person' && { color: colors.onPrimary }]}>{message.text}</Text>
            {message.escalation ? (
              <Text
                style={[
                  styles.escalation,
                  message.escalation.status === 'answered' && styles.answered,
                ]}
              >
                {escalationLine(message.escalation)}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {failure ? <Text style={styles.error}>{failure}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about the position"
          placeholderTextColor={colors.muted}
          multiline
          onKeyPress={Platform.OS === 'web' ? (event) => {
            const key = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
            if (key.key === 'Enter' && !key.shiftKey && !key.isComposing && key.keyCode !== 229) {
              event.preventDefault();
              void handleSend();
            }
          } : undefined}
          accessibilityLabel="Message"
        />
        <Pressable onPress={handleSend} disabled={sending || !draft.trim()} accessibilityRole="button">
          <Text style={[styles.send, (sending || !draft.trim()) && styles.sendDisabled]}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heading: { width: '100%', alignSelf: 'center', padding: spacing.lg, gap: spacing.xs },
  screen: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: colors.ink },
  thread: {
    padding: layout.gutter,
    gap: spacing.sm,
    width: '100%',
    alignSelf: 'center',
  },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radii.card, maxWidth: '86%', gap: spacing.xs },
  person: {
    alignSelf: 'flex-end',
    backgroundColor: colors.coral,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderBottomRightRadius: radii.sm,
  },
  navigator: {
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: radii.sm,
  },
  escalation: { ...type.caption, color: colors.coral },
  answered: { color: colors.trustBlue },
  error: { ...type.caption, color: colors.error, paddingHorizontal: spacing.lg, textAlign: 'center' },
  composer: {
    flexShrink: 0,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radii.input,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
  },
  send: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.coral, padding: spacing.sm },
  sendDisabled: { color: colors.muted },
});
