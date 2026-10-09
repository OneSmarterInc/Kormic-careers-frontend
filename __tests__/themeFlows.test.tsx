import React, { useReducer } from 'react';
import { candidateReducer } from '../src/state/candidateReducer';
import { Platform, Text, TextInput } from 'react-native';
import { EntryScreen, BasicInfoScreen } from '../src/screens/EntryScreens';
import { ChatScreen } from '../src/screens/ChatScreen';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { Button } from '../src/ui';
import { initialCandidateState } from '../src/models/onboarding';
import { mockCandidateServices } from '../src/services/candidateServices';

// react-test-renderer ships no types in this repository.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

describe('theme interaction regressions', () => {
  let tree: ReturnType<typeof create>;
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
  it('opens invitation entry without starting authentication', async () => {
    const start = jest.fn();
    function EntryHarness() {
      const [state, dispatch] = useReducer(candidateReducer, initialCandidateState);
      return <EntryScreen state={state} dispatch={dispatch} services={{ ...mockCandidateServices, claim: { ...mockCandidateServices.claim, start } }} />;
    }
    await act(async () => { tree = create(<EntryHarness />); });
    await act(async () => tree.root.findByProps({ label: 'Have an invitation?' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: 'Invitation code' })).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });
  it('locks the verified email and leaves fresh consent unchecked', async () => {
    await act(async () => { tree = create(<BasicInfoScreen state={initialCandidateState} dispatch={jest.fn()} services={mockCandidateServices} />); });
    const email = tree.root.findAllByType(TextInput).find((n: {props: {accessibilityLabel?: string}}) => n.props.accessibilityLabel === 'Email');
    expect(email.props.editable).toBe(false);
    const checkbox = tree.root.findAllByProps({ accessibilityRole: 'checkbox' })[0];
    expect(checkbox.props.accessibilityState.checked).toBe(false);
  });
  it('saves revisited invitation details without redeeming the invitation again', async () => {
    const confirm = jest.fn();
    const person = { ...initialCandidateState.person, fullName: 'Test Person', email: 'test@example.com', phone: '123', country: 'US', dateOfBirth: '1990-01-01', screeningConsent: true };
    const save = jest.fn().mockResolvedValue({ person, claims: [] });
    const state = { ...initialCandidateState, person, authSession: { personId: 'p1' }, claim: { token: 'invitation', maskedEmail: 't***@example.com', verified: true, claimToken: 'spent-token' } };
    await act(async () => { tree = create(<BasicInfoScreen state={state} dispatch={jest.fn()} services={{ ...mockCandidateServices, claim: { ...mockCandidateServices.claim, confirm }, person: { ...mockCandidateServices.person, save } }} />); });
    await act(async () => tree.root.findByProps({ label: 'Continue' }).props.onPress());
    expect(confirm).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });
  it('retries failed chat history through the existing service', async () => {
    const history = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    await act(async () => { tree = create(<ChatScreen state={initialCandidateState} services={{ ...mockCandidateServices, chat: { ...mockCandidateServices.chat, history } }} />); });
    const retry = tree.root.findAllByType(Button).find((n: {props: {label: string}}) => n.props.label === 'Retry loading');
    expect(retry).toBeTruthy();
    await act(async () => retry.props.onPress());
    expect(history).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(Text).some((n: {props: {children: unknown}}) => n.props.children === 'What would you like to know about this position?')).toBe(true);
  });
  it('sends Enter once while preserving Shift+Enter and composition input', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    const send = jest.fn().mockResolvedValue({ id: 'reply', role: 'assistant', text: 'Reply', sentAt: '' });
    try {
      await act(async () => { tree = create(<ChatScreen state={initialCandidateState} services={{ ...mockCandidateServices, chat: { ...mockCandidateServices.chat, history: async () => [], send } }} />); });
      await act(async () => tree.root.findByType(TextInput).props.onChangeText('Question'));
      const handler = tree.root.findByType(TextInput).props.onKeyPress;
      const preventDefault = jest.fn();
      await act(async () => {
        handler({ nativeEvent: { key: 'Enter', shiftKey: true }, preventDefault });
        handler({ nativeEvent: { key: 'Enter', isComposing: true }, preventDefault });
      });
      expect(send).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
      await act(async () => {
        handler({ nativeEvent: { key: 'Enter' }, preventDefault });
        handler({ nativeEvent: { key: 'Enter' }, preventDefault });
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(undefined, 'Question');
    } finally { platform.restore(); }
  });
  it('keeps a failed Navigator rename visible and preserves the draft', async () => {
    const rename = jest.fn().mockRejectedValue(new Error('offline'));
    await act(async () => { tree = create(<ProfileScreen state={initialCandidateState} dispatch={jest.fn()} services={{ ...mockCandidateServices, chat: { ...mockCandidateServices.chat, rename } }} />); });
    const input = tree.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('Guide'));
    const save = tree.root.findAllByProps({ accessibilityRole: 'button' }).find((n: {props: {onPress?: () => void; disabled?: boolean}; findAllByType: (type: unknown) => {props: {children: unknown}}[]}) => n.findAllByType(Text).some(t => t.props.children === 'Save'));
    await act(async () => save.props.onPress());
    expect(rename).toHaveBeenCalled();
    expect(tree.root.findByType(TextInput).props.value).toBe('Guide');
    expect(JSON.stringify(tree.toJSON())).toContain('The name could not be saved');
  });
});
