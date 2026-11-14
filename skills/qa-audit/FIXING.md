# Phases 5–6: Test-first fixing and regression sweep

Skip both phases in report-only mode.

## 5.1 Prepare

- Create the branch `qa-audit/run-<N>` from the audited build. Never commit to the default branch. Never push or open a PR unless the user asks.
- Fix order: `confirmed` S1 → S2 → S3 → S4, then `flaky` findings whose root cause is clear. Fix `needs_validation` and `rejected` findings never.
- Fixes that touch the same files run **one after another**. Fixes in separate areas may run in parallel, each in its own git worktree, merged in order afterwards.

## 5.2 Fixer sub-agent (one per finding)

Brief:

```
You are fixing QA-<id>. You have its finding record and repo access.

1. REGRESSION TEST FIRST. Write a test at the lowest level that catches this bug:
   - pure logic (pricing, formatting, validation) → a unit test
   - API contract or server rule → an integration or API test
   - UI journey, timing or browser-specific → a Playwright e2e test (role-based
     locators, web-first assertions, no fixed sleeps, unique test data,
     shared auth setup)
   Follow the project's existing test conventions and file locations.
2. Run it. It MUST FAIL, and fail for the reason the finding describes. A
   setup or import error does not count. Save the failing output to
   evidence/QA-<id>-test-before.txt.
3. Make the smallest change that fixes the ROOT CAUSE. No refactors, renames,
   formatting changes or "while I'm here" fixes. If the root cause is bigger than
   this finding, fix the finding minimally and describe the larger issue in notes.
4. Run the regression test: it must pass. Save evidence/QA-<id>-test-after.txt.
5. Run the related test files, then the full suite. The result must be no worse
   than baseline-tests.json: no new failures, no new skips.
6. Commit the fix together with its test: "fix(QA-<id>): <title>".

Never: delete, skip, loosen or .only tests; change expected values to match buggy
behaviour; swallow or hide errors; add sleeps or blind retries to hide a race;
disable the feature; edit migrations already applied to shared environments.
If you cannot fix it within these rules, stop and explain why.
```

## 5.3 Independent fix verifier (a new agent, never the fixer)

Brief:

```
You verify the fix for QA-<id>. You have the finding record, the commit diff and
the repo. You did not write this fix.

1. Read the diff against the root cause. Does it fix the cause, or only hide the
   symptom (catching an error, special-casing the test data, hiding the UI)?
2. Check the regression test: would it have caught the original bug? Check the
   test-before evidence. Is it testing behaviour, not the implementation?
3. Re-run the ORIGINAL minimal repro in a real browser on the fixed build, in the
   original environment (browser and viewport). Then run it on one other browser.
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
  "test_passes_after": true,
  "verified_by_independent_agent": true,
  "rounds": 1,
  "notes": ""
}
```

- Re-run `validate-findings.cjs` after every fix record.
- Sibling candidates found by verifiers go through Phase 3 like any other candidate.

## Phase 6: Regression sweep

After all fixes are done:

1. Run the full test suite and compare it with `baseline-tests.json`.
2. Re-run every **P0 journey** on Chromium (desktop) and WebKit (mobile viewport).
3. Re-test every ledger unit whose `source_files` overlap with the changed files: `git diff --name-only <audited-sha> HEAD`.
4. Check the console and network on the P0 pages.

Any new failure becomes a candidate and goes back through Phase 3 (and Phase 5 if it is confirmed). If the sweep finds a regression caused by one of the fixes, mark that fix `regressed` and handle it per 5.4.

Record `finished_at` in `run.json` once the sweep is clean, or when you stop.
