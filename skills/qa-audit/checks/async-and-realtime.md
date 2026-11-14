# Async, timing and realtime checks

#### When to use this file

Use this file for any unit with a submit, save, pay, send or delete action, any search or filter that fires requests while the user types, and any live feature: chat, notifications, dashboards, collaborative editing, websockets, server-sent events (SSE) or polling. It covers the `timing` class and concurrency within `state`.

Use `payments-and-money.md` for duplicate charges and webhook order, `api-and-integrations.md` for provider timeouts and rate limits, `forms-and-data.md` for uniqueness rules, and `navigation-and-search.md` for search relevance and staleness that is not a race.

## Core discipline (include in every tester prompt for this domain)

```
- Bugs here are often intermittent. Repeat each check at least 5 times and record the rate, such as 3/5. Use 10 runs for anything that might be flaky.
- Control timing on purpose: delay, reorder or drop responses with network mocks. Don't rely on a slow network happening by chance.
- Count side effects at the source: database rows, provider dashboard charges, test inbox emails, API calls in the network log. The UI count is not proof.
- The expected rule must come from the spec or a documented constraint (unique key, stock limit, one charge per order). "It feels racy" is not a candidate.
- Keep parallel load small: 10 parallel calls is enough to show a race. This is not load testing. Never run it against shared or production systems.
```

## Duplicate submission (check classes: `timing`, `state`)

**Double and triple click**
Double-click and triple-click every submit, save, pay, send and delete button. Count the resulting records, charges, emails and API calls. **There must be exactly one.** Two requests where the server dedupes them to one record is not a bug; record it as a hardening note.

**Enter twice**
Press Enter twice quickly in forms. Same rule: one side effect.

**Submit, Back, submit**
Submit, press Back, then submit again. A second record is a bug unless the spec allows repeat submissions.

**Two tabs**
Submit the same form from two tabs at once. Compare with the uniqueness rule in the spec.

## Out-of-order responses (check classes: `timing`, `errors`)

**Search and autocomplete**
Type fast in search or autocomplete, and delay earlier responses with a network mock. The results shown must belong to the **latest** query. Results from an older query that overwrite newer ones are a candidate.

**Filters**
Change filters quickly. The list must match the final filter state, including the count and the URL.

**Navigate while pending**
Navigate away while a request is pending. There must be no state update on an unmounted component, no error toast on the new page, and no write that lands on the wrong record.

## Pending-state behaviour (check classes: `timing`, `errors`)

**What the user can do while waiting**
Check whether the user can edit fields, navigate or submit again while a save is pending. It should match the design. Edits made during a pending save must not be lost silently.

**Spinners resolve**
Spinners always end, on success and on error. An endless spinner after a failed request is a candidate.

**Optimistic rollback**
Make the server reject an optimistic update (mock a 4xx). The UI must roll back visibly and tell the user. A UI that keeps showing the rejected change is a candidate.

## Retries and timeouts (check classes: `timing`, `errors`)

**Retries are safe**
Client retries must not duplicate side effects that aren't idempotent. Mock a timeout after the server has processed the request, then let the client retry, and count side effects.

**Timeouts keep input**
A timeout shows a message and lets the user try again without losing their input.

**Backoff**
Watch the network log during a mocked outage. A tight loop that hammers the API is a candidate. A few spaced retries are correct.

## Realtime (check classes: `timing`, `integration`)

**Cross-session updates**
Open two sessions. A change in one appears in the other within the expected time. Record the delay. A delay longer than a documented target is a candidate; with no target, record it in notes.

**Reconnect and catch-up**
Drop the network, then restore it. The client reconnects, catches up on missed events, and doesn't show them twice.

**Server restart**
After a server restart in the test environment, clients reconnect without a manual reload.

**Background tab**
Leave the tab in the background for a long time, then refocus it. State is refreshed, not stale.

**Polling stops**
Polling and sockets stop when they should (logout, page left). Orphaned timers that keep calling the API after logout are a candidate.

## Concurrency on shared data (check classes: `state`, `timing`)

**Conflicting edits**
Two users edit the same record. Check whether the conflict is detected or silently lost, against the spec. Last-write-wins is correct only if the spec says so.

**Last item**
Two users claim the last item in stock, the same slot or the same username at once. Exactly one succeeds, and the other gets a clear message.

**Counters**
Counters (likes, stock, balances) stay correct under parallel updates. Fire 10 parallel API calls and compare the result with the expected total.

## Universal moves

- Use route interception to hold a response, then release responses in a chosen order.
- Use `Promise.all` in a test script to fire parallel API calls with a test account token.
- Pair every timing check with a count taken from the source of truth after the dust settles.

## Validation rules (apply before reporting ANY candidate here)

1. Record the reproduction rate over at least 5 attempts, and over 10 if it is below 100%.
2. Describe the timing that triggers it: which response was delayed or reordered, and by how much.
3. Show the duplicate or lost side effect at its source (rows, dashboard, inbox, network log).
4. Rule out test artifacts: hot reload, a shared test account used by another tester, a seed running in parallel.
5. Use `confirmed` for 100% reproductions under controlled timing, `flaky` with the rate otherwise. Use `needs_validation` when the race needs real infrastructure you can't run (several app instances, a real queue) and say which. A race the tester caught on record but nobody can reproduce is also `needs_validation` (with `repro_rate` `0/N`), never `rejected`.
