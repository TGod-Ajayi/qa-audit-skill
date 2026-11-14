# Phases 0–1: Setup, baseline and reconnaissance

## Phase 0: Setup and baseline

### 0.1 Find the run directory

- Use `~/qa-audit/<repo-name>/`, where `<repo-name>` is the git remote name or the folder name.
- `N` is one more than the highest existing `run-*`. Create `run-<N>/` and `run-<N>/evidence/`.
- If earlier runs exist, read their `coverage-ledger.json`, `findings.json` and `COVERAGE.md`. You will use them in 1.5.

### 0.2 Understand how the app runs

Read the README, `package.json` scripts (or Makefile, docker-compose, Procfile), `.env.example`, seed scripts and CI config. Work out:

- How to install, migrate, seed and start the app
- The test runner and its commands: unit, integration, e2e
- Which test accounts and roles exist, or how to create them
- External services and their sandbox modes (payments, email, SMS, storage)
- Feature flags

### 0.3 Ask only what you cannot find

When the user is present, ask in one message, covering only the items still unknown:

- the target URL (local, preview or staging)
- test credentials for each role
- which journeys matter most
- whether fixing is allowed

When the user is away, use local or staging, create your own test accounts if signup allows it, rank journeys yourself, and allow fixes on a branch only. Write these assumptions into `run.json`.

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

```json
{
  "run": 3,
  "repo": "neostore",
  "target": "http://localhost:3000",
  "build": "<git sha>",
  "mode": "full|focused|report-only",
  "fixing_allowed": true,
  "separation": "parallel|sequential",
  "assumptions": ["User away; fixes limited to branch qa-audit/run-3"],
  "started_at": "<iso>",
  "finished_at": null
}
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
- cross-cutting concern: responsive, a11y, performance, i18n, console hygiene (`cross-cutting`)
- remaining page that is not covered above (`page`)

For each unit, set `check_classes` using the table in `CHECK-CLASSES.md`, set `expected_source`, and set `source_files`.

**On repeat runs:**

- Bring forward units from the previous ledger.
- For each `covered` unit, compare its `source_files` against the previous run's build: `git diff --name-only <prev-sha> HEAD`. If any of its files changed, set the unit back to `pending` and add a note saying why.
- Carry `blocked` units forward as `pending` if the blocker may be gone.
- Put units from the previous `COVERAGE.md` gaps first.

Then run:

```bash
node scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
```

Fix any errors before Phase 2.
