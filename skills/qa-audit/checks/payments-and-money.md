# Payments and money

Use **sandbox or test keys only**. If only live keys are configured, mark every payment check `blocked` with the reason "no sandbox keys". Never run a live transaction.

## Arithmetic

- All money is stored and computed in minor units (kobo or cents) as integers or decimals, never floats. Search the code for money passing through `parseFloat` or `Number` and multiplication. Each hit is a lead.
- Line totals, subtotal, discounts, coupons, tax or VAT, shipping and fees add up to the grand total shown, the amount charged and the amount on the receipt. All four must be identical.
- Rounding matches the documented rule and is applied at the same step everywhere.
- Edge carts: quantity 0, 1, the maximum allowed and above it; a free item; a 100% discount; a coupon that pushes the total below zero; a coupon applied twice; an expired coupon.
- Currency: correct symbol and format (₦1,500.00), no mixed currencies in one cart, and a stale exchange rate.

## Checkout flow

- Prices or stock change between adding to cart and paying: does the user see the change before being charged?
- An item goes out of stock during checkout.
- Abandoning at the payment page, then returning: the cart and order state are sane and there is no charge.
- Refresh or back button on the payment confirmation page does **not** charge twice.
- Double-clicking "Pay" creates one charge (see `async-and-realtime.md`).

## Payment outcomes (sandbox)

Check each outcome your provider's sandbox supports (for example Paystack, Flutterwave or Stripe):

- success
- decline
- insufficient funds
- an expired card
- 3-D Secure or OTP challenge passed and failed
- network timeout mid-payment
- bank transfer or USSD pending → completed or expired

For each outcome, check three things: what the UI shows, the order status in the database, and the email sent.

## Webhooks

- The same event delivered twice gives **one** state change (idempotency).
- Events arriving out of order (`refund` before `charge.success`) don't corrupt the state.
- The webhook arrives before the user returns from the payment page, and after. Both paths end in the same final state.
- Signature verification is enforced. Check that the code does it; don't attack it.
- Webhook handler fails → provider retries → the eventual state is correct.

## Refunds, subscriptions and payouts

- Full and partial refunds update the order, the inventory and the user's view. You cannot refund more than was paid.
- Subscriptions: trial → paid, upgrade or downgrade with proration, a failed renewal → grace period or dunning → cancel, resubscribe.
- Payouts and balances: pending versus available amounts, and fees deducted exactly once.
