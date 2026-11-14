'use strict';
// A race caught once must not be lost because the reproducer never saw it again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, has, byId } = require('./helpers.cjs');
const { validateFindings } = require('../validate-findings.cjs');

const F = () => load('findings.json');
const errorsFor = (id, mutate) => { const f = F(); mutate(byId(f, id)); return validateFindings(f); };

// QA-011 is a timing candidate the tester recorded on video that never reproduced.
const asRejected = (f, kind = 'not_reproduced') => {
  f.verdict = 'rejected'; f.rejection_kind = kind; f.rejection_reason = 'did not reproduce';
  delete f.blocking_fact;
};

test('the sample parks an unreproduced race as needs_validation with its attempts', () => {
  const f = byId(F(), 'QA-011');
  assert.equal(f.verdict, 'needs_validation');
  assert.equal(f.repro_rate, '0/10');
  assert.deepEqual(validateFindings(F()), []);
});

test('a timing candidate with evidence cannot be rejected for not reproducing', () => {
  for (const kind of ['not_reproduced', 'no_longer_reproduces']) {
    assert.ok(has(errorsFor('QA-011', (f) => asRejected(f, kind)), /can't be rejected for not reproducing; use needs_validation/), kind);
  }
});

test('without tester evidence, or outside timing, a well-attempted rejection is allowed', () => {
  assert.deepEqual(errorsFor('QA-011', (f) => { asRejected(f); f.evidence = []; }), []);
  assert.deepEqual(errorsFor('QA-011', (f) => { asRejected(f); f.check_class = 'input'; f.unit = 'U-001'; }), []);
});

test('"did not reproduce" must say how hard it tried', () => {
  const noEvidence = (f) => { asRejected(f); f.evidence = []; };
  assert.ok(has(errorsFor('QA-011', (f) => { noEvidence(f); f.repro_rate = '0/3'; }), /needs repro_rate 0\/N with at least 5 attempts/));
  assert.ok(has(errorsFor('QA-011', (f) => { noEvidence(f); delete f.repro_rate; }), /needs repro_rate 0\/N/));
  assert.ok(has(errorsFor('QA-011', (f) => { noEvidence(f); f.repro_rate = '1/5'; }), /needs repro_rate 0\/N/));
});

test('rejections must say why, and needs_validation may only record 0/N', () => {
  assert.ok(has(errorsFor('QA-005', (f) => { delete f.rejection_kind; }), /rejected needs rejection_kind/));
  assert.ok(has(errorsFor('QA-005', (f) => { f.rejection_kind = 'vibes'; }), /rejection_kind/));
  assert.ok(has(errorsFor('QA-011', (f) => { f.repro_rate = '2/10'; }), /may only record repro_rate as 0\/N/));
  assert.ok(has(errorsFor('QA-011', (f) => { f.rejection_kind = 'not_reproduced'; }), /must not contain "rejection_kind"/));
  assert.ok(has(errorsFor('QA-001', (f) => { f.rejection_kind = 'duplicate'; }), /must not contain "rejection_kind"/));
});

test('an unreproduced race on a P0 unit keeps the verdict below Ship', () => {
  const { computeVerdict } = require('../generate-report.cjs');
  const { fixedProof } = require('./helpers.cjs');
  const f = F(); const l = load('coverage-ledger.json'); const r = load('run.json');
  let n = 10;
  for (const x of f.findings) if ((x.verdict === 'confirmed' || x.verdict === 'flaky') && !(x.fix && x.fix.verdict === 'fixed')) x.fix = fixedProof(n++);
  f.findings = f.findings.filter((x) => !x.security_referral);
  const v = computeVerdict(f, l, r);
  assert.equal(v.verdict, 'Ship with known issues');
  assert.ok(has(v.reasons, /QA-011/));
});
