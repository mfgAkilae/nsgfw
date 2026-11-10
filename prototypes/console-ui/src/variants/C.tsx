// PROTOTYPE, throwaway. Variant C, "Zone lens": pick a Zone, see the complete effective rule set of its Managed NSG in Rule base order,
// including Platform exceptions, defaults and Azure default rules. Pending changes sit in a bottom panel scoped to that Zone.
import { useMemo, useState } from 'react';
import { Button, TabList, Tab, Input, Dropdown, Option } from '@fluentui/react-components';
import { Search16Regular, ChevronDown16Regular, ChevronUp16Regular } from '@fluentui/react-icons';
import { RuleGrid, SysRow } from '../RuleGrid';
import { ZoneGrid, Bar, Flags, EgressBadge, LIMITS } from '../ZoneGrid';
import { PreviewView, WriteOrderView, ApprovalView, CsActions, InboxButton, MoveDialog, StateBadge, usePreview, useApproval } from '../ChangeViews';
import { Brand, LangSwitch, Me, BulkBar, useDebounced, reportReady } from '../bits';
import { useStore, placement } from '../store';
import { zones, zoneById, vnets, envs, Zone } from '../data';
import { useT } from '../i18n';

export const name = 'Zone lens';
export default function VariantC() {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv);
  const [zid, setZid] = useState('z0042-db'); const [dir, setDir] = useState<'in' | 'out' | 'all' | 'overview'>('in');
  const [zq, setZq] = useState(''); const [env, setEnv] = useState('prod'); const [panel, setPanel] = useState(true); const [ptab, setPtab] = useState('nsg');
  const [sel, setSel] = useState<string[]>([]); const [moveIds, setMoveIds] = useState<string[] | null>(null); const [q, dq, setQ] = useDebounced();
  const z = zoneById.get(zid)!;
  const rows = useMemo(() => dir === 'all' ? s.rules : s.rules.filter(r => { const p = placement(r); return dir === 'in' ? p.dst.includes(zid) : p.src.includes(zid); }), [s.rules, zid, dir]);
  const sysRows = useMemo<{ top: SysRow[]; bottom: SysRow[] }>(() => ({
    top: [{ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: dir === 'in' ? 'AzureLoadBalancer → this Zone · allow · priority 100' : 'none outbound' }],
    bottom: [
      { id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: `${z.name} → ${z.name} · allow` },
      ...(z.inherited ? [{ id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: dir === 'in' ? 'VirtualNetwork → this Zone · allow' : 'this Zone → VirtualNetwork, Internet · allow' } as SysRow] : []),
      ...(dir === 'out' && z.egress === 'dest' ? [{ id: 'sys-egress', system: 'intra', name: 'Egress posture', text: 'destination decides: outbound to the Internal address space is open; the destination Zone decides' } as SysRow] : []),
      { id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: dir === 'in' ? 'any → this Zone · deny · priority 4096' : 'this Zone → any · deny · priority 4096' },
      { id: 'sys-az', system: 'azure', name: 'Azure default rules (read-only)', text: dir === 'in' ? 'AllowVnetInBound, AllowAzureLoadBalancerInBound, DenyAllInBound · never reached' : 'AllowVnetOutBound, AllowInternetOutBound, DenyAllOutBound · never reached' },
    ],
  }), [z, dir]);
  const zlist = useMemo(() => { const ql = zq.toLowerCase(); return zones.filter(x => x.env === env && (!ql || x.name.includes(ql) || x.vnet.includes(ql) || x.prefix.includes(ql))).slice(0, 400); }, [zq, env]);
  const mine = pv.nsgs.find(n => n.nsg === z.nsg);
  return (
    <div className="vc">
      <header className="hdr">
        <Brand />
        <Dropdown size="small" value={envs.find(e => e.id === env)!.name} onOptionSelect={(_, d) => setEnv(String(d.optionValue))} style={{ minWidth: 160 }}>{envs.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}</Dropdown>
        <span className="muted">{t('Change set')}: CHG-5120 <StateBadge state={ap.eff} /> · {s.edits.length} {t('Changes').toLowerCase()}</span>
        <span style={{ flex: 1 }} /><InboxButton /><LangSwitch /><Me />
      </header>
      <div className="vc-body">
        <aside className="vc-left">
          <Input size="small" contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={zq} onChange={(_, d) => setZq(d.value)} style={{ width: '100%' }} />
          <div className="vc-zlist">
            {zlist.map((x, i) => <div key={x.id}>
              {(i === 0 || zlist[i - 1].vnet !== x.vnet) && <div className="vc-vnet">{x.vnet}</div>}
              <div className={`vc-z ${x.id === zid ? 'on' : ''}`} onClick={() => setZid(x.id)}><span>{x.name}</span>{x.flags.length > 0 && <span className="dot" />}<Bar v={x.rules} max={LIMITS.rules} /></div>
            </div>)}
            <div className="muted" style={{ padding: 6 }}>{vnets.filter(v => v.env === env).length} VNets · showing {zlist.length}</div>
          </div>
        </aside>
        <main className="vc-main">
          <div className="vc-zhead">
            <div><h2 style={{ margin: 0 }}>{z.name}</h2><span className="muted">{z.vnet} · {z.prefix}{z.extra ? ` + ${z.extra.join(', ')}` : ''} · {envs.find(e => e.id === z.env)?.name} · <span className="mono">{z.nsg}</span></span></div>
            <div className="vc-gauges">
              <span>{t('Egress posture')} <EgressBadge e={z.egress} /></span>
              <span>{t('NSG rules')} <Bar v={z.rules} max={LIMITS.rules} /></span><span>{t('Source addresses')} <Bar v={z.addrSrc} max={LIMITS.addr} /></span>
              <span>{t('ASGs')} <Bar v={z.asgs} max={LIMITS.asgs} /></span><Flags z={z} />
            </div>
          </div>
          <TabList size="small" selectedValue={dir} onTabSelect={(_, d) => setDir(d.value as never)}>
            <Tab value="in">{t('Effective rule set')}: {t('Inbound')}</Tab><Tab value="out">{t('Outbound')}</Tab><Tab value="all">{t('All Rules')} (10,000)</Tab><Tab value="overview">{t('Zones')}</Tab>
          </TabList>
          {dir === 'overview' ? <ZoneGrid onOpen={(x: Zone) => { setZid(x.id); setEnv(x.env); setDir('in'); }} /> : <>
            <BulkBar sel={sel} onMoveTo={setMoveIds} quick={q} setQuick={setQ}><span className="muted">{rows.length} {t('Rules')} {dir !== 'all' ? `land on ${z.nsg}` : ''}</span></BulkBar>
            <div style={{ flex: 1, minHeight: 0 }}><RuleGrid key={`${zid}-${dir}`} rows={rows} quick={dq} showSystem={dir !== 'all'} systemRows={sysRows} compactCols onSelection={setSel} onMoveTo={setMoveIds} onReady={reportReady(`Zone ${z.name} ${dir}`)} /></div>
          </>}
          <section className={`vc-panel ${panel ? 'open' : ''}`}>
            <div className="vc-panel-h" onClick={() => setPanel(!panel)}>
              {panel ? <ChevronDown16Regular /> : <ChevronUp16Regular />} <b>{t('Pending changes')}</b>
              <span className="muted">{mine ? `${z.nsg}: +${mine.ops.filter(o => o.op === 'create').length} ~${mine.ops.filter(o => o.op === 'change').length} −${mine.ops.filter(o => o.op === 'delete').length}` : `${z.nsg}: —`} · {t('This Change set also touches')} {Math.max(0, pv.affected.length - (mine ? 1 : 0))} {t('other Zones')}</span>
              <span style={{ flex: 1 }} /><span onClick={e => e.stopPropagation()}><CsActions pv={pv} compact /></span>
            </div>
            {panel && <div className="vc-panel-b">
              <TabList size="small" selectedValue={ptab} onTabSelect={(_, d) => setPtab(String(d.value))}><Tab value="nsg">{z.nsg}</Tab><Tab value="all">{t('Preview')} ({pv.nsgs.length} NSGs)</Tab><Tab value="order">{t('Write order')}</Tab><Tab value="approval">{t('Approval')}</Tab></TabList>
              <div className="vc-panel-c">
                {ptab === 'nsg' && (mine ? <table className="mini"><tbody>{mine.ops.map((o, i) => <tr key={i}><td className={`op ${o.op}`}>{o.op}</td><td>{o.dir}</td><td className="num">{o.priority}</td><td className="mono">{o.name}</td><td className="muted">{o.detail}</td></tr>)}</tbody></table> : <p className="muted">No change on this Zone's NSG.</p>)}
                {ptab === 'all' && <PreviewView pv={pv} />}{ptab === 'order' && <WriteOrderView pv={pv} />}{ptab === 'approval' && <ApprovalView pv={pv} />}
              </div>
            </div>}
          </section>
        </main>
      </div>
      <MoveDialog ids={moveIds} onClose={() => setMoveIds(null)} />
    </div>
  );
}
