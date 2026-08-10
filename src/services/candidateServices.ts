import { CorridorConfig, VerificationClaim } from '../models/corridor';
import { AuthSession, Person } from '../models/onboarding';
import { EscalationStatus, Message, parseMessage } from '../screens/chatModel';

/**
 * Screens never import a verifier. Everything crossing the network is an
 * interface here, so the whole ladder runs against mocks before a single real
 * verifier exists.
 */

export interface CorridorService {
  /** Fetched at start. The ladder does not exist until this returns. */
  load(corridorKey: string): Promise<CorridorConfig>;
}

export interface ClaimService {
  /** Returns a masked address only. Possession of the link reveals nothing else. */
  start(token: string): Promise<{ maskedEmail: string }>;
  verify(
    token: string,
    code: string,
  ): Promise<{ claimToken: string; pinnedEmail: string; prefill: Partial<Person> }>;
  confirm(claimToken: string, person: Person): Promise<AuthSession>;
}

export interface RungSubmission {
  /**
   * Which corridor this claim is being written against. A rung key is only
   * unique within a corridor, so the submission has to name one — the server
   * cannot infer it from `rungKey` alone.
   */
  corridorKey: string;
  rungKey: string;
  value?: string;
  jurisdiction?: string;
  documentUri?: string;
}

export interface VerifierService {
  /**
   * Hands a submission to whichever helper bot the corridor named. Returns the
   * claim as recorded, which may be self_attested if no bot services the rung.
   */
  submit(session: AuthSession | undefined, submission: RungSubmission): Promise<VerificationClaim>;
  /** Polls a rung whose check is still running. */
  status(session: AuthSession | undefined, rungKey: string): Promise<VerificationClaim | undefined>;
}

export interface OAuthService {
  /** Server-driven: client asks for a url, launches it, polls. Never sees a token. */
  authorizeUrl(session: AuthSession | undefined, rungKey: string): Promise<string>;
  /**
   * Opens the URL the server named and resolves when the browser closes. The
   * launch lives behind this interface for the same reason a verifier does: no
   * screen imports a platform module, and the whole rung is testable without one.
   */
  launch(url: string): Promise<void>;
  poll(session: AuthSession | undefined, rungKey: string): Promise<'pending' | 'connected' | 'error'>;
}

export interface DocumentService {
  pick(): Promise<{ name: string; uri?: string; mimeType?: string }>;
  upload(session: AuthSession | undefined, rungKey: string, file: { name: string; uri?: string }): Promise<void>;
}

/** Kept as the injection point for the external provider. Not built here. */
export interface IdentityService {
  startCheck(): Promise<'success' | 'retry' | 'unavailable'>;
}

export interface ChatService {
  /**
   * Server owns the thread. The client loads history and sends only the message.
   * Domain `Message`, not a wire row: the adaptation happens in the service so
   * the screen never sees a shape the backend chose.
   */
  history(session: AuthSession | undefined): Promise<Message[]>;
  send(session: AuthSession | undefined, text: string): Promise<Message>;
  /** Current status for open escalations, so a pending bubble can flip on its own. */
  escalationStatuses(
    session: AuthSession | undefined,
    queryIds: string[],
  ): Promise<{ queryId: string; status: EscalationStatus }[]>;
  /** The person may rename their Navigator. That is the ownership cue. */
  rename(session: AuthSession | undefined, name: string): Promise<void>;
}

export interface BuildAgentService {
  stages: string[];
}

/**
 * Push registration sits behind an interface for the same reason every verifier
 * does: no screen imports expo-notifications, and the whole ladder still runs
 * on a device that refused the permission.
 */
export interface NotificationService {
  /**
   * Registers this device against the signed-in person. Its real job is the
   * escalation answer that lands while the app is closed.
   */
  register(session: AuthSession | undefined): Promise<void>;
  /** Best effort. A device that cannot be unregistered is not an error worth showing. */
  unregister(session: AuthSession | undefined): Promise<void>;
}

export interface CandidateServices {
  corridor: CorridorService;
  claim: ClaimService;
  verifier: VerifierService;
  oauth: OAuthService;
  document: DocumentService;
  identity: IdentityService;
  chat: ChatService;
  notifications: NotificationService;
  buildAgent: BuildAgentService;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll counters, so the mocks can answer on a later attempt rather than instantly. */
const mockStatusPolls = new Map<string, number>();
const mockOAuthPolls = new Map<string, number>();
const mockEscalationPolls = new Map<string, number>();

/** A corridor with no discipline hard-coded. Swap the fixture, get another ladder. */
export const sampleCorridor: CorridorConfig = {
  key: 'sample',
  displayName: 'Sample corridor',
  rungs: [
    { key: 'licence', displayName: 'Licence', requirement: 'required', input: 'identifier_with_jurisdiction', verifier: 'licence_bot', order: 1 },
    { key: 'certification', displayName: 'Certification', requirement: 'required', input: 'identifier', verifier: 'cert_bot', order: 2 },
    { key: 'registry', displayName: 'Registry number', requirement: 'optional', input: 'identifier', verifier: 'registry_bot', order: 3 },
    { key: 'github', displayName: 'GitHub', requirement: 'not_applicable', input: 'oauth', order: 4 },
    { key: 'cv', displayName: 'CV', requirement: 'required', input: 'document_upload', order: 5 },
    { key: 'linkedin', displayName: 'LinkedIn', requirement: 'optional', input: 'screenshots', order: 6 },
  ],
};

export const mockCandidateServices: CandidateServices = {
  corridor: {
    async load() {
      await wait(200);
      return sampleCorridor;
    },
  },
  claim: {
    async start() {
      await wait(200);
      return { maskedEmail: 'p•••@•••.com' };
    },
    async verify(_token, code) {
      await wait(200);
      if (code !== '123456') throw new Error('That code did not match.');
      return {
        claimToken: 'mock-claim-token',
        pinnedEmail: 'person@example.com',
        prefill: { fullName: 'Sample Person', country: 'United States' },
      };
    },
    async confirm() {
      await wait(200);
      return { access: 'mock-access', personId: 'person_1' };
    },
  },
  verifier: {
    async submit(_session, submission) {
      await wait(300);
      return {
        rungKey: submission.rungKey,
        factType: submission.rungKey,
        factValue: submission.value ?? '',
        method: 'self_attested',
        status: 'active',
        checkedAt: new Date().toISOString(),
      };
    },
    // Answers on the third poll, so the checking-to-confirmed path is walkable
    // on mocks. A real authority lookup can take days and returns undefined for
    // as long as it is still working.
    async status(_session, rungKey) {
      await wait(200);
      const seen = (mockStatusPolls.get(rungKey) ?? 0) + 1;
      mockStatusPolls.set(rungKey, seen);
      if (seen < 3) return undefined;
      return {
        rungKey,
        factType: rungKey,
        factValue: '',
        method: 'primary_source',
        status: 'active',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  oauth: {
    async authorizeUrl() {
      await wait(200);
      return 'https://example.invalid/authorize';
    },
    async launch() {
      // No browser on mocks. The poll below is what the screen is waiting on.
      await wait(200);
    },
    // Connects on the third poll for the same reason.
    async poll(_session, rungKey) {
      await wait(200);
      const seen = (mockOAuthPolls.get(rungKey) ?? 0) + 1;
      mockOAuthPolls.set(rungKey, seen);
      return seen < 3 ? 'pending' : 'connected';
    },
  },
  document: {
    async pick() {
      return { name: 'cv.pdf', mimeType: 'application/pdf' };
    },
    async upload() {
      await wait(200);
    },
  },
  identity: {
    async startCheck() {
      return 'unavailable';
    },
  },
  chat: {
    async history() {
      await wait(200);
      return [
        parseMessage({
          id: 1,
          role: 'assistant',
          content: 'Ask me anything about this position.',
          created_at: '2026-08-07T09:00:00Z',
        }),
      ];
    },
    async send(_session, text) {
      await wait(300);
      return parseMessage({
        id: Date.now(),
        role: 'assistant',
        content: `I do not have that from the practice yet: ${text}`,
        created_at: new Date().toISOString(),
        meta: { pending: true, query_id: `q_${Date.now()}` },
      });
    },
    // The practice answers on the second poll, so a pending bubble is seen to
    // flip on its own without a new message arriving.
    async escalationStatuses(_session, queryIds) {
      await wait(200);
      return queryIds
        .filter((queryId) => {
          const seen = (mockEscalationPolls.get(queryId) ?? 0) + 1;
          mockEscalationPolls.set(queryId, seen);
          return seen >= 2;
        })
        .map((queryId) => ({ queryId, status: 'answered' as const }));
    },
    async rename() {
      await wait(100);
    },
  },
  notifications: {
    async register() {
      // The mock registers nothing. A device without a token still gets every
      // answer through the in-app poll.
    },
    async unregister() {
      /* no-op */
    },
  },
  buildAgent: {
    stages: ['Reading your profile', 'Checking what you gave us', 'Putting it together'],
  },
};
