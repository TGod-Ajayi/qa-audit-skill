#!/usr/bin/env node
'use strict';
// Mechanical red/green check for a fix: proves the regression test fails for the
// right reason when ONLY the product-code part of the fix is removed, and passes
// with the fix in place.
//
//   1. The working tree must have no tracked changes, and the fix commit must be an
//      ancestor of HEAD that touched the regression test and at least one other file.
//   2. "Without fix": reverse-apply the commit's non-test changes onto HEAD (the test
//      file and any --keep files stay) and run the test command --repeat times. At
//      least one run must exit non-zero with output containing the --expect
//      signature (the assertion that describes the bug). A selector timeout, missing
//      module or "no tests found" does not contain the signature, so it never counts.
//   3. Restore the tree and run the test command --repeat times on HEAD. Every run
//      must exit 0: one green run proves little when the bug is intermittent.
//   4. Write a JSON result (schemas/revert-check.schema.json) that validate-findings
//      and generate-report read back. validate-findings decides whether --repeat was
//      high enough for the finding's reproduction rate.
//
// Usage:
//   node check-fix-test.cjs --repo <dir> --commit <sha> --test-file <path>
//        --expect <text> [--repeat <n>] [--keep <path>]... [--timeout <seconds>]
//        [--out <file.json>] -- <test command and args>
//
// Exit codes: 0 check passed, 1 check failed, 2 usage error or unusable repo state.
// Zero dependencies; needs git on PATH.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isSafeRelativePath } = require('./lib/common.cjs');

const TAIL = 4000;
const MAX_REPEAT = 1000;
// Failure signatures that describe the harness, not the bug. validate-findings
// rejects these as failure_signature, and this script refuses them as --expect.
const NON_BUG_SIGNATURE = /Timeout \d+ms exceeded|waiting for (locator|selector)|Cannot find module|ERR_MODULE_NOT_FOUND|No tests? (files )?found|SyntaxError: (Cannot use import|Unexpected token)/i;
// Output that suggests the run never reached the assertion. Reported as a warning.
const SETUP_SMELL = /Cannot find module|ERR_MODULE_NOT_FOUND|No tests? (files )?found|(locator|page)\.\w+: Timeout \d+ms exceeded/i;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { keep: [], timeout: 600, repeat: 3, cmd: null };
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
    else if (a === '--repeat') { o.repeat = Number(need()); if (!Number.isInteger(o.repeat) || o.repeat < 1 || o.repeat > MAX_REPEAT) throw new UsageError(`--repeat must be an integer from 1 to ${MAX_REPEAT}`); }
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
    tool: 'qa-audit/check-fix-test', version: 2, result: 'fail', commit, head, test_file: o.testFile, repeat: o.repeat,
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
    // Run every repeat: the matched count is the test's own measure of the bug's rate.
    const w = { runs: 0, matched_failures: 0, other_failures: 0, passes: 0, timed_out_runs: 0, output_tail: '' };
    let smell = false;
    for (let i = 0; i < o.repeat; i++) {
      const r = runTests(repo, o.cmd, o.timeout);
      w.runs++;
      if (SETUP_SMELL.test(r.output)) smell = true;
      const matched = !r.timed_out && r.exit_code !== 0 && r.output.includes(o.expect);
      if (r.timed_out) w.timed_out_runs++;
      else if (r.exit_code === 0) w.passes++;
      else if (matched) w.matched_failures++;
      else w.other_failures++;
      // Keep the first matching failure as evidence; until one exists, the latest run.
      if ((matched && w.matched_failures === 1) || !w.matched_failures) w.output_tail = tail(r.output);
    }
    result.without_fix = w;
    if (!w.matched_failures) {
      if (w.passes === w.runs) reasons.push(`the test passes in all ${w.runs} run(s) without the fix, so it does not catch the bug`);
      else reasons.push(`the test never fails with the expected assertion in ${w.runs} run(s) without the fix; it may be failing on a selector, timeout, setup or import error`);
    }
    if (w.other_failures || w.timed_out_runs) warnings.push(`${w.other_failures + w.timed_out_runs} of ${w.runs} without-fix run(s) failed without the expected assertion`);
    if (smell) warnings.push('the without-fix output contains a selector timeout or setup error; check the failure is the assertion');
  } finally {
    restore(repo, revert);
  }
  if (git(repo, ['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
    throw new UsageError('could not restore the working tree after the without-fix run; inspect it with git status');
  }

  // Every run must pass. Stop at the first failure: one is enough to reject.
  const wf = { runs: 0, passes: 0, failures: 0, timed_out_runs: 0, output_tail: '' };
  for (let i = 0; i < o.repeat; i++) {
    const r = runTests(repo, o.cmd, o.timeout);
    wf.runs++;
    wf.output_tail = tail(r.output);
    if (r.exit_code === 0) { wf.passes++; continue; }
    wf.failures++;
    if (r.timed_out) wf.timed_out_runs++;
    break;
  }
  result.with_fix = wf;
  if (wf.failures) reasons.push(`the test fails with the fix in place (run ${wf.runs} of ${o.repeat}); the fix does not hold every time`);
  if (!wf.output_tail.includes(path.basename(o.testFile)) && !result.without_fix.output_tail.includes(path.basename(o.testFile))) {
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
    console.error(`✗ ${e.message}\nUsage: check-fix-test.cjs --repo <dir> --commit <sha> --test-file <path> --expect <text> [--repeat <n>] [--keep <path>]... [--timeout <s>] [--out <file.json>] -- <test command>`);
    process.exit(2);
  }
  try {
    const result = check(o);
    if (o.out) writeOut(o.out, result);
    if (result.result === 'pass') {
      const w = result.without_fix;
      console.log(`✓ without the fix: failed with the expected assertion in ${w.matched_failures}/${w.runs} run(s); with the fix: passed ${result.with_fix.passes}/${result.with_fix.runs}`);
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
