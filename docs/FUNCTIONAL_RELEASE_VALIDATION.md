# Functional release validation

## Scope

- Edition administration is administrator-only in navigation and route guards. Operators and viewers discover only their assigned edition, cannot switch it, and cannot override that boundary with request headers, query parameters, body fields or nested edition paths. Assignments are managed in Users and read from the database on each request. Existing unassigned accounts use the default edition (latest edition as fallback), without rewriting those accounts.
- Existing operational permissions remain; viewer write restrictions and administrator-only audit access are enforced by the API. Platform, active event and localized role branding are separated.
- The three existing demo login buttons use a server endpoint gated by `DEMO_QUICK_ACCESS=true`. It is disabled by default; the frontend contains no demo passwords. Enable only on the authorized demonstration API, never on a real production installation.
- Geek Gold, Geek Silver and Geek are selectable and filterable. Legacy categories remain available, including custom text entry. Optional category reference values are stored per edition and never create sponsor commitments or payments. The category breakdown supplements existing financial indicators; their formulas and payment history are preserved.
- Dashboard links to the existing attendance scanner. Successful explicit confirmation returns to attendance with feedback. Existing validation, size selection, inventory accounting, operator/time recording and atomic duplicate prevention are reused.
- Mobile search examples pan only when empty and blurred, respect reduced motion and preserve desktop placeholders. The actual main scroll container resets only on route pathname changes. Mobile dialog sizing, internal focus scrolling, safe areas, background locking and specialized input types are retained or completed. Desktop styling is preserved apart from the requested QR shortcut and functional category/assignment controls.

## Database changes

Both SQLite and PostgreSQL schemas receive only two nullable scalar fields: `User.assignedEventId` and `EventSettings.sponsorCategoryValues`. No existing fields, tables, enum values or records are removed or renamed. Existing Render startup initialization and PostgreSQL URL handling remain unchanged. No reset, clean, forced push or destructive migration is used.

## Validation

- Frontend production build; backend builds with SQLite and PostgreSQL clients; both Prisma schemas validate.
- 17 backend tests: existing search/configuration regression tests plus isolated role, cross-edition, assignment, demo gating, sponsor financial accounting and concurrent QR check-in integration tests.
- New backend integration tests create a fresh temporary SQLite database outside the project, replace the database module and configuration, and remove only their own temporary database after disconnecting. They never use a configured local or deployed database.
- `frontend/tests/mobile-regression.cjs`: 320, 390, 412, 844 and 1440 pixel widths; money editing, input font sizing, header and dialog bounds, simulated keyboard viewport, long edition names, QR camera/manual separation, single submissions, return to attendance and released camera tracks.
- `frontend/tests/functional-regression.cjs`: mocked API demonstration login for all roles, navigation/route restrictions, branding, sponsor creation/editing/categories, keyboard focus visibility, background locking, no horizontal dialog overflow, placeholder states/reduced motion/desktop behavior, real scroll-container route reset, Dashboard QR entry, existing/chosen shirt size, connection failure without false success, explicit single confirmation and return to attendance.
- `frontend/tests/pwa-regression.cjs`: manifest/icons, complete lazy-module precache, exclusion of API/uploads, worker update activation and offline shell/login. 72 public resources cached in the tested build.
- Mobile sponsor form and desktop participant screenshots were reviewed. Browser tests emulate viewport and keyboard changes using desktop Chrome; no physical iPhone or Android device test is claimed.
- Pre-publication read-only deployed checks: frontend/API reachable, database connected, demo administrator login succeeds, SMTP disabled globally and for all three editions. Participant, attendance and sponsor counts were zero across all three editions before publication.

## Release process

Changes are committed with the repository's existing identity, reviewed through a pull request to `main`, and deployed only to the existing `eventgrid-preview` and `eventgrid-demo-api` services in the authorized My Workspace. No new services or paid-plan changes. Live validation uses demo login and reads only; it does not submit participant, sponsor, payment, check-in or email operations.
