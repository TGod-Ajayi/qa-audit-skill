# Phases 0–1: Setup, baseline and reconnaissance

## Phase 0: Setup and baseline

### 0.1 Find the run directory

- Use `~/qa-audit/<repo-name>/`, where `<repo-name>` is the git remote name or the folder name.
- `N` is one more than the highest existing `run-*`. Create `run-<N>/`, `run-<N>/evidence/` and `run-<N>/agents/`.
- Record the build with `git rev-parse HEAD`, and set `dirty` from `git status --porcelain`.
- If earlier runs exist, read their `coverage-ledger.json`, `findings.json` and `COVERAGE.md`. You will use them in 1.5.

### 0.2 Understand how the app runs

Read the README, `package.json` scripts (or Makefile, docker-compose, Procfile), `.env.example`, seed scripts and CI config. Work out:

- How to install, migrate, seed and start the app
- The test runner and its commands: unit, integration, e2e
- Which test accounts and roles exist, or how to create them
- External services and their sandbox modes (payments, email, SMS, storage)
- Feature flags
- The project's own quality gates: lint, typecheck, format and build commands, and CI config
- Design sources: Figma links in the README, tickets or PR templates, a design-system package, Storybook, or a style guide

### 0.3 Ask only what you cannot find

When the user is present, ask in one message, covering only the items still unknown:

- the target URL (local, preview or staging)
- test credentials for each role
- which journeys matter most
- whether fixing is allowed
- the design source (a Figma file or design system), if any
- the profile (`quick`, `standard` or `deep`), any scope, and any agent budget

When the user is away, use local or staging, create your own test accounts if signup allows it, rank journeys yourself, use the `standard` profile with no budget, and allow fixes on a branch only. Write these assumptions into `run.json`.

### 0.4 Start and confirm

Start the app. Load the home page and one authenticated page. Record any console errors you see on the first load; they become early candidates. If the app will not start, stop and report the blocker. Do not test a broken build.

### 0.5 Baseline

Run the full existing test suite **before changing anything**. Save:

```json
{
  "build": "<git sha>",
  "command": "npm test",
  "ran_at": "<iso>",
  "totals": {"passed": 412, "failed": 3, "skipped": 7},
  "failing": ["src/cart.test.ts > applies coupon twice", "..."]
}
```

Failures already in the baseline become candidates (kind `existing-test-failure`). Phase 5 must never make the suite worse than this baseline.

### 0.6 run.json

The parent writes `run.json` before delegating anything, following `schemas/run.schema.json`:

```json
{
  "run": 3,
  "repo": "demo-shop",
  "target": "http://localhost:3000",
  "environment": "local",
  "build": "<full or short git sha>",
  "dirty": false,
  "mode": "full",
  "profile": "standard",
  "scope": [],
  "budget": null,
  "agents_used": 0,
  "fixing_allowed": true,
  "separation": "parallel",
  "branch": "qa-audit/run-3",
  "assumptions": ["User away; fixes limited to branch qa-audit/run-3"],
  "design_sources": ["Figma: Demo Shop / Checkout v3"],
  "prior_runs": ["~/qa-audit/demo-shop/run-2"],
  "run_status": "in_progress",
  "incomplete_reason": null,
  "started_at": "2026-11-14T09:00:00Z",
  "finished_at": null
}
```

- `branch` is `null` when fixing is not allowed.
- `scope` entries are repository-relative paths or `route:`, `journey:` or `unit:` selectors.
- Update `agents_used` as sub-agents finish.

Then run:

```bash
node scripts/validate-run.cjs <run>/run.json
```

## Phase 1: Reconnaissance

The aim is a map that is complete enough that the coverage critic in Phase 2 can tell what is missing.

### 1.1 Read the code

Read the code in this order:

1. **Routing:** every page and route, including dynamic and protected ones. Look at file-based routes, the router config and middleware.
2. **API surface:** handlers, controllers, server actions and GraphQL resolvers, with their methods, inputs and auth checks.
3. **Data model:** schemas, migrations and ORM models. List the entities, their fields, constraints, relations, and cascade or soft-delete rules.
4. **Validation:** client-side validation (form libraries, zod or yup) and server-side validation. Note where the two differ.
5. **State machines:** status enums and the transitions allowed between them (order, payment, subscription, onboarding).
6. **Roles and permissions:** who can see and do what. Note checks done only in the UI with no matching server check.
7. **Integrations:** payments, email and SMS, storage, auth providers, webhooks in and out, cron and queue jobs.
8. **Cross-cutting:** i18n, currency and timezone handling, feature flags, caching, realtime features (websockets, SSE, polling).
9. **Design system:** shared components, design tokens and theme files, and where screens bypass them with one-off styles. Compare the design source's frames against the routes.
10. **Engineering health:** lint and type config, error-handling patterns, money and date helpers, test layout, and dependency manifests. Note security-relevant config without probing: cookie and session settings, header middleware, CORS, upload rules and environment-variable prefixes that reach the client.

### 1.2 Crawl the live app

Use a real browser to visit every reachable page for each role. This catches routes the code reading missed and shows what users actually see. Record what you find, but do not test deeply yet.

### 1.3 Choose the P0 journeys

A P0 journey is one where failure means users cannot get the product's core value, or lose money or data. Typical P0 journeys:

- sign up and verify
- log in
- password reset
- the core action (create a store or listing, deploy an app, verify a product, start a lesson…)
- checkout or payment
- cancelling or refunding

Keep the list to between 3 and 10. Rank everything else as P1 (important features) or P2 (secondary pages, settings, rarely used paths).

### 1.4 Write architecture.md

Use these sections:

```markdown
# Architecture: <repo> @ <sha>
## Stack and how to run
## Roles and permissions
## Pages and routes        (table: route, role(s), purpose, source file)
## API endpoints           (table: method+path, auth, input schema, source file)
## Entities and lifecycle  (entity, fields of note, constraints, delete behaviour)
## State machines          (states, allowed transitions, who triggers them)
## Integrations            (service, sandbox mode available?, how tested)
## Validation mismatches   (client vs server differences found while reading)
## Design sources          (Figma files and frames per route, design-system package, tokens)
## Quality gates           (lint, typecheck, test, build commands and their current status)
## Security-relevant config (cookies, headers, CORS, client-exposed env vars; observations only)
## P0 journeys             (name → unit id)
## Expected-behaviour sources (spec docs, tickets, schemas, UI copy locations)
## Known risks             (what looked fragile while reading; leads for testers)
```

### 1.5 Build coverage-ledger.json

Follow `schemas/coverage-ledger.schema.json`. Create one unit per:

- P0 and P1 journey (kind `journey`)
- form with non-trivial validation (`form`)
- entity with a create/read/update/delete lifecycle (`entity`)
- API endpoint group (`api`)
- state machine (`state`)
- integration (`integration`)
- cross-cutting concern: responsive, a11y, performance, i18n, console hygiene, security headers (`cross-cutting`)
- shared module, package or layer worth a static review: money and date helpers, API client, auth middleware (`code`)
- remaining page that is not covered above (`page`)

For each unit, set `check_classes` using the table in `CHECK-CLASSES.md`, set `expected_source` (include the Figma frame for `design`), and set `source_files` as repository-relative paths. Units start as `pending` with no `assigned_to`. In a scoped run, add units outside the scope as `out_of_scope` with the reason in `blocked_reason`. Keep units sorted by id.

**On repeat runs:**

- Bring forward units from the previous ledger.
- For each `covered` unit, compare its `source_files` against the previous run's build: `git diff --name-only <prev-sha> HEAD`. If any of its files changed, set the unit back to `pending` and add a note saying why.
- Carry `blocked` and `deferred` units forward as `pending` if the blocker may be gone, and set `carried_from_run`.
- A unit that was `out_of_scope` before is in scope now unless this run's scope excludes it again.
- A covered unit from a `quick` or scoped run contributes only its recorded evidence, never an implied "the rest is fine".
- Put units from the previous `COVERAGE.md` gaps first.

Then run:

```bash
node scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
```

Fix any errors before Phase 2.
