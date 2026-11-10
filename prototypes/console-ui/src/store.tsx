// PROTOTYPE, throwaway. In-memory Change set state and a mock Preview. No persistence, no real Translation engine.
import { createContext, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { rules as initialRules, entries as initialEntries, Rule, Entry, FolderRow, isFolder, ref, zoneById, envs, Level, me, versions } from './data';

export type CsState = 'Open' | 'Submitted' | 'Approved' | 'Committed';
export interface Edit { seq: number; kind: 'add' | 'edit' | 'move' | 'delete' | 'enable' | 'disable' | 'folder'; ruleId: string; field?: string; before?: string; after?: string; by: string; via?: string }
export interface St { added?: boolean; deleted?: boolean; moved?: boolean; changed?: Set<string> }
export interface ChangeSet { id: string; name: string; owner: string; state: CsState; base: number; authors: string[]; edits: number; affected: number; rebase?: boolean; emergency?: boolean; scheduled?: string; mine?: boolean }
export type Scenario = 'auto' | 'crossing' | 'unorderable';

export const otherSets: ChangeSet[] = [
  { id: 'cs-2', name: 'Q4 cleanup of expired Rules', owner: 'kim', state: 'Submitted', base: 1288, authors: ['kim'], edits: 14, affected: 63 },
  { id: 'cs-3', name: 'Partner VPN access', owner: 'sam', state: 'Approved', base: 1288, authors: ['sam', 'jo'], edits: 6, affected: 4, scheduled: 'today 22:00' },
  { id: 'cs-4', name: 'Onboard vnet-app0107', owner: 'alex', state: 'Open', base: 1286, authors: ['alex'], edits: 88, affected: 20, rebase: true },
  { id: 'cs-5', name: 'Hotfix: block ext-partner-0339', owner: 'sam', state: 'Committed', base: 1286, authors: ['sam'], edits: 1, affected: 1, emergency: true },
];
// Rules that another open Change set also changes ("also changed in Change set X by Y").
export const alsoChanged = new Map<string, { set: string; by: string }>([
  ['R90003', { set: 'Q4 cleanup of expired Rules', by: 'kim' }],
  [initialRules[9].id, { set: 'Q4 cleanup of expired Rules', by: 'kim' }],
  [initialRules[14].id, { set: 'Onboard vnet-app0107', by: 'alex' }],
]);

let nextId = 95000;
const fmt = (v: unknown) => (Array.isArray(v) ? v.map(x => (String(x).startsWith('svc') ? x : ref(String(x)).name)).join(', ') : String(v ?? ''));
const blockEnd = (es: Entry[], head: number) => { const fid = es[head].id; let end = head + 1; while (end < es.length && !isFolder(es[end]) && (es[end] as Rule).folder === fid) end++; return end; };

export function useStoreValue() {
  const base = useRef(new Map(initialRules.map((r, i) => [r.id, { rule: r, pos: i }]))).current;
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const rules = useMemo(() => entries.filter((e): e is Rule => !isFolder(e)), [entries]);
  const folders = useMemo(() => entries.filter(isFolder), [entries]);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [state, setState] = useState<CsState>('Open');
  const [approvedBy, setApprovedBy] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(versions.latest);
  const [scenario, setScenario] = useState<Scenario>('auto');
  const [emergency, setEmergency] = useState<string | null>(null);
  const seq = useRef(0);

  // ADR 0021: a Folder edit keeps the state and the Approvals. Every other edit returns the Change set to Open and resets them.
  const reopen = () => { if (state !== 'Open') setState('Open'); setApprovedBy(a => (Object.keys(a).length ? {} : a)); };
  const log = (e: Omit<Edit, 'seq' | 'by'>[]) => { if (!e.length) return; setEdits(x => [...x, ...e.map(i => ({ ...i, seq: ++seq.current, by: me }))]); if (e.some(i => i.kind !== 'folder')) reopen(); };
  const mapRules = (fn: (r: Rule) => Rule) => setEntries(es => es.map(e => (isFolder(e) ? e : fn(e))));

  const status = useMemo(() => {
    const m = new Map<string, St>();
    for (const e of edits) {
      if (e.kind === 'folder') continue;
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

  // Place entries at a target. A Rule dropped on a Folder row or on one of its Rules joins that Folder. A Folder moves with its Rules and stays at the top level.
  const place = (es: Entry[], ids: string[], targetId: string | null, where: 'before' | 'after', forceRoot = false) => {
    const set = new Set(ids);
    const movingFolder = es.some(e => isFolder(e) && set.has(e.id));
    if (movingFolder) for (const e of es) if (!isFolder(e) && e.folder && set.has(e.folder)) set.add(e.id);
    const moving = es.filter(e => set.has(e.id)); const rest = es.filter(e => !set.has(e.id));
    let at = where === 'before' ? 0 : rest.length; let folder: string | undefined;
    if (targetId) {
      const ti = rest.findIndex(e => e.id === targetId); const tg = rest[ti]; if (!tg) return es;
      const fid = isFolder(tg) ? tg.id : tg.folder;
      if ((movingFolder || forceRoot) && fid) { const head = rest.findIndex(e => e.id === fid); at = where === 'before' ? head : blockEnd(rest, head); }
      else if (isFolder(tg)) { at = ti + (where === 'after' ? 1 : 0); folder = where === 'after' ? tg.id : undefined; }
      else { at = ti + (where === 'after' ? 1 : 0); folder = forceRoot ? undefined : tg.folder; }
    }
    const placed = moving.map(e => (isFolder(e) || movingFolder ? e : { ...e, folder }));
    return [...rest.slice(0, at), ...placed, ...rest.slice(at)];
  };
  const logMoves = (before: Entry[], after: Entry[], ids: Set<string>, via?: string) => {
    const num = (es: Entry[]) => { const m = new Map<string, number>(); let n = 0; for (const e of es) if (!isFolder(e)) m.set(e.id, ++n); return m; };
    const a = num(before), b = num(after); const fname = (es: Entry[], f?: string) => (f ? (es.find(e => e.id === f) as FolderRow | undefined)?.name ?? '' : '');
    const out: Omit<Edit, 'seq' | 'by'>[] = [];
    for (const e of after) if (!isFolder(e) && ids.has(e.id)) { const old = before.find(x => x.id === e.id) as Rule; const inF = e.folder !== old.folder ? ` (${e.folder ? `into “${fname(after, e.folder)}”` : `out of “${fname(before, old.folder)}”`})` : ''; if (a.get(e.id) !== b.get(e.id)) out.push({ kind: 'move', ruleId: e.id, before: `#${a.get(e.id)}`, after: `#${b.get(e.id)}${inF}`, via }); else if (inF) out.push({ kind: 'folder', ruleId: `${e.id}:f`, after: `“${e.name}” ${e.folder ? `moved into “${fname(after, e.folder)}”` : `taken out of “${fname(before, old.folder)}”`}, same position` }); }
    log(out);
  };
  const relocate = (ids: string[], targetId: string | null, where: 'before' | 'after', forceRoot = false) => setEntries(es => {
    const out = place(es, ids, targetId, where, forceRoot); if (out === es) return es;
    const moved = new Set(ids); for (const e of es) if (!isFolder(e) && e.folder && moved.has(e.folder)) moved.add(e.id);
    const f = es.find(e => isFolder(e) && moved.has(e.id)) as FolderRow | undefined;
    logMoves(es, out, moved, f?.id);
    if (f) log([{ kind: 'folder', ruleId: f.id, after: `Folder “${f.name}” moved with its Rules`, via: f.id }]);
    return out;
  });

  const api = {
    entries, rules, folders, edits, status, numbers, base, state, version, scenario, setScenario, approvedBy, emergency,
    editField(id: string, field: keyof Rule, value: unknown) {
      const r = rules.find(x => x.id === id); if (!r || fmt(r[field]) === fmt(value)) return;
      if (status.get(id)?.added) { mapRules(x => (x.id === id ? { ...x, [field]: value } : x)); return; }   // shaping a new Rule is part of adding it
      const after = fmt(value);
      setEdits(x => { const last = x[x.length - 1];
        if (last && last.kind === 'edit' && last.ruleId === id && last.field === field) return last.before === after ? x.slice(0, -1) : [...x.slice(0, -1), { ...last, after }];
        return [...x, { seq: ++seq.current, by: me, kind: 'edit', ruleId: id, field, before: fmt(r[field]), after }]; });
      reopen();
      mapRules(x => (x.id === id ? { ...x, [field]: value } : x));
    },
    setEnabled(ids: string[], enabled: boolean) {
      const set = new Set(ids); const hit = rules.filter(r => set.has(r.id) && r.enabled !== enabled);
      mapRules(r => (set.has(r.id) && r.enabled !== enabled ? { ...r, enabled } : r));
      log(hit.filter(r => !status.get(r.id)?.added).map(r => ({ kind: enabled ? 'enable' : 'disable', ruleId: r.id, field: 'enabled', before: String(!enabled), after: String(enabled) })));
    },
    move: relocate,
    moveToFolder(ids: string[], folderId: string | null) {
      if (folderId) { const rest = entries.filter(e => !ids.includes(e.id)); const head = rest.findIndex(e => e.id === folderId); if (head >= 0) relocate(ids, rest[blockEnd(rest, head) - 1].id, 'after'); }
      else { const first = rules.find(r => ids.includes(r.id)); if (first?.folder) relocate(ids, first.folder, 'after', true); }
    },
    newFolder(name: string, ids: string[] = []) {
      const id = `F${++nextId}`;
      setEntries(es => {
        const set = new Set(ids); const members = es.filter((e): e is Rule => set.has(e.id) && !isFolder(e)); const rest = es.filter(e => !set.has(e.id));
        let at = 0;
        if (members.length) { at = es.slice(0, es.findIndex(e => set.has(e.id))).filter(e => !set.has(e.id)).length; const fid = members[0].folder; const head = fid ? rest.findIndex(e => e.id === fid) : -1; if (head >= 0) at = head; }
        const out = [...rest.slice(0, at), { id, folderRow: true as const, name }, ...members.map(m => ({ ...m, folder: id })), ...rest.slice(at)];
        logMoves(es, out, set); return out;
      });
      log([{ kind: 'folder', ruleId: id, after: `Folder “${name}” created` }]);
      return id;
    },
    renameFolder(id: string, name: string) {
      const f = folders.find(x => x.id === id); if (!f || !name.trim() || f.name === name) return;
      setEntries(es => es.map(e => (e.id === id && isFolder(e) ? { ...e, name } : e)));
      log([{ kind: 'folder', ruleId: id, after: `Folder renamed from “${f.name}” to “${name}”` }]);
    },
    deleteFolder(id: string) {
      const f = folders.find(x => x.id === id); if (!f) return;
      setEntries(es => es.filter(e => e.id !== id).map(e => (!isFolder(e) && e.folder === id ? { ...e, folder: undefined } : e)));
      log([{ kind: 'folder', ruleId: id, after: `Folder “${f.name}” removed, its Rules stay in place` }]);
    },
    clone(ids: string[]) {
      const added: Omit<Edit, 'seq' | 'by'>[] = [];
      setEntries(es => { const out: Entry[] = []; for (const e of es) { out.push(e); if (!isFolder(e) && ids.includes(e.id)) { const c = { ...e, id: `R${++nextId}`, name: `${e.name} (copy)`, hits: null }; out.push(c); added.push({ kind: 'add', ruleId: c.id, after: c.name }); } } return out; });
      setTimeout(() => log(added), 0);
    },
    addRule(afterId?: string, folderId?: string) {
      const r: Rule = { id: `R${++nextId}`, name: 'New Rule', src: ['any'], dst: ['any'], svc: ['svc-any'], action: 'deny', enabled: false, comment: '', ticket: '', owner: me, hits: null };
      setEntries(es => {
        const anchor = folderId ? es.findIndex(e => e.id === folderId) : afterId ? es.findIndex(e => e.id === afterId) : -1; const a = es[anchor];
        return [...es.slice(0, anchor + 1), { ...r, folder: a ? (isFolder(a) ? a.id : a.folder) : undefined }, ...es.slice(anchor + 1)];
      });
      log([{ kind: 'add', ruleId: r.id, after: r.name }]);
      return r.id;
    },
    remove(ids: string[]) {
      const addedNow = ids.filter(id => status.get(id)?.added);
      if (addedNow.length) { setEntries(es => es.filter(e => !addedNow.includes(e.id))); setEdits(es => es.filter(e => !addedNow.includes(e.ruleId))); }
      log(ids.filter(id => !addedNow.includes(id)).map(id => ({ kind: 'delete' as const, ruleId: id })));
    },
    discard() { setEntries(initialEntries); setEdits([]); setState('Open'); setApprovedBy({}); setEmergency(null); },
    submit() { setState('Submitted'); },
    approveAs(who: string, envIds: string[]) { setApprovedBy(a => ({ ...a, ...Object.fromEntries(envIds.map(e => [e, who])) })); },
    commit(reason?: string) { setState('Committed'); setVersion(v => v + 1); if (reason) setEmergency(reason); },
    reject() { setState('Open'); setApprovedBy({}); },
    // Issue 36: a Rebase onto a newer Version. A resolved Rule conflict resets the Approvals; a resolution that moves no Rule keeps them (ADR 0021).
    rebaseOnto(v: number, fixEntries: (es: Entry[]) => Entry[], fixEdits: (es: Edit[], next: () => number) => Edit[], keep: boolean, newBase: Rule[] = []) {
      newBase.forEach(r => base.set(r.id, { rule: r, pos: base.get(r.id)?.pos ?? 1 }));
      setEntries(fixEntries); setEdits(es => fixEdits(es, () => ++seq.current)); setVersion(v);
      if (!keep) { setState('Open'); setApprovedBy({}); }
    },
  };
  return api;
}
export type Store = ReturnType<typeof useStoreValue>;
export const Ctx = createContext<Store | null>(null);
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
