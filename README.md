# qa-audit-skill

A coding-agent skill that turns your agent into a **QA lead**. It finds bugs in a web product, proves each one, **fixes it behind a failing regression test**, has a separate agent verify every fix, and ends with a release verdict: **Ship / Ship with known issues / Don't ship**.

It is modelled on the multi-agent, evidence-first design of [Cloudflare's security-audit-skill](https://github.com/cloudflare/security-audit-skill), applied to product quality instead of vulnerabilities. It adds what QA needs and security auditing usually leaves out: **test-first fixing and fix verification**.

```
npx skills add https://github.com/TGod-Ajayi/qa-audit-skill --skill qa-audit
```

Then ask your agent things like:

- "QA this app and fix what you find"
- "Make sure checkout works end to end before launch"
- "Run a QA pass on staging, report only, don't change code"
- "Signup is broken for some users, find out why and fix it"

---

## Why

Most "AI QA" stops at *"I clicked around and it looked fine."* This skill works differently:

- **Nothing is a bug until a different agent reproduces it.** The tester who reports a candidate never confirms it. A fresh reproducer tries to **disprove** it: it reruns the repro from a clean state at least 3 times, checks that the expected behaviour has a real source, and cuts the bug down to a minimal repro.
- **Nothing is fixed until a failing test passes.** Every confirmed bug gets a regression test that fails for the right reason *before* the fix. A different agent then reruns the original repro in a real browser and looks for the same bug in sibling code.
- **Coverage is evidence, not vibes.** A coverage ledger records what was actually exercised, with screenshots, traces and logs. Untested areas are reported as gaps, never counted as passing.
- **Opinions aren't bugs.** Expected behaviour must cite a source: a spec, a ticket, UI copy, a schema, an API contract, or your own statement. Design taste goes into a separate suggestions list.
- **Getting to green by cheating isn't allowed.** Fixers may not delete, skip or loosen tests, change expectations to match buggy output, swallow errors or add blind sleeps.

## How it works

| Phase | What happens | Output |
|---|---|---|
| 0. Setup and baseline | Work out how to run the app, record the existing test results | `run.json`, `baseline-tests.json` |
| 1. Reconnaissance | Map routes, roles, entities, forms, APIs, state machines, integrations and **P0 journeys** | `architecture.md`, `coverage-ledger.json` |
| 2. Coverage-led testing | Isolated tester agents work through ledger units in parallel; a wildcard "real user" persona explores; a coverage critic finds gaps | `candidates/*.json` |
| 3. Reproduction | A fresh agent tries to disprove every candidate | `confirmed` / `flaky` / `needs_validation` / `rejected` |
| 4. Structured findings | Schema-checked records | `findings.json` |
| 5. Fix | Failing test → minimal root-cause fix → full suite → **independent verifier** | One commit per bug on `qa-audit/run-N` |
| 6. Regression sweep | P0 journeys on Chromium and mobile WebKit, full suite, retest of touched units | New candidates go back to Phase 3 |
| 7. Report | Generated from the validated records | `REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `COVERAGE.md`, `SUGGESTIONS.md` |

**Check classes** (QA's version of attack classes): happy-path, input, state and data lifecycle, navigation, auth and roles (functional), error/empty/loading states, timing and concurrency, money, time and locale, integrations, API contract, responsive and cross-browser, accessibility, performance and hygiene. Deeper checklists live in [`skills/qa-audit/checks/`](skills/qa-audit/checks/):

- forms and data
- auth and accounts
- payments and money (including Paystack, Flutterwave and Stripe sandboxes)
- API and integrations
- async and realtime
- frontend UX
- email and notifications

**Modes:** full audit, focused (one flow or bug), report-only (no code changes), and guidance (questions only).

## Repository layout

```
skills/qa-audit/
  SKILL.md                 # entry point: modes, principles, terminology, workflow, anti-patterns
  RECONNAISSANCE.md        # phases 0–1
  TESTING.md               # phase 2: tester brief, wildcard persona, coverage critic
  CHECK-CLASSES.md         # core checklist and default classes per unit kind
  VALIDATION.md            # phases 3–4: reproducer brief, verdicts, severity
  FIXING.md                # phases 5–6: fixer and fix-verifier briefs, regression sweep
  REPORTING.md             # phase 7: release verdict rules
  checks/                  # domain checklists
  schemas/                 # JSON Schemas for the ledger and findings
  scripts/
    validate-coverage-ledger.cjs
    validate-findings.cjs
    generate-report.cjs
    tests/                 # node:test suites
examples/sample-run/       # a complete example run with generated reports
```

The scripts have **no dependencies**; you only need Node.js 18 or later.

```bash
node skills/qa-audit/scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
node skills/qa-audit/scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json
node skills/qa-audit/scripts/generate-report.cjs <run>
npm test   # runs the script test suites
```

See [`examples/sample-run/REPORT.md`](examples/sample-run/REPORT.md) for what a finished run looks like.

## Requirements

- A coding agent with tool use and **parallel sub-agents**, such as Claude Code. Without sub-agents, the skill runs each role in sequence from the written records and flags the weaker separation in the report.
- **Playwright**: the Playwright MCP server, `@playwright/cli`, or `@playwright/test`.
- Your project's test runner.
- A local, preview or staging environment. The skill will not test production unless you say so, and even then it stays read-only.
- Test accounts, sandbox payment keys and a test inbox (Mailpit, MailHog, Mailosaur…). Without them, the related checks are marked `blocked` rather than faked.

**Optional:** if the [Snagly](https://claude.com/plugins) QA skills are installed, qa-audit hands specialist checks to them (flow-runner, form-fuzzing, accessibility-audit, cross-browser-matrix, bug-triage, fix-verifier, e2e-codegen…). Verdicts and fix proof still come from qa-audit's own phases.

## Safety

- Code changes go only on the branch `qa-audit/run-N`. The skill never commits to your default branch, pushes or opens PRs unless you ask.
- Run artifacts are written to `~/qa-audit/<repo>/run-N/` by default, outside your repo.
- Only test data: no real emails, no real payments, no real customer records.
- This is **not** a security audit. Anything that looks exploitable is recorded as a `security_referral` and never probed. Use a dedicated security tool for that.

## Tips

- **Run it more than once.** Each run reads the earlier ledgers, goes after the gaps, and re-verifies anything whose source changed.
- Give it your spec or PRD. Better expected-behaviour sources mean fewer false positives.
- Tell it your P0 journeys if you know them, and what "can't ship" means for your team.

## Contributing

Issues and PRs are welcome, especially new domain checklists in `checks/` (mobile web, PWAs, e-learning, marketplaces…) and improvements to the validators. Please add or update tests in `skills/qa-audit/scripts/tests/` and run `npm test`.

## License

MIT © Thankgod Olusegun Ajayi ([@TGod-Ajayi](https://github.com/TGod-Ajayi))
