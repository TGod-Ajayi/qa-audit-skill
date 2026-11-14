# Code quality checks

#### When to use this file

Use this file for `code` units (a module, package or layer reviewed statically) and for any unit where a runtime bug points to a code-level cause. It covers the `code-quality` class: the project's own lint, typecheck, format and test commands, error handling, duplicated logic, dependencies and build output.

Use `api-and-integrations.md` for N+1 calls seen from the network, `payments-and-money.md` for float money bugs with a wrong total, and `security-hygiene.md` for secrets, vulnerable dependencies and headers. Fixes from this file stay minimal: the smallest change that clears the finding. Never a repo-wide refactor, reformat or dependency upgrade sweep.

## Core discipline (include in every tester prompt for this domain)

```
- A finding needs a sourced expectation: the project's lint, tsconfig or CI config, a CONTRIBUTING or convention doc, a failing project command, or a demonstrated runtime bug.
- Run the project's own commands (from package.json, Makefile or CI). Don't add new linters or stricter rules and report what they say.
- Style taste, "I would structure it differently" and complexity with no concrete effect are suggestions with kind code-quality, not findings.
- Cite file:line for every candidate, and the exact command and output where one applies.
- Never change code while testing. Record the candidate; fixing happens in Phase 5 behind a failing test.
```

## Project commands (check classes: `code-quality`)

**Lint, typecheck and format fail**
Run the project's lint, typecheck and format-check commands as CI runs them. Any failure on the default branch is a candidate, cited by command and output. Warnings the config allows are not findings.

**Strict mode violations**
If `tsconfig` sets `strict` (or `noImplicitAny`, `strictNullChecks`), code that only compiles through `// @ts-ignore`, `@ts-expect-error` without reason, or excluded paths is a candidate on P0 paths. With strict off, the lack of strictness is a suggestion.

**Build warnings**
Run the production build. Warnings about missing exports, circular imports, oversized chunks or deprecated APIs are candidates when they map to a runtime effect. Noise with no effect is a suggestion.

## Types and data boundaries (check classes: `code-quality`, `contract`)

**`any` and unsafe casts at boundaries**
Look for `any`, `as unknown as`, and non-null `!` on API responses, form data, webhook bodies and storage reads. A cast that hides a real mismatch (a field the API no longer sends) is a candidate when you can show the runtime effect. An `any` with no shown effect is a lead, and a suggestion if the project's lint does not ban it.

**Magic numbers for money and time**
Literals like `100` for kobo conversion, `86400000` for a day, or `0.075` for VAT spread across files. A candidate when two copies disagree or one is wrong. Otherwise a suggestion.

## Errors and async (check classes: `code-quality`, `errors`)

**Swallowed errors**
Find empty `catch` blocks and catches that only log on a user-facing path. A candidate when the user is shown success after a failure, or nothing at all. A catch that logs and rethrows, or a deliberate ignore with a comment, is fine.

**Unhandled promise rejections**
Look for promises with no `await` or `.catch`, and watch the console and server logs during tests. A rejection that surfaces as a console error or a crash is a candidate.

**Dead and unreachable code**
Branches that can never run, unused exports and feature flags stuck on one value. A candidate only when the dead branch was meant to run (a fallback that never triggers). Otherwise a suggestion.

## Duplication and drift (check classes: `code-quality`, `state`)

**Duplicated logic that already drifts**
Two price formatters, two date helpers or two validation rules for the same field that give different results. Show both outputs for the same input. Duplication that still agrees is a suggestion.

**N+1 queries**
Read the data layer for queries inside loops on list pages, and confirm with the query log or ORM debug output. A candidate when it scales with list size on a P0 page.

## Tests (check classes: `code-quality`)

**Missing tests on P0 paths**
A P0 journey or money calculation with no automated test is a candidate (S3 by default) when the project's convention or CI policy expects tests. Otherwise list it in `COVERAGE.md` notes.

**Flaky or skipped tests**
Tests marked `.skip`, `xit`, `.only`, or that fail intermittently in the baseline. Record the rate from the baseline runs. A `.only` committed to the default branch is always a candidate.

**TODO, FIXME and HACK on P0 paths**
Markers on P0 paths that describe a known bug or missing check. A candidate when the described problem reproduces. A marker alone is a suggestion.

## Dependencies (check classes: `code-quality`)

**Deprecated or unmaintained**
Packages marked deprecated by the registry, or with install warnings. A candidate when the deprecation notice names a bug that affects this app.

**Duplicate major versions and lockfile drift**
Two major versions of the same library in the bundle (two React copies), or a lockfile out of sync with the manifest (`npm ci` fails). Both are candidates. Known-vulnerable packages belong to `security-hygiene.md`.

## Universal moves

- Read CI config first. Run exactly what CI runs, in the same order, and save each output.
- Search with ripgrep for the leads above (`catch\s*\(\w*\)\s*\{\s*\}`, `as any`, `parseFloat`, `.skip(`) and confirm each hit by reading it.
- Tie each code lead to a runtime check where possible. A demonstrated effect turns a lead into a finding.

## Validation rules (apply before reporting ANY candidate here)

1. Cite the source of the expectation: config file and rule, convention doc, failing command, or runtime bug.
2. Give file:line and the command output or runtime evidence.
3. For drift, show both implementations giving different results for the same input.
4. Severity follows user impact. A lint failure that blocks CI is S3; a swallowed error that shows success after a failed payment is S1.
5. Use `confirmed` when the command fails 3/3 or the runtime effect reproduces 3/3. Use `needs_validation` when the expected convention is unwritten and name who owns it. With no source, it is a suggestion.
