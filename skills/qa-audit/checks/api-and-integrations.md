# API and integrations checks

#### When to use this file

Use this file for `api` and `integration` units: REST and GraphQL endpoints, the agreement between the frontend and its API, third-party services (payment, SMS, maps, storage, identity, analytics), background jobs and cron. It covers the `contract` and `integration` classes, and the API side of `errors` and `timing`.

Use `forms-and-data.md` for field validation rules, `payments-and-money.md` for payment providers and webhooks, `email-and-notifications.md` for mail and SMS providers, `files-and-media.md` for upload and download flows, and `async-and-realtime.md` for races and retries seen from the UI.

## Core discipline (include in every tester prompt for this domain)

```
- The contract is the expected source: OpenAPI, GraphQL schema, shared TypeScript types, zod or JSON schemas, or the API docs. Cite the exact field or status code. With no contract, use what the frontend code reads.
- Capture the full request and response (method, URL, status, headers that matter, body) for every candidate. A screenshot alone is not API evidence.
- Every third-party call runs in sandbox or test mode, or against a mock. Never call a live provider with real data.
- Simulate provider failures with network mocks, not by breaking shared credentials. Bad-credential checks run only in a scratch environment.
- Anything that returns another account's data, or works without auth when it should not, is a security_referral. Stop there.
```

## API contract (check classes: `contract`, `input`)

**Schema match**
For each endpoint group, compare real responses with the documented schema. Look for missing fields, extra fields, wrong types and unexpected nulls. A bug is a field the frontend reads that is missing or has a different type. An extra undocumented field that nothing reads is a docs note, not a bug.

**Status codes**
Expect 200/201/204 on success; 400 or 422 on validation errors, with a useful body; 401 when not logged in; 403 when not allowed; 404 for unknown resources; 409 for conflicts. **A 500 caused by bad user input is always a candidate.** A 400 where the docs say 422 is a candidate only if a client depends on the difference.

**Error body shape**
Error bodies share one shape, and the frontend actually reads it to show the message. A bug is the UI showing "Something went wrong" while the API returned a clear field error.

**Pagination**
Check the first page, the last page, past the end, a page size of 0 or a huge value, a stable order across pages, and items inserted between page loads. A bug is a duplicate or missing item across pages, or an unbounded page size that times out.

**Filtering and sorting**
Every documented parameter works. Unknown parameters are ignored or rejected as specified. Sorting is stable on ties. An unstable order on ties is a bug only when pagination makes it visible.

**Idempotency**
PUT and DELETE are idempotent, and so is any POST that the docs call idempotent (for example with an `Idempotency-Key`). Repeat the call and compare the stored state.

**Server-side validation**
The API validates what the UI validates (see `forms-and-data.md`). Send the invalid payload straight to the endpoint.

## Frontend and API agreement (check classes: `contract`, `performance`, `errors`)

**Calls per action**
Use network interception to check that each page calls the expected endpoints exactly once per action. No N+1 loops, no duplicate calls on mount (StrictMode double effects in a production build count), and no calls to stale or unused endpoints. Duplicate calls in development mode only are not a bug.

**Graceful failure**
Mock each endpoint's failure (500, timeout, malformed JSON). The page must show a message, keep the rest of the page working and allow a retry (see `errors` in `CHECK-CLASSES.md`).

**Breaking changes**
Compare the API the frontend expects (types, generated clients) with what it returns now. A renamed field or a new nullable that the UI does not handle is a candidate.

## Third-party integrations (check classes: `integration`, `errors`, `timing`)

For each integration listed in `architecture.md`, run these checks:

| Check | How |
|---|---|
| Success path | Sandbox or test mode |
| Provider error | Sandbox error triggers, or mock the provider's response |
| Timeout or slow | Mock with a delay longer than the app's timeout |
| Provider down | Mock connection refused. The app shows a message and queues or retries as designed |
| Bad credentials | Only if you can do it in a scratch environment. Otherwise check the code path |
| Rate limited | Mock 429. The app backs off and does not loop |

**Failure is visible and recoverable**
For each row, a bug is a silent failure that looks like success, an endless spinner, or lost user input. A provider outage that shows a clear message and lets the user retry is correct.

**No tight retry loops**
Watch the network log during a mocked outage. A retry every few milliseconds without backoff is a candidate.

## File storage (check classes: `integration`, `state`)

**Store, view and access**
Upload → the file is stored → it can be viewed or downloaded → its URL access matches the spec (public or signed). Expired signed URLs fail gracefully. Details of upload limits and odd files live in `files-and-media.md`.

**Cleanup**
Deleting a parent record removes or orphans files as specified. A cancelled upload leaves no half-written record.

## Background jobs and cron (check classes: `integration`, `state`, `time-locale`)

**Idempotent jobs**
Trigger each job manually if possible. It must be idempotent, record its failures, and a retry must not duplicate side effects such as emails or charges.

**Time-dependent jobs**
Jobs that depend on time handle timezones and month ends (see `time-and-locale.md`). A daily job that runs twice or skips a day around midnight UTC versus Africa/Lagos is a candidate.

## Universal moves

- Export a HAR for each tested page and diff the calls against what the code says should happen.
- Keep a mock profile per provider with success, error, slow, down and 429 responses, so each tester uses the same failures.
- Call each endpoint with curl or the test runner as well as through the UI, using a test account token.

## Validation rules (apply before reporting ANY candidate here)

1. Cite the contract line or the frontend code that sets the expectation.
2. Include the raw request and response, with secrets and tokens redacted.
3. For integration failures, say whether the failure was real sandbox behaviour or a mock, and give the mock definition.
4. For duplicate or missing calls, include the network log and the user action that triggered it.
5. Use `confirmed` only after 3/3 reproductions. Use `needs_validation` when the provider sandbox cannot produce the case and a mock would not be faithful, and name the missing sandbox feature.
