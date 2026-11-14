#!/usr/bin/env node
'use strict';
// Validates findings.json against schemas/findings.schema.json, then applies the
// per-verdict evidence rules, separation of duties and fix-proof rules.
// With --ledger it cross-checks units, build and check classes; with --run it
// cross-checks run metadata (for example, no fixes in report-only mode); with
// --run-dir it reads back each fixed finding's revert check (the output of
// check-fix-test.cjs) and confirms it proves the test fails without the fix.
// Zero dependencies.
//
// Usage: node validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>] [--run <run.json>] [--run-dir <dir>]
// Exit codes: 0 valid, 1 invalid records, 2 unreadable input or usage error.

const {
  isStr, isObject, nonEmptyArr, hasOwn, safeQuote, isSafeRelativePath, validateSchema, loadSchema,
  readJsonFile, formatErrors,
} = require('./lib/common.cjs');
const path = require('path');
const { isEvidencePath } = require('./validate-coverage-ledger.cjs');
const { NON_BUG_SIGNATURE } = require('./check-fix-test.cjs');

const RATE = /^(\d+)\/(\d+)$/;
const PROVEN_REQUIRED = ['check_class', 'impact', 'likelihood', 'expected', 'expected_source', 'observed', 'repro_rate', 'found_by', 'reproduced_by'];
const FORBIDDEN = {
  confirmed: ['blocking_fact', 'rejection_reason'],
  flaky: ['blocking_fact', 'rejection_reason'],
  needs_validation: ['fix', 'rejection_reason', 'repro_rate'],
  rejected: ['fix', 'blocking_fact'],
};
const UNTESTED_STATUSES = new Set(['pending', 'out_of_scope']);

const present = (f, k) => hasOwn(f, k) && f[k] !== null;

function verdictErrors(f, w, err) {
  for (const k of FORBIDDEN[f.verdict]) if (present(f, k)) err(w, `${f.verdict} finding must not contain ${safeQuote(k)}`);

  if (f.verdict === 'confirmed' || f.verdict === 'flaky') {
    if (f.severity === null) err(w, `${f.verdict} finding needs severity S1-S4`);
    for (const k of PROVEN_REQUIRED) if (!present(f, k)) err(w, `${f.verdict} finding needs ${k}`);
    if (!nonEmptyArr(f.minimal_repro)) err(w, `${f.verdict} finding needs minimal_repro steps`);
    if (!nonEmptyArr(f.evidence)) err(w, `${f.verdict} finding needs evidence`);
    if (f.security_referral === true) err(w, 'a security_referral is unprobed and must stay needs_validation');
    if (isStr(f.found_by) && f.found_by === f.reproduced_by) {
      err(w, 'reproduced_by must be a different agent from found_by (separation of duties)');
    }
    const m = RATE.exec(f.repro_rate || '');
    if (m) {
      const [hit, total] = [Number(m[1]), Number(m[2])];
      if (total === 0 || hit > total) err(w, 'repro_rate is impossible');
      else if (f.verdict === 'confirmed' && (hit !== total || total < 3)) err(w, 'confirmed needs at least 3/3 reproductions; use flaky otherwise');
      else if (f.verdict === 'flaky' && (hit === 0 || hit === total)) err(w, 'flaky needs an intermittent rate such as 2/10');
      else if (f.verdict === 'flaky' && total < 5) err(w, 'flaky needs at least 5 attempts to estimate a rate');
    }
  } else {
    if (f.severity !== null) err(w, `severity must be null for ${f.verdict}`);
  }
  if (f.verdict === 'needs_validation' && !isStr(f.blocking_fact)) err(w, 'needs_validation needs blocking_fact');
  if (f.verdict === 'rejected' && !isStr(f.rejection_reason)) err(w, 'rejected needs rejection_reason');
}

function fixErrors(f, w, err) {
  const x = f.fix;
  if (!x) return;
  const fw = `${w}.fix`;
  if (x.verdict === 'fixed') {
    for (const k of ['test_failed_before', 'test_passes_after', 'suite_no_worse_than_baseline', 'verified_by_independent_agent']) {
      if (x[k] !== true) err(fw, `fixed requires ${k}: true`);
    }
    for (const k of ['commit', 'test_file', 'fixer', 'verifier']) if (!isStr(x[k])) err(fw, `fixed requires ${k}`);
    if (!nonEmptyArr(x.evidence)) err(fw, 'fixed requires evidence (test output before and after)');
    if (x.fails_without_fix !== true) err(fw, 'fixed requires fails_without_fix: true (run check-fix-test.cjs)');
    if (!isStr(x.failure_signature)) err(fw, 'fixed requires failure_signature: the assertion text the test fails with when the fix is removed');
    else if (NON_BUG_SIGNATURE.test(x.failure_signature)) err(fw, 'failure_signature describes a harness failure (timeout, selector, missing module, no tests), not the bug');
    if (!isStr(x.revert_check)) err(fw, 'fixed requires revert_check: the check-fix-test.cjs result under evidence/');
    else if (!(x.evidence || []).includes(x.revert_check)) err(fw, 'revert_check must also be listed in fix evidence');
  }
  if (x.verdict === 'fixed') reproAfterErrors(f, fw, err);
  if (isStr(x.revert_check) && !isEvidencePath(x.revert_check)) err(fw, 'revert_check must be a safe relative path under evidence/');
  if (isStr(x.fixer) && x.fixer === x.verifier) err(fw, 'verifier must be a different agent from fixer');
  if (isStr(x.fixer) && x.fixer === f.reproduced_by) err(fw, 'fixer must not be the agent that reproduced the finding');
  if (isStr(x.test_file) && !isSafeRelativePath(x.test_file)) err(fw, 'test_file must be a safe repository-relative path');
  if (['not_fixed', 'regressed', 'needs_human'].includes(x.verdict) && !isStr(x.notes)) {
    err(fw, `${x.verdict} requires notes on what was tried`);
  }
  (x.evidence || []).forEach((e, k) => { if (!isEvidencePath(e)) err(`${fw}.evidence[${k}]`, 'must be a safe relative path under evidence/'); });
}

// The verifier's re-run of the ORIGINAL minimal repro on the fixed build. Browser
// findings need the original browser (and viewport) plus one other browser; static
// findings re-run their command. The original-environment run repeats as often as
// the fix check, so a flaky bug can't pass on one lucky attempt.
function reproAfterErrors(f, fw, err) {
  const x = f.fix;
  const ra = x.repro_after;
  const w = `${fw}.repro_after`;
  if (!nonEmptyArr(ra)) { err(fw, 'fixed requires repro_after: the verifier re-running the original repro on the fixed build'); return; }
  const need = requiredRepeat(f);
  ra.forEach((r, i) => {
    const rw = `${w}[${i}]`;
    if (isStr(x.verifier) && r.by !== x.verifier) err(rw, `must be run by the verifier (${x.verifier}), not ${safeQuote(r.by)}`);
    if (r.result !== 'pass') err(rw, `result is ${r.result}; a fix that fails its original repro is not fixed`);
    if (!isEvidencePath(r.evidence)) err(rw, 'evidence must be a safe relative path under evidence/');
    else if (!(x.evidence || []).includes(r.evidence)) err(rw, 'evidence must also be listed in fix evidence');
    if (r.kind === 'browser' && !isStr(r.browser)) err(rw, 'a browser re-run needs browser');
    if (r.kind === 'browser' && hasOwn(r, 'command')) err(rw, 'a browser re-run has no command');
    if (r.kind === 'command' && !isStr(r.command)) err(rw, 'a command re-run needs command');
    if (r.kind === 'command' && (hasOwn(r, 'browser') || hasOwn(r, 'viewport'))) err(rw, 'a command re-run has no browser or viewport');
  });
  const env = f.environment || {};
  if (isStr(env.browser)) {
    const runs = ra.filter((r) => r.kind === 'browser');
    const original = runs.filter((r) => r.browser === env.browser && (!env.viewport || r.viewport === env.viewport));
    if (!original.length) err(w, `must include a re-run in the original environment (${env.browser}${env.viewport ? ` ${env.viewport}` : ''})`);
    else if (!original.some((r) => r.attempts >= need)) err(w, `the original-environment re-run needs at least ${need} attempts for a ${f.verdict} finding`);
    if (new Set(runs.map((r) => r.browser)).size < 2) err(w, 'must include a re-run on at least one other browser');
  } else if (!ra.some((r) => r.attempts >= need)) {
    err(w, `needs a re-run with at least ${need} attempts for a ${f.verdict} finding`);
  }
}

function semanticErrors(doc, ledger, run) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const units = ledger ? new Map(ledger.units.map((u) => [u.id, u])) : null;
  const ids = new Set();
  let lastId = '';

  if (ledger && ledger.run !== doc.run) err('$.run', `findings run ${doc.run} does not match ledger run ${ledger.run}`);
  if (ledger && ledger.build !== doc.build) err('$.build', 'findings build does not match ledger build');
  if (run && run.run !== doc.run) err('$.run', `findings run ${doc.run} does not match run.json run ${run.run}`);
  if (run && run.build !== doc.build) err('$.build', 'findings build does not match run.json build');

  doc.findings.forEach((f, i) => {
    const w = isStr(f.id) ? f.id : `findings[${i}]`;
    if (ids.has(f.id)) err(w, 'duplicate id');
    ids.add(f.id);
    if (f.id < lastId) err(w, 'findings must be sorted by id');
    if (f.id > lastId) lastId = f.id;

    verdictErrors(f, w, err);
    fixErrors(f, w, err);
    if (f.fix && run && (run.mode === 'report-only' || run.fixing_allowed === false)) {
      err(w, 'fix records are not allowed when the run does not allow fixing');
    }
    (f.evidence || []).forEach((e, k) => { if (!isEvidencePath(e)) err(`${w}.evidence[${k}]`, 'must be a safe relative path under evidence/'); });
    if (present(f, 'first_seen_run') && f.first_seen_run > doc.run) err(w, 'first_seen_run cannot be later than the current run');

    if (units && f.unit !== 'WILDCARD') {
      const u = units.get(f.unit);
      if (!u) err(w, `unit ${f.unit} not in ledger`);
      else {
        if (UNTESTED_STATUSES.has(u.status) && f.verdict !== 'rejected') err(w, `unit ${f.unit} is ${u.status}; a finding implies it was tested`);
        if (present(f, 'check_class') && !u.check_classes.includes(f.check_class)) {
          err(w, `check_class ${safeQuote(f.check_class)} is not assigned to unit ${f.unit}`);
        }
      }
    }
  });

  (doc.suggestions || []).forEach((s, i) => {
    if (units && s.unit && s.unit !== 'WILDCARD' && !units.has(s.unit)) err(`$.suggestions[${i}]`, `unit ${s.unit} not in ledger`);
  });
  return errors;
}

function validateFindings(doc, ledger, run) {
  if (!isObject(doc)) return ['$: findings must be a JSON object'];
  const errors = validateSchema(doc, loadSchema('findings.schema.json'));
  if (errors.length) return errors;
  return semanticErrors(doc, ledger || null, run || null);
}

// How many times the fixed test must pass in a row before the fix counts. A
// confirmed bug reproduced every time, so 3 clean runs are enough. A flaky bug that
// shows up with rate p slips past n runs with probability (1 - p)^n, so n is the
// smallest number of runs that keeps that chance at or below MISS_CHANCE.
const MIN_REPEAT = 3;
const MISS_CHANCE = 0.05;
function requiredRepeat(f) {
  const m = RATE.exec(f.repro_rate || '');
  if (f.verdict !== 'flaky' || !m) return MIN_REPEAT;
  const p = Number(m[1]) / Number(m[2]);
  if (!(p > 0 && p < 1)) return MIN_REPEAT;
  // The small epsilon keeps exact cases (such as p = 0.5) from rounding up.
  return Math.max(MIN_REPEAT, Math.ceil(Math.log(MISS_CHANCE) / Math.log(1 - p) - 1e-9));
}

// Reads each fixed finding's revert check from the run directory and confirms it is
// a passing check-fix-test.cjs result for this fix: same commit, test and signature,
// enough runs for the finding's reproduction rate, and every fixed run green.
function revertCheckErrors(doc, runDir) {
  const errors = [];
  const schema = loadSchema('revert-check.schema.json');
  for (const f of doc.findings) {
    const x = f.fix;
    if (!x || x.verdict !== 'fixed' || !isStr(x.revert_check) || !isEvidencePath(x.revert_check)) continue;
    const w = `${f.id}.fix.revert_check`;
    let rc;
    try { rc = readJsonFile(path.join(runDir, x.revert_check)); } catch (e) {
      errors.push(`${w}: ${e.code === 'INPUT' ? e.message : 'cannot read'}`); continue;
    }
    const schemaErrors = validateSchema(rc, schema, w);
    if (schemaErrors.length) { errors.push(...schemaErrors); continue; }
    const err = (msg) => errors.push(`${w}: ${msg}`);
    if (rc.result !== 'pass') err(`check result is ${rc.result}${rc.reasons.length ? ` (${rc.reasons[0]})` : ''}`);
    if (isStr(x.commit) && !rc.commit.startsWith(x.commit)) err('was run against a different commit than fix.commit');
    if (rc.test_file !== x.test_file) err('was run against a different test file than fix.test_file');
    if (rc.expect !== x.failure_signature) err('expected assertion does not match fix.failure_signature');
    if (!rc.reverted_files.length) err('removed no product code');
    const need = requiredRepeat(f);
    if (rc.repeat < need) err(`ran ${rc.repeat} time(s); a ${f.verdict} finding at ${f.repro_rate} needs --repeat ${need} or more`);
    const before = rc.without_fix;
    if (!before || before.matched_failures < 1) err('does not show the test failing with the expected assertion without the fix');
    else if (f.verdict === 'confirmed' && before.matched_failures !== before.runs) {
      err(`the test caught the bug in only ${before.matched_failures}/${before.runs} runs without the fix, but the finding is confirmed (always reproduces); the test or the verdict is wrong`);
    }
    const after = rc.with_fix;
    if (!after || after.failures > 0 || after.passes !== rc.repeat || after.runs !== rc.repeat) err(`does not show the test passing in all ${rc.repeat} run(s) with the fix`);
  }
  return errors;
}

module.exports = { validateFindings, revertCheckErrors, requiredRepeat };

function parseArgs(argv) {
  const out = { file: null, ledger: null, run: null, runDir: null };
  const keys = { '--ledger': 'ledger', '--run': 'run', '--run-dir': 'runDir' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (hasOwn(keys, a)) {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return null;
      out[keys[a]] = v;
    } else if (a.startsWith('--') || out.file) return null;
    else out.file = a;
  }
  return out.file ? out : null;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('Usage: validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>] [--run <run.json>] [--run-dir <dir>]');
    process.exit(2);
  }
  let doc; let ledger = null; let run = null;
  try {
    doc = readJsonFile(args.file);
    if (args.ledger) ledger = readJsonFile(args.ledger);
    if (args.run) run = readJsonFile(args.run);
  } catch (e) { console.error(`✗ ${e.code === 'INPUT' ? e.message : 'cannot read input'}`); process.exit(2); }
  const errors = validateFindings(doc, ledger, run);
  if (!errors.length && args.runDir) errors.push(...revertCheckErrors(doc, args.runDir));
  if (errors.length) { console.error(formatErrors(errors)); process.exit(1); }
  const by = {};
  for (const f of doc.findings) by[f.verdict] = (by[f.verdict] || 0) + 1;
  console.log(`✓ findings OK: ${doc.findings.length} (${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
}
