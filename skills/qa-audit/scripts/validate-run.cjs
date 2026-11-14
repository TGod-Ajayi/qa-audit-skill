#!/usr/bin/env node
'use strict';
// Validates run.json against schemas/run.schema.json, then applies the run-status,
// mode, branch and budget rules from SKILL.md. Zero dependencies.
//
// Usage: node validate-run.cjs <run.json>
// Exit codes: 0 valid, 1 invalid records, 2 unreadable input or usage error.

const {
  isStr, isObject, isIsoTimestamp, isSafeRelativePath, validateSchema, loadSchema, readJsonFile, formatErrors,
} = require('./lib/common.cjs');

function semanticErrors(run) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  if (!isIsoTimestamp(run.started_at)) err('$.started_at', 'must be an ISO 8601 timestamp with a timezone');
  if (run.finished_at !== null && !isIsoTimestamp(run.finished_at)) err('$.finished_at', 'must be an ISO 8601 timestamp with a timezone or null');
  if (isIsoTimestamp(run.started_at) && isIsoTimestamp(run.finished_at) && Date.parse(run.finished_at) < Date.parse(run.started_at)) {
    err('$.finished_at', 'is earlier than started_at');
  }

  if (run.run_status === 'in_progress' && run.finished_at !== null) err('$.finished_at', 'must be null while run_status is in_progress');
  if (run.run_status !== 'in_progress' && run.finished_at === null) err('$.finished_at', `is required when run_status is ${run.run_status}`);
  if (run.run_status === 'incomplete' && !isStr(run.incomplete_reason)) err('$.incomplete_reason', 'is required when run_status is incomplete');
  if (run.run_status !== 'incomplete' && isStr(run.incomplete_reason)) err('$.incomplete_reason', 'is only allowed when run_status is incomplete');

  if (run.mode === 'report-only' && run.fixing_allowed) err('$.fixing_allowed', 'must be false in report-only mode');
  if (run.fixing_allowed && run.branch === null) err('$.branch', 'is required when fixing is allowed');
  if (!run.fixing_allowed && run.branch !== null) err('$.branch', 'must be null when fixing is not allowed');
  if (run.branch !== null && run.branch !== `qa-audit/run-${run.run}`) err('$.branch', `must be qa-audit/run-${run.run}`);
  if (run.budget !== null && Number.isInteger(run.agents_used) && run.agents_used > run.budget && run.run_status !== 'incomplete') {
    err('$.agents_used', 'exceeds budget; a run may not overspend silently (set run_status incomplete with a reason)');
  }
  run.scope.forEach((s, i) => { if (!isSafeRelativePath(s) && !/^(route|journey|unit):/.test(s)) err(`$.scope[${i}]`, 'must be a repository-relative path or a route:, journey: or unit: selector'); });
  return errors;
}

function validateRun(run) {
  if (!isObject(run)) return ['$: run metadata must be a JSON object'];
  const errors = validateSchema(run, loadSchema('run.schema.json'));
  if (errors.length) return errors;
  return semanticErrors(run);
}

/** A run whose verdict only speaks for part of the product. */
function isPartialRun(run) {
  return run.profile === 'quick' || run.scope.length > 0 || run.mode === 'focused';
}

module.exports = { validateRun, isPartialRun };

if (require.main === module) {
  const file = process.argv[2];
  if (!file || process.argv.length > 3) { console.error('Usage: validate-run.cjs <run.json>'); process.exit(2); }
  let data;
  try { data = readJsonFile(file); }
  catch (e) { console.error(`✗ ${e.code === 'INPUT' ? e.message : 'cannot read input'}`); process.exit(2); }
  const errors = validateRun(data);
  if (errors.length) { console.error(formatErrors(errors)); process.exit(1); }
  console.log(`✓ run OK: run ${data.run}, ${data.mode}/${data.profile}, ${data.run_status}`);
}
