// Review check, part 3: the three member steps of ADR 0018 with edges from the exact rule
// (same classification and state enumeration as member-order.mjs).
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2] || new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const { Engine: E, SCENARIOS } = new Function(grab('engine') + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const ZP = { A: ['a1','a2'], B: ['b1','b2'], C: ['c6'] };
const zoneOf = p => E.ZONES.find(z => ZP[z].includes(p)) || null;
const ok = r => !r || r.action === 'allow';
const allowedSet = st => new Set(E.FLOWS.filter(f => E.evalFlow(st, ...f).allowed).map(f => f.join(' ')));
const st = (c, S, members) => { const nsg = {}; E.ZONES.forEach(z => (nsg[z] = (S.includes(z) ? c[1] : c[0])[z])); return { nsg, members }; };
const toggle = (m, p) => ({ X: m.X.includes(p) ? m.X.filter(x => x !== p) : [...m.X, p] });
const applyAll = (m, ps) => ps.reduce(toggle, m);
const subsets = a => a.reduce((acc, x) => acc.concat(acc.map(s => [...s, x])), [[]]);
const reach = edges => { const E2 = [...edges].map(e => [e[0], e[1]]), seen = new Set(['']), q = [[]];
  while (q.length) { const S = q.shift();
    for (const z of E.ZONES) { if (S.includes(z)) continue; if (!E2.every(([a, b]) => b !== z || S.includes(a))) continue;
      const T = [...S, z].sort(), key = T.join(''); if (!seen.has(key)) { seen.add(key); q.push(T); } } }
  return [...seen].map(s => s.split('')); };
function check(v, w) {
  const c = [E.translate(v), E.translate(w)];
  const okSet = new Set([...allowedSet(st(c, [], v.asg)), ...allowedSet(st(c, E.ZONES, w.asg))]);
  const changes = ['a1','a2','b1','b2','c6'].filter(p => v.asg.X.includes(p) !== w.asg.X.includes(p));
  const oldAllowed = allowedSet(st(c, [], v.asg));
  const closing = changes.filter(p => [...allowedSet(st(c, [], toggle(v.asg, p)))].every(f => oldAllowed.has(f)));
  const opening = changes.filter(p => !closing.includes(p));
  const newAllowed = allowedSet(st(c, E.ZONES, w.asg));
  if (opening.some(p => [...allowedSet(st(c, E.ZONES, toggle(w.asg, p)))].some(f => !newAllowed.has(f)))) return 'unclassifiable';
  const mid = applyAll(v.asg, closing), sOld = st(c, [], mid), sNew = st(c, E.ZONES, mid), edges = new Set();
  for (const f of E.FLOWS) { const s = zoneOf(f[0]), d = zoneOf(f[1]); if (!s || !d || s === d) continue;
    const o = E.evalFlow(sOld, ...f), n = E.evalFlow(sNew, ...f), aD = ok(o.out), aT = ok(n.out), bD = ok(o.in), bT = ok(n.in);
    if (aD && !aT && !bD && bT) edges.add(s + d); if (!aD && aT && bD && !bT) edges.add(d + s); }
  const nsgStates = reach(edges);
  if (!nsgStates.some(S => S.length === E.ZONES.length)) return 'conflict';
  const states = [ ...subsets(closing).map(ps => st(c, [], applyAll(v.asg, ps))), ...nsgStates.map(S => st(c, S, mid)),
    ...subsets(opening).map(ps => st(c, E.ZONES, applyAll(mid, ps))) ];
  return states.some(s => [...allowedSet(s)].some(f => !okSet.has(f))) ? 'opens' : 'safe';
}
for (const [name, f] of [['asgChange', { asgChange: true }], ['asgChange+everything', { asgChange: true, tags: true, inheritIn: true, postureChange: true, retire: true, legacy: true }]]) {
  const n = { safe: 0, opens: 0, conflict: 0, unclassifiable: 0 };
  for (const seed of [909, 1717]) for (const [v, w] of E.sample(f, 4000, seed)) n[check(v, w)]++;
  console.log(name.padEnd(22), JSON.stringify(n));
}
console.log('example 7:', check(...SCENARIOS.find(s => s.key === 'asg').versions));
