// PROTOTYPE, throwaway. The audit log (issue 38): append-only and hash-chained. Each entry carries its Scopes, and a reader sees the
// entries that touch theirs; entries in the instance Scope are visible to every admin (Grilling: Access, roles and audit, points 19 to 22).
import { useMemo, useRef, useState } from 'react';
import { Button, Input, Spinner } from '@fluentui/react-components';
import { Search16Regular, ShieldCheckmark16Filled, ShieldError16Filled, Dismiss16Regular, Copy16Regular, ArrowRight16Regular, Branch16Regular } from '@fluentui/react-icons';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { gridTheme } from './RuleGrid';
import { useSession, hhmm, PrincipalGlyph } from './session';
import { AuditEntry, auditCats, AuditCat, ScopeRef, scopeName, contains, zoneByName, principalById, NOW, pathOf, kindLabel } from './access';
import { zoneById, envs, vnets } from './data';
import { Glyph } from './Glyph';
import { useT } from './i18n';

const day = (d: Date) => d.toISOString().slice(0, 10);
const when = (d: Date) => (day(d) === day(NOW) ? hhmm(d) : `${day(d).slice(5)} ${hhmm(d)}`);
const ScopePill = ({ s }: { s: ScopeRef }) => { const { t } = useT(); return <span className={`spill k-${s.kind}`}>{s.kind === 'zone' ? <Glyph kind="zone" /> : s.kind === 'vnet' ? <Glyph kind="vnet" /> : null}{t(scopeName(s))}</span>; };

export function AuditPage({ onRule }: { onRule?: (id: string) => void }) {
  const se = useSession(); const { t } = useT();
  const [cat, setCat] = useState<AuditCat | 'all'>('all'); const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d'); const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeRef | null>(null); const [sel, setSel] = useState<AuditEntry | null>(null);
  const [verifying, setVerifying] = useState(false); const [verifiedAt, setVerifiedAt] = useState('03:12');
  // The read filter: entries whose Scopes touch the reader's.
  const readable = useMemo(() => {
    if (se.instanceScope) return se.audit;
    return se.audit.filter(e => e.scopes.some(s => s.kind === 'instance' ? se.anyAdmin : s.kind === 'zone' ? se.myZones!.has(s.id) : se.seesScope(s)));
  }, [se.audit, se.instanceScope, se.myZones, se.anyAdmin]);
  const since = NOW.getTime() - { '24h': 1, '7d': 7, '30d': 30 }[range] * 86_400_000;
  const inScope = (e: AuditEntry) => !scope || e.scopes.some(s => contains(scope, s) || contains(s, scope));
  const inText = (e: AuditEntry) => { const ql = q.trim().toLowerCase(); if (!ql) return true; return `${e.action} ${e.object} ${e.actor} ${principalById.get(e.actor)?.name ?? ''} ${e.detail ?? ''} ${e.ticket ?? ''} ${e.scopes.map(scopeName).join(' ')}`.toLowerCase().includes(ql); };
  const base = useMemo(() => readable.filter(e => e.at.getTime() >= since && inScope(e) && inText(e)), [readable, since, scope, q]);
  const counts = useMemo(() => { const m: Record<string, number> = { all: base.length }; for (const e of base) m[e.cat] = (m[e.cat] ?? 0) + 1; return m; }, [base]);
  const rows = useMemo(() => (cat === 'all' ? base : base.filter(e => e.cat === cat)), [base, cat]);
  const tRef = useRef(t); tRef.current = t;
  const cols = useMemo<ColDef<AuditEntry>[]>(() => [
    { field: 'at', headerName: t('Time'), width: 112, valueFormatter: x => when(x.value), cellClass: 'mono' },
    { field: 'actor', headerName: t('Who'), width: 170, cellRenderer: (x: ICellRendererParams<AuditEntry>) => { const e = x.data!; const p = principalById.get(e.actor);
      return <span className="pr">{e.actorKind === 'tool' ? <span className="toolmark">nsgfw</span> : <><PrincipalGlyph kind={p?.kind ?? e.actorKind as any} /><b>{p?.name ?? e.actor}</b></>}</span>; } },
    { field: 'action', headerName: t('What'), flex: 1, minWidth: 260, cellRenderer: (x: ICellRendererParams<AuditEntry>) => { const e = x.data!; return <span className="au-what"><b>{tRef.current(e.action)}</b> <span>{e.object}</span></span>; } },
    { colId: 'scopes', headerName: t('Scopes'), width: 260, sortable: false, cellRenderer: (x: ICellRendererParams<AuditEntry>) => { const e = x.data!; return <span className="spills">{e.scopes.slice(0, 2).map((s, i) => <ScopePill key={i} s={s} />)}{e.scopes.length > 2 && <span className="muted">+{e.scopes.length - 2}</span>}</span>; } },
    { field: 'result', headerName: t('Result'), width: 100, cellRenderer: (x: ICellRendererParams<AuditEntry>) => <span className={`res r-${x.value}`}>{tRef.current(x.value === 'ok' ? 'done' : x.value)}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);
  const opts = useMemo(() => ({ getRowId: (x: any) => String(x.data.seq), rowHeight: 40, defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true } as ColDef,
    onRowClicked: (e: any) => setSel(e.data) }), []);
  const verify = () => { setVerifying(true); setTimeout(() => { setVerifying(false); setVerifiedAt(hhmm(new Date())); se.log({ cat: 'setting', action: 'Verified the audit chain', object: `${se.audit[0].seq.toLocaleString()} entries`, scopes: [{ kind: 'instance', id: 'instance' }], result: se.chainBroken ? 'failed' : 'ok' }); }, 1400); };
  const scopes = useScopeSearch();
  return <>
    <header className="phead"><h1>{t('Audit log')}</h1><span className="sub">{t('Who did what, when and why. Append-only: nothing is edited or removed.')}</span></header>
    <div className={`chain ${se.chainBroken ? 'bad' : ''}`}>
      {se.chainBroken ? <ShieldError16Filled /> : <ShieldCheckmark16Filled />}
      {se.chainBroken ? <><b>{t('Chain broken at entry 1,284,977')}</b><span>{t('An entry was changed or removed after it was written. The SIEM export holds the entries as written.')}</span></>
        : <><b>{t('Chain intact')}</b><span>{t('verified today at')} {verifiedAt}, {se.audit[0].seq.toLocaleString()} {t('entries')}</span><span className="fork"><Branch16Regular />{t('1 fork at a recovery entry (2026-10-21), accepted')}</span></>}
      <span className="sp" /><span className="muted">{t('Export for the SIEM: JSON lines on stdout and a cursor API, unfiltered.')}</span>
      {se.anyAdmin && (verifying ? <Spinner size="tiny" label={t('Verifying…')} /> : <Button size="small" onClick={verify}>{t('Verify now')}</Button>)}
    </div>
    <div className="chipbar">
      {auditCats.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => <button key={k} className={`chip ${cat === k ? 'on' : ''} ${k === 'denied' ? 'c-deny' : k === 'auto' ? 'c-changed' : ''}`} onClick={() => setCat(k)}>{t(l)}<i>{(counts[k] ?? 0).toLocaleString()}</i></button>)}
      <span className="sp" />
      <div className="seg2">{(['24h', '7d', '30d'] as const).map(r => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{t({ '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[r])}</button>)}</div>
    </div>
    <div className="chipbar">
      <div className="scopef"><Input size="small" className="search" contentBefore={<Search16Regular />} placeholder={scope ? '' : t('Filter by Scope: Environment, VNet or Zone')} value={scopes.q} onChange={(_, d) => scopes.setQ(d.value)} />
        {scope && !scopes.q && <span className="scopef-on"><ScopePill s={scope} /><button className="ib" onClick={() => setScope(null)}><Dismiss16Regular /></button></span>}
        {scopes.hits.length > 0 && <div className="chk-l">{scopes.hits.map(s => <div key={`${s.kind}:${s.id}`} className="pal-i" onClick={() => { setScope(s); scopes.setQ(''); }}><ScopePill s={s} /><span>{t(kindLabel[s.kind])}</span></div>)}</div>}</div>
      <Input className="search" contentBefore={<Search16Regular />} placeholder={t('Person, object, ticket or text')} value={q} onChange={(_, d) => setQ(d.value)} />
      <span className="sp" /><span className="hint">{se.instanceScope ? `${rows.length.toLocaleString()} ${t('entries')}` : `${rows.length.toLocaleString()} ${t('entries that touch your Scopes')}`}</span>
    </div>
    <div className="sheet audit">
      <div className="au-grid"><AgGridReact theme={gridTheme} rowData={rows} columnDefs={cols} {...opts} animateRows={false} containerStyle={{ height: '100%' }} /></div>
      {sel && <AuditDetail e={sel} onClose={() => setSel(null)} onScope={s => setScope(s)} onRule={onRule} />}
    </div>
  </>;
}

function useScopeSearch() {
  const se = useSession(); const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const ql = q.trim().toLowerCase(); if (ql.length < 2) return [];
    const out: ScopeRef[] = [];
    envs.forEach(e => e.name.toLowerCase().includes(ql) && out.push({ kind: 'env', id: e.id }));
    for (const v of vnets) { if (out.length > 8) break; if (v.name.includes(ql)) out.push({ kind: 'vnet', id: v.name }); }
    for (const [n, z] of zoneByName) { if (out.length > 14) break; if (n.includes(ql)) out.push({ kind: 'zone', id: z.id }); }
    return out.filter(se.seesScope);
  }, [q, se.seesScope]);
  return { q, setQ, hits };
}

function AuditDetail({ e, onClose, onScope, onRule }: { e: AuditEntry; onClose: () => void; onScope: (s: ScopeRef) => void; onRule?: (id: string) => void }) {
  const { t } = useT(); const p = principalById.get(e.actor); const [copied, setCopied] = useState(false);
  const json = JSON.stringify({ seq: e.seq, at: e.at.toISOString(), actor: p ? { name: p.name, objectId: p.oid, type: p.kind } : { name: e.actor, type: e.actorKind }, action: e.action, object: e.object, scopes: e.scopes.map(s => `${s.kind}/${s.kind === 'zone' ? zoneById.get(s.id)?.name : s.id}`), result: e.result, detail: e.detail, prev: e.prev.slice(0, 16) + '…', hash: e.hash.slice(0, 16) + '…' });
  const rule = /^R\d{5}/.exec(e.object)?.[0];
  return (
    <aside className="au-d">
      <div className="dock-h"><b>{t('Entry')} {e.seq.toLocaleString()}</b><span className="sp" /><button className="ib" onClick={onClose}><Dismiss16Regular /></button></div>
      <div className="au-db">
        <h2>{t(e.action)}</h2><p className="au-obj">{e.object}</p>
        <dl className="kv">
          <dt>{t('When')}</dt><dd className="mono">{e.at.toISOString().replace('T', ' ').slice(0, 19)}</dd>
          <dt>{t('Who')}</dt><dd>{e.actorKind === 'tool' ? <>{t('nsgfw, on its own')}</> : <><b>{p?.name ?? e.actor}</b>{p?.upn && <div className="muted">{p.upn}</div>}</>}</dd>
          <dt>{t('Result')}</dt><dd><span className={`res r-${e.result}`}>{t(e.result === 'ok' ? 'done' : e.result)}</span></dd>
          {e.ticket && <><dt>{t('Ticket')}</dt><dd>{e.ticket}</dd></>}
          {e.detail && <><dt>{t('Detail')}</dt><dd>{t(e.detail)}</dd></>}
          <dt>{t('Scopes')}</dt><dd className="spills wrap">{e.scopes.map((s, i) => <button key={i} className="plain" title={pathOf(s).map(scopeName).join(' › ')} onClick={() => onScope(s)}><ScopePill s={s} /></button>)}</dd>
        </dl>
        {rule && onRule && <Button size="small" icon={<ArrowRight16Regular />} iconPosition="after" onClick={() => onRule(rule)}>{t('Open the Rule')}</Button>}
        <h3>{t('Chain')}</h3>
        <dl className="kv"><dt>{t('Previous')}</dt><dd className="mono hash">{e.prev.slice(0, 32)}…</dd><dt>{t('This entry')}</dt><dd className="mono hash">{e.hash.slice(0, 32)}…</dd></dl>
        <h3>{t('As exported')}<button className="ib" style={{ marginLeft: 6 }} title={t('Copy')} onClick={() => { navigator.clipboard?.writeText(json).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? '✓' : <Copy16Regular />}</button></h3>
        <pre className="jsonl">{json}</pre>
      </div>
    </aside>
  );
}
