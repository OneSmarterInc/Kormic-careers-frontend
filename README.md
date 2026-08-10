# Kormic Careers — Candidate App

The candidate-side app for Kormic Careers. A person walks a **ladder** of steps —
identity, credentials, documents — and comes out with a profile where every fact
carries its own record of how it was checked and when.

Expo / React Native, running on iOS, Android and web from one codebase.

---

## Quick start

```bash
npm install
npx expo start
```

Then press `w` for the browser, or scan the QR code with **Expo Go** on a phone.

It runs entirely on sample data by default, so you do not need a backend, a login
or a verifier to see the whole thing work. Walk the ladder end to end: welcome,
tour, entry, each credential step, the build, the profile, the chat.

---

## The one rule

**No screen knows the name of any credential.**

Every label, every gate and every step comes from corridor configuration fetched
at start. A nurse, a physician assistant and a physician each get a different
ladder from the same code.

If you find yourself writing `if (rungKey === 'licence')` or building a
licence-shaped screen, stop — the fix is almost always a field on `CorridorRung`
instead. Adding a profession has to be a row in a table, not a release of an app.

To see this for yourself: open `src/services/candidateServices.ts`, edit
`sampleCorridor` — reorder the steps, mark one required, add a new one — and
watch the app rearrange itself without you touching a screen.

---

## How it is put together

State is **one reducer** over a typed `CandidateState`. Three pure functions in
`src/navigation/routes.ts` derive the route order, the gates and the progress
from the corridor. Screens are consumers of state plus dispatch, and nothing
else.

Every screen with logic is **split in two**: a component that renders, and a
model that decides.

| Component | Model |
|---|---|
| `RungScreen` | `rungModel` |
| `ProfileScreen` | `profileModel` |
| `ChatScreen` | `chatModel` |
| `TourScreen` | `tourModel` |
| `AgentScreens` | `agentModel` |
| Entry screens | `claimModel` |

The models are pure, and the tests hit the models. That is why the suite runs
without a renderer. **Keep that split when you add a screen.**

### Layout

```
src/
├── models/        domain types — corridor, onboarding
├── navigation/    route order, gates, progress, screen mapping
├── screens/       components + their pure models
├── services/      everything that crosses the network
├── state/         the reducer
└── theme/         colours, spacing, type
```

---

## The service boundary

Nothing in `src/screens` imports a verifier, an HTTP client or a platform
module. Everything that crosses the network is an interface in
`src/services/candidateServices.ts`, with two implementations behind it:

- **`mockCandidateServices`** — fixtures, no network. The default.
- **`createLiveCandidateServices`** — the real API.

The swap happens in `index.js` and nowhere else, so no screen ever learns which
one it got.

### Pointing it at a real backend

Set `useMocks` to `false` in `app.json`:

```json
"extra": {
  "apiHost": "https://api.kormic.ai",
  "corridorKey": "sample",
  "useMocks": false
}
```

That is the only change needed on the app side. A live build with no `apiHost`
throws at start rather than falling back to fixtures — an app showing sample data
while believing it is live is worse than one that refuses to boot.

### `contract.ts` is the agreement, not a convenience

`src/services/contract.ts` declares every wire shape and gives each exactly one
adapter into a domain type. Snake case on the wire, camel case in the app,
converted in one file — so a backend rename touches that file and nothing else.

Two things in it are load-bearing:

1. **One name per field.** No `access` and `access_token` for the same thing.
2. **Adapters throw at the boundary.** A missing required field fails here rather
   than surfacing as `undefined` three screens later. `toVerificationClaim`
   refuses a claim with no check date, because a method without a date is not a
   claim. That throw is intentional.

When the contract changes, change it there and let the typecheck tell you what
else moves. Do not widen a type to make an error go away.

---

## The honesty rules

These are product decisions, not style preferences.

- **Nothing is ever rolled up into one word.** There is no function anywhere that
  returns a profile-level `verified` boolean, and adding one for convenience
  undoes the model. Each fact carries its own method and check date, and the
  profile header shows counts rather than a badge.
- **`primary_source` means a helper bot confirmed the fact directly against the
  body that issued it.** Everything else is `source_checked` at best. The wording
  in `methodLabels` is the only vocabulary for these states — do not paraphrase
  it in a new screen.
- **Nothing may say Kormic confirmed a real human is behind a credential.** The
  identity service is a stub returning `unavailable` on purpose, and stays that
  way until an external liveness provider is wired.
- **Expiry is computed when a row is read**, never trusted from a stored flag, so
  a licence confirmed in January reads correctly in September with no background
  job having run.

---

## Tests

```bash
npm test          # 74 tests
npm run typecheck # strict + noUncheckedIndexedAccess
npm run lint
```

All three need to stay clean.

Several tests exist to stop a **future** change rather than to check today's
behaviour, and those are the ones not to delete when they get in your way:

- The tour never contains the word "minutes" — we have not measured how long the
  ladder takes and will not guess.
- A wrong invitation code and an unknown invitation produce an identical message
   — telling them apart is how a roster gets enumerated.
- The escalation line names no role or person inside the practice.
- No route in the ladder renders a "not built yet" placeholder.
- Refresh-and-retry fires once for concurrent failures, not once each.

If one of these fails, the right response is almost never to change the test.

---

## Current state

| | |
|---|---|
| Screens | **10 of 10** — no placeholders remain |
| Tests | 74 passing |
| Typecheck | Clean |
| Lint | Clean |
| Backend connection | Built, off by default |

### Known gaps

- **Screenshot picker is not built.** The `screenshots` input type has no picker.
  Harmless today because the only step using it is optional and skippable, but a
  corridor that made it required would leave a candidate unable to finish.
- **Release keystore.** Needed before any app store distribution. Requires the
  Apple and Google developer accounts.
- **Android push credentials.** Add the Firebase config file and an
  `extra.eas.projectId` for Android notifications. Push registration skips
  cleanly without them, and the in-app poll covers the gap. Do not point
  `app.json` at a gitignored path — that is what makes a clean clone fail an
  Android build before it starts.

---

## Scripts

| Command | Does |
|---|---|
| `npm start` | Expo dev server |
| `npm run web` | Straight to the browser |
| `npm run ios` / `npm run android` | Native builds (needs Xcode / Android Studio) |
| `npm test` | Jest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
