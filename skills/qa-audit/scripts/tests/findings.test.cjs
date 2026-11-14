'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFindings } = require('../validate-findings.cjs');
const { load, has, byId, unit, fixedProof } = require('./helpers.cjs');

const F = () => load('findings.json');
const L = () => load('coverage-ledger.json');
const R = () => load('run.json');

test('sample findings are valid alone and with ledger and run cross-checks', () => {
  assert.deepEqual(validateFindings(F()), []);
  assert.deepEqual(validateFindings(F(), L(), R()), []);
});

test('rejects non-objects and unknown fields', () => {
  assert.ok(validateFindings(null).length);
  const f = F(); byId(f, 'QA-001').confidence = 'high';
  assert.ok(has(validateFindings(f), /unexpected field "confidence"/));
  const g = F(); byId(g, 'QA-001').fix.looks_good = true;
  assert.ok(has(validateFindings(g), /unexpected field "looks_good"/));
});

test('ids are unique and sorted', () => {
  const f = F(); byId(f, 'QA-002').id = 'QA-001';
  assert.ok(has(validateFindings(f), /duplicate id/));
  const g = F(); g.findings.reverse();
  assert.ok(has(validateFindings(g), /sorted by id/));
});

test('confirmed and flaky findings need the full evidence record', () => {
  for (const k of ['check_class', 'impact', 'likelihood', 'expected', 'expected_source', 'observed', 'repro_rate', 'found_by', 'reproduced_by']) {
    const f = F(); delete byId(f, 'QA-002')[k];
    assert.ok(has(validateFindings(f), new RegExp(`needs ${k}`)), k);
  }
  const f = F(); byId(f, 'QA-002').minimal_repro = [];
  assert.ok(has(validateFindings(f), /minimal_repro/));
  const g = F(); byId(g, 'QA-002').evidence = [];
  assert.ok(has(validateFindings(g), /needs evidence/));
  const h = F(); byId(h, 'QA-002').severity = null;
  assert.ok(has(validateFindings(h), /needs severity/));
});

test('the finder may not reproduce its own finding', () => {
  const f = F(); const x = byId(f, 'QA-002'); x.reproduced_by = x.found_by;
  assert.ok(has(validateFindings(f), /separation of duties/));
});

test('repro-rate rules separate confirmed from flaky', () => {
  const cases = [['confirmed', '2/3', /at least 3\/3/], ['confirmed', '2/2', /at least 3\/3/], ['confirmed', '4/3', /impossible/],
    ['confirmed', '0/0', /impossible/], ['flaky', '10/10', /intermittent/], ['flaky', '0/10', /intermittent/], ['flaky', '1/3', /at least 5 attempts/]];
  for (const [verdict, rate, re] of cases) {
    const f = F(); const x = byId(f, 'QA-003'); x.verdict = verdict; x.repro_rate = rate;
    assert.ok(has(validateFindings(f), re), `${verdict} ${rate}`);
  }
  const ok = F(); byId(ok, 'QA-002').repro_rate = '5/5';
  assert.deepEqual(validateFindings(ok), []);
});

test('needs_validation and rejected have no severity, no fix and their own reason', () => {
  const a = F(); byId(a, 'QA-004').severity = 'S2';
  assert.ok(has(validateFindings(a), /severity must be null/));
  const b = F(); byId(b, 'QA-004').blocking_fact = null;
  assert.ok(has(validateFindings(b), /needs blocking_fact/));
  const c = F(); byId(c, 'QA-005').rejection_reason = '';
  assert.ok(validateFindings(c).length);
  const d = F(); byId(d, 'QA-004').fix = fixedProof();
  assert.ok(has(validateFindings(d), /must not contain "fix"/));
  const e = F(); byId(e, 'QA-005').blocking_fact = 'x';
  assert.ok(has(validateFindings(e), /must not contain "blocking_fact"/));
});

test('security referrals stay unprobed needs_validation', () => {
  const f = F(); const x = byId(f, 'QA-002'); x.security_referral = true;
  assert.ok(has(validateFindings(f), /security_referral is unprobed/));
});

test('a confirmed security finding is allowed when it was observed without probing', () => {
  const x = byId(F(), 'QA-009');
  assert.equal(x.check_class, 'security');
  assert.equal(x.verdict, 'confirmed');
});

test('fixed requires complete proof from two different agents', () => {
  for (const k of ['test_failed_before', 'test_passes_after', 'suite_no_worse_than_baseline', 'verified_by_independent_agent']) {
    const f = F(); byId(f, 'QA-001').fix[k] = false;
    assert.ok(has(validateFindings(f), new RegExp(`requires ${k}: true`)), k);
  }
  for (const k of ['commit', 'test_file', 'fixer', 'verifier']) {
    const f = F(); delete byId(f, 'QA-001').fix[k];
    assert.ok(has(validateFindings(f), new RegExp(`requires ${k}`)), k);
  }
  const g = F(); byId(g, 'QA-001').fix.evidence = [];
  assert.ok(has(validateFindings(g), /requires evidence/));
  const h = F(); const fx = byId(h, 'QA-001').fix; fx.verifier = fx.fixer;
  assert.ok(has(validateFindings(h), /verifier must be a different agent/));
  const i = F(); const y = byId(i, 'QA-001'); y.fix.fixer = y.reproduced_by;
  assert.ok(has(validateFindings(i), /fixer must not be the agent that reproduced/));
  const j = F(); byId(j, 'QA-001').fix.test_file = '../outside.spec.ts';
  assert.ok(has(validateFindings(j), /test_file must be a safe/));
});

test('unsuccessful fix verdicts need notes', () => {
  for (const verdict of ['not_fixed', 'regressed', 'needs_human']) {
    const f = F(); byId(f, 'QA-002').fix = { verdict };
    assert.ok(has(validateFindings(f), new RegExp(`${verdict} requires notes`)), verdict);
  }
});

test('evidence paths must stay under evidence/', () => {
  const f = F(); byId(f, 'QA-002').evidence = ['../../etc/passwd'];
  assert.ok(has(validateFindings(f), /under evidence\//));
});

test('first_seen_run cannot be in the future', () => {
  const f = F(); byId(f, 'QA-002').first_seen_run = 9;
  assert.ok(has(validateFindings(f), /first_seen_run/));
});

test('ledger cross-checks: unit, build, run, untested units and check class', () => {
  const a = F(); byId(a, 'QA-002').unit = 'U-099';
  assert.ok(has(validateFindings(a, L()), /U-099 not in ledger/));
  const b = F(); b.build = 'deadbeef';
  assert.ok(has(validateFindings(b, L()), /does not match ledger build/));
  const c = F(); byId(c, 'QA-002').check_class = 'money';
  assert.ok(has(validateFindings(c, L()), /not assigned to unit U-001/));
  const d = F(); byId(d, 'QA-005').unit = 'U-006';
  assert.deepEqual(validateFindings(d, L()), [], 'rejected findings may point at out-of-scope units');
  const e = F(); byId(e, 'QA-003').unit = 'U-006'; byId(e, 'QA-003').check_class = 'happy-path';
  assert.ok(has(validateFindings(e, L()), /is out_of_scope; a finding implies it was tested/));
  const s = F(); s.suggestions.push({ unit: 'U-077', text: 'x' });
  assert.ok(has(validateFindings(s, L()), /U-077 not in ledger/));
  const w = F(); byId(w, 'QA-003').unit = 'WILDCARD';
  assert.deepEqual(validateFindings(w, L()), []);
});

test('run cross-checks: fixes are not allowed in report-only runs', () => {
  const r = R(); r.mode = 'report-only'; r.fixing_allowed = false; r.branch = null;
  assert.ok(has(validateFindings(F(), L(), r), /fix records are not allowed/));
  const s = R(); s.run = 2;
  assert.ok(has(validateFindings(F(), null, s), /does not match run.json run/));
});

test('unit ids in a finding must not be arbitrary strings', () => {
  const f = F(); byId(f, 'QA-002').unit = 'checkout';
  assert.ok(has(validateFindings(f), /\.unit: must match/));
  void unit;
});
