# Contributing

Thanks for helping improve qa-audit. Issues and pull requests are welcome.

## Ground rules

- **Keep the evidence bar.** Changes must not weaken reproduction, sourced expectations, test-first fixing, independent verification or schema validation.
- **Keep security passive.** The skill confirms only non-invasive observations. Anything that needs probing stays a `security_referral`. PRs that add exploitation, payloads or brute-force steps will be declined.
- **No dependencies.** Scripts run on plain Node.js 18+.

## Adding a domain checklist

Put new files in `skills/qa-audit/checks/` and follow the existing structure:

1. `# <Domain> checks`
2. `#### When to use this file`
3. `## Core discipline (include in every tester prompt for this domain)`, as a fenced block
4. Grouped sections, each `## <group> (check classes: ...)`, with bold-named checks covering what to do, what is a bug and what is not
5. `## Universal moves`
6. `## Validation rules (apply before reporting ANY candidate here)`

Then list it in the Files table in `SKILL.md` and reference it from `CHECK-CLASSES.md`. `scripts/tests/docs.test.cjs` checks all of this.

## Changing a schema or validator

- Schemas use only the keywords supported by `scripts/lib/common.cjs`. Unknown keywords fail the tests on purpose.
- Add a test for every new rule in `skills/qa-audit/scripts/tests/`.
- If the sample run changes, regenerate its reports. CI fails if `examples/sample-run` drifts from the generator output:

```bash
npm run example
npm test
```

The sample's `verdict.json` holds sha256 hashes of its three records, so a change to any of them makes the stamp stale and fails a test. Refresh the hashes, then regenerate:

```bash
node -e "const p='examples/sample-run/verdict.json',fs=require('fs'),d=JSON.parse(fs.readFileSync(p));d.records=require('./skills/qa-audit/scripts/lib/stamp.cjs').recordHashes('examples/sample-run');fs.writeFileSync(p,JSON.stringify(d,null,2)+'\\n')"
npm run example
```

## Commit style

Use short imperative subjects, such as `checks: add PWA checklist` or `validators: reject absolute evidence paths`.
