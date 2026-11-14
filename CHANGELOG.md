# Changelog

## 0.7.0 — 2026-11-14

### Added

- `rejection_kind`, required for rejected findings: `no_source`, `not_reproduced`, `no_longer_reproduces`, `artifact`, `duplicate` or `works_as_intended`.
- A rejection for not reproducing must record `repro_rate` `0/N` with at least 5 attempts.
- A `timing` candidate with recorded evidence can't be rejected for not reproducing. It must be `needs_validation`, which may record its attempts as `0/N`, and `REPORT.md` lists it in the next run's focus as an unreproduced race to hunt.
- The sample run includes one (QA-011).
- Tests (121 in total).

## 0.6.0 — 2026-11-14

### Added

- `fix.repro_after`, required for `fixed`: the verifier's re-runs of the original minimal repro on the fixed build, each with kind (`browser` or `command`), browser and viewport or command, commit, agent, attempts, result, what was observed and evidence.
- Validator rules for it:
  - every re-run was made by the verifier and passed
  - browser findings include the original browser and viewport, with the same number of attempts the fix check needs (3 for confirmed, more for flaky), plus one other browser
  - the evidence is listed in the fix evidence
- `stamp-verdict.cjs stamp` refuses a re-run whose commit doesn't contain the fix or isn't in HEAD.
- `FINDINGS-DETAIL.md` lists each re-run.
- Tests (115 in total).

## 0.5.0 — 2026-11-14

### Added

- `scripts/stamp-verdict.cjs`:
  - `stamp` writes `verdict.json`, tying the release verdict to the verified HEAD, its tree hash, the fix commits and a sha256 of each record. It refuses an unfinished run, a dirty audited build, a dirty repo, a HEAD missing the audited build or a fix commit, and any commit since the audit that isn't a recorded fix. Non-fix commits can be named with `--accept`, which records them and shows them in the report.
  - `check` fails when the tree, the working tree or any record changed since the stamp, so an edit after the audit cancels the verdict. A new HEAD with an identical tree still passes. Meant for CI and pre-merge hooks.
- `schemas/verdict.schema.json`.
- The report header shows **Verified build**, **Stale stamp** or **Unstamped**.
- Tests against throwaway git repos (107 tests in total).

### Changed

- A run on a dirty build can no longer get "Ship"; at best it is "Ship with known issues".
- The report's "Build" line is now "Audited build".

## 0.4.0 — 2026-11-14

### Added

- `check-fix-test.cjs --repeat <n>` (default 3). Without the fix, the test runs n times and must fail with the expected assertion at least once. With the fix, all n runs must pass; it stops at the first failure.
- The validator sets the minimum repeat count from the finding: 3 for `confirmed`, and for `flaky` the smallest n with (1 − rate)^n ≤ 5%, for example 6 for 4/10 and 29 for 1/10. A `confirmed` finding's test must catch the bug on every run without the fix.
- Tests with a deterministic intermittent bug, including a "fix" that only works some of the time (96 tests in total).

### Changed

- The revert-check result is now version 2, with per-run counts (`runs`, `matched_failures`, `passes`, `failures` and more) in place of a single exit code.
- Fixers may not turn on test-runner retries for the regression test.

## 0.3.0 — 2026-11-14

### Added

- `scripts/check-fix-test.cjs`: a mechanical check that a regression test fails for the right reason. It reverse-applies only the product-code part of the fix commit, runs the test, and requires a non-zero exit whose output contains the expected assertion message. Then it restores the fix and requires the test to pass. A test that only dies on a selector, timeout, missing module or "no tests found" fails the check.
- `schemas/revert-check.schema.json` for its output.
- Fix records gain `fails_without_fix`, `failure_signature` and `revert_check`, all required for `fixed`. Signatures that describe a harness failure (timeouts, selectors, missing modules) are rejected.
- `validate-findings.cjs --run-dir` and `generate-report.cjs` read each revert check back and require it to match the fix's commit, test file and signature.
- Tests against throwaway git repos, including the bad-selector case (92 tests in total).

### Changed

- The fixer gives the regression assertion a message that names the bug, and commits the test with the fix in one commit. The verifier runs the revert check.

## 0.2.0 — 2026-11-14

### Added

- Check classes `design` (conformance to Figma or the design system), `ux` (UI/UX consistency, affordances, feedback, heuristics), `code-quality` (the project's own quality gates, error handling, duplication, tests, dependencies) and `security` (passive security hygiene).
- The unit kind `code`, for modules reviewed statically.
- Domain checklists:
  - `design-and-ux`
  - `code-quality`
  - `security-hygiene`
  - `navigation-and-search`
  - `time-and-locale`
  - `files-and-media`
- All domain checklists now follow one structure: when to use, core discipline, grouped checks with false-positive guards, universal moves and validation rules.
- `SKILL.md` sections:
  - platform terminology
  - universal execution safety
  - full audit setup
  - write isolation (per-agent directories, parent-only shared files, safe evidence promotion)
  - run profiles (`quick`, `standard`, `deep`)
  - scoped runs
  - agent budgets
  - the two allowed terminal run states
- `run.schema.json` and `validate-run.cjs`.
- Agent ids in the records (`found_by`, `reproduced_by`, `fixer`, `verifier`, `assigned_to`). The validators enforce separation of duties.
- Unit statuses `deferred` and `out_of_scope`.
- Report: a breakdown by check class, a section for out-of-scope units, draft and incomplete banners, and verdict caps for partial and incomplete runs. An open security S2 now blocks shipping.
- Tests: the schema engine, input hardening, CLI behaviour and doc consistency (78 tests in total).
- `CONTRIBUTING.md` and this changelog.

### Changed

- The validators enforce the bundled JSON Schemas exactly through a shared, dependency-free schema engine, so unknown fields are now errors.
- Validator input handling now refuses symlinks and non-regular files, and enforces size and depth limits and strict UTF-8. Diagnostics are escaped and capped.
- The report generator requires and validates `run.json`, and refuses to write through symlinks.
- `flaky` now needs at least 5 attempts. `fixed` now also needs `suite_no_worse_than_baseline`, fix evidence, and named fixer and verifier agents.

## 0.1.0

- Initial release.
