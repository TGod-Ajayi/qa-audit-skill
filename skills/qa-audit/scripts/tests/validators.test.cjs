'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { validateLedger } = require('../validate-coverage-ledger.cjs');
const { validateFindings } = require('../validate-findings.cjs');

const SAMPLE = path.join(__dirname, '..', '..', '..', '..', 'examples', 'sample-run');
const load = (n) => JSON.parse(fs.readFileSync(path.join(SAMPLE, n), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (errors, re) => errors.some((e) => re.test(e));

// ---------- ledger ----------

test('sample ledger is valid', () => {
  assert.deepEqual(validateLedger(load('coverage-ledger.json')), []);
});

test('ledger rejects non-object and missing units', () => {
  assert.ok(validateLedger(null).length);
  assert.ok(has(validateLedger({ run: 1, build: 'x' }), /units must be an array/));
});

test('ledger rejects duplicate and malformed ids', () => {
  const l = load('coverage-ledger.json');
  l.units[1].id = 'U-001';
  l.units[2].id = 'unit-3';
  const e = validateLedger(l);
  assert.ok(has(e, /duplicate id/));
  assert.ok(has(e, /id must look like U-001/));
});

test('covered unit must have evidenced checks for every assigned class', () => {
  const l = load('coverage-ledger.json');
  l.units[0].check_classes.push('a11y');
  assert.ok(has(validateLedger(l), /lacks evidenced checks for: a11y/));
});

test('covered unit cannot contain blocked checks', () => {
  const l = load('coverage-ledger.json');
  l.units[0].checks_performed.push({ class: 'input', check: 'x', result: 'blocked', evidence: [] });
  assert.ok(has(validateLedger(l), /blocked check; use partial/));
});

test('pass/fail checks need evidence; blocked checks do not', () => {
  const l = load('coverage-ledger.json');
  l.units[2].checks_performed.push({ class: 'performance', check: 'LCP', result: 'blocked', evidence: [] });
  assert.deepEqual(validateLedger(l), []);
  l.units[2].checks_performed.push({ class: 'performance', check: 'CLS', result: 'pass', evidence: [] });
  assert.ok(has(validateLedger(l), /needs evidence/));
});

test('check class must be assigned to the unit and known', () => {
  const l = load('coverage-ledger.json');
  l.units[2].checks_performed.push({ class: 'money', check: 'x', result: 'pass', evidence: ['e'] });
  l.units[3].check_classes.push('vibes');
  const e = validateLedger(l);
  assert.ok(has(e, /class "money" is not assigned/));
  assert.ok(has(e, /unknown check class "vibes"/));
});

test('blocked unit needs a reason; pending unit cannot have checks', () => {
  const l = load('coverage-ledger.json');
  delete l.units[3].blocked_reason;
  l.units[2].status = 'pending';
  const e = validateLedger(l);
  assert.ok(has(e, /needs blocked_reason/));
  assert.ok(has(e, /pending unit has checks/));
});

test('P0 journeys must point to existing P0 units', () => {
  const l = load('coverage-ledger.json');
  l.p0_journeys.push({ name: 'Ghost', unit: 'U-999' });
  l.p0_journeys.push({ name: 'Catalog', unit: 'U-003' });
  const e = validateLedger(l);
  assert.ok(has(e, /unknown unit U-999/));
  assert.ok(has(e, /must have priority P0/));
  l.p0_journeys = [];
  assert.ok(has(validateLedger(l), /at least one P0 journey/));
});

// ---------- findings ----------

test('sample findings are valid against the ledger', () => {
  assert.deepEqual(validateFindings(load('findings.json'), load('coverage-ledger.json')), []);
});

test('confirmed needs severity, sourced expectation, repro and evidence', () => {
  const d = load('findings.json');
  const f = d.findings[1];
  f.severity = null; delete f.expected_source; f.minimal_repro = []; f.evidence = [];
  const e = validateFindings(d);
  for (const re of [/needs severity/, /needs expected_source/, /needs minimal_repro/, /needs evidence/]) assert.ok(has(e, re), re);
});

test('confirmed requires >=3/3; flaky requires intermittent rate', () => {
  const d = load('findings.json');
  d.findings[1].repro_rate = '2/3';
  d.findings[2].repro_rate = '10/10';
  const e = validateFindings(d);
  assert.ok(has(e, /confirmed needs ≥3\/3/));
  assert.ok(has(e, /flaky needs an intermittent rate/));
  d.findings[1].repro_rate = '5/3';
  assert.ok(has(validateFindings(d), /impossible/));
});

test('non-proven findings: null severity, no fix, required reason fields', () => {
  const d = load('findings.json');
  d.findings[3].severity = 'S2';
  d.findings[3].blocking_fact = '';
  d.findings[4].rejection_reason = null;
  d.findings[4].fix = { verdict: 'fixed' };
  const e = validateFindings(d);
  assert.ok(has(e, /severity must be null for needs_validation/));
  assert.ok(has(e, /needs blocking_fact/));
  assert.ok(has(e, /needs rejection_reason/));
  assert.ok(has(e, /rejected findings must not have a fix/));
});

test('a fix marked fixed must carry full proof', () => {
  const d = load('findings.json');
  Object.assign(d.findings[0].fix, { test_failed_before: false, verified_by_independent_agent: false, commit: '' });
  const e = validateFindings(d);
  assert.ok(has(e, /test_failed_before/));
  assert.ok(has(e, /verified_by_independent_agent/));
  assert.ok(has(e, /requires commit/));
});

test('needs_human fix requires notes; unknown fix verdict rejected', () => {
  const d = load('findings.json');
  d.findings[1].fix = { verdict: 'needs_human' };
  d.findings[2].fix = { verdict: 'kinda' };
  const e = validateFindings(d);
  assert.ok(has(e, /needs_human requires notes/));
  assert.ok(has(e, /fix.verdict must be one of/));
});

test('security referrals must stay needs_validation', () => {
  const d = load('findings.json');
  d.findings[1].security_referral = true;
  assert.ok(has(validateFindings(d), /security_referral findings stay needs_validation/));
});

test('unit must exist in ledger unless WILDCARD; ids unique', () => {
  const d = load('findings.json');
  const l = load('coverage-ledger.json');
  d.findings[1].unit = 'U-777';
  d.findings[2].unit = 'WILDCARD';
  d.findings[3].id = 'QA-001';
  const e = validateFindings(d, l);
  assert.ok(has(e, /unit U-777 not in ledger/));
  assert.ok(!has(e, /WILDCARD/));
  assert.ok(has(e, /duplicate id/));
});

test('suggestions need text', () => {
  const d = load('findings.json');
  d.suggestions.push({ unit: 'U-001' });
  assert.ok(has(validateFindings(d), /suggestions\[1\]: text is required/));
});
