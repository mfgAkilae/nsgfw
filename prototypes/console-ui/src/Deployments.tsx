// PROTOTYPE, throwaway. Issue 37: the Deployments page (rail entry), with the status strip per Environment and the tabs Deployments and Drift.
// Also the small parts other screens show: the rail dot, the banner above the Rule base, the note in the Rule editor, the Terraform notes
// of the Commit dialog, the Data contract files of a Terraform Environment, the Zone states and the inbox rows.
import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input } from '@fluentui/react-components';
import { Search16Regular, Bot16Regular, ErrorCircle16Filled, Warning16Filled, CloudArrowUp16Regular } from '@fluentui/react-icons';
import { DriftTab, useDriftCounts } from './Drift';
import { type Item37, StateTag, stateOf, msg, envName, whenOf, startTag, vkindTag } from './DeployView';
import { envs } from './data';
import { go37, useOps } from './ops37';
import { useSession } from './session';
import { useT } from './i18n';
import { useDeploys, useSel, lastList, startLive, progress, dur, isFailed, isRunning, isCurrent, openPr, stepsOf, latestV, zoneStates, moduleOf, fileOf, MODULES, HAND_EDIT, fill,
  type Deployment, type EnvId, type Msg } from './deploydata';
import './deploy.css';

type Tone = 'ok' | 'amber' | 'red';
type Chip = 'all' | 'running' | 'failed' | 'superseded' | 'skipped' | 'tool' | 'tf';
const chips: [Chip, string, string, (d: Deployment) => boolean][] = [['all', 'All', '', () => true], ['running', 'Running', 'c-expiring', isRunning], ['failed', 'Failed', 'c-deny', d => d.state === 'failed' || d.state === 'stopped'],
  ['superseded', 'Superseded', 'c-disabled', d => d.state === 'superseded'], ['skipped', 'Skipped Zones', 'c-unused', d => progress(d).skipped > 0], ['tool', 'By the tool', '', d => d.by === 'nsgfw'], ['tf', 'Terraform', '', d => d.env === 'nonprod']];

/** Where one Environment stands: failures first, then what runs or waits, else in sync. */
function envLines(l: Deployment[], env: EnvId, when: (ts: string) => string, m: (x: Msg) => string): { tone: Tone; text: Msg; id?: string; bar?: number }[] {
  const cur = l.filter(d => d.env === env && isCurrent(d)); const out: { tone: Tone; text: Msg; id?: string; bar?: number }[] = [];
  for (const d of cur.filter(isFailed)) { const p = progress(d); const left = p.total - p.done - p.skipped;
    out.push({ tone: 'red', id: d.id, text: d.v ? [left === 1 ? 'Failed · Version {0}, 1 write' : 'Failed · Version {0}, {1} writes', d.v, left.toLocaleString('en')] : ['Failed · {0}', d.what ? m(d.what) : ''] }); }
  for (const d of cur.filter(isRunning)) { const p = progress(d); const pr = openPr(d);
    if (d.prs) out.push({ tone: 'amber', id: d.id, text: pr ? [d.emergencyOpen ? 'Version {0} · Emergency Commit · pull request open #{3} since 3 h' : pr.state === 'open' ? 'Version {0} · step {1} of {2} · pull request open #{3}' : 'Version {0} · step {1} of {2} · merged, awaiting apply', d.v ?? '', pr.step, stepsOf(d), pr.n ?? ''] : ['Version {0} · step {1} of {2} · waits for the Settle time', d.v ?? '', 1, stepsOf(d)] });
    else out.push({ tone: 'amber', id: d.id, bar: p.done / p.total, text: ['Deploying Version {0} · {1} of {2} writes', d.v ?? '—', p.done.toLocaleString('en'), p.total.toLocaleString('en')] }); }
  if (!out.length) { const lastDone = l.find(d => d.env === env && d.state === 'deployed');
    out.push({ tone: 'ok', text: ['In sync with Version {0} · last write {1}', latestV(l), lastDone ? when(lastDone.endAt ? `${lastDone.ts.slice(0, 11)}${lastDone.endAt}` : lastDone.ts) : '—'] }); }
  return out.slice(0, 3);
}

export function DeploymentsPage({ tab, setTab, env, setEnv, sel }: { sel?: string | null; tab: 'deployments' | 'drift'; setTab: (t: 'deployments' | 'drift') => void; env: string | null; setEnv: (e: string | null) => void }) {
  const { t } = useT(); const all = useDeploys(); const dc = useDriftCounts(); const se = useSession();
  const [chip, setChip] = useState<Chip>('all'); const [q, setQ] = useState('');
  useEffect(() => { startLive(); }, []);
  const mine = env ? all.filter(d => d.env === env) : all;
  const counts = useMemo(() => Object.fromEntries(chips.map(c => [c[0], mine.filter(c[3]).length])) as Record<Chip, number>, [mine]);
  const ql = q.trim().toLowerCase();
  const list = mine.filter(chips.find(c => c[0] === chip)![3]).filter(d => !ql || `${d.v ?? ''} ${d.cs} ${d.by} ${d.what ? msg(t, d.what) : ''} ${d.writes.map(w => w.res).join(' ')}`.toLowerCase().includes(ql));
  const driftOpen = env ? dc.byEnv[env]?.open ?? 0 : dc.open; const driftHigh = env ? dc.byEnv[env]?.high ?? 0 : dc.high;
  const m = (x: Msg) => msg(t, x);
  return <>
    <header className="phead"><h1>{t('Deployments')}</h1><span className="sub">{t('What every Commit wrote to Azure, per Environment, and where Azure differs from the Deployed state.')}</span></header>
    <div className="dp-strip">{envs.map(e => { const lines = envLines(all, e.id as EnvId, ts => whenOf(t, ts), m); const worst = lines.some(x => x.tone === 'red') ? 'bad' : lines.some(x => x.tone === 'amber') ? 'warn' : 'ok'; const dr = dc.byEnv[e.id];
      return <div key={e.id} role="button" tabIndex={0} aria-pressed={env === e.id} className={`dp-env h-${worst} ${env === e.id ? 'on' : ''}`} onClick={() => setEnv(env === e.id ? null : e.id)} onKeyDown={k => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setEnv(env === e.id ? null : e.id); } }}>
        <div className="dp-env-h"><b>{t(e.name)}</b><span className="muted">{e.mode}</span><button className="link" onClick={x => { x.stopPropagation(); go37({ to: 'env', env: e.id }); }}>{t('Settings')}</button></div>
        {lines.map((x, i) => <div key={i} className="dp-line">
          <span className={`dp-s ${x.tone} ${x.bar !== undefined ? 'live' : ''}`}><i className="dep" />{x.id ? <a className="dp-go" onClick={k => { k.stopPropagation(); go37({ to: 'deployment', id: x.id! }); }}>{m(x.text)}</a> : <span>{m(x.text)}</span>}</span>
          {x.bar !== undefined && <span className="dp-bar"><b style={{ width: `${Math.round(x.bar * 100)}%` }} /></span>}</div>)}
        <div className="dp-envd"><button onClick={k => { k.stopPropagation(); setEnv(e.id); setTab('drift'); }}>{dr?.open ? <>{fill(t('Drift {0}'), [dr.open])}{dr.high > 0 && <> · <span className="b-red">{fill(t('{0} high'), [dr.high])}</span></>}</> : t('No open Drift')}</button></div>
      </div>; })}</div>
    <div className="dp-bar2">
      <div className="seg2" role="tablist">
        <button role="tab" aria-selected={tab === 'deployments'} className={tab === 'deployments' ? 'on' : ''} onClick={() => setTab('deployments')}>{t('Deployments')} <i className="cnt n">{mine.length}</i></button>
        <button role="tab" aria-selected={tab === 'drift'} className={tab === 'drift' ? 'on' : ''} onClick={() => setTab('drift')}>{t('Drift')} {driftOpen > 0 && <i className={`cnt ${driftHigh ? 'red' : ''}`}>{driftOpen}</i>}</button>
      </div>
      {tab === 'deployments' && <Input className="search" contentBefore={<Search16Regular />} placeholder={t('Version, Change set, resource or person')} value={q} onChange={(_, d) => setQ(d.value)} />}
      <span className="sp" />
      {env && <span className="muted">{fill(t('Only {0}.'), [t(envName(env))])} <a className="link" onClick={() => setEnv(null)}>{t('All Environments')}</a></span>}
      {tab === 'deployments' && !env && <span className="muted">{fill(t('Settle time {0} s · 500 writes per 5 minutes per subscription and region'), [se.settle])}</span>}
    </div>
    {tab === 'drift' ? <DriftTab env={env} sel={sel} /> : <>
      <div className="chipbar">{chips.map(([k, label, cls]) => <button key={k} className={`chip ${cls} ${chip === k ? 'on' : ''} ${counts[k] || k === 'all' ? '' : 'zero'}`} aria-pressed={chip === k} disabled={!counts[k] && k !== 'all'} onClick={() => setChip(k)}>{t(label)}<i>{counts[k]}</i></button>)}</div>
      <div className="sheet"><div className="lib-l">
        <div className="vrow dp-row vhead"><span>{t('Version')}</span><span>{t('What started it')}</span><span>{t('Environment')}</span><span>{t('State')}</span><span>{t('Writes')}</span><span>{t('Started')}</span><span>{t('Duration')}</span><span>{t('By')}</span></div>
        {list.map(d => { const tag = d.vkind ? ['', vkindTag[d.vkind]] : startTag[d.start]; const p = progress(d); const run = isRunning(d); const s = stateOf(d);
          return <div key={d.id} className="vrow dp-row" onClick={() => go37({ to: 'deployment', id: d.id })}>
            <b className="mono">{d.v ?? '—'}</b>
            <span className="vn"><span><b>{d.what ? m(d.what) : d.cs}</b>{tag && <span className={`tag ${tag[0]}`}>{t(tag[1])}</span>}</span>{d.what && d.cs && d.start === 'catchup' && <span className="muted">{fill(t('Version {0}, no new Version, no new Approval'), [d.v ?? ''])}</span>}</span>
            <span>{t(envName(d.env))} <span className="muted">{d.env === 'nonprod' ? 'Terraform' : 'ARM'}</span></span>
            <StateTag d={d} />
            <span className={`dp-wc ${s.tone === 'red' ? 'bad' : ''}`}><span>{run || p.done < p.total ? `${p.done.toLocaleString('en')} / ${p.total.toLocaleString('en')}` : p.total.toLocaleString('en')}</span>{run && <i><b style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} /></i>}</span>
            <span className="muted">{whenOf(t, d.ts)}</span>
            <span className="muted">{run ? fill(t('{0} so far'), [dur(d.secs)]) : dur(d.secs)}</span>
            <span>{d.by === 'nsgfw' ? <><Bot16Regular /> {t('the tool')}</> : d.by === 'you' ? t('you') : d.by}</span>
          </div>; })}
        {!list.length && <div className="empty" style={{ padding: 16 }}><b>{t('No Deployment matches.')}</b></div>}
        <div className="muted dp-more">{t('1,240 older Deployments. Search to find one.')}</div>
      </div></div>
    </>}
  </>;
}

/** Rail dot: red when a Deployment failed or high Drift is open, amber while one runs or waits. */
export function useDeployNav(): { worst: 'ok' | 'warn' | 'bad' } {
  const dc = useDriftCounts(); const w = useSel(l => (l.some(isFailed) ? 'bad' : l.some(isRunning) ? 'warn' : 'ok') as 'ok' | 'warn' | 'bad');
  return { worst: dc.high > 0 ? 'bad' : w };
}

/** The permanent banner above the Rule base while a Deployment failed or a Terraform pull request of an expiry or Emergency Commit stays open (#16.23, #17.19). */
export function DeployBanner(): JSX.Element | null {
  const { t } = useT();
  const lines = useSel(l => [
    ...l.filter(isFailed).map(d => { const p = progress(d); const pol = d.writes.some(w => w.state === 'policy'); const pr = d.prs?.find(x => x.state === 'policy' || x.state === 'notApplied' || x.state === 'closed');
      return { id: d.id, tone: 'red', v: d.v, env: d.env, failed: p.failed, pr: pr?.n ?? 0, nsgs: d.writes.filter(w => w.kind === 'nsg' && w.state !== 'done' && w.state !== 'skipped').length,
        why: pol ? 'policy' : pr?.state === 'policy' ? 'tfpolicy' : pr?.state === 'notApplied' ? 'notApplied' : pr?.state === 'closed' ? 'closed' : d.writes.find(w => w.code)?.code ?? '' }; }),
    ...l.filter(d => d.emergencyOpen && isRunning(d)).map(d => ({ id: d.id, tone: 'amber', v: d.v, env: d.env, failed: 0, pr: 0, nsgs: 0, why: 'emergency' })),
  ]);
  if (!lines.length) return null;
  return <div className="dp-ban">{lines.slice(0, 2).map(x => <div key={x.id} className={x.tone}>{x.tone === 'red' ? <ErrorCircle16Filled /> : <Warning16Filled />}
    <span>{x.why === 'emergency' ? t('The pull request of Emergency Commit 1287 is open in Non-production since 3 h. Until it is merged and applied, the change is not in Azure.')
      : <>{fill(t('Version {0} is not fully in {1}:'), [x.v ?? '', t(envName(x.env))])} {x.why === 'tfpolicy' ? fill(t('the apply of pull request #{0} failed on a policy.'), [x.pr]) : x.why === 'notApplied' ? fill(t('pull request #{0} is merged, but not applied.'), [x.pr])
        : x.why === 'closed' ? fill(t('pull request #{0} was closed without merge.'), [x.pr]) : fill(t(x.failed === 1 ? '1 write failed, {0}.' : '{1} writes failed, {0}.'), [x.why === 'policy' ? t('changed by Azure Policy on write') : x.why, x.failed])} {x.nsgs > 0 && fill(t(x.nsgs === 1 ? '1 Managed NSG does not have its NSG rules yet.' : '{0} Managed NSGs do not have its NSG rules yet.'), [x.nsgs])}</>}</span>
    <Button size="small" onClick={() => go37({ to: 'deployment', id: x.id })}>{t('Open the Deployment')}</Button></div>)}</div>;
}

// The Rules whose NSG rules the failed Version 1289 and the running Version 1290 carry, and the Zones they land on there.
const CHANGED: Record<string, string[]> = { R90002: ['z0042-web'], R90003: ['z0042-web', 'z0042-api'], R90004: ['z0042-db'] };
/** Rule editor, section "In Azure": the Managed NSGs where this Rule's NSG rules are not deployed yet (#16.23). */
export function NotDeployedNote({ ruleId }: { ruleId: string }): JSX.Element | null {
  const { t } = useT(); const zs = CHANGED[ruleId];
  const items = useSel(l => (zs ?? []).flatMap(z => { const d = l.find(x => isCurrent(x) && (isFailed(x) || isRunning(x)) && x.writes.some(w => w.zone === z && w.kind === 'nsg' && w.state !== 'done'));
    const w = d?.writes.find(x => x.zone === z && x.kind === 'nsg'); if (!d || !w) return [];
    const why: Msg = w.state === 'policy' ? ['changed by Azure Policy on write, Version {0} failed', d.v ?? ''] : w.wait === 'failed' ? ['waits for {0}, Version {1} failed', w.waitsFor ?? '', d.v ?? ''] : w.state === 'pr' ? ['pull request #{0} open', w.pr ?? ''] : ['Deployment of Version {0} running', d.v ?? ''];
    return [{ nsg: w.res, why, id: d.id, red: isFailed(d) }]; }));
  if (!items.length) return null;
  return <div className={`dp-nd ${items.some(x => x.red) ? 'red' : ''}`}><b>{items.some(x => x.red) ? <ErrorCircle16Filled /> : <CloudArrowUp16Regular />}{fill(t(items.length === 1 ? 'Not in Azure yet on 1 Managed NSG:' : 'Not in Azure yet on {0} Managed NSGs:'), [items.length])}</b>
    <ul>{items.map(x => <li key={x.nsg}><span className="mono">{x.nsg}</span> <span className="muted">({msg(t, x.why)})</span></li>)}</ul>
    <button className="link" onClick={() => go37({ to: 'deployment', id: items[0].id })}>{t('Open the Deployment')}</button></div>;
}

/** Commit dialog: what the Terraform Environments of this Commit need confirmed (hand-edited Data contract file restored, Drift in a touched root module overwritten). */
export function TerraformCommitNotes({ onReady }: { onReady: (ok: boolean) => void }): JSX.Element | null {
  const { t } = useT(); const ops = useOps(); const dc = useDriftCounts(); const se = useSession();
  const [restore, setRestore] = useState(false); const [over, setOver] = useState(false);
  const pattern = se.envSettings.nonprod?.pathPattern ?? 'stacks/{subscription}/{region}'; const drift = dc.byEnv.nonprod?.open ?? 0;
  const ok = (!ops.handEdit || restore) && (!drift || over);
  useEffect(() => { onReady(ok); }, [ok]);
  useEffect(() => () => onReady(true), []);
  const file = fileOf(moduleOf('z0606-web', pattern)); const mod = moduleOf('z0602-web', pattern);
  return <section><h4>{t('Non-production (Terraform)')}</h4>
    <p className="cd-p">{t('One pull request per step of the write order. The pipeline of the repository applies it; a step counts as deployed only when Azure shows its target.')}</p>
    {ops.handEdit && <div className="dp-tfbox"><p className="cd-p">{fill(t('A Data contract file was edited by hand: {0}, commit {1} by {2}, {3}. This pull request restores it.'), [file, HAND_EDIT.commit, HAND_EDIT.by, t(HAND_EDIT.ago)])}</p>
      <Checkbox checked={restore} onChange={(_, d) => setRestore(!!d.checked)} label={t('Restore it')} /></div>}
    {drift > 0 && <div className="dp-tfbox"><p className="cd-p">{fill(t(drift === 1 ? 'Drift on 1 tool resource in root module {1}: the apply reverts it.' : 'Drift on {0} tool resources in root module {1}: the apply reverts all of it.'), [drift, mod])}</p>
      <Checkbox checked={over} onChange={(_, d) => setOver(!!d.checked)} label={t('Overwrite it')} /></div>}
  </section>;
}

/** Admin > Environments > one Terraform Environment: the Data contract files, their last revision, and flagged hand edits (#18.22). */
export function DataContractSection({ envId }: { envId: string }): JSX.Element | null {
  const { t } = useT(); const ops = useOps(); const se = useSession();
  const pattern = se.envSettings[envId]?.pathPattern ?? 'stacks/{subscription}/{region}'; const mods = MODULES(pattern);
  const [em, n90] = useSel(l => [l.find(d => d.id === 'd-1287-nonprod')?.state ?? '', l.find(d => d.id === 'd-1290-nonprod')?.state ?? '']);
  const row = (sub: string): [string, string] => sub === 'sub-nonprod-03' ? ['1289.1', fill(t('pull request #{0}, {1}'), [416, `${t('today')} 09:31`])]
    : em === 'deployed' ? ['1287.2', fill(t('pull request #{0}, {1}'), [414, `${t('today')} 07:31`])] : ['1286.1', fill(t('pull request #{0}, {1}'), [406, '2026-11-08 00:31'])];
  return <section className="set"><h3>{t('Data contract files')}</h3>
    <p className="muted">{t('One JSON file per root module. nsgfw writes them only through pull requests and reads Azure to know what is deployed; the pipeline of the repository plans and applies.')}</p>
    {ops.handEdit && <div className="dp-dcnote"><Warning16Filled /><span>{fill(t('{0}: edited by hand in commit {1} by {2}, {3} ({4} lines). The next nsgfw pull request restores it, after a confirmation in the Commit dialog. Adopt reads Azure, never the file.'), [fileOf(moduleOf('z0606-web', pattern)), HAND_EDIT.commit, HAND_EDIT.by, t(HAND_EDIT.ago), HAND_EDIT.lines])}</span></div>}
    <table className="mini dp-dc"><thead><tr><th>{t('Data contract file')}</th><th>{t('Zones')}</th><th>{t('Revision')}</th><th>{t('Last written by nsgfw')}</th><th>{t('Last seen in Azure')}</th></tr></thead><tbody>
      {mods.map(x => { const [rev, by] = row(x.sub); const flag = ops.handEdit && x.sub === HAND_EDIT.sub;
        return <tr key={x.m} className={flag ? 'flag' : ''}><td className="mono">{fileOf(x.m)}</td><td>{x.zones}</td><td className="mono">{rev}</td><td>{by}</td>
          <td>{flag ? <span className="b-amber">{fill(t('file differs: commit {0} by {1}'), [HAND_EDIT.commit, HAND_EDIT.by])}</span> : x.sub === 'sub-nonprod-03' && n90 === 'running' ? <span className="b-amber">{fill(t('pull request #{0} open'), [418])}</span> : t('matches Azure, checked 10:00')}</td></tr>; })}
    </tbody></table>
    <p className="muted">{fill(t('The bootstrap pull request #{0} merged on {1}.'), [12, '2026-10-02'])}</p>
  </section>;
}

/** Zone overview: Zones whose Managed NSG is not deployed yet or failed. */
export function zoneDeployState(zid: string): 'pending' | 'failed' | null { return zoneStates(lastList())[zid] ?? null; }
export function useNotDeployedZones(): Set<string> { const ids = useSel(l => Object.keys(zoneStates(l)).sort()); return useMemo(() => new Set(ids), [ids]); }
/** The Deployment id of one Version in one Environment, for links from the Versions page. */
export function deploymentIdFor(version: number, env: string): string | null {
  const l = lastList().filter(d => d.v === version && d.env === env && d.start !== 'catchup');
  return (l.find(isCurrent) ?? l[0])?.id ?? null;
}
export function useDeployInbox(): Item37[] {
  const rows = useSel(l => [
    ...l.filter(isFailed).filter(d => d.writes.some(w => w.state === 'policy')).map(d => ({ id: d.id, v: d.v, res: d.writes.find(w => w.state === 'policy')!.res, waits: d.writes.filter(w => w.wait === 'failed').length, env: d.env, kind: 'policy' })),
    ...l.filter(d => d.emergencyOpen && isRunning(d)).map(d => ({ id: d.id, v: d.v, res: '', waits: 0, env: d.env, kind: 'emergency' })),
  ]);
  return useMemo(() => rows.map(r => r.kind === 'emergency'
    ? { id: `dep-${r.id}`, kind: 'deploy' as const, tone: 'amber' as const, text: 'The pull request of Emergency Commit 1287 is open in Non-production since 3 h. Until it is merged and applied, the change is not in Azure.', when: 'today 07:04', action: 'Open the Deployment', go: () => go37({ to: 'deployment', id: r.id }) }
    : { id: `dep-${r.id}`, kind: 'deploy' as const, tone: 'red' as const, text: inboxText(r.v ?? 0, r.res, r.waits, r.env), when: r.v === 1289 ? 'today 09:13' : 'just now', action: 'Open the Deployment', go: () => go37({ to: 'deployment', id: r.id }) }), [rows]);
}
// Whole sentences: the inbox translates each row as one key, so i18n-deploy.ts holds these sentences with the same names.
const inboxText = (v: number, res: string, waits: number, env: string) => `Version ${v} failed in ${envName(env)}: ${res} was changed by Azure Policy on write. ${waits === 1 ? '1 write waits for it.' : `${waits} writes wait for it.`}`;
