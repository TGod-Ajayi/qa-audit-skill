# Phases 5–6: Test-first fixing and regression sweep

Skip both phases in report-only mode.

## 5.1 Prepare

- Create the branch `qa-audit/run-<N>` from the audited build. Never commit to the default branch. Never push or open a PR unless the user asks.
- Fix order: `confirmed` S1 → S2 → S3 → S4, then `flaky` findings whose root cause is clear. Fix `needs_validation` and `rejected` findings never.
- A leaked secret needs two things: the code fix, and a note telling the owner to rotate the key. QA never rotates keys or touches provider dashboards.
- Design and UX fixes use the design tokens and existing components. They do not hand-tune values.
- Fixes that touch the same files run **one after another**. Fixes in separate areas may run in parallel, each in its own git worktree, merged in order afterwards.

## 5.2 Fixer sub-agent (one per finding, `fixer-qa-<id>`, never the finding's reproducer)

Brief:

```
You are fixing QA-<id>. You have its finding record and repo access.

1. REGRESSION TEST FIRST. Write a test at the lowest level that catches this bug:
   - pure logic (pricing, formatting, validation) → a unit test
   - API contract or server rule → an integration or API test
   - UI journey, timing or browser-specific → a Playwright e2e test (role-based
     locators, web-first assertions, no fixed sleeps, unique test data,
     shared auth setup)
   - design → a component or visual test pinned to the token or state that was
     wrong (a Storybook or Playwright screenshot of that component, or an
     assertion on computed styles)
   - ux → an e2e or component test that asserts the convention (label, role,
     variant, focus target)
   - code-quality → a unit test for the behaviour, or the project's own gate
     (lint rule, tsc) failing before and passing after
   - passive security → a test that fails while the issue exists (no secret
     patterns in the build output, cookie flags set, header present)
   Follow the project's existing test conventions and file locations.
2. Run it. It MUST FAIL, and fail for the reason the finding describes. A
   setup or import error, a missing module, or a selector or action timeout
   does not count. Give the assertion a message that names the bug, for example
   expect(orders, 'one order per Pay click').toHaveLength(1). That message is the
   finding's failure_signature; record it in your result. Save the failing output
   to agents/<agent-id>/evidence/QA-<id>-test-before.txt.
3. Make the smallest change that fixes the ROOT CAUSE. No refactors, renames,
   formatting changes or "while I'm here" fixes. If the root cause is bigger than
   this finding, fix the finding minimally and describe the larger issue in notes.
4. Run the regression test: it must pass. Save agents/<agent-id>/evidence/QA-<id>-test-after.txt.
5. Run the related test files, then the full suite. The result must be no worse
   than baseline-tests.json: no new failures, no new skips.
6. Commit the fix together with its test, in ONE commit: "fix(QA-<id>): <title>".
   The verifier removes the product-code part of this commit to prove the test
   catches the bug, so keep unrelated files out of it.

Never: delete, skip, loosen or .only tests; change expected values to match buggy
behaviour; swallow or hide errors; add sleeps or blind retries to hide a race;
turn on test-runner retries for the regression test;
disable the feature; edit migrations already applied to shared environments.
If you cannot fix it within these rules, stop and explain why.
```

## 5.3 Independent fix verifier (`verifier-qa-<id>`, a new agent, never the fixer)

Brief:

```
You verify the fix for QA-<id>. You have the finding record, the commit diff and
the repo. You did not write this fix.

1. Read the diff against the root cause. Does it fix the cause, or only hide the
   symptom (catching an error, special-casing the test data, hiding the UI)?
2. Prove the test fails for the right reason. Run, from the skill directory:

     node scripts/check-fix-test.cjs --repo <repo> --commit <fix sha> \
       --test-file <test file> --expect "<failure_signature>" --repeat <n> \
       --out <run>/agents/<agent-id>/evidence/QA-<id>-revert-check.json \
       -- <command that runs only that test>

   It reverse-applies only the commit's non-test changes and runs the test n
   times: at least one run must exit non-zero with the signature in its output.
   Then it restores the fix and runs the test n times: every run must pass.
   Pick n from the finding: 3 for confirmed; for flaky, the smallest n where an
   unfixed bug would slip past every run at most 5% of the time,
   ceil(ln 0.05 / ln(1 - rate)): 6 for 4/10, 29 for 1/10. The validator checks n.
   Disable the runner's own retries for this command (Playwright --retries=0). A test that dies on a bad
   selector or a setup error does not print the signature and fails the check.
   Add --keep <path> for test fixtures or snapshots committed with the test.
   Before running it, read the signature against the finding's observed
   behaviour: it must name the bug, not a selector, timeout or import. If the
   check fails, the verdict is not_fixed. Also read the test: does it test
   behaviour, not the implementation?
3. Re-run the ORIGINAL minimal repro in a real browser on the fixed build, in the
   original environment (browser and viewport), as many times as the fix check
   ran (3 for confirmed, more for flaky). Then run it on one other browser. Save a
   trace or screenshot per run and record each run in fix.repro_after with the
   commit you ran on (git rev-parse HEAD). Static findings (code-quality, passive
   security) re-run their command instead, with kind "command".
4. Hunt for siblings: search for the same pattern elsewhere (other forms, endpoints
   or components built the same way). Report each match as a new candidate. Do
   not fix it.
5. Check nearby behaviour: run the journeys that touch the changed files.

Verdict: fixed | not_fixed | regressed, with reasons and evidence.
```

## 5.4 Rounds and records

- `not_fixed` or `regressed` → back to a fixer (it may be the same fixer agent, given the verifier's notes). Then a **new** verifier checks again.
- After 2 failed rounds, revert that finding's commits and set the fix verdict to `needs_human` with notes on what was tried.
- Record the result on the finding:

```json
"fix": {
  "verdict": "fixed",
  "commit": "<sha>",
  "test_file": "tests/e2e/checkout-double-submit.spec.ts",
  "test_failed_before": true,
  "fails_without_fix": true,
  "failure_signature": "one order per Pay click",
  "revert_check": "evidence/QA-001-revert-check.json",
  "repro_after": [
    {"kind": "browser", "browser": "chromium", "viewport": "1440x900", "commit": "<sha>", "by": "verifier-qa-001",
     "attempts": 3, "result": "pass", "observed": "One POST /api/orders, one order, one charge",
     "evidence": "evidence/QA-001-repro-after-chromium.zip"},
    {"kind": "browser", "browser": "webkit", "viewport": "390x844", "commit": "<sha>", "by": "verifier-qa-001",
     "attempts": 3, "result": "pass", "observed": "Same on mobile WebKit",
     "evidence": "evidence/QA-001-repro-after-webkit.zip"}
  ],
  "test_passes_after": true,
  "suite_no_worse_than_baseline": true,
  "verified_by_independent_agent": true,
  "fixer": "fixer-qa-001",
  "verifier": "verifier-qa-001",
  "rounds": 1,
  "evidence": ["evidence/QA-001-test-before.txt", "evidence/QA-001-test-after.txt", "evidence/QA-001-revert-check.json",
               "evidence/QA-001-repro-after-chromium.zip", "evidence/QA-001-repro-after-webkit.zip"],
  "notes": ""
}
```

- Promote the fixer's and verifier's evidence into `evidence/` before writing the record.
- `fixed` needs a passing revert check. `validate-findings.cjs --run-dir` and `generate-report.cjs` read `revert_check` back and require it to match the fix's commit, test file and `failure_signature`. They also require enough repeats for the finding (3 for confirmed; for flaky, enough that an unfixed bug would show up with at least 95% probability), every with-fix run green, and, for a confirmed finding, the test catching the bug on every without-fix run. A signature that names a timeout, selector, missing module or "no tests found" is rejected.
- `fixed` needs `repro_after`, and the validator checks it:
  - every re-run was done by the verifier and passed
  - browser findings include the original browser and viewport, with as many attempts as the fix check needed, plus one other browser
  - each re-run's evidence is listed
  - `stamp-verdict.cjs` also requires each re-run's commit to contain the fix and to be in the stamped HEAD
- `not_fixed`, `regressed` and `needs_human` need `notes` on what was tried.
- Re-run `validate-findings.cjs` after every fix record.
- Sibling candidates found by verifiers go through Phase 3 like any other candidate.

## Phase 6: Regression sweep

After all fixes are done:

1. Run the full test suite and compare it with `baseline-tests.json`.
2. Re-run every **P0 journey** on Chromium (desktop) and WebKit (mobile viewport).
3. Re-test every ledger unit whose `source_files` overlap with the changed files: `git diff --name-only <audited-sha> HEAD`.
4. Check the console and network on the P0 pages.
5. Re-run the project's lint, typecheck and build. They must be no worse than at the baseline.

Any new failure becomes a candidate and goes back through Phase 3 (and Phase 5 if it is confirmed). If the sweep finds a regression caused by one of the fixes, mark that fix `regressed` and handle it per 5.4.

Once the sweep is clean, or when you stop, record `finished_at` and `run_status` (`complete`, or `incomplete` with `incomplete_reason`) in `run.json`.
