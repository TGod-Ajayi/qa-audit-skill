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

## Out of scope

Deliberately not tested in this run. Not evidence of anything.

| Unit | Priority | Target | Reason |
|---|---|---|---|
| U-006 | P2 | /admin/* | User excluded the admin console from this run |

## Check classes by area

| Area | Units | Exercised | Assigned but not exercised |
|---|---|---|---|
| admin | 1 | — | happy-path |
| auth | 1 | happy-path, input | — |
| catalog | 1 | happy-path, responsive | performance |
| checkout | 1 | design, happy-path, money, timing, ux | — |
| integrations | 1 | — | integration |
| platform | 1 | code-quality, security | — |

## All units

| Unit | Priority | Kind | Target | Status | Checks |
|---|---|---|---|---|---|
| U-001 | P0 | journey | /signup → email verification | covered | 2 |
| U-002 | P0 | journey | /checkout → POST /api/orders | covered | 5 |
| U-003 | P1 | page | /products | partial | 3 |
| U-004 | P1 | integration | Paystack webhooks | blocked | 0 |
| U-005 | P1 | code | src/lib (shared money, validation and HTTP helpers) | covered | 3 |
| U-006 | P2 | page | /admin/* | out_of_scope | 0 |
