// PROTOTYPE, throwaway. Building blocks of the pending changes panel. Each variant arranges them differently.
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea, MessageBar, MessageBarBody, MessageBarTitle, Popover, PopoverTrigger, PopoverSurface, Input, Radio, RadioGroup } from '@fluentui/react-components';
import { Alert20Regular, ArrowSync16Regular, CheckmarkCircle16Filled, Clock16Regular, Flash16Regular, Send16Regular, ShieldError16Filled, ShieldCheckmark16Regular, PeopleSwap16Regular } from '@fluentui/react-icons';
import { useStore, buildPreview, otherSets, alsoChanged, CsState, Preview } from './store';
import { envs, rules as baseRules } from './data';
import { useT } from './i18n';

export const usePreview = () => { const s = useStore(); return useMemo(() => buildPreview(s), [s.status, s.rules, s.scenario]); };
export function StateBadge({ state }: { state: CsState }) { const { t } = useT(); return <span className="state"><span className={`dot ${state}`} />{t(state)}</span>; }

export function useApproval(pv: Preview) {
  const s = useStore();
  const byEnv = envs.map(e => ({ env: e, zones: pv.affected.filter(a => a.env === e.id) })).filter(x => x.zones.length);
  const done = byEnv.every(x => x.env.level === 'none' || s.approvedBy[x.env.id]);
  const eff: CsState = s.state === 'Submitted' && done ? 'Approved' : s.state;
  return { byEnv, done, eff };
}

const editLabel: Record<string, string> = { add: 'Added', delete: 'Deleted', move: 'Moved', enable: 'Turned on', disable: 'Turned off', edit: 'Edited' };
export function ChangesList({ onFocus, selected }: { onFocus?: (id: string) => void; selected?: string | null }) {
  const s = useStore(); const { t } = useT();
  const groups = useMemo(() => { const m = new Map<string, typeof s.edits>(); s.edits.forEach(e => m.set(e.ruleId, [...(m.get(e.ruleId) ?? []), e])); return [...m]; }, [s.edits]);
  if (!groups.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div className="list">
      {groups.length > 60 && <p className="muted" style={{ marginTop: 0 }}>{groups.length} {t('Rules')}. {t('Showing the first 60.')}</p>}
      {groups.slice(0, 60).map(([id, es]) => {
        const r = s.rules.find(x => x.id === id) ?? baseRules.find(x => x.id === id); const also = alsoChanged.get(id);
        if (es[0].kind === 'folder') return <div key={id} className="li">{es.map(e => <div key={e.seq} className="edit" style={{ marginTop: 0 }}><span className="ek move">{t('Folder')}</span><span>{e.after}</span></div>)}</div>;
        return (
          <div key={id} className={`li clickable ${selected === id ? 'sel' : ''}`} onClick={() => onFocus?.(id)}>
            <div className="li-h"><span className="muted">{s.numbers.get(id) ?? '—'}</span><b>{r?.name}</b><span className="mono">{id}</span></div>
            {es.map(e => <div key={e.seq} className="edit"><span className={`ek ${e.kind}`}>{t(editLabel[e.kind])}</span>
              {e.kind === 'edit' ? <span>{e.field}: <s>{e.before || '∅'}</s> to {e.after}</span> : e.kind === 'move' ? <span>from {e.before} to {e.after}</span> : null}</div>)}
            {also && <div className="warn"><PeopleSwap16Regular /> {t('also changed in')} “{also.set}” {t('by')} {also.by}</div>}
          </div>
        );
      })}
    </div>
  );
}

const Ops = ({ c, ch, d }: { c: number; ch: number; d: number }) => (
  <span className="sum-ops"><span className={`op create ${c ? '' : 'zeroop'}`}>+{c}</span><span className={`op change ${ch ? '' : 'zeroop'}`}>~{ch}</span><span className={`op delete ${d ? '' : 'zeroop'}`}>−{d}</span></span>
);
export function PreviewView({ pv }: { pv: Preview }) {
  const { t } = useT();
  const ops = pv.nsgs.flatMap(n => n.ops); const ren = pv.nsgs.reduce((a, n) => a + n.renumbered, 0);
  const c = (o: string) => ops.filter(x => x.op === o).length;
  if (!pv.nsgs.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div>
      <div className="counts">
        <span><b>{pv.nsgs.length}</b>NSGs</span><span className={c('create') ? 'create' : 'nil'}><b>{c('create')}</b>{t('created')}</span>
        <span className={c('change') ? 'change' : 'nil'}><b>{c('change')}</b>{t('changed')}</span><span className={c('delete') ? 'delete' : 'nil'}><b>{c('delete')}</b>{t('deleted')}</span>
      </div>
      {pv.nsgs.slice(0, 60).map(n => (
        <details key={n.nsg} className="nsg">
          <summary><span className="sum-main"><span className="mono">{n.nsg}</span><span className="muted">{envs.find(e => e.id === n.env)?.name}</span></span>
            <Ops c={n.ops.filter(o => o.op === 'create').length} ch={n.ops.filter(o => o.op === 'change').length} d={n.ops.filter(o => o.op === 'delete').length} /></summary>
          <table className="mini"><thead><tr><th></th><th>Dir.</th><th>Priority</th><th>NSG rule</th><th>Why</th></tr></thead>
            <tbody>{n.ops.map((o, i) => <tr key={i}><td className={`op ${o.op}`}>{o.op}</td><td>{o.dir === 'in' ? t('Inbound') : t('Outbound')}</td><td>{o.priority}</td><td className="mono">{o.name}</td><td className="muted">{o.detail}</td></tr>)}</tbody></table>
        </details>
      ))}
      {ren > 0 && <div className="renum">{ren} {t('NSG rules')} in {pv.nsgs.filter(n => n.renumbered).length} NSGs only get a new priority. What they allow stays the same.</div>}
      {pv.nsgs.length > 60 && <p className="muted">{pv.nsgs.length - 60} more NSGs</p>}
      <h4>{t('Rule cost')}</h4>
      <table className="mini"><thead><tr><th>Rule</th><th>NSGs</th><th>{t('NSG rules')}</th></tr></thead><tbody>{[...pv.cost].map(([id, k]) => <tr key={id}><td className="mono">{id}</td><td>{k.nsgs}</td><td>{k.nsgRules}</td></tr>)}</tbody></table>
    </div>
  );
}

export function WriteOrderView({ pv }: { pv: Preview }) {
  const { t } = useT();
  const Node = ({ nsg, role }: { nsg: string; role: 'closes' | 'opens' }) => <div className={`wnode ${role}`}><span>{t(role === 'closes' ? 'closes the flow' : 'opens the flow')}</span><b className="mono">{nsg}</b></div>;
  if (pv.unorderable) return (
    <div>
      <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>{t('This Change set cannot be ordered')}</MessageBarTitle>{t('Two Crossing flows need opposite orders.')} {t('Split it into two Change sets, one per direction of the flow.')}</MessageBarBody></MessageBar>
      {pv.crossing.map((c, i) => <div key={i} className="wflow bad"><div className="wf-h">{c.flow}</div><div className="wf-d"><Node nsg={c.closes} role="closes" /><span className="wf-a">{t('before')}</span><Node nsg={c.opens} role="opens" /></div></div>)}
    </div>
  );
  const all = pv.steps.flat(); if (!all.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  const inFlow = new Set(pv.crossing.flatMap(c => [c.closes, c.opens])); const free = all.filter(w => !inFlow.has(w.nsg));
  return (
    <div>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>{pv.crossing.length ? t('The NSG that closes a Crossing flow is written before the NSG that opens it, so no traffic opens that both Versions deny.') : t('No Crossing flows: every write can go in any order.')}</p>
      {pv.crossing.map((c, i) => <div key={i} className="wflow"><div className="wf-h">{c.flow}</div><div className="wf-d"><Node nsg={c.closes} role="closes" /><span className="wf-a">{t('then')}</span><Node nsg={c.opens} role="opens" /></div>
        <div className="muted">{t('The second NSG waits as a whole, also with its other changes.')}</div></div>)}
      {free.length > 0 && <details className="nsg" open={!pv.crossing.length}><summary><span className="sum-main"><b>{free.length} NSGs</b><span className="muted">{t('in any order')}</span></span><span /></summary>
        {free.slice(0, 14).map(w => <div key={w.nsg} className="w"><span className="mono">{w.nsg}</span></div>)}{free.length > 14 && <p className="muted">{free.length - 14} {t('more')}</p>}</details>}
    </div>
  );
}

export function ApprovalView({ pv }: { pv: Preview }) {
  const s = useStore(); const { t } = useT(); const a = useApproval(pv);
  if (!a.byEnv.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{t('Each Affected Zone needs its Approval level.')}</p>
      <table className="mini"><thead><tr><th>{t('Environment')}</th><th>{t('Affected Zones')}</th><th>Level</th><th>Status</th></tr></thead><tbody>
        {a.byEnv.map(({ env, zones }) => { const by = s.approvedBy[env.id]; return (
          <tr key={env.id} title={zones.slice(0, 30).map(z => z.zone).join(', ')}><td><b>{env.name}</b></td><td>{zones.length}</td><td>{t(env.level)}</td>
            <td>{env.level === 'none' ? <span className="muted">{t('not required')}</span> : by ? <span className="ok"><CheckmarkCircle16Filled /> {t('approved by')} {by}</span> : s.state === 'Open' ? <span className="muted">{t('Waiting for Submit')}</span> : <span className="pending"><Clock16Regular /> {t('waiting')}</span>}</td></tr>); })}
      </tbody></table>
      {s.state === 'Submitted' && !a.done && <Button size="small" className="proto" onClick={() => s.approveAs('kim', a.byEnv.map(x => x.env.id))}>{t('Approve as kim (prototype)')}</Button>}
    </div>
  );
}

export function PolicyView({ pv }: { pv: Preview }) {
  const { t } = useT(); const [ran, setRan] = useState<string | null>(null);
  return (
    <div>
      {pv.policy.map((f, i) => <div key={i} className="li"><div className="li-h">{f.effect === 'deny' ? <ShieldError16Filled className="b-red" /> : <ShieldCheckmark16Regular />}<b>{f.assignment}</b></div>
        <div className="edit"><span className={`ek ${f.effect === 'deny' ? 'delete' : 'move'}`}>{f.effect}</span>{f.reason}{f.rule ? <span className="mono">{f.rule}</span> : null}</div></div>)}
      <div style={{ paddingTop: 8 }}><Button size="small" icon={<ArrowSync16Regular />} onClick={() => setRan(new Date().toLocaleTimeString())}>{t('Run check now')}</Button> {ran && <span className="muted">checked at {ran}</span>}</div>
    </div>
  );
}

export function CsActions({ pv, compact }: { pv: Preview; compact?: boolean }) {
  const s = useStore(); const { t } = useT(); const a = useApproval(pv); const [em, setEm] = useState(false);
  const denyFinding = pv.policy.some(p => p.effect === 'deny');
  if (s.state === 'Committed') return (
    <MessageBar intent="success" layout="multiline"><MessageBarBody><MessageBarTitle>{t('Committed as Version')} {s.version}</MessageBarTitle>
      {t('Deployments started')}: Production (ARM) is writing. Non-production (Terraform) has its pull request for {t('step')} 1 {t('of')} {Math.max(1, pv.steps.length)}.{s.emergency ? <div><Flash16Regular /> {t('Emergency Commit')}, {t('awaiting approval afterwards')}</div> : null}
      <div><Button size="small" className="proto" onClick={s.discard}>Reset prototype</Button></div></MessageBarBody></MessageBar>
  );
  return (
    <div className="cs-actions">
      {!compact && <StateBadge state={a.eff} />}
      <span style={{ flex: 1 }} />
      <Button size="small" appearance="subtle" onClick={s.discard} disabled={!s.edits.length}>{t('Discard')}</Button>
      <Button size="small" icon={<Flash16Regular />} disabled={!s.edits.length || pv.unorderable} onClick={() => setEm(true)}>{t('Emergency Commit')}</Button>
      {s.state === 'Open' && <Button size="small" icon={<Send16Regular />} appearance="primary" disabled={!s.edits.length || pv.unorderable || denyFinding} onClick={s.submit} title={denyFinding ? 'A deny Policy finding blocks Submit' : undefined}>{t('Submit')}</Button>}
      {s.state !== 'Open' && <Button size="small" appearance="primary" disabled={!a.done || pv.unorderable} onClick={() => s.commit()}>{t('Commit')}</Button>}
      <EmergencyDialog open={em} onClose={() => setEm(false)} />
    </div>
  );
}

export function EmergencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore(); const { t } = useT(); const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface><DialogBody><DialogTitle>{t('Emergency Commit')}</DialogTitle>
        <DialogContent>
          <p>This commits without the required Approval. It stays in every approver's inbox until one of them approves it afterwards. You sign in again before it runs.</p>
          <Field label={t('Reason (required)')} required><Textarea value={reason} onChange={(_, d) => setReason(d.value)} /></Field>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={reason.trim().length < 5} onClick={() => { s.commit(reason); onClose(); }}>{t('Emergency Commit')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

export function ChangeSetList() {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const a = useApproval(pv);
  return (
    <div className="list">
      <div className="sect">{t('My Change sets')}</div>
      <div className="csrow current"><span className={`dot ${a.eff}`} /><div><b>CHG-5120 Release app0042</b><div className="meta">{t(a.eff)}, {s.edits.length} {t('edits')}, {t('based on Version')} {s.version}</div></div></div>
      <div className="sect">{t('Other Change sets')}</div>
      {otherSets.map(c => (
        <div key={c.id} className="csrow"><span className={`dot ${c.state}`} /><div><b>{c.name}</b>
          <div className="meta">{t(c.state)} {t('by')} {c.owner}, {c.edits} {t('edits')}, {c.affected} {t('Zones')}{c.scheduled ? `, ${t('Scheduled')} ${c.scheduled}` : ''}
            {c.rebase && <span className="tag red">{t('Rebase needed')}</span>}{c.emergency && <span className="tag amber">{t('Emergency Commit')}</span>}</div></div></div>
      ))}
    </div>
  );
}

const inbox = [
  { k: 'Approval', text: 'kim asks for Approval of “Q4 cleanup of expired Rules” (63 Zones, four-eyes)' },
  { k: 'Emergency', text: 'sam made an Emergency Commit, “Hotfix: block 203.0.113.0/24”, that still needs approval' },
  { k: 'Conflict', text: '“Onboard vnet-app0107” (alex) needs a Rebase with 2 conflicts' },
  { k: 'Expiry', text: '14 of your Rules expire within 7 days' },
  { k: 'Rejected', text: 'jo rejected “Open RDP for vendor”: use the jump hosts' },
];
export function InboxButton() {
  const { t } = useT();
  return (
    <Popover positioning="after-bottom"><PopoverTrigger disableButtonEnhancement>
      <button className="rail-i" aria-label={t('Inbox')} title={t('Inbox')}><Alert20Regular /><span className="pip">{inbox.length}</span></button>
    </PopoverTrigger><PopoverSurface style={{ width: 420, padding: '14px 18px' }}>
      <div className="panel-h">{t('Inbox')}</div>
      {inbox.map((i, n) => <div key={n} className="li"><div className="li-h"><span className="ek move">{i.k}</span></div><div style={{ marginTop: 3 }}>{i.text}</div></div>)}
    </PopoverSurface></Popover>
  );
}

export function MoveDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const s = useStore(); const { t } = useT(); const [mode, setMode] = useState('before'); const [n, setN] = useState('1');
  const go = () => {
    if (!ids) return;
    if (mode === 'top') s.move(ids, null, 'before'); else if (mode === 'bottom') s.move(ids, null, 'after');
    else { const target = s.rules.filter(r => !s.status.get(r.id)?.deleted)[Math.max(0, Number(n) - 1)]; if (target) s.move(ids, target.id, 'before'); }
    onClose();
  };
  return (
    <Dialog open={!!ids} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 420 }}><DialogBody><DialogTitle>{t('Move selected Rules')} ({ids?.length})</DialogTitle>
        <DialogContent>
          <RadioGroup value={mode} onChange={(_, d) => setMode(d.value)}>
            <Radio value="top" label={t('to the top')} /><Radio value="before" label={<span>{t('before Rule number')} <Input size="small" style={{ width: 90 }} value={n} onChange={(_, d) => setN(d.value)} /></span>} /><Radio value="bottom" label={t('to the bottom')} />
          </RadioGroup>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" onClick={go}>{t('Apply')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}
