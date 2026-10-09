import { CorridorConfig, VerificationClaim } from '../models/corridor';
import {
  AuthSession,
  NavigationPoint,
  PersonSnapshot,
  CandidateState,
  ClaimSession,
  EntryMode,
  Person,
  Route,
  RungProgress,
  SignupSession,
  initialCandidateState,
  isEmailEditable,
} from '../models/onboarding';
import { getNextRoute, getPreviousRoute } from '../navigation/routes';

export type CandidateAction =
  | { type: 'NAVIGATE'; route: Route }
  | { type: 'RESTORE'; state: CandidateState }
  | { type: 'RESTORE_LOCATION'; point: NavigationPoint; history: NavigationPoint[] }
  | { type: 'SET_TOUR_INDEX'; index: number }
  | { type: 'SET_ENTRY_VIEW'; mode: EntryMode }
  | { type: 'SAVE_RUNG_DRAFT'; key: string; value?: string; jurisdiction?: string }
  | { type: 'BACK' }
  | { type: 'NEXT' }
  | { type: 'SET_CORRIDOR'; corridor: CorridorConfig }
  | { type: 'SET_CORRIDOR_ERROR'; message: string }
  | { type: 'SET_ENTRY_MODE'; mode: EntryMode }
  | { type: 'SET_SIGNUP'; signup: SignupSession }
  | { type: 'SET_CLAIM'; claim: ClaimSession }
  | { type: 'CLAIM_VERIFIED'; pinnedEmail: string; prefill: Partial<Person>; claimToken?: string }
  | { type: 'SET_AUTH_SESSION'; session: AuthSession }
  | { type: 'HYDRATE'; snapshot: PersonSnapshot }
  | { type: 'UPDATE_PERSON'; field: keyof Person; value: string }
  // Separate from UPDATE_PERSON because this one field is a list, and
  // widening that action's `value` to string | string[] would put the
  // burden of checking on every one of its call sites.
  | { type: 'UPDATE_PREVIOUS_NAMES'; names: string[] }
  | { type: 'SET_SCREENING_CONSENT'; agreed: boolean }
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

function visit(state: CandidateState, point: NavigationPoint): CandidateState {
  return { ...state, ...point, history: [...(state.history ?? []), {
    route: state.route, tourIndex: state.tourIndex, entryMode: state.entryMode,
  }].slice(-100) };
}

export function candidateReducer(
  state: CandidateState = initialCandidateState,
  action: CandidateAction,
): CandidateState {
  switch (action.type) {
    case 'RESTORE':
      return { ...action.state, corridor: state.corridor, corridorError: state.corridorError };
    case 'RESTORE_LOCATION':
      return { ...state, ...action.point, history: action.history };
    case 'SET_TOUR_INDEX':
      return visit(state, { route: 'Tour', tourIndex: Math.max(0, action.index), entryMode: state.entryMode });
    case 'SET_ENTRY_VIEW':
      return visit(state, { route: 'Entry', entryMode: action.mode, tourIndex: state.tourIndex });
    case 'SAVE_RUNG_DRAFT':
      return withRung(state, action.key, { value: action.value, jurisdiction: action.jurisdiction });
    case 'NAVIGATE':
      return action.route === state.route ? state : visit(state, { route: action.route, tourIndex: state.tourIndex, entryMode: state.entryMode });
    case 'BACK': {
      if (state.history?.length) {
        const history = state.history.slice(0, -1);
        return { ...state, ...state.history[state.history.length - 1], history };
      }
      const previous = getPreviousRoute(state);
      return previous ? { ...state, route: previous } : state;
    }
    case 'NEXT': {
      const next = getNextRoute(state);
      return next ? visit(state, { route: next, tourIndex: state.tourIndex, entryMode: state.entryMode }) : state;
    }
    case 'SET_CORRIDOR':
      return { ...state, corridor: action.corridor, corridorError: undefined };
    case 'SET_CORRIDOR_ERROR':
      return { ...state, corridorError: action.message };
    case 'SET_ENTRY_MODE':
      return { ...state, entryMode: action.mode };
    case 'SET_SIGNUP':
      // The address the person typed. Editable later, unlike a pinned roster
      // address, because on this path nobody else asserted it.
      return {
        ...state,
        signup: action.signup,
        person: { ...state.person, email: action.signup.email },
      };
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
    case 'HYDRATE': {
      /**
       * What the server knows, dropped into a fresh state.
       *
       * No per-rung progress is derived from the claims. Progress is what the
       * person did in this sitting; the claims are what is true about them,
       * and the profile reads the claim rather than the progress precisely so
       * the two do not have to be kept in step.
       */
      const { person, claims, agentName } = action.snapshot;
      return { ...state, person: { ...state.person, ...person }, claims, agentName };
    }
    case 'UPDATE_PERSON': {
      // The claim path pins the address to the roster value; the screen hides
      // the field, and the reducer refuses the write regardless.
      if (action.field === 'email' && !isEmailEditable(state)) return state;
      return { ...state, person: { ...state.person, [action.field]: action.value } };
    }
    case 'UPDATE_PREVIOUS_NAMES':
      return { ...state, person: { ...state.person, previousNames: action.names } };
    case 'SET_SCREENING_CONSENT':
      return { ...state, person: { ...state.person, screeningConsent: action.agreed } };
    case 'SUBMIT_RUNG':
      return withRung(state, action.key, {
        state: 'submitted',
        pending: true,
        value: action.value,
        jurisdiction: action.jurisdiction,
        error: undefined,
      });
    case 'SET_RUNG_STATE':
      return withRung(state, action.key, { state: action.state, error: action.error, pending: false });
    case 'SKIP_RUNG':
      return withRung(state, action.key, { state: 'skipped' });
    case 'RECORD_CLAIM':
      return { ...withRung(state, action.claim.rungKey, { pending: false }), claims: [...state.claims, action.claim] };
    case 'SET_BUILD_STAGE':
      return { ...state, buildStage: action.stage };
    case 'LOGOUT':
      /**
       * Everything about the person goes; the corridor stays.
       *
       * It is public configuration fetched once at start, not their data, and
       * the fetch does not re-run — so dropping it here left the tour empty
       * and the ladder with no rungs, with nothing to put them back.
       *
       * Return to Welcome so all three entry actions are available after sign-out.
       */
      return {
        ...initialCandidateState,
        corridor: state.corridor,
        route: 'Welcome',
      };
    default:
      return state;
  }
}
