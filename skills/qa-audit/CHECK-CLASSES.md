# Check classes

Check classes are QA's version of attack classes. Each one is a family of checks with a short core checklist here. The deeper domain checklists live in `checks/`.

## Default assignment by unit kind

| Unit kind | Default check classes |
|---|---|
| journey | happy-path, navigation, errors, timing, responsive, hygiene (+ auth if logged in, + money if it involves payment) |
| form | input, errors, timing, a11y |
| entity | state, input, auth |
| api | input, auth, errors, timing, contract |
| state | state, timing, errors |
| integration | integration, errors, timing |
| page | happy-path, responsive, a11y, hygiene, performance (if P0 or P1) |
| cross-cutting | the one class it names |

Add more classes when the code or the "Known risks" section in `architecture.md` gives a reason to.

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

## navigation

- Back and forward in the middle of a flow, refreshing on every step of a wizard, and opening a deep link directly.
- Opening a protected URL while logged out redirects to login, then **returns to the original page** after login.
- Unknown IDs and garbage URLs give a proper 404 page, not a crash or a blank screen.
- Leaving a page with unsaved changes behaves as designed.

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

## time and locale

- Timezones: user versus server (UTC versus Africa/Lagos and the like), events near midnight and month boundaries, and DST where relevant.
- Date and number formats per locale. Translated strings overflow nothing, and no raw translation keys show.

## integration → `checks/api-and-integrations.md`, `checks/email-and-notifications.md`

- Each external service in sandbox mode: success, failure, timeout and a slow response.
- Emails, SMS and push notifications actually arrive (test inbox) with correct content and working links.
- File uploads: size limits, wrong types, odd filenames, and an upload interrupted halfway.

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
