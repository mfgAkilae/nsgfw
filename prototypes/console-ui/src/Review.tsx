// PROTOTYPE, throwaway. Review: the whole Change set on one wide screen before Submit.
// Left: what was edited. Middle: one Rule before and after, and what it writes in Azure. Right: order, Approval, Policy, and the action.
import { ReactNode, useEffect, useState } from 'react';
import { HandoverBlock } from './ImportNote';   // issue 37
import { Dismiss20Regular, ArrowRight16Regular, Checkmark12Filled, Dismiss12Filled } from '@fluentui/react-icons';
import { useStore } from './store';
import { rules as baseRules, envs } from './data';
import { ChangesList, PreviewView, WriteOrderView, ApprovalView, PolicyView, CsActions, usePreview, useApproval } from './ChangeViews';
import { Track } from './Pages';
import { Chip } from './ObjectPicker';
import { useT } from './i18n';
import { useSession } from './session';

// Issue 36: the same screen serves the approver and the other Change sets; each part can be replaced.
export function Review({ onClose, onRule, title, summary, banner, left, middle, right, track, warnAt, readOnly }: { onClose: () => void; onRule: (id: string) => void; title?: string; summary?: ReactNode; banner?: ReactNode;
  left?: ReactNode; middle?: ReactNode; right?: ReactNode; track?: number; warnAt?: number; readOnly?: boolean }) {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv); const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const r = sel ? s.rules.find(x => x.id === sel) ?? baseRules.find(x => x.id === sel) : undefined; const st = sel ? s.status.get(sel) : undefined;
  const edits = s.edits.filter(e => e.ruleId === sel && e.kind !== 'folder');
  const ops = pv.nsgs.flatMap(n => n.ops.filter(o => o.rule === sel).map(o => ({ ...o, nsg: n.nsg, env: n.env })));
  const need = ap.byEnv.filter(x => x.env.level !== 'none').length; const ruleCount = [...s.status.keys()].length;
  return (
    <div className="review" role="dialog" aria-label={t('Review')}>
      <header className="rv-h">
        <div><h1>{t('Review')} {title ?? 'CHG-5120 Release app0042'}</h1>
          <p>{summary ?? <>{ruleCount} {t(ruleCount === 1 ? 'Rule' : 'Rules')} {t('changed')}. {pv.nsgs.length} {t('Managed NSGs change')} {t('in')} {ap.byEnv.length} {t(ap.byEnv.length === 1 ? 'Environment' : 'Environments')}. {pv.unorderable ? t('Cannot be ordered') : `${Math.max(1, pv.steps.length)} ${t(pv.steps.length > 1 ? 'write steps' : 'write step')}`}. {need ? `${need} ${t('Approvals')}` : t('No Approval needed')}.</>}</p></div>
        <span className="sp" /><Track at={track ?? (s.state === 'Committed' ? 4 : ap.eff === 'Approved' ? 3 : s.state === 'Submitted' ? 2 : 0)} warnAt={warnAt} labels />
        <button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button>
      </header>
      {banner && <div className="rv-banner">{banner}</div>}
      <div className="rv-b">
        <section className="rv-c rv-l">{left ?? <><h3>{t('Changes')}</h3>
          <button className={`rv-all ${sel === null ? 'on' : ''}`} onClick={() => setSel(null)}>{t('Everything that changes in Azure')}<span>{pv.nsgs.length} NSGs</span></button>
          <ChangesList onFocus={setSel} selected={sel} /></>}</section>
        <section className="rv-c rv-m">
          {middle ? middle : !r ? <><h3>{t('What changes in Azure')}</h3><PreviewView pv={pv} /></> : <>
            <div className="rv-rule"><span className="muted">{s.numbers.get(r.id) ?? '—'}</span><h2>{r.name}</h2><span className={`act ${r.action}`}>{r.action === 'allow' ? <Checkmark12Filled /> : <Dismiss12Filled />}{t(r.action === 'allow' ? 'Allow' : 'Deny')}</span>
              <span className="sp" />{!readOnly && <button className="lens-x" onClick={() => { onClose(); onRule(r.id); }}>{t('Open in the Rule base')}<ArrowRight16Regular /></button>}</div>
            <div className="rv-flow"><div className="chips">{r.src.map(x => <Chip key={x} id={x} />)}</div><ArrowRight16Regular className="flow" /><div className="chips">{r.dst.map(x => <Chip key={x} id={x} />)}</div><div className="chips">{r.svc.map(x => <Chip key={x} id={x} />)}</div></div>
            <h3>{t('Before and after')}</h3>
            <table className="mini diff"><thead><tr><th>{t('What')}</th><th>{t('Before')}</th><th>{t('After')}</th></tr></thead><tbody>
              {st?.added && <tr><td><span className="ek add">{t('Added')}</span></td><td className="muted">{t('did not exist')}</td><td>{t('new Rule at number')} {s.numbers.get(r.id)}</td></tr>}
              {st?.deleted && <tr><td><span className="ek delete">{t('Deleted')}</span></td><td>{t('Rule at number')} {(s.base.get(r.id)?.pos ?? 0) + 1}</td><td className="muted">{t('gone')}</td></tr>}
              {edits.filter(e => e.kind !== 'add' && e.kind !== 'delete').map(e => <tr key={e.seq}><td>{e.kind === 'move' ? t('Position') : e.kind === 'edit' ? e.field : t('Enabled')}</td><td><s>{e.before || '∅'}</s></td><td>{e.after}</td></tr>)}
            </tbody></table>
            <h3>{t('In Azure')}</h3>
            {ops.length ? <table className="mini"><thead><tr><th></th><th>{t('Managed NSG')}</th><th>{t('Environment')}</th><th>Dir.</th><th>Priority</th><th>NSG rule</th></tr></thead><tbody>
              {ops.slice(0, 40).map((o, i) => <tr key={i}><td className={`op ${o.op}`}>{o.op}</td><td className="mono">{o.nsg}</td><td>{envs.find(e => e.id === o.env)?.name}</td><td>{o.dir === 'in' ? t('Inbound') : t('Outbound')}</td><td>{o.priority}</td><td className="mono">{o.name}</td></tr>)}</tbody></table>
              : <p className="muted">{t('Nothing is written for this Rule.')}</p>}
            {ops.length > 40 && <p className="muted">{ops.length - 40} {t('more')}</p>}
          </>}
        </section>
        <section className="rv-c rv-r">{right ?? <>
          <h3>{t('Write order')}</h3><WriteOrderView pv={pv} />
          <h3>{t('Approval')}</h3><ApprovalView pv={pv} />
          <FlushNote envIds={[...new Set(pv.nsgs.map(n => n.env))]} />
          <HandoverBlock />
          <h3>{t('Policy findings')}</h3><PolicyView pv={pv} />
          <div className="rv-act"><CsActions pv={pv} compact /></div></>}
        </section>
      </div>
    </div>
  );
}

// Issue 38: with flushConnection off, closing a flow does not end the connections that are already running.
function FlushNote({ envIds }: { envIds: string[] }) {
  const se = useSession(); const { t } = useT(); const off = envIds.filter(e => !se.envSettings[e]?.flush);
  if (!off.length) return null;
  return <div className="rv-note"><b>{t('Running connections')}</b><p>{off.map(e => t(envs.find(x => x.id === e)?.name ?? e)).join(', ')}: {t('flushConnection is off. A connection that this Change set closes keeps running until it ends. Revoked access does not end running sessions.')}</p></div>;
}
