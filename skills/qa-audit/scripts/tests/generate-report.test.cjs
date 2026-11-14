'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { computeVerdict, generate } = require('../generate-report.cjs');

const SAMPLE = path.join(__dirname, '..', '..', '..', '..', 'examples', 'sample-run');
const load = (n) => JSON.parse(fs.readFileSync(path.join(SAMPLE, n), 'utf8'));

function tmpRun(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-audit-'));
  const ledger = load('coverage-ledger.json');
  const findings = load('findings.json');
  const run = load('run.json');
  if (mutate) mutate({ ledger, findings, run });
  fs.writeFileSync(path.join(dir, 'coverage-ledger.json'), JSON.stringify(ledger));
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings));
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run));
  return dir;
}

test('sample run: open S2 on P0 unit → Don\'t ship', () => {
  const v = computeVerdict(load('findings.json'), load('coverage-ledger.json'));
  assert.equal(v.verdict, "Don't ship");
  assert.ok(v.reasons.some((r) => r.includes('QA-002')));
});

test('open S1 → Don\'t ship', () => {
  const f = load('findings.json');
  f.findings[0].fix = null;
  const v = computeVerdict(f, load('coverage-ledger.json'));
  assert.equal(v.verdict, "Don't ship");
  assert.ok(v.reasons.some((r) => r.startsWith('Open S1 QA-001')));
});

test('regressed fix → Don\'t ship', () => {
  const f = load('findings.json');
  f.findings[1].fix = null;
  f.findings[1].severity = 'S3';
  f.findings[0].fix.verdict = 'regressed';
  assert.equal(computeVerdict(f, load('coverage-ledger.json')).verdict, "Don't ship");
});

test('P0 unit pending → Don\'t ship', () => {
  const f = load('findings.json');
  f.findings.splice(1, 1);
  const l = load('coverage-ledger.json');
  l.units[0].status = 'pending';
  const v = computeVerdict(f, l);
  assert.equal(v.verdict, "Don't ship");
  assert.ok(v.reasons.some((r) => r.includes('U-001') && r.includes('pending')));
});

test('only S3 open and partial P1 → Ship with known issues', () => {
  const f = load('findings.json');
  f.findings[1].fix = { verdict: 'fixed', commit: 'abc', test_file: 't.spec.ts', test_failed_before: true, test_passes_after: true, verified_by_independent_agent: true };
  const v = computeVerdict(f, load('coverage-ledger.json'));
  assert.equal(v.verdict, 'Ship with known issues');
  assert.ok(v.reasons.some((r) => r.includes('QA-003')));
});

test('everything fixed or minor → Ship', () => {
  const f = load('findings.json');
  const proof = { verdict: 'fixed', commit: 'abc', test_file: 't', test_failed_before: true, test_passes_after: true, verified_by_independent_agent: true };
  f.findings[1].fix = { ...proof };
  f.findings[2].fix = { ...proof };
  assert.equal(computeVerdict(f, load('coverage-ledger.json')).verdict, 'Ship');
});

test('open S4 alone does not block shipping', () => {
  const f = load('findings.json');
  const proof = { verdict: 'fixed', commit: 'abc', test_file: 't', test_failed_before: true, test_passes_after: true, verified_by_independent_agent: true };
  f.findings[1].fix = { ...proof };
  f.findings[2].severity = 'S4';
  f.findings[2].verdict = 'confirmed';
  f.findings[2].repro_rate = '3/3';
  assert.equal(computeVerdict(f, load('coverage-ledger.json')).verdict, 'Ship');
});

test('generate writes all reports and preserves the hand-written summary', () => {
  const dir = tmpRun();
  const r1 = generate(dir);
  assert.equal(r1.files.length, 5);
  for (const n of r1.files) assert.ok(fs.existsSync(path.join(dir, n)), n);
  const report = fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8');
  assert.match(report, /## Release verdict: Don't ship/);
  assert.match(report, /QA-002/);

  const custom = report.replace(/<!-- summary:start -->[\s\S]*<!-- summary:end -->/,'<!-- summary:start -->\nHand-written summary.\n<!-- summary:end -->');
  fs.writeFileSync(path.join(dir, 'REPORT.md'), custom);
  generate(dir);
  assert.match(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8'), /Hand-written summary\./);

  assert.match(fs.readFileSync(path.join(dir, 'COVERAGE.md'), 'utf8'), /No webhook signing secret/);
  assert.match(fs.readFileSync(path.join(dir, 'NEEDS-VALIDATION.md'), 'utf8'), /QA-004/);
  assert.match(fs.readFileSync(path.join(dir, 'FINDINGS-DETAIL.md'), 'utf8'), /QA-001 \[S1\]/);
});

test('generate refuses invalid records', () => {
  const dir = tmpRun(({ findings }) => { findings.findings[0].severity = null; });
  assert.throws(() => generate(dir), (e) => e.code === 'INVALID' && /needs severity/.test(e.message));
});
