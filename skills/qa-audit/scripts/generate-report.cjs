#!/usr/bin/env node
'use strict';
// Generates REPORT.md, FINDINGS-DETAIL.md, NEEDS-VALIDATION.md, COVERAGE.md and SUGGESTIONS.md
// from findings.json + coverage-ledger.json (+ optional run.json). Zero dependencies.
// Usage: node generate-report.cjs <run-dir>

const fs = require('fs');
const path = require('path');
const { validateLedger } = require('./validate-coverage-ledger.cjs');
const { validateFindings } = require('./validate-findings.cjs');

const SEV_ORDER = { S1: 1, S2: 2, S3: 3, S4: 4 };
const SUMMARY_START = '<!-- summary:start -->';
const SUMMARY_END = '<!-- summary:end -->';

const isProven = (f) => f.verdict === 'confirmed' || f.verdict === 'flaky';
const isOpen = (f) => isProven(f) && (!f.fix || f.fix.verdict !== 'fixed');
const bySeverity = (a, b) => (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9) || a.id.localeCompare(b.id);
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function computeVerdict(findingsDoc, ledger) {
  const findings = findingsDoc.findings;
  const units = new Map(ledger.units.map((u) => [u.id, u]));
  const isP0 = (f) => (units.get(f.unit) || {}).priority === 'P0';
  const open = findings.filter(isOpen);
  const p0Units = ledger.units.filter((u) => u.priority === 'P0');

  const stop = [];
  for (const f of open.filter((f) => f.severity === 'S1')) stop.push(`Open S1 ${f.id}: ${f.title}`);
  for (const f of open.filter((f) => f.severity === 'S2' && isP0(f))) stop.push(`Open S2 on P0 unit ${f.unit} — ${f.id}: ${f.title}`);
  for (const u of p0Units.filter((u) => u.status === 'blocked' || u.status === 'pending')) stop.push(`P0 unit ${u.id} (${u.target}) is ${u.status}`);
  for (const f of findings.filter((f) => f.fix && f.fix.verdict === 'regressed')) stop.push(`Fix for ${f.id} regressed`);
  if (stop.length) return { verdict: "Don't ship", reasons: stop };

  const caveats = [];
  for (const f of open.filter((f) => f.severity === 'S2' || f.severity === 'S3')) caveats.push(`Open ${f.severity} ${f.id}: ${f.title}`);
  for (const f of open.filter((f) => f.verdict === 'flaky' && SEV_ORDER[f.severity] <= 2 && !caveats.some((c) => c.includes(f.id)))) {
    caveats.push(`Flaky ${f.severity} ${f.id}: ${f.title}`);
  }
  for (const u of p0Units.filter((u) => u.status === 'partial')) caveats.push(`P0 unit ${u.id} (${u.target}) only partially covered`);
  for (const f of findings.filter((f) => f.verdict === 'needs_validation' && isP0(f))) caveats.push(`Unresolved lead on P0 unit ${f.unit} — ${f.id}: ${f.blocking_fact}`);
  if (caveats.length) return { verdict: 'Ship with known issues', reasons: caveats };
  return { verdict: 'Ship', reasons: ['No open S1/S2-on-P0, all P0 units covered, no regressed fixes'] };
}

function table(headers, rows) {
  if (!rows.length) return '_None._\n';
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') + '\n';
}

function renderReport(findingsDoc, ledger, run, previousReport) {
  const { verdict, reasons } = computeVerdict(findingsDoc, ledger);
  const f = findingsDoc.findings;
  const proven = f.filter(isProven);
  const fixed = proven.filter((x) => x.fix && x.fix.verdict === 'fixed');
  const open = f.filter(isOpen).sort(bySeverity);
  const count = (pred) => f.filter(pred).length;
  const sevRow = (s) => [s, proven.filter((x) => x.severity === s).length, fixed.filter((x) => x.severity === s).length, open.filter((x) => x.severity === s).length];
  const units = ledger.units;
  const ustat = (s) => units.filter((u) => u.status === s).length;

  let summary = `${SUMMARY_START}\n_Add a 3–6 sentence plain-language summary here (see REPORTING.md §7.3)._\n${SUMMARY_END}`;
  if (previousReport && previousReport.includes(SUMMARY_START) && previousReport.includes(SUMMARY_END)) {
    summary = previousReport.slice(previousReport.indexOf(SUMMARY_START), previousReport.indexOf(SUMMARY_END) + SUMMARY_END.length);
  }

  const gaps = units.filter((u) => u.status !== 'covered').sort((a, b) => a.priority.localeCompare(b.priority));
  const lines = [
    `# QA audit report — ${run.repo || 'target'} (run ${findingsDoc.run})`,
    '',
    `**Build:** \`${findingsDoc.build}\`  `,
    run.target ? `**Target:** ${run.target}  ` : null,
    run.mode ? `**Mode:** ${run.mode}${run.separation === 'sequential' ? ' (sequential roles — weaker separation)' : ''}  ` : null,
    '',
    `## Release verdict: ${verdict}`,
    '',
    ...reasons.map((r) => `- ${r}`),
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Findings',
    '',
    table(['Severity', 'Found', 'Fixed', 'Open'], ['S1', 'S2', 'S3', 'S4'].map(sevRow)),
    `Verdicts: ${count((x) => x.verdict === 'confirmed')} confirmed, ${count((x) => x.verdict === 'flaky')} flaky, ` +
      `${count((x) => x.verdict === 'needs_validation')} needs validation, ${count((x) => x.verdict === 'rejected')} rejected.`,
    '',
    '### Open issues',
    '',
    table(['ID', 'Sev', 'Verdict', 'Unit', 'Title', 'Fix status'], open.map((x) => [x.id, x.severity, x.verdict, x.unit, x.title, x.fix ? x.fix.verdict : 'not attempted'])),
    '### Fixed',
    '',
    table(['ID', 'Sev', 'Title', 'Commit', 'Regression test'], fixed.sort(bySeverity).map((x) => [x.id, x.severity, x.title, x.fix.commit, x.fix.test_file])),
    `**Regression tests added:** ${fixed.length}${run.branch ? ` on branch \`${run.branch}\`` : ''}`,
    '',
    '## Coverage',
    '',
    `${units.length} units: ${ustat('covered')} covered, ${ustat('partial')} partial, ${ustat('blocked')} blocked, ${ustat('pending')} not tested. See COVERAGE.md.`,
    '',
    '## Next run focus',
    '',
    ...(gaps.length ? gaps.slice(0, 8).map((u) => `- ${u.id} [${u.priority}] ${u.target} — ${u.status}${u.blocked_reason ? ` (${u.blocked_reason})` : ''}`) : ['- Re-run full audit after the next significant release; repeated runs find more.']),
    '',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

function renderDetail(findingsDoc) {
  const proven = findingsDoc.findings.filter(isProven).sort(bySeverity);
  const out = [`# Findings detail (run ${findingsDoc.run})`, ''];
  if (!proven.length) out.push('_No confirmed or flaky findings._', '');
  for (const f of proven) {
    out.push(`## ${f.id} [${f.severity}] ${f.title}`, '');
    out.push(`- **Verdict:** ${f.verdict} (${f.repro_rate})`, `- **Unit:** ${f.unit}`);
    if (f.environment) out.push(`- **Environment:** ${Object.entries(f.environment).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    out.push(`- **Impact:** ${f.impact}`, `- **Likelihood:** ${f.likelihood}`, '');
    out.push('**Minimal repro**', '', ...f.minimal_repro.map((s, i) => `${i + 1}. ${s}`), '');
    out.push(`**Expected:** ${f.expected}  `, `_Source: ${f.expected_source}_`, '', `**Observed:** ${f.observed}`, '');
    if (f.root_cause_hypothesis) out.push(`**Root cause (hypothesis):** \`${f.root_cause_hypothesis.location}\` — ${f.root_cause_hypothesis.reasoning}`, '');
    out.push(`**Evidence:** ${f.evidence.map((e) => `\`${e}\``).join(', ')}`, '');
    if (f.fix) {
      out.push(`**Fix:** ${f.fix.verdict}${f.fix.commit ? ` in \`${f.fix.commit}\`` : ''}${f.fix.test_file ? `, test \`${f.fix.test_file}\`` : ''}${f.fix.rounds ? `, ${f.fix.rounds} round(s)` : ''}`);
      if (f.fix.notes) out.push(`  ${f.fix.notes}`);
      out.push('');
    }
    if (f.notes) out.push(`_Notes: ${f.notes}_`, '');
  }
  return out.join('\n');
}

function renderNeedsValidation(findingsDoc) {
  const nv = findingsDoc.findings.filter((f) => f.verdict === 'needs_validation');
  const sec = nv.filter((f) => f.security_referral);
  const rest = nv.filter((f) => !f.security_referral);
  return [
    `# Needs validation (run ${findingsDoc.run})`, '',
    'Leads grounded in evidence but blocked by one unresolved fact. Severity is not assigned until resolved.', '',
    '## Security referrals', '',
    'Observed by QA and **not probed**. Route these to a dedicated security review.', '',
    table(['ID', 'Unit', 'Title', 'Observed'], sec.map((f) => [f.id, f.unit, f.title, f.observed || ''])),
    '## Blocked leads', '',
    table(['ID', 'Unit', 'Title', 'Blocking fact'], rest.map((f) => [f.id, f.unit, f.title, f.blocking_fact])),
  ].join('\n');
}

function renderCoverage(ledger) {
  const units = [...ledger.units].sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
  const areas = [...new Set(units.map((u) => u.area))].sort();
  const classRows = areas.map((area) => {
    const au = units.filter((u) => u.area === area);
    const assigned = new Set(au.flatMap((u) => u.check_classes));
    const done = new Set(au.flatMap((u) => u.checks_performed.filter((c) => c.evidence.length && c.result !== 'blocked').map((c) => c.class)));
    const missing = [...assigned].filter((c) => !done.has(c));
    return [area, au.length, [...done].sort().join(', ') || '—', missing.sort().join(', ') || '—'];
  });
  const gaps = units.filter((u) => u.status !== 'covered');
  return [
    `# Coverage (run ${ledger.run}, build \`${ledger.build}\`)`, '',
    '"Not tested" means not tested — it is not evidence that something works.', '',
    '## P0 journeys', '',
    table(['Journey', 'Unit', 'Status'], ledger.p0_journeys.map((j) => [j.name, j.unit, (ledger.units.find((u) => u.id === j.unit) || {}).status || '?'])),
    '## Gaps', '',
    table(['Unit', 'Priority', 'Target', 'Status', 'Reason / notes'], gaps.map((u) => [u.id, u.priority, u.target, u.status, u.blocked_reason || u.notes || ''])),
    '## Check classes by area', '',
    table(['Area', 'Units', 'Exercised', 'Assigned but not exercised'], classRows),
    '## All units', '',
    table(['Unit', 'Priority', 'Kind', 'Target', 'Status', 'Checks'], units.map((u) => [u.id, u.priority, u.kind, u.target, u.status, u.checks_performed.length])),
  ].join('\n');
}

function renderSuggestions(findingsDoc) {
  const s = findingsDoc.suggestions || [];
  return [`# Suggestions (run ${findingsDoc.run})`, '', 'Improvements without a sourced expectation. Not bugs; never auto-fixed.', '',
    table(['Unit', 'Suggestion'], s.map((x) => [x.unit || '—', x.text]))].join('\n');
}

function generate(runDir) {
  const read = (n, optional) => {
    const p = path.join(runDir, n);
    if (!fs.existsSync(p)) { if (optional) return null; throw new Error(`Missing ${p}`); }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  const ledger = read('coverage-ledger.json');
  const findingsDoc = read('findings.json');
  const run = read('run.json', true) || {};
  const errors = [...validateLedger(ledger).map((e) => `ledger ${e}`), ...validateFindings(findingsDoc, ledger).map((e) => `findings ${e}`)];
  if (errors.length) { const e = new Error(`Records invalid — fix before reporting:\n- ${errors.join('\n- ')}`); e.code = 'INVALID'; throw e; }

  const reportPath = path.join(runDir, 'REPORT.md');
  const previous = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  const files = {
    'REPORT.md': renderReport(findingsDoc, ledger, run, previous),
    'FINDINGS-DETAIL.md': renderDetail(findingsDoc),
    'NEEDS-VALIDATION.md': renderNeedsValidation(findingsDoc),
    'COVERAGE.md': renderCoverage(ledger),
    'SUGGESTIONS.md': renderSuggestions(findingsDoc),
  };
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(runDir, name), body.endsWith('\n') ? body : body + '\n');
  return { verdict: computeVerdict(findingsDoc, ledger), files: Object.keys(files) };
}

module.exports = { computeVerdict, generate, isOpen };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: generate-report.cjs <run-dir>'); process.exit(2); }
  try {
    const { verdict, files } = generate(dir);
    console.log(`✓ wrote ${files.join(', ')}\nRelease verdict: ${verdict.verdict}`);
  } catch (e) {
    console.error(e.message);
    process.exit(e.code === 'INVALID' ? 1 : 2);
  }
}
