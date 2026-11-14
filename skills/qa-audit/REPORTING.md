# Phase 7: Reporting

Reports are **generated from the validated records**, not written freehand. That keeps them honest and repeatable.

## 7.1 Generate

```bash
node scripts/validate-run.cjs <run>/run.json
node scripts/validate-coverage-ledger.cjs <run>/coverage-ledger.json
node scripts/validate-findings.cjs <run>/findings.json --ledger <run>/coverage-ledger.json --run <run>/run.json --run-dir <run>
node scripts/stamp-verdict.cjs stamp <run> --repo <repo>
node scripts/generate-report.cjs <run>
```

The generator validates all three records itself and refuses to write reports from invalid ones.

**Stamp the verdict** after the regression sweep, with the audit branch checked out and nothing uncommitted. `stamp-verdict.cjs stamp` writes `verdict.json`: the verdict, the verified HEAD, its tree hash, the fix commits and a sha256 of each record. It refuses when:

- the run is unfinished, or the audited build was dirty
- the repo has uncommitted or untracked changes
- HEAD doesn't descend from the audited build, or is missing a fix commit
- any commit since the audited build isn't a recorded fix

A non-fix commit you have checked (a revert after `needs_human`, say) can be named with `--accept <sha>`; it is recorded with its subject and shown in the report. Never accept a commit you haven't verified.

The report shows **Verified build** for a current stamp, **Stale stamp** when the records changed after stamping, and **Unstamped** when there is none. Before anyone ships, `stamp-verdict.cjs check <run> --repo <repo>` must pass. It fails when the records changed, the repo has uncommitted or untracked changes, or HEAD's tree differs from the stamped one. Any edit after the stamp, by anyone, cancels the verdict. A rebase or merge that leaves the tree identical still passes. Put the check in CI or a pre-merge hook.

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
- the branch name, and the verified commit and tree from `verdict.json`
- the next run's focus
- that the verdict holds only while `stamp-verdict.cjs check` passes

Point to the report files rather than repeating them.
