// PROTOTYPE, throwaway. Building blocks of the pending changes panel. Each variant arranges them differently.
import { useMemo, useState } from 'react';
import { Badge, Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea, MessageBar, MessageBarBody, MessageBarTitle, Popover, PopoverTrigger, PopoverSurface, CounterBadge, Input, Radio, RadioGroup } from '@fluentui/react-components';
import { Alert20Regular, ArrowSync16Regular, CheckmarkCircle16Filled, Clock16Regular, Flash16Regular, Send16Regular, ShieldError16Filled, ShieldCheckmark16Regular } from '@fluentui/react-icons';
import { useStore, buildPreview, otherSets, alsoChanged, CsState, Preview } from './store';
import { envs, rules as baseRules } from './data';
import { useT } from './i18n';

export const usePreview = () => { const s = useStore(); return useMemo(() => buildPreview(s), [s.status, s.rules, s.scenario]); };

const stateColor: Record<CsState, 'informative' | 'warning' | 'success' | 'subtle'> = { Open: 'informative', Submitted: 'warning', Approved: 'success', Committed: 'subtle' };
export function StateBadge({ state }: { state: CsState }) { const { t } = useT(); return <Badge appearance="tint" color={stateColor[state]}>{t(state)}</Badge>; }

export function useApproval(pv: Preview) {
  const s = useStore();
  const byEnv = envs.map(e => ({ env: e, zones: pv.affected.filter(a => a.env === e.id) })).filter(x => x.zones.length);
  const done = byEnv.every(x => x.env.level === 'none' || s.approvedBy[x.env.id]);
  const eff: CsState = s.state === 'Submitted' && done ? 'Approved' : s.state;
  return { byEnv, done, eff };
}

export function ChangesList({ onFocus }: { onFocus?: (id: string) => void }) {
  const s = useStore(); const { t } = useT();
  const groups = useMemo(() => { const m = new Map<string, typeof s.edits>(); s.edits.forEach(e => m.set(e.ruleId, [...(m.get(e.ruleId) ?? []), e])); return [...m]; }, [s.edits]);
  if (!groups.length) return <p className="muted">{t('No edits yet. Edit a cell, drag a Rule or use the toolbar.')}</p>;
  return (
    <div className="list">
      {groups.map(([id, es]) => {
        const r = s.rules.find(x => x.id === id) ?? baseRules.find(x => x.id === id); const also = alsoChanged.get(id);
        return (
          <div key={id} className="li clickable" onClick={() => onFocus?.(id)}>
            <div><span className="num">#{s.numbers.get(id) ?? '—'}</span> <b>{r?.name}</b> <span className="rid">{id}</span></div>
            {es.map(e => <div key={e.seq} className="edit"><span className={`ek ${e.kind}`}>{e.kind}</span> {e.field && e.kind === 'edit' ? <><i>{e.field}</i>: <s>{e.before || '∅'}</s> → {e.after}</> : e.before ? <>{e.before} → {e.after}</> : null}</div>)}
            {also && <div className="warn">⚠ {t('also changed in')} “{also.set}” {t('by')} {also.by}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function PreviewView({ pv }: { pv: Preview }) {
  const { t } = useT();
  const ops = pv.nsgs.flatMap(n => n.ops); const ren = pv.nsgs.reduce((a, n) => a + n.renumbered, 0);
  const c = (o: string) => ops.filter(x => x.op === o).length;
  if (!pv.nsgs.length) return <p className="muted">—</p>;
  return (
    <div>
      <div className="summary"><b>{pv.nsgs.length}</b> {t('Managed NSG')}s · <span className="op create">+{c('create')}</span> <span className="op change">~{c('change')}</span> <span className="op delete">−{c('delete')}</span> {t('NSG rules')}{ren ? <> · {ren} {t('Renumbered only').toLowerCase()}</> : null}</div>
      {pv.nsgs.slice(0, 60).map(n => (
        <details key={n.nsg} className="nsg">
          <summary><b>{n.nsg}</b> <span className="muted">{n.zone} · {envs.find(e => e.id === n.env)?.name}</span> <span className="op create">+{n.ops.filter(o => o.op === 'create').length}</span> <span className="op change">~{n.ops.filter(o => o.op === 'change').length}</span> <span className="op delete">−{n.ops.filter(o => o.op === 'delete').length}</span></summary>
          <table className="mini"><tbody>{n.ops.map((o, i) => <tr key={i}><td className={`op ${o.op}`}>{o.op}</td><td>{o.dir}</td><td className="num">{o.priority}</td><td className="mono">{o.name}</td><td className="muted">{o.detail}</td></tr>)}</tbody></table>
        </details>
      ))}
      {ren > 0 && <details className="nsg"><summary className="muted">{t('Renumbered only')}: {ren} {t('NSG rules')} in {pv.nsgs.filter(n => n.renumbered).length} NSGs (priority only, same content)</summary><p className="muted">Grouped, because a move shifts priorities of neighbouring NSG rules without changing what they allow.</p></details>}
      {pv.nsgs.length > 60 && <p className="muted">… {pv.nsgs.length - 60} more NSGs</p>}
      <h4>{t('Rule cost')}</h4>
      <table className="mini"><tbody>{[...pv.cost].map(([id, c]) => <tr key={id}><td className="rid">{id}</td><td>{c.nsgs} NSGs</td><td>{c.nsgRules} {t('NSG rules')}</td></tr>)}</tbody></table>
    </div>
  );
}

export function WriteOrderView({ pv }: { pv: Preview }) {
  const { t } = useT();
  if (pv.unorderable) return (
    <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>{t('This Change set cannot be ordered')}</MessageBarTitle>
      <div>{t('Crossing flows')}:</div><ul>{pv.crossing.map((c, i) => <li key={i}><b>{c.flow}</b>: closes on {c.closes}, opens on {c.opens}</li>)}</ul>
      <div>{t('Split it into two Change sets, one per direction of the flow.')}</div></MessageBarBody></MessageBar>
  );
  if (!pv.steps.length || !pv.steps[0].length) return <p className="muted">—</p>;
  return (
    <div>
      <div className="summary"><b>{pv.steps.length}</b> {pv.steps.length === 1 ? t('step') : t('steps')}{pv.crossing.length ? <> · {pv.crossing.length} {t('Crossing flows')}</> : null}</div>
      {pv.steps.map((step, i) => (
        <div key={i} className="step">
          <div className="step-h">{t('step')} {i + 1} {t('of')} {pv.steps.length} · {step.length} NSGs</div>
          {step.slice(0, 12).map(w => <div key={w.nsg} className="li"><span className="mono">{w.nsg}</span> <span className="muted">{w.why}</span>{w.waitsFor && <div className="muted">↳ {t('waits for')} <span className="mono">{w.waitsFor}</span>{w.holdsBack ? ` · ${w.holdsBack}` : ''}</div>}</div>)}
          {step.length > 12 && <div className="muted">… {step.length - 12} more</div>}
        </div>
      ))}
    </div>
  );
}

export function ApprovalView({ pv }: { pv: Preview }) {
  const s = useStore(); const { t } = useT(); const a = useApproval(pv);
  if (!a.byEnv.length) return <p className="muted">—</p>;
  return (
    <div>
      <p className="muted">{t('Each Affected Zone needs its Approval level.')} {pv.affected.length} {t('Affected Zones')}.</p>
      {a.byEnv.map(({ env, zones }) => {
        const by = s.approvedBy[env.id];
        return (
          <details key={env.id} className="nsg">
            <summary><b>{env.name}</b> · {zones.length} {t('Zones')} · {t(env.level)} · {env.level === 'none' ? <span className="ok">{t('not required')}</span> : by ? <span className="ok"><CheckmarkCircle16Filled /> {t('approved by')} {by}</span> : s.state === 'Open' ? <span className="muted">{t('Waiting for Submit')}</span> : <span className="pending"><Clock16Regular /> {t('waiting')}</span>}</summary>
            <div className="muted">{zones.slice(0, 30).map(z => z.zone).join(', ')}{zones.length > 30 ? ` … +${zones.length - 30}` : ''}</div>
          </details>
        );
      })}
      {s.state === 'Submitted' && !a.done && <Button size="small" className="proto" onClick={() => s.approveAs('kim', a.byEnv.map(x => x.env.id))}>{t('Approve as kim (prototype)')}</Button>}
    </div>
  );
}

export function PolicyView({ pv }: { pv: Preview }) {
  const { t } = useT(); const [ran, setRan] = useState<string | null>(null);
  return (
    <div>
      {pv.policy.map((f, i) => <div key={i} className="li">{f.effect === 'deny' ? <ShieldError16Filled className="b-red" /> : <ShieldCheckmark16Regular />} <b>{f.effect}</b> · {f.assignment}<div className="muted">{f.reason}{f.rule ? ` · Rule ${f.rule}` : ''}</div></div>)}
      <Button size="small" icon={<ArrowSync16Regular />} onClick={() => setRan(new Date().toLocaleTimeString())}>{t('Run check now')}</Button> {ran && <span className="muted">checked {ran}</span>}
    </div>
  );
}

export function CsActions({ pv, compact }: { pv: Preview; compact?: boolean }) {
  const s = useStore(); const { t } = useT(); const a = useApproval(pv); const [em, setEm] = useState(false);
  const denyFinding = pv.policy.some(p => p.effect === 'deny');
  if (s.state === 'Committed') return (
    <MessageBar intent="success" layout="multiline"><MessageBarBody><MessageBarTitle>{t('Committed as Version')} {s.version}</MessageBarTitle>
      {t('Deployments started')}: Production (ARM) running · Non-production (Terraform) pull request, {t('step')} 1 {t('of')} {Math.max(1, pv.steps.length)}{s.emergency ? <div><Flash16Regular /> {t('Emergency Commit')} · {t('awaiting approval afterwards')}</div> : null}
      <div><Button size="small" className="proto" onClick={s.discard}>Reset prototype</Button></div></MessageBarBody></MessageBar>
  );
  return (
    <div className="cs-actions">
      {!compact && <StateBadge state={a.eff} />}
      <Button size="small" onClick={s.discard} disabled={!s.edits.length}>{t('Discard')}</Button>
      {s.state === 'Open' && <Button size="small" icon={<Send16Regular />} appearance="primary" disabled={!s.edits.length || pv.unorderable || denyFinding} onClick={s.submit} title={denyFinding ? 'A deny Policy finding blocks Submit' : undefined}>{t('Submit')}</Button>}
      {s.state !== 'Open' && <Button size="small" appearance="primary" disabled={!a.done || pv.unorderable} onClick={() => s.commit()}>{t('Commit')}</Button>}
      <Button size="small" icon={<Flash16Regular />} disabled={!s.edits.length || pv.unorderable} onClick={() => setEm(true)}>{t('Emergency Commit')}</Button>
      <EmergencyDialog open={em} onClose={() => setEm(false)} />
    </div>
  );
}

function EmergencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore(); const { t } = useT(); const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface><DialogBody><DialogTitle>{t('Emergency Commit')}</DialogTitle>
        <DialogContent>
          <p>Commits without the required Approval. It stays open in every approver's inbox until an approver approves it afterwards. Requires a fresh sign-in (step-up).</p>
          <Field label={t('Reason (required)')} required><Textarea value={reason} onChange={(_, d) => setReason(d.value)} /></Field>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={reason.trim().length < 5} onClick={() => { s.commit(reason); onClose(); }}>{t('Emergency Commit')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

export function ChangeSetList({ vertical }: { vertical?: boolean }) {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const a = useApproval(pv);
  const Row = ({ name, owner, state, extra, current }: { name: string; owner: string; state: CsState; extra?: React.ReactNode; current?: boolean }) => (
    <div className={`li cs ${current ? 'current' : ''}`}><div><b>{name}</b></div><div className="muted"><StateBadge state={state} /> {owner} {extra}</div></div>
  );
  return (
    <div className={vertical ? 'list' : 'list'}>
      <h4>{t('My Change sets')}</h4>
      <Row current name="CHG-5120 Release app0042" owner="you" state={a.eff} extra={<>· {s.edits.length} edits · base v{s.version}</>} />
      <h4>{t('Other Change sets')}</h4>
      {otherSets.map(c => <Row key={c.id} name={c.name} owner={c.owner} state={c.state} extra={<>· {c.edits} edits · {c.affected} {t('Zones')}{c.rebase ? <Badge color="danger" appearance="tint" size="small"> {t('Rebase needed')}</Badge> : null}{c.scheduled ? <> · {t('Scheduled')} {c.scheduled}</> : null}{c.emergency ? <Badge color="warning" appearance="tint" size="small">{t('Emergency Commit')}</Badge> : null}</>} />)}
    </div>
  );
}

const inbox = [
  { k: 'Approval', text: 'kim asks for Approval: “Q4 cleanup of expired Rules” (63 Zones, four-eyes)' },
  { k: 'Emergency', text: 'Emergency Commit by sam awaits approval afterwards: “Hotfix: block 203.0.113.0/24”' },
  { k: 'Conflict', text: '“Onboard vnet-app0107” (alex) needs a Rebase: 2 conflicts' },
  { k: 'Expiry', text: '14 of your Rules expire within 7 days' },
  { k: 'Rejected', text: 'jo rejected “Open RDP for vendor”: “use the jump hosts”' },
];
export function InboxButton() {
  const { t } = useT();
  return (
    <Popover positioning="below-end"><PopoverTrigger disableButtonEnhancement>
      <Button appearance="subtle" icon={<span style={{ position: 'relative' }}><Alert20Regular /><CounterBadge count={inbox.length} size="small" color="danger" style={{ position: 'absolute', top: -6, right: -8 }} /></span>} aria-label={t('Inbox')} />
    </PopoverTrigger><PopoverSurface style={{ width: 380 }}>
      <h4 style={{ marginTop: 0 }}>{t('Inbox')}</h4>
      {inbox.map((i, n) => <div key={n} className="li"><Badge appearance="outline" size="small">{i.k}</Badge> {i.text}</div>)}
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
