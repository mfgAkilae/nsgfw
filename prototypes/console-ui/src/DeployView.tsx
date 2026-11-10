// PROTOTYPE, throwaway. Issue 37: the Deployment view, a wide screen like Review, for one Commit with a tab per Environment.
// Left: the plan (the checks before the first write, the steps and what they wait for). Middle: every write. Right: one write in full.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@fluentui/react-components';
import { Dismiss20Regular, ArrowClockwise16Regular, ArrowUndo16Regular, DocumentBulletList16Regular, Checkmark16Filled, Dismiss16Filled, Warning16Filled,
  Timer16Regular, Open12Regular, ArrowRight16Regular, ShieldError16Filled, Info16Regular, ErrorCircle16Filled } from '@fluentui/react-icons';
import { envs, zoneById } from './data';
import { roleRank } from './access';
import { go37 } from './ops37';
import { useSession, now } from './session';
import { useT } from './i18n';
import { useDeploys, groupOf, progress, stepsOf, isCurrent, startLive, replay, startRetry, fill, dur, TODAY, YESTERDAY, type Msg, type Deployment, type Write, type Pr, type Bound } from './deploydata';
import './deploy.css';

/** An inbox row from the issue 37 views. Console.tsx merges these into the inbox. */
export interface Item37 { id: string; kind: 'deploy' | 'drift' | 'import'; tone: 'red' | 'amber' | ''; text: string; when: string; action: string; go: () => void }

type T = (k: string) => string;
const day = (t: T, a: string | number) => (typeof a === 'string' ? a.replace(/^(today|yesterday)(?= )/, x => t(x)) : a);
export const msg = (t: T, x: Msg) => fill(t(x[0]), x.slice(1).map(a => day(t, a)));
export const envName = (id: string) => envs.find(e => e.id === id)?.name ?? id;
export const whenOf = (t: T, ts: string) => (ts.startsWith(TODAY) ? `${t('today')} ${ts.slice(11)}` : ts.startsWith(YESTERDAY) ? `${t('yesterday')} ${ts.slice(11)}` : ts);
export const kindLabel: Record<Write['kind'], string> = { nsg: 'NSG', assoc: 'association', asg: 'Managed ASG', asgdel: 'Managed ASG deleted', join: 'membership join', leave: 'membership leave' };
export const startTag: Record<Deployment['start'], [string, string] | null> = { commit: null, scheduled: ['', 'Scheduled'], emergency: ['red', 'Emergency Commit'], retry: ['accent', 'Retry'],
  overwrite: ['', 'Overwrite'], auto: ['', 'automatic Overwrite'], catchup: ['', 'catch-up'] };
export const vkindTag: Record<string, string> = { expiry: 'Expiry', retranslation: 'Re-translation', restore: 'Restore' };

/** The state of a Deployment in words, with its colour: amber while it runs or waits, red when it failed, green when deployed. */
export function stateOf(d: Deployment): { tone: 'ok' | 'amber' | 'red' | 'off'; text: Msg } {
  const p = progress(d); const n = stepsOf(d);
  if (d.state === 'running' || d.state === 'queued') {
    const pr = d.prs?.find(x => x.state === 'open' || x.state === 'merged');
    if (pr) return { tone: 'amber', text: [pr.state === 'open' ? 'step {0} of {1} · pull request open' : 'step {0} of {1} · merged, awaiting apply', pr.step, n] };
    if (d.prs) return { tone: 'amber', text: ['step {0} of {1} · waits for the Settle time', Math.min(n, 1 + d.prs.filter(x => x.state === 'deployed').length), n] };
    return { tone: 'amber', text: [d.state === 'queued' ? 'queued' : 'running'] };
  }
  if (d.state === 'deployed') return { tone: 'ok', text: p.skipped ? ['deployed, {0} skipped', p.skipped] : ['deployed'] };
  if (d.state === 'superseded') return { tone: 'off', text: d.supersededBy ? ['superseded by Version {0}', d.supersededBy] : ['superseded'] };
  if (d.state === 'stopped') return { tone: isCurrent(d) ? 'red' : 'off', text: isCurrent(d) ? ['stopped before the first write'] : ['stopped before the first write, then delivered'] };
  if (!isCurrent(d)) return { tone: 'off', text: ['failed, then retried'] };
  const pr = d.prs?.find(x => x.state === 'policy' || x.state === 'notApplied' || x.state === 'closed');
  if (pr) return { tone: 'red', text: pr.state === 'policy' ? ['apply failed: policy'] : pr.state === 'notApplied' ? ['merged, not applied'] : ['closed without merge by {0}', pr.by ?? ''] };
  const w = d.writes.find(x => x.state === 'policy' || x.state === 'failed');
  return { tone: 'red', text: w?.state === 'policy' ? ['failed · changed by Azure Policy on write'] : ['failed · {0}', w?.code ?? ''] };
}
export function StateTag({ d }: { d: Deployment }) { const { t } = useT(); const s = stateOf(d); return <span className={`dp-s ${s.tone} ${d.state === 'running' && !d.prs ? 'live' : ''}`}><i className="dep" /><span>{msg(t, s.text)}</span></span>; }

/** One write's state in words. */
function writeState(w: Write, d: Deployment): { tone: 'ok' | 'amber' | 'red' | 'off'; text: Msg } {
  switch (w.state) {
    case 'waiting':
      if (w.wait === 'failed') return { tone: 'red', text: ['waits for {0}, which failed', w.waitsFor ?? ''] };
      if (w.wait === 'slot') return { tone: 'amber', text: ['waits for a free write slot'] };
      if (w.wait === 'precheck') return { tone: 'amber', text: [d.start === 'retry' ? 'waits for the policy pre-check, which runs again' : 'waits for the pre-check'] };
      if (w.wait === 'step') return { tone: 'amber', text: ['waits for step {0} and the Settle time', w.step - 1] };
      if (w.edge === 'dependency') return { tone: 'amber', text: ['waits for {0}', w.waitsFor ?? ''] };
      return { tone: 'amber', text: w.left ? ['waits for {0} + Settle time {1} s', w.waitsFor ?? '', w.left] : ['waits for {0} + Settle time', w.waitsFor ?? ''] };
    case 'writing': return { tone: 'amber', text: w.at ? ['writing since {0}', w.at] : ['writing'] };
    case 'retrying': return { tone: 'amber', text: w.retryAfter ? ['retrying, attempt {0} · {1}, Retry-After {2} s', w.attempts, w.code ?? '', w.retryAfter] : ['retrying, attempt {0} · {1}', w.attempts, w.code ?? ''] };
    case 'done': return { tone: 'ok', text: w.inFlight ? ['done {0}, in flight when superseded', w.end ?? ''] : w.byV ? ['done {0}, delivers Version {1}', w.end ?? '', w.byV] : d.prs ? ['deployed: Azure shows the target'] : ['done {0}', w.end ?? ''] };
    case 'failed': return { tone: 'red', text: w.code === 'not applied' ? ['merged, not applied'] : d.prs && w.code === 'RequestDisallowedByPolicy' ? ['apply failed: policy'] : ['failed · {0}', w.code ?? ''] };
    case 'policy': return { tone: 'red', text: ['changed by Azure Policy on write'] };
    case 'skipped': return { tone: 'off', text: ['not deployed: {0}', w.skip ? w.skip[0] : ''] };
    case 'stopped': return { tone: 'off', text: d.supersededBy ? ['not written: superseded by Version {0}', d.supersededBy] : d.state === 'stopped' ? ['not written'] : ['not written: the pull request was closed'] };
    case 'pr': return { tone: 'amber', text: ['in pull request #{0}, waiting for the apply', w.pr ?? ''] };
  }
}
function WState({ w, d }: { w: Write; d: Deployment }) {
  const { t } = useT(); const s = writeState(w, d);
  const text = w.state === 'skipped' && w.skip ? `${fill(t('not deployed: {0}'), [msg(t, w.skip)])}` : msg(t, s.text);
  return <span className={`dp-s ${s.tone} ${w.state === 'writing' || w.state === 'retrying' ? 'live' : ''}`}><i className="dep" /><span>{text}</span></span>;
}

const checkTitle: Record<string, string> = { drift: 'Drift pre-check', policy: 'Policy pre-check', limits: 'Live limits', perm: 'Azure permissions', contract: 'Data contract files' };
const prWords: Record<Pr['state'], string> = { open: 'pull request open', merged: 'merged, awaiting apply', deployed: 'deployed', policy: 'apply failed: policy', notApplied: 'merged, not applied', closed: 'closed without merge', superseded: 'superseded', later: 'not opened yet' };
const prTone = (s: Pr['state']) => (s === 'deployed' ? 'ok' : s === 'open' || s === 'merged' ? 'amber' : s === 'policy' || s === 'notApplied' || s === 'closed' ? 'red' : 'off');

export function DeployView({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT(); const all = useDeploys(); const se = useSession();
  const [cur, setCur] = useState(id); const [selW, setSelW] = useState<string | null>(null); const [chip, setChip] = useState<'all' | 'waiting' | 'failed' | 'done' | 'skipped'>('all');
  useEffect(() => { setCur(id); }, [id]);
  useEffect(() => { setSelW(null); setChip('all'); }, [cur]);
  useEffect(() => { startLive(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const d = all.find(x => x.id === cur);
  const tabs = useMemo(() => (d ? groupOf(all, d) : []), [all, d]);
  if (!d) return (
    <div className="review dp-view" role="dialog" aria-label={t('Deployment')}>
      <header className="rv-h"><div><h1>{t('Deployment')}</h1><p>{t('There is no Deployment with this ID.')} <span className="mono">{cur}</span></p></div><span className="sp" /><button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button></header>
    </div>);

  const m = (x: Msg) => msg(t, x); const p = progress(d); const S = se.settle; const tf = d.env === 'nonprod'; const nSteps = stepsOf(d);
  const settings = se.envSettings[d.env]; const repo = settings?.repo ?? 'https://git.example.org/network/nonprod-nsg'; const timeout = dur((settings?.applyTimeout ?? 120) * 60);
  const failed = isCurrent(d) && (d.state === 'failed') ? d.writes.filter(w => w.state === 'failed' || w.state === 'policy') : [];
  const scopeOf = (w: Write) => { const z = zoneById.get(w.zone)!; return w.kind === 'asg' || w.kind === 'asgdel' ? z.vnet : z.name; };
  const lacks = (w: Write) => { const r = se.zoneRole(zoneById.get(w.zone)!); return !r || roleRank[r] < roleRank.editor ? fill(t('Needs the editor Role in {0}. You hold {1} there.'), [scopeOf(w), r ? t(r) : t('no Role')]) : null; };
  const block = failed.map(lacks).find(Boolean) ?? null;
  const retryNote = tf ? t('Opens a pull request that changes only the revision value. No Approval needed.') : t('No Approval needed; the policy pre-check runs again for the retried writes.');
  const retry = (ws: Write[]) => {
    const nid = startRetry(d, ws.map(w => w.id), 'you', now().toTimeString().slice(0, 8));
    se.log({ cat: 'deploy', action: 'Retried writes', object: `${d.v ? `Version ${d.v}` : m(d.what ?? ['Deployment'])} to ${envName(d.env)}: ${ws.map(w => w.res).join(', ')}`, scopes: [{ kind: 'env', id: d.env }], result: 'ok', detail: tf ? 'A pull request that changes only the revision value' : 'No Approval; the policy pre-check runs again' });
    se.toast(t('Retry started. It is in the audit log.')); setCur(nid);
  };

  const counts = { all: d.writes.length, waiting: d.writes.filter(w => ['waiting', 'writing', 'retrying', 'pr'].includes(w.state)).length, failed: d.writes.filter(w => w.state === 'failed' || w.state === 'policy').length,
    done: d.writes.filter(w => w.state === 'done').length, skipped: d.writes.filter(w => w.state === 'skipped').length };
  const shown = d.writes.filter(w => chip === 'all' || (chip === 'waiting' ? ['waiting', 'writing', 'retrying', 'pr'].includes(w.state) : chip === 'failed' ? w.state === 'failed' || w.state === 'policy' : w.state === chip));
  const pick = d.writes.find(w => w.state === 'failed' || w.state === 'policy') ?? d.writes.find(w => w.state === 'waiting' && w.holds) ?? d.writes.find(w => w.state === 'writing' || w.state === 'retrying' || w.state === 'pr') ?? d.writes.find(w => w.state === 'skipped') ?? d.writes[0];
  const w = d.writes.find(x => x.id === selW) ?? pick;
  const title = d.v !== null && d.start !== 'catchup' ? `${t('Deployment of Version')} ${d.v}` : d.what ? m(d.what) : t('Deployment');
  const by = d.by === 'nsgfw' ? t('the tool') : d.by === 'you' ? t('you') : d.by;
  const byLabel = d.start === 'emergency' ? 'Emergency Commit by' : d.start === 'scheduled' ? 'Scheduled Commit by' : d.start === 'retry' ? 'Retry by' : d.start === 'overwrite' ? 'Overwrite by' : d.start === 'auto' || d.start === 'catchup' ? 'Started by' : 'Committed by';
  const running = d.state === 'running' || d.state === 'queued';

  // ---------- banner
  const banner = (() => {
    if (d.state === 'superseded') return <div className="bn info"><Info16Regular /><span>{fill(t('Superseded by Version {0}. It stopped after its writes in flight; {0} plans from the Deployed state and also delivers what this one did not.'), [d.supersededBy ?? ''])}</span></div>;
    if (d.state === 'stopped') return <div className={`bn ${isCurrent(d) ? 'red' : ''}`}><ErrorCircle16Filled /><span><b>{t('Stopped before the first write:')}</b> {d.stopped && m(d.stopped)} {t('Nothing was written.')} {d.resolved && m(d.resolved)}.</span></div>;
    if (d.state === 'failed' && d.retried) return <div className="bn"><Info16Regular /><span>{fill(t('Retried by {0} {1}.'), [d.retried.by === 'you' ? t('you') : d.retried.by, day(t, d.retried.at)])} <a className="link" onClick={() => setCur(d.retried!.id)}>{t('Open the Retry')}</a></span></div>;
    if (d.state === 'failed') {
      const pol = d.writes.find(x => x.state === 'policy'); const wait = d.writes.filter(x => x.wait === 'failed' || x.wait === 'step').length; const pr = d.prs?.find(x => x.state !== 'deployed' && x.state !== 'later');
      const what = pol ? fill(t('{0} was changed by Azure Policy on write.'), [pol.res]) : pr?.state === 'policy' ? fill(t('The apply of pull request #{0} failed on a policy: {1}.'), [pr.n ?? '', t(pr.assignment ?? '')]) : pr?.state === 'notApplied' ? fill(t('Pull request #{0} is merged, but Azure did not show the target within the apply timeout ({1}).'), [pr.n ?? '', timeout])
        : pr?.state === 'closed' ? fill(t('Pull request #{0} was closed without merge by {1}. The tool never reopens it.'), [pr.n ?? '', pr.by ?? '']) : fill(t('{0} failed: {1}.'), [failed[0]?.res ?? '', failed[0]?.code ?? '']);
      return <div className="bn red"><ErrorCircle16Filled /><span><b>{what}</b> {wait ? fill(t(tf ? (wait === 1 ? '{0} write of a later step waits for it.' : '{0} writes of a later step wait for it.') : wait === 1 ? '{0} write waits for it; everything else is deployed.' : '{0} writes wait for it; everything else is deployed.'), [wait]) : ''} {tf ? t('Retry opens a pull request that changes only the revision value, without an Approval.') : t('Retry failed writes runs them again without an Approval; the policy pre-check runs again first.')}</span></div>;
    }
    if (d.emergencyOpen) return <div className="bn amber"><Warning16Filled /><span>{t('The pull request of this Emergency Commit is open since 3 h. Until it is merged and applied, the change is not in Azure. The Rule owner and the admins get a notice, repeated daily.')}</span></div>;
    if (d.retryOf) { const of = all.find(x => x.id === d.retryOf); return of ? <div className="bn"><Info16Regular /><span>{fill(t('Retry of the Deployment of {0}, which failed.'), [whenOf(t, of.ts)])} <a className="link" onClick={() => setCur(of.id)}>{t('Open it')}</a></span></div> : null; }
    return null;
  })();

  // ---------- Plan
  const bound = (k: number) => d.bounds.find(b => b.after === k);
  const stepState = (k: number) => { const ws = d.writes.filter(x => x.step === k); const pr = d.prs?.find(x => x.step === k);
    if (pr) return pr.state === 'deployed' ? 'done' : pr.state === 'open' || pr.state === 'merged' ? 'run' : pr.state === 'later' || pr.state === 'superseded' ? '' : 'bad';
    if (ws.length && ws.every(x => x.state === 'stopped')) return 'stopped';
    return ws.some(x => x.state === 'failed' || x.state === 'policy') ? 'bad' : ws.length && ws.every(x => x.state === 'done' || x.state === 'skipped') ? 'done' : ws.some(x => x.state === 'writing' || x.state === 'retrying') ? 'run' : ''; };
  const stepWords: Record<string, [string, string]> = { done: ['ok', 'done'], run: ['amber', 'writing'], bad: ['red', 'failed'], stopped: ['off', 'not written'], '': ['off', 'waits'] };
  const settle = (b: Bound) => <div className={`dp-settle ${b.state}`}><b><Timer16Regular />{t('Settle time')} {S} s<em>{b.state === 'running' ? fill(t('{0} s left'), [b.left ?? 0]) : b.state === 'done' ? t('passed') : b.state === 'held' ? t('held: the write before it failed') : t('not started')}</em></b>{m(b.text)}</div>;
  const total = p.total; const groups = d.groups ?? 1; const per = Math.ceil(total / groups); const waitMin = (Math.ceil(per / 500) - 1) * 5;
  const budget = groups > 1 ? fill(t(waitMin ? '{0} writes in {1} subscription and region pairs; 500 per 5 minutes in each: waits about {2} min.' : '{0} writes in {1} subscription and region pairs; 500 per 5 minutes in each: no wait.'), [total.toLocaleString('en'), groups, waitMin])
    : fill(t(total === 1 ? '1 write; 500 per 5 minutes per subscription and region: no wait.' : '{0} writes; 500 per 5 minutes per subscription and region: no wait.'), [total]);
  const k = d.bounds.length; const waits = !k ? t('Nothing waits: no Crossing flow and no member steps.') : fill(t(k === 1 ? 'Waits {0} s in all: 1 step boundary × Settle time.' : 'Waits {0} s in all: {1} step boundaries × Settle time.'), [k * S, k]);

  const prCard = (pr: Pr) => <div className={`dp-pr ${prTone(pr.state) === 'amber' ? 'run' : prTone(pr.state) === 'red' ? 'bad' : pr.state === 'later' ? 'later' : ''}`}>
    {pr.n ? <div className="dp-pr-h"><a className="link mono" href={`${repo}/pull/${pr.n}`} target="_blank" rel="noreferrer">#{pr.n}</a><span className="mono">nsgfw/deploy-{d.v}-step-{pr.step}</span></div> : null}
    <p>{pr.state === 'open' ? `${t(settings?.autoMerge ? 'auto-merge requested' : 'waits for a review')} · ${t('opened')} ${pr.at ?? ''}`
      : pr.state === 'merged' ? fill(t('merged, awaiting apply · apply timeout {0}'), [timeout])
      : pr.state === 'deployed' ? t('deployed: Azure shows the target')
      : pr.state === 'policy' ? <>{t('apply failed: policy')} · {t(pr.assignment ?? '')}. {t('Set from the failed check of the merge commit; observation continues.')} <a className="link" href={`${repo}/pull/${pr.n}/checks`} target="_blank" rel="noreferrer">{t('The check')}</a></>
      : pr.state === 'notApplied' ? fill(t('merged, not applied: Azure did not show the target within the apply timeout ({0}). A Retry opens a pull request that changes only the revision value.'), [timeout])
      : pr.state === 'closed' ? fill(t('closed without merge by {0}. The tool never reopens it; a Retry opens a new pull request, without an Approval.'), [pr.by ?? ''])
      : pr.state === 'superseded' ? fill(t('closed, superseded by #{0}'), [pr.supersededBy ?? ''])
      : fill(t('opens once Azure shows step {0} and the Settle time has passed'), [pr.step - 1])}</p>
    {pr.state !== 'later' && <dl className="kv">
      <dt>{t('Changes')}</dt><dd className="mono">{pr.files.slice(0, 2).join(', ')}{pr.files.length > 2 && <span className="muted"> {fill(t('and {0} more files'), [pr.files.length - 2])}</span>}</dd>
      <dt>{t('Revision')}</dt><dd className="mono">{pr.rev}</dd>
      {pr.head && <><dt>{t('Head')}</dt><dd className="mono">{pr.head}</dd></>}
      <dt>Azure</dt><dd>{fill(t('{0} of {1} resources at the target'), [pr.seen[0].toLocaleString('en'), pr.seen[1].toLocaleString('en')])}</dd></dl>}
    {pr.n && <a className="link" href={`${repo}/pull/${pr.n}`} target="_blank" rel="noreferrer">{t('Opened in the repository')} <Open12Regular /></a>}
  </div>;

  // ---------- one write
  const dependants = w ? d.writes.filter(x => x.waitsFor === w.res && x.state !== 'done' && x.id !== w.id) : [];
  const change = (x: Write) => x.kind === 'nsg' ? (x.chg?.[2] ? fill(t(x.chg[2] === 1 ? 'NSG rules +{0} −{1}, 1 priority changes' : 'NSG rules +{0} −{1}, {2} priorities change'), x.chg) : fill(t('NSG rules +{0} −{1}'), x.chg ?? [0, 0]))
    : x.kind === 'assoc' ? fill(t('Associates the subnet with {0}'), [x.target ?? '']) : x.kind === 'asg' ? t('Creates the Managed ASG') : x.kind === 'asgdel' ? t('Deletes the Managed ASG, after its last member left')
    : fill(t(x.kind === 'join' ? 'The network interface joins {0}' : 'The network interface leaves {0}'), [x.target ?? '']);
  const edgeWord = (x: Write) => x.edge === 'crossing' ? t('Crossing flow') : x.edge === 'member' ? t('member step') : t('dependency');
  const wFailed = w && (w.state === 'failed' || w.state === 'policy') && isCurrent(d) && d.state === 'failed';
  const wBlock = w && wFailed ? lacks(w) : null;

  return (
    <div className="review dp-view" role="dialog" aria-label={t('Deployment')}>
      <header className="rv-h">
        <div className="dp-vh"><h1>{title}</h1>
          <p><StateTag d={d} />{running && !tf && <span>{p.done} {t('of')} {p.total.toLocaleString('en')} {t('writes')}</span>}{d.cs && <b>{d.cs}</b>}<span>{t(byLabel)} {by}, {whenOf(t, d.ts)}</span>{tabs.length < 2 && <span className="muted">{t(envName(d.env))} · {d.env === 'nonprod' ? 'Terraform' : 'ARM'}</span>}</p></div>
        {tabs.length > 1 && <div className="seg2 dp-tabs" role="tablist">{tabs.map(x => { const s = stateOf(x);
          return <button key={x.id} role="tab" aria-selected={x.id === d.id} className={x.id === d.id ? 'on' : ''} onClick={() => setCur(x.id)}><i className={`dep ${s.tone === 'ok' ? 'ok' : s.tone === 'red' ? 'failed' : s.tone === 'amber' ? 'running' : 'none'}`} />{t(envName(x.env))}</button>; })}</div>}
        <span className="sp" />
        {d.live && <Button size="small" className="proto" onClick={replay}>{t('Replay (prototype)')}</Button>}
        {failed.length > 0 && <Button appearance="primary" icon={<ArrowClockwise16Regular />} disabled={!!block} title={block ?? retryNote} onClick={() => retry(failed)}>{t('Retry failed writes')} ({failed.length})</Button>}
        {d.v !== null && <Button icon={<ArrowUndo16Regular />} onClick={() => go37({ to: 'versions', n: d.v! })}>{t('Revert this Commit')}</Button>}
        <Button appearance="subtle" icon={<DocumentBulletList16Regular />} onClick={() => go37({ to: 'audit' })}>{t('In the audit log')}</Button>
        <button className="ib" title={t('Close')} onClick={onClose}><Dismiss20Regular /></button>
      </header>
      {banner && <div className="rv-banner">{banner}</div>}
      <div className="rv-b">
        <section className="rv-c rv-l">
          <h3>{t('Before the first write')}</h3>
          {d.pre.map(c => <div key={c.what} className={`dp-chk ${c.tone}`}>{c.tone === 'ok' ? <Checkmark16Filled /> : c.tone === 'bad' ? <Dismiss16Filled /> : <Warning16Filled />}
            <div><b>{t(checkTitle[c.what])}</b><span>{m(c.text)}</span>{c.more?.map((x, i) => <span key={i} className="more">{m(x)}</span>)}</div></div>)}
          <h3>{t(tf ? 'Pull requests' : 'Write order')}</h3>
          {tf && !d.prs ? <p className="dp-note">{t('No pull request was opened.')}</p>
            : !tf && nSteps === 1 && !k ? <p className="dp-note">{t('One step: every write in any order, nothing waits.')}</p>
            : <div className="steps dp-steps">{Array.from({ length: nSteps }, (_, i) => i + 1).map(n => { const pr = d.prs?.find(x => x.step === n); const ss = stepState(n); const b = bound(n);
                const words = pr ? [prTone(pr.state), prWords[pr.state]] : stepWords[ss];
                return <Fragment key={n}><div className={`stepx ${ss}`}><span className="n">{n}</span>
                  <div className="h"><b>{tf ? fill(t('Step {0} of {1}'), [n, nSteps]) : `${t('Step')} ${n}`}</b><span className="muted">{(() => { const c = d.writes.filter(x => x.step === n).length + (n === 1 ? d.more ?? 0 : 0); return fill(t(c === 1 ? '1 write' : '{0} writes'), [c.toLocaleString('en')]); })()}</span><span className={`dp-s ${words[0]}`}>{t(words[1])}</span></div>
                  {pr && prCard(pr)}</div>
                  {b && settle(b)}</Fragment>; })}</div>}
          {tf && nSteps > 1 && <p className="dp-note">{t('Every pull request carries the whole Data contract; resources of later steps keep their Deployed content.')}</p>}
          <p className="dp-note">{tf ? t('The pipeline of the repository plans and applies; nsgfw holds only the Reader role there. A step counts as deployed only when Azure shows its target, never on merge.') : <>{budget} {t('At most 10 writes in flight per subscription and region, one per resource; Retry-After is honoured.')}</>}</p>
          <p className="dp-note"><b>{waits}</b></p>
        </section>

        <section className="rv-c rv-m">
          <h3>{t('Writes')} <span className="muted">{p.done.toLocaleString('en')} {t('of')} {p.total.toLocaleString('en')} {t(tf ? 'at the target' : 'done')}</span></h3>
          <div className="chipbar dp-wchips">{(['all', 'waiting', 'failed', 'done', 'skipped'] as const).map(c => <button key={c} className={`chip ${c === 'failed' ? 'c-deny' : c === 'waiting' ? 'c-expiring' : c === 'skipped' ? 'c-unused' : ''} ${chip === c ? 'on' : ''} ${counts[c] || c === 'all' ? '' : 'zero'}`} disabled={!counts[c] && c !== 'all'} onClick={() => setChip(c)}>{t(c === 'all' ? 'All' : c)}<i>{counts[c]}</i></button>)}</div>
          <div className="dp-wt">
            <div className="dp-wr dp-wh"><span>{t('Resource')} · {t('Kind')} · {t('Zone')}</span><span>{tf ? 'PR' : t('Step')}</span><span>{t('State')}</span></div>
            {shown.map(x => <div key={x.id} className={`dp-wr ${w?.id === x.id ? 'on' : ''}`} onClick={() => setSelW(x.id)}>
              <span className="dp-rc"><b className="mono" title={x.res}>{x.res}</b><span>{t(kindLabel[x.kind])} · {scopeOf(x)}</span></span><span>{tf ? (x.pr ? `#${x.pr}` : '—') : x.step}</span><WState w={x} d={d} /></div>)}
            {!shown.length && <div className="dp-wmore">{t('No write in this state.')}</div>}
            {!!d.more && chip === 'all' && <div className="dp-wmore">{fill(t('and {0} more writes like these, not listed in the prototype'), [d.more.toLocaleString('en')])}</div>}
          </div>
        </section>

        <section className="rv-c rv-r dp-w">{!w ? <p className="muted" style={{ marginTop: 16 }}>{t('Nothing was written.')}</p> : <>
          <div className="lib-k" style={{ marginTop: 16 }}>{t(kindLabel[w.kind])} · {tf ? `${fill(t('Step {0} of {1}'), [w.step, nSteps])}${w.pr ? ` · #${w.pr}` : ''}` : `${t('Step')} ${w.step}`}</div>
          <h2 className="mono dp-res">{w.res}</h2>
          <WState w={w} d={d} />
          <h3>{t('What it changes')}</h3>
          <p className="cd-p" style={{ margin: 0 }}>{change(w)}{w.byV ? ` ${fill(t('(also delivers Version {0})'), [w.byV])}` : ''}</p>
          {(w.state === 'done' || w.state === 'policy') && <p className="muted mono">hash {w.hash[0]} → {w.hash[1]}</p>}
          {w.policy && <>
            <div className="pf deny" style={{ marginTop: 12 }}><div className="pf-h"><ShieldError16Filled /><b>{t('Changed by Azure Policy on write')}</b><span className="pf-e e-deny">{w.policy.effect}</span></div>
              <div className="pf-m">{t(w.policy.name)}</div><div className="pf-r">{t(w.policy.reason)}</div><div className="pf-why">{t('The Policy pre-check predicted it, as information.')}</div></div>
            <table className="mini cmp"><thead><tr><th>{t('Field')}</th><th>{t('Requested')}</th><th>{t('Stored by Azure')}</th></tr></thead>
              <tbody>{w.policy.diff.map(([f, a, b]) => <tr key={f}><td className="mono">{f}</td><td>{t(a)}</td><td className="chg">{t(b)}</td></tr>)}</tbody></table>
            <p className="cd-p">{t('The Deployed state takes what Azure stored. There is no retry loop and no Overwrite loop: the write stays failed until you choose a way out.')}</p>
            <h3>{t('Ways out')}</h3>
            <ol className="cd-l"><li>{fill(t('An exemption for {0}, or a change of the policy, then Retry.'), [w.res])}</li><li>{t('A fixing Change set.')}</li><li>{t('Revert this Commit. An admin may make it an Emergency Commit.')}</li></ol>
            <div className="dp-proto">{t('Prototype: a Retry here assumes that the exemption is in force now.')}</div></>}
          {w.code && w.state === 'failed' && <div className="dp-err"><span className="mono">{w.code}</span>{w.msg && <div>{w.msg}</div>}</div>}
          {w.state === 'waiting' && w.holds && <div className="dp-hold"><b>{t('Holds back:')}</b> {w.holds}, {t('which opens.')} {t('An NSG that waits for another waits as a whole, with all its changes.')}</div>}
          {dependants.length > 0 && <div className={`dp-hold ${wFailed ? 'red' : ''}`}><b>{t('Waits for this write:')}</b> {dependants.map(x => `${x.res} (${edgeWord(x)})`).join(', ')}</div>}
          {w.state === 'skipped' && <p className="cd-p">{t('Skipped Zones do not block the others. Once the permission is there, the next Deployment delivers it.')}</p>}
          {tf && <p className="cd-p">{t('Every pull request carries the whole Data contract; resources of later steps keep their Deployed content.')}</p>}
          <h3>{t('Details')}</h3>
          <dl className="kv">
            <dt>{t('Zone')}</dt><dd>{zoneById.get(w.zone)?.name}{(w.kind === 'asg' || w.kind === 'asgdel') && <span className="muted"> · {t('Scope')}: {scopeOf(w)}</span>}</dd>
            {w.waitsFor && <><dt>{t(w.state === 'done' ? 'Waited for' : 'Waits for')}</dt><dd><span className="mono">{w.waitsFor}</span> <span className="muted">({edgeWord(w)}{w.edge === 'dependency' ? `, ${t('Succeeded only')}` : `, ${t('Succeeded and the Settle time')}`})</span></dd></>}
            <dt>{t('Started')}</dt><dd>{w.at ?? '—'}</dd><dt>{t('Ended')}</dt><dd>{w.end ?? '—'}</dd>
            {!tf && <><dt>{t('Attempts')}</dt><dd>{w.attempts}</dd></>}
            {!tf && <><dt>{t('Correlation ID')}</dt><dd className="mono hash">{w.state === 'waiting' || w.state === 'stopped' || w.state === 'skipped' ? '—' : w.corr}</dd></>}
          </dl>
          <div className="vact">
            {wFailed && <Button appearance="primary" icon={<ArrowClockwise16Regular />} disabled={!!wBlock} onClick={() => retry([w])}>{t('Retry this write')}</Button>}
            <Button icon={<ArrowRight16Regular />} iconPosition="after" onClick={() => go37({ to: 'zone', id: w.zone })}>{t('Open the Zone')}</Button>
            {(wFailed || w.wait === 'failed') && <Button appearance="subtle" onClick={() => go37({ to: 'rule', id: w.rule ?? d.writes.find(x => x.rule)?.rule ?? 'R90003' })}>{t('Open a fixing Change set')}</Button>}
          </div>
          {wFailed && <p className="dp-why">{wBlock ?? retryNote}</p>}
        </>}</section>
      </div>
    </div>
  );
}
