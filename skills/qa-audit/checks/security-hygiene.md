# Security hygiene checks

#### When to use this file

Use this file for a non-invasive security pass that QA may confirm itself, on `code`, `page`, `api` and cross-cutting units. It covers the `security` class: secrets, exposed files, cookie flags, security headers, CORS config, known-vulnerable dependencies, sensitive data in URLs and logs, verbose errors, UI-only auth checked with QA's own accounts, documented password and rate-limit policy, and upload type rules.

This is not a security audit. Anything that would need active probing to confirm is a `security_referral` with verdict `needs_validation`, routed to a dedicated security audit (recommend Cloudflare's security-audit skill). Use `auth-and-accounts.md` for functional login and roles, `files-and-media.md` for upload behaviour, and `code-quality.md` for dependency health that isn't a vulnerability.

## Core discipline (include in every tester prompt for this domain)

```
- Never attempt exploitation, injection payloads, brute force, denial of service, other users' data, or anything against production. Read config, send ordinary requests, and observe.
- Use only the skill's own test accounts. An auth check uses a lower-privilege test account on records owned by another test account. Never a real user.
- If confirming a candidate would need active probing, stop. Record security_referral: true, verdict needs_validation, and the observation that raised it.
- Report the minimum detail needed to fix. Never write a working exploit. Redact secrets to their first 4 characters (sk_l****).
- Severity uses the S1–S4 user-impact scale. A leaked live secret, or a missing server-side auth check on someone else's data, is S1.
```

## Secrets and exposed files (check classes: `security`, `hygiene`)

**Secrets in the repo**
Search the repo and git-tracked files for API keys, private keys and tokens (`sk_live_`, `sk_test_`, `FLWSECK`, `AKIA`, `-----BEGIN`). A live secret in the repo is S1. A test key is S3 unless it unlocks shared resources. Never use a found key; record where it is and its first 4 characters.

**Secrets in the client bundle**
Search the built JS and source maps served to the browser. Public keys meant for the client (`pk_test_`, `pk_live_`, a Paystack public key) are not findings. Secret keys are.

**Public source maps**
Source maps served in production are a hygiene note unless the spec forbids them or they contain secrets.

**Exposed files**
Request `/.env`, `/.git/config`, `/backup.zip`, `/.DS_Store` once each with a plain GET. A 200 with real content is a candidate (S1 if it holds secrets). Do not crawl or guess further paths.

## Cookies, headers and CORS (check classes: `security`, `contract`)

**Session cookie flags**
Read the session cookie in the browser. It should have `HttpOnly`, `Secure` (on HTTPS) and `SameSite=Lax` or `Strict`, unless the spec explains otherwise. A missing flag is a candidate; how it could be abused is for the referral.

**Security headers**
Read the response headers on the main HTML page: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` or CSP `frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. A missing header is S3 or S4. Do not test whether the page can be framed or scripted.

**CORS**
Read the CORS config, or send one OPTIONS request with an unrelated `Origin`. A response that reflects the arbitrary origin with `Access-Control-Allow-Credentials: true` is a candidate. Stop at the one request.

## Dependencies (check classes: `security`, `code-quality`)

**Known-vulnerable packages**
Run `npm audit`, `pnpm audit` or `pip-audit`. A high or critical advisory is a candidate only when the vulnerable function is on a reachable path (cite the import and call site). Unreachable or dev-only advisories are notes.

## Data exposure (check classes: `security`, `errors`)

**Sensitive data in URLs**
Tokens, emails, phone numbers or passwords in query strings during normal use. They leak into logs and referrers. A reset token in a link is expected; a session token in the URL is a candidate.

**Logs and analytics**
Check browser console output, server logs in the test environment, and analytics calls in the network log for passwords, card numbers, OTPs or full tokens. Any of these is a candidate.

**Verbose errors**
Trigger ordinary errors (unknown ID, invalid form). A stack trace, SQL text or file path shown to the user is a candidate. Don't craft input meant to cause deeper errors.

## Access and policy (check classes: `security`, `auth`)

**Auth enforced only in the UI**
Log in as a lower-privilege test account and call an endpoint for an action the UI hides from that role, on a record owned by another test account. If it succeeds, that is a confirmed finding (S1 if it touches another account's data). Stop after one call; don't enumerate IDs or try other accounts.

**Password policy and rate limiting**
Check the documented password rules on sign-up and change, and the documented lockout or rate limit with at most the documented number of attempts. Never search for undocumented limits.

**Upload types**
Read the allowed-type config and try uploading a harmless file with a disallowed extension (an empty `.html`). If executable types are accepted, record a referral. Never upload working scripts.

## Universal moves

- Start from config: cookie settings, header middleware, CORS setup, upload rules. Then confirm each with one ordinary request.
- Keep a log of every request sent in this pass, so the security team can see QA stayed non-invasive.
- When in doubt whether a check is invasive, treat it as invasive and refer it.

## Validation rules (apply before reporting ANY candidate here)

1. Cite the config line, response header or command output that shows the issue. Redact secrets to 4 characters.
2. Confirm the environment is not production, except for passive header reads the user approved.
3. For UI-only auth, give the role, the endpoint and the response, with both test accounts named by their test IDs.
4. For dependencies, show the reachable call path. Without one, it is a note.
5. Use `confirmed` only for passive observations (config, headers, one ordinary request) seen 3/3. Anything needing more is `security_referral: true` with `needs_validation` and `blocking_fact: "Needs security review; not probed by QA"`.
