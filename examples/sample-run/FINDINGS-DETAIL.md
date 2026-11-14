# Findings detail (run 1)

## QA-001 [S1] Double-clicking Pay creates two orders and two charges

- **Verdict:** confirmed (3/3)
- **Unit:** U-002
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

**Fix:** fixed in `f00dbab`, test `tests/e2e/checkout-double-submit.spec.ts`, 1 round(s)
  Disabled button while pending and added idempotency key on POST /api/orders

## QA-002 [S2] Sign-up rejects names with apostrophes or diacritics

- **Verdict:** confirmed (3/3)
- **Unit:** U-001
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

## QA-003 [S3] Product grid overflows horizontally at 375px

- **Verdict:** flaky (4/10)
- **Unit:** U-003
- **Impact:** Sideways scrolling on phones; layout looks broken
- **Likelihood:** Only when a product title has a very long unbroken word

**Minimal repro**

1. Open /products at 375x812
2. Scroll to a product with a long title

**Expected:** No horizontal scroll at 375px  
_Source: Design system: responsive breakpoints_

**Observed:** Page width 412px at 375px viewport

**Evidence:** `evidence/QA-003-overflow.png`
