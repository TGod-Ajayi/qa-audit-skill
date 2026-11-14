'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { SAMPLE, cli, tmpDir, tmpRun } = require('./helpers.cjs');

const S = (n) => path.join(SAMPLE, n);

test('CLIs accept the sample run', () => {
  assert.equal(cli('validate-run.cjs', [S('run.json')]).status, 0);
  assert.equal(cli('validate-coverage-ledger.cjs', [S('coverage-ledger.json')]).status, 0);
  const r = cli('validate-findings.cjs', [S('findings.json'), '--ledger', S('coverage-ledger.json'), '--run', S('run.json')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6 confirmed/);
});

test('CLIs exit 2 on usage errors', () => {
  assert.equal(cli('validate-run.cjs', []).status, 2);
  assert.equal(cli('validate-coverage-ledger.cjs', ['a', 'b']).status, 2);
  assert.equal(cli('validate-findings.cjs', [S('findings.json'), '--ledger']).status, 2);
  assert.equal(cli('validate-findings.cjs', [S('findings.json'), '--bogus', 'x']).status, 2);
  assert.equal(cli('generate-report.cjs', []).status, 2);
});

test('CLIs exit 2 on unreadable input without a stack trace or echoed content', () => {
  const dir = tmpDir();
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"leak": TOPSECRET');
  const r = cli('validate-findings.cjs', [bad]);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /TOPSECRET|at Object\.|node:internal/);
  const big = path.join(dir, 'big.json');
  fs.writeFileSync(big, Buffer.alloc(16 * 1024 * 1024 + 1, 0x20));
  assert.match(cli('validate-coverage-ledger.cjs', [big]).stderr, /exceeds/);
});

test('CLIs exit 1 with escaped diagnostics on invalid records', () => {
  const dir = tmpRun(({ findings }) => { findings.findings[0]['\u001b[31mevil'] = 1; });
  const r = cli('validate-findings.cjs', [path.join(dir, 'findings.json')]);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stderr, /\u001b/);
  assert.match(r.stderr, /unexpected field/);
});

test('error output is capped', () => {
  const dir = tmpRun(({ findings }) => {
    for (let i = 0; i < 400; i++) findings.findings.push({ id: `QA-${String(100 + i)}`, unit: 'U-001', title: 't', verdict: 'confirmed', severity: null });
  });
  const r = cli('validate-findings.cjs', [path.join(dir, 'findings.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /… and \d+ more/);
});

test('generate-report CLI exits 1 on invalid records and 0 on the sample', () => {
  const bad = tmpRun(({ ledger }) => { ledger.units[0].status = 'bogus'; });
  assert.equal(cli('generate-report.cjs', [bad]).status, 1);
  const ok = tmpRun();
  const r = cli('generate-report.cjs', [ok]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Release verdict: Don't ship/);
});
