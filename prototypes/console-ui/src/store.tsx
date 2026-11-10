// PROTOTYPE, throwaway. In-memory Change set state and a mock Preview. No persistence, no real Translation engine.
import { createContext, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { rules as initialRules, Rule, ref, zoneById, envs, Level, me, versions } from './data';

export type CsState = 'Open' | 'Submitted' | 'Approved' | 'Committed';
export interface Edit { seq: number; kind: 'add' | 'edit' | 'move' | 'delete' | 'enable' | 'disable'; ruleId: string; field?: string; before?: string; after?: string; by: string }
export interface St { added?: boolean; deleted?: boolean; moved?: boolean; changed?: Set<string> }
export interface ChangeSet { id: string; name: string; owner: string; state: CsState; base: number; authors: string[]; edits: number; affected: number; rebase?: boolean; emergency?: boolean; scheduled?: string; mine?: boolean }
export type Scenario = 'auto' | 'crossing' | 'unorderable';

export const otherSets: ChangeSet[] = [
  { id: 'cs-2', name: 'Q4 cleanup of expired Rules', owner: 'kim', state: 'Submitted', base: 1288, authors: ['kim'], edits: 41, affected: 63 },
  { id: 'cs-3', name: 'Partner VPN access', owner: 'sam', state: 'Approved', base: 1288, authors: ['sam', 'jo'], edits: 6, affected: 4, scheduled: 'today 22:00' },
  { id: 'cs-4', name: 'Onboard vnet-app0107', owner: 'alex', state: 'Open', base: 1286, authors: ['alex'], edits: 88, affected: 20, rebase: true },
  { id: 'cs-5', name: 'Hotfix: block 203.0.113.0/24', owner: 'sam', state: 'Committed', base: 1287, authors: ['sam'], edits: 1, affected: 1, emergency: true },
];
// Rules that another open Change set also changes ("also changed in Change set X by Y").
export const alsoChanged = new Map<string, { set: string; by: string }>([
  ['R90003', { set: 'Q4 cleanup of expired Rules', by: 'kim' }],
  [initialRules[9].id, { set: 'Q4 cleanup of expired Rules', by: 'kim' }],
  [initialRules[14].id, { set: 'Onboard vnet-app0107', by: 'alex' }],
]);

let nextId = 95000;
const fmt = (v: unknown) => (Array.isArray(v) ? v.map(x => (String(x).startsWith('svc') ? x : ref(String(x)).name)).join(', ') : String(v ?? ''));

function useStoreValue() {
  const base = useRef(new Map(initialRules.map((r, i) => [r.id, { rule: r, pos: i }]))).current;
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [state, setState] = useState<CsState>('Open');
  const [approvedBy, setApprovedBy] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(versions.latest);
  const [scenario, setScenario] = useState<Scenario>('auto');
  const [emergency, setEmergency] = useState<string | null>(null);
  const seq = useRef(0);

  const log = (e: Omit<Edit, 'seq' | 'by'>[]) => { setEdits(x => [...x, ...e.map(i => ({ ...i, seq: ++seq.current, by: me }))]); if (state !== 'Open') setState('Open'); };

  const status = useMemo(() => {
    const m = new Map<string, St>();
    for (const e of edits) {
      const s = m.get(e.ruleId) ?? {};
      if (e.kind === 'add') s.added = true;
      else if (e.kind === 'delete') s.deleted = true;
      else if (e.kind === 'move') s.moved = true;
      else { s.changed = new Set(s.changed); s.changed.add(e.field ?? 'enabled'); }
      m.set(e.ruleId, s);
    }
    return m;
  }, [edits]);

  const numbers = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const r of rules) if (!status.get(r.id)?.deleted) m.set(r.id, ++n); return m; }, [rules, status]);

  const api = {
    rules, edits, status, numbers, base, state, version, scenario, setScenario, approvedBy, emergency,
    editField(id: string, field: keyof Rule, value: unknown) {
      setRules(rs => rs.map(r => {
        if (r.id !== id) return r;
        log([{ kind: 'edit', ruleId: id, field, before: fmt(r[field]), after: fmt(value) }]);
        return { ...r, [field]: value };
      }));
    },
    setEnabled(ids: string[], enabled: boolean) {
      const set = new Set(ids);
      setRules(rs => rs.map(r => (set.has(r.id) && r.enabled !== enabled ? { ...r, enabled } : r)));
      log(ids.map(id => ({ kind: enabled ? 'enable' : 'disable', ruleId: id, field: 'enabled', before: String(!enabled), after: String(enabled) })));
    },
    move(ids: string[], targetId: string | null, where: 'before' | 'after' = 'before') {
      const set = new Set(ids);
      setRules(rs => {
        const moving = rs.filter(r => set.has(r.id));
        const rest = rs.filter(r => !set.has(r.id));
        const ti = targetId ? rest.findIndex(r => r.id === targetId) : -1;
        const at = targetId ? ti + (where === 'after' ? 1 : 0) : where === 'before' ? 0 : rest.length;
        const out = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
        log(moving.map(r => ({ kind: 'move', ruleId: r.id, before: `#${rs.indexOf(r) + 1}`, after: `#${out.indexOf(r) + 1}` })));
        return out;
      });
    },
    clone(ids: string[]) {
      setRules(rs => {
        const out: Rule[] = []; const added: Omit<Edit, 'seq' | 'by'>[] = [];
        for (const r of rs) { out.push(r); if (ids.includes(r.id)) { const c = { ...r, id: `R${++nextId}`, name: `${r.name} (copy)`, hits: null }; out.push(c); added.push({ kind: 'add', ruleId: c.id, after: c.name }); } }
        log(added); return out;
      });
    },
    addRule(afterId?: string) {
      const r: Rule = { id: `R${++nextId}`, name: 'New Rule', src: ['any'], dst: ['any'], svc: ['svc-any'], action: 'deny', enabled: false, comment: '', ticket: '', owner: me, hits: null };
      setRules(rs => { const i = afterId ? rs.findIndex(x => x.id === afterId) + 1 : 0; return [...rs.slice(0, i), r, ...rs.slice(i)]; });
      log([{ kind: 'add', ruleId: r.id, after: r.name }]);
      return r.id;
    },
    remove(ids: string[]) {
      const addedNow = ids.filter(id => status.get(id)?.added);
      if (addedNow.length) { setRules(rs => rs.filter(r => !addedNow.includes(r.id))); setEdits(es => es.filter(e => !addedNow.includes(e.ruleId))); }
      const rest = ids.filter(id => !addedNow.includes(id));
      if (rest.length) log(rest.map(id => ({ kind: 'delete', ruleId: id })));
    },
    discard() { setRules(initialRules); setEdits([]); setState('Open'); setApprovedBy({}); setEmergency(null); },
    submit() { setState('Submitted'); },
    approveAs(who: string, envIds: string[]) { setApprovedBy(a => ({ ...a, ...Object.fromEntries(envIds.map(e => [e, who])) })); },
    commit(reason?: string) { setState('Committed'); setVersion(v => v + 1); if (reason) setEmergency(reason); },
  };
  return api;
}
export type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);
export const StoreProvider = ({ children }: { children: ReactNode }) => <Ctx.Provider value={useStoreValue()}>{children}</Ctx.Provider>;
export const useStore = () => useContext(Ctx)!;

// ---------- Mock Preview: what the Translation engine would write. Shape only; numbers are made up but derived from the edits.
export interface NsgChange { nsg: string; zone: string; env: string; ops: { op: 'create' | 'change' | 'delete'; name: string; dir: 'in' | 'out'; priority: number; rule: string; detail: string }[]; renumbered: number }
export interface Preview {
  nsgs: NsgChange[]; cost: Map<string, { nsgs: number; nsgRules: number }>; affected: { zone: string; env: string; level: Level }[];
  steps: { nsg: string; why: string; waitsFor?: string; holdsBack?: string }[][]; crossing: { from: string; to: string; flow: string; closes: string; opens: string }[];
  unorderable: boolean; policy: { assignment: string; effect: 'deny' | 'audit'; reason: string; rule: string }[];
}
const outside = (ids: string[]) => ids.some(id => { const k = ref(id).kind; return k === 'tag' || k === 'any' || (k === 'cidr' && !ref(id).cov.length); });
export function placement(r: Rule) {
  const cov = (ids: string[]) => [...new Set(ids.flatMap(id => ref(id).cov))];
  const dst = cov(r.dst);
  const src = cov(r.src).filter(z => r.action === 'deny' || zoneById.get(z)!.egress === 'strict' || outside(r.dst));
  const tags = (ids: string[]) => Math.max(1, ids.filter(id => ref(id).kind === 'tag').length);
  const protos = Math.max(1, new Set(r.svc.map(s => (s.includes('dns') ? 2 : 1))).size);
  return { dst, src, perIn: protos * tags(r.src), perOut: protos * tags(r.dst) };
}
export function cost(r: Rule) { const p = placement(r); return { nsgs: new Set([...p.dst, ...p.src]).size, nsgRules: p.dst.length * p.perIn + p.src.length * p.perOut }; }

export function buildPreview(s: Store): Preview {
  const nsgs = new Map<string, NsgChange>();
  const costMap = new Map<string, { nsgs: number; nsgRules: number }>();
  const affected = new Map<string, { zone: string; env: string; level: Level }>();
  const crossing: Preview['crossing'] = [];
  const policy: Preview['policy'] = [];
  const touch = (zid: string) => {
    const z = zoneById.get(zid)!;
    if (!nsgs.has(z.nsg)) nsgs.set(z.nsg, { nsg: z.nsg, zone: z.name, env: z.env, ops: [], renumbered: 0 });
    affected.set(z.id, { zone: z.name, env: z.env, level: envs.find(e => e.id === z.env)!.level });
    return nsgs.get(z.nsg)!;
  };
  for (const [id, st] of s.status) {
    const now = s.rules.find(r => r.id === id); const before = s.base.get(id)?.rule;
    const r = now ?? before; if (!r) continue;
    costMap.set(id, cost(r));
    const p = placement(r); const pos = s.numbers.get(id) ?? 0;
    const op = st.added ? 'create' : st.deleted ? 'delete' : 'change';
    const detail = st.added ? 'new Rule' : st.deleted ? 'Rule deleted' : st.moved && !st.changed ? 'priority' : [...(st.changed ?? [])].join(', ');
    p.dst.slice(0, 40).forEach((z, k) => { const n = touch(z); for (let i = 0; i < p.perIn; i++) n.ops.push({ op, name: `nsgfw-${id}-in-${i + 1}`, dir: 'in', priority: 300 + ((pos * 3 + k) % 370) * 10, rule: id, detail }); if (st.moved) n.renumbered += Math.min(zoneById.get(z)!.rules, 3 + (pos % 17)); });
    p.src.slice(0, 40).forEach((z, k) => { const n = touch(z); for (let i = 0; i < p.perOut; i++) n.ops.push({ op, name: `nsgfw-${id}-out-${i + 1}`, dir: 'out', priority: 300 + ((pos * 5 + k) % 370) * 10, rule: id, detail }); if (st.moved) n.renumbered += Math.min(zoneById.get(z)!.rules, 2 + (pos % 11)); });
    const crossingCandidate = (st.moved || st.changed?.has('action') || st.changed?.has('src') || st.changed?.has('dst')) && p.dst.length && p.src.length;
    const rawSrc = [...new Set(r.src.flatMap(x => ref(x).cov))].filter(z => z !== p.dst[0]);
    const other = p.src[0] ?? rawSrc[0] ?? p.dst[1];
    if ((s.scenario === 'crossing' || s.scenario === 'unorderable' || (s.scenario === 'auto' && crossingCandidate)) && p.dst[0] && other) {
      const a = zoneById.get(other)!, b = zoneById.get(p.dst[0])!;
      touch(a.id); touch(b.id);
      const closesOnDst = r.action === 'deny';
      crossing.push({ from: a.name, to: b.name, flow: `${a.name} → ${b.name} ${r.svc.map(x => x.replace('svc-', '')).join(', ')}`, closes: closesOnDst ? b.nsg : a.nsg, opens: closesOnDst ? a.nsg : b.nsg });
    }
    if (r.policy || (r.src.some(x => x === 'any' || x === 'tag:Internet') && r.svc.some(x => x === 'svc-rdp' || x === 'svc-ssh')))
      policy.push({ assignment: 'Deny management ports from the Internet (landing zone)', effect: 'deny', reason: 'RDP or SSH open from the Internet', rule: id });
  }
  if (nsgs.size && !policy.length) policy.push({ assignment: 'Audit NSG flow logging', effect: 'audit', reason: 'No VNet flow log on 2 VNets', rule: '' });
  let unorderable = s.scenario === 'unorderable';
  if (unorderable && crossing.length < 2 && crossing[0]) crossing.push({ ...crossing[0], from: crossing[0].to, to: crossing[0].from, flow: `${crossing[0].to} → ${crossing[0].from} tcp/1433`, closes: crossing[0].opens, opens: crossing[0].closes });
  if (unorderable && !crossing.length) unorderable = false;
  // ADR 0018: only the NSG that opens a Crossing flow waits, for the NSG that closes it. Everything else goes in any order.
  const opening = new Set(crossing.map(c => c.opens));
  const all = [...nsgs.keys()];
  const steps = unorderable ? [] : crossing.length
    ? [all.filter(n => !opening.has(n)).map(n => { const c = crossing.find(x => x.closes === n); return { nsg: n, why: c ? `closes ${c.flow}` : 'no Crossing flow, any order' }; }),
       all.filter(n => opening.has(n)).map(n => { const c = crossing.find(x => x.opens === n)!; return { nsg: n, why: `opens ${c.flow}`, waitsFor: c.closes, holdsBack: 'waits as a whole, also its other changes on this NSG' }; })]
    : [all.map(n => ({ nsg: n, why: 'no Crossing flow, any order' }))];
  return { nsgs: [...nsgs.values()], cost: costMap, affected: [...affected.values()], steps, crossing, unorderable, policy };
}
