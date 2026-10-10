import { ApiError, createApiClient, requestFailure } from '../src/services/api';
import { memoryTokenStore } from '../src/services/tokenStorage';
import { personLimitErrors } from '../src/services/validation';
import { initialCandidateState } from '../src/models/onboarding';
import { readConfig } from '../src/services/config';

it('preserves DRF field and indexed list errors', async () => {
  const api = createApiClient({
    host: 'http://localhost:8900',
    tokens: memoryTokenStore(),
    fetchImpl: (async () => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ phone: ['Too long.'], previous_names: { 0: ['Use 255 characters or fewer.'] } }),
    })) as unknown as typeof fetch,
  });
  try {
    await api.send({ path: '/api/me/' });
    throw new Error('Expected refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual({
      phone: 'Too long.',
      previous_names: 'Use 255 characters or fewer.',
    });
    expect(requestFailure(error, 'Save failed')).toContain('highlighted fields');
  }
});
it('validates loaded drafts and previous names against backend limits', () => {
  expect(
    personLimitErrors({
      ...initialCandidateState.person,
      phone: '1'.repeat(65),
      previousNames: Array(11).fill('Name'),
    }),
  ).toEqual({
    phone: 'Use no more than 64 characters.',
    previous_names: 'Enter no more than 10 previous names.',
  });
  expect(
    personLimitErrors({
      ...initialCandidateState.person,
      phone: '1'.repeat(64),
      previousNames: ['N'.repeat(255)],
    }),
  ).toEqual({});
});
it('distinguishes file size and type refusals from network failures', () => {
  expect(requestFailure(new ApiError('bad_code', 413, ''), '')).toContain('smaller file');
  expect(requestFailure(new ApiError('bad_code', 415, ''), '')).toContain('file format');
});
it.each(['localhost:8900', 'http://localhost:8900/api', 'https://example.com?token=secret'])(
  'rejects malformed API origins: %s',
  (apiHost) => {
    expect(() => readConfig({ apiHost })).toThrow('server origin');
  },
);
it('accepts explicit LAN or production API origins without enabling mocks', () => {
  expect(readConfig({ apiHost: 'http://192.168.1.20:8900' }).useMocks).toBe(false);
  expect(readConfig({ apiHost: 'https://api.example.com/' }).apiHost).toBe('https://api.example.com');
});
