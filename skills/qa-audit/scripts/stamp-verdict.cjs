#!/usr/bin/env node
'use strict';
// Ties a release verdict to the exact code it describes, and detects when that code
// has changed since, so "Ship" can never quietly refer to a build nobody verified.
//
// stamp <run-dir> --repo <dir> [--accept <sha>]...
//   Validates the records, then requires: a finished run; a repo with no
//   uncommitted or untracked changes; HEAD descending from the audited build and
//   containing every fixed finding's commit; each verifier repro re-run made on a
//   commit that contains its fix and is in HEAD; and every commit between the audited
//   build and HEAD being a recorded fix commit, or named with --accept (recorded
//   with its subject and shown in the report). Writes <run-dir>/verdict.json with the
//   verdict, HEAD, its tree hash and sha256 of each record.
//
// check <run-dir> --repo <dir>
//   Fails if the records changed since stamping, the repo has uncommitted or
//   untracked changes, or HEAD's tree differs from the stamped tree. A new HEAD
//   with an identical tree (a rebase or merge with no content change) still passes.
//   Run it in CI or a pre-merge hook.
//
// Exit codes: 0 stamped / still valid, 1 refused / stale, 2 usage error or unreadable input.
// Zero dependencies; needs git on PATH.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { computeVerdict, loadRecords } = require('./generate-report.cjs');
const { STAMP_FILE, recordHashes, readStamp, recordDriftReasons } = require('./lib/stamp.cjs');

class UsageError extends Error {}

function parseArgs(argv) {
  const [mode, runDir, ...rest] = argv;
  if (mode !== 'stamp' && mode !== 'check') throw new UsageError('first argument must be stamp or check');
  if (!runDir || runDir.startsWith('--')) throw new UsageError('missing <run-dir>');
  const o = { mode, runDir, accept: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`);
    i++;
    if (a === '--repo') o.repo = v;
    else if (a === '--accept' && mode === 'stamp') {
      if (!/^[0-9a-f]{7,64}$/.test(v)) throw new UsageError('--accept must be a hex commit id');
      o.accept.push(v);
    } else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!o.repo) throw new UsageError('missing --repo');
  return o;
}

function git(repo, args, allowFail = false) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new UsageError(`cannot run git: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) throw new UsageError(`git ${args[0]} failed: ${String(r.stderr).trim().split('\n')[0]}`);
  return r;
}

const resolve = (repo, rev) => {
  const r = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], true);
  return r.status === 0 ? r.stdout.trim() : null;
};
const isAncestor = (repo, a, b) => git(repo, ['merge-base', '--is-ancestor', a, b], true).status === 0;

// Uncommitted or untracked (non-ignored) changes, as git prints them.
function worktreeChanges(repo) {
  return git(repo, ['status', '--porcelain', '--untracked-files=normal']).stdout.split('\n').filter(Boolean);
}

function repoState(repo) {
  if (git(repo, ['rev-parse', '--show-prefix']).stdout.trim() !== '') throw new UsageError('--repo must be the repository root');
  const head = resolve(repo, 'HEAD');
  if (!head) throw new UsageError('the repository has no commits');
  const tree = git(repo, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
  const b = git(repo, ['symbolic-ref', '--short', '-q', 'HEAD'], true);
  return { head, tree, branch: b.status === 0 ? b.stdout.trim() : null, changes: worktreeChanges(repo) };
}

function stamp(o) {
  const runDir = o.runDir;
  const repo = path.resolve(o.repo);
  const { run, ledger, findingsDoc } = loadRecords(runDir);
  const reasons = [];
  if (run.run_status === 'in_progress') reasons.push('the run is still in progress; finish it before stamping a verdict');
  if (run.dirty) reasons.push('the audited build had uncommitted changes; re-run the audit on a committed build');

  const st = repoState(repo);
  if (st.changes.length) reasons.push(`the repository has ${st.changes.length} uncommitted or untracked change(s); commit or remove them first`);

  const audited = resolve(repo, run.build);
  if (!audited) reasons.push(`the audited build ${run.build} is not in this repository`);
  else if (!isAncestor(repo, audited, st.head)) reasons.push(`HEAD does not descend from the audited build ${run.build}`);

  const fixCommits = [];
  for (const f of findingsDoc.findings) {
    if (!f.fix || f.fix.verdict !== 'fixed') continue;
    const sha = resolve(repo, f.fix.commit);
    if (!sha) reasons.push(`${f.id}: fix commit ${f.fix.commit} is not in this repository`);
    else if (!isAncestor(repo, sha, st.head)) reasons.push(`${f.id}: fix commit ${f.fix.commit} is not in HEAD`);
    else {
      if (!fixCommits.includes(sha)) fixCommits.push(sha);
      // The verifier's repro re-run must have run on code that contains this fix
      // and that is part of what is being stamped.
      for (const [i, r] of (f.fix.repro_after || []).entries()) {
        const at = resolve(repo, r.commit);
        const where = `${f.id}: repro_after[${i}] commit ${r.commit}`;
        if (!at) reasons.push(`${where} is not in this repository`);
        else if (!isAncestor(repo, sha, at)) reasons.push(`${where} does not contain the fix, so it did not test the fixed build`);
        else if (!isAncestor(repo, at, st.head)) reasons.push(`${where} is not in HEAD`);
      }
    }
  }

  const accepted = [];
  const acceptShas = new Set();
  for (const a of o.accept) {
    const sha = resolve(repo, a);
    if (!sha) reasons.push(`--accept ${a} is not a commit in this repository`);
    else acceptShas.add(sha);
  }
  if (audited && !reasons.length) {
    const between = git(repo, ['rev-list', '--reverse', `${audited}..${st.head}`]).stdout.split('\n').filter(Boolean);
    for (const sha of between) {
      if (fixCommits.includes(sha)) continue;
      const subject = git(repo, ['log', '-1', '--format=%s', sha]).stdout.trim();
      if (acceptShas.has(sha)) accepted.push({ sha, subject });
      else reasons.push(`commit ${sha.slice(0, 12)} "${subject}" is not a recorded fix; verify it and pass --accept ${sha.slice(0, 12)}, or remove it`);
    }
    for (const sha of acceptShas) {
      if (!between.includes(sha)) reasons.push(`--accept ${sha.slice(0, 12)} is not between the audited build and HEAD`);
    }
  }
  if (reasons.length) return { ok: false, reasons };

  const verdict = computeVerdict(findingsDoc, ledger, run);
  const doc = {
    tool: 'qa-audit/stamp-verdict', version: 1, run: run.run, verdict: verdict.verdict, reasons: verdict.reasons,
    audited_build: audited, verified_head: st.head, verified_tree: st.tree, branch: st.branch,
    fix_commits: fixCommits, accepted_commits: accepted, records: recordHashes(runDir),
    stamped_at: new Date().toISOString(),
  };
  const out = path.join(runDir, STAMP_FILE);
  let existing = null;
  try { existing = fs.lstatSync(out); } catch { /* new file */ }
  if (existing && !existing.isFile()) throw new UsageError(`${STAMP_FILE}: refusing to overwrite a non-regular file`);
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  return { ok: true, stamp: doc, reasons: [] };
}

function check(o) {
  const runDir = o.runDir;
  const info = readStamp(runDir);
  if (info.state === 'none') return { ok: false, reasons: [`no ${STAMP_FILE}: the verdict was never stamped`], notes: [] };
  const s = info.stamp;
  const { run, ledger, findingsDoc } = loadRecords(runDir);
  const reasons = recordDriftReasons(s, runDir, computeVerdict(findingsDoc, ledger, run).verdict);
  const notes = [];
  const repo = path.resolve(o.repo);
  const st = repoState(repo);
  if (st.changes.length) reasons.push(`the repository has ${st.changes.length} uncommitted or untracked change(s) since the stamp`);
  if (st.tree !== s.verified_tree) {
    // Only for the message: a shallow CI clone may not have the verified head.
    let moved = 'the verified head is not in this clone';
    if (resolve(repo, s.verified_head)) {
      moved = isAncestor(repo, s.verified_head, st.head)
        ? `${git(repo, ['rev-list', '--count', `${s.verified_head}..${st.head}`]).stdout.trim()} commit(s) after the verified head`
        : 'HEAD is not a descendant of the verified head';
    }
    reasons.push(`the code changed since the verdict was stamped (tree ${st.tree.slice(0, 12)}, stamped ${s.verified_tree.slice(0, 12)}; ${moved})`);
  } else if (st.head !== s.verified_head) {
    notes.push(`HEAD moved to ${st.head.slice(0, 12)}, but the tree is identical to the verified one`);
  }
  return { ok: !reasons.length, stamp: s, reasons, notes };
}

module.exports = { stamp, check, parseArgs };

if (require.main === module) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`✗ ${e.message}\nUsage: stamp-verdict.cjs stamp <run-dir> --repo <dir> [--accept <sha>]...\n       stamp-verdict.cjs check <run-dir> --repo <dir>`);
    process.exit(2);
  }
  try {
    if (o.mode === 'stamp') {
      const r = stamp(o);
      if (!r.ok) { console.error(`✗ refused to stamp the verdict:\n- ${r.reasons.join('\n- ')}`); process.exit(1); }
      console.log(`✓ stamped "${r.stamp.verdict}" for ${r.stamp.verified_head.slice(0, 12)} (tree ${r.stamp.verified_tree.slice(0, 12)})` +
        `${r.stamp.accepted_commits.length ? `, accepting ${r.stamp.accepted_commits.length} non-fix commit(s)` : ''}`);
    } else {
      const r = check(o);
      for (const n of r.notes) console.log(`! ${n}`);
      if (!r.ok) { console.error(`✗ the stamped verdict no longer applies:\n- ${r.reasons.join('\n- ')}`); process.exit(1); }
      console.log(`✓ "${r.stamp.verdict}" still applies: tree ${r.stamp.verified_tree.slice(0, 12)}, records unchanged`);
    }
  } catch (e) {
    if (e instanceof UsageError || e.code === 'READ' || e.code === 'INPUT') { console.error(`✗ ${e.message}`); process.exit(2); }
    if (e.code === 'INVALID') { console.error(e.message); process.exit(1); }
    throw e;
  }
}
