'use strict';
// Tests for stamp-verdict.cjs: a verdict is tied to a commit, tree and record bytes,
// and any later edit invalidates it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { load, has, byId, fixedProof, tmpDir, tmpRun, cli, SAMPLE } = require('./helpers.cjs');
const { computeVerdict, generate } = require('../generate-report.cjs');
const { validateSchema, loadSchema } = require('../lib/common.cjs');

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function commit(dir, file, body, msg) {
  fs.writeFileSync(path.join(dir, file), body);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

// A repo with the audited build and two fix commits on the audit branch, and a run
// directory whose records point at them.
function setup(mutate) {
  const repo = tmpDir();
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'core.autocrlf', 'false');
  const build = commit(repo, 'app.js', 'v1\n', 'app');
  git(repo, 'checkout', '-q', '-b', 'qa-audit/run-1');
  const fix1 = commit(repo, 'checkout.js', 'idempotent\n', 'fix(QA-001): one order per click');
  const fix9 = commit(repo, 'http.js', 'server-side\n', 'fix(QA-009): keep the secret server-side');
  const run = tmpRun((d) => {
    for (const doc of [d.run, d.ledger, d.findings]) doc.build = build.slice(0, 7);
    byId(d.findings, 'QA-001').fix.commit = fix1.slice(0, 7);
    byId(d.findings, 'QA-009').fix.commit = fix9.slice(0, 7);
    if (mutate) mutate(d);
  });
  for (const [id, sha] of [['QA-001', fix1], ['QA-009', fix9]]) {
    const p = path.join(run, 'evidence', `${id}-revert-check.json`);
    const rc = JSON.parse(fs.readFileSync(p, 'utf8')); rc.commit = sha; fs.writeFileSync(p, JSON.stringify(rc));
  }
  return { repo, run, build, fix1, fix9 };
}

const stamp = (s, ...extra) => cli('stamp-verdict.cjs', ['stamp', s.run, '--repo', s.repo, ...extra]);
const check = (s) => cli('stamp-verdict.cjs', ['check', s.run, '--repo', s.repo]);
const readStampFile = (s) => JSON.parse(fs.readFileSync(path.join(s.run, 'verdict.json'), 'utf8'));

test('stamps the verdict with HEAD, its tree, the fix commits and record hashes', () => {
  const s = setup();
  const r = stamp(s);
  assert.equal(r.status, 0, r.stderr);
  const st = readStampFile(s);
  assert.deepEqual(validateSchema(st, loadSchema('verdict.schema.json')), []);
  assert.equal(st.verdict, "Don't ship");
  assert.equal(st.verified_head, git(s.repo, 'rev-parse', 'HEAD'));
  assert.equal(st.verified_tree, git(s.repo, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(st.audited_build, s.build);
  assert.equal(st.branch, 'qa-audit/run-1');
  assert.deepEqual(st.fix_commits, [s.fix1, s.fix9]);
  assert.equal(check(s).status, 0);
  generate(s.run);
  assert.match(fs.readFileSync(path.join(s.run, 'REPORT.md'), 'utf8'), /\*\*Verified build:\*\* `[0-9a-f]{12}` \(tree `[0-9a-f]{12}`\) on `qa-audit\/run-1`/);
});

test('any later code edit invalidates the stamp', () => {
  const s = setup();
  assert.equal(stamp(s).status, 0);
  commit(s.repo, 'checkout.js', 'changed after the audit\n', 'tweak');
  const r = check(s);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the code changed since the verdict was stamped .*1 commit\(s\) after the verified head/);
});

test('a new HEAD with an identical tree still passes, with a note', () => {
  const s = setup();
  assert.equal(stamp(s).status, 0);
  git(s.repo, 'commit', '-q', '--allow-empty', '-m', 'empty');
  const r = check(s);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /tree is identical/);
});

test('uncommitted or untracked changes invalidate the stamp', () => {
  const s = setup();
  assert.equal(stamp(s).status, 0);
  fs.writeFileSync(path.join(s.repo, 'new.js'), 'x\n');
  assert.match(check(s).stderr, /1 uncommitted or untracked change/);
  fs.unlinkSync(path.join(s.repo, 'new.js'));
  fs.appendFileSync(path.join(s.repo, 'app.js'), 'edit\n');
  assert.equal(check(s).status, 1);
});

test('editing a record after stamping makes the stamp stale, in the check and the report', () => {
  const s = setup();
  assert.equal(stamp(s).status, 0);
  const p = path.join(s.run, 'findings.json');
  fs.writeFileSync(p, `${fs.readFileSync(p, 'utf8')} `);
  assert.match(check(s).stderr, /findings\.json changed since the verdict was stamped/);
  generate(s.run);
  const report = fs.readFileSync(path.join(s.run, 'REPORT.md'), 'utf8');
  assert.match(report, /\*\*Stale stamp:\*\* findings\.json changed/);
  assert.doesNotMatch(report, /Verified build/);
});

test('an unstamped report says so, and check fails without a stamp', () => {
  const s = setup();
  generate(s.run);
  assert.match(fs.readFileSync(path.join(s.run, 'REPORT.md'), 'utf8'), /\*\*Unstamped:\*\*/);
  const r = check(s);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /never stamped/);
});

test('refuses a commit that is not a recorded fix unless it is accepted by name', () => {
  const s = setup();
  const extra = commit(s.repo, 'readme.md', 'docs\n', 'docs: notes');
  const r = stamp(s);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /"docs: notes" is not a recorded fix/);
  assert.equal(stamp(s, '--accept', extra.slice(0, 12)).status, 0);
  assert.deepEqual(readStampFile(s).accepted_commits, [{ sha: extra, subject: 'docs: notes' }]);
  generate(s.run);
  assert.match(fs.readFileSync(path.join(s.run, 'REPORT.md'), 'utf8'), /with 1 accepted non-fix commit/);
  assert.match(stamp(s, '--accept', s.build.slice(0, 12)).stderr, /is not between the audited build and HEAD/);
});

test('refuses to stamp a dirty repo, an unfinished or dirty run, or a HEAD missing the audit', () => {
  const dirty = setup();
  fs.writeFileSync(path.join(dirty.repo, 'stray.txt'), 'x\n');
  assert.match(stamp(dirty).stderr, /uncommitted or untracked/);

  const unfinished = setup((d) => { d.run.run_status = 'in_progress'; d.run.finished_at = null; });
  assert.match(stamp(unfinished).stderr, /still in progress/);

  const dirtyRun = setup((d) => { d.run.dirty = true; });
  assert.match(stamp(dirtyRun).stderr, /audited build had uncommitted changes/);

  const s = setup();
  git(s.repo, 'checkout', '-q', 'main');
  const r = stamp(s);
  assert.match(r.stderr, /QA-001: fix commit [0-9a-f]{7} is not in HEAD/);

  const other = setup();
  git(other.repo, 'checkout', '-q', '--orphan', 'elsewhere');
  commit(other.repo, 'app.js', 'rewritten\n', 'unrelated root');
  assert.match(stamp(other).stderr, /HEAD does not descend from the audited build/);
  assert.equal(fs.existsSync(path.join(other.run, 'verdict.json')), false);
});

test('usage errors exit 2', () => {
  const s = setup();
  for (const args of [[], ['ship', s.run, '--repo', s.repo], ['stamp', s.run], ['check', s.run, '--repo', s.repo, '--accept', 'abc1234'], ['stamp', s.run, '--repo', s.repo, '--accept', 'nothex!']]) {
    assert.equal(cli('stamp-verdict.cjs', args).status, 2, args.join(' '));
  }
});

test('a dirty audited build can never get Ship', () => {
  const d = { f: load('findings.json'), l: load('coverage-ledger.json'), r: load('run.json') };
  let n = 10;
  for (const x of d.f.findings) if ((x.verdict === 'confirmed' || x.verdict === 'flaky') && !(x.fix && x.fix.verdict === 'fixed')) x.fix = fixedProof(n++);
  d.f.findings = d.f.findings.filter((x) => !x.security_referral);
  assert.equal(computeVerdict(d.f, d.l, d.r).verdict, 'Ship');
  d.r.dirty = true;
  const v = computeVerdict(d.f, d.l, d.r);
  assert.equal(v.verdict, 'Ship with known issues');
  assert.ok(has(v.reasons, /uncommitted changes/));
});

test('the sample run carries a valid, current stamp', () => {
  const st = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'verdict.json'), 'utf8'));
  assert.deepEqual(validateSchema(st, loadSchema('verdict.schema.json')), []);
  const { recordDriftReasons } = require('../lib/stamp.cjs');
  assert.deepEqual(recordDriftReasons(st, SAMPLE, computeVerdict(load('findings.json'), load('coverage-ledger.json'), load('run.json')).verdict), []);
});
