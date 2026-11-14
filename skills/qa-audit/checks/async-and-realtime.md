# Async, timing and realtime

Bugs here are often intermittent. Repeat each check several times and record the reproduction rate.

## Duplicate submission

- Double-click and triple-click every submit, save, pay, send and delete button. Count the resulting records, charges, emails and API calls. **There must be exactly one.**
- Press Enter twice quickly in forms.
- Submit, then press Back, then submit again.
- Submit from two tabs at once.

## Out-of-order responses

- Type fast in search or autocomplete. Delay earlier responses with network mocking. The results shown must belong to the **latest** query.
- Change filters quickly. The list must match the final filter state.
- Navigate away while a request is pending. There must be no state update on an unmounted component and no error toast on the new page.

## Pending-state behaviour

- What can the user do while a save is pending? Can they edit fields, navigate or submit again? It should match the design.
- Spinners always resolve, both on success and on error. There is no endless loading after a failure.
- Optimistic updates roll back visibly when the server rejects them.

## Retries and timeouts

- Client retries don't duplicate side effects that aren't idempotent.
- Timeouts show a message and let the user try again without losing their input.
- Exponential backoff: no tight retry loop that hammers the API (watch the network log).

## Realtime (websockets, SSE, polling)

- Open two sessions. A change in one appears in the other within the expected time.
- Drop the network, then restore it. The client reconnects, catches up on missed events, and doesn't duplicate them.
- After a server restart, clients reconnect.
- The tab is in the background for a long time, then refocused. State is refreshed and not stale.
- Polling stops when it should (logout, page left), so there are no orphaned timers.

## Concurrency on shared data

- Two users edit the same record. Check whether the conflict is detected or silently lost, against the spec.
- Two users claim the last item in stock, the same slot or the same username at once. Exactly one succeeds.
- Counters (likes, stock, balances) stay correct under parallel updates. Fire 10 parallel API calls and compare the result.
