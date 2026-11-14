# Email, SMS and notifications

Use a **test-controlled inbox**: Mailpit or MailHog locally, Mailosaur, Mailtrap, or a provider's sandbox. Never send to real addresses. If there is no test inbox, mark these checks `blocked` with the reason "no test inbox".

## Delivery

- Each email the app promises (welcome, verification, password reset, invite, receipt, shipping, alerts) actually arrives, and arrives **once**.
- It arrives within a reasonable time. Record the delay.
- When the UI says "we sent you an email", an email was actually sent. Compare with the inbox.

## Content

- The recipient, subject, sender name and reply-to are correct.
- Personalisation is filled in: no `{{name}}`, `undefined` or empty greetings. Unicode names render correctly.
- Amounts, dates, order numbers and items match the database and the UI exactly, including currency format and timezone.
- There is a plain-text part, and it reads correctly.
- Rendering is reasonable at mobile width.

## Links

- Every link works when opened in a **fresh** browser context, without the original session.
- Links point to the right environment. A staging email must never link to production.
- Token links (verify, reset, magic login, invite): they work once, expire as specified, and fail with a clear message afterwards (see `auth-and-accounts.md`).
- Unsubscribe and notification-preference links work, and the preference is honoured on the next send.

## SMS and push

- Same checks as email for delivery, content and links, through the provider's test numbers or sandbox.
- OTP codes: they expire, are single use, and a resend makes the old code invalid if the spec says so.
- In-app notifications: they appear in real time (see `async-and-realtime.md`), can be marked read, and the counts stay in sync across tabs and devices.
