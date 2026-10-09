# Careers frontend theme implementation

Branch: feature/careers-ui-theme. Base: 4c6a9febaaa87a646bd02ef1cdf9d1cbff53d882.

## Scope

Warm paper/forest/mint theme, bundled Inter and Fraunces italic typography,
shared inputs/cards/buttons/dialogs, welcome entry points, separate invitation
presentation, scrollable tour and code screens, responsive contact form and
profile columns, chat keyboard handling and history retry, and rename failure
feedback. Verified email is read-only, matching the existing update contract.
Expo appearance/splash/status bar now use the light theme.

The existing configured credential screens inherit the shared theme. Facts,
counts, requirements, dates, jurisdictions and status labels remain dynamic.
No new data fixtures or simulated successes were added to application code.
Existing mock services remain unchanged; checked-in useMocks remains false.

API services, contracts, authentication and verification rules, backend
code/configuration/migrations and deployment were not changed. The navigation
follow-up updates frontend state and route handling as described below.

## Verification

- TypeScript: passed.
- Jest: 172 tests passed across 4 suites, including invitation presentation,
  locked email/unchecked fresh consent, chat retry and failed rename draft retention.
- ESLint: no errors; two existing duplicate-import warnings in ladder.test.ts.
- Expo exports: web, Android and iOS JavaScript/Hermes exports passed.
- Browser checks at 390px and 1440px: welcome, invitation failure, invalid email,
  profile and chat history failure. No uncaught page errors or document overflow.
  Browser checks used isolated test-only network responses, not a running backend.
- No native binary build or physical-device keyboard/safe-area test was performed.
- No live email, invitation, verification/upload or production conversation test
  was possible without a configured backend.

## Backend-dependent features left unchanged

Signup handler does not wire actual email delivery. Invitation, chat, rename
and notification routes include development stubs. OAuth routes are absent.
Wrong/expired signup codes share an error; no fabricated expiry detection was
added. Invitation resend was not added. Upload/verification progress remains
indeterminate. Existing DOB/consent rules remain unchanged.

Production backend completion and native release validation remain separate
work. No main merge or deployment is included.

## Navigation and refresh follow-up

Back now follows actual visits, including individual tour pages, invitation
entry, profile edits and chat origins. Browser Back/Forward and Android hardware
Back use the same history. Web refresh restores the current screen and text
drafts from tab-scoped sessionStorage. Recovery is scoped to API host, corridor
and mock/live mode, expires after 12 hours, and is cleared on sign-out. Existing
access/refresh tokens are not copied into recovery storage or URLs.

Signed-in recovery checks the existing person endpoint. Temporary failures offer
a retry without discarding the draft; expired sessions use existing sign-in
rules. Already verified email screens show the real confirmed state when
revisited. Revisiting invitation details does not spend an already redeemed
claim token again. Pending submissions are never recovered as successes.

Follow-up verification:
- 183 Jest tests passed across six suites, including refresh history-index
  preservation, tour visits, profile/chat origins, draft recovery, logout
  isolation and invitation revisit behavior.
- TypeScript passed; ESLint passed with the same two existing test-import warnings.
- Web, Android and iOS Expo exports passed with checked-in live configuration.
- Browser onboarding checks using existing mock services: welcome/tour, email
  signup and invitation verification, contact details, all applicable sample credential steps, CV picker,
  optional skips, agent setup, profile editing, chat and sign-out. Refresh and
  Back/Forward checked throughout; no uncaught browser errors.
- Live-service browser checks with isolated API responses at 390px and 1440px:
  profile/chat recovery, session-check outage and retry, expired session. No
  uncaught errors or horizontal overflow. These are not live backend tests.

Limitations:
- Selected files/screenshots must be selected again after refresh; browser file
  handles and pending requests are not persisted. OTP inputs are not retained.
- Recovery requires browser sessionStorage and applies to the current tab, not
  another device. Arbitrary pasted deep links are not an authentication bypass.
- Native hardware integration compiled, but no emulator/physical-device test ran.
- Real email delivery, invitation redemption, uploads, authority checks, OAuth,
  and production chat still require backend-connected acceptance testing.

## Sign-out landing correction

Explicit sign-out returns to Welcome and clears the remembered introduction
flag, so a fresh visit after sign-out also opens Welcome. Current-screen refresh
recovery is unchanged. The reducer regression checks Welcome and empty history.
All 183 tests and TypeScript passed; lint retained only the two existing warnings.
Web export passed. Browser checks at 390px and 1440px with isolated API responses
confirmed Welcome after sign-out, browser Back, refresh, and a fresh base-URL
visit without the recovery snapshot; tokens and the introduction flag were cleared.

## Fresh launch correction

Opening the base website address while signed out now always opens Welcome,
even when an earlier visit recorded the introduction or saved Entry. A screen
URL still restores that screen on refresh. An existing authenticated session
continues to open Profile on a fresh launch. No backend changes are involved.
184 tests and TypeScript passed; web export passed. Browser checks at 390px and
1440px confirmed launch to Welcome with an existing introduction flag, return
to the base URL with a saved Entry snapshot, and refresh on Entry and Tour.
