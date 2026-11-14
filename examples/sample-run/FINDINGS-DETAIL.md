# Findings detail (run 1)

## QA-001 [S1] Double-clicking Pay creates two orders and two charges

- **Verdict:** confirmed (3/3)
- **Class:** timing
- **Unit:** U-002
- **Found by:** tester-b02; **reproduced by:** reproducer-01
- **Environment:** url: http://localhost:3000/checkout, browser: chromium, viewport: 1440x900, build: a1b2c3d
- **Impact:** Customers are charged twice for one purchase
- **Likelihood:** Common on slow connections where the first click seems to do nothing

**Minimal repro**

1. Add any item to cart
2. Go to /checkout with Paystack test card
3. Double-click Pay

**Expected:** One order and one charge per checkout  
_Source: docs/spec.md#checkout: 'each checkout creates exactly one order'_

**Observed:** Two POST /api/orders requests, two orders, two Paystack charges

**Root cause (hypothesis):** `src/routes/checkout.tsx:88` — Pay button not disabled while request pending; API has no idempotency key

**Evidence:** `evidence/QA-001-network.har`, `evidence/QA-001-orders.png`

**Fix:** fixed in `f00dbab`, test `tests/e2e/checkout-double-submit.spec.ts`, 1 round(s); fixed by fixer-qa-001, verified by verifier-qa-001
  Fails without the fix with `one order per Pay click`; passes with it on every repeated run (checked by `evidence/QA-001-revert-check.json`)
  Original repro re-run by verifier-qa-001 on `be7c0de`: chromium 1440x900, 3 attempt(s), pass: Double-clicking Pay sends one POST /api/orders and creates one order and one charge
  Original repro re-run by verifier-qa-001 on `be7c0de`: webkit 390x844, 3 attempt(s), pass: Same on mobile WebKit; Pay is disabled while the order is pending
  Fix evidence: `evidence/QA-001-test-before.txt`, `evidence/QA-001-test-after.txt`, `evidence/QA-001-revert-check.json`, `evidence/QA-001-repro-after-chromium.zip`, `evidence/QA-001-repro-after-webkit.zip`
  Disabled button while pending and added idempotency key on POST /api/orders

## QA-009 [S1] Paystack secret key is shipped in the client bundle

- **Verdict:** confirmed (3/3)
- **Class:** security
- **Unit:** U-005
- **Found by:** tester-b05; **reproduced by:** reproducer-07
- **Impact:** Anyone can read the secret key and act on the merchant account
- **Likelihood:** Certain; the bundle is public

**Minimal repro**

1. npm run build
2. Search dist/assets for the PAYSTACK_SECRET prefix

**Expected:** Only the public key reaches the browser  
_Source: Paystack docs: 'never expose your secret key on the client'_

**Observed:** dist/assets/index-*.js contains a string starting sk_t…; value redacted in evidence

**Root cause (hypothesis):** `src/lib/http.ts:3` — Reads VITE_PAYSTACK_SECRET, which Vite inlines into the client

**Evidence:** `evidence/QA-009-bundle-scan-redacted.txt`

**Fix:** fixed in `be7c0de`, test `tests/build/no-secrets-in-bundle.test.ts`, 1 round(s); fixed by fixer-qa-009, verified by verifier-qa-009
  Fails without the fix with `bundle contains secret key prefix sk_t`; passes with it on every repeated run (checked by `evidence/QA-009-revert-check.json`)
  Original repro re-run by verifier-qa-009 on `be7c0de`: `npm run build && node scripts/scan-bundle-for-secrets.js dist/assets`, 3 attempt(s), pass: No secret key prefix in dist/assets; only the public key is present
  Fix evidence: `evidence/QA-009-test-before.txt`, `evidence/QA-009-test-after.txt`, `evidence/QA-009-revert-check.json`, `evidence/QA-009-repro-after.txt`
  Moved the charge call server-side. The exposed test key must still be rotated by the owner.

## QA-002 [S2] Sign-up rejects names with apostrophes or diacritics

- **Verdict:** confirmed (3/3)
- **Class:** input
- **Unit:** U-001
- **Found by:** tester-b01; **reproduced by:** reproducer-02
- **Environment:** url: http://localhost:3000/signup, browser: chromium, viewport: 1440x900, build: a1b2c3d
- **Impact:** Users with common Nigerian and Irish names cannot sign up with their real name
- **Likelihood:** Frequent for the target audience

**Minimal repro**

1. Open /signup
2. Enter name O'Neil
3. Submit

**Expected:** Names with apostrophes and diacritics are accepted  
_Source: docs/spec.md#signup: 'accept any real name'_

**Observed:** 'Name contains invalid characters' for Adébáyọ̀ and O'Neil

**Root cause (hypothesis):** `src/lib/validation.ts:12` — Name regex is /^[A-Za-z ]+$/

**Evidence:** `evidence/QA-002-error.png`

## QA-008 [S2] Money helpers add naira amounts as floats

- **Verdict:** confirmed (3/3)
- **Class:** code-quality
- **Unit:** U-005
- **Found by:** tester-b05; **reproduced by:** reproducer-06
- **Impact:** Totals with kobo values are off by ₦0.01 in some baskets
- **Likelihood:** Any basket mixing items priced with kobo

**Minimal repro**

1. Run node -e "console.log(require('./src/lib/money').addPrices(1999.99, 0.01))"

**Expected:** All money maths uses integer kobo  
_Source: CONTRIBUTING.md#money: 'store and compute money in minor units'_

**Observed:** addPrices(1999.99, 0.01) returns 2000.0000000000002, shown as ₦2,000.01 after rounding up

**Root cause (hypothesis):** `src/lib/money.ts:8` — Adds decimal naira then rounds with Math.ceil

**Evidence:** `evidence/QA-008-unit-output.txt`

## QA-003 [S3] Product grid overflows horizontally at 375px

- **Verdict:** flaky (4/10)
- **Class:** responsive
- **Unit:** U-003
- **Found by:** tester-b03; **reproduced by:** reproducer-03
- **Impact:** Sideways scrolling on phones; layout looks broken
- **Likelihood:** Only when a product title has a very long unbroken word

**Minimal repro**

1. Open /products at 375x812
2. Scroll to a product with a long title

**Expected:** No horizontal scroll at 375px  
_Source: docs/design-system.md#breakpoints_

**Observed:** Page width 412px at 375px viewport

**Evidence:** `evidence/QA-003-overflow.png`

## QA-006 [S3] Checkout summary uses the wrong type scale and omits the delivery-fee row

- **Verdict:** confirmed (3/3)
- **Class:** design
- **Unit:** U-002
- **Found by:** tester-b02; **reproduced by:** reproducer-04
- **Impact:** Order summary is harder to scan and hides how the total is made up
- **Likelihood:** Every checkout

**Minimal repro**

1. Add any item to cart
2. Open /checkout at 1440x900
3. Compare the summary card with the Figma frame

**Expected:** Summary uses text/body-md and shows Subtotal, Delivery, Discount and Total rows  
_Source: Figma: Demo Shop / Checkout v3, frame 'Order summary'_

**Observed:** Summary uses 12px text and has no Delivery row; delivery is folded into Total

**Evidence:** `evidence/QA-006-figma-vs-live.png`

## QA-007 [S3] 'Remove' on checkout is styled as a primary button, unlike the cart page

- **Verdict:** confirmed (3/3)
- **Class:** ux
- **Unit:** U-002
- **Found by:** tester-b02; **reproduced by:** reproducer-05
- **Impact:** Users can remove an item when they mean to continue; destructive action looks like the main action
- **Likelihood:** Likely on mobile where Remove sits above Pay

**Minimal repro**

1. Add an item
2. Open /cart and note the Remove style
3. Open /checkout and compare

**Expected:** Destructive actions use the danger-outline style, as on /cart  
_Source: Internal consistency: /cart Remove button (src/routes/cart.tsx:54); docs/design-system.md#buttons_

**Observed:** Checkout renders Remove with the solid primary style

**Evidence:** `evidence/QA-007-cart-vs-checkout.png`
