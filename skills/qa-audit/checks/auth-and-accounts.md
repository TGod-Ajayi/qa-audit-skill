# Auth and accounts (functional)

This file covers whether the account lifecycle **works correctly**. It does not cover attacking it. Mark anything that looks exploitable with `security_referral: true` and stop there.

## Sign-up and verification

- Sign up with valid data → verification email arrives → the link works once → a second click shows a sensible message.
- A verification link that has expired gives a clear message and a working way to resend.
- Signing up with an existing email, including different case or surrounding whitespace, is handled cleanly.
- What can an unverified user reach? Compare it with the spec.

## Login

- Correct credentials; a wrong password; an unknown email. The messages should match the spec.
- The documented lockout or rate limit, if one exists, behaves as documented. Never search for undocumented limits.
- "Remember me" keeps the user signed in after the browser restarts. Without it, the session ends as designed.
- After login, the user is redirected back to the page they were trying to open.
- Social and OAuth login: first login, a returning user, and the same email as an existing password account.

## Sessions

- The session expires mid-flow (simulate by clearing or expiring the cookie). The user is sent to login and their work is kept or the loss is clearly explained.
- Logout in one tab is reflected in other tabs on their next action.
- Back button after logout does not show authenticated data that still works.
- Concurrent sessions on two devices behave as specified.

## Password reset and change

- The reset link works once and expires as documented. Requesting a new link makes the old one invalid, if the spec says so.
- Resetting for an unknown email shows the same message as for a known one, if the spec says so.
- Changing the password logs out other sessions, if the spec says so.

## Roles and permissions

- Build a role × action matrix from `architecture.md`. For each cell, check the UI: is the action visible or hidden, enabled or disabled?
- For each cell, check the API: is the call allowed or does it return 403?
- **If the API allows an action that the UI hides, set `security_referral`.**
- Invite flows: invite, accept, a wrong-email acceptance, an expired invite, a revoked invite.
- Changing a user's role takes effect without stale permissions surviving.

## Account management

- Profile updates persist. Changing an email triggers re-verification if specified.
- Account deletion: data is removed or anonymised as the spec says. The user can no longer log in. Shared items behave as specified.
