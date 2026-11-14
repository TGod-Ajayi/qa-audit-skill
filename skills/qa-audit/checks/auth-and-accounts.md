# Auth and accounts checks

#### When to use this file

Use this file for any unit that needs a logged-in user, and for the account lifecycle itself: sign-up, verification, login, social login, sessions, password reset and change, roles and permissions, invites, profile changes and account deletion. It covers the `auth` class.

This file checks whether the account lifecycle **works correctly**. It does not cover attacking it. Anything that looks exploitable is a `security_referral`: record it and stop. Use `email-and-notifications.md` for whether the verification, reset and invite emails arrive and read correctly. Use `security-hygiene.md` for cookie flags, password policy and UI-only auth. Use `navigation-and-search.md` for redirect-after-login routing. Use `async-and-realtime.md` for cross-tab sync timing.

## Core discipline (include in every tester prompt for this domain)

```
- Use dedicated test accounts for every role. Never log in as a real user and never type real secrets into page snapshots. Reuse saved sessions where you can.
- The expected behaviour must come from the spec, UI copy or documented policy. "Most sites log you out here" is not a source.
- Check the UI and the API for every role-and-action pair. The API result is the one that decides whether a permission bug is real.
- If a check shows access to another account's data, or an action the role should not have, set security_referral: true and stop. Do not repeat it with other IDs, tokens or users.
- Never search for undocumented rate limits or lockouts by trial and error. Test only the limits the product documents.
```

## Sign-up and verification (check classes: `auth`, `happy-path`, `input`)

**Sign-up happy path**
Sign up with valid data. The verification email arrives, the link works once, and a second click shows a sensible message. A bug is a link that fails on first use, or a second click that errors with a 500 or a blank page. A second click that says "already verified" is correct.

**Expired verification link**
Use a link past its documented expiry (or ask for a short expiry in the test environment). It must give a clear message and a working way to resend. Not a bug: an expired link failing; that is the point. A bug is a dead end with no resend path.

**Duplicate email**
Sign up with an existing email in different case and with surrounding whitespace. A bug is a second account for the same person, or a 500. Whether the message reveals that the email exists is a product decision; flag it as a referral only if the spec says it must not.

**Unverified access**
List what an unverified user can reach and compare it with the spec. A bug is access to a feature the spec gates behind verification, in the UI or the API.

## Login (check classes: `auth`, `errors`, `navigation`)

**Credential outcomes**
Try correct credentials, a wrong password and an unknown email. The messages must match the spec. Different messages for "wrong password" and "unknown email" are a referral only when the spec requires them to be the same.

**Documented lockout**
If a lockout or rate limit is documented, check it behaves as documented, then wait it out. Never probe for an undocumented limit.

**Remember me**
With "remember me", the user stays signed in after a full browser restart. Without it, the session ends as designed. Use a persistent browser context to simulate the restart.

**Return to the original page**
Open a protected deep link while logged out, log in, and check you land on that page, with its query string intact. Landing on the dashboard instead is a candidate when the spec or common UI copy promises the return.

**Social and OAuth login**
Check first login, a returning user, and an email that already has a password account. A bug is a duplicate account, a lost link between the two, or an unhandled error page when the user cancels at the provider. Use provider test apps only.

## Sessions (check classes: `auth`, `state`, `timing`)

**Expiry mid-flow**
Expire the session in the middle of a form (clear or expire the cookie). The user is sent to login, and their work is kept or the loss is clearly explained. A silent failure that looks like a save is S2 or worse.

**Logout in another tab**
Log out in one tab. The other tab must reflect it on its next action. A tab that keeps writing data after logout is a candidate, and a `security_referral` if the server accepts the writes.

**Back after logout**
Press Back after logout. Cached pages may show briefly, but no action on them may succeed and no fresh data may load. Fresh authenticated data after logout is a referral.

**Concurrent devices**
Log in on two browser contexts as one user. Check that both behave as specified (both allowed, or the older one ends).

## Password reset and change (check classes: `auth`, `state`)

**Reset link lifecycle**
The reset link works once and expires as documented. Requesting a new link invalidates the old one, if the spec says so. Reusing a used link that still works is a referral, not a probe target.

**Unknown email**
Resetting for an unknown email shows the same message as for a known one, if the spec says so.

**Change logs out other sessions**
After a password change, other sessions end if the spec says so. Check with a second browser context.

## Roles and permissions (check classes: `auth`, `state`)

**Role × action matrix**
Build a matrix from `architecture.md`. For each cell, record the UI state (visible or hidden, enabled or disabled) and the API result (allowed or 403). A UI that hides an action the role may do is a functional bug. **An API that allows an action the UI hides or the spec forbids is a security finding.** Check it once with your own lower-privilege test account on another test account's record, as `security-hygiene.md` describes, then stop.

**Invites**
Check invite, accept, acceptance with a different email, an expired invite and a revoked invite. A revoked invite that still works is a referral.

**Role changes**
Change a user's role while they are logged in. The change takes effect on their next request or as documented. Stale permissions that survive past the documented point are a candidate.

## Account management (check classes: `state`, `happy-path`)

**Profile updates**
Changes persist after reload and re-login. Changing an email triggers re-verification if specified, and login works with the new email only after that.

**Account deletion**
Data is removed or anonymised as the spec says. The user can no longer log in. Shared items (team documents, comments, orders) behave as specified.

## Universal moves

- Keep one browser context per role, plus one logged-out context. Switch contexts rather than logging in and out in one.
- For every permission check, capture the API request and response next to the screenshot.
- Simulate time-based expiry by asking for a short test expiry or by expiring the cookie. Do not edit server clocks in shared environments.

## Validation rules (apply before reporting ANY candidate here)

1. Name the account role, the session state (fresh, expired, logged out elsewhere) and the action.
2. Cite the policy that sets the expected behaviour: spec, UI copy or documented setting.
3. For permission candidates, include the API request and response. A UI-only difference with a correct API is a functional bug, not a referral.
4. Anything that grants access across accounts or roles is handled under `security-hygiene.md`: one call with QA's own test accounts, then stop. Anything that would need more probing goes in as `security_referral: true` with `needs_validation`.
5. Use `needs_validation` when the expiry time, lockout policy or role matrix is undocumented, and name who owns that policy.
