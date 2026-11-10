// PROTOTYPE, throwaway. Zone overview: every Managed NSG's use of every limit, candidates and flagged Zones.
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Badge, Input, TabList, Tab, Tooltip } from '@fluentui/react-components';
import { Search16Regular } from '@fluentui/react-icons';
import { zones, candidates, envs, Zone, Flag } from './data';
import { gridTheme } from './RuleGrid';
import { useT } from './i18n';

// Limits checked 2026-11-09 (research: NSG and ASG rule semantics and limits).
export const LIMITS = { rules: 2000, addr: 6000, asgs: 100, nsgPerSubRegion: 5000, asgPerSubRegion: 3000 };
export function Bar({ v, max }: { v: number; max: number }) {
  const pct = Math.min(100, (v / max) * 100);
  return <span className="bar" title={`${v.toLocaleString()} / ${max.toLocaleString()}`}><span className={pct > 95 ? 'r' : pct > 80 ? 'a' : 'g'} style={{ width: `${pct}%` }} /><em>{v.toLocaleString()}</em></span>;
}
const flagText: Record<Flag, [string, 'danger' | 'warning' | 'informative']> = {
  drift: ['Drift', 'danger'], policy: ['Policy', 'danger'], limit: ['near limit', 'warning'], perm: ['missing permission', 'danger'],
  import: ['Import notes', 'warning'], avnm: ['AVNM admin rules', 'informative'], nicnsg: ['NIC-level NSGs', 'informative'],
};
export const Flags = ({ z }: { z: Zone }) => <span className="badges">{z.flags.map(f => <Badge key={f} size="small" appearance="tint" color={flagText[f][1]}>{flagText[f][0]}</Badge>)}{z.inherited && <Badge size="small" appearance="outline">Inherited defaults</Badge>}</span>;
export const EgressBadge = ({ e }: { e: Zone['egress'] }) => { const { t } = useT(); return <Badge size="small" appearance={e === 'strict' ? 'filled' : 'tint'} color={e === 'strict' ? 'important' : 'brand'}>{e === 'strict' ? t('strict') : t('destination decides')}</Badge>; };

export function ZoneGrid({ onOpen, height }: { onOpen?: (z: Zone) => void; height?: string }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<'zones' | 'cand' | 'flag'>('zones');
  const [q, setQ] = useState('');
  const flagged = useMemo(() => zones.filter(z => z.flags.length), []);
  const subUse = useMemo(() => { const m = new Map<string, number>(); zones.forEach(z => m.set(`${z.sub} · ${z.region}`, (m.get(`${z.sub} · ${z.region}`) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1])[0]; }, []);
  const zcols = useMemo<ColDef<Zone>[]>(() => [
    { field: 'name', headerName: t('Zone'), width: 170, pinned: 'left', cellRenderer: (x: ICellRendererParams<Zone>) => <a className="link" onClick={() => onOpen?.(x.data!)}>{x.value}</a> },
    { field: 'env', headerName: t('Environment'), width: 130, valueFormatter: x => envs.find(e => e.id === x.value)?.name ?? '' },
    { field: 'vnet', headerName: t('VNet'), width: 170 },
    { field: 'prefix', headerName: t('Prefixes'), width: 190, valueGetter: x => [x.data!.prefix, ...(x.data!.extra ?? []).map(e => `+${e}`)].join(' ') },
    { field: 'egress', headerName: t('Egress posture'), width: 140, cellRenderer: (x: ICellRendererParams<Zone>) => <EgressBadge e={x.value} /> },
    { field: 'rules', headerName: `${t('NSG rules')} (${LIMITS.rules.toLocaleString()})`, width: 150, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.rules} /> },
    { field: 'addrSrc', headerName: `${t('Source addresses')} (${LIMITS.addr.toLocaleString()})`, width: 170, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.addr} /> },
    { field: 'addrDst', headerName: `${t('Destination addresses')} (${LIMITS.addr.toLocaleString()})`, width: 170, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.addr} /> },
    { field: 'asgs', headerName: `${t('ASGs')} (${LIMITS.asgs})`, width: 110, cellRenderer: (x: ICellRendererParams<Zone>) => <Bar v={x.value} max={LIMITS.asgs} /> },
    { field: 'nsg', headerName: t('Managed NSG'), width: 200, cellClass: 'mono' },
    { colId: 'flags', headerName: t('Flags'), flex: 1, minWidth: 200, valueGetter: x => x.data!.flags.join(' '), cellRenderer: (x: ICellRendererParams<Zone>) => <Flags z={x.data!} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);
  const ccols = useMemo<ColDef[]>(() => [
    { field: 'subnet', headerName: 'Subnet', width: 180 }, { field: 'vnet', headerName: t('VNet'), width: 180 }, { field: 'prefix', headerName: t('Prefixes'), width: 150 },
    { field: 'env', headerName: t('Environment'), width: 130, valueFormatter: x => envs.find(e => e.id === x.value)?.name ?? '' },
    { field: 'nsg', headerName: t('Existing NSG'), width: 200, valueFormatter: x => x.value ? `${x.value}${x.data.shared ? ' (shared: swap)' : ' (adopt in place)'}` : '—' },
    { colId: 'state', headerName: '', flex: 1, cellRenderer: (x: ICellRendererParams) => x.data.reason ? <Tooltip relationship="description" content={reasons[x.data.reason]}><Badge appearance="outline" color="danger">{t('Not onboardable')}: {reasons[x.data.reason]}</Badge></Tooltip> : <a className="link">{t('Onboard')} →</a> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang]);
  return (
    <div className="col" style={{ height: height ?? '100%' }}>
      <div className="row gap wrap" style={{ padding: '6px 0' }}>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as never)}>
          <Tab value="zones">{t('Zones')} ({zones.length.toLocaleString()})</Tab><Tab value="cand">{t('Candidates')} ({candidates.length})</Tab><Tab value="flag">{t('Flagged')} ({flagged.length})</Tab>
        </TabList>
        <Input size="small" contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={q} onChange={(_, d) => setQ(d.value)} />
        <span className="muted">{t('Highest use per subscription and region')}: NSGs <Bar v={subUse[1]} max={LIMITS.nsgPerSubRegion} /> ({subUse[0]}) · ASGs <Bar v={212} max={LIMITS.asgPerSubRegion} /></span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'cand'
          ? <AgGridReact theme={gridTheme} rowData={candidates} columnDefs={ccols} quickFilterText={q} />
          : <AgGridReact<Zone> theme={gridTheme} rowData={tab === 'flag' ? flagged : zones} columnDefs={zcols} quickFilterText={q} getRowId={x => x.data.id} />}
      </div>
    </div>
  );
}
const reasons: Record<string, string> = { reasonSpecial: 'Azure forbids an NSG on this subnet', reasonService: 'a service maintains its NSG rules (SQL MI)', reasonForward: 'forwards traffic for other subnets (NVA)' };
