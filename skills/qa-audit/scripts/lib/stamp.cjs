'use strict';
// Shared helpers for verdict.json, the stamp that ties a release verdict to the
// exact commit, tree and records it was computed from. Zero dependencies.

const path = require('path');
const { InputError, validateSchema, loadSchema, readJsonFile, sha256File } = require('./common.cjs');

const STAMP_FILE = 'verdict.json';
const RECORDS = ['run.json', 'coverage-ledger.json', 'findings.json'];

function recordHashes(runDir) {
  const out = {};
  for (const name of RECORDS) out[name] = sha256File(path.join(runDir, name));
  return out;
}

// Returns { state: 'none' } when there is no stamp, or { state: 'ok', stamp } for a
// schema-valid stamp. Throws InputError for an unreadable or malformed stamp.
function readStamp(runDir) {
  let stamp;
  try { stamp = readJsonFile(path.join(runDir, STAMP_FILE)); } catch (e) {
    if (e instanceof InputError && /^cannot read/.test(e.message)) return { state: 'none' };
    throw e;
  }
  const errors = validateSchema(stamp, loadSchema('verdict.schema.json'));
  if (errors.length) throw new InputError(`${STAMP_FILE} is invalid: ${errors.slice(0, 5).join('; ')}`);
  return { state: 'ok', stamp };
}

// Reasons the stamp no longer describes these records: any record byte changed,
// or the verdict computed from them differs from the stamped one.
function recordDriftReasons(stamp, runDir, verdict) {
  const reasons = [];
  const now = recordHashes(runDir);
  for (const name of RECORDS) if (now[name] !== stamp.records[name]) reasons.push(`${name} changed since the verdict was stamped`);
  if (verdict && verdict !== stamp.verdict) reasons.push(`the records now give "${verdict}", but the stamp says "${stamp.verdict}"`);
  return reasons;
}

module.exports = { STAMP_FILE, RECORDS, recordHashes, readStamp, recordDriftReasons };
