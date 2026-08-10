import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CandidateState } from '../models/onboarding';
import { CandidateServices } from '../services/candidateServices';
import { colors, radii, spacing, type } from '../theme/tokens';
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
  const scroller = useRef<ScrollView | null>(null);

  // The push handler suppresses a banner while this screen is in front, because
  // the bubble the person is looking at has already flipped.
  useEffect(() => {
    onVisibilityChange?.(true);
    return () => onVisibilityChange?.(false);
  }, [onVisibilityChange]);

  useEffect(() => {
    let cancelled = false;
    services.chat
      .history(state.authSession)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailure('We could not load this conversation. Pull to try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services, state.authSession]);

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
    if (!text || sending) return;
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
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {loading ? <ActivityIndicator color={colors.coral} /> : null}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.role === 'person' ? styles.person : styles.navigator]}
          >
            <Text style={type.body}>{message.text}</Text>
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
          accessibilityLabel="Message"
        />
        <Pressable onPress={handleSend} disabled={sending || !draft.trim()} accessibilityRole="button">
          <Text style={[styles.send, (sending || !draft.trim()) && styles.sendDisabled]}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  thread: { padding: spacing.lg, gap: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radii.card, maxWidth: '86%', gap: spacing.xs },
  person: { alignSelf: 'flex-end', backgroundColor: colors.panel },
  navigator: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  escalation: { ...type.caption, color: colors.coral },
  answered: { color: colors.trustBlue },
  error: { ...type.caption, color: colors.error, paddingHorizontal: spacing.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
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
