import { CandidateServices, mockCandidateServices } from './candidateServices';
import { appConfig } from './config';
import { createLiveCandidateServices } from './liveServices';

/**
 * The swap the brief describes, and the only place it happens. A screen never
 * learns which of these it got, which is the whole reason the services are an
 * interface rather than a module of functions.
 *
 * This throws on a misconfigured build rather than quietly falling back to the
 * mocks. A candidate shown fixture data by an app that believes it is live is
 * worse than an app that refuses to start.
 */
export interface ResolvedServices {
  services: CandidateServices;
  corridorKey: string;
  usingMocks: boolean;
  /**
   * The shell registers what to do when a refresh has failed and the session is
   * genuinely gone. The client cannot navigate, so it reports and the shell
   * decides — which keeps routing out of the transport layer.
   */
  registerSessionLost(handler: () => void): void;
}

export function resolveCandidateServices(): ResolvedServices {
  const config = appConfig();

  let handler: (() => void) | undefined;
  const registerSessionLost = (next: () => void) => {
    handler = next;
  };

  if (config.useMocks) {
    return {
      services: mockCandidateServices,
      corridorKey: config.corridorKey,
      usingMocks: true,
      registerSessionLost,
    };
  }

  return {
    services: createLiveCandidateServices({
      config,
      onSessionLost: () => handler?.(),
    }),
    corridorKey: config.corridorKey,
    usingMocks: false,
    registerSessionLost,
  };
}
