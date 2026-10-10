import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { RungScreen } from '../src/screens/RungScreen';
import { DateField } from '../src/ui';
import { displayDate, inputDate } from '../src/ui/dateModel';
import { selectionProblem } from '../src/services/fileSelection';
import { mockCandidateServices, sampleCorridor } from '../src/services/candidateServices';
import { initialCandidateState, dateOfBirthProblem } from '../src/models/onboarding';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

describe('approved onboarding interactions', () => {
  let tree: ReturnType<typeof create>;
  afterEach(async () => {
    if (tree) await act(async () => tree.unmount());
  });
  const cv = sampleCorridor.rungs.find((r) => r.input === 'document_upload')!;
  async function mount(pick: jest.Mock, upload = jest.fn().mockRejectedValue(new Error('offline'))) {
    const dispatch = jest.fn();
    const submit = jest.fn();
    await act(async () => {
      tree = create(
        <RungScreen
          state={{ ...initialCandidateState, corridor: sampleCorridor, route: `rung:${cv.key}` }}
          dispatch={dispatch}
          services={{
            ...mockCandidateServices,
            document: { ...mockCandidateServices.document, pick, upload },
            verifier: { ...mockCandidateServices.verifier, submit },
          }}
        />,
      );
    });
    return { dispatch, submit, upload };
  }
  async function press(label: string) {
    await act(async () => tree.root.findByProps({ label }).props.onPress());
  }
  it('opening and cancelling the chooser does not show missing-file errors', async () => {
    await mount(jest.fn().mockResolvedValue(undefined));
    await press('Choose file');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Choose a PDF or Word document to continue.');
    await press('Continue');
    expect(JSON.stringify(tree.toJSON())).toContain('Choose a PDF or Word document to continue.');
  });
  it('keeps the valid selection on cancelled or invalid replacement, and retains it after failed upload', async () => {
    const pick = jest
      .fn()
      .mockResolvedValueOnce({ name: 'resume.pdf', mimeType: 'application/pdf', size: 100 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ name: 'bad.exe', size: 100 });
    const { submit, dispatch, upload } = await mount(pick);
    await press('Choose file');
    await press('Replace file');
    await press('Replace file');
    expect(JSON.stringify(tree.toJSON())).toContain('resume.pdf');
    await press('Continue');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'NEXT' });
    expect(JSON.stringify(tree.toJSON())).toContain('That did not save.');
    expect(JSON.stringify(tree.toJSON())).toContain('resume.pdf');
    await press('Remove');
    expect(JSON.stringify(tree.toJSON())).not.toContain('resume.pdf');
  });
  it.each([0, 2, undefined])(
    'shows the actual upload outcome (%s) before advancing, without uploading twice',
    async (facts) => {
      const { submit, upload, dispatch } = await mount(
        jest.fn().mockResolvedValue({ name: 'cv.pdf', size: 20 }),
        jest.fn().mockResolvedValue({ facts }),
      );
      submit.mockResolvedValue({
        rungKey: cv.key,
        factType: 'cv',
        factValue: '',
        method: 'self_attested',
        checkedAt: '2026-10-10',
        status: 'active',
      });
      await press('Choose file');
      await press('Continue');
      const text = JSON.stringify(tree.toJSON());
      expect(text).toContain(
        facts === 0
          ? 'no information was extracted'
          : facts === undefined
            ? 'did not report an extraction outcome'
            : 'This is not verification',
      );
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'NEXT' });
      await press('Continue');
      expect(dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledTimes(1);
    },
  );
  it('invalidates a previous valid date while retaining partial manual input', async () => {
    let current = '';
    function Harness() {
      const [value, setValue] = useState('1990-01-01');
      current = value;
      return <DateField value={value} onChange={setValue} />;
    }
    await act(async () => {
      tree = create(<Harness />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe('01-01-1990');
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('02-'));
    expect(tree.root.findByType(TextInput).props.value).toBe('02-');
    expect(dateOfBirthProblem(current)).toBeTruthy();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('02-29-2000'));
    expect(current).toBe('2000-02-29');
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('1990-01-01'));
    expect(dateOfBirthProblem(current)).toBeTruthy();
  });
  it('converts real dates without timezone shifts and rejects impossible dates', () => {
    expect(inputDate('02-29-2000')).toBe('2000-02-29');
    expect(displayDate('2000-02-29')).toBe('02-29-2000');
    expect(inputDate('02-29-2001')).toBeUndefined();
    expect(inputDate('13-01-1990')).toBeUndefined();
    expect(inputDate('04-31-1990')).toBeUndefined();
  });
  it('validates file type and empty files without imposing an unapproved size cap', () => {
    expect(selectionProblem({ name: 'cv.pdf', mimeType: 'application/pdf', size: 0 }, false)).toContain(
      'empty',
    );
    expect(selectionProblem({ name: 'cv.pdf', mimeType: 'text/html' }, false)).toBeTruthy();
    expect(selectionProblem({ name: 'cv.docx', size: 999999999 }, false)).toBeUndefined();
    expect(selectionProblem({ name: 'photo.heic', mimeType: 'image/heic' }, true)).toBeUndefined();
    expect(selectionProblem({ name: 'photo.png', mimeType: 'application/pdf' }, true)).toBeTruthy();
  });
});
