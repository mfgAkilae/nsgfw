// PROTOTYPE, throwaway. Runs every worked example in node and checks it against the decisions it encodes.
// Usage: node run.mjs [example-key] [--verbose]
import { readFileSync } from 'node:fs';
const load = f => new Function(readFileSync(new URL('./' + f, import.meta.url), 'utf8'))();
load('engine.js'); load('examples.js');
const { EX, derive } = globalThis.Examples;
const only = process.argv.slice(2).find(a => !a.startsWith('--')), verbose = process.argv.includes('--verbose');
let fail = 0, n = 0;
for (const ex of EX) {
  if (only && ex.key !== only) continue;
  const S = { inst: null, committed: null };
  ex.steps.forEach((st, i) => {
    let D, err;
    const t0 = Date.now();
    try { st.run(S); D = derive(S); if (st.panel) st.panel(S, D); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    for (const [label, fn] of st.checks || []) {
      n++; let ok = false; try { ok = !err && fn(S, D); } catch (e) { err = err || e; }
      if (!ok) fail++;
      if (!ok || verbose) console.log(`${ok ? 'ok  ' : 'FAIL'} ${ex.group} / ${ex.title} / ${i + 1}. ${st.label}: ${label}${err ? '  [' + err.message + ']' : ''}`);
    }
    if (err && !(st.checks || []).length) { fail++; console.log(`FAIL ${ex.title} / ${st.label}: ${err.stack}`); }
    if (ms > 1500) console.log(`slow ${ex.title} / ${st.label}: ${ms} ms`);
    if (verbose && D && D.plan) console.log('     plan:', D.plan.levels && D.plan.levels.map(l => l.join(' | ')).join('  →  '), D.plan.errors.map(e => e.text).join(' / '));
  });
}
console.log(`\n${n - fail} of ${n} checks as expected.`);
process.exit(fail ? 1 : 0);
