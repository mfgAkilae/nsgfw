// PROTOTYPE, throwaway. Variant C, "Zone lens": pick a Zone, see the complete effective rule set of its Managed NSG in Rule base order,
// including Platform exceptions, defaults and Azure default rules. Pending changes sit in a bottom panel scoped to that Zone.
import { useMemo, useState } from 'react';
import { TabList, Tab, Input } from '@fluentui/react-components';
import { Search16Regular, ChevronDown16Regular, ChevronUp16Regular } from '@fluentui/react-icons';
import { RuleGrid, SysRow } from '../RuleGrid';
import { ZoneGrid, Bar, Flags, EgressBadge, LIMITS } from '../ZoneGrid';
import { PreviewView, WriteOrderView, ApprovalView, CsActions, InboxButton, MoveDialog, usePreview, useApproval } from '../ChangeViews';
import { Brand, LangSwitch, Me, BulkBar, useDebounced, reportReady, HeaderNav } from '../bits';
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
    top: [{ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: dir === 'in' ? 'Azure Load Balancer health probes to this Zone are allowed, priority 100.' : 'None outbound.' }],
    bottom: [
      { id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: `Traffic inside ${z.name} is allowed.` },
      ...(z.inherited ? [{ id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: dir === 'in' ? 'VirtualNetwork to this Zone is allowed, as before onboarding.' : 'This Zone to VirtualNetwork and Internet is allowed, as before onboarding.' } as SysRow] : []),
      ...(dir === 'out' && z.egress === 'dest' ? [{ id: 'sys-egress', system: 'intra', name: 'Egress posture', text: 'Outbound to the Internal address space is open. The destination Zone decides.' } as SysRow] : []),
      { id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: dir === 'in' ? 'Everything else to this Zone is denied, priority 4096.' : 'Everything else from this Zone is denied, priority 4096.' },
      { id: 'sys-az', system: 'azure', name: 'Azure default rules (read-only)', text: dir === 'in' ? 'AllowVnetInBound, AllowAzureLoadBalancerInBound, DenyAllInBound. Never reached.' : 'AllowVnetOutBound, AllowInternetOutBound, DenyAllOutBound. Never reached.' },
    ],
  }), [z, dir]);
  const zlist = useMemo(() => { const ql = zq.toLowerCase(); return zones.filter(x => x.env === env && (!ql || x.name.includes(ql) || x.vnet.includes(ql) || x.prefix.includes(ql))).slice(0, 400); }, [zq, env]);
  const mine = pv.nsgs.find(n => n.nsg === z.nsg);
  return (
    <div className="vc">
      <header className="hdr">
        <Brand />
        <HeaderNav items={envs.map(e => [e.id, e.name] as [string, string])} value={env} onChange={setEnv} />
        <span className="cs-pill"><span className={`dot ${ap.eff}`} />CHG-5120 Release app0042<span className="cnt">{s.edits.length} {t('Changes').toLowerCase()}</span></span>
        <span style={{ flex: 1 }} /><InboxButton /><LangSwitch /><Me />
      </header>
      <div className="vc-body">
        <aside className="vc-left">
          <Input size="small" contentBefore={<Search16Regular />} placeholder={t('Search Zones…')} value={zq} onChange={(_, d) => setZq(d.value)} style={{ width: '100%' }} />
          <div className="vc-zlist">
            {zlist.map((x, i) => <div key={x.id}>
              {(i === 0 || zlist[i - 1].vnet !== x.vnet) && <div className="vc-vnet">{x.vnet}</div>}
              <div className={`vc-z ${x.id === zid ? 'on' : ''}`} onClick={() => setZid(x.id)}><span className="nm">{x.name}</span>{x.flags.length > 0 && <span className="flagdot" title={x.flags.join(', ')} />}<Bar v={x.rules} max={LIMITS.rules} /></div>
            </div>)}
            <div className="muted" style={{ padding: 8 }}>Showing {zlist.length} Zones of {vnets.filter(v => v.env === env).length} VNets. Search to find others.</div>
          </div>
        </aside>
        <main className="vc-main">
          <div className="vc-zhead">
            <div><h1>{z.name}</h1>
              <div className="vc-facts"><span className="addr">{z.prefix}{z.extra ? ` + ${z.extra.join(', ')}` : ''}</span><span>{z.vnet}</span><span>{envs.find(e => e.id === z.env)?.name}</span><span className="mono">{z.nsg}</span><Flags z={z} /></div></div>
            <div className="vc-gauges">
              <div>{t('Egress posture')}<EgressBadge e={z.egress} /></div>
              <div>{t('NSG rules')}<Bar v={z.rules} max={LIMITS.rules} /></div><div>{t('Source addresses')}<Bar v={z.addrSrc} max={LIMITS.addr} /></div>
              <div>{t('ASGs')}<Bar v={z.asgs} max={LIMITS.asgs} /></div>
            </div>
          </div>
          <TabList size="small" selectedValue={dir} onTabSelect={(_, d) => setDir(d.value as never)}>
            <Tab value="in">{t('Effective rule set')}: {t('Inbound')}</Tab><Tab value="out">{t('Outbound')}</Tab><Tab value="all">{t('All Rules')} (10,000)</Tab><Tab value="overview">{t('Zones')}</Tab>
          </TabList>
          {dir === 'overview' ? <ZoneGrid onOpen={(x: Zone) => { setZid(x.id); setEnv(x.env); setDir('in'); }} /> : <>
            <BulkBar sel={sel} onMoveTo={setMoveIds} quick={q} setQuick={setQ}><span className="selinfo">{rows.length} {t('Rules')}{dir !== 'all' ? ` land on this Zone ${dir === 'in' ? 'inbound' : 'outbound'}` : ''}</span></BulkBar>
            <div className="gridwrap" style={{ flex: 1, minHeight: 0, height: 'auto' }}><RuleGrid key={`${zid}-${dir}`} rows={rows} quick={dq} showSystem={dir !== 'all'} systemRows={sysRows} compactCols onSelection={setSel} onMoveTo={setMoveIds} onReady={reportReady(`Zone ${z.name} ${dir}`)} /></div>
          </>}
          <section className={`vc-panel ${panel ? 'open' : ''}`}>
            <div className="vc-panel-h" onClick={() => setPanel(!panel)}>
              {panel ? <ChevronDown16Regular /> : <ChevronUp16Regular />} <b>{t('Pending changes')}</b>
              <span className="muted">{mine ? `${mine.ops.length} ${t('NSG rules')} change on this Zone.` : 'Nothing changes on this Zone.'} {t('This Change set also touches')} {Math.max(0, pv.affected.length - (mine ? 1 : 0))} {t('other Zones')}.</span>
              <span style={{ flex: 1 }} /><span onClick={e => e.stopPropagation()}><CsActions pv={pv} compact /></span>
            </div>
            {panel && <div className="vc-panel-b">
              <TabList size="small" selectedValue={ptab} onTabSelect={(_, d) => setPtab(String(d.value))}><Tab value="nsg">{z.nsg}</Tab><Tab value="all">{t('Preview')} ({pv.nsgs.length} NSGs)</Tab><Tab value="order">{t('Write order')}</Tab><Tab value="approval">{t('Approval')}</Tab></TabList>
              <div className="vc-panel-c">
                {ptab === 'nsg' && (mine ? <table className="mini"><thead><tr><th></th><th>Dir.</th><th>Priority</th><th>NSG rule</th><th>Why</th></tr></thead><tbody>{mine.ops.map((o, i) => <tr key={i}><td className={`op ${o.op}`}>{o.op}</td><td>{o.dir === 'in' ? t('Inbound') : t('Outbound')}</td><td>{o.priority}</td><td className="mono">{o.name}</td><td className="muted">{o.detail}</td></tr>)}</tbody></table> : <p className="muted">Nothing changes on this Zone's NSG.</p>)}
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
