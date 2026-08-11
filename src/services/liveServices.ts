import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { ApiClient, ApiError, createApiClient } from './api';
import { AppConfig } from './config';
import { CandidateServices } from './candidateServices';
import { createNotificationService } from './push';
import { TokenStore, secureTokenStore } from './tokenStorage';
import {
  WireCorridor,
  WireClaimStart,
  WireClaimVerify,
  WireEscalationStatus,
  WireMessage,
  WireOAuthAuthorize,
  WireOAuthStatus,
  WireSession,
  WireSignupStart,
  WireVerificationClaim,
  endpoints,
  toAuthorizeUrl,
  toClaimStart,
  toClaimVerify,
  toCorridor,
  toEscalationStatuses,
  toMessage,
  toOAuthStatus,
  toSession,
  toSignupStart,
  toVerificationClaim,
} from './contract';

/**
 * The real implementations of every interface in `candidateServices.ts`.
 *
 * Two things this file is careful about. It is the only place that knows an
 * endpoint returns snake case, because every response goes through an adapter
 * in `contract.ts` before it leaves a function here — no screen ever holds a
 * Wire type. And it contains no retry, no token handling and no 401 branch:
 * that all lives once in `api.ts`, which is what these services are built on.
 *
 * The `session` parameter on these methods is the screen stating that it
 * expects to be signed in. The token itself comes from the store inside the
 * client, so a screen can never pass the wrong one, or a stale one.
 */

/** A verifier that has not answered yet is a 404, not an error worth surfacing. */
async function optional<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') return undefined;
    throw error;
  }
}

export interface LiveServiceDeps {
  config: AppConfig;
  tokens?: TokenStore;
  fetchImpl?: typeof fetch;
  /** Called when a refresh fails and the session is genuinely gone. */
  onSessionLost?: () => void;
}

export function createLiveCandidateServices(deps: LiveServiceDeps): CandidateServices & {
  api: ApiClient;
} {
  const api = createApiClient({
    host: deps.config.apiHost,
    tokens: deps.tokens ?? secureTokenStore,
    fetchImpl: deps.fetchImpl,
    onSessionLost: deps.onSessionLost,
  });

  return {
    api,

    corridor: {
      async load(corridorKey) {
        const wire = await api.send<WireCorridor>({
          path: endpoints.corridor(corridorKey),
          auth: false, // the ladder is shown before anyone signs in
        });
        return toCorridor(wire);
      },
    },

    signup: {
      async start(email) {
        const wire = await api.send<WireSignupStart>({
          path: endpoints.signupStart,
          method: 'POST',
          body: { email },
          auth: false,
        });
        return toSignupStart(wire);
      },

      async verify(email, code) {
        const wire = await api.send<WireSession>({
          path: endpoints.signupVerify,
          method: 'POST',
          body: { email, code },
          auth: false,
        });
        const session = toSession(wire);
        // Stored the moment it exists, exactly as on the claim path, so the
        // next request is authenticated without a screen handling a token.
        await api.adopt({
          access: session.access,
          refresh: session.refresh,
          personId: session.personId,
        });
        return session;
      },
    },

    claim: {
      async start(token) {
        const wire = await api.send<WireClaimStart>({
          path: endpoints.claimStart,
          method: 'POST',
          body: { token },
          auth: false,
        });
        return toClaimStart(wire);
      },

      async verify(token, code) {
        const wire = await api.send<WireClaimVerify>({
          path: endpoints.claimVerify,
          method: 'POST',
          body: { token, code },
          auth: false,
        });
        return toClaimVerify(wire);
      },

      async confirm(claimToken, person) {
        const wire = await api.send<WireSession>({
          path: endpoints.claimConfirm,
          method: 'POST',
          body: {
            claim_token: claimToken,
            // One name per field on the way out too. The person's identifier is
            // person_id; the client never sends a student_id.
            full_name: person.fullName,
            phone: person.phone,
            city: person.city,
            region: person.region,
            country: person.country,
          },
          auth: false,
        });
        const session = toSession(wire);
        // The session is stored the moment it exists, so the very next request
        // is authenticated without a screen passing a token anywhere.
        await api.adopt({
          access: session.access,
          refresh: session.refresh,
          personId: session.personId,
        });
        return session;
      },
    },

    verifier: {
      async submit(_session, submission) {
        const wire = await api.send<WireVerificationClaim>({
          path: endpoints.rungSubmit,
          method: 'POST',
          body: {
            corridor_key: submission.corridorKey,
            rung_key: submission.rungKey,
            value: submission.value ?? null,
            jurisdiction: submission.jurisdiction ?? null,
          },
        });
        return toVerificationClaim(wire);
      },

      async status(_session, rungKey) {
        const wire = await optional(
          api.send<WireVerificationClaim | null>({ path: endpoints.rungStatus(rungKey) }),
        );
        // Null is the backend saying "still working". Only a real row adapts.
        return wire ? toVerificationClaim(wire) : undefined;
      },
    },

    oauth: {
      async authorizeUrl(_session, rungKey) {
        const wire = await api.send<WireOAuthAuthorize>({
          path: endpoints.oauthAuthorize(rungKey),
          method: 'POST',
        });
        return toAuthorizeUrl(wire);
      },

      async launch(url) {
        // openAuthSessionAsync, not openBrowserAsync: it returns when the
        // provider redirects back to our scheme, and it keeps the session
        // cookie out of the app. The result is deliberately ignored — the
        // server owns the outcome and the poll below is what reads it, so a
        // person who dismisses the sheet is not treated as a failure.
        await WebBrowser.openAuthSessionAsync(url, deps.config.oauthRedirect);
      },

      async poll(_session, rungKey) {
        const wire = await api.send<WireOAuthStatus>({ path: endpoints.oauthStatus(rungKey) });
        return toOAuthStatus(wire);
      },
    },

    document: {
      async pick() {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          copyToCacheDirectory: true,
          multiple: false,
        });
        const asset = result.canceled ? undefined : result.assets[0];
        if (!asset) throw new ApiError('bad_code', 0, 'No file chosen.');
        return { name: asset.name, uri: asset.uri, mimeType: asset.mimeType };
      },

      async upload(_session, rungKey, file) {
        if (!file.uri) throw new ApiError('bad_code', 0, 'That file could not be read.');
        const form = new FormData();
        // React Native's FormData takes a {uri, name, type} descriptor rather
        // than a Blob. The cast is the platform difference, not a type hole.
        form.append('file', {
          uri: file.uri,
          name: file.name,
          type: 'application/octet-stream',
        } as unknown as Blob);
        await api.send<void>({
          path: endpoints.rungDocument(rungKey),
          method: 'POST',
          form,
        });
      },
    },

    /**
     * Still a stub, on purpose. Nothing in this app may say Kormic confirmed a
     * real human is behind a credential, and it stays `unavailable` until an
     * external liveness provider is wired. This is the injection point for it.
     */
    identity: {
      async startCheck() {
        return 'unavailable';
      },
    },

    chat: {
      async history() {
        const wire = await api.send<WireMessage[]>({ path: endpoints.chatHistory });
        return wire.map(toMessage);
      },

      async send(_session, text) {
        const wire = await api.send<WireMessage>({
          path: endpoints.chatSend,
          method: 'POST',
          body: { content: text },
        });
        return toMessage(wire);
      },

      async escalationStatuses(_session, queryIds) {
        if (queryIds.length === 0) return [];
        const wire = await api.send<WireEscalationStatus[]>({
          path: endpoints.escalationStatuses,
          method: 'POST',
          body: { query_ids: queryIds },
        });
        return toEscalationStatuses(wire);
      },

      async rename(_session, name) {
        await api.send<void>({
          path: endpoints.chatRename,
          method: 'POST',
          body: { name },
        });
      },
    },

    notifications: createNotificationService(api),

    buildAgent: {
      stages: ['Reading your profile', 'Checking what you gave us', 'Putting it together'],
    },
  };
}
