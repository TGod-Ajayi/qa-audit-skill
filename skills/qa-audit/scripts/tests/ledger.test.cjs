'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLedger } = require('../validate-coverage-ledger.cjs');
const { load, has, unit } = require('./helpers.cjs');

const L = () => load('coverage-ledger.json');

test('sample ledger is valid', () => {
  assert.deepEqual(validateLedger(L()), []);
});

test('rejects non-objects, missing units and unknown top-level fields', () => {
  assert.ok(validateLedger(null).length);
  assert.ok(validateLedger([]).length);
  assert.ok(has(validateLedger({ run: 1, build: 'a1b2c3d', p0_journeys: [] }), /missing required field "units"/));
  const l = L(); l.verdict = 'ship';
  assert.ok(has(validateLedger(l), /unexpected field "verdict"/));
});

test('rejects unknown fields on units and checks', () => {
  const l = L();
  l.units[0].looks_fine = true;
  l.units[0].checks_performed[0].confidence = 'high';
  const e = validateLedger(l);
  assert.ok(has(e, /unexpected field "looks_fine"/));
  assert.ok(has(e, /unexpected field "confidence"/));
});

test('build must be a git sha', () => {
  const l = L(); l.build = 'main';
  assert.ok(has(validateLedger(l), /\$\.build: must match/));
});

test('rejects duplicate, malformed and unsorted ids', () => {
  const l = L();
  l.units[1].id = 'U-001';
  assert.ok(has(validateLedger(l), /duplicate id/));
  const m = L(); m.units[2].id = 'unit-3';
  assert.ok(has(validateLedger(m), /\.id: must match/));
  const s = L(); [s.units[2], s.units[3]] = [s.units[3], s.units[2]];
  assert.ok(has(validateLedger(s), /sorted by id/));
});

test('accepts the design, ux, code-quality and security classes and the code kind', () => {
  const l = L();
  assert.ok(unit(l, 'U-002').check_classes.includes('design'));
  assert.ok(unit(l, 'U-002').check_classes.includes('ux'));
  assert.equal(unit(l, 'U-005').kind, 'code');
  assert.deepEqual(validateLedger(l), []);
});

test('rejects unknown and duplicated check classes', () => {
  const l = L();
  unit(l, 'U-004').check_classes.push('vibes');
  assert.ok(has(validateLedger(l), /invalid value "vibes"/));
  const d = L(); unit(d, 'U-004').check_classes.push('integration');
  assert.ok(has(validateLedger(d), /duplicate of/));
});

test('covered unit needs evidenced checks for every assigned class', () => {
  const l = L();
  unit(l, 'U-001').check_classes.push('a11y');
  assert.ok(has(validateLedger(l), /lacks evidenced checks for: a11y/));
});

test('covered unit cannot contain blocked checks', () => {
  const l = L();
  unit(l, 'U-001').checks_performed.push({ class: 'input', check: 'x', result: 'blocked', evidence: [] });
  assert.ok(has(validateLedger(l), /blocked check; use partial/));
});

test('pass and fail checks need evidence; blocked checks do not', () => {
  const l = L();
  unit(l, 'U-003').checks_performed.push({ class: 'performance', check: 'CLS', result: 'pass', evidence: [] });
  assert.ok(has(validateLedger(l), /needs evidence/));
});

test('evidence must be a safe path under evidence/', () => {
  for (const bad of ['../secrets.txt', '/tmp/x.png', 'screens/x.png', 'evidence/../../x']) {
    const l = L();
    unit(l, 'U-001').checks_performed[0].evidence = [bad];
    assert.ok(has(validateLedger(l), /under evidence\//), bad);
  }
});

test('source files must be safe repository-relative paths', () => {
  const l = L();
  unit(l, 'U-001').source_files.push('/Users/me/app/src/x.ts');
  assert.ok(has(validateLedger(l), /safe repository-relative path/));
});

test('a code unit must list its source files', () => {
  const l = L(); unit(l, 'U-005').source_files = [];
  assert.ok(has(validateLedger(l), /code unit must list its source_files/));
});

test('check class must be assigned to the unit', () => {
  const l = L();
  unit(l, 'U-003').checks_performed.push({ class: 'money', check: 'x', result: 'pass', evidence: ['evidence/e.png'] });
  assert.ok(has(validateLedger(l), /class "money" is not assigned/));
});

test('blocked, deferred and out_of_scope units need a reason; others must not have one', () => {
  for (const status of ['blocked', 'deferred', 'out_of_scope']) {
    const l = L();
    const u = unit(l, 'U-004');
    u.status = status; u.blocked_reason = null;
    assert.ok(has(validateLedger(l), new RegExp(`${status} unit needs blocked_reason`)), status);
  }
  const l = L(); unit(l, 'U-001').blocked_reason = 'x';
  assert.ok(has(validateLedger(l), /only allowed on blocked/));
});

test('covered, partial and blocked units record the agent whose results were merged', () => {
  const l = L(); delete unit(l, 'U-001').assigned_to;
  assert.ok(has(validateLedger(l), /needs assigned_to/));
  const m = L(); unit(m, 'U-001').assigned_to = 'Tester B01';
  assert.ok(has(validateLedger(m), /assigned_to: must match/));
});

test('pending and out_of_scope units have no checks; partial units have some', () => {
  const l = L(); unit(l, 'U-001').status = 'pending';
  assert.ok(has(validateLedger(l), /pending unit has checks/));
  const o = L(); const u = unit(o, 'U-006'); u.checks_performed = [{ class: 'happy-path', check: 'x', result: 'pass', evidence: ['evidence/x.png'] }];
  assert.ok(has(validateLedger(o), /out_of_scope unit must not have checks/));
  const p = L(); const q = unit(p, 'U-004'); q.status = 'partial'; q.blocked_reason = null;
  assert.ok(has(validateLedger(p), /partial unit has no checks/));
});

test('P0 journeys must exist, be P0, be unique, be in scope and be complete', () => {
  const a = L(); a.p0_journeys = [];
  assert.ok(has(validateLedger(a), /at least one P0 journey/));
  const b = L(); b.p0_journeys.push({ name: 'Ghost', unit: 'U-099' });
  assert.ok(has(validateLedger(b), /unknown unit U-099/));
  const c = L(); c.p0_journeys.push({ name: 'Catalogue', unit: 'U-003' });
  assert.ok(has(validateLedger(c), /must have priority P0/));
  const d = L(); d.p0_journeys.push({ name: 'Again', unit: 'U-001' });
  assert.ok(has(validateLedger(d), /listed twice/));
  const e = L(); e.p0_journeys.pop();
  assert.ok(has(validateLedger(e), /U-002: P0 journey unit is missing from p0_journeys/));
});
