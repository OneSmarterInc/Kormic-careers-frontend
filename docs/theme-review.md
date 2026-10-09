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

API services, contracts, authentication, state reducer, verification models,
backend code/configuration/migrations and deployment were not changed.

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

Browser/hardware history integration, production backend completion and native
release validation remain separate work. No main merge or deployment is included.
