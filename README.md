# qa-audit

A coding-agent skill that turns your agent into a **QA lead**. It finds bugs in a web product, proves each one, **fixes it behind a failing regression test**, has a separate agent verify every fix, and ends with a release verdict: **Ship / Ship with known issues / Don't ship**.

It covers functional behaviour, **design conformance** (against Figma or your design system), **UI/UX consistency**, accessibility, performance, **code quality** and a **passive security hygiene** pass. Every finding needs a cited source, so opinions stay out of the bug list.

It follows the multi-agent, evidence-first design of [Cloudflare's security-audit-skill](https://github.com/cloudflare/security-audit-skill), applied to product quality. It adds what QA needs and security auditing usually leaves out: test-first fixing and independent fix verification.

## What it does

The skill runs a structured audit in eight phases:

| Phase | What happens | Output |
|---|---|---|
| 0. Setup and baseline | Work out how to run the app, choose the profile and scope, record the existing test results | `run.json`, `baseline-tests.json` |
| 1. Reconnaissance | Map routes, roles, entities, forms, APIs, state machines, integrations, design sources, quality gates and **P0 journeys** | `architecture.md`, `coverage-ledger.json` |
| 2. Coverage-led testing | Isolated tester agents work through ledger units in parallel; a wildcard persona explores; a coverage critic finds gaps | `agents/<id>/result.json` |
| 3. Reproduction | A fresh agent tries to **disprove** every candidate | `confirmed` / `flaky` / `needs_validation` / `rejected` |
| 4. Structured findings | Schema-checked records | `findings.json` |
| 5. Fix | Failing test → minimal root-cause fix → full suite → **independent verifier** | One commit per bug on `qa-audit/run-N` |
| 6. Regression sweep | P0 journeys on Chromium and mobile WebKit, full suite, quality gates, retest of touched units | New candidates go back to Phase 3 |
| 7. Report | Generated from the validated records | `REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `COVERAGE.md`, `SUGGESTIONS.md` |

The verdicts are distinct:

- `confirmed` reproduced at least 3/3 from a clean state, by an agent other than the one that found it.
- `flaky` has an intermittent rate from at least 5 attempts.
- `needs_validation` names one exact unresolved fact and has no severity.
- `rejected` records why the candidate was disproved.

Multiple runs against the same repo are additive. The skill reads earlier ledgers and findings, targets the gaps, and re-verifies units whose source files changed.

## Files

| File | Purpose |
|------|---------|
| `skills/qa-audit/SKILL.md` | Modes, terminology, execution safety, setup, write isolation, profiles, budget, principles, workflow, anti-patterns |
| `RECONNAISSANCE.md` | Phases 0–1: run setup, baseline, architecture map, ledger |
| `TESTING.md` | Phase 2: tester brief, wildcard persona, coverage critic |
| `CHECK-CLASSES.md` | The 19 check classes, default classes per unit kind, and what counts as a source |
| `VALIDATION.md` | Phases 3–4: reproducer brief, verdict rules, severity, findings records |
| `FIXING.md` | Phases 5–6: fixer and verifier briefs, fix records, regression sweep |
| `REPORTING.md` | Phase 7: release verdict rules |
| `checks/forms-and-data.md` | Input validation and the data lifecycle |
| `checks/auth-and-accounts.md` | Sign-up, login, sessions, password reset, roles |
| `checks/payments-and-money.md` | Minor units, Paystack, Flutterwave and Stripe sandboxes, webhooks, refunds |
| `checks/api-and-integrations.md` | API contracts, third-party services, storage, background jobs |
| `checks/async-and-realtime.md` | Double submits, races, retries, realtime |
| `checks/frontend-ux.md` | Responsive, cross-browser, accessibility, lab performance |
| `checks/design-and-ux.md` | Design conformance and UI/UX consistency and heuristics |
| `checks/navigation-and-search.md` | Routing, deep links, redirects, search, filters, pagination |
| `checks/time-and-locale.md` | Timezones, DST, locale formats, translations, RTL |
| `checks/files-and-media.md` | Uploads, images, downloads, exports |
| `checks/email-and-notifications.md` | Email, SMS, push and in-app notifications |
| `checks/code-quality.md` | Project quality gates, error handling, duplication, tests, dependencies |
| `checks/security-hygiene.md` | Passive security checks; everything else is a referral |
| `schemas/*.schema.json` | JSON Schemas for `run.json`, `coverage-ledger.json`, `findings.json` and revert-check results |
| `scripts/validate-run.cjs` | Validator for `run.json` |
| `scripts/validate-coverage-ledger.cjs` | Validator for the ledger |
| `scripts/validate-findings.cjs` | Validator for findings, with ledger and run cross-checks |
| `scripts/check-fix-test.cjs` | Proves a regression test fails for the right reason: removes only the product fix and requires the bug's assertion |
| `scripts/generate-report.cjs` | Report generator; refuses to run on invalid records |
| `scripts/tests/` | `node:test` suites for the validators, the generator, the CLIs and doc consistency |
| `examples/sample-run/` | A complete example run with generated reports |

The phase, check, schema and script files live in `skills/qa-audit/`.

## Installation

Install the skill with the [Skills CLI](https://skills.sh):

```bash
npx skills add https://github.com/TGod-Ajayi/qa-audit-skill --skill qa-audit
```

Use `--global` for a user-level installation:

```bash
npx skills add https://github.com/TGod-Ajayi/qa-audit-skill --skill qa-audit --global
```

Run `npx skills --help` for agent-selection and non-interactive options.

## Usage

Start your coding agent in the repository of the app you want to test, then ask:

```
QA this app and fix what you find
```

```
check the checkout flow matches the Figma file
```

```
run a quick QA pass on staging, report only, don't change code
```

```
signup is broken for some users, find out why and fix it
```

The skill picks full, focused, report-only or guidance mode from the request. In full audit mode, run artifacts go to `~/qa-audit/<repo>/run-N/`, outside your repo. Code changes go only on the branch `qa-audit/run-N`.

**Profiles:** `quick` is a fast first look, `standard` is the default, and `deep` is for launches. You can also scope a run to paths or journeys and set an agent budget. Partial and over-budget runs are reported as partial and never claim full coverage.

## Validators

The scripts have **no dependencies**; you only need Node.js 18 or later. The validators enforce the bundled JSON Schemas exactly (unknown fields are errors), then the semantic rules:

- the evidence bar for each verdict
- a finder never reproduces its own bug, and a fixer never verifies its own fix
- fix proof: the test failed before, passes after, the suite is no worse than baseline, and an independent verifier signed off
- the test fails **for the right reason**: a machine-checked revert check, described below
- evidenced coverage for every unit marked `covered`
- safe relative evidence paths
- consistency between the run, ledger and findings records

They read input defensively: regular files only, no symlinks, size and depth limits, strict UTF-8, and escaped diagnostics.

```bash
node skills/qa-audit/scripts/validate-run.cjs <run>/run.json
node skills/qa-audit/scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
node skills/qa-audit/scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json --run <run>/run.json --run-dir <run>
node skills/qa-audit/scripts/generate-report.cjs <run>
npm test
```

### Does the test fail for the right reason?

Agents happily write a test that dies on a bad selector, then "fix" it by adding that selector. To stop that, the verifier runs:

```bash
node skills/qa-audit/scripts/check-fix-test.cjs --repo . --commit <fix sha> \
  --test-file tests/e2e/checkout-double-submit.spec.ts \
  --expect "one order per Pay click" \
  --out <run>/agents/verifier-qa-001/evidence/QA-001-revert-check.json \
  -- npx playwright test tests/e2e/checkout-double-submit.spec.ts
```

It reverse-applies only the fix's **non-test** changes and runs the test. The test must fail, and its output must contain the expected assertion message, which names the bug. Then it restores the fix and the test must pass. A timeout on a missing selector, a missing module or "no tests found" never prints that message, so the check fails. A signature that is itself a timeout or selector error is rejected outright. The JSON result is read back by `validate-findings.cjs --run-dir` and `generate-report.cjs`, so a fix can't be marked `fixed` without it.

See [`examples/sample-run/REPORT.md`](examples/sample-run/REPORT.md) for what a finished run looks like.

## Requirements

- A coding agent with tool use and **parallel sub-agents**, such as Claude Code. Without sub-agents, the skill runs each role in sequence from the written records and flags the weaker separation in the report.
- **Playwright**: the Playwright MCP server, `@playwright/cli` or `@playwright/test`.
- Your project's test runner, and its lint, typecheck and build commands.
- A local, preview or staging environment. The skill does not test production unless you say so, and even then it stays read-only.
- Test accounts, sandbox payment keys and a test inbox (Mailpit, MailHog, Mailosaur…). Without them, the related checks are marked `blocked` rather than faked.
- Optional: a Figma file (via the Figma MCP server) or a design system for `design` checks.

**Optional:** if the [Snagly](https://claude.com/plugins) QA skills are installed, qa-audit hands specialist checks to them: flow-runner, form-fuzzing, accessibility-audit, cross-browser-matrix, figma-compare, visual-regression, bug-triage, fix-verifier, e2e-codegen and others. Verdicts and fix proof still come from qa-audit's own phases.

## Design principles

- **Nothing is a bug until a different agent reproduces it.** The tester never confirms its own candidate.
- **Nothing is fixed until a failing test passes, and the failure is the bug.** A script removes the product fix and checks the test fails with the bug's own assertion. A different agent then re-runs the original repro and hunts for the same bug in sibling code.
- **Opinions aren't bugs.** Every finding cites its expected behaviour: a spec, a Figma frame, a design token, the app's own convention on another screen, WCAG, the project's lint config, or your statement. Taste goes into a separate suggestions list.
- **Coverage is evidence.** Untested areas are reported as gaps, never counted as passing.
- **Severity is user impact × likelihood**, not the number of checklist items that failed.
- **No cheating to green.** Fixers may not delete, skip or loosen tests, change expectations to match buggy output, swallow errors or add blind sleeps.
- **Multiple runs improve coverage.** Each run targets the gaps the last one left.

## Safety

- Only test data: no real emails, no real payments, no real customer records.
- Security checks are **passive**: secrets in the bundle, cookie flags, headers, CORS config, known-vulnerable dependencies, and auth enforced only in the UI (checked with QA's own test accounts). Anything that would need probing is recorded as a `security_referral` and never probed. For a real security audit, use [security-audit-skill](https://github.com/cloudflare/security-audit-skill).
- Secrets found are redacted to their first 4 characters and never committed.
- The skill never commits to your default branch, pushes or opens PRs unless you ask.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). New domain checklists in `checks/` (mobile web, PWAs, e-learning, marketplaces…) and validator improvements are especially welcome.

## License

MIT © Thankgod Ajayi ([@TGod-Ajayi](https://github.com/TGod-Ajayi)). See [LICENSE](LICENSE).
