# Needs validation (run 1)

Leads grounded in evidence but blocked by one unresolved fact. Severity is not assigned until resolved.

## Security referrals

Observed by QA and **not probed**. Route these to a dedicated security review (for example, the security-audit skill).

| ID | Unit | Title | Observed |
|---|---|---|---|
| QA-010 | U-002 | Order detail API may return another customer's order by id | GET /api/orders/:id handler has no owner check in source; not probed |

## Blocked leads

| ID | Unit | Title | Blocking fact |
|---|---|---|---|
| QA-004 | U-004 | Webhook replay behaviour unverified | Need a test webhook signing secret to send signed sandbox events |
| QA-011 | U-002 | Cart total briefly shows the old amount after removing an item quickly | Seen once by tester-b02 on video; 0/10 reproductions on chromium and webkit with 3G throttling. Needs a longer soak or a controlled delay on PATCH /api/cart |
