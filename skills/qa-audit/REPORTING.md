# Phase 7: Reporting

Reports are **generated from the validated records**, not written freehand. That keeps them honest and repeatable.

## 7.1 Generate

```bash
node scripts/validate-run.cjs <run>/run.json
node scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
node scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json --run <run>/run.json
node scripts/generate-report.cjs <run>
```

The generator validates all three records itself and refuses to write reports from invalid ones.

This writes:

| File | Contents |
|---|---|
| `REPORT.md` | The release verdict and the reasons for it, run status, profile and scope, counts by severity, verdict and check class, fixed versus open, tests added, the top open issues, and the next run's focus |
| `FINDINGS-DETAIL.md` | Every confirmed and flaky finding: repro, expected (with source), observed, evidence, root cause, fix |
| `NEEDS-VALIDATION.md` | Blocked leads with the exact fact or access each one needs, plus security referrals |
| `COVERAGE.md` | Ledger units by status and priority, and check classes covered per area. **States the gaps explicitly** |
| `SUGGESTIONS.md` | Unsourced improvements by kind (UX, design, copy, performance, code quality, security hardening) |

## 7.2 Release verdict rules (applied by the generator)

- **Don't ship** if any of these apply:
  - an open (unfixed) S1
  - an open S2 on a P0 unit
  - an open `security` S2 on any unit
  - a P0 unit that is `blocked` or `pending`
  - a fix with verdict `regressed`
- **Ship with known issues** if there are no don't-ship conditions, but any of these apply:
  - open S2 or S3 findings
  - a flaky finding of S2 or higher
  - P0 units only `partial`
  - `needs_validation` items on P0 units
  - an unreviewed security referral
  - an incomplete run (`run_status: "incomplete"`)
  - a partial run (`quick` profile, a non-empty `scope`, or `focused` mode). The verdict speaks only for what was in scope.
- **Ship** otherwise.

"Open" means `confirmed` or `flaky` with no `fix`, or with a fix verdict other than `fixed`. If the user gave their own release criteria, apply theirs as well and explain any difference in `REPORT.md` under "Notes".

## 7.3 Add the narrative

After generating, add a short **Summary** at the top of `REPORT.md`, below the verdict, of 3–6 sentences in plain language:

- what was tested, and against which design sources
- the most important problems
- what was fixed
- what the team must decide

Do not change any numbers or verdicts the generator produced. If a number looks wrong, fix the records and regenerate.

## 7.4 Tell the user

Reply briefly with:

- the verdict
- the top 3 open issues, if any
- how many bugs were fixed and how many tests were added
- the branch name
- the next run's focus

Point to the report files rather than repeating them.
