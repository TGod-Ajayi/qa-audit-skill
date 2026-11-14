# QA audit report — demo-shop (run 1)

**Build:** `a1b2c3d`  
**Target:** http://localhost:3000  
**Mode:** full  

## Release verdict: Don't ship

- Open S2 on P0 unit U-001 — QA-002: Sign-up rejects names with apostrophes or diacritics

## Summary

<!-- summary:start -->
This run tested sign-up and checkout (the two P0 journeys), the product catalogue and Paystack webhooks on a local build. The most serious bug, double-clicking Pay charging customers twice, was fixed behind a new e2e test and independently verified. Sign-up still rejects names with apostrophes or diacritics, which blocks many real users, so the build should not ship until that is fixed. Webhook replay could not be tested without a test signing secret.
<!-- summary:end -->

## Findings

| Severity | Found | Fixed | Open |
|---|---|---|---|
| S1 | 1 | 1 | 0 |
| S2 | 1 | 0 | 1 |
| S3 | 1 | 0 | 1 |
| S4 | 0 | 0 | 0 |

Verdicts: 2 confirmed, 1 flaky, 1 needs validation, 1 rejected.

### Open issues

| ID | Sev | Verdict | Unit | Title | Fix status |
|---|---|---|---|---|---|
| QA-002 | S2 | confirmed | U-001 | Sign-up rejects names with apostrophes or diacritics | not attempted |
| QA-003 | S3 | flaky | U-003 | Product grid overflows horizontally at 375px | not attempted |

### Fixed

| ID | Sev | Title | Commit | Regression test |
|---|---|---|---|---|
| QA-001 | S1 | Double-clicking Pay creates two orders and two charges | f00dbab | tests/e2e/checkout-double-submit.spec.ts |

**Regression tests added:** 1 on branch `qa-audit/run-1`

## Coverage

4 units: 2 covered, 1 partial, 1 blocked, 0 not tested. See COVERAGE.md.

## Next run focus

- U-003 [P1] /products — partial
- U-004 [P1] Paystack webhooks — blocked (No webhook signing secret for the test environment)
