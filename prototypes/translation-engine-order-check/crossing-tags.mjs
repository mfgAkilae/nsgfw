// Review check, part 2: the exact rule when the engine cannot see what a service tag contains.
// Ground truth for VirtualNetwork is random per Change set. Three ways to compute the edges:
//   assumed : exact rule, engine assumes VirtualNetwork = every internal point (wrong when truth differs)
//   oracle  : exact rule with the true content (not available to a real engine)
//   bothways: exact rule for every case "address inside / outside the tag", per NSG, edges united
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2] || new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const ALL = ['a1','a2','b1','b2','c6','o1'];
globalThis.__TAGS = { VirtualNetwork: ALL.slice(), Internet: ['i1'] };
const engineSrc = grab('engine').replace(/var TAGS = \{[^;]*\};/, 'var TAGS = globalThis.__TAGS;');
if (!engineSrc.includes('globalThis.__TAGS')) throw new Error('could not inject TAGS');
const { Engine: E } = new Function(engineSrc + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const setVN = l => { globalThis.__TAGS.VirtualNetwork = l; };
const ZP = { A: ['a1','a2'], B: ['b1','b2'], C: ['c6'] };
const zoneOf = p => E.ZONES.find(z => ZP[z].includes(p));
const ok = r => !r || r.action === 'allow';
const ctx = (v, w) => { const vs = [v, w], c = vs.map(E.translate);
  return { vs, c, full: [0, 1].map(i => E.stateFor(vs, { A: i, B: i, C: i, members: i }, c)) }; };
const ZFLOWS = E.FLOWS.filter(f => zoneOf(f[0]) && zoneOf(f[1]) && zoneOf(f[0]) !== zoneOf(f[1]));
const cross = (edges, s, d, aD, aT, bD, bT) => { if (aD && !aT && !bD && bT) edges.add(s + d); if (!aD && aT && bD && !bT) edges.add(d + s); };
function exactWith(k, vn) { setVN(vn); const edges = new Set();
  for (const f of ZFLOWS) { const o = E.evalFlow(k.full[0], ...f), n = E.evalFlow(k.full[1], ...f);
    cross(edges, zoneOf(f[0]), zoneOf(f[1]), ok(o.out), ok(n.out), ok(o.in), ok(n.in)); }
  return edges; }
const CASES = [[0, 0], [0, 1], [1, 0], [1, 1]];
function bothWays(k) { const edges = new Set();
  for (const f of ZFLOWS) { const [s, d] = f, as = [], bs = [];
    for (const [x, y] of CASES) { setVN([...(x ? [s] : []), ...(y ? [d] : [])]);
      const o = E.evalFlow(k.full[0], ...f), n = E.evalFlow(k.full[1], ...f);
      as.push([ok(o.out), ok(n.out)]); bs.push([ok(o.in), ok(n.in)]); }
    for (const [aD, aT] of as) for (const [bD, bT] of bs) cross(edges, zoneOf(s), zoneOf(d), aD, aT, bD, bT); }
  return edges; }
const reach = edges => { const E2 = [...edges].map(e => [e[0], e[1]]), seen = new Set(['']), q = [[]];
  while (q.length) { const S = q.shift();
    for (const z of E.ZONES) { if (S.includes(z)) continue; if (!E2.every(([a, b]) => b !== z || S.includes(a))) continue;
      const T = [...S, z].sort(), key = T.join(''); if (!seen.has(key)) { seen.add(key); q.push(T); } } }
  return [...seen].map(s => s.split('')); };
const opens = (k, S) => { const mix = { members: 0 }; E.ZONES.forEach(z => (mix[z] = S.includes(z) ? 1 : 0));
  const st = E.stateFor(k.vs, mix, k.c);
  return E.FLOWS.some(f => E.evalFlow(st, ...f).allowed && !k.full.some(fs => E.evalFlow(fs, ...f).allowed)); };
let seedX = 20261110; const rnd = () => { seedX = (seedX * 1664525 + 1013904223) >>> 0; return seedX / 4294967296; };
const sets = [['tags', { tags: true }], ['inheritIn+postureChange', { inheritIn: true, postureChange: true }], ['legacy', { legacy: true }],
  ['all four', { tags: true, inheritIn: true, postureChange: true, retire: true, legacy: true }]];
console.log('random true content of VirtualNetwork per Change set; 3 seeds x 3000 Change sets per set');
console.log('set'.padEnd(26), 'edges from'.padEnd(10), 'withEdge'.padStart(9), 'unorderable'.padStart(12), 'stillOpens'.padStart(11));
for (const [name, f] of sets) {
  const tot = { assumed: [0, 0, 0], oracle: [0, 0, 0], bothways: [0, 0, 0] };
  for (const seed of [555, 4242, 99]) for (const [v, w] of E.sample(f, 3000, seed)) {
    const k = ctx(v, w), truth = ALL.filter(() => rnd() < 0.5);
    const plans = { assumed: exactWith(k, ALL), oracle: exactWith(k, truth), bothways: bothWays(k) };
    setVN(truth);
    for (const rn of Object.keys(plans)) { const states = reach(plans[rn]), t = tot[rn];
      if (!states.some(S => S.length === E.ZONES.length)) { t[1]++; continue; }
      if (plans[rn].size) t[0]++;
      if (states.some(S => opens(k, S))) t[2]++; }
  }
  for (const rn of Object.keys(tot)) console.log(name.padEnd(26), rn.padEnd(10), ...tot[rn].map((x, i) => String(x).padStart([9, 12, 11][i])));
}
