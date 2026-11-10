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
  const [tab, setTab] = useState<'zones' | 'cand' | 'flag'>('zones');
  const [q, setQ] = useState('');
  const flagged = useMemo(() => zones.filter(z => z.flags.length), []);
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
          <button className={tab === 'flag' ? 'on' : ''} onClick={() => setTab('flag')}>{t('Flagged')} {flagged.length}</button>
        </div>
        <Input contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={q} onChange={(_, d) => setQ(d.value)} style={{ width: 280 }} />
        <span className="sp" />
        <span className="muted">{t('Highest use per subscription and region')}: NSGs <Bar v={subUse[1]} max={LIMITS.nsgPerSubRegion} /> ASGs <Bar v={212} max={LIMITS.asgPerSubRegion} /></span>
      </div>
      <div className="sheet"><div className="gridbox">
        {tab === 'cand'
          ? <AgGridReact theme={gridTheme} rowData={candidates} columnDefs={ccols} quickFilterText={q} rowHeight={40} />
          : <AgGridReact<Zone> theme={gridTheme} rowData={tab === 'flag' ? flagged : zones} columnDefs={zcols} quickFilterText={q} getRowId={x => x.data.id} rowHeight={40} />}
      </div></div>
    </>
  );
}
const reasons: Record<string, string> = { reasonSpecial: 'Azure forbids an NSG on this subnet', reasonService: 'a service maintains its NSG rules (SQL MI)', reasonForward: 'forwards traffic for other subnets (NVA)' };
