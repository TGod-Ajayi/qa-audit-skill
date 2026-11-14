#!/usr/bin/env node
'use strict';
// Validates coverage-ledger.json. Zero dependencies.
// Usage: node validate-coverage-ledger.cjs <coverage-ledger.json>

const fs = require('fs');

const KINDS = ['journey', 'page', 'form', 'entity', 'api', 'state', 'integration', 'cross-cutting'];
const PRIORITIES = ['P0', 'P1', 'P2'];
const STATUSES = ['pending', 'covered', 'partial', 'blocked'];
const CLASSES = ['happy-path', 'input', 'state', 'navigation', 'auth', 'errors', 'timing', 'money',
  'time-locale', 'integration', 'contract', 'responsive', 'a11y', 'performance', 'hygiene'];
const RESULTS = ['pass', 'fail', 'blocked'];
const UNIT_ID = /^U-\d{3,}$/;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function validateLedger(ledger) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return ['ledger: must be a JSON object'];
  }
  if (!Number.isInteger(ledger.run) || ledger.run < 1) err('ledger', 'run must be a positive integer');
  if (!isStr(ledger.build)) err('ledger', 'build (git sha) is required');
  if (!Array.isArray(ledger.units)) return errors.concat(['ledger: units must be an array']);
  if (!Array.isArray(ledger.p0_journeys)) err('ledger', 'p0_journeys must be an array');

  const byId = new Map();
  for (const [i, u] of ledger.units.entries()) {
    const w = (u && u.id) || `units[${i}]`;
    if (!u || typeof u !== 'object') { err(w, 'unit must be an object'); continue; }
    if (!isStr(u.id) || !UNIT_ID.test(u.id)) err(w, 'id must look like U-001');
    else if (byId.has(u.id)) err(w, 'duplicate id');
    else byId.set(u.id, u);

    for (const k of ['area', 'target', 'expected_source']) if (!isStr(u[k])) err(w, `${k} is required`);
    if (!KINDS.includes(u.kind)) err(w, `kind must be one of ${KINDS.join(', ')}`);
    if (!PRIORITIES.includes(u.priority)) err(w, 'priority must be P0, P1 or P2');
    if (!STATUSES.includes(u.status)) err(w, `status must be one of ${STATUSES.join(', ')}`);

    if (!Array.isArray(u.check_classes) || u.check_classes.length === 0) {
      err(w, 'check_classes must be a non-empty array');
    } else {
      for (const c of u.check_classes) if (!CLASSES.includes(c)) err(w, `unknown check class "${c}"`);
    }
    if (!Array.isArray(u.source_files)) err(w, 'source_files must be an array');

    const checks = Array.isArray(u.checks_performed) ? u.checks_performed : null;
    if (!checks) { err(w, 'checks_performed must be an array'); continue; }
    for (const [j, c] of checks.entries()) {
      const cw = `${w}.checks_performed[${j}]`;
      if (!c || typeof c !== 'object') { err(cw, 'must be an object'); continue; }
      if (!isStr(c.check)) err(cw, 'check description is required');
      if (!RESULTS.includes(c.result)) err(cw, 'result must be pass, fail or blocked');
      if (!Array.isArray(c.evidence)) err(cw, 'evidence must be an array');
      if (Array.isArray(u.check_classes) && !u.check_classes.includes(c.class)) {
        err(cw, `class "${c.class}" is not assigned to this unit`);
      }
      if (c.result !== 'blocked' && Array.isArray(c.evidence) && c.evidence.length === 0) {
        err(cw, 'a pass/fail check needs evidence');
      }
    }

    if (u.status === 'covered') {
      if (checks.length === 0) err(w, 'covered unit has no checks_performed');
      if (checks.some((c) => c && c.result === 'blocked')) err(w, 'covered unit has a blocked check; use partial');
      if (Array.isArray(u.check_classes)) {
        const done = new Set(checks.filter((c) => c && Array.isArray(c.evidence) && c.evidence.length).map((c) => c.class));
        const missing = u.check_classes.filter((c) => !done.has(c));
        if (missing.length) err(w, `covered unit lacks evidenced checks for: ${missing.join(', ')}`);
      }
    }
    if (u.status === 'blocked' && !isStr(u.blocked_reason)) err(w, 'blocked unit needs blocked_reason');
    if (u.status === 'pending' && checks.length > 0) err(w, 'pending unit has checks; set covered/partial/blocked');
  }

  if (Array.isArray(ledger.p0_journeys)) {
    if (ledger.p0_journeys.length === 0) err('p0_journeys', 'at least one P0 journey is required');
    for (const [i, j] of ledger.p0_journeys.entries()) {
      const w = `p0_journeys[${i}]`;
      if (!j || !isStr(j.name)) { err(w, 'name is required'); continue; }
      const u = byId.get(j.unit);
      if (!u) err(w, `"${j.name}" points to unknown unit ${j.unit}`);
      else if (u.priority !== 'P0') err(w, `"${j.name}" unit ${j.unit} must have priority P0`);
    }
  }
  return errors;
}

module.exports = { validateLedger };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: validate-coverage-ledger.cjs <coverage-ledger.json>'); process.exit(2); }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(2); }
  const errors = validateLedger(data);
  if (errors.length) { console.error(`✗ ${errors.length} problem(s):\n- ${errors.join('\n- ')}`); process.exit(1); }
  const counts = {};
  for (const u of data.units) counts[u.status] = (counts[u.status] || 0) + 1;
  console.log(`✓ ledger OK: ${data.units.length} units (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})`);
}
