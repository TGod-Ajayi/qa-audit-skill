'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  checkSchema, validateSchema, loadSchema, isSafeRelativePath, isAgentId, safeQuote, parseJsonText,
  readJsonFile, isIsoTimestamp, LIMITS,
} = require('../lib/common.cjs');
const { tmpDir } = require('./helpers.cjs');

test('bundled schemas use only supported keywords', () => {
  for (const name of ['coverage-ledger.schema.json', 'findings.schema.json', 'run.schema.json']) {
    assert.deepEqual(checkSchema(loadSchema(name)), [], name);
  }
});

test('schema engine rejects unsupported keywords and bad required lists', () => {
  assert.ok(checkSchema({ type: 'object', oneOf: [] }).some((e) => /unsupported keyword "oneOf"/.test(e)));
  assert.ok(checkSchema({ type: 'object', properties: {}, required: ['x'] }).some((e) => /not a declared property/.test(e)));
  assert.ok(checkSchema({ type: 'strin' }).some((e) => /unsupported type/.test(e)));
  assert.ok(checkSchema({ pattern: '(' }).some((e) => /invalid regular expression/.test(e)));
});

test('schema engine enforces types, enums, patterns, unknown fields and uniqueness', () => {
  const schema = {
    type: 'object', additionalProperties: false, required: ['a'],
    properties: {
      a: { type: 'string', minLength: 1, pattern: '^x' },
      b: { enum: ['one', 'two'] },
      c: { type: 'array', uniqueItems: true, minItems: 1, items: { type: 'integer', minimum: 0 } },
      d: { type: ['string', 'null'] },
    },
  };
  assert.deepEqual(validateSchema({ a: 'xy', b: 'one', c: [1, 2], d: null }, schema), []);
  const e = validateSchema({ b: 'three', c: [1, 1, -1, 1.5], d: 3, extra: true }, schema);
  for (const re of [/missing required field "a"/, /invalid value "three"/, /duplicate of \$\.c\[0\]/, /must be at least 0/,
    /expected integer, got number/, /\$\.d: expected string or null/, /unexpected field "extra"/]) {
    assert.ok(e.some((x) => re.test(x)), `${re} in ${e.join(' | ')}`);
  }
  assert.ok(validateSchema({ a: '   ' }, schema).some((x) => /visible character|must match/.test(x)));
});

test('inherited properties are not treated as present', () => {
  const obj = Object.create({ a: 'x' });
  assert.ok(validateSchema(obj, { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }).length);
});

test('safe relative paths', () => {
  for (const ok of ['evidence/a.png', 'src/lib/money.ts', 'src/routes/[id]/page.tsx', 'docs/Adébáyọ̀.md']) assert.ok(isSafeRelativePath(ok), ok);
  for (const bad of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'C:/x', 'a\\b', '~/x', 'a/con', 'a/nul.txt', 'a\u0000b', 'a\u202eb', 'trailing.', 'a/b ']) {
    assert.ok(!isSafeRelativePath(bad), JSON.stringify(bad));
  }
});

test('agent ids are lowercase, bounded and not device names', () => {
  assert.ok(isAgentId('tester-b01'));
  for (const bad of ['Tester', '-x', 'a'.repeat(65), 'con', 'lpt1', 'a b', '']) assert.ok(!isAgentId(bad), bad);
});

test('timestamps need a timezone', () => {
  assert.ok(isIsoTimestamp('2026-11-14T09:00:00Z'));
  assert.ok(isIsoTimestamp('2026-11-14T10:00:00+01:00'));
  assert.ok(!isIsoTimestamp('2026-11-14 09:00'));
  assert.ok(!isIsoTimestamp('2026-11-14T09:00:00'));
});

test('diagnostics escape control and bidi characters and truncate', () => {
  const q = safeQuote('a\u001b[31mb\u202ec');
  assert.ok(!/[\u001b\u202e]/.test(q));
  assert.match(q, /\\\\u001b/);
  assert.ok(safeQuote('x'.repeat(500)).length < 140);
});

test('JSON parsing is strict and does not echo input', () => {
  assert.throws(() => parseJsonText(Buffer.from([0xff, 0xfe, 0x7b])), /not valid UTF-8/);
  assert.throws(() => parseJsonText(Buffer.from('{"a": SECRET}')), (e) => /not valid JSON/.test(e.message) && !/SECRET/.test(e.message));
  assert.deepEqual(parseJsonText(Buffer.from('\ufeff{"a":1}')), { a: 1 });
  const deep = '['.repeat(LIMITS.maxDepth + 1) + ']'.repeat(LIMITS.maxDepth + 1);
  assert.throws(() => parseJsonText(Buffer.from(deep)), /nesting deeper/);
});

test('readJsonFile refuses symlinks, directories and FIFOs', { skip: process.platform === 'win32' }, () => {
  const dir = tmpDir();
  const real = path.join(dir, 'real.json');
  fs.writeFileSync(real, '{}');
  fs.symlinkSync(real, path.join(dir, 'link.json'));
  assert.deepEqual(readJsonFile(real), {});
  assert.throws(() => readJsonFile(path.join(dir, 'link.json')), /symlink/);
  assert.throws(() => readJsonFile(dir), /not a regular file/);
  assert.throws(() => readJsonFile(path.join(dir, 'missing.json')), /cannot read/);
  const { spawnSync } = require('child_process');
  if (spawnSync('mkfifo', [path.join(dir, 'fifo')]).status === 0) {
    assert.throws(() => readJsonFile(path.join(dir, 'fifo')), /not a regular file/);
  }
});
