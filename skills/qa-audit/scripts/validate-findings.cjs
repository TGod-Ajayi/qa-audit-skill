#!/usr/bin/env node
'use strict';
// Validates findings.json against schemas/findings.schema.json, then applies the
// per-verdict evidence rules, separation of duties and fix-proof rules.
// With --ledger it cross-checks units, build and check classes; with --run it
// cross-checks run metadata (for example, no fixes in report-only mode).
// Zero dependencies.
//
// Usage: node validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>] [--run <run.json>]
// Exit codes: 0 valid, 1 invalid records, 2 unreadable input or usage error.

const {
  isStr, isObject, nonEmptyArr, hasOwn, safeQuote, isSafeRelativePath, validateSchema, loadSchema,
  readJsonFile, formatErrors,
} = require('./lib/common.cjs');
const { isEvidencePath } = require('./validate-coverage-ledger.cjs');

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
  }
  if (isStr(x.fixer) && x.fixer === x.verifier) err(fw, 'verifier must be a different agent from fixer');
  if (isStr(x.fixer) && x.fixer === f.reproduced_by) err(fw, 'fixer must not be the agent that reproduced the finding');
  if (isStr(x.test_file) && !isSafeRelativePath(x.test_file)) err(fw, 'test_file must be a safe repository-relative path');
  if (['not_fixed', 'regressed', 'needs_human'].includes(x.verdict) && !isStr(x.notes)) {
    err(fw, `${x.verdict} requires notes on what was tried`);
  }
  (x.evidence || []).forEach((e, k) => { if (!isEvidencePath(e)) err(`${fw}.evidence[${k}]`, 'must be a safe relative path under evidence/'); });
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

module.exports = { validateFindings };

function parseArgs(argv) {
  const out = { file: null, ledger: null, run: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ledger' || a === '--run') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return null;
      out[a.slice(2)] = v;
    } else if (a.startsWith('--') || out.file) return null;
    else out.file = a;
  }
  return out.file ? out : null;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('Usage: validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>] [--run <run.json>]');
    process.exit(2);
  }
  let doc; let ledger = null; let run = null;
  try {
    doc = readJsonFile(args.file);
    if (args.ledger) ledger = readJsonFile(args.ledger);
    if (args.run) run = readJsonFile(args.run);
  } catch (e) { console.error(`✗ ${e.code === 'INPUT' ? e.message : 'cannot read input'}`); process.exit(2); }
  const errors = validateFindings(doc, ledger, run);
  if (errors.length) { console.error(formatErrors(errors)); process.exit(1); }
  const by = {};
  for (const f of doc.findings) by[f.verdict] = (by[f.verdict] || 0) + 1;
  console.log(`✓ findings OK: ${doc.findings.length} (${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
}
