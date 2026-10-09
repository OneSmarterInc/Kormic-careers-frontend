import React from 'react';
import { Text, TextInput } from 'react-native';
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
    await act(async () => { tree = create(<EntryScreen state={initialCandidateState} dispatch={jest.fn()} services={{ ...mockCandidateServices, claim: { ...mockCandidateServices.claim, start } }} />); });
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
  it('retries failed chat history through the existing service', async () => {
    const history = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    await act(async () => { tree = create(<ChatScreen state={initialCandidateState} services={{ ...mockCandidateServices, chat: { ...mockCandidateServices.chat, history } }} />); });
    const retry = tree.root.findAllByType(Button).find((n: {props: {label: string}}) => n.props.label === 'Retry loading');
    expect(retry).toBeTruthy();
    await act(async () => retry.props.onPress());
    expect(history).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(Text).some((n: {props: {children: unknown}}) => n.props.children === 'What would you like to know about this position?')).toBe(true);
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
