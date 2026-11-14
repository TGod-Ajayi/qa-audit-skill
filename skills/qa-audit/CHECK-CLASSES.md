# Check classes

Check classes are QA's version of attack classes. Each one is a family of checks with a short core checklist here. The deeper domain checklists live in `checks/`.

## Default assignment by unit kind

| Unit kind | Default check classes |
|---|---|
| journey | happy-path, navigation, errors, timing, responsive, hygiene, ux (+ auth if logged in, + money if it involves payment, + design if a design source exists) |
| form | input, errors, timing, a11y, ux |
| entity | state, input, auth |
| api | input, auth, errors, timing, contract, security |
| state | state, timing, errors |
| integration | integration, errors, timing |
| page | happy-path, responsive, a11y, hygiene, ux, performance (if P0 or P1), design (if a design source exists) |
| cross-cutting | the one class it names (for example responsive, a11y, performance, time-locale, security) |
| code | code-quality, security |

Add more classes when the code or the "Known risks" section in `architecture.md` gives a reason to. Every class name below is the exact value used in `check_classes` and `check_class`.

## Which classes produce findings and which produce suggestions

Each class can produce both. What decides it is the expected source:

| Class | Counts as a source (so it's a finding) | Without one (so it's a suggestion) |
|---|---|---|
| design | Figma frame or node, design token, design-system or style-guide rule | "It would look better if…" |
| ux | The same thing done differently elsewhere in this app, a design-system rule, WCAG, Apple HIG or Material, the user's statement | Personal preference about flow or wording |
| code-quality | The project's lint, tsconfig, CI or CONTRIBUTING rules, a failing project command, or a demonstrated runtime bug | "I'd structure it differently", complexity with no concrete effect |
| security | A passive observation of a documented control failing (see `checks/security-hygiene.md`) | Generic hardening advice. Anything needing probing is a referral. |

---

## happy-path

- The journey completes with valid data, exactly as the spec and UI copy describe.
- The result **persists**: reload, log out and back in, and check it from another role or account that should see it.
- Every confirmation shown (toasts, emails, receipts) matches what actually happened.
- Counts, totals and badges update everywhere the data appears.

## input → `checks/forms-and-data.md`

- Empty, whitespace-only and leading or trailing spaces.
- Boundary lengths (min−1, min, max, max+1) and very long text.
- Unicode, emoji, right-to-left text, apostrophes and accents in names (O'Brien, Adébáyọ̀).
- Wrong formats (email, phone, date, URL) and pasted values with hidden characters.
- Numbers: 0, negative, decimals, huge values, and locale separators (1,000.50 and 1.000,50).
- **The server enforces what the client enforces.** Send the same bad input straight to the API.

## state → `checks/forms-and-data.md`

- Full create → read → update → delete cycle. Data must survive a reload. A delete must also remove the record from lists, search and caches.
- Two tabs editing the same record: is the last write silent, or is the conflict detected?
- Optimistic UI rolls back correctly when the server rejects a change.
- State-machine transitions: every allowed one works, and every disallowed one is blocked **on the server**.
- Delete and archive behaviour leaves no orphans, and cascades as intended.

## navigation → `checks/navigation-and-search.md`

- Back and forward in the middle of a flow, refreshing on every step of a wizard, and opening a deep link directly.
- Opening a protected URL while logged out redirects to login, then **returns to the original page** after login.
- Unknown IDs and garbage URLs give a proper 404 page, not a crash or a blank screen.
- Leaving a page with unsaved changes behaves as designed.
- Search returns known seeded answers, filters and sorting combine correctly, pagination has no gaps or repeats, and URL state survives reload and sharing.

## auth → `checks/auth-and-accounts.md`

These checks are functional only. Anything exploitable gets `security_referral`.

- Logged-out, expired-session-mid-flow, and logout-in-another-tab cases.
- Each role sees and can do only what it should, in the UI **and** through the API.
- Password reset, email verification and invite links: single use, expiry, and what happens on the second click.

## errors (error, empty and loading states)

- Force API 4xx and 5xx responses, timeouts and offline by mocking the network. The UI must show a clear message, avoid corrupting state and let the user retry.
- Empty lists, zero results, and the first and last page of pagination.
- Loading states have no layout jump, no flash of the wrong content, and no endless spinner.
- Partial failure: one widget's API fails and the rest of the page still works.

## timing → `checks/async-and-realtime.md`

- Double-click and rapid repeat on every submit or pay button: are there duplicate records or charges?
- Out-of-order responses, such as fast typing in search where a stale result overwrites a fresh one.
- Retries, debounce, and actions taken while a previous request is still pending.
- Websocket, SSE or polling reconnects after a network drop.

## money → `checks/payments-and-money.md`

- Totals, taxes, discounts, coupons and shipping. Rounding is done in minor units (kobo or cents), never floats.
- Currency formatting and symbols, and multi-currency if supported.
- Sandbox payment outcomes: success, decline, insufficient funds, 3-D Secure or OTP, abandonment, refund and partial refund.
- Webhooks: idempotent on replay, safe when they arrive out of order, and the order status matches the payment status.

## time-locale → `checks/time-and-locale.md`

- Timezones: user versus server (UTC versus Africa/Lagos and the like), events near midnight and month boundaries, and DST where relevant.
- Date and number formats per locale. Translated strings overflow nothing, and no raw translation keys show.

## integration → `checks/api-and-integrations.md`, `checks/email-and-notifications.md`, `checks/files-and-media.md`

- Each external service in sandbox mode: success, failure, timeout and a slow response.
- Emails, SMS and push notifications actually arrive (test inbox) with correct content and working links.
- File uploads, downloads and exports: see `checks/files-and-media.md`.

## contract (API units)

- Responses match the documented or typed schema, including error bodies.
- Correct status codes. Pagination and filtering parameters are honoured.
- Breaking changes against what the frontend expects, such as renamed fields or new nullables.

## responsive → `checks/frontend-ux.md`

- Mobile (375×812), tablet (768×1024) and desktop (1440×900).
- P0 journeys on Chromium, Firefox and **WebKit** (Safari).
- No horizontal scroll, no element hidden behind the keyboard, and tap targets at least 44px.

## a11y → `checks/frontend-ux.md`

- Every P0 journey can be completed with the keyboard only. Focus is visible and in a logical order.
- Labels, accessible names and form error messages are announced and tied to their fields.
- An axe-core scan finds no serious or critical violations.

## performance → `checks/frontend-ux.md`

- LCP, INP and CLS measured in the lab on P0 pages, judged against Google's thresholds. Always state that these are lab numbers, not field data.
- No N+1 or duplicate API calls on page load, and no oversized images or bundles.

## hygiene

- No console errors or unhandled promise rejections on any page visited.
- No failed network requests (4xx/5xx) during normal use, and no broken links or images.

## design → `checks/design-and-ux.md`

- Compare each screen with its cited design source at the same viewport, theme, state and content. Record the Figma frame link or node id.
- Typography, spacing, colour and radius come from the design tokens, not near-miss values.
- Every component state exists and matches: hover, focus, active, disabled, loading, error, empty, selected.
- Each breakpoint uses the layout the design specifies. Dark mode too, if there is one.
- Copy on screen matches the design's copy. No elements are missing or extra.
- Differences under about 2px, font-rendering differences and anything the design leaves unspecified are not bugs.

## ux → `checks/design-and-ux.md`

- **Internal consistency**: the same action has the same label, style and position everywhere; one term per concept; the same component behaves the same on every page.
- **Affordances**: things that look clickable are clickable, and the reverse. Primary and destructive actions are visually distinct and never swapped.
- **Feedback**: every action gives visible feedback. Destructive actions confirm or offer undo.
- **Focus and modals**: sensible default focus, focus returns after a modal closes, no focus traps, and Escape closes dialogs.
- **Messages**: errors say what went wrong and how to recover; empty states say what to do next; truncation never hides meaning.
- Use Nielsen's ten heuristics as the lens. Every finding still needs a source from the table above.

## code-quality → `checks/code-quality.md`

- Run the project's own lint, typecheck, format check, build and test commands. Any failure on the audited build is a finding sourced by the project's config.
- Look for swallowed errors, unhandled rejections, `any` and unsafe casts at data boundaries, money held in floats, and magic numbers for money and time.
- Look for duplicated logic that already disagrees, dead code on P0 paths, and N+1 queries.
- Check tests: P0 paths without tests, and skipped or flaky tests in the baseline.
- Check dependencies: deprecated or unmaintained packages, duplicate major versions, lockfile drift.
- Fixes stay minimal. Larger clean-ups are suggestions.

## security → `checks/security-hygiene.md`

Passive checks only; anything that needs probing is a `security_referral`.

- Secrets in the repo, the client bundle and source maps, with values redacted to 4 characters.
- Exposed `.env`, `.git` and backup files: one plain GET each.
- Session cookie flags, security headers, and CORS config (one OPTIONS request).
- Known-vulnerable dependencies on a reachable path.
- Sensitive data in URLs, logs and analytics. Stack traces shown to users.
- Auth enforced only in the UI: one call with QA's own lower-privilege test account on another test account's record.
