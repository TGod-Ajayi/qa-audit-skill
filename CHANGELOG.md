# Changelog

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
