#!/usr/bin/env node
'use strict';
// Mechanical red/green check for a fix: proves the regression test fails for the
// right reason when ONLY the product-code part of the fix is removed, and passes
// with the fix in place.
//
//   1. The working tree must have no tracked changes, and the fix commit must be an
//      ancestor of HEAD that touched the regression test and at least one other file.
//   2. "Without fix": reverse-apply the commit's non-test changes onto HEAD (the test
//      file and any --keep files stay), run the test command, and require a non-zero
//      exit whose output contains the --expect signature (the assertion that
//      describes the bug). A selector timeout, missing module or "no tests found"
//      does not contain the signature, so it fails the check.
//   3. Restore the tree, run the test command again on HEAD and require exit 0.
//   4. Write a JSON result (schemas/revert-check.schema.json) that validate-findings
//      and generate-report read back.
//
// Usage:
//   node check-fix-test.cjs --repo <dir> --commit <sha> --test-file <path>
//        --expect <text> [--keep <path>]... [--timeout <seconds>] [--out <file.json>]
//        -- <test command and args>
//
// Exit codes: 0 check passed, 1 check failed, 2 usage error or unusable repo state.
// Zero dependencies; needs git on PATH.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isSafeRelativePath } = require('./lib/common.cjs');

const TAIL = 4000;
// Failure signatures that describe the harness, not the bug. validate-findings
// rejects these as failure_signature, and this script refuses them as --expect.
const NON_BUG_SIGNATURE = /Timeout \d+ms exceeded|waiting for (locator|selector)|Cannot find module|ERR_MODULE_NOT_FOUND|No tests? (files )?found|SyntaxError: (Cannot use import|Unexpected token)/i;
// Output that suggests the run never reached the assertion. Reported as a warning.
const SETUP_SMELL = /Cannot find module|ERR_MODULE_NOT_FOUND|No tests? (files )?found|(locator|page)\.\w+: Timeout \d+ms exceeded/i;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { keep: [], timeout: 600, cmd: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.cmd = argv.slice(i + 1); break; }
    const v = argv[i + 1];
    const need = () => { if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`); i++; return v; };
    if (a === '--repo') o.repo = need();
    else if (a === '--commit') o.commit = need();
    else if (a === '--test-file') o.testFile = need();
    else if (a === '--expect') o.expect = need();
    else if (a === '--keep') o.keep.push(need());
    else if (a === '--out') o.out = need();
    else if (a === '--timeout') { o.timeout = Number(need()); if (!(o.timeout > 0)) throw new UsageError('--timeout must be a positive number of seconds'); }
    else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  for (const k of ['repo', 'commit', 'testFile', 'expect']) if (!o[k]) throw new UsageError(`missing --${k === 'testFile' ? 'test-file' : k}`);
  if (!o.cmd || !o.cmd.length) throw new UsageError('missing test command after --');
  if (!/^[0-9a-f]{7,64}$/.test(o.commit)) throw new UsageError('--commit must be a hex commit id');
  for (const p of [o.testFile, ...o.keep]) if (!isSafeRelativePath(p)) throw new UsageError(`unsafe repository path ${JSON.stringify(p)}`);
  if (o.expect.trim().length < 8) throw new UsageError('--expect must be at least 8 characters: the assertion text that describes the bug');
  if (NON_BUG_SIGNATURE.test(o.expect)) throw new UsageError('--expect describes a harness failure (timeout, missing module, no tests), not the bug');
  return o;
}

function git(repo, args, opts = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: opts.encoding || 'utf8', input: opts.input, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new UsageError(`cannot run git: ${r.error.message}`);
  if (r.status !== 0 && !opts.allowFail) throw new UsageError(`git ${args[0]} failed: ${String(r.stderr).trim().split('\n')[0]}`);
  return r;
}

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
const tail = (s) => (s.length > TAIL ? `…${s.slice(-TAIL)}` : s);

function runTests(repo, cmd, timeout) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: repo, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const output = stripAnsi(`${r.stdout || ''}${r.stderr || ''}${r.error ? `\n[check-fix-test] ${r.error.code || r.error.message}` : ''}`);
  return { exit_code: typeof r.status === 'number' ? r.status : -1, timed_out: !!(r.error && r.error.code === 'ETIMEDOUT'), output };
}

// Paths changed by the commit against its first parent, with git's status letter.
function changedPaths(repo, commit) {
  const out = git(repo, ['diff', '--name-status', '-z', '--no-renames', `${commit}^`, commit]).stdout.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < out.length; i += 2) files.push({ status: out[i][0], path: out[i + 1] });
  return files;
}

function check(o) {
  const repo = path.resolve(o.repo);
  // An empty prefix means repo is the top level. Asking git avoids comparing paths,
  // which differ in form on Windows (8.3 short names, slashes).
  if (git(repo, ['rev-parse', '--show-prefix']).stdout.trim() !== '') throw new UsageError('--repo must be the repository root');
  if (git(repo, ['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
    throw new UsageError('the working tree has uncommitted changes to tracked files; commit or stash them first');
  }
  const commit = git(repo, ['rev-parse', '--verify', '--quiet', `${o.commit}^{commit}`], { allowFail: true }).stdout.trim();
  if (!commit) throw new UsageError(`commit ${o.commit} not found`);
  const head = git(repo, ['rev-parse', 'HEAD']).stdout.trim();

  const reasons = [];
  const warnings = [];
  const result = {
    tool: 'qa-audit/check-fix-test', version: 1, result: 'fail', commit, head, test_file: o.testFile,
    expect: o.expect, command: o.cmd, kept_files: [o.testFile, ...o.keep], reverted_files: [],
    without_fix: null, with_fix: null, reasons, warnings, checked_at: new Date().toISOString(),
  };

  if (git(repo, ['merge-base', '--is-ancestor', commit, 'HEAD'], { allowFail: true }).status !== 0) {
    reasons.push('the fix commit is not an ancestor of HEAD, so HEAD does not contain the fix');
    return result;
  }
  if (git(repo, ['rev-parse', '--verify', '--quiet', `${commit}^2`], { allowFail: true }).status === 0) {
    warnings.push('the fix commit is a merge; compared against its first parent');
  }
  if (git(repo, ['rev-parse', '--verify', '--quiet', `${commit}^`], { allowFail: true }).status !== 0) {
    reasons.push('the fix commit has no parent to compare against');
    return result;
  }

  const changed = changedPaths(repo, commit);
  const kept = new Set(result.kept_files);
  if (!changed.some((f) => f.path === o.testFile)) reasons.push('the fix commit does not add or change the regression test; commit the test with the fix');
  const revert = changed.filter((f) => !kept.has(f.path));
  result.reverted_files = revert.map((f) => f.path);
  if (!revert.length) reasons.push('the fix commit changes only test files, so there is no product change to remove');
  if (reasons.length) return result;

  // Without the fix: reverse-apply only the product-code part of the commit onto HEAD.
  const patch = git(repo, ['diff', '--binary', '--no-renames', `${commit}^`, commit, '--', ...result.reverted_files], { encoding: 'buffer' }).stdout;
  const apply = git(repo, ['apply', '-R', '--whitespace=nowarn', '-'], { input: patch, allowFail: true });
  try {
    if (apply.status !== 0) {
      reasons.push('the product change does not reverse-apply cleanly on HEAD; run the check with the fix commit checked out');
      return result;
    }
    const before = runTests(repo, o.cmd, o.timeout);
    const matched = before.output.includes(o.expect);
    result.without_fix = { exit_code: before.exit_code, timed_out: before.timed_out, matched_expect: matched, output_tail: tail(before.output) };
    if (before.exit_code === 0) reasons.push('the test passes without the fix, so it does not catch the bug');
    else if (before.timed_out) reasons.push('the test run timed out without the fix; a hang is not a failure for the right reason');
    else if (!matched) reasons.push('the test fails without the fix, but not with the expected assertion; it may be failing on a selector, setup or import error');
    if (SETUP_SMELL.test(before.output)) warnings.push('the without-fix output contains a selector timeout or setup error; check the failure is the assertion');
  } finally {
    restore(repo, revert);
  }
  if (git(repo, ['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
    throw new UsageError('could not restore the working tree after the without-fix run; inspect it with git status');
  }

  const after = runTests(repo, o.cmd, o.timeout);
  result.with_fix = { exit_code: after.exit_code, timed_out: after.timed_out, output_tail: tail(after.output) };
  if (after.exit_code !== 0) reasons.push('the test does not pass with the fix in place');
  if (!after.output.includes(path.basename(o.testFile)) && !result.without_fix.output_tail.includes(path.basename(o.testFile))) {
    warnings.push(`the test output never mentions ${path.basename(o.testFile)}; check the command runs that test`);
  }
  if (!reasons.length) result.result = 'pass';
  return result;
}

// Put every reverted path back to its HEAD state. Files the fix deleted were
// re-created by the reverse apply, so remove them if HEAD does not have them.
function restore(repo, revert) {
  const atHead = revert.filter((f) => git(repo, ['cat-file', '-e', `HEAD:${f.path}`], { allowFail: true }).status === 0).map((f) => f.path);
  if (atHead.length) git(repo, ['checkout', 'HEAD', '--', ...atHead], { allowFail: true });
  for (const f of revert) {
    if (atHead.includes(f.path)) continue;
    const abs = path.join(repo, f.path);
    try { const st = fs.lstatSync(abs); if (st.isFile() || st.isSymbolicLink()) fs.unlinkSync(abs); } catch { /* already gone */ }
  }
}

function writeOut(file, result) {
  let st = null;
  try { st = fs.lstatSync(file); } catch { /* new file */ }
  if (st && !st.isFile()) throw new UsageError('--out: refusing to overwrite a non-regular file');
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { check, parseArgs, NON_BUG_SIGNATURE };

if (require.main === module) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`✗ ${e.message}\nUsage: check-fix-test.cjs --repo <dir> --commit <sha> --test-file <path> --expect <text> [--keep <path>]... [--timeout <s>] [--out <file.json>] -- <test command>`);
    process.exit(2);
  }
  try {
    const result = check(o);
    if (o.out) writeOut(o.out, result);
    if (result.result === 'pass') {
      console.log(`✓ fails without the fix (exit ${result.without_fix.exit_code}, matched expected assertion) and passes with it`);
    } else {
      console.error(`✗ fix test check failed:\n- ${result.reasons.join('\n- ')}`);
    }
    for (const w of result.warnings) console.error(`! ${w}`);
    process.exit(result.result === 'pass' ? 0 : 1);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`✗ ${e.message}`);
    process.exit(2);
  }
}
