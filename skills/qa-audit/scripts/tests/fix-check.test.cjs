'use strict';
// Tests for the mechanical "fails for the right reason" check: check-fix-test.cjs
// against real throwaway git repos, and the validator rules that read its output.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { load, has, byId, fixedProof, tmpDir, tmpRun, cli, SAMPLE } = require('./helpers.cjs');
const { validateFindings, revertCheckErrors } = require('../validate-findings.cjs');

const SIG = 'total should be 30 kobo';
const BUGGY = 'exports.add = (a, b) => (a / 100 + b / 100) * 100;\n';
const FIXED = 'exports.add = (a, b) => a + b;\n';
// The regression test: an assertion with a message that names the bug.
const GOOD_TEST = `const { add } = require('./money.js');
if (add(10, 20) !== 30) { console.error('AssertionError: ${SIG}, got ' + add(10, 20)); process.exit(1); }
console.log('ok money.test.js');
`;
// A test that "fails" only because it looks for something the fix adds: the
// bad-selector pattern. It never asserts on the money bug.
const SELECTOR_TEST = `const fs = require('fs');
if (!fs.existsSync('./pay-button.js')) { console.error("locator.click: Timeout 30000ms exceeded. waiting for locator('#pay')"); process.exit(1); }
console.log('ok money.test.js');
`;

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// A repo whose first commit has the bug and whose second commit is the fix.
function repo({ test = GOOD_TEST, product = { 'money.js': FIXED }, includeTest = true } = {}) {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'money.js'), BUGGY);
  fs.writeFileSync(path.join(dir, 'README.md'), 'demo\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'buggy');
  for (const [f, body] of Object.entries(product)) fs.writeFileSync(path.join(dir, f), body);
  if (includeTest) fs.writeFileSync(path.join(dir, 'money.test.js'), test);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'fix(QA-001): integer kobo');
  if (!includeTest) {
    fs.writeFileSync(path.join(dir, 'money.test.js'), test);
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'test later');
  }
  return dir;
}

function run(dir, { commit, expect = SIG, extra = [], cmd = [process.execPath, 'money.test.js'] } = {}) {
  const sha = commit || git(dir, 'rev-parse', 'HEAD~0');
  const out = path.join(tmpDir(), 'revert-check.json');
  const r = cli('check-fix-test.cjs', ['--repo', dir, '--commit', sha, '--test-file', 'money.test.js', '--expect', expect, '--out', out, ...extra, '--', ...cmd]);
  const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return { r, result };
}

test('passes when the test fails with the expected assertion without the fix and passes with it', () => {
  const dir = repo();
  const { r, result } = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(result.result, 'pass');
  assert.deepEqual(result.reverted_files, ['money.js']);
  assert.ok(result.without_fix.matched_expect);
  assert.notEqual(result.without_fix.exit_code, 0);
  assert.equal(result.with_fix.exit_code, 0);
  assert.equal(git(dir, 'status', '--porcelain'), '', 'working tree is restored');
  assert.equal(fs.readFileSync(path.join(dir, 'money.js'), 'utf8'), FIXED);
});

test('fails a test that only dies on a selector the fix happened to add', () => {
  const dir = repo({ test: SELECTOR_TEST, product: { 'money.js': FIXED, 'pay-button.js': '// #pay\n' } });
  const { r, result } = run(dir);
  assert.equal(r.status, 1);
  assert.equal(result.result, 'fail');
  assert.ok(has(result.reasons, /not with the expected assertion/));
  assert.ok(has(result.warnings, /selector timeout or setup error/));
  assert.ok(fs.existsSync(path.join(dir, 'pay-button.js')), 'a file the fix added is put back');
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('fails when the test passes without the fix', () => {
  const dir = repo({ test: "console.log('ok money.test.js');\n" });
  const { result } = run(dir);
  assert.ok(has(result.reasons, /passes without the fix/));
});

test('fails when the test does not pass with the fix', () => {
  const dir = repo({ product: { 'money.js': 'exports.add = (a, b) => a + b + 1;\n' } });
  const { result } = run(dir);
  assert.ok(has(result.reasons, /does not pass with the fix/));
});

test('fails when the regression test was not committed with the fix', () => {
  const dir = repo({ includeTest: false });
  const { result } = run(dir, { commit: git(dir, 'rev-parse', 'HEAD~1') });
  assert.ok(has(result.reasons, /does not add or change the regression test/));
});

test('fails when the commit only touches tests', () => {
  const dir = repo({ product: {} });
  const { result } = run(dir);
  assert.ok(has(result.reasons, /no product change/));
});

test('restores a file the fix deleted', () => {
  const dir = repo({ product: { 'money.js': FIXED } });
  fs.unlinkSync(path.join(dir, 'README.md'));
  fs.writeFileSync(path.join(dir, 'money.test.js'), GOOD_TEST.replace('ok money', 'ok again money'));
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'fix 2');
  const { result } = run(dir, { expect: 'should be 30 kobo' });
  assert.ok(result.reverted_files.includes('README.md'));
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.ok(!fs.existsSync(path.join(dir, 'README.md')));
});

test('refuses a dirty tree, harness signatures and bad arguments', () => {
  const dir = repo();
  fs.appendFileSync(path.join(dir, 'money.js'), '// local edit\n');
  assert.equal(run(dir).r.status, 2);
  const clean = repo();
  for (const expect of ['Timeout 30000ms exceeded', "waiting for locator('#pay')", "Cannot find module './x'", 'short']) {
    assert.equal(run(clean, { expect }).r.status, 2, expect);
  }
  assert.equal(cli('check-fix-test.cjs', ['--repo', clean]).status, 2);
  assert.equal(cli('check-fix-test.cjs', ['--repo', clean, '--commit', 'abc1234', '--test-file', '../x', '--expect', SIG, '--', 'node']).status, 2);
  assert.equal(cli('check-fix-test.cjs', ['--repo', clean, '--commit', 'abc1234', '--test-file', 'money.test.js', '--expect', SIG]).status, 2);
});

test('its output validates and links up with a finding', () => {
  const dir = repo();
  const { result } = run(dir);
  const runDir = tmpDir();
  fs.mkdirSync(path.join(runDir, 'evidence'));
  fs.writeFileSync(path.join(runDir, 'evidence', 't1-revert-check.json'), JSON.stringify(result));
  const doc = { run: 1, build: 'abc1234', findings: [{ id: 'QA-001', fix: { ...fixedProof(1), commit: result.commit.slice(0, 7), test_file: 'money.test.js', failure_signature: SIG } }] };
  assert.deepEqual(revertCheckErrors(doc, runDir), []);
});

// Validator rules for the fix record.
const F = () => load('findings.json');

test('fixed requires fails_without_fix, a failure_signature and a revert_check', () => {
  for (const k of ['fails_without_fix', 'failure_signature', 'revert_check']) {
    const f = F(); delete byId(f, 'QA-001').fix[k];
    assert.ok(has(validateFindings(f), new RegExp(`fixed requires ${k}`)), k);
  }
  const g = F(); byId(g, 'QA-001').fix.fails_without_fix = false;
  assert.ok(has(validateFindings(g), /fails_without_fix: true/));
});

test('failure_signature must describe the bug, not the harness', () => {
  for (const sig of ['locator.click: Timeout 30000ms exceeded', "waiting for selector '#pay'", "Cannot find module 'x'", 'No tests found']) {
    const f = F(); byId(f, 'QA-001').fix.failure_signature = sig;
    assert.ok(has(validateFindings(f), /harness failure/), sig);
  }
});

test('revert_check must be a safe evidence path listed in fix evidence', () => {
  const f = F(); byId(f, 'QA-001').fix.revert_check = '../x.json';
  assert.ok(has(validateFindings(f), /revert_check must be a safe relative path/));
  const g = F(); const x = byId(g, 'QA-001').fix; x.evidence = x.evidence.filter((e) => e !== x.revert_check);
  assert.ok(has(validateFindings(g), /revert_check must also be listed/));
});

test('revert check files are read back and must match the fix', () => {
  assert.deepEqual(revertCheckErrors(F(), SAMPLE), []);
  const cases = [
    [(rc) => { rc.result = 'fail'; rc.reasons = ['nope']; }, /check result is fail/],
    [(rc) => { rc.commit = 'a'.repeat(40); }, /different commit/],
    [(rc) => { rc.test_file = 'other.spec.ts'; }, /different test file/],
    [(rc) => { rc.expect = 'something else entirely'; }, /does not match fix.failure_signature/],
    [(rc) => { rc.without_fix.matched_expect = false; }, /failing with the expected assertion/],
    [(rc) => { rc.without_fix.exit_code = 0; }, /failing with the expected assertion/],
    [(rc) => { rc.with_fix.exit_code = 1; }, /passing with the fix/],
    [(rc) => { rc.reverted_files = []; }, /removed no product code/],
    [(rc) => { rc.extra = 1; }, /extra|not allowed|additional/],
  ];
  for (const [mutate, re] of cases) {
    const dir = tmpRun();
    const p = path.join(dir, 'evidence', 'QA-001-revert-check.json');
    const rc = JSON.parse(fs.readFileSync(p, 'utf8')); mutate(rc); fs.writeFileSync(p, JSON.stringify(rc));
    assert.ok(has(revertCheckErrors(F(), dir), re), String(re));
  }
  const missing = tmpRun(); fs.unlinkSync(path.join(missing, 'evidence', 'QA-001-revert-check.json'));
  assert.ok(has(revertCheckErrors(F(), missing), /QA-001\.fix\.revert_check/));
});

test('validate-findings --run-dir and generate-report enforce the revert check', () => {
  const dir = tmpRun();
  const args = [path.join(dir, 'findings.json'), '--run-dir', dir];
  assert.equal(cli('validate-findings.cjs', args).status, 0);
  const p = path.join(dir, 'evidence', 'QA-009-revert-check.json');
  const rc = JSON.parse(fs.readFileSync(p, 'utf8')); rc.result = 'fail'; fs.writeFileSync(p, JSON.stringify(rc));
  assert.equal(cli('validate-findings.cjs', args).status, 1);
  const g = cli('generate-report.cjs', [dir]);
  assert.equal(g.status, 1);
  assert.match(g.stderr, /QA-009\.fix\.revert_check/);
});
