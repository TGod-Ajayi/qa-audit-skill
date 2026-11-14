# Changelog

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
