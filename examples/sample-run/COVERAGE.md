# Coverage (run 1, build `a1b2c3d`)

"Not tested" means not tested — it is not evidence that something works.

## P0 journeys

| Journey | Unit | Status |
|---|---|---|
| Sign up and verify email | U-001 | covered |
| Checkout and pay | U-002 | covered |

## Gaps

| Unit | Priority | Target | Status | Reason / notes |
|---|---|---|---|---|
| U-003 | P1 | /products | partial | Performance not measured: Lighthouse unavailable in sandbox |
| U-004 | P1 | Paystack webhooks | blocked | No webhook signing secret for the test environment |

## Check classes by area

| Area | Units | Exercised | Assigned but not exercised |
|---|---|---|---|
| auth | 1 | happy-path, input | — |
| catalog | 1 | happy-path, responsive | performance |
| checkout | 1 | happy-path, money, timing | — |
| integrations | 1 | — | integration |

## All units

| Unit | Priority | Kind | Target | Status | Checks |
|---|---|---|---|---|---|
| U-001 | P0 | journey | /signup → email verification | covered | 2 |
| U-002 | P0 | journey | /checkout → POST /api/orders | covered | 3 |
| U-003 | P1 | page | /products | partial | 2 |
| U-004 | P1 | integration | Paystack webhooks | blocked | 0 |
