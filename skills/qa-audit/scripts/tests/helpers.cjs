'use strict';
// Shared fixtures for the qa-audit script tests.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SAMPLE = path.join(ROOT, 'examples', 'sample-run');
const SCRIPTS = path.join(__dirname, '..');

const load = (n) => JSON.parse(fs.readFileSync(path.join(SAMPLE, n), 'utf8'));
const has = (errors, re) => errors.some((e) => re.test(e));
const byId = (doc, id) => doc.findings.find((f) => f.id === id);
const unit = (ledger, id) => ledger.units.find((u) => u.id === id);

function fixedProof(n = 1) {
  return {
    verdict: 'fixed', commit: `abc${n}def`, test_file: `tests/t${n}.spec.ts`,
    test_failed_before: true, fails_without_fix: true, failure_signature: `total should be ${n}00 kobo`,
    revert_check: `evidence/t${n}-revert-check.json`,
    test_passes_after: true, suite_no_worse_than_baseline: true,
    verified_by_independent_agent: true, fixer: `fixer-${n}`, verifier: `verifier-${n}`, rounds: 1,
    evidence: [`evidence/t${n}-before.txt`, `evidence/t${n}-after.txt`, `evidence/t${n}-revert-check.json`, `evidence/t${n}-repro-after.txt`],
    repro_after: [{
      kind: 'command', command: `npm test -- t${n}`, commit: `abc${n}def`, by: `verifier-${n}`, attempts: 3,
      result: 'pass', observed: 'expected behaviour', evidence: `evidence/t${n}-repro-after.txt`,
    }],
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-audit-test-'));
}

function tmpRun(mutate) {
  const dir = tmpDir();
  const docs = { ledger: load('coverage-ledger.json'), findings: load('findings.json'), run: load('run.json') };
  if (mutate) mutate(docs);
  fs.writeFileSync(path.join(dir, 'coverage-ledger.json'), JSON.stringify(docs.ledger));
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(docs.findings));
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(docs.run));
  fs.cpSync(path.join(SAMPLE, 'evidence'), path.join(dir, 'evidence'), { recursive: true });
  return dir;
}

function cli(script, args) {
  return spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8' });
}

module.exports = { ROOT, SAMPLE, load, has, byId, unit, fixedProof, tmpDir, tmpRun, cli };
