#!/usr/bin/env node
'use strict';
// Validates findings.json. Zero dependencies.
// Usage: node validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>]

const fs = require('fs');

const VERDICTS = ['confirmed', 'flaky', 'needs_validation', 'rejected'];
const SEVERITIES = ['S1', 'S2', 'S3', 'S4'];
const FIX_VERDICTS = ['fixed', 'not_fixed', 'regressed', 'needs_human'];
const FINDING_ID = /^QA-\d{3,}$/;
const RATE = /^(\d+)\/(\d+)$/;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;

function validateFindings(doc, ledger) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['findings: must be a JSON object'];
  if (!Number.isInteger(doc.run) || doc.run < 1) err('findings', 'run must be a positive integer');
  if (!isStr(doc.build)) err('findings', 'build (git sha) is required');
  if (!Array.isArray(doc.findings)) return errors.concat(['findings: findings must be an array']);

  const unitIds = ledger && Array.isArray(ledger.units) ? new Set(ledger.units.map((u) => u.id)) : null;
  const seen = new Set();

  for (const [i, f] of doc.findings.entries()) {
    const w = (f && f.id) || `findings[${i}]`;
    if (!f || typeof f !== 'object') { err(w, 'must be an object'); continue; }
    if (!isStr(f.id) || !FINDING_ID.test(f.id)) err(w, 'id must look like QA-001');
    else if (seen.has(f.id)) err(w, 'duplicate id');
    seen.add(f.id);

    if (!isStr(f.title)) err(w, 'title is required');
    if (!isStr(f.unit)) err(w, 'unit is required');
    else if (unitIds && f.unit !== 'WILDCARD' && !unitIds.has(f.unit)) err(w, `unit ${f.unit} not in ledger`);
    if (!VERDICTS.includes(f.verdict)) { err(w, `verdict must be one of ${VERDICTS.join(', ')}`); continue; }

    const proven = f.verdict === 'confirmed' || f.verdict === 'flaky';
    if (proven) {
      if (!SEVERITIES.includes(f.severity)) err(w, `${f.verdict} finding needs severity S1-S4`);
      for (const k of ['expected', 'expected_source', 'observed', 'impact', 'likelihood']) {
        if (!isStr(f[k])) err(w, `${f.verdict} finding needs ${k}`);
      }
      if (!nonEmptyArr(f.minimal_repro)) err(w, `${f.verdict} finding needs minimal_repro steps`);
      if (!nonEmptyArr(f.evidence)) err(w, `${f.verdict} finding needs evidence`);
      const m = RATE.exec(f.repro_rate || '');
      if (!m) err(w, 'repro_rate like "3/3" is required');
      else {
        const [hit, total] = [Number(m[1]), Number(m[2])];
        if (hit > total || total === 0) err(w, 'repro_rate is impossible');
        else if (f.verdict === 'confirmed' && (hit !== total || total < 3)) err(w, 'confirmed needs ≥3/3 reproductions; use flaky otherwise');
        else if (f.verdict === 'flaky' && (hit === 0 || hit === total)) err(w, 'flaky needs an intermittent rate (e.g. 2/10)');
      }
    } else {
      if (f.severity !== null && f.severity !== undefined) err(w, `severity must be null for ${f.verdict}`);
      if (f.fix) err(w, `${f.verdict} findings must not have a fix`);
    }
    if (f.verdict === 'needs_validation' && !isStr(f.blocking_fact)) err(w, 'needs_validation needs blocking_fact');
    if (f.verdict === 'rejected' && !isStr(f.rejection_reason)) err(w, 'rejected needs rejection_reason');
    if (f.security_referral === true && f.verdict !== 'needs_validation') {
      err(w, 'security_referral findings stay needs_validation (QA does not probe them)');
    }

    if (f.fix) {
      const x = f.fix;
      if (!FIX_VERDICTS.includes(x.verdict)) err(w, `fix.verdict must be one of ${FIX_VERDICTS.join(', ')}`);
      if (x.verdict === 'fixed') {
        if (x.test_failed_before !== true) err(w, 'fixed requires test_failed_before: true');
        if (x.test_passes_after !== true) err(w, 'fixed requires test_passes_after: true');
        if (x.verified_by_independent_agent !== true) err(w, 'fixed requires verified_by_independent_agent: true');
        if (!isStr(x.commit)) err(w, 'fixed requires commit');
        if (!isStr(x.test_file)) err(w, 'fixed requires test_file');
      }
      if (x.verdict === 'needs_human' && !isStr(x.notes)) err(w, 'needs_human requires notes on what was tried');
    }
  }

  if (doc.suggestions !== undefined) {
    if (!Array.isArray(doc.suggestions)) err('suggestions', 'must be an array');
    else doc.suggestions.forEach((s, i) => { if (!s || !isStr(s.text)) err(`suggestions[${i}]`, 'text is required'); });
  }
  return errors;
}

module.exports = { validateFindings };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--ledger');
  const li = args.indexOf('--ledger');
  if (!file) { console.error('Usage: validate-findings.cjs <findings.json> [--ledger <coverage-ledger.json>]'); process.exit(2); }
  const read = (p) => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.error(`Cannot read ${p}: ${e.message}`); process.exit(2); }
  };
  const doc = read(file);
  const ledger = li >= 0 ? read(args[li + 1]) : null;
  const errors = validateFindings(doc, ledger);
  if (errors.length) { console.error(`✗ ${errors.length} problem(s):\n- ${errors.join('\n- ')}`); process.exit(1); }
  const by = {};
  for (const f of doc.findings) by[f.verdict] = (by[f.verdict] || 0) + 1;
  console.log(`✓ findings OK: ${doc.findings.length} (${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
}
