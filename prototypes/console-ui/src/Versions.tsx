// PROTOTYPE, throwaway. Issue 36: the Version history, a page of its own in the rail. One Version shows what its Commit changed,
// Folder edits included, and starts a Revert of that Commit or a Restore to that Version. Both are Change sets with Review and Approval.
import { useMemo, useState } from 'react';
import { Button, Input } from '@fluentui/react-components';
import { Search16Regular, ArrowUndo16Regular, History16Regular, ArrowDownload16Regular, Flash16Regular, CalendarClock16Regular, Bot16Regular, Folder16Regular } from '@fluentui/react-icons';
import { useFlow } from './flow';
import { VERSIONS, VersionRow, Dep } from './versions36';
import { envs } from './data';
import { useT } from './i18n';

type Chip = 'all' | 'emergency' | 'scheduled' | 'tool' | 'rollback' | 'folders';
const chips: [Chip, string, (v: VersionRow) => boolean][] = [['all', 'All', () => true], ['emergency', 'Emergency Commits', v => v.kind === 'emergency'], ['scheduled', 'Scheduled', v => v.kind === 'scheduled'],
  ['tool', 'By the tool', v => v.by === 'nsgfw'], ['rollback', 'Restore and Revert', v => v.kind === 'restore' || v.kind === 'revert'], ['folders', 'Only Folders', v => v.kind === 'folders']];
const kindTag: Record<string, [string, string] | undefined> = { emergency: ['red', 'Emergency Commit'], scheduled: ['', 'Scheduled'], expiry: ['', 'Expiry'], folders: ['', 'Only Folders'], retranslation: ['amber', 'Re-translation'], restore: ['accent', 'Restore'], revert: ['accent', 'Revert'] };
const depLabel: Record<Dep, string> = { ok: 'deployed', failed: 'failed', running: 'deploying', none: 'not affected' };

export function Deps({ d }: { d: [Dep, Dep, Dep] }) { const { t } = useT(); return <span className="deps">{d.map((x, i) => <i key={i} className={`dep ${x}`} title={`${envs[i].name}: ${t(depLabel[x])}`} />)}</span>; }

export function VersionsPage() {
  const f = useFlow(); const { t } = useT();
  const [chip, setChip] = useState<Chip>('all'); const [q, setQ] = useState(''); const [sel, setSel] = useState<number>(f.latest);
  const all = useMemo<VersionRow[]>(() => [
    ...f.extra.map(v => ({ n: v.n, name: v.name, by: v.by, at: v.at, kind: v.kind, deploy: (v.nsgs ? ['running', 'running', 'none'] : ['none', 'none', 'none']) as [Dep, Dep, Dep],
      rules: [{ id: '', what: `${v.edits} ${v.edits === 1 ? 'edit' : 'edits'}, ${v.nsgs} Managed NSGs` }], folders: [], approvals: [], session: true, noRevert: 'Prototype: only the older Versions carry their content.' })),
    ...VERSIONS.filter(v => !f.small || !v.folders.length).map(v => (v.n === 1287 && f.decisions['cs-5'] ? { ...v, emergencyOpen: false, approvals: [f.decisions['cs-5'].kind === 'approved' ? 'Approved afterwards by you' : 'Rejected by you: a Revert is prepared'] } : v)),
  ], [f.extra, f.small, f.decisions]);
  const list = all.filter(v => chips.find(c => c[0] === chip)![2](v) && (!q || `${v.n} ${v.name} ${v.by}`.toLowerCase().includes(q.toLowerCase())));
  const v = all.find(x => x.n === sel) ?? all[0]; const latest = all[0].n;
  const revert = () => { const id = f.create({ kind: 'revert', of: v.n, author: 'you' }); f.openCs(id); };
  const restore = () => { const id = f.create({ kind: 'restore', of: v.n, author: 'you' }); f.openCs(id); };
  const exportJson = () => { const blob = new Blob([JSON.stringify({ version: v.n, changeSet: v.name, committedBy: v.by, at: v.at, kind: v.kind, rules: v.rules, folders: v.folders }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nsgfw-version-${v.n}.json`; a.click(); URL.revokeObjectURL(a.href); };
  return (<>
    <div className="chipbar">{chips.filter(c => !f.small || c[0] !== 'folders').map(([k, label, fn]) => <button key={k} className={`chip ${chip === k ? 'on' : ''}`} onClick={() => setChip(k)}>{t(label)}<i>{k === 'all' ? all[0].n.toLocaleString() : all.filter(fn).length}</i></button>)}
      <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Version, Change set or person')} value={q} onChange={(_, d) => setQ(d.value)} /></div>
    <div className="sheet lib">
      <div className="lib-l">
        <div className="vrow vhead"><span>{t('Version')}</span><span>{t('Change set')}</span><span>{t('By')}</span><span>{t('Committed')}</span><span title="Production, Non-production, Sandbox">{t('Deployments')}</span></div>
        {list.map(x => { const tag = kindTag[x.kind]; return (
          <div key={x.n} className={`vrow ${sel === x.n ? 'on' : ''}`} onClick={() => setSel(x.n)}>
            <b className="mono">{x.n}</b><span className="vn"><b>{x.name}</b>{tag && <span className={`tag ${tag[0]}`}>{t(tag[1])}</span>}{x.emergencyOpen && <span className="tag amber">{t('Approval afterwards open')}</span>}</span>
            <span>{x.by === 'nsgfw' ? <><Bot16Regular /> {t('the tool')}</> : x.by}</span><span className="muted">{t(x.at)}</span><Deps d={x.deploy} /></div>); })}
        <div className="muted" style={{ padding: 12 }}>{t('1,180 older Versions. Search to find one.')}</div>
      </div>
      <aside className="lib-d vdet">
        <div className="lib-k">{t('Version')} {v.n}{v.n === latest && <span className="tag accent">{t('latest')}</span>}</div>
        <h2>{v.name}</h2>
        <p className="muted" style={{ margin: 0 }}>{v.kind === 'emergency' ? <><Flash16Regular /> {t('Emergency Commit by')}</> : v.kind === 'scheduled' ? <><CalendarClock16Regular /> {t('Scheduled Commit by')}</> : t('Committed by')} {v.by === 'nsgfw' ? t('the tool') : v.by}, {t(v.at)}</p>
        {v.reason && <div className="note amber" style={{ marginTop: 10 }}>{t('Reason')}: “{v.reason}”</div>}
        {v.note && <p className="cd-p">{t(v.note)}</p>}
        <h3>{t('Deployments')}</h3>
        {envs.map((e, i) => <div key={e.id} className="vdep"><i className={`dep ${v.deploy[i]}`} /><b>{e.name}</b><span className="muted">{e.mode}</span><span>{t(depLabel[v.deploy[i]])}</span></div>)}
        <h3>{t('Approvals')}</h3>{v.approvals.length ? <ul className="cd-l">{v.approvals.map(a => <li key={a}>{t(a)}</li>)}</ul> : <p className="muted">{t('None needed.')}</p>}
        <h3>{t('What this Commit changed')}</h3>
        {v.rules.length > 0 && <ul className="cd-l">{v.rules.map((r, i) => <li key={i}>{r.id && <span className="mono">{r.id} </span>}{t(r.what)}</li>)}</ul>}
        {!f.small && v.folders.length > 0 && <ul className="cd-l">{v.folders.map(x => <li key={x}><Folder16Regular /> {x}</li>)}</ul>}
        {!v.rules.length && !v.folders.length && <p className="muted">{t('No edits.')}</p>}
        <div className="vact">
          <Button icon={<ArrowUndo16Regular />} disabled={!!v.noRevert} onClick={revert}>{t('Revert this Commit')}</Button>
          <Button icon={<History16Regular />} disabled={v.n === latest || !!v.session} onClick={restore}>{t('Restore to this Version')}</Button>
          <Button appearance="subtle" icon={<ArrowDownload16Regular />} onClick={exportJson}>{t('Export JSON')}</Button>
        </div>
        <p className="muted vexp">{v.noRevert ? t(v.noRevert) : t('Revert undoes this Commit’s edits on top of the latest Version, Folder edits included.')} {v.n === latest ? t('This is the latest Version, so there is nothing to restore.') : t('Restore returns the Rule base to this Version. Both open a Change set with Review and Approval; one that differs only in Folders needs no Approval.')}</p>
        <p className="muted">{t('The Deployment view of each Version belongs to the Deployment ticket.')}</p>
      </aside>
    </div>
  </>);
}
