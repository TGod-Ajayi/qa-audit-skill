'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { computeVerdict, generate } = require('../generate-report.cjs');
const { load, byId, unit, fixedProof, tmpRun } = require('./helpers.cjs');

const docs = () => ({ f: load('findings.json'), l: load('coverage-ledger.json'), r: load('run.json') });
const verdict = ({ f, l, r }) => computeVerdict(f, l, r);

/** Close every open finding and the referral so the sample can reach "Ship". */
function allClear() {
  const d = docs();
  let n = 10;
  for (const x of d.f.findings) {
    if ((x.verdict === 'confirmed' || x.verdict === 'flaky') && !(x.fix && x.fix.verdict === 'fixed')) x.fix = fixedProof(n++);
  }
  d.f.findings = d.f.findings.filter((x) => !x.security_referral);
  return d;
}

test('sample run: open S2 on a P0 unit means Don\'t ship', () => {
  const v = verdict(docs());
  assert.equal(v.verdict, "Don't ship");
  assert.ok(v.reasons.some((r) => r.includes('QA-002')));
});

test('everything fixed, no referrals: Ship', () => {
  assert.equal(verdict(allClear()).verdict, 'Ship');
});

test('open S1 of any class means Don\'t ship', () => {
  const d = allClear(); byId(d.f, 'QA-009').fix = null;
  const v = verdict(d);
  assert.equal(v.verdict, "Don't ship");
  assert.ok(v.reasons.some((r) => r.startsWith('Open S1 QA-009')));
});

test('open security S2 means Don\'t ship even off the P0 path', () => {
  const d = allClear(); const x = byId(d.f, 'QA-009'); x.fix = null; x.severity = 'S2';
  assert.ok(verdict(d).reasons.some((r) => /security S2 QA-009/.test(r)));
});

test('regressed fix means Don\'t ship', () => {
  const d = allClear(); byId(d.f, 'QA-001').fix = { verdict: 'regressed', notes: 'broke cart' };
  assert.equal(verdict(d).verdict, "Don't ship");
});

test('a pending or blocked P0 unit means Don\'t ship', () => {
  for (const status of ['pending', 'blocked']) {
    const d = allClear();
    const u = unit(d.l, 'U-001'); u.status = status; u.checks_performed = [];
    if (status === 'blocked') u.blocked_reason = 'no test inbox';
    assert.ok(verdict(d).reasons.some((r) => r.includes('U-001') && r.includes(status)), status);
  }
});

test('open S3 design or ux findings mean Ship with known issues', () => {
  const d = allClear(); byId(d.f, 'QA-007').fix = null;
  const v = verdict(d);
  assert.equal(v.verdict, 'Ship with known issues');
  assert.ok(v.reasons.some((r) => r.includes('QA-007')));
});

test('an unreviewed security referral keeps the verdict below Ship', () => {
  const d = allClear(); d.f.findings.push(load('findings.json').findings.find((x) => x.id === 'QA-010'));
  const v = verdict(d);
  assert.equal(v.verdict, 'Ship with known issues');
  assert.ok(v.reasons.some((r) => /Security referral QA-010/.test(r)));
});

test('an incomplete or partial run can never be a plain Ship', () => {
  const a = allClear(); a.r.run_status = 'incomplete'; a.r.incomplete_reason = 'validation_budget_exhausted';
  assert.equal(verdict(a).verdict, 'Ship with known issues');
  const b = allClear(); b.r.profile = 'quick';
  assert.ok(verdict(b).reasons.some((r) => /Partial run/.test(r)));
  const c = allClear(); c.r.scope = ['src/checkout'];
  assert.ok(verdict(c).reasons.some((r) => /scope: src\/checkout/.test(r)));
});

test('an open S4 alone does not block shipping', () => {
  const d = allClear(); const x = byId(d.f, 'QA-006'); x.fix = null; x.severity = 'S4';
  assert.equal(verdict(d).verdict, 'Ship');
});

test('generate writes all reports and preserves the hand-written summary', () => {
  const dir = tmpRun();
  const r1 = generate(dir);
  assert.equal(r1.files.length, 5);
  const report = fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8');
  assert.match(report, /## Release verdict: Don't ship/);
  assert.match(report, /### By check class/);
  assert.match(report, /\| design \|/);
  const custom = report.replace(/<!-- summary:start -->[\s\S]*<!-- summary:end -->/, '<!-- summary:start -->\nHand-written summary.\n<!-- summary:end -->');
  fs.writeFileSync(path.join(dir, 'REPORT.md'), custom);
  generate(dir);
  assert.match(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8'), /Hand-written summary\./);
  const coverage = fs.readFileSync(path.join(dir, 'COVERAGE.md'), 'utf8');
  assert.match(coverage, /No webhook signing secret/);
  assert.match(coverage, /## Out of scope[\s\S]*U-006/);
  assert.match(fs.readFileSync(path.join(dir, 'NEEDS-VALIDATION.md'), 'utf8'), /## Security referrals[\s\S]*QA-010/);
  assert.match(fs.readFileSync(path.join(dir, 'FINDINGS-DETAIL.md'), 'utf8'), /reproduced by:\*\* reproducer-01/);
  assert.match(fs.readFileSync(path.join(dir, 'SUGGESTIONS.md'), 'utf8'), /\| U-005 \| code-quality \|/);
});

test('draft and incomplete banners', () => {
  const a = tmpRun(({ run }) => { run.run_status = 'in_progress'; run.finished_at = null; });
  generate(a);
  assert.match(fs.readFileSync(path.join(a, 'REPORT.md'), 'utf8'), /\*\*Draft:\*\*/);
  const b = tmpRun(({ run }) => { run.run_status = 'incomplete'; run.incomplete_reason = 'critic_budget_exhausted'; });
  generate(b);
  assert.match(fs.readFileSync(path.join(b, 'REPORT.md'), 'utf8'), /\*\*Incomplete run:\*\* critic_budget_exhausted/);
});

test('table cells cannot break the markdown table', () => {
  const dir = tmpRun(({ findings }) => { byId(findings, 'QA-002').title = 'a | b\nc'; });
  generate(dir);
  assert.match(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8'), /a \\\| b c/);
});

test('generate refuses invalid records, mismatched files and a missing run.json', () => {
  const a = tmpRun(({ findings }) => { byId(findings, 'QA-001').severity = null; });
  assert.throws(() => generate(a), (e) => e.code === 'INVALID' && /needs severity/.test(e.message));
  const b = tmpRun(({ ledger }) => { ledger.build = 'deadbeef'; });
  assert.throws(() => generate(b), (e) => e.code === 'INVALID' && /build/.test(e.message));
  const c = tmpRun(); fs.unlinkSync(path.join(c, 'run.json'));
  assert.throws(() => generate(c), (e) => e.code === 'READ' && /run\.json/.test(e.message));
});

test('generate will not write through a planted symlink', { skip: process.platform === 'win32' }, () => {
  const dir = tmpRun();
  const target = path.join(dir, 'victim.txt');
  fs.writeFileSync(target, 'keep');
  fs.symlinkSync(target, path.join(dir, 'SUGGESTIONS.md'));
  assert.throws(() => generate(dir), /non-regular file/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
});
