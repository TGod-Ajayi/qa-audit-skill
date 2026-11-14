'use strict';
// Shared helpers for the qa-audit validators and report generator. Zero dependencies.
//
// - A small JSON Schema engine that supports exactly the keywords the bundled
//   schemas use. Unknown keywords are a schema error, so the validator can never
//   silently ignore a rule the schema states.
// - Hardened JSON file reading: regular files only, no symlinks, a byte limit,
//   strict UTF-8, a nesting-depth limit, and parser errors that never echo input.
// - Safe diagnostics: input-derived strings are escaped and truncated.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxDepth: 64,
  maxArrayLength: 10000,
  maxStringLength: 64 * 1024,
  maxReportedErrors: 200,
});

const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const FORBIDDEN_PATH_CHAR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNSAFE_DIAGNOSTIC = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;
const VISIBLE = /[^\p{White_Space}\p{Cc}\p{Cf}]/u;

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && VISIBLE.test(v);
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;

function safeQuote(value) {
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s === undefined) s = String(value);
  if (s.length > 120) s = `${s.slice(0, 120)}…`;
  s = s.replace(UNSAFE_DIAGNOSTIC, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);
  return JSON.stringify(s);
}

function isSafeRelativePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) return false;
  if (FORBIDDEN_PATH_CHAR.test(p)) return false;
  if (p.includes('\\')) return false;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.startsWith('~')) return false;
  const parts = p.split('/');
  return parts.every((c) => c !== '' && c !== '.' && c !== '..' && !WINDOWS_RESERVED.test(c) && !/[. ]$/.test(c));
}

function isAgentId(v) {
  return typeof v === 'string' && AGENT_ID.test(v) && !WINDOWS_RESERVED.test(v);
}

function isIsoTimestamp(v) {
  return typeof v === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
    && !Number.isNaN(Date.parse(v));
}

// ---------- schema engine ----------

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'type', 'properties', 'required',
  'additionalProperties', 'enum', 'const', 'pattern', 'minLength', 'maxLength', 'minItems',
  'items', 'minimum', 'uniqueItems',
]);
const SUPPORTED_TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null']);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

function checkSchema(schema, p = 'schema', errors = []) {
  if (!isObject(schema)) { errors.push(`${p}: must be an object`); return errors; }
  for (const k of Object.keys(schema)) if (!SUPPORTED_KEYWORDS.has(k)) errors.push(`${p}: unsupported keyword ${safeQuote(k)}`);
  const types = schema.type === undefined ? [] : [].concat(schema.type);
  for (const t of types) if (!SUPPORTED_TYPES.has(t)) errors.push(`${p}.type: unsupported type ${safeQuote(t)}`);
  if (schema.properties !== undefined) {
    if (!isObject(schema.properties)) errors.push(`${p}.properties: expected object`);
    else for (const [k, s] of Object.entries(schema.properties)) checkSchema(s, `${p}.properties.${k}`, errors);
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((r) => typeof r !== 'string')) errors.push(`${p}.required: expected array of strings`);
    else if (isObject(schema.properties)) {
      for (const r of schema.required) if (!hasOwn(schema.properties, r)) errors.push(`${p}.required: ${safeQuote(r)} is not a declared property`);
    }
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    errors.push(`${p}.additionalProperties: only booleans are supported`);
  }
  if (schema.enum !== undefined && !nonEmptyArr(schema.enum)) errors.push(`${p}.enum: expected a non-empty array`);
  if (schema.pattern !== undefined) {
    try { new RegExp(schema.pattern, 'u'); } catch { errors.push(`${p}.pattern: invalid regular expression`); }
  }
  if (schema.items !== undefined) checkSchema(schema.items, `${p}.items`, errors);
  for (const k of ['minLength', 'maxLength', 'minItems']) {
    if (schema[k] !== undefined && !(Number.isInteger(schema[k]) && schema[k] >= 0)) errors.push(`${p}.${k}: expected a non-negative integer`);
  }
  return errors;
}

function validateAgainst(value, schema, p, errors) {
  if (schema.type !== undefined) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${p}: expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${p}: must equal ${safeQuote(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${p}: invalid value ${safeQuote(value)} (expected one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')})`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${p}: must have at least ${schema.minLength} character(s)`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${p}: must have at most ${schema.maxLength} character(s)`);
    if (schema.minLength > 0 && value.length >= schema.minLength && !VISIBLE.test(value)) errors.push(`${p}: must contain a visible character`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${p}: must match ${JSON.stringify(schema.pattern)}`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${p}: must be at least ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${p}: must have at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => validateAgainst(v, schema.items, `${p}[${i}]`, errors));
    if (schema.uniqueItems) {
      const seen = new Map();
      value.forEach((v, i) => {
        const key = JSON.stringify(v);
        if (seen.has(key)) errors.push(`${p}[${i}]: duplicate of ${p}[${seen.get(key)}]`);
        else seen.set(key, i);
      });
    }
  }
  if (isObject(value)) {
    const props = schema.properties || {};
    for (const r of schema.required || []) if (!hasOwn(value, r)) errors.push(`${p}: missing required field ${safeQuote(r)}`);
    for (const k of Object.keys(value)) {
      if (hasOwn(props, k)) validateAgainst(value[k], props[k], `${p}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${p}: unexpected field ${safeQuote(k)}`);
    }
  }
}

function validateSchema(value, schema, root = '$') {
  const errors = [];
  validateAgainst(value, schema, root, errors);
  return errors;
}

const schemaCache = new Map();
function loadSchema(name) {
  if (schemaCache.has(name)) return schemaCache.get(name);
  const file = path.join(__dirname, '..', '..', 'schemas', name);
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = checkSchema(schema);
  if (problems.length) throw new Error(`Bundled schema ${name} is invalid:\n- ${problems.join('\n- ')}`);
  schemaCache.set(name, schema);
  return schema;
}

// ---------- hardened input ----------

class InputError extends Error {
  constructor(message) { super(message); this.code = 'INPUT'; }
}

function checkDepthAndSize(value) {
  const stack = [[value, 1]];
  while (stack.length) {
    const [v, depth] = stack.pop();
    if (depth > LIMITS.maxDepth) throw new InputError(`nesting deeper than ${LIMITS.maxDepth} levels`);
    if (typeof v === 'string' && v.length > LIMITS.maxStringLength) throw new InputError(`a string exceeds ${LIMITS.maxStringLength} characters`);
    if (Array.isArray(v)) {
      if (v.length > LIMITS.maxArrayLength) throw new InputError(`an array exceeds ${LIMITS.maxArrayLength} items`);
      for (const x of v) stack.push([x, depth + 1]);
    } else if (isObject(v)) {
      for (const x of Object.values(v)) stack.push([x, depth + 1]);
    }
  }
}

function parseJsonText(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { throw new InputError('file is not valid UTF-8'); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let data;
  try { data = JSON.parse(text); }
  catch { throw new InputError('file is not valid JSON'); }
  checkDepthAndSize(data);
  return data;
}

// Reads a regular file (never through a symlink) within the size limit.
function readRegularFile(file) {
  let st;
  try { st = fs.lstatSync(file); }
  catch { throw new InputError(`cannot read ${safeQuote(path.basename(String(file)))}`); }
  if (st.isSymbolicLink()) throw new InputError('refusing to follow a symlink');
  if (!st.isFile()) throw new InputError('not a regular file');
  if (st.size > LIMITS.maxBytes) throw new InputError(`file exceeds ${LIMITS.maxBytes} bytes`);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(file, flags);
  try {
    const fst = fs.fstatSync(fd);
    if (!fst.isFile() || fst.size > LIMITS.maxBytes) throw new InputError('file changed while reading or is not a regular file');
    const buf = Buffer.alloc(fst.size);
    let off = 0;
    while (off < buf.length) {
      const n = fs.readSync(fd, buf, off, buf.length - off, off);
      if (n === 0) break;
      off += n;
    }
    return buf.subarray(0, off);
  } finally {
    fs.closeSync(fd);
  }
}

function readJsonFile(file) {
  return parseJsonText(readRegularFile(file));
}

// sha256 of a record's exact bytes, used to tie a verdict stamp to its records.
function sha256File(file) {
  return crypto.createHash('sha256').update(readRegularFile(file)).digest('hex');
}

function formatErrors(errors) {
  const shown = errors.slice(0, LIMITS.maxReportedErrors);
  const more = errors.length - shown.length;
  return `✗ ${errors.length} problem(s):\n- ${shown.join('\n- ')}${more > 0 ? `\n- … and ${more} more` : ''}`;
}

module.exports = {
  LIMITS, InputError, hasOwn, isObject, isStr, nonEmptyArr, safeQuote, isSafeRelativePath, isAgentId,
  isIsoTimestamp, checkSchema, validateSchema, loadSchema, readJsonFile, readRegularFile, sha256File, parseJsonText, formatErrors,
};
