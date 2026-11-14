'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRun, isPartialRun } = require('../validate-run.cjs');
const { load, has } = require('./helpers.cjs');

const R = () => load('run.json');

test('sample run metadata is valid', () => {
  assert.deepEqual(validateRun(R()), []);
});

test('rejects unknown fields and missing required fields', () => {
  const r = R(); r.vibe = 'good';
  assert.ok(has(validateRun(r), /unexpected field "vibe"/));
  const s = R(); delete s.profile;
  assert.ok(has(validateRun(s), /missing required field "profile"/));
});

test('run status rules', () => {
  const a = R(); a.run_status = 'in_progress';
  assert.ok(has(validateRun(a), /must be null while run_status is in_progress/));
  const b = R(); b.finished_at = null;
  assert.ok(has(validateRun(b), /required when run_status is complete/));
  const c = R(); c.run_status = 'incomplete';
  assert.ok(has(validateRun(c), /incomplete_reason: is required/));
  const d = R(); d.incomplete_reason = 'x';
  assert.ok(has(validateRun(d), /only allowed when run_status is incomplete/));
});

test('timestamps are ISO with a timezone and ordered', () => {
  const a = R(); a.started_at = 'this morning';
  assert.ok(has(validateRun(a), /ISO 8601/));
  const b = R(); b.finished_at = '2026-11-14T08:00:00Z';
  assert.ok(has(validateRun(b), /earlier than started_at/));
});

test('mode, fixing and branch must agree', () => {
  const a = R(); a.mode = 'report-only';
  assert.ok(has(validateRun(a), /must be false in report-only mode/));
  const b = R(); b.branch = null;
  assert.ok(has(validateRun(b), /branch: is required when fixing is allowed/));
  const c = R(); c.fixing_allowed = false;
  assert.ok(has(validateRun(c), /must be null when fixing is not allowed/));
  const d = R(); d.branch = 'main';
  assert.ok(has(validateRun(d), /branch: must match/));
  const e = R(); e.branch = 'qa-audit/run-7';
  assert.ok(has(validateRun(e), /must be qa-audit\/run-1/));
});

test('budget cannot be overspent silently', () => {
  const a = R(); a.agents_used = 41;
  assert.ok(has(validateRun(a), /exceeds budget/));
  const b = R(); b.agents_used = 41; b.run_status = 'incomplete'; b.incomplete_reason = 'validation_budget_exhausted';
  assert.deepEqual(validateRun(b), []);
});

test('scope entries are relative paths or selectors', () => {
  const a = R(); a.scope = ['src/checkout', 'journey:checkout', 'unit:U-002'];
  assert.deepEqual(validateRun(a), []);
  const b = R(); b.scope = ['/etc'];
  assert.ok(has(validateRun(b), /scope\[0\]/));
});

test('partial runs are detected', () => {
  assert.equal(isPartialRun(R()), false);
  assert.equal(isPartialRun({ ...R(), profile: 'quick' }), true);
  assert.equal(isPartialRun({ ...R(), scope: ['src/checkout'] }), true);
  assert.equal(isPartialRun({ ...R(), mode: 'focused' }), true);
});
