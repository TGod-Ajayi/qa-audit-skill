# API and integrations

## API contract

- For each endpoint group, compare real responses with the documented schema (OpenAPI, GraphQL schema, shared TS types or zod schemas). Look for missing fields, extra fields, wrong types and unexpected nulls.
- Status codes: 200/201/204 on success; 400 or 422 on validation errors (with a useful body); 401 when not logged in; 403 when not allowed; 404 for unknown resources; 409 for conflicts. Never a 500 caused by bad user input.
- Error bodies have one consistent shape, and the frontend actually reads it to show the message.
- Pagination: first page, last page, past the end, a page size of 0 or a huge value, a stable order across pages, and items inserted between page loads.
- Filtering and sorting: every documented parameter works, unknown parameters are ignored or rejected as specified, and sorting is stable on ties.
- Idempotency for PUT and DELETE, and for any POST that the docs call idempotent.
- The API validates what the UI validates (see `forms-and-data.md`).

## Frontend ↔ API agreement

- Use network interception to check that each page calls the expected endpoints exactly once per action. No N+1 loops, no duplicate calls on mount (React StrictMode double effects in production builds count), and no calls to stale or unused endpoints.
- Mock each endpoint's failure (500, timeout, malformed JSON) and confirm that the page degrades gracefully (see `errors` in `CHECK-CLASSES.md`).

## Third-party integrations

For each integration listed in `architecture.md`:

| Check | How |
|---|---|
| Success path | Sandbox or test mode |
| Provider error | Sandbox error triggers, or mock the provider's response |
| Timeout or slow | Mock with a delay longer than the app's timeout |
| Provider down | Mock connection refused. The app shows a message and queues or retries as designed |
| Bad credentials | Only if you can do it in a scratch environment. Otherwise check the code path |
| Rate limited | Mock 429. The app backs off and does not loop |

## File storage and uploads

- Upload → the file is stored → it can be viewed or downloaded → its URL access matches the spec (public or signed). Expired signed URLs fail gracefully.
- Deleting a parent record removes or orphans files as specified.
- Large uploads show progress. A cancelled upload leaves no half-written record.

## Background jobs and cron

- Trigger each job manually if possible. It is idempotent, it records failures, and a retry doesn't duplicate side effects (emails, charges).
- Jobs that depend on time handle timezones and month ends (see `time and locale` in `CHECK-CLASSES.md`).
