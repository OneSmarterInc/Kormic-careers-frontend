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

## Eight frontend refinements

- Screens and header use the viewport width with consistent gutters; contact
  details retain responsive columns and mobile stacking.
- DOB uses a light browser date input with an explicit Calendar button. Existing
  date limits and native date pickers remain unchanged.
- Multiple screenshots show one thumbnail and an additional-photo count. The
  review dialog retains individual removal; object URLs are released on unmount.
- Profile-building content starts near the top and can scroll on small screens.
- Web chat sends with Enter, uses Shift+Enter for newlines, respects composition
  input and prevents duplicate in-flight sends.
- Chat fills available height; the composer stays visible while the thread
  scrolls. Reading older messages no longer forces a jump on content changes.
- The duplicate tour Previous button is removed; the shared Back remains.
- URLs use readable paths without hashes. Legacy hash links normalize to the new
  paths. Existing authentication and route prerequisites still apply.

Validation: 197 tests, TypeScript and all three Expo platform exports passed.
Lint has only the two existing duplicate-import warnings. Browser checks covered
onboarding, refresh, browser history, upload counts/removal, Enter/Shift+Enter,
sign-out, legacy links and direct authenticated paths. Long conversations with
80 test messages at 390px and 1440px kept the composer visible and allowed reading
older messages without jumping. No uncaught browser errors or horizontal overflow.
Browser data was isolated mock/test API data, not production backend verification.

Hosting prerequisite (not changed): production frontend hosting must serve
index.html for application paths such as /profile and /navigator/chat, while
serving assets and API paths normally. Expo's local development server returned
the app shell with HTTP 200 for /personal-details. Exported browser tests used a
temporary SPA fallback server. The production host is not identified in this
repository, so production deep-link/refresh acceptance remains blocked on checking
its fallback rules. No hosting settings, backend or deployment configuration were
modified. Deployment changes require separate approval. Hosting under a URL
subdirectory would also require an explicitly configured base path.

## Balanced responsive widths (supersedes edge-to-edge content)

Content now uses task-specific maximum widths: authentication 520px, onboarding
680px, Welcome 760px (580px hero), personal details 920px, profile 1080px and
chat 880px. Headers align with the corresponding content. Mobile uses 16px
gutters; larger screens use 24px. Short screens follow a consistent top spacing
instead of vertical centering, and unused header rows are omitted. Background
checks have a distinct padded section, with a compact desktop Continue action.

197 tests and TypeScript passed. Lint retains two pre-existing warnings. Web
export passed. Browser checks at 390, 768, 1440 and 1920px verified profile,
contact form, Welcome, sign-in, profile-building and long-chat layouts with no
uncaught errors or horizontal overflow. Chat remains scrollable with a visible
composer. Screenshots were inspected for desktop/mobile spacing and alignment.
This is a presentation-only follow-up; APIs, routing and backend are unchanged.

## Compact background-check section

DOB and previous names now share a row at widths of 800px and above, with a
300px DOB column and flexible names field. Mobile stacks the fields. Repeated
explanatory text is condensed; the full consent statement, privacy note, human
review disclosure and validation remain. TypeScript, 197 tests and web export
passed. Browser checks confirmed aligned desktop inputs and stacked mobile inputs
with no horizontal overflow or page errors; the rendered desktop layout was reviewed.

### Compact upload screen and verification keyboard submission

- Moved Back into the brand header row with a 44px minimum target; progress remains below it. Existing history behavior is unchanged.
- Screenshot selection now uses a thumbnail/count badge, selection summary, and adjacent Add more on desktop. Mobile stacks controls. Continue and Skip share a compact desktop action row; the review dialog retains individual removal.
- Both email and invitation code fields submit the existing verification handler on Enter. A synchronous request lock prevents repeated Enter/click submissions; signup resend shares the lock. Invalid codes and failed requests never advance.
- Validation: typecheck, 199 tests in seven suites, web export, and diff whitespace checks passed. Lint has only the two existing duplicate-import warnings in ladder.test.ts.
- Chromium at 390px and 1440px: real file chooser with test image files, count badge, review/remove, Back, no overflow or runtime errors. API interception checked both Enter verification requests and duplicate suppression with rejected responses. An initial browser test used an unavailable profile button label; the corrected test navigated directly to the credential route and passed.
- Live backend OTP acceptance/upload persistence and physical native devices were not tested. No backend, deployment, API contract, or mock configuration changes.

### Profile layout and scrolling

- Replaced tall, full-width credential cards with a responsive two-column grid (single column below 700px), placing each update action alongside its title. Full values, verification dates/methods, and background-check details remain available; removed the prior two-line truncation of multi-fact values.
- Compact profile heading, status counts, Navigator panel and account controls. Desktop sidebar begins at 1000px. Shared Screen supports opt-in compact padding and hidden vertical scroll indicator; only Profile opts in. Scrolling itself stays enabled for small screens and long records.
- Passed typecheck, 199 tests, web export and browser checks at 390/768/1024/1440px. A five-record API fixture fits without vertical scrolling at 1024x800 and 1440x800. Smaller widths scroll with no visible scrollbar, no horizontal overflow, and no runtime errors. Credential update/back, sign-out cancel, and opening chat passed at all four widths.
- Existing two lint warnings remain. Live backend and physical native devices not tested. No backend, API, authentication, deployment, or mock configuration changes.
