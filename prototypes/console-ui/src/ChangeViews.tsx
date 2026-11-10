// PROTOTYPE, throwaway. Building blocks of the pending changes panel. Each variant arranges them differently.
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea, MessageBar, MessageBarBody, MessageBarTitle, Popover, PopoverTrigger, PopoverSurface, Input, Radio, RadioGroup } from '@fluentui/react-components';
import { Alert20Regular, ArrowSync16Regular, CheckmarkCircle16Filled, Clock16Regular, Flash16Regular, Send16Regular, ShieldError16Filled, ShieldCheckmark16Regular, PeopleSwap16Regular } from '@fluentui/react-icons';
import { useStore, buildPreview, otherSets, alsoChanged, CsState, Preview, Edit } from './store';
import { envs, rules as baseRules } from './data';
import { targetName } from './zonedata';
import { useT } from './i18n';
import { useFlow, useCsId, CUR } from './flow';
import { CsButtons } from './Commit';
import { PolicyFull } from './Policy';
import { InboxBell } from './Inbox';
export { EmergencyDialog } from './Commit';

export const usePreview = () => { const s = useStore(); return useMemo(() => buildPreview(s), [s.status, s.rules, s.scenario, s.space]); };
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
  const s = useStore(); const { t } = useT(); const f = useFlow(); const cs = useCsId();
  // Issue 36: the moves that a Folder move causes group under that Folder; in the small profile there are no Folders.
  const plain = (x?: string) => (f.small ? x?.replace(/ \((into|out of) “[^”]*”\)/, '') : x);
  const groups = useMemo(() => { const m = new Map<string, Edit[]>(); s.edits.forEach(e => { if (f.small && e.kind === 'folder') return; const k = e.via ? `via:${e.via}` : e.ruleId; m.set(k, [...(m.get(k) ?? []), e]); }); return [...m]; }, [s.edits, f.small]);
  const notices = cs === CUR && f.done ? f.done.notices.filter(n => !f.small || !n.includes('Folder')) : [];
  if (!groups.length && !notices.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div className="list">
      {notices.map(n => <div key={n} className="li notice">{t(n)}</div>)}
      {groups.length > 60 && <p className="muted" style={{ marginTop: 0 }}>{groups.length} {t('Rules')}. {t('Showing the first 60.')}</p>}
      {groups.slice(0, 60).map(([id, es]) => {
        if (id.startsWith('via:')) { const head = es.find(e => e.kind === 'folder'); const mv = es.filter(e => e.kind === 'move'); return (
          <details key={id} className="li fmove"><summary><span className="ek move">{t('Folder')}</span> <b>{head?.after ?? 'Folder moved'}</b><div className="muted">{mv.length} {t(mv.length === 1 ? 'Rule moves with it. It counts as moved, and its Affected Zones need Approval.' : 'Rules move with it. Each counts as moved, and their Affected Zones need Approval.')}</div></summary>
            {mv.slice(0, 12).map(e => <div key={e.seq} className="edit"><span className="mono">{e.ruleId}</span><span>{(s.rules.find(x => x.id === e.ruleId) ?? baseRules.find(x => x.id === e.ruleId))?.name}</span><span className="muted">{e.before} → {e.after}</span></div>)}
            {mv.length > 12 && <p className="muted">{mv.length - 12} {t('more')}</p>}</details>); }
        const r = s.rules.find(x => x.id === id) ?? baseRules.find(x => x.id === id); const also = alsoChanged.get(id);
        if (es[0].kind === 'setting') return <div key={id} className="li">{es.map(e => <div key={e.seq} className="edit" style={{ marginTop: 0 }}><span className="ek edit">{t('Setting')}</span><span>{t(e.field ?? '')}: <s>{e.before}</s> {t('to')} {e.after}</span></div>)}</div>;
        if (es[0].kind === 'zone' || es[0].kind === 'object') return <div key={id} className="li clickable" onClick={() => onFocus?.(id)}><div className="li-h"><b>{targetName(id)}</b><span className="mono">{t(es[0].kind === 'zone' ? 'Zone' : 'Object')}</span></div>{es.map(e => <div key={e.seq} className="edit"><span className="ek edit">{t(e.field ?? '')}</span>{e.before ? <span><s>{e.before}</s> {t('to')} {e.after}</span> : <span>{e.after}</span>}</div>)}</div>;
        if (es[0].kind === 'folder') return <div key={id} className="li">{es.map(e => <div key={e.seq} className="edit" style={{ marginTop: 0 }}><span className="ek move">{t('Folder')}</span><span>{e.after}</span></div>)}</div>;
        return (
          <div key={id} className={`li clickable ${selected === id ? 'sel' : ''}`} onClick={() => onFocus?.(id)}>
            <div className="li-h"><span className="muted">{s.numbers.get(id) ?? '—'}</span><b>{r?.name}</b><span className="mono">{id}</span></div>
            {es.map(e => <div key={e.seq} className="edit"><span className={`ek ${e.kind}`}>{t(editLabel[e.kind])}</span>
              {e.kind === 'edit' ? <span>{e.field}: <s>{e.before || '∅'}</s> to {e.after}</span> : e.kind === 'move' ? <span>from {e.before} to {plain(e.after)}</span> : null}</div>)}
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
  const { t } = useT(); const s = useStore();
  const ops = pv.nsgs.flatMap(n => n.ops); const ren = pv.nsgs.reduce((a, n) => a + n.renumbered, 0);
  const c = (o: string) => ops.filter(x => x.op === o).length;
  if (!pv.nsgs.length) return <p className="muted">{s.edits.length ? t('Nothing changes in Azure. This Change set only organises the Rule base.') : t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
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
  const { t } = useT(); const s = useStore();
  const Node = ({ nsg, role }: { nsg: string; role: 'closes' | 'opens' }) => <div className={`wnode ${role}`}><span>{t(role === 'closes' ? 'closes the flow' : 'opens the flow')}</span><b className="mono">{nsg}</b></div>;
  if (pv.unorderable) return (
    <div>
      <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>{t('This Change set cannot be ordered')}</MessageBarTitle>{t('Two Crossing flows need opposite orders.')} {t('Split it into two Change sets, one per direction of the flow.')}</MessageBarBody></MessageBar>
      {pv.crossing.map((c, i) => <div key={i} className="wflow bad"><div className="wf-h">{c.flow}</div><div className="wf-d"><Node nsg={c.closes} role="closes" /><span className="wf-a">{t('before')}</span><Node nsg={c.opens} role="opens" /></div></div>)}
    </div>
  );
  const all = pv.steps.flat(); if (!all.length) return <p className="muted">{s.edits.length ? t('Nothing changes in Azure. This Change set only organises the Rule base.') : t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
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
  const s = useStore(); const { t } = useT(); const a = useApproval(pv); const cs = useCsId();
  if (!a.byEnv.length) return <p className="muted">{s.edits.length ? t('No Approval needed: this Change set changes no Managed NSG.') : t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{t('Each Affected Zone needs its Approval level.')}</p>
      <table className="mini"><thead><tr><th>{t('Environment')}</th><th>{t('Affected Zones')}</th><th>Level</th><th>Status</th></tr></thead><tbody>
        {a.byEnv.map(({ env, zones }) => { const by = s.approvedBy[env.id]; return (
          <tr key={env.id} title={zones.slice(0, 30).map(z => z.zone).join(', ')}><td><b>{env.name}</b></td><td>{zones.length}</td><td>{t(env.level)}</td>
            <td>{env.level === 'none' ? <span className="muted">{t('not required')}</span> : by ? <span className="ok"><CheckmarkCircle16Filled /> {t('approved by')} {by}</span> : s.state === 'Open' ? <span className="muted">{t('Waiting for Submit')}</span> : <span className="pending"><Clock16Regular /> {t('waiting')}</span>}</td></tr>); })}
      </tbody></table>
      {s.state !== 'Committed' && a.byEnv.some(x => x.env.level === 'four-eyes' && !s.approvedBy[x.env.id]) && <p className="muted" style={{ lineHeight: 1.45 }}>{t('Four-eyes: an approver who is not an Author of this Change set approves those Zones.')}</p>}
      {s.state === 'Submitted' && !a.done && cs === CUR && <Button size="small" className="proto" onClick={() => s.approveAs('kim', a.byEnv.map(x => x.env.id))}>{t('Approve as kim (prototype)')}</Button>}
    </div>
  );
}

export function PolicyView({ pv }: { pv: Preview }) { return <PolicyFull pv={pv} />; }

export function CsActions({ pv, compact }: { pv: Preview; compact?: boolean }) {
  const s = useStore(); const { t } = useT(); const a = useApproval(pv);
  if (s.state === 'Committed') return (
    <MessageBar intent="success" layout="multiline"><MessageBarBody><MessageBarTitle>{t('Committed as Version')} {s.version}</MessageBarTitle>
      {pv.nsgs.length ? <>{t('Deployments started')}: Production (ARM) is writing. Non-production (Terraform) has its pull request for {t('step')} 1 {t('of')} {Math.max(1, pv.steps.length)}.</> : t('Nothing to deploy: no Managed NSG changes.')}{s.emergency ? <div><Flash16Regular /> {t('Emergency Commit')}, {t('awaiting approval afterwards')}</div> : null}
      <div><Button size="small" className="proto" onClick={s.discard}>Reset prototype</Button></div></MessageBarBody></MessageBar>
  );
  return <div className="cs-actions">{!compact && <StateBadge state={a.eff} />}<span style={{ flex: 1 }} /><CsButtons pv={pv} /></div>;
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

// Issue 36: the bell leads to the inbox on the Change sets page.
export function InboxButton({ onOpen }: { onOpen?: () => void }) { return <InboxBell onOpen={onOpen ?? (() => {})} />; }

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
