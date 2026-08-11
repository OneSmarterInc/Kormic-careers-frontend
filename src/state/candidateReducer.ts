import { CorridorConfig, VerificationClaim } from '../models/corridor';
import {
  AuthSession,
  CandidateState,
  ClaimSession,
  EntryMode,
  Person,
  Route,
  RungProgress,
  initialCandidateState,
  isEmailEditable,
} from '../models/onboarding';
import { getNextRoute, getPreviousRoute } from '../navigation/routes';

export type CandidateAction =
  | { type: 'NAVIGATE'; route: Route }
  | { type: 'BACK' }
  | { type: 'NEXT' }
  | { type: 'SET_CORRIDOR'; corridor: CorridorConfig }
  | { type: 'SET_CORRIDOR_ERROR'; message: string }
  | { type: 'SET_ENTRY_MODE'; mode: EntryMode }
  | { type: 'SET_CLAIM'; claim: ClaimSession }
  | { type: 'CLAIM_VERIFIED'; pinnedEmail: string; prefill: Partial<Person>; claimToken?: string }
  | { type: 'SET_AUTH_SESSION'; session: AuthSession }
  | { type: 'UPDATE_PERSON'; field: keyof Person; value: string }
  | { type: 'SUBMIT_RUNG'; key: string; value?: string; jurisdiction?: string }
  | { type: 'SET_RUNG_STATE'; key: string; state: RungProgress['state']; error?: string }
  | { type: 'SKIP_RUNG'; key: string }
  | { type: 'RECORD_CLAIM'; claim: VerificationClaim }
  | { type: 'SET_BUILD_STAGE'; stage: number }
  | { type: 'LOGOUT' };

function withRung(
  state: CandidateState,
  key: string,
  patch: Partial<RungProgress>,
): CandidateState {
  const existing = state.rungs[key] ?? { state: 'unsubmitted' as const };
  return { ...state, rungs: { ...state.rungs, [key]: { ...existing, ...patch } } };
}

export function candidateReducer(
  state: CandidateState = initialCandidateState,
  action: CandidateAction,
): CandidateState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, route: action.route };
    case 'BACK': {
      const previous = getPreviousRoute(state);
      return previous ? { ...state, route: previous } : state;
    }
    case 'NEXT': {
      const next = getNextRoute(state);
      return next ? { ...state, route: next } : state;
    }
    case 'SET_CORRIDOR':
      return { ...state, corridor: action.corridor, corridorError: undefined };
    case 'SET_CORRIDOR_ERROR':
      return { ...state, corridorError: action.message };
    case 'SET_ENTRY_MODE':
      return { ...state, entryMode: action.mode };
    case 'SET_CLAIM':
      return { ...state, claim: action.claim };
    case 'CLAIM_VERIFIED':
      return {
        ...state,
        claim: state.claim
          ? {
              ...state.claim,
              verified: true,
              pinnedEmail: action.pinnedEmail,
              claimToken: action.claimToken,
            }
          : undefined,
        person: { ...state.person, ...action.prefill, email: action.pinnedEmail },
      };
    case 'SET_AUTH_SESSION':
      return { ...state, authSession: action.session };
    case 'UPDATE_PERSON': {
      // The claim path pins the address to the roster value; the screen hides
      // the field, and the reducer refuses the write regardless.
      if (action.field === 'email' && !isEmailEditable(state)) return state;
      return { ...state, person: { ...state.person, [action.field]: action.value } };
    }
    case 'SUBMIT_RUNG':
      return withRung(state, action.key, {
        state: 'submitted',
        value: action.value,
        jurisdiction: action.jurisdiction,
        error: undefined,
      });
    case 'SET_RUNG_STATE':
      return withRung(state, action.key, { state: action.state, error: action.error });
    case 'SKIP_RUNG':
      return withRung(state, action.key, { state: 'skipped' });
    case 'RECORD_CLAIM':
      return { ...state, claims: [...state.claims, action.claim] };
    case 'SET_BUILD_STAGE':
      return { ...state, buildStage: action.stage };
    case 'LOGOUT':
      return initialCandidateState;
    default:
      return state;
  }
}
