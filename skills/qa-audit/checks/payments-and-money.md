# Payments and money checks

#### When to use this file

Use this file for any unit that computes, shows, charges, refunds or pays out money: carts, checkout, invoices, wallets and balances, subscriptions, coupons, payouts and payment webhooks. It covers the `money` class. It applies to Paystack, Flutterwave and Stripe, and to bank transfer and USSD flows common in Nigeria and across Africa.

Use **sandbox or test keys only**. If only live keys are configured, mark every payment check `blocked` with the reason "no sandbox keys". Never run a live transaction. Use `async-and-realtime.md` for double-clicks and races, `api-and-integrations.md` for provider outages and timeouts, `time-and-locale.md` for currency display and billing dates, and `email-and-notifications.md` for receipts.

## Core discipline (include in every tester prompt for this domain)

```
- Sandbox keys and test cards only. Check the key prefix (pk_test_, sk_test_, FLWPUBK_TEST-) before the first payment. If the key looks live, stop and mark blocked.
- Compare four numbers for every order: the total shown, the amount sent to the provider, the amount stored, and the amount on the receipt. Any difference is a candidate.
- Work in minor units. Convert every amount to kobo or cents before comparing. Note which unit each API uses (Paystack and Stripe take minor units; some Flutterwave endpoints take major units).
- Check three things for each payment outcome: what the UI shows, the order status in the database or admin, and the email sent.
- Signature checks, amount tampering and replay attacks are security work. Confirm the code has a check; never forge requests to test it. Record gaps as security_referral.
```

## Arithmetic (check classes: `money`, `input`)

**Minor units, never floats**
Money should be stored and computed in minor units (kobo or cents) as integers or decimals. Search the code for money passing through `parseFloat`, `Number` and multiplication. Each hit is a lead, not a finding. A bug is a total that is off by a kobo or a cent on some cart, such as 3 × ₦333.33. Float use that never produces a wrong total on reachable values is a hardening note.

**Totals agree**
Line totals, subtotal, discounts, coupons, VAT (7.5% in Nigeria) or tax, shipping and fees must add up to the grand total shown, the amount charged and the amount on the receipt. All four must be identical. Any difference is S1.

**Rounding**
Rounding matches the documented rule and is applied at the same step everywhere (per line or on the total). A display that rounds differently from the charge is a candidate. Rounding you would choose differently is not.

**Edge carts**
Try quantity 0, 1, the maximum allowed and above it; a free item; a 100% discount; a coupon that pushes the total below zero; a coupon applied twice; an expired coupon. A bug is a negative total, a charge for ₦0 that the provider rejects with an unhandled error, or a coupon stacking when the spec says it can't.

**Currency**
Correct symbol and format (₦1,500.00, $1,500.00), no mixed currencies in one cart, and a stale exchange rate handled as specified. Display rules live in `time-and-locale.md`; the amount charged lives here.

## Checkout flow (check classes: `money`, `state`, `timing`)

**Price or stock changes before paying**
Change a price or stock level between adding to cart and paying. The user must see the change before being charged. Charging the old or new price without telling the user is a candidate.

**Out of stock during checkout**
An item sells out mid-checkout. The user is told before payment, or the payment is refunded automatically as specified.

**Abandonment**
Abandon at the payment page or close the Paystack or Flutterwave popup, then return. The cart and order state are sane and there is no charge. An order stuck as "paid" with no payment is S1.

**Refresh and Back on confirmation**
Refresh or press Back on the payment confirmation page and on the provider's callback URL. Neither may charge twice or create a second order.

**Double-click Pay**
Double-clicking "Pay" creates one charge. Count charges in the provider's test dashboard, not only in the app.

## Payment outcomes (check classes: `money`, `integration`, `errors`)

**Each sandbox outcome**
Check every outcome your provider's sandbox supports: success, decline, insufficient funds, an expired card, a 3-D Secure or OTP challenge passed and failed, a network timeout mid-payment, and bank transfer or USSD pending then completed or expired. Use the provider's documented test cards and test OTPs. For each one, record the UI, the order status and the email.

**Pending payments**
Bank transfer and USSD can stay pending for minutes. The order must show pending, not failed or paid, and must move to the right state when the payment completes or expires. A pending order that never resolves is a candidate.

**Verify before fulfilling**
After the redirect back from the provider, the app should verify the transaction server side (for example Paystack's verify endpoint) before marking the order paid. Trusting the redirect query string alone is a `security_referral`; do not tamper with it to prove it.

## Webhooks (check classes: `money`, `integration`, `timing`)

**Idempotency**
Deliver the same event twice (resend it from the provider's test dashboard). There must be **one** state change, one email and one stock movement.

**Out of order**
Events arriving out of order (`refund` before `charge.success`) must not corrupt the state. Use the dashboard or a local replay of captured sandbox events.

**Webhook before or after return**
The webhook can arrive before the user returns from the payment page, or after. Both paths must end in the same final state, with no duplicate order.

**Signature verification**
Check that the code verifies signatures (Paystack `x-paystack-signature`, Flutterwave `verif-hash`, Stripe `Stripe-Signature`). Read the code; don't attack it. A missing check is a `security_referral`.

**Handler failure and retry**
Make the handler fail once (mock a database error in the test environment). The provider retries, and the eventual state is correct.

## Refunds, subscriptions and payouts (check classes: `money`, `state`)

**Refunds**
Full and partial refunds update the order, the inventory and the user's view. You cannot refund more than was paid, including across several partial refunds.

**Subscriptions**
Check trial → paid, upgrade or downgrade with proration, a failed renewal → grace period or dunning → cancel, and resubscribe. Renewal dates near month ends belong to `time-and-locale.md` too.

**Payouts and balances**
Pending versus available amounts are correct, and fees are deducted exactly once. A balance that changes on page refresh is a candidate.

## Universal moves

- Open the provider's test dashboard next to the app. Its record of charges is the ground truth for "how many" and "how much".
- Build a small table per order: shown, sent, stored, receipt, in minor units. Attach it as evidence.
- Replay captured sandbox webhook events locally to test order and duplicates. Never send them to a shared environment without asking.

## Validation rules (apply before reporting ANY candidate here)

1. Prove the run used sandbox keys: the key prefix or the provider's test-mode banner.
2. Give the amounts in minor units at each point (shown, sent, stored, receipt) and the cart that produced them.
3. For duplicate charges or orders, include the provider dashboard record, not only the app's view.
4. For webhook candidates, include the event IDs, the order received, and the final state.
5. Use `confirmed` only after 3/3 reproductions on fresh carts. Use `needs_validation` when an outcome needs a sandbox feature you don't have (no test USSD, no 3-D Secure test card) and name it.
