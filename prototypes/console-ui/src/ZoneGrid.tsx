// PROTOTYPE, throwaway. Zone overview: every Managed NSG's use of every limit, candidates and flagged Zones.
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Input } from '@fluentui/react-components';
import { Search16Regular } from '@fluentui/react-icons';
import { zones, candidates, envs, Zone, Flag } from './data';
import { gridTheme } from './RuleGrid';
import { useT } from './i18n';

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
export const Flags = ({ z }: { z: Zone }) => <span className="badges">{z.flags.map(f => <span key={f} className={`zflag ${flagText[f][1]}`}>{flagText[f][0]}</span>)}{z.inherited && <span className="zflag">Inherited defaults</span>}</span>;
export const EgressBadge = ({ e }: { e: Zone['egress'] }) => { const { t } = useT(); return <span className={`egress ${e === 'strict' ? 'strict' : ''}`}>{e === 'strict' ? t('strict') : t('destination decides')}</span>; };

export function ZoneGrid({ onOpen }: { onOpen?: (z: Zone) => void }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'zones' | 'cand'>('zones');
  const [q, setQ] = useState(''); const [zf, setZf] = useState('all');
  const zfilters = useMemo(() => { const f: [string, string, string, (z: Zone) => boolean][] = [
    ['all', 'All', '', () => true], ['flagged', 'Flagged', 'c-deny', z => z.flags.length > 0], ['limit', 'Near a limit', 'c-expiring', z => z.flags.includes('limit')], ['drift', 'Drift', 'c-deny', z => z.flags.includes('drift')],
    ['policy', 'Policy finding', 'c-findings', z => z.flags.includes('policy')], ['perm', 'Missing permission', 'c-findings', z => z.flags.includes('perm')], ['import', 'Import notes', 'c-expiring', z => z.flags.includes('import')],
    ['strict', 'Strict egress', 'c-disabled', z => z.egress === 'strict'], ['inherited', 'Inherited defaults', 'c-disabled', z => z.inherited]];
    return f.map(([k, label, cls, fn]) => ({ k, label, cls, fn, n: zones.filter(fn).length })); }, []);
  const shown = useMemo(() => (zf === 'all' ? zones : zones.filter(zfilters.find(x => x.k === zf)!.fn)), [zf, zfilters]);
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
  const ccols = useMemo<ColDef[]>(() => [
    { field: 'subnet', headerName: 'Subnet', width: 180 }, { field: 'vnet', headerName: t('VNet'), width: 180 }, { field: 'prefix', headerName: t('Prefixes'), width: 150 },
    { field: 'env', headerName: t('Environment'), width: 130, valueFormatter: x => envs.find(e => e.id === x.value)?.name ?? '' },
    { field: 'nsg', headerName: t('Existing NSG'), width: 200, valueFormatter: x => x.value ? `${x.value}${x.data.shared ? ' (shared: swap)' : ' (adopt in place)'}` : '—' },
    { colId: 'state', headerName: '', flex: 1, cellRenderer: (x: ICellRendererParams) => x.data.reason ? <span className="zflag">{t('Not onboardable')}: {reasons[x.data.reason]}</span> : <a className="link">{t('Onboard')}</a> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);
  return (
    <>
      <div className="zbar">
        <div className="seg2" role="tablist">
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>{t('Zones')} {zones.length.toLocaleString()}</button>
          <button className={tab === 'cand' ? 'on' : ''} onClick={() => setTab('cand')}>{t('Candidates')} {candidates.length}</button>
        </div>
        <Input className="search" contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={q} onChange={(_, d) => setQ(d.value)} />
        <span className="sp" />
        <span className="muted">{t('Highest use per subscription and region')}: NSGs <Bar v={subUse[1]} max={LIMITS.nsgPerSubRegion} /> ASGs <Bar v={212} max={LIMITS.asgPerSubRegion} /></span>
      </div>
      {tab === 'zones' && <div className="chipbar">{zfilters.map(f => <button key={f.k} className={`chip ${f.cls} ${zf === f.k ? 'on' : ''}`} aria-pressed={zf === f.k} onClick={() => setZf(f.k)}>{t(f.label)}<i>{f.n.toLocaleString()}</i></button>)}</div>}
      <div className="sheet"><div className="gridbox">
        {tab === 'cand'
          ? <AgGridReact theme={gridTheme} containerStyle={{ flex: 1, minWidth: 0, height: '100%' }} rowData={candidates} columnDefs={ccols} quickFilterText={q} rowHeight={42} />
          : <AgGridReact<Zone> theme={gridTheme} containerStyle={{ flex: 1, minWidth: 0, height: '100%' }} rowData={shown} columnDefs={zcols} quickFilterText={q} getRowId={x => x.data.id} rowHeight={42} />}
      </div></div>
    </>
  );
}
const reasons: Record<string, string> = { reasonSpecial: 'Azure forbids an NSG on this subnet', reasonService: 'a service maintains its NSG rules (SQL MI)', reasonForward: 'forwards traffic for other subnets (NVA)' };
