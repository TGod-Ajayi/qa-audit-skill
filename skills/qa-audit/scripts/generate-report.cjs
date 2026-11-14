#!/usr/bin/env node
'use strict';
// Generates REPORT.md, FINDINGS-DETAIL.md, NEEDS-VALIDATION.md, COVERAGE.md and SUGGESTIONS.md
// from run.json, coverage-ledger.json and findings.json. Every input is validated
// first; the generator refuses to report from invalid records. Zero dependencies.
//
// Usage: node generate-report.cjs <run-dir>
// Exit codes: 0 written, 1 invalid records, 2 unreadable input or usage error.

const fs = require('fs');
const path = require('path');
const { readJsonFile } = require('./lib/common.cjs');
const { validateLedger } = require('./validate-coverage-ledger.cjs');
const { validateFindings, revertCheckErrors } = require('./validate-findings.cjs');
const { validateRun, isPartialRun } = require('./validate-run.cjs');
const { readStamp, recordDriftReasons, STAMP_FILE } = require('./lib/stamp.cjs');

const SEV_ORDER = { S1: 1, S2: 2, S3: 3, S4: 4 };
const SUMMARY_START = '<!-- summary:start -->';
const SUMMARY_END = '<!-- summary:end -->';

const isProven = (f) => f.verdict === 'confirmed' || f.verdict === 'flaky';
const isOpen = (f) => isProven(f) && (!f.fix || f.fix.verdict !== 'fixed');
const bySeverity = (a, b) => (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9) || a.id.localeCompare(b.id);
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function computeVerdict(findingsDoc, ledger, run = null) {
  const findings = findingsDoc.findings;
  const units = new Map(ledger.units.map((u) => [u.id, u]));
  const isP0 = (f) => (units.get(f.unit) || {}).priority === 'P0';
  const open = findings.filter(isOpen);
  const p0Units = ledger.units.filter((u) => u.priority === 'P0');

  const stop = [];
  for (const f of open.filter((f) => f.severity === 'S1')) stop.push(`Open S1 ${f.id}: ${f.title}`);
  for (const f of open.filter((f) => f.severity === 'S2' && isP0(f))) stop.push(`Open S2 on P0 unit ${f.unit} — ${f.id}: ${f.title}`);
  for (const u of p0Units.filter((u) => u.status === 'blocked' || u.status === 'pending')) stop.push(`P0 unit ${u.id} (${u.target}) is ${u.status}`);
  for (const f of open.filter((f) => f.check_class === 'security' && f.severity === 'S2')) stop.push(`Open security S2 ${f.id}: ${f.title}`);
  for (const f of findings.filter((f) => f.fix && f.fix.verdict === 'regressed')) stop.push(`Fix for ${f.id} regressed`);
  if (stop.length) return { verdict: "Don't ship", reasons: stop };

  const caveats = [];
  if (run && run.dirty) caveats.push('The audited build had uncommitted changes, so no commit fully describes what was tested');
  if (run && run.run_status === 'incomplete') caveats.push(`Run incomplete (${run.incomplete_reason}); untested areas carry unknown risk`);
  if (run && isPartialRun(run)) caveats.push(`Partial run (${run.mode}/${run.profile}${run.scope.length ? `, scope: ${run.scope.join(', ')}` : ''}); this verdict covers only what was in scope`);
  for (const f of findings.filter((f) => f.verdict === 'needs_validation' && f.security_referral)) caveats.push(`Security referral ${f.id} not yet reviewed: ${f.title}`);
  for (const f of open.filter((f) => f.severity === 'S2' || f.severity === 'S3')) caveats.push(`Open ${f.severity} ${f.id}: ${f.title}`);
  for (const f of open.filter((f) => f.verdict === 'flaky' && SEV_ORDER[f.severity] <= 2 && !caveats.some((c) => c.includes(f.id)))) {
    caveats.push(`Flaky ${f.severity} ${f.id}: ${f.title}`);
  }
  for (const u of p0Units.filter((u) => u.status === 'partial')) caveats.push(`P0 unit ${u.id} (${u.target}) only partially covered`);
  for (const f of findings.filter((f) => f.verdict === 'needs_validation' && !f.security_referral && isP0(f))) caveats.push(`Unresolved lead on P0 unit ${f.unit} — ${f.id}: ${f.blocking_fact}`);
  if (caveats.length) return { verdict: 'Ship with known issues', reasons: caveats };
  return { verdict: 'Ship', reasons: ['No open S1/S2-on-P0, all P0 units covered, no regressed fixes'] };
}

function table(headers, rows) {
  if (!rows.length) return '_None._\n';
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') + '\n';
}

function stampLines(stampInfo) {
  if (!stampInfo || stampInfo.state === 'none') {
    return ['> **Unstamped:** this verdict is not yet tied to a verified commit. Run `stamp-verdict.cjs stamp` after the regression sweep, and `stamp-verdict.cjs check` before shipping.', ''];
  }
  const st = stampInfo.stamp;
  if (stampInfo.drift.length) {
    return [`> **Stale stamp:** ${stampInfo.drift.join('; ')}. Re-stamp before relying on this verdict.`, ''];
  }
  return [`**Verified build:** \`${st.verified_head.slice(0, 12)}\` (tree \`${st.verified_tree.slice(0, 12)}\`)${st.branch ? ` on \`${st.branch}\`` : ''}, stamped ${st.stamped_at}` +
    `${st.accepted_commits.length ? `, with ${st.accepted_commits.length} accepted non-fix commit(s)` : ''}. Any later edit invalidates it: run \`stamp-verdict.cjs check\` before shipping.  `];
}

function renderReport(findingsDoc, ledger, run, previousReport, stampInfo) {
  const { verdict, reasons } = computeVerdict(findingsDoc, ledger, run);
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

  const gaps = units.filter((u) => u.status !== 'covered' && u.status !== 'out_of_scope')
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
  const classes = [...new Set(proven.map((x) => x.check_class))].sort();
  const banner = run.run_status === 'in_progress'
    ? '> **Draft:** the run is still in progress. Numbers will change.'
    : run.run_status === 'incomplete' ? `> **Incomplete run:** ${run.incomplete_reason}. Coverage below is partial.` : null;
  const lines = [
    `# QA audit report — ${run.repo} (run ${findingsDoc.run})`,
    '',
    banner, banner ? '' : null,
    `**Audited build:** \`${findingsDoc.build}\`${run.dirty ? ' (dirty worktree)' : ''}  `,
    ...stampLines(stampInfo),
    `**Target:** ${run.target}${run.environment ? ` (${run.environment})` : ''}  `,
    `**Mode:** ${run.mode}, profile ${run.profile}${run.scope.length ? `, scope ${run.scope.join(', ')}` : ''}${run.separation === 'sequential' ? ' (sequential roles — weaker separation)' : ''}  `,
    run.design_sources.length ? `**Design sources:** ${run.design_sources.join('; ')}  ` : null,
    run.budget !== null ? `**Agent budget:** ${run.agents_used ?? '?'} of ${run.budget} used  ` : null,
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
    '### By check class',
    '',
    table(['Class', 'Found', 'Fixed', 'Open'], classes.map((c) => [c, proven.filter((x) => x.check_class === c).length,
      fixed.filter((x) => x.check_class === c).length, open.filter((x) => x.check_class === c).length])),
    '### Open issues',
    '',
    table(['ID', 'Sev', 'Class', 'Verdict', 'Unit', 'Title', 'Fix status'], open.map((x) => [x.id, x.severity, x.check_class, x.verdict, x.unit, x.title, x.fix ? x.fix.verdict : 'not attempted'])),
    '### Fixed',
    '',
    table(['ID', 'Sev', 'Title', 'Commit', 'Regression test'], fixed.sort(bySeverity).map((x) => [x.id, x.severity, x.title, x.fix.commit, x.fix.test_file])),
    `**Regression tests added:** ${fixed.length}${run.branch ? ` on branch \`${run.branch}\`` : ''}`,
    '',
    '## Coverage',
    '',
    `${units.length} units: ${ustat('covered')} covered, ${ustat('partial')} partial, ${ustat('blocked')} blocked, ${ustat('pending')} not tested, ${ustat('deferred')} deferred, ${ustat('out_of_scope')} out of scope. See COVERAGE.md.`,
    '',
    '## Next run focus',
    '',
    ...f.filter((x) => x.security_referral).map((x) => `- Security review for ${x.id}: ${x.title}`),
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
    out.push(`- **Verdict:** ${f.verdict} (${f.repro_rate})`, `- **Class:** ${f.check_class}`, `- **Unit:** ${f.unit}`,
      `- **Found by:** ${f.found_by}; **reproduced by:** ${f.reproduced_by}`);
    if (f.environment) out.push(`- **Environment:** ${Object.entries(f.environment).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    out.push(`- **Impact:** ${f.impact}`, `- **Likelihood:** ${f.likelihood}`, '');
    out.push('**Minimal repro**', '', ...f.minimal_repro.map((s, i) => `${i + 1}. ${s}`), '');
    out.push(`**Expected:** ${f.expected}  `, `_Source: ${f.expected_source}_`, '', `**Observed:** ${f.observed}`, '');
    if (f.root_cause_hypothesis) out.push(`**Root cause (hypothesis):** \`${f.root_cause_hypothesis.location}\` — ${f.root_cause_hypothesis.reasoning}`, '');
    out.push(`**Evidence:** ${f.evidence.map((e) => `\`${e}\``).join(', ')}`, '');
    if (f.fix) {
      out.push(`**Fix:** ${f.fix.verdict}${f.fix.commit ? ` in \`${f.fix.commit}\`` : ''}${f.fix.test_file ? `, test \`${f.fix.test_file}\`` : ''}${f.fix.rounds ? `, ${f.fix.rounds} round(s)` : ''}` +
        `${f.fix.fixer ? `; fixed by ${f.fix.fixer}, verified by ${f.fix.verifier}` : ''}`);
      if (f.fix.fails_without_fix) out.push(`  Fails without the fix with \`${f.fix.failure_signature}\`; passes with it on every repeated run (checked by \`${f.fix.revert_check}\`)`);
      for (const r of f.fix.repro_after || []) {
        out.push(`  Original repro re-run by ${r.by} on \`${r.commit}\`: ${r.kind === 'browser' ? `${r.browser}${r.viewport ? ` ${r.viewport}` : ''}` : `\`${r.command}\``}, ${r.attempts} attempt(s), ${r.result}: ${r.observed}`);
      }
      if (f.fix.evidence && f.fix.evidence.length) out.push(`  Fix evidence: ${f.fix.evidence.map((e) => `\`${e}\``).join(', ')}`);
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
    'Observed by QA and **not probed**. Route these to a dedicated security review (for example, the security-audit skill).', '',
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
  const gaps = units.filter((u) => u.status !== 'covered' && u.status !== 'out_of_scope');
  const outOfScope = units.filter((u) => u.status === 'out_of_scope');
  return [
    `# Coverage (run ${ledger.run}, build \`${ledger.build}\`)`, '',
    '"Not tested" means not tested — it is not evidence that something works.', '',
    '## P0 journeys', '',
    table(['Journey', 'Unit', 'Status'], ledger.p0_journeys.map((j) => [j.name, j.unit, (ledger.units.find((u) => u.id === j.unit) || {}).status || '?'])),
    '## Gaps', '',
    table(['Unit', 'Priority', 'Target', 'Status', 'Reason / notes'], gaps.map((u) => [u.id, u.priority, u.target, u.status, u.blocked_reason || u.notes || ''])),
    '## Out of scope', '',
    'Deliberately not tested in this run. Not evidence of anything.', '',
    table(['Unit', 'Priority', 'Target', 'Reason'], outOfScope.map((u) => [u.id, u.priority, u.target, u.blocked_reason])),
    '## Check classes by area', '',
    table(['Area', 'Units', 'Exercised', 'Assigned but not exercised'], classRows),
    '## All units', '',
    table(['Unit', 'Priority', 'Kind', 'Target', 'Status', 'Checks'], units.map((u) => [u.id, u.priority, u.kind, u.target, u.status, u.checks_performed.length])),
  ].join('\n');
}

function renderSuggestions(findingsDoc) {
  const s = findingsDoc.suggestions || [];
  return [`# Suggestions (run ${findingsDoc.run})`, '', 'Improvements without a sourced expectation. Not bugs; never auto-fixed.', '',
    table(['Unit', 'Kind', 'Suggestion'], s.map((x) => [x.unit || '—', x.kind || 'other', x.text]))].join('\n');
}

// Reads and fully validates the three records. Throws with code READ or INVALID.
function loadRecords(runDir) {
  const read = (n) => {
    try { return readJsonFile(path.join(runDir, n)); }
    catch (e) { const x = new Error(`${n}: ${e.code === 'INPUT' ? e.message : 'cannot read'}`); x.code = 'READ'; throw x; }
  };
  const run = read('run.json');
  const ledger = read('coverage-ledger.json');
  const findingsDoc = read('findings.json');
  const runErrors = validateRun(run).map((e) => `run.json ${e}`);
  const ledgerErrors = validateLedger(ledger).map((e) => `ledger ${e}`);
  const errors = [...runErrors, ...ledgerErrors];
  // Cross-checks need a structurally valid ledger and run.
  if (!errors.length) errors.push(...validateFindings(findingsDoc, ledger, run).map((e) => `findings ${e}`));
  if (!errors.length) errors.push(...revertCheckErrors(findingsDoc, runDir).map((e) => `findings ${e}`));
  if (!errors.length && ledger.run !== run.run) errors.push('ledger $.run: does not match run.json');
  if (!errors.length && ledger.build !== run.build) errors.push('ledger $.build: does not match run.json');
  if (errors.length) { const e = new Error(`Records invalid — fix before reporting:\n- ${errors.join('\n- ')}`); e.code = 'INVALID'; throw e; }
  return { run, ledger, findingsDoc };
}

function generate(runDir) {
  const { run, ledger, findingsDoc } = loadRecords(runDir);
  const verdict = computeVerdict(findingsDoc, ledger, run);
  let stampInfo;
  try { stampInfo = readStamp(runDir); } catch (e) {
    const x = new Error(`${STAMP_FILE}: ${e.code === 'INPUT' ? e.message : 'cannot read'}`); x.code = 'INVALID'; throw x;
  }
  if (stampInfo.state === 'ok') stampInfo.drift = recordDriftReasons(stampInfo.stamp, runDir, verdict.verdict);

  const reportPath = path.join(runDir, 'REPORT.md');
  let previous = null;
  try { if (fs.lstatSync(reportPath).isFile()) previous = fs.readFileSync(reportPath, 'utf8'); } catch { /* first run */ }
  const files = {
    'REPORT.md': renderReport(findingsDoc, ledger, run, previous, stampInfo),
    'FINDINGS-DETAIL.md': renderDetail(findingsDoc),
    'NEEDS-VALIDATION.md': renderNeedsValidation(findingsDoc),
    'COVERAGE.md': renderCoverage(ledger),
    'SUGGESTIONS.md': renderSuggestions(findingsDoc),
  };
  for (const [name, body] of Object.entries(files)) {
    const out = path.join(runDir, name);
    // Never write through a symlink planted in the run directory.
    let st = null;
    try { st = fs.lstatSync(out); } catch { /* new file */ }
    if (st && !st.isFile()) { const e = new Error(`${name}: refusing to overwrite a non-regular file`); e.code = 'READ'; throw e; }
    fs.writeFileSync(out, body.endsWith('\n') ? body : body + '\n');
  }
  return { verdict, stamp: stampInfo, files: Object.keys(files) };
}

module.exports = { computeVerdict, generate, loadRecords, isOpen };

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
