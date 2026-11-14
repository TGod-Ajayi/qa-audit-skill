#!/usr/bin/env node
'use strict';
// Validates coverage-ledger.json against schemas/coverage-ledger.schema.json, then
// applies the coverage rules: evidence-backed "covered", reasons for every gap,
// safe repository-relative paths and P0 consistency. Zero dependencies.
//
// Usage: node validate-coverage-ledger.cjs <coverage-ledger.json>
// Exit codes: 0 valid, 1 invalid records, 2 unreadable input or usage error.

const {
  isStr, isObject, safeQuote, isSafeRelativePath, isAgentId, validateSchema, loadSchema,
  readJsonFile, formatErrors,
} = require('./lib/common.cjs');

const REASON_REQUIRED = new Set(['blocked', 'deferred', 'out_of_scope']);
const OWNER_REQUIRED = new Set(['covered', 'partial', 'blocked']);

function isEvidencePath(p) {
  return isSafeRelativePath(p) && p.startsWith('evidence/');
}

function semanticErrors(ledger) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const byId = new Map();
  let lastId = '';

  ledger.units.forEach((u, i) => {
    const w = isStr(u.id) ? u.id : `units[${i}]`;
    if (byId.has(u.id)) err(w, `duplicate id (also at units[${byId.get(u.id).index}])`);
    else byId.set(u.id, { unit: u, index: i });
    if (u.id < lastId) err(w, 'units must be sorted by id');
    lastId = u.id > lastId ? u.id : lastId;

    const checks = u.checks_performed;
    const classes = new Set(u.check_classes);

    checks.forEach((c, j) => {
      const cw = `${w}.checks_performed[${j}]`;
      if (!classes.has(c.class)) err(cw, `class ${safeQuote(c.class)} is not assigned to this unit`);
      if (c.result !== 'blocked' && c.evidence.length === 0) err(cw, 'a pass/fail check needs evidence');
      c.evidence.forEach((e, k) => {
        if (!isEvidencePath(e)) err(`${cw}.evidence[${k}]`, 'must be a safe relative path under evidence/');
      });
    });
    u.source_files.forEach((f, k) => {
      if (!isSafeRelativePath(f)) err(`${w}.source_files[${k}]`, 'must be a safe repository-relative path');
    });
    if (u.kind === 'code' && u.source_files.length === 0) err(w, 'a code unit must list its source_files');

    if (REASON_REQUIRED.has(u.status) && !isStr(u.blocked_reason)) err(w, `${u.status} unit needs blocked_reason`);
    if (!REASON_REQUIRED.has(u.status) && isStr(u.blocked_reason)) err(w, `blocked_reason is only allowed on blocked, deferred or out_of_scope units`);
    if (OWNER_REQUIRED.has(u.status) && !isAgentId(u.assigned_to)) err(w, `${u.status} unit needs assigned_to (the agent whose results were merged)`);

    switch (u.status) {
      case 'pending':
        if (checks.length) err(w, 'pending unit has checks; set covered, partial or blocked');
        break;
      case 'out_of_scope':
        if (checks.length) err(w, 'out_of_scope unit must not have checks');
        break;
      case 'partial':
        if (!checks.length) err(w, 'partial unit has no checks; use pending or blocked');
        break;
      case 'covered': {
        if (!checks.length) err(w, 'covered unit has no checks_performed');
        if (checks.some((c) => c.result === 'blocked')) err(w, 'covered unit has a blocked check; use partial');
        const done = new Set(checks.filter((c) => c.result !== 'blocked' && c.evidence.length).map((c) => c.class));
        const missing = u.check_classes.filter((c) => !done.has(c));
        if (missing.length) err(w, `covered unit lacks evidenced checks for: ${missing.join(', ')}`);
        break;
      }
      default:
        break;
    }
  });

  if (ledger.p0_journeys.length === 0) err('p0_journeys', 'at least one P0 journey is required');
  const seenJourneyUnits = new Set();
  ledger.p0_journeys.forEach((j, i) => {
    const w = `p0_journeys[${i}]`;
    const entry = byId.get(j.unit);
    if (!entry) { err(w, `${safeQuote(j.name)} points to unknown unit ${j.unit}`); return; }
    if (entry.unit.priority !== 'P0') err(w, `${safeQuote(j.name)} unit ${j.unit} must have priority P0`);
    if (entry.unit.status === 'out_of_scope') err(w, `P0 journey unit ${j.unit} cannot be out_of_scope`);
    if (seenJourneyUnits.has(j.unit)) err(w, `unit ${j.unit} is listed twice`);
    seenJourneyUnits.add(j.unit);
  });
  for (const { unit } of byId.values()) {
    if (unit.kind === 'journey' && unit.priority === 'P0' && !seenJourneyUnits.has(unit.id)) {
      err(unit.id, 'P0 journey unit is missing from p0_journeys');
    }
  }
  return errors;
}

function validateLedger(ledger) {
  if (!isObject(ledger)) return ['$: ledger must be a JSON object'];
  const errors = validateSchema(ledger, loadSchema('coverage-ledger.schema.json'));
  // Semantic rules assume the structure is sound; report structure first.
  if (errors.length) return errors;
  return semanticErrors(ledger);
}

module.exports = { validateLedger, isEvidencePath };

if (require.main === module) {
  const file = process.argv[2];
  if (!file || process.argv.length > 3) {
    console.error('Usage: validate-coverage-ledger.cjs <coverage-ledger.json>');
    process.exit(2);
  }
  let data;
  try { data = readJsonFile(file); }
  catch (e) { console.error(`✗ ${e.code === 'INPUT' ? e.message : 'cannot read input'}`); process.exit(2); }
  const errors = validateLedger(data);
  if (errors.length) { console.error(formatErrors(errors)); process.exit(1); }
  const counts = {};
  for (const u of data.units) counts[u.status] = (counts[u.status] || 0) + 1;
  console.log(`✓ ledger OK: ${data.units.length} units (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})`);
}
