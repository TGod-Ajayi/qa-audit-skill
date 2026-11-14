# QA audit report — demo-shop (run 1)

**Audited build:** `a1b2c3d`  
**Verified build:** `c0ffee511111` (tree `7a3f9e2c4b8d`) on `qa-audit/run-1`, stamped 2026-11-14T16:05:00.000Z. Any later edit invalidates it: run `stamp-verdict.cjs check` before shipping.  
**Target:** http://localhost:3000 (local)  
**Mode:** full, profile standard  
**Design sources:** Figma: Demo Shop / Checkout v3; docs/design-system.md  
**Agent budget:** 27 of 40 used  

## Release verdict: Don't ship

- Open S2 on P0 unit U-001 — QA-002: Sign-up rejects names with apostrophes or diacritics

## Summary

<!-- summary:start -->
This run tested sign-up and checkout (the two P0 journeys), the product catalogue, Paystack webhooks and the shared money, validation and HTTP helpers on a local build, against the spec and the Checkout v3 Figma file. Two S1 bugs were fixed behind new tests and independently verified: double-clicking Pay charged customers twice, and the Paystack secret key was shipped in the client bundle (the owner must still rotate that test key). Sign-up still rejects names with apostrophes or diacritics, which blocks many real users, so the build should not ship until that is fixed. Money helpers use float maths, and checkout drifts from the design and styles Remove like a primary action. The order detail API was referred for security review without being probed, and webhook replay could not be tested without a test signing secret. A tester caught the cart total briefly showing the old amount once on video; it did not reproduce in 10 runs, so it stays open as a lead for the next run rather than being dismissed.
<!-- summary:end -->

## Findings

| Severity | Found | Fixed | Open |
|---|---|---|---|
| S1 | 2 | 2 | 0 |
| S2 | 2 | 0 | 2 |
| S3 | 3 | 0 | 3 |
| S4 | 0 | 0 | 0 |

Verdicts: 6 confirmed, 1 flaky, 3 needs validation, 1 rejected.

### By check class

| Class | Found | Fixed | Open |
|---|---|---|---|
| code-quality | 1 | 0 | 1 |
| design | 1 | 0 | 1 |
| input | 1 | 0 | 1 |
| responsive | 1 | 0 | 1 |
| security | 1 | 1 | 0 |
| timing | 1 | 1 | 0 |
| ux | 1 | 0 | 1 |

### Open issues

| ID | Sev | Class | Verdict | Unit | Title | Fix status |
|---|---|---|---|---|---|---|
| QA-002 | S2 | input | confirmed | U-001 | Sign-up rejects names with apostrophes or diacritics | not attempted |
| QA-008 | S2 | code-quality | confirmed | U-005 | Money helpers add naira amounts as floats | not attempted |
| QA-003 | S3 | responsive | flaky | U-003 | Product grid overflows horizontally at 375px | not attempted |
| QA-006 | S3 | design | confirmed | U-002 | Checkout summary uses the wrong type scale and omits the delivery-fee row | not attempted |
| QA-007 | S3 | ux | confirmed | U-002 | 'Remove' on checkout is styled as a primary button, unlike the cart page | not attempted |

### Fixed

| ID | Sev | Title | Commit | Regression test |
|---|---|---|---|---|
| QA-001 | S1 | Double-clicking Pay creates two orders and two charges | f00dbab | tests/e2e/checkout-double-submit.spec.ts |
| QA-009 | S1 | Paystack secret key is shipped in the client bundle | be7c0de | tests/build/no-secrets-in-bundle.test.ts |

**Regression tests added:** 2 on branch `qa-audit/run-1`

## Coverage

6 units: 3 covered, 1 partial, 1 blocked, 0 not tested, 0 deferred, 1 out of scope. See COVERAGE.md.

## Next run focus

- Security review for QA-010: Order detail API may return another customer's order by id
- Hunt the unreproduced race QA-011 (0/10 so far): Cart total briefly shows the old amount after removing an item quickly
- U-003 [P1] /products — partial
- U-004 [P1] Paystack webhooks — blocked (No webhook signing secret for the test environment)
