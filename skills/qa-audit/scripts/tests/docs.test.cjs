'use strict';
// Keeps the prose, schemas and checklists from drifting apart.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { ROOT } = require('./helpers.cjs');
const { loadSchema } = require('../lib/common.cjs');

const SKILL = path.join(ROOT, 'skills', 'qa-audit');
const read = (...p) => fs.readFileSync(path.join(SKILL, ...p), 'utf8');
const CLASSES = loadSchema('coverage-ledger.schema.json').properties.units.items.properties.check_classes.items.enum;
const KINDS = loadSchema('coverage-ledger.schema.json').properties.units.items.properties.kind.enum;

test('ledger and findings schemas agree on check classes', () => {
  assert.deepEqual(loadSchema('findings.schema.json').properties.findings.items.properties.check_class.enum, CLASSES);
});

test('CHECK-CLASSES.md documents every check class and unit kind', () => {
  const doc = read('CHECK-CLASSES.md');
  for (const c of CLASSES) assert.match(doc, new RegExp(`^## ${c}\\b`, 'm'), c);
  for (const k of KINDS) assert.match(doc, new RegExp(`^\\| ${k} \\|`, 'm'), k);
});

test('every checks/*.md file follows the domain-file structure and is linked', () => {
  const index = read('SKILL.md') + read('CHECK-CLASSES.md');
  for (const f of fs.readdirSync(path.join(SKILL, 'checks')).filter((n) => n.endsWith('.md'))) {
    const doc = read('checks', f);
    for (const h of ['#### When to use this file', '## Core discipline', '## Universal moves', '## Validation rules']) {
      assert.ok(doc.includes(h), `${f} lacks "${h}"`);
    }
    assert.ok(index.includes(`checks/${f}`), `${f} is not referenced from SKILL.md or CHECK-CLASSES.md`);
  }
});

test('every file in the SKILL.md Files table exists, and every skill file is listed', () => {
  const listed = [...read('SKILL.md').matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
  assert.ok(listed.length > 10);
  for (const f of listed) assert.ok(fs.existsSync(path.join(SKILL, f)), f);
  const onDisk = [
    ...fs.readdirSync(SKILL).filter((n) => n.endsWith('.md') && n !== 'SKILL.md'),
    ...['checks', 'schemas'].flatMap((d) => fs.readdirSync(path.join(SKILL, d)).map((n) => `${d}/${n}`)),
    ...fs.readdirSync(path.join(SKILL, 'scripts')).filter((n) => n.endsWith('.cjs')).map((n) => `scripts/${n}`),
  ];
  for (const f of onDisk) assert.ok(listed.includes(f), `${f} is missing from the SKILL.md Files table`);
});

test('SKILL.md has valid frontmatter', () => {
  const m = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(read('SKILL.md'));
  assert.ok(m, 'frontmatter');
  assert.equal(m[1], 'qa-audit');
  assert.ok(m[2].length <= 1024, 'description must be at most 1024 characters');
});
