// PROTOTYPE, throwaway. The pages beside the Rule base: object library and Change sets.
import { useMemo, useState } from 'react';
import { Button, Input } from '@fluentui/react-components';
import { Search16Regular, Checkmark12Filled, ArrowRight16Regular } from '@fluentui/react-icons';
import { objects, zones, services, zoneById, ref, ObjKind } from './data';
import { useStore, otherSets, CsState } from './store';
import { usePreview, useApproval } from './ChangeViews';
import { useFlow, CUR_NAME } from './flow';
import { InboxList } from './Inbox';
import { kindLabel } from './ObjectPicker';
import { Glyph } from './Glyph';
import { useT } from './i18n';
import type { FilterKey } from './RuleGrid';

type Item = { id: string; name: string; kind: ObjKind | 'svc'; value: string; cov: string[]; members?: string[] };
const all: Item[] = [
  ...objects.map(o => ({ id: o.id, name: o.name, kind: o.kind, value: o.value, cov: o.cov, members: o.members })),
  ...services.map(s => ({ id: s.id, name: s.name, kind: 'svc' as const, value: s.value, cov: [] })),
  ...zones.map(z => ({ id: `zone:${z.id}`, name: z.name, kind: 'zone' as const, value: `${z.prefix}, ${z.vnet}`, cov: [z.id] })),
];
const groups: [string, string, (k: string) => boolean][] = [
  ['all', 'All', () => true], ['zone', 'Zones', k => k === 'zone'], ['net', 'Hosts & networks', k => k === 'ip' || k === 'cidr' || k === 'subnet'], ['tag', 'Service tags', k => k === 'tag'],
  ['vnet', 'VNets', k => k === 'vnet'], ['asg', 'ASG objects', k => k === 'asg' || k === 'extasg'], ['group', 'Groups', k => k === 'group'], ['svc', 'Services', k => k === 'svc'],
];

// ---------- Object library: every object with where it is used. One click shows the Rules that use it.
export function ObjectLibrary({ onZone, onShowRules }: { onZone: (zid: string) => void; onShowRules: (name: string) => void }) {
  const s = useStore(); const { t } = useT();
  const [g, setG] = useState('all'); const [q, setQ] = useState(''); const [unused, setUnused] = useState(false); const [sel, setSel] = useState<string>('g7');
  const usage = useMemo(() => { const m = new Map<string, number>(); for (const r of s.rules) for (const id of [...r.src, ...r.dst, ...r.svc]) m.set(id, (m.get(id) ?? 0) + 1); return m; }, [s.rules]);
  const counts = useMemo(() => Object.fromEntries(groups.map(([k, , f]) => [k, all.filter(i => f(i.kind)).length])), []);
  const unusedCount = useMemo(() => all.filter(i => i.kind !== 'zone' && i.kind !== 'any' && !usage.get(i.id)).length, [usage]);
  const list = useMemo(() => {
    const f = groups.find(x => x[0] === g)![2]; const ql = q.toLowerCase(); const out: Item[] = [];
    for (const i of all) { if (out.length >= 250) break; if (!f(i.kind)) continue; if (unused && (i.kind === 'zone' || i.kind === 'any' || usage.get(i.id))) continue; if (ql && !i.name.toLowerCase().includes(ql) && !i.value.toLowerCase().includes(ql)) continue; out.push(i); }
    return out;
  }, [g, q, unused, usage]);
  const cur = all.find(i => i.id === sel); const max = 40;
  return (
    <>
      <div className="chipbar">
        {groups.map(([k, label]) => <button key={k} className={`chip ${g === k && !unused ? 'on' : ''}`} onClick={() => { setG(k); setUnused(false); }}>{t(label)}<i>{counts[k].toLocaleString()}</i></button>)}
        <button className={`chip c-expiring ${unused ? 'on' : ''}`} onClick={() => { setUnused(!unused); setG('all'); }}>{t('Unused')}<i>{unusedCount.toLocaleString()}</i></button>
        <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Name, address or port')} value={q} onChange={(_, d) => setQ(d.value)} />
      </div>
      <div className="sheet lib">
        <div className="lib-l">
          {list.map(i => { const u = usage.get(i.id) ?? 0; return (
            <div key={i.id} className={`lrow t-${i.kind} ${sel === i.id ? 'on' : ''}`} onClick={() => setSel(i.id)}>
              <Glyph kind={i.kind} /><b>{i.name}</b><span className="mono">{i.value}</span>
              <span className="lcov">{i.kind === 'svc' ? '' : i.cov.length ? `${i.cov.length.toLocaleString()} ${t(i.cov.length === 1 ? 'Zone' : 'Zones')}` : t('outside every Zone')}</span>
              {u ? <span className="use"><em>{u}</em><i><b style={{ width: `${Math.min(100, (u / max) * 100)}%` }} /></i></span> : <span className="use none">{i.kind === 'zone' ? '0' : t('unused')}</span>}
            </div>); })}
          {list.length >= 250 && <div className="muted" style={{ padding: 12 }}>{t('Showing the first 250. Search to narrow down.')}</div>}
          {!list.length && <div className="empty"><b>{t('Nothing matches')}</b><p>{t('Try another name, an address prefix or a port.')}</p></div>}
        </div>
        <aside className="lib-d">
          {cur ? <>
            <div className={`lib-k t-${cur.kind}`}><Glyph kind={cur.kind} />{kindLabel[cur.kind]}</div>
            <h2>{cur.name}</h2><div className="mono lib-v">{cur.value}</div>
            <div className="usebox"><b>{(usage.get(cur.id) ?? 0).toLocaleString()}</b><span>{t('Rules use this object')}</span>
              <Button size="small" appearance="primary" icon={<ArrowRight16Regular />} iconPosition="after" disabled={!usage.get(cur.id)} onClick={() => onShowRules(cur.name)}>{t('Show these Rules')}</Button></div>
            {cur.members && <><h3>{t('Members')}</h3><div className="picker-sel">{cur.members.map(m => <span key={m} className={`tok t-${ref(m).kind}`}><Glyph kind={ref(m).kind} /><span className="tl">{ref(m).name}</span></span>)}</div></>}
            {cur.kind !== 'svc' && <><h3>{t('Zones (Coverage)')}</h3>
              {cur.cov.length ? <>{cur.cov.slice(0, 8).map(zid => <div key={zid} className="orow t-zone"><Glyph kind="zone" /><b>{zoneById.get(zid)!.name}</b><span className="mono">{zoneById.get(zid)!.prefix}</span><a className="link" onClick={() => onZone(zid)}>{t('open Zone')}</a></div>)}
                {cur.cov.length > 8 && <p className="muted">{cur.cov.length - 8} {t('more')}</p>}</>
                : <p className="muted" style={{ lineHeight: 1.5 }}>{t('Covers no Zone. A Rule with this object lands only on the other side.')}</p>}</>}
          </> : <div className="empty"><b>{t('No object selected')}</b></div>}
        </aside>
      </div>
    </>
  );
}

// ---------- Change sets: what waits for you first, then every Change set with its place in the workflow.
const stepOf: Record<CsState, number> = { Open: 0, Submitted: 2, Approved: 3, Committed: 4 };
export const Track = ({ at, labels, warnAt }: { at: number; labels?: boolean; warnAt?: number }) => { const { t } = useT(); return (
  <ol className={`track ${labels ? 'full' : ''}`}>{['Edit', 'Submit', 'Approval', 'Commit'].map((l, i) => <li key={l} className={i === warnAt ? 'warn' : i < at ? 'done' : i === at ? 'on' : ''} title={t(l)}><i>{i === warnAt ? '!' : i < at ? <Checkmark12Filled /> : i + 1}</i><span>{i === warnAt ? t('Approval still open') : t(l)}</span></li>)}</ol>); };

export function ChangeSetsPage({ onFilter, onReview }: { onFilter: (k: FilterKey) => void; onReview: () => void }) {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv); const f = useFlow();
  const n = (k: number, one: string, many: string) => `${k} ${t(k === 1 ? one : many)}`;
  const behind = (base: number) => (f.latest > base ? `, ${f.latest - base} ${t('behind')}` : '');
  const row = (key: string, name: string, owner: string, state: CsState, meta: string, tags: JSX.Element | null, current?: boolean, onClick?: () => void, warnAt?: number) => (
    <div key={key} className={`setrow ${current ? 'current' : ''}`} onClick={onClick}>
      <span className="who" title={owner}>{owner === 'nsgfw' ? 'NS' : owner.slice(0, 2).toUpperCase()}</span>
      <div className="set-n"><b>{name}</b><span className="muted">{meta}</span></div>
      <span className="set-t">{tags}</span>
      <Track at={stepOf[state]} labels warnAt={warnAt} />
    </div>);
  // Issue 36: the other Change sets open on the Review screen, the approver decides there.
  const dec = (id: string, st: CsState): CsState => (f.decisions[id]?.kind === 'rejected' ? 'Open' : f.decisions[id]?.kind === 'approved' && st === 'Submitted' ? 'Approved' : st);
  const others = otherSets.map(c => ({ ...c, state: c.id === 'cs-2' && f.latest >= 1289 ? 'Committed' as CsState : dec(c.id, c.state) }));
  return (
    <div className="setspage">
      <h3 style={{ marginTop: 4 }}>{t('Waiting for you')}</h3>
      <InboxList onFilter={k => onFilter(k)} />
      <h3>{t('All Change sets')}</h3>
      <div className="sheet sets">
        {row('cur', CUR_NAME, 'you', s.state === 'Committed' ? 'Committed' : ap.eff, `${n(s.edits.length, 'edit', 'edits')}, ${n(pv.affected.length, 'Zone', 'Zones')}, ${t('based on Version')} ${s.version}${behind(s.version)}`,
          <><span className="tag accent">{t('current')}</span>{f.pending && <span className="tag red">{t('Rebase needed')}</span>}{f.schedule['CHG-5120'] && <span className="tag">{t('Scheduled')} {f.schedule['CHG-5120']}</span>}</>, true, f.pending ? () => f.setRebaseOpen(true) : onReview)}
        {row('cs-6', 'Open RDP for vendor', 'you', f.csState['cs-6'] ?? 'Open', `1 ${t('edit')}, 1 ${t('Zone')}, ${t('based on Version')} 1288${behind(1288)}`, f.csState['cs-6'] ? null : <span className="tag red">{t('Rejected')}</span>, false, () => f.openCs('cs-6'))}
        {f.created.map(c => row(c.id, `${c.kind === 'revert' ? 'Revert Version' : 'Restore to Version'} ${c.of}`, c.author, f.decisions[c.id]?.kind === 'approved' ? 'Committed' : f.csState[c.id] ?? (c.author === 'nsgfw' ? 'Submitted' : 'Open'),
          `${t(c.kind === 'revert' ? 'Revert' : 'Restore')}, ${t('based on Version')} ${f.latest}`, c.author === 'nsgfw' ? <span className="tag">{t('prepared by the tool')}</span> : null, false, () => f.openCs(c.id)))}
        {f.retrans && row('rt-1', 'Re-translation for engine 1.6.0', 'nsgfw', f.decisions['rt-1'] ? 'Committed' : 'Submitted', `${t('no edits')}, 37 ${t('Zones')}, Production`, <span className="tag amber">{t('Commits in Production wait')}</span>, false, () => f.openCs('rt-1'))}
        {others.map(c => row(c.id, c.name, c.owner, c.state, `${n(c.edits, 'edit', 'edits')}, ${n(c.affected, 'Zone', 'Zones')}, ${t('based on Version')} ${c.base}${c.state === 'Committed' ? '' : behind(c.base)}${c.scheduled ? `, ${t('Scheduled')} ${c.scheduled}` : ''}`,
          <>{c.rebase && <span className="tag red">{t('Rebase needed')}</span>}{c.emergency && <span className="tag amber">{t('Emergency Commit')}</span>}</>, false, c.id === 'cs-2' && c.state === 'Committed' ? undefined : () => f.openCs(c.id), c.emergency && !f.decisions['cs-5'] ? 2 : undefined))}
      </div>
    </div>
  );
}
