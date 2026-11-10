// PROTOTYPE, throwaway. Checks the "gap order" rule: free write order, except a dependency edge per
// (source Zone, destination Zone) pair with a dominance gap: gap only in new -> source first,
// gap only in old -> destination first, gap in both or a cycle -> not orderable.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./order-check.html', import.meta.url), 'utf8');
const grab = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const { Engine: E, SCENARIOS } = new Function(grab('engine') + grab('scenarios') + '; return { Engine, SCENARIOS };')();
const zoneOf = p => E.ZONES.find(z => ({ A: ['a1','a2'], B: ['b1','b2'], C: ['c6'] })[z].includes(p));
const gapFlows = v => new Set(E.dominanceGaps(v).map(g => g.flow.join(' ')));
// Per flow: gap only in new -> source first; only in old -> destination first; in both -> both sources deny, no edge.
function plan(v, w) {
  const go = gapFlows(v), gn = gapFlows(w), edges = new Set();
  for (const f of new Set([...go, ...gn])) {
    if (go.has(f) && gn.has(f)) continue;
    const [s, d] = f.split(' ').map(zoneOf);
    edges.add(gn.has(f) ? s + d : d + s);
  }
  for (const e of edges) if (edges.has(e[1] + e[0])) return { orderable: false, why: 'conflicting edges ' + e };
  return { orderable: true, edges: [...edges].map(e => [e[0], e[1]]) };
}
// all write states reachable when edges are respected: subsets S closed under predecessors
function reachable(edges) {
  const out = [];
  for (let m = 0; m < 8; m++) {
    const S = E.ZONES.filter((z, i) => m & (1 << i));
    if (edges.every(([a, b]) => !S.includes(b) || S.includes(a))) out.push(S);
  }
  return out;
}
function opens(v, w, S) {
  const vs = [v, w], mix = { members: 0 }; E.ZONES.forEach(z => (mix[z] = S.includes(z) ? 1 : 0));
  const c = vs.map(E.translate), st = E.stateFor(vs, mix, c);
  const full = [0, 1].map(i => E.stateFor(vs, { A: i, B: i, C: i, members: i }, c));
  return E.FLOWS.some(f => E.evalFlow(st, ...f).allowed && !full.some(fs => E.evalFlow(fs, ...f).allowed));
}
const sample = (f, trials, seed) => E.sample(f, trials, seed);
const sets = [['tags', { tags: true }], ['inheritIn+postureChange', { inheritIn: true, postureChange: true }],
  ['retire', { retire: true }], ['legacy', { legacy: true }], ['all four', { tags: true, inheritIn: true, postureChange: true, retire: true, legacy: true }]];
for (const [name, f] of sets) {
  let n = 0, unord = 0, cyc = 0, bad = 0, ordered = 0;
  for (const [v, w] of sample(f, 4000, 555)) {
    n++; const p = plan(v, w);
    if (!p.orderable) { unord++; continue; }
    const states = reachable(p.edges);
    if (!states.some(S => S.length === 3)) { cyc++; continue; }
    if (p.edges.length) ordered++;
    if (states.some(S => opens(v, w, S))) bad++;
  }
  console.log(`${name.padEnd(26)} Change sets ${n}  needing an edge ${ordered}  conflicting ${unord}  cyclic ${cyc}  still opening ${bad}`);
}
for (const sc of SCENARIOS.filter(s => s.key !== 'asg')) {
  const [v, w] = sc.versions, p = plan(v, w);
  const res = !p.orderable ? p.why : (reachable(p.edges).some(S => opens(v, w, S)) ? 'STILL OPENS' : 'safe with edges ' + JSON.stringify(p.edges));
  console.log(`  ${sc.title}: ${res}`);
}
