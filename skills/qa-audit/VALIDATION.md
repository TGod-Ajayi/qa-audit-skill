# Phases 3–4: Reproduction, verdicts and findings

## Phase 3: Reproduction

### 3.1 Remove duplicates

Group candidates by **root symptom**, not by title. Two candidates are the same bug when they share one cause, even if they were seen on different pages. An example: the "price shows NaN" reports on the cart and on checkout both come from one formatter. Keep every `cid` that fed a group in `source_candidates`. When it's unclear whether two candidates share a cause, keep them apart. The reproducer can merge them later.

Candidates flagged `security_referral` skip reproduction, because reproducing them would mean probing. They go straight to findings with verdict `needs_validation`, `blocking_fact: "Needs security review; not probed by QA"` and `security_referral: true`.

### 3.2 Reproducer sub-agents

Send each unique candidate to a **fresh** reproducer (`reproducer-<n>`). Never use the tester who found it. Reproducers can run in parallel and write only to their own `agents/<agent-id>/`. Give each one only the candidate, the relevant part of `architecture.md`, the environment, the checklist for its check class, and this brief:

```
You are a reproducer. Your job is to DISPROVE this candidate bug. Only if you fail
to disprove it do you confirm it.

1. Check the expectation: open the cited expected_source. Does it really say
   that? For design, open the Figma frame or token. For ux, open the other screen
   that sets the convention. For code-quality, run the project command or read the
   config rule. If there is no valid source, the verdict is "rejected" (reason:
   "no sourced expectation"), and record it as a suggestion instead.
2. Reproduce from a clean state: new browser context, fresh test account or reseeded
   data, the same environment. Try at least 3 times. If it reproduces 0 times, try
   2 likely variations (another browser, viewport, role) before rejecting.
3. Rule out artifacts: test-data mistakes, tester error, environment problems
   (a seed missing, a service down, the dev server's hot reload), browser extensions.
4. Cut it down to a minimal repro: the fewest steps, the smallest data, the
   simplest environment that still triggers it.
5. If it is intermittent, run it at least 10 times (5 minimum) and record the rate.
   The rate sets how many times the fix must later pass in a row, so record the
   real count; don't round a rare bug up to look more reproducible.
   Static findings (code-quality, passive security) "reproduce" by re-running the
   command or re-reading the source and config on a clean checkout of the build.
6. Root-cause hypothesis: find the code most likely responsible (file:line) and
   say why, citing evidence such as a stack trace, a network response or a code
   path. Mark it as a hypothesis. Do not fix anything.
7. Save fresh evidence under agents/<agent-id>/evidence/. Redact any secret to its
   first 4 characters. Never probe: if confirming would need it, return
   needs_validation with security_referral true.

Return a verdict: confirmed | flaky | needs_validation | rejected,
with the fields required for that verdict (see schemas/findings.schema.json).
```

### 3.3 Verdict rules

| Verdict | Requires |
|---|---|
| `confirmed` | At least 3/3 reproductions, a sourced expectation that checks out, a minimal repro, evidence, a `check_class`, `found_by` and `reproduced_by` (different agents), and a severity |
| `flaky` | An intermittent rate from at least 5 attempts (`4/10`), plus everything `confirmed` needs |
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

How the experience and engineering classes map:

- **design / ux**: S2 when a P0 journey is misleading enough to cause a wrong action (destructive and primary buttons swapped on payment); S3 for visible drift from the design or an inconsistency that confuses; S4 for pure polish.
- **code-quality**: rate by the demonstrated or directly implied user effect (float money maths giving wrong totals is S2). A failing project gate with no user effect is S3. A style issue with a lint rule behind it is S4.
- **security (passive)**: S1 for a leaked live secret or a missing server-side check on another account's data; S2 for a leaked test secret that unlocks shared resources or missing session cookie flags; S3 or S4 for missing headers.

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

- IDs are `QA-001`, `QA-002`, … in order, and the array is sorted by id. On a repeat run, keep the IDs of findings carried forward and continue numbering after the highest one.
- Every finding's `unit` must exist in the ledger. Use `"WILDCARD"` for wildcard finds that have no unit. Its `check_class` must be one of the unit's assigned classes. Add the class to the unit if the tester found something outside its brief.
- Set `found_by` to the tester or wildcard agent id and `reproduced_by` to the reproducer's. The validator rejects them being equal.
- Evidence paths are relative and under `evidence/`.
- For a finding carried forward from an earlier run, set `first_seen_run` and re-run its repro on the current build before keeping its verdict. If it no longer reproduces, change the verdict to `rejected` with the reason "no longer reproduces on <sha>".

Then validate:

```bash
node scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json --run <run>/run.json
```

Fix every error before Phase 5. Never weaken a record to make it pass. If a confirmed finding lacks a minimal repro, send it back to a reproducer.
