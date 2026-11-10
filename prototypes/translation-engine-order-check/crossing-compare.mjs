// Review check: ADR 0018 "gap in one state" rule vs. an exact per-flow rule
// (edge only where one NSG newly denies a flow that the other newly allows).
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2] || new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const { Engine: E } = new Function(grab('engine') + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const ZP = { A: ['a1','a2'], B: ['b1','b2'], C: ['c6'] };
const zoneOf = p => E.ZONES.find(z => ZP[z].includes(p));
const ok = r => !r || r.action === 'allow';
const ctx = (v, w) => { const vs = [v, w], c = vs.map(E.translate);
  return { vs, c, full: [0, 1].map(i => E.stateFor(vs, { A: i, B: i, C: i, members: i }, c)) }; };
const gapRule = (v, w) => {            // as in gap-order.mjs
  const g = x => new Set(E.dominanceGaps(x).map(q => q.flow.join(' ')));
  const go = g(v), gn = g(w), edges = new Set();
  for (const f of new Set([...go, ...gn])) { if (go.has(f) && gn.has(f)) continue;
    const [s, d] = f.split(' ').map(zoneOf); edges.add(gn.has(f) ? s + d : d + s); }
  return edges; };
const exactRule = (v, w, k) => {
  const edges = new Set();
  for (const f of E.FLOWS) { const s = zoneOf(f[0]), d = zoneOf(f[1]); if (!s || !d || s === d) continue;
    const o = E.evalFlow(k.full[0], ...f), n = E.evalFlow(k.full[1], ...f);
    const aD = ok(o.out), bD = ok(o.in), aT = ok(n.out), bT = ok(n.in);
    if (aD && !aT && !bD && bT) edges.add(s + d);   // source closes, destination opens: source first
    if (!aD && aT && bD && !bT) edges.add(d + s);   // source opens, destination closes: destination first
  }
  return edges; };
// states reachable by single NSG writes that respect the edges (a write needs all its predecessors done)
const reach = edges => { const E2 = [...edges].map(e => [e[0], e[1]]), seen = new Set(['']), q = [[]];
  while (q.length) { const S = q.shift();
    for (const z of E.ZONES) { if (S.includes(z)) continue; if (!E2.every(([a, b]) => b !== z || S.includes(a))) continue;
      const T = [...S, z].sort(), key = T.join(''); if (!seen.has(key)) { seen.add(key); q.push(T); } } }
  return [...seen].map(s => s.split('')); };
const opens = (k, S) => { const mix = { members: 0 }; E.ZONES.forEach(z => (mix[z] = S.includes(z) ? 1 : 0));
  const st = E.stateFor(k.vs, mix, k.c);
  return E.FLOWS.some(f => E.evalFlow(st, ...f).allowed && !k.full.some(fs => E.evalFlow(fs, ...f).allowed)); };
const sets = [['tags', { tags: true }], ['inheritIn+postureChange', { inheritIn: true, postureChange: true }],
  ['retire', { retire: true }], ['legacy', { legacy: true }],
  ['all four', { tags: true, inheritIn: true, postureChange: true, retire: true, legacy: true }]];
const seeds = [555, 4242, 99];
console.log('set'.padEnd(26), 'rule '.padEnd(6), 'n'.padStart(6), 'withEdge'.padStart(9), 'unorderable'.padStart(12), 'stillOpens'.padStart(11));
for (const [name, f] of sets) {
  const tot = { gap: [0, 0, 0, 0], exact: [0, 0, 0, 0] }; let falseConflicts = 0;
  for (const seed of seeds) for (const [v, w] of E.sample(f, 4000, seed)) {
    const k = ctx(v, w), res = {};
    for (const [rn, fn] of [['gap', gapRule], ['exact', exactRule]]) {
      const edges = fn(v, w, k), states = reach(edges), t = tot[rn]; t[0]++;
      const orderable = states.some(S => S.length === E.ZONES.length); res[rn] = orderable;
      if (!orderable) { t[2]++; continue; }
      if (edges.size) t[1]++;
      if (states.some(S => opens(k, S))) t[3]++;
    }
    if (!res.gap && res.exact) falseConflicts++;
  }
  for (const rn of ['gap', 'exact']) console.log(name.padEnd(26), rn.padEnd(6), ...tot[rn].map((x, i) => String(x).padStart([6, 9, 12, 11][i])));
  console.log(' '.repeat(26), `unorderable under the gap rule but orderable and safe under the exact rule: ${falseConflicts}`);
}
// A plain case: strict Zone A, Zone B with the inherited inbound default; one Change set removes
// "allow A -> B tcp/443" and adds "allow A -> B tcp/22".
const z = (p, inV) => ({ posture: p, inherit: { inVNet: !!inV, outVNet: false, outInternet: false } });
const zones = { A: z('strict'), B: z('strict', true), C: z('dest') };
const R = (id, svc) => ({ id, src: ['zone:A'], dst: ['zone:B'], svc: [svc], action: 'allow' });
const v = { placement: 'adr0016', zones, asg: { X: [] }, rules: [R(1, 'tcp/443')] };
const w = { placement: 'adr0016', zones, asg: { X: [] }, rules: [R(2, 'tcp/22')] };
const k = ctx(v, w);
console.log('\nplain case (swap one allowed port between a strict Zone A and a Zone B with inherited inbound):');
console.log('  gap rule edges  :', [...gapRule(v, w)].join(', ') || 'none');
console.log('  exact rule edges:', [...exactRule(v, w, k)].join(', ') || 'none');
console.log('  any free order opens traffic both Versions deny:', [[], ['A'], ['B'], ['A', 'B'], ['A','B','C']].some(S => opens(k, S)));
