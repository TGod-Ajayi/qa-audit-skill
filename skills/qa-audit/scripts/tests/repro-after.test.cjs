'use strict';
// Rules for fix.repro_after: the verifier re-running the original repro on the fixed build.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, has, byId } = require('./helpers.cjs');
const { validateFindings } = require('../validate-findings.cjs');

const F = () => load('findings.json');
const errorsFor = (mutate, id = 'QA-001') => { const f = F(); mutate(byId(f, id)); return validateFindings(f); };

test('the sample fixes carry valid re-runs', () => {
  assert.deepEqual(validateFindings(F()), []);
});

test('fixed requires a repro_after re-run', () => {
  assert.ok(has(errorsFor((f) => { delete f.fix.repro_after; }), /fixed requires repro_after/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after = []; }), /fixed requires repro_after/));
});

test('the re-run must be done by the verifier, not the fixer or anyone else', () => {
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].by = f.fix.fixer; }), /must be run by the verifier \(verifier-qa-001\)/));
});

test('a failing re-run means the fix is not fixed', () => {
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[1].result = 'fail'; }), /fails its original repro is not fixed/));
});

test('browser findings need the original environment and one other browser', () => {
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].viewport = '390x844'; }), /original environment \(chromium 1440x900\)/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].browser = 'firefox'; }), /original environment/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[1].browser = 'chromium'; }), /at least one other browser/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after = [f.fix.repro_after[0]]; }), /at least one other browser/));
});

test('the original-environment re-run repeats as often as the fix check needs', () => {
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].attempts = 1; }), /needs at least 3 attempts for a confirmed finding/));
  // A flaky 1/10 bug needs 29 clean attempts in the original environment.
  const flaky = (f) => { f.verdict = 'flaky'; f.repro_rate = '1/10'; };
  assert.ok(has(errorsFor((f) => { flaky(f); }), /needs at least 29 attempts for a flaky finding/));
  assert.ok(!has(errorsFor((f) => { flaky(f); f.fix.repro_after[0].attempts = 29; }), /attempts/));
  // Static findings re-run their command.
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].attempts = 2; }, 'QA-009'), /needs a re-run with at least 3 attempts/));
});

test('each re-run is well formed and its evidence is listed', () => {
  assert.ok(has(errorsFor((f) => { delete f.fix.repro_after[0].browser; }), /a browser re-run needs browser/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].command = 'npx playwright test'; }), /a browser re-run has no command/));
  assert.ok(has(errorsFor((f) => { delete f.fix.repro_after[0].command; }, 'QA-009'), /a command re-run needs command/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].browser = 'chromium'; }, 'QA-009'), /a command re-run has no browser/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].evidence = '../trace.zip'; }), /safe relative path under evidence/));
  assert.ok(has(errorsFor((f) => { f.fix.evidence = f.fix.evidence.filter((e) => !e.includes('webkit')); }), /also be listed in fix evidence/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].commit = 'HEAD'; }), /commit/));
  assert.ok(has(errorsFor((f) => { f.fix.repro_after[0].surprise = 1; }), /surprise/));
});
