# Phases 3–4: Reproduction, verdicts and findings

## Phase 3: Reproduction

### 3.1 Remove duplicates

Group candidates by **root symptom**, not by title. Two candidates are the same bug when they share one cause, even if they were seen on different pages. An example: the "price shows NaN" reports on the cart and on checkout both come from one formatter. Keep every `cid` that fed a group in `source_candidates`. When it's unclear whether two candidates share a cause, keep them apart. The reproducer can merge them later.

Candidates flagged `security_referral` skip reproduction. They go straight to findings with verdict `needs_validation`, `blocking_fact: "Needs security review; not probed by QA"` and `security_referral: true`.

### 3.2 Reproducer sub-agents

Send each unique candidate to a **fresh** reproducer. Never use the tester who found it. Reproducers can run in parallel. Give each one only the candidate, the relevant part of `architecture.md`, the environment and this brief:

```
You are a reproducer. Your job is to DISPROVE this candidate bug. Only if you fail
to disprove it do you confirm it.

1. Check the expectation: open the cited expected_source. Does it really say
   that? If there is no valid source, the verdict is "rejected" (reason:
   "no sourced expectation"), and record it as a suggestion instead.
2. Reproduce from a clean state: new browser context, fresh test account or reseeded
   data, the same environment. Try at least 3 times. If it reproduces 0 times, try
   2 likely variations (another browser, viewport, role) before rejecting.
3. Rule out artifacts: test-data mistakes, tester error, environment problems
   (a seed missing, a service down, the dev server's hot reload), browser extensions.
4. Cut it down to a minimal repro: the fewest steps, the smallest data, the
   simplest environment that still triggers it.
5. If it is intermittent, run it 10 times and record the rate.
6. Root-cause hypothesis: find the code most likely responsible (file:line) and
   say why, citing evidence such as a stack trace, a network response or a code
   path. Mark it as a hypothesis. Do not fix anything.
7. Save fresh evidence as evidence/QA-<id>-*.

Return a verdict: confirmed | flaky | needs_validation | rejected,
with the fields required for that verdict (see schemas/findings.schema.json).
```

### 3.3 Verdict rules

| Verdict | Requires |
|---|---|
| `confirmed` | At least 3/3 reproductions, a sourced expectation that checks out, a minimal repro, evidence, and a severity |
| `flaky` | At least 1 reproduction with the rate recorded (`2/10`), a sourced expectation, the best minimal repro found, evidence, and a severity |
| `needs_validation` | One exact `blocking_fact` (what is missing and who could provide it). `severity: null` |
| `rejected` | `rejection_reason`. `severity: null` |

### 3.4 Severity

Severity is decided by user impact × likelihood.

| Severity | Meaning | Examples |
|---|---|---|
| **S1 critical** | Data loss or corruption, wrong money, a P0 journey cannot be completed, or the app is unusable for a whole segment of users | Double charge on double-click; sign-up fails on Safari; deleting an item deletes the whole cart |
| **S2 major** | A major feature is broken but a workaround exists, a P1 journey is blocked, or a P0 journey is seriously degraded | Search returns stale results; checkout is unusable by keyboard; LCP is 6s on the mobile product page |
| **S3 minor** | A minor feature is broken, the UX is confusing, or there is an easy workaround | Validation error not cleared after a fix; wrong empty-state copy; a console error with no visible effect |
| **S4 cosmetic** | Visual or text problems only | Misaligned icon; a typo in a footer |

Likelihood adjusts it: a bug that only a rare path triggers can drop one level; one that every user hits on the default path can rise one level. Write the reasoning in `impact` and `likelihood`. Never raise severity for a defence-in-depth gap when another layer already prevents the failure. Record that as a hardening note in `notes`.

## Phase 4: Structured findings

Write `findings.json` following `schemas/findings.schema.json`:

```json
{
  "run": 3,
  "build": "<git sha>",
  "findings": [ { "id": "QA-001", "...": "..." } ],
  "suggestions": [ { "unit": "U-004", "text": "..." } ]
}
```

- IDs are `QA-001`, `QA-002`, … in order. On a repeat run, keep the IDs of findings carried forward and continue numbering after the highest one.
- Every finding's `unit` must exist in the ledger. Use `"WILDCARD"` for wildcard finds that have no unit.
- For a finding carried forward from an earlier run, set `first_seen_run` and re-run its repro on the current build before keeping its verdict. If it no longer reproduces, change the verdict to `rejected` with the reason "no longer reproduces on <sha>".

Then validate:

```bash
node scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json
```

Fix every error before Phase 5. Never weaken a record to make it pass. If a confirmed finding lacks a minimal repro, send it back to a reproducer.
