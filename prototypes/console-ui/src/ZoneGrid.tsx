// PROTOTYPE, throwaway. Zone overview: every Managed NSG's use of every limit, candidates and flagged Zones.
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Input } from '@fluentui/react-components';
import { Search16Regular } from '@fluentui/react-icons';
import { zones, candidates, envs, Zone, Flag, type Candidate } from './data';
import { avnmCount, nicNsgCount, onboarded } from './zonedata';
import { gridTheme } from './RuleGrid';
import { useT } from './i18n';
import { useRef } from 'react';                           // issue 37
import { Dismiss16Regular } from '@fluentui/react-icons';  // issue 37
import { go37 } from './ops37';                            // issue 37
import { onboardable, subOf } from './importdata';         // issue 37

// Limits checked 2026-11-09 (research: NSG and ASG rule semantics and limits).
export const LIMITS = { rules: 2000, addr: 6000, asgs: 100, nsgPerSubRegion: 5000, asgPerSubRegion: 3000 };
export function Bar({ v, max }: { v: number; max: number }) {
  const pct = Math.min(100, (v / max) * 100);
  return <span className={`bar ${pct > 95 ? 'r' : pct > 80 ? 'a' : ''}`} title={`${v.toLocaleString()} of ${max.toLocaleString()}`}><em>{v.toLocaleString()}</em><span><i style={{ width: `${Math.max(pct, 1.5)}%` }} /></span></span>;
}
const flagText: Record<Flag, [string, string]> = {
  drift: ['Drift', 'red'], policy: ['Policy finding', 'red'], limit: ['Near a limit', 'amber'], perm: ['Missing permission', 'red'],
  import: ['Import notes', 'amber'], avnm: ['AVNM admin rules', ''], nicnsg: ['NIC-level NSGs', ''],
};
// Security layers show as counts (issue 35): "AVNM: n rules", "NIC NSGs: n".
export const Flags = ({ z }: { z: Zone }) => <span className="badges">{z.flags.filter(f => f !== 'avnm' && f !== 'nicnsg').map(f => <span key={f} className={`zflag ${flagText[f][1]}`}>{flagText[f][0]}</span>)}{avnmCount(z) > 0 && <span className="zflag">AVNM: {avnmCount(z)} rules</span>}{nicNsgCount(z) > 0 && <span className="zflag">NIC NSGs: {nicNsgCount(z)}</span>}{z.inherited && <span className="zflag">Inherited defaults</span>}</span>;
export const EgressBadge = ({ e }: { e: Zone['egress'] }) => { const { t } = useT(); return <span className={`egress ${e === 'strict' ? 'strict' : ''}`}>{e === 'strict' ? t('strict') : t('destination decides')}</span>; };

export function ZoneGrid({ onOpen, onCandidate, only }: { onOpen?: (z: Zone) => void; onCandidate?: (c: Candidate) => void; only?: Set<string> | null }) {
  const { t, lang } = useT();
  // Issue 38: under the read filter the overview lists only the Zones in the person's Scopes.
  const mine = useMemo(() => (only ? zones.filter(z => only.has(z.id)) : zones), [only]);
  const [tab, setTab] = useState<'zones' | 'cand'>('zones');
  const [q, setQ] = useState(''); const [zf, setZf] = useState('all');
  const zfilters = useMemo(() => { const f: [string, string, string, (z: Zone) => boolean][] = [
    ['all', 'All', '', () => true], ['flagged', 'Flagged', 'c-deny', z => z.flags.length > 0], ['limit', 'Near a limit', 'c-expiring', z => z.flags.includes('limit')], ['drift', 'Drift', 'c-deny', z => z.flags.includes('drift')],
    ['policy', 'Policy finding', 'c-findings', z => z.flags.includes('policy')], ['perm', 'Missing permission', 'c-findings', z => z.flags.includes('perm')], ['import', 'Import notes', 'c-expiring', z => z.flags.includes('import')],
    ['strict', 'Strict egress', 'c-disabled', z => z.egress === 'strict'], ['layers', 'Security layers', 'c-findings', z => avnmCount(z) > 0 || nicNsgCount(z) > 0], ['inherited', 'Inherited defaults', 'c-disabled', z => z.inherited]];
    return f.map(([k, label, cls, fn]) => ({ k, label, cls, fn, n: mine.filter(fn).length })); }, [mine]);
  const shown = useMemo(() => (zf === 'all' ? mine : mine.filter(zfilters.find(x => x.k === zf)!.fn)), [zf, zfilters, mine]);
  const subUse = useMemo(() => { const m = new Map<string, number>(); zones.forEach(z => m.set(`${z.sub} · ${z.region}`, (m.get(`${z.sub} · ${z.region}`) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1])[0]; }, []);
  const zcols = useMemo<ColDef<Zone>[]>(() => [
    { field: 'name', headerName: t('Zone'), width: 180, pinned: 'left', cellRenderer: (x: ICellRendererParams<Zone>) => <a className="link" style={{ fontWeight: 600 }} onClick={() => onOpen?.(x.data!)}>{x.value}</a> },
    { field: 'env', headerName: t('Environment'), width: 130, valueFormatter: x => envs.find(e => e.id === x.value)?.name ?? '' },
    { field: 'vnet', headerName: t('VNet'), width: 170 },
    { field: 'prefix', headerName: t('Prefixes'), width: 200, cellClass: 'mono', valueGetter: x => [x.data!.prefix, ...(x.data!.extra ?? []).map(e => `+${e}`)].join(' ') },
    { field: 'egress', headerName: t('Egress posture'), width: 170, cellRenderer: (x: ICellRendererParams<Zone>) => <EgressBadge e={x.value} /> },
    { field: 'rules', headerName: `${t('NSG rules')} / ${LIMITS.rules.toLocaleString()}`, width: 150, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.rules} /> },
    { field: 'addrSrc', headerName: `${t('Source addresses')} / ${LIMITS.addr.toLocaleString()}`, width: 170, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.addr} /> },
    { field: 'addrDst', headerName: `${t('Destination addresses')} / ${LIMITS.addr.toLocaleString()}`, width: 170, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.addr} /> },
    { field: 'asgs', headerName: `${t('ASGs')} / ${LIMITS.asgs}`, width: 110, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.asgs} /> },
    { field: 'nsg', headerName: t('Managed NSG'), width: 220, cellClass: 'mono' },
    { colId: 'flags', headerName: t('Flags'), flex: 1, minWidth: 200, valueGetter: x => x.data!.flags.join(' '), cellRenderer: (x: ICellRendererParams<Zone>) => <Flags z={x.data!} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);
  // issue 37: a candidate with an existing NSG opens the wide onboarding screen; one without keeps the side sheet of issue 35.
  const pick = (c: Candidate) => (onboardable(c) && c.nsg ? go37({ to: 'onboard', candidates: [c.id] }) : onCandidate?.(c));
  const ccols = useMemo<ColDef[]>(() => [
    { field: 'subnet', headerName: 'Subnet', width: 180 }, { field: 'vnet', headerName: t('VNet'), width: 180 }, { colId: 'sub', headerName: t('Subscription'), width: 150, valueGetter: x => subOf(x.data.vnet) }, { field: 'prefix', headerName: t('Prefixes'), width: 150 },
    { field: 'env', headerName: t('Environment'), width: 130, valueFormatter: x => envs.find(e => e.id === x.value)?.name ?? '' },
    { field: 'nsg', headerName: t('Existing NSG'), width: 290, valueFormatter: x => x.value ? `${x.value}${x.data.shared ? ' (shared: swap)' : ' (adopt in place)'}` : '—' },
    { colId: 'state', headerName: '', flex: 1, cellRenderer: (x: ICellRendererParams) => x.data.reason ? <a className="zflag clickable" onClick={() => pick(x.data)}>{t('Not onboardable')}: {t(reasons[x.data.reason])}</a> : <a className="link" onClick={() => pick(x.data)}>{onboarded.has(x.data.id) ? t('In your Change set') : t('Onboard')}</a> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);
  // issue 37: tick candidates to onboard several at once; a ticked one offers its whole VNet or subscription.
  const cgrid = useRef<AgGridReact>(null); const [csel, setCsel] = useState<Candidate[]>([]);
  const copts = useMemo(() => ({
    rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: false, enableClickSelection: false, hideDisabledCheckboxes: true, isRowSelectable: (n: any) => !!n.data && onboardable(n.data) } as const,
    selectionColumnDef: { pinned: 'left', width: 42, resizable: false } as ColDef,
    getRowId: (x: any) => x.data.id as string,
    onSelectionChanged: (e: any) => setCsel(e.api.getSelectedRows()),
  }), []);
  const anchor = csel[csel.length - 1]; const asub = anchor ? subOf(anchor.vnet) : '';
  const selectWhere = (fn: (c: Candidate) => boolean) => { const api = cgrid.current?.api; if (!api) return; const nodes: any[] = []; api.forEachNode(n => { if (n.data && onboardable(n.data) && fn(n.data)) nodes.push(n); }); api.setNodesSelected({ nodes, newValue: true }); };
  const inVnet = anchor ? candidates.filter(c => onboardable(c) && c.vnet === anchor.vnet).length : 0; const inSub = anchor ? candidates.filter(c => onboardable(c) && subOf(c.vnet) === asub).length : 0;
  return (
    <>
      <div className="zbar">
        <div className="seg2" role="tablist">
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>{t('Zones')} {mine.length.toLocaleString()}</button>
          <button className={tab === 'cand' ? 'on' : ''} onClick={() => setTab('cand')}>{t('Candidates')} {candidates.length}</button>
        </div>
        <Input className="search" contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={q} onChange={(_, d) => setQ(d.value)} />
        <span className="sp" />
        <span className="muted">{t('Highest use per subscription and region')}: NSGs <Bar v={subUse[1]} max={LIMITS.nsgPerSubRegion} /> ASGs <Bar v={212} max={LIMITS.asgPerSubRegion} /></span>
      </div>
      {tab === 'cand' && (anchor ? <div className="chipbar selbar">{/* issue 37 */}
        <b>{csel.length} {t('selected')}</b>
        <button onClick={() => selectWhere(c => c.vnet === anchor.vnet)}>{t('All in this VNet')} <span className="mono">{anchor.vnet}</span><i>{inVnet}</i></button>
        <button onClick={() => selectWhere(c => subOf(c.vnet) === asub)}>{t('All in this subscription')} <span className="mono">{asub}</span><i>{inSub}</i></button>
        <span className="sp" /><button onClick={() => cgrid.current?.api.deselectAll()}><Dismiss16Regular />{t('Clear selection')}</button>
        <button className="zgo" onClick={() => go37({ to: 'onboard', candidates: csel.map(c => c.id) })}>{t('Onboard')} {csel.length} {t(csel.length === 1 ? 'subnet' : 'subnets')}</button>
      </div> : <div className="chipbar"><span className="hint">{t('Tick subnets to onboard several at once. A ticked subnet offers its whole VNet or subscription.')}</span></div>)}
      {tab === 'zones' && <div className="chipbar">{zfilters.map(f => <button key={f.k} className={`chip ${f.cls} ${zf === f.k ? 'on' : ''}`} aria-pressed={zf === f.k} onClick={() => setZf(f.k)}>{t(f.label)}<i>{f.n.toLocaleString()}</i></button>)}</div>}
      <div className="sheet"><div className="gridbox">
        {tab === 'cand'
          ? <AgGridReact ref={cgrid} theme={gridTheme} containerStyle={{ flex: 1, minWidth: 0, height: '100%' }} rowData={candidates} columnDefs={ccols} quickFilterText={q} rowHeight={42} {...copts} />
          : <AgGridReact<Zone> theme={gridTheme} containerStyle={{ flex: 1, minWidth: 0, height: '100%' }} rowData={shown} columnDefs={zcols} quickFilterText={q} getRowId={x => x.data.id} rowHeight={42} />}
      </div></div>
    </>
  );
}
const reasons: Record<string, string> = { reasonSpecial: 'Azure forbids an NSG on this subnet', reasonService: 'a service maintains its NSG rules (SQL MI)', reasonForward: 'forwards traffic for other subnets (NVA)', reasonAks: 'AKS maintains its NSG', reasonTool: 'holds nsgfw itself' };
