// PROTOTYPE, throwaway. Runs the engine and scenarios from order-check.html in node.
// Usage: node check.mjs [trials]
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const { Engine: E, SCENARIOS } = new Function(grab('engine') + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const trials = Number(process.argv[2] || 5000);

console.log('Worked examples (every mix, every flow):');
let ok = true;
for (const sc of SCENARIOS) {
  const bad = E.checkMixes(sc.versions);
  const gaps = sc.versions.map(v => (Object.values(v.zones).some(z => z.legacy) ? 'legacy' : E.dominanceGaps(v).length));
  const pass = sc.safe ? bad.length === 0 : bad.length > 0;
  ok &&= pass;
  const ex = bad[0] ? ` e.g. ${bad[0].flow.join(' ')} with ${JSON.stringify(bad[0].mix)}` : '';
  console.log(`  ${pass ? 'as expected' : 'UNEXPECTED '} ${sc.title}: ${bad.length} opening (flow,mix) pairs; dominance gaps per Version ${gaps.join('/')}${ex}`);
}
const sets = [
  ['baseline', {}], ['postureChange', { postureChange: true }], ['tags', { tags: true }],
  ['inheritIn', { inheritIn: true }], ['inheritIn+postureChange', { inheritIn: true, postureChange: true }],
  ['retire', { retire: true }], ['asgChange', { asgChange: true }], ['legacy', { legacy: true }],
  ['control: ADR 0004 placement', { adr0004: true }],
];
console.log(`\nRandom Change sets (${trials} each):`);
for (const [name, f] of sets) {
  const r = E.randomCheck(f, trials, 4242);
  console.log(`  ${name.padEnd(28)} opening: ${String(r.changeSetsThatOpen).padStart(5)}   Versions w/o dominance: ${r.versionsWithGaps}`);
}
const r3 = E.randomCheck({ postureChange: true }, Math.round(trials / 3), 99, 3);
console.log(`  ${'3 Versions, postureChange'.padEnd(28)} opening: ${String(r3.changeSetsThatOpen).padStart(5)}   Versions w/o dominance: ${r3.versionsWithGaps}`);
process.exit(ok ? 0 : 1);
