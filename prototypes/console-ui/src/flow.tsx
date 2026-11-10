// PROTOTYPE, throwaway. Issue 36: what happens to a Change set after its author is done. One in-memory context for the
// approver's view, the Rebase, the pre-check and its waivers, the Commit dialog, the Version history and the inbox.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { rules as baseRules } from './data';
import { useStore, Store, alsoChanged } from './store';
import './app36.css';

export const CUR = 'CHG-5120';
export const CUR_NAME = 'CHG-5120 Release app0042';
export const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export interface Waiver { by: string; reason: string; at: string }
export interface Check { at: string; edits: number; why: 'Submit' | 'on demand' | 'Emergency Commit' }
export interface Snap { by: string; at: string; version: number; seq: number }
export interface Pending { version: number; by: string; set: string; mode: 'full' | 'folder' }
export interface Done { version: number; kept: boolean; notices: string[]; since: string[] }
export interface Created { id: string; kind: 'revert' | 'restore'; of: number; author: string }
export interface Decision { kind: 'approved' | 'rejected'; comment?: string; at: string; envs?: string[] }
export interface SessionVersion { n: number; name: string; by: string; at: string; kind: 'normal' | 'emergency' | 'scheduled' | 'folders' | 'retranslation' | 'revert' | 'restore'; nsgs: number; edits: number }

// The Rule that kim's Commit (Version 1291) inserts above "Admins to jump hosts": it overlaps that allow Rule with the other action.
export const KIM_DENY = { id: 'R95901', name: 'Block RDP to jump hosts', src: ['any'], dst: ['zone:z0001-jump'], svc: ['svc-rdp'], action: 'deny' as const, enabled: true,
  comment: 'Only the admin network may reach the jump hosts', ticket: 'CHG-5233', owner: 'grp-netsec', hits: null };
// What kim's Version 1291 did to the Rules and Folders this Change set also touched.
export const THEIRS = {
  rule: { ...baseRules.find(r => r.id === 'R90003')!, enabled: false, expiry: '2026-10-31', comment: 'Expired, turned off in the Q4 cleanup' },
  folderName: 'App0042 go-live', removedFolder: 'F02', removedFolderName: 'Platform and admin access',
};
// Paths the tool itself needs (ADR 0014 and the operations grilling): from the deployment, plus admin additions.
export const TOOL_PATHS = [
  { id: 'tp-db', name: 'nsgfw to its database', to: 'psql-nsgfw, private endpoint 10.250.10.4', port: 'TCP 5432', from: 'configuration' },
  { id: 'tp-dns', name: 'nsgfw to the DNS servers', to: 'app0001-mgmt, 10.0.0.4 and 10.0.0.5', port: 'UDP and TCP 53', from: 'configuration', zone: 'z0001-mgmt' },
  { id: 'tp-proxy', name: 'nsgfw to the outbound proxy', to: 'app0001-ingress, 10.0.0.70', port: 'TCP 3128', from: 'added by an admin', zone: 'z0001-ingress' },
];

function useFlowValue() {
  const [small, setSmall] = useState(false);
  const [toolPath, setToolPath] = useState(false);
  const [retrans, setRetrans] = useState(false);
  const [forceDeny, setForceDeny] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [waivers, setWaivers] = useState<Record<string, Record<string, Waiver>>>({});
  const [snaps, setSnaps] = useState<Record<string, Snap | undefined>>({});
  const [schedule, setScheduleMap] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [latest, setLatest] = useState(1290);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [created, setCreated] = useState<Created[]>([]);
  const [csState, setCsState] = useState<Record<string, 'Open' | 'Submitted' | 'Approved' | 'Committed'>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [extra, setExtra] = useState<SessionVersion[]>([]);
  const [rtDone, setRtDone] = useState(false);

  return {
    small, setSmall, toolPath, setToolPath, retrans: retrans && !rtDone, setRetrans: (v: boolean) => { setRetrans(v); if (v) setRtDone(false); }, forceDeny, setForceDeny,
    checks, runCheck: (cs: string, why: Check['why'], edits: number) => setChecks(c => ({ ...c, [cs]: { at: nowLabel(), edits, why } })),
    waivers, waive: (cs: string, key: string, reason: string) => setWaivers(w => ({ ...w, [cs]: { ...w[cs], [key]: { by: 'you', reason, at: nowLabel() } } })),
    unwaive: (cs: string, key: string) => setWaivers(w => { const n = { ...w[cs] }; delete n[key]; return { ...w, [cs]: n }; }),
    snaps, setSnap: (cs: string, s?: Snap) => setSnaps(x => ({ ...x, [cs]: s })),
    schedule, setSchedule: (cs: string, at?: string) => setScheduleMap(x => ({ ...x, [cs]: at })),
    pending, done, latest, rebaseOpen, setRebaseOpen,
    // Another administrator's Commit lands. The prototype first adds the edits that the conflicts need to the current Change set.
    startRebase(mode: 'full' | 'folder', s: Store) {
      const has = (pred: (e: Store['edits'][number]) => boolean) => s.edits.some(pred);
      if (mode === 'full') {
        if (!has(e => e.ruleId === 'R90003')) s.editField('R90003', 'svc', ['svc-https', 'svc-c1']);
        if (!has(e => e.ruleId === 'R90005' && e.kind === 'move')) s.move(['R90005'], 'R90002', 'before');
      }
      if (!has(e => e.ruleId === 'F01')) s.renameFolder('F01', 'App0042 release 24.3');
      const r6 = baseRules[6].id; if (!has(e => e.ruleId === `${r6}:f`)) s.moveToFolder([r6], 'F02');
      setPending({ version: latest + 1, by: 'kim', set: 'Q4 cleanup of expired Rules', mode }); setDone(null);
    },
    finishRebase(d: Done) { for (const [k, v] of [...alsoChanged]) if (v.set === 'Q4 cleanup of expired Rules') alsoChanged.delete(k);   // kim's Change set is committed now
      setPending(null); setDone(d); setLatest(d.version); setRebaseOpen(false); setExtra(x => [{ n: d.version, name: 'Q4 cleanup of expired Rules', by: 'kim', at: nowLabel(), kind: 'normal', nsgs: 63, edits: 41 }, ...x]); },
    bumpLatest: (v: SessionVersion) => { setLatest(l => Math.max(l, v.n)); setExtra(x => [v, ...x]); },
    decisions, decide: (cs: string, d: Decision) => setDecisions(x => ({ ...x, [cs]: d })),
    created, create(c: Omit<Created, 'id'>) { const id = `${c.kind === 'revert' ? 'rv' : 'rs'}-${c.of}`; setCreated(x => (x.some(y => y.id === id) ? x : [{ ...c, id }, ...x])); return id; },
    csState, setCs: (cs: string, st: 'Open' | 'Submitted' | 'Approved' | 'Committed') => setCsState(x => ({ ...x, [cs]: st })),
    open, openCs: setOpen, extra, rtDone, finishRetrans: () => setRtDone(true),
  };
}
export type Flow = ReturnType<typeof useFlowValue>;
const Ctx = createContext<Flow | null>(null);
export const FlowProvider = ({ children }: { children: ReactNode }) => <Ctx.Provider value={useFlowValue()}>{children}</Ctx.Provider>;
export const useFlow = () => useContext(Ctx)!;

// Which Change set the building blocks below talk about: the current one, or one opened from the inbox, the list or the Versions.
const CsCtx = createContext<string>(CUR);
export const CsScope = CsCtx.Provider;
export const useCsId = () => useContext(CsCtx);

// Watches the current Change set: the Preview an approver saw is stored with the Approval, and an edit that reopens it clears the schedule.
export function FlowWatch() {
  const s = useStore(); const f = useFlow(); const cs = useCsId();
  const approved = Object.keys(s.approvedBy).length > 0;
  useEffect(() => {
    if (approved && !f.snaps[cs]) f.setSnap(cs, { by: Object.values(s.approvedBy)[0], at: nowLabel(), version: s.version, seq: Math.max(0, ...s.edits.map(e => e.seq)) });
    if (!approved && f.snaps[cs]) f.setSnap(cs, undefined);
  }, [approved]);
  useEffect(() => { if (s.state === 'Open' && f.schedule[cs]) f.setSchedule(cs, undefined); }, [s.state]);
  // A Commit that waited in line for the Re-translation runs as soon as the Re-translation is committed.
  useEffect(() => { if (f.rtDone && f.schedule[cs] === 'after the Re-translation') { f.setSchedule(cs, undefined); const n = f.latest + 1; s.rebaseOnto(f.latest, es => es, e => e, true); s.commit(); f.bumpLatest({ n, name: CUR_NAME, by: 'you', at: nowLabel(), kind: 'normal', nsgs: s.status.size, edits: s.edits.length }); } }, [f.rtDone]);
  return null;
}
