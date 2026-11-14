---
name: qa-audit
description: Full QA audit of a web app or API. Maps what to test, tests it with isolated agents against a coverage ledger, independently reproduces every bug, fixes each one behind a failing regression test, verifies fixes with a separate agent, and reports a release verdict. Use for "QA this app", "find and fix bugs", "make sure X works before launch", "run a QA pass", or a single broken flow.
---

# QA Audit

This skill turns the agent into a QA lead that finds, proves and fixes bugs in a web product. Separate agents run each stage: reconnaissance, coverage-led testing, adversarial reproduction, structured findings, test-first fixing, independent fix verification, a regression sweep, and reporting.

Two rules carry the whole design:

- **Nothing is a bug until a different agent has reproduced it.**
- **Nothing is fixed until a failing test passes and a different agent has re-run the original repro.**

## Modes

| Mode | Triggers | What runs |
|---|---|---|
| **Full audit** | "QA this app", "find and fix bugs before launch", "run a full QA pass", "make sure the product works end to end" | All phases, all artifacts |
| **Focused** | One flow or one reported bug: "checkout is broken", "test the signup form", "is password reset working" | Recon of that area only → reproduce → failing test → fix → independent verify. The finder/verifier separation still applies. Write artifacts only if the user asks. |
| **Report-only** | "don't change code", "just tell me what's broken" | Phases 0–4 and 7. No Phase 5 or 6. |
| **Guidance** | QA questions with no target ("how should I test webhooks?") | Answer from `CHECK-CLASSES.md` and the `checks/` files. No run. |

If the user doesn't say whether fixing is allowed: when they're present, ask once. When they're away, run full audit mode with fixes on a branch only, and say so at the top of the report.

## Requirements

- A coding agent with tool use and **parallel sub-agents**. Without sub-agents, run each role one after another, working only from the written records (ledger, candidate files, findings) and never from what you remember of earlier roles. Record `"separation": "sequential"` in the run metadata.
- A way to run the app (local dev server, preview or staging URL). Do **not** test against production unless the user explicitly says so; production runs are read-only.
- Playwright: the Playwright MCP server, `@playwright/cli`, or `@playwright/test`.
- The project's own test runner.
- Node.js 18 or later for the scripts in `scripts/`. They have no dependencies.
- Optional: the Snagly QA skills. If they are installed, use them for specialist checks (see "Using companion skills" below). The rules in this skill still govern verdicts and fixes.

## Files

| File | Read it when |
|---|---|
| `RECONNAISSANCE.md` | Phases 0–1: setup, baseline, architecture map, ledger |
| `TESTING.md` | Phase 2: tester orchestration, tester brief, coverage critic |
| `CHECK-CLASSES.md` | Assigning check classes to units; the core QA checklist |
| `checks/*.md` | Deeper checklists per domain: forms and data, auth and accounts, payments and money, API and integrations, async and realtime, frontend UX (responsive, a11y, performance), email and notifications |
| `VALIDATION.md` | Phases 3–4: reproduction, verdicts, severity, findings records |
| `FIXING.md` | Phases 5–6: test-first fixes, fix verification, regression sweep |
| `REPORTING.md` | Phase 7: generating and checking the reports |
| `schemas/*.json` | Exact shapes of `coverage-ledger.json` and `findings.json` |
| `scripts/*.cjs` | Validators and the report generator |

Read each phase file when you reach that phase, not all at once.

## Principles

1. **A bug is a reproduced gap between expected and observed behaviour.** The expected behaviour must have a cited source: a spec, a ticket, UI copy, a type, schema or validation rule, an API contract, a documented platform convention, or the user's own statement. Your taste is not a source. Design and copy opinions are `suggestions`, not findings.
2. **Separation of duties.** Tester, reproducer, fixer and fix verifier are always different agents with fresh context.
3. **Test before fix.** Every confirmed bug gets an automated test that fails for the right reason before any production code changes.
4. **A fix needs proof:** the test failed before and passes after; the full suite is no worse than the baseline; an independent agent re-ran the original repro and saw correct behaviour.
5. **Severity is user impact × likelihood.** It is not the number of checklist items that failed.
6. **Coverage is evidence.** A ledger unit is `covered` only when its recorded checks have evidence. "Not tested" never means "passing", and the reports say so explicitly.
7. **Safe data only.** Use test accounts, sandbox payment keys, test inboxes and seeded data. Never send real emails or SMS, take real money, or touch real customer data. Delete what you create.
8. **Runs build on each other.** Read earlier runs, target the gaps, re-verify units whose source files changed, and carry evidence forward only when it is tied to unchanged source.
9. **Stay in QA's lane on security.** Note anything that looks exploitable as `security_referral` and stop there. Do not probe it. Recommend a dedicated security audit.

## Terminology

- **Unit:** one ledger entry. A journey, page, form, entity, API endpoint, state machine, integration or cross-cutting concern.
- **Check class:** a category of checks (input, state, timing…) from `CHECK-CLASSES.md`.
- **Candidate:** a suspected bug reported by a tester. Testers never assign verdicts.
- **Finding:** a candidate after validation, with a verdict:
  - `confirmed`: reproduced at least 3 out of 3 times from a clean state, with a sourced expectation and a minimal repro.
  - `flaky`: reproduces intermittently. Record the rate, such as `2/10`.
  - `needs_validation`: grounded in evidence but blocked by one exact unresolved fact (missing credentials, environment or data). It has no severity.
  - `rejected`: disproved, a duplicate, an environment artifact, or not a bug. Record the reason.
- **Fix verdict:** `fixed`, `not_fixed`, `regressed` or `needs_human`.
- **Suggestion:** a UX, copy or design improvement with no sourced expectation. Reported separately and never fixed automatically.

## Run layout

Default: `~/qa-audit/<repo-name>/run-<N>/`. Write inside the repo only if the user picks a directory that git ignores.

```
run-<N>/
  run.json                 # metadata: target, build sha, mode, separation, started/finished
  baseline-tests.json      # test results before any change
  architecture.md
  coverage-ledger.json
  candidates/<batch>.json  # raw tester output
  findings.json
  evidence/                # screenshots, traces, logs: QA-007-*.png, U-012-trace.zip
  REPORT.md  FINDINGS-DETAIL.md  NEEDS-VALIDATION.md  COVERAGE.md  SUGGESTIONS.md
```

Code changes go only on the branch `qa-audit/run-<N>`, with one commit per finding. Never commit to the default branch, never push, and never open a PR unless the user asks.

## Workflow

| Phase | Name | Output | Gate |
|---|---|---|---|
| 0 | Setup and baseline | `run.json`, `baseline-tests.json` | App loads; baseline recorded |
| 1 | Reconnaissance | `architecture.md`, `coverage-ledger.json` | `validate-coverage-ledger.cjs` passes |
| 2 | Coverage-led testing | `candidates/*.json`, ledger updates | Critic finds no material gaps, or the budget is spent; ledger validates |
| 3 | Reproduction | verdict per candidate | Every candidate has a verdict |
| 4 | Structured findings | `findings.json` | `validate-findings.cjs --ledger` passes |
| 5 | Fix | commits on the branch, `fix` records | Each fix is independently verified; findings validate |
| 6 | Regression sweep | new candidates, if any → back to Phase 3 | P0 journeys and the full suite pass |
| 7 | Report | reports | `generate-report.cjs` runs clean |

Script commands, run from the skill directory:

```bash
node scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
node scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json
node scripts/generate-report.cjs <run>
```

Run the ledger validator after creating the ledger and after every update. Run the findings validator after Phase 4 and after every Phase 5 change. Fix any validation error before moving on.

## Using companion skills

If the Snagly skills are installed, hand these checks to them and record their results as evidence on the ledger unit:

- discovery → `scenario-mapper`
- journeys → `flow-runner`
- create/read/update/delete → `crud-tester`
- input → `form-fuzzing`
- error, empty and loading states → `network-assertion`
- sessions → `auth-session-audit`
- email → `email-verification`
- a11y → `accessibility-audit`
- performance → `performance-audit`
- browsers → `cross-browser-matrix`
- reproduction → `bug-triage`
- re-checking fixes → `fix-verifier`
- e2e test code → `e2e-codegen`

Their outputs are candidates or evidence. Verdicts and fix proof still come from this skill's phases.

## Anti-patterns

- Reporting a bug that a second agent hasn't reproduced, or one with no sourced expectation.
- The finder confirming its own bug, or the fixer verifying its own fix.
- Changing production code before a failing test exists.
- Getting to green by deleting, skipping, loosening or `.only`-ing tests, by changing expected values to match buggy output, by swallowing errors, or by adding blind retries and sleeps.
- Marking a unit `covered` because someone "looked at it".
- Logging design taste as bugs. Those are suggestions.
- Calling a missing second layer a bug when another layer already prevents the failure. That is a hardening note.
- Destructive actions on shared or production data.
- Declaring the job done after one pass. Recommend the next run's focus from `COVERAGE.md`.
