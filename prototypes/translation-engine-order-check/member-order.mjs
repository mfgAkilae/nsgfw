// PROTOTYPE, throwaway. Checks the member-write classification on top of the gap order:
// 1. member changes that only close under the OLD NSG content, NSGs still old
// 2. NSG writes in gap order, members at the mid state
// 3. the remaining member changes, NSGs new
// Every reachable state (any subset of the member writes inside a step, any edge-respecting NSG subset) is checked.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const { Engine: E, SCENARIOS } = new Function(grab('engine') + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const ZP = { A: ['a1','a2'], B: ['b1','b2'], C: ['c6'] };
const zoneOf = p => E.ZONES.find(z => ZP[z].includes(p)) || null;
const allowedSet = st => new Set(E.FLOWS.filter(f => E.evalFlow(st, ...f).allowed).map(f => f.join(' ')));
const st = (c, S, members) => { const nsg = {}; E.ZONES.forEach(z => (nsg[z] = (S.includes(z) ? c[1] : c[0])[z])); return { nsg, members }; };
const toggle = (m, p) => ({ X: m.X.includes(p) ? m.X.filter(x => x !== p) : [...m.X, p] });
const applyAll = (m, ps) => ps.reduce(toggle, m);
const subsets = a => a.reduce((acc, x) => acc.concat(acc.map(s => [...s, x])), [[]]);
function gapFlows(content, members) {
  const s = { nsg: content, members }, g = new Set();
  for (const f of E.FLOWS) { const zs = zoneOf(f[0]), zd = zoneOf(f[1]); if (!zs || !zd || zs === zd) continue;
    const r = E.evalFlow(s, ...f); if (r.in.action === 'allow' && r.out.action === 'deny') g.add(f.join(' ')); }
  return g;
}
function check(v, w) {
  const c = [E.translate(v), E.translate(w)];
  const okSet = new Set([...allowedSet(st(c, [], v.asg)), ...allowedSet(st(c, E.ZONES, w.asg))]);
  const changes = ['a1','a2','b1','b2','c6'].filter(p => v.asg.X.includes(p) !== w.asg.X.includes(p));
  const oldAllowed = allowedSet(st(c, [], v.asg));
  const closing = changes.filter(p => [...allowedSet(st(c, [], toggle(v.asg, p)))].every(f => oldAllowed.has(f)));
  const opening = changes.filter(p => !closing.includes(p));
  const newAllowed = allowedSet(st(c, E.ZONES, w.asg));
  // the rest must only open under the NEW content: undoing one of them from the new state only removes flows
  if (opening.some(p => [...allowedSet(st(c, E.ZONES, toggle(w.asg, p)))].some(f => !newAllowed.has(f)))) return 'unclassifiable';
  const mid = applyAll(v.asg, closing);
  const go = gapFlows(c[0], mid), gn = gapFlows(c[1], mid), edges = new Set();
  for (const f of new Set([...go, ...gn])) { if (go.has(f) && gn.has(f)) continue;
    const [s, d] = f.split(' ').map(zoneOf); edges.add(gn.has(f) ? s + d : d + s); }
  for (const e of edges) if (edges.has(e[1] + e[0])) return 'conflict';
  const nsgStates = subsets(E.ZONES).filter(S => [...edges].every(e => !S.includes(e[1]) || S.includes(e[0])));
  const states = [
    ...subsets(closing).map(ps => st(c, [], applyAll(v.asg, ps))),
    ...nsgStates.map(S => st(c, S, mid)),
    ...subsets(opening).map(ps => st(c, E.ZONES, applyAll(mid, ps))) ];
  return states.some(s => [...allowedSet(s)].some(f => !okSet.has(f))) ? 'opens' : 'safe';
}
for (const [name, f] of [['asgChange', { asgChange: true }], ['asgChange+everything', { asgChange: true, tags: true, inheritIn: true, postureChange: true, retire: true, legacy: true }]]) {
  const n = { safe: 0, opens: 0, conflict: 0, unclassifiable: 0 }; let ex = null;
  for (const [v, w] of E.sample(f, 4000, Number(process.argv[2] || 909))) { const r = check(v, w); n[r]++; if (r === 'opens' && !ex) ex = [v, w]; }
  console.log(name.padEnd(22), JSON.stringify(n));
  if (ex) console.log('  first opening example:', JSON.stringify(ex).slice(0, 600));
}
console.log('example 7:', check(...SCENARIOS.find(s => s.key === 'asg').versions));
