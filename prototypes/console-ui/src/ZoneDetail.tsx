// PROTOTYPE, throwaway (issue 35). The Zone detail: the Zone lens grows three tabs.
// Rules: the lens, with the Security layers as bands in their evaluation order. Flows: the Flow view from VNet flow logs.
// Settings: Egress posture, Inherited defaults, Extra prefixes, DNS and the Managed NSG. Every setting is an edit in the current Change set.
import { useMemo, useState } from 'react';
import { Button, Input, Switch } from '@fluentui/react-components';
import { Dismiss16Regular, Search16Regular, Add16Regular, Dismiss12Regular, Warning16Filled, Info16Regular, Open12Regular, ArrowRight12Filled, Checkmark12Filled, Dismiss12Filled,
  ArrowSync16Regular, Clock16Regular, LayerDiagonal16Regular, BookOpen16Regular } from '@fluentui/react-icons';
import { Zone, Egress, zones, envs, objects, objById, services, svcById, Rule } from './data';
import { useStore, onDiscard } from './store';
import { Bar, LIMITS, EgressBadge, Flags } from './ZoneGrid';
import { compact, type SysRow, type BandItem } from './RuleGrid';
import { Chip } from './ObjectPicker';
import { Glyph } from './Glyph';
import { useT } from './i18n';
import { layersOf, flowsOf, flowState, egressImpact, inheritedImpact, dnsOf, dnsRuleFor, Flow, Decider, Peer } from './zonedata';
import './zone.css';

export type ZTab = 'rules' | 'flows' | 'settings';
const age = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

// ---------- Zone state that edits change. The prototype edits the mock Zone in place and puts it back on Discard.
type InhPart = 'inbound from VirtualNetwork' | 'outbound to VirtualNetwork' | 'outbound to Internet';
export const INH_PARTS: InhPart[] = ['inbound from VirtualNetwork', 'outbound to VirtualNetwork', 'outbound to Internet'];
const zOrig = new Map<string, { egress: Egress; extra?: string[]; inherited: boolean }>();
const inh = new Map<string, Set<InhPart>>();
const created: string[] = [];
onDiscard(() => {
  for (const [id, o] of zOrig) { const z = zones.find(x => x.id === id); if (z) Object.assign(z, o); }
  zOrig.clear(); inh.clear();
  for (const id of created.splice(0)) { const i = objects.findIndex(o => o.id === id); if (i >= 0) objects.splice(i, 1); objById.delete(id); svcById.delete(id); const k = services.findIndex(s => s.id === id); if (k >= 0) services.splice(k, 1); }
});
const remember = (z: Zone) => { if (!zOrig.has(z.id)) zOrig.set(z.id, { egress: z.egress, extra: z.extra ? [...z.extra] : undefined, inherited: z.inherited }); return zOrig.get(z.id)!; };
export const inhParts = (z: Zone) => inh.get(z.id) ?? new Set<InhPart>((zOrig.get(z.id)?.inherited ?? z.inherited) ? INH_PARTS : []);

// ---------- New Rule from a flow: source, destination and service from the flow. An Internet address becomes a new host object.
function hostFor(ip: string, s: ReturnType<typeof useStore>) {
  const hit = objects.find(o => (o.kind === 'ip' && o.value === ip)); if (hit) return hit.id;
  const id = `hx-${ip}`; const o = { id, name: `host-${ip}`, kind: 'ip' as const, value: ip, cov: [] };
  objects.push(o); objById.set(id, o); created.push(id);
  s.note({ kind: 'object', ruleId: `obj:${id}`, field: 'created', before: '', after: `host ${ip}, covers no Zone` });
  return id;
}
function svcFor(f: Flow) {
  const id = f.svcId ?? services.find(x => x.value === f.svc)?.id; if (id) return id;
  const nid = `svc-x-${f.svc.replace(/\s+/g, '-').toLowerCase()}`; if (!svcById.has(nid)) { const sv = { id: nid, name: f.svc.replace(' ', '-').toLowerCase(), value: f.svc }; services.push(sv); svcById.set(nid, sv); created.push(nid); }
  return nid;
}
export function ruleFromFlow(z: Zone, f: Flow, s: ReturnType<typeof useStore>): Partial<Rule> {
  const r = (p: Peer) => p.ref ?? hostFor(p.ip, s); const svc = svcFor(f);
  return { name: `Allow ${f.src.label} to ${f.dst.label} ${svcById.get(svc)?.name ?? f.svc}`, src: [r(f.src)], dst: [r(f.dst)], svc: [svc], action: 'allow', enabled: true,
    comment: `From the Flow view of ${z.name}: ${f.flows.toLocaleString()} flows, decided by ${deciderText(f.by)}` };
}
export function dnsRuleInit(z: Zone): Partial<Rule> | null {
  const d = dnsOf(z.vnet); if (!d) return null;
  const dst = d.servers.map(ip => { const hit = objects.find(o => o.kind === 'ip' && o.value === ip); if (hit) return hit.id; const id = `dns-${ip}`; const o = { id, name: `dns-${ip}`, kind: 'ip' as const, value: ip, cov: d.zone ? [d.zone] : [] }; objects.push(o); objById.set(id, o); created.push(id); return id; });
  return { name: `DNS from ${z.name}`, src: [`zone:${z.id}`], dst, svc: ['svc-dns-udp', 'svc-dns-tcp'], action: 'allow', enabled: true, comment: 'Proposed at onboarding: the VNet uses custom DNS servers' };
}
const bandName: Record<string, string> = { pe: 'Platform exceptions', intra: 'Intra-zone default', inherited: 'Inherited defaults', egress: 'Egress posture', denyall: 'Deny-all rules' };
const deciderText = (d: Decider) => d.kind === 'rule' ? `Rule ${d.id}` : d.kind === 'band' ? bandName[d.band] : d.kind === 'avnm' ? `AVNM ${d.name}` : `${d.nsg} ${d.rule}`;

// ---------- Head: the lens with tabs
export function ZoneHead({ z, dir, setDir, tab, setTab, onClose, ruleCount }: { z: Zone; dir: 'in' | 'out'; setDir: (d: 'in' | 'out') => void; tab: ZTab; setTab: (t: ZTab) => void; onClose: () => void; ruleCount: number }) {
  const { t } = useT(); const s = useStore(); const fs = flowState(z);
  const pending = s.edits.filter(e => e.ruleId === `zone:${z.id}`).length;
  return (
    <div className="lens zhead">
      <div className="lens-top">
        <span className="lens-name"><Glyph kind="zone" />{z.name}</span><span className="mono">{z.prefix}{z.extra?.length ? ` + ${z.extra.join(', ')}` : ''}</span>
        <span className="sp" />
        <div className="seg2" role="group"><button className={dir === 'in' ? 'on' : ''} onClick={() => setDir('in')}>{t('Inbound')}</button><button className={dir === 'out' ? 'on' : ''} onClick={() => setDir('out')}>{t('Outbound')}</button></div>
        <button className="lens-x" onClick={onClose}><Dismiss16Regular />{t('All Rules')}</button>
      </div>
      <div className="lens-facts"><span>{z.vnet}</span><span>{envs.find(e => e.id === z.env)?.name}</span><EgressBadge e={z.egress} /><Flags z={z} /><span className="sp" />
        <span>{t('NSG rules')}<Bar v={z.rules} max={LIMITS.rules} /></span><span>{t('Source addresses')}<Bar v={z.addrSrc} max={LIMITS.addr} /></span><span>{t('ASGs')}<Bar v={z.asgs} max={LIMITS.asgs} /></span></div>
      <div className="ztabs" role="tablist">
        <button role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>{t('Rules')}<i>{ruleCount.toLocaleString()}</i></button>
        <button role="tab" aria-selected={tab === 'flows'} className={tab === 'flows' ? 'on' : ''} onClick={() => setTab('flows')}>{t('Flows')}<i className={fs.kind === 'ok' ? '' : 'warn'}>{fs.kind === 'ok' ? `${t('newest')} ${age(fs.ageMin)}` : fs.kind === 'noaccess' ? t('no access') : t('no flow data')}</i></button>
        <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>{t('Settings')}{pending > 0 && <i className="cnt">{pending}</i>}</button>
      </div>
    </div>
  );
}

// ---------- Bands: the whole evaluation order of one Zone and direction. Security layers open into their rules.
export function lensBands(z: Zone, dir: 'in' | 'out', open: Set<string>, toggle: (id: string) => void): { top: SysRow[]; bottom: SysRow[] } {
  const inb = dir === 'in'; const l = layersOf(z); const parts = inhParts(z);
  const band = (b: SysRow): SysRow => (b.items?.length ? { ...b, open: open.has(b.id), toggle: () => toggle(b.id) } : b);
  const top: SysRow[] = []; const bottom: SysRow[] = [];
  if (l.avnmSkip) top.push({ id: 'sys-avnm', system: 'avnm', name: 'AVNM security admin rules', text: l.avnmSkip });
  else if (l.avnm.length) {
    const rows = l.avnm.filter(a => a.dir === dir); const warn = rows.filter(a => a.note?.sev).length;
    const items: BandItem[] = [{ k: 'h', head: true, prio: '', name: `${l.manager}`, act: '', cls: 'allow', flow: `network groups ${[...new Set(rows.map(a => a.group))].join(', ')}`, svc: '' },
      ...rows.map(a => ({ k: a.name, prio: String(a.priority), name: a.name, act: a.action, cls: (a.action === 'Deny' ? 'deny' : a.action === 'AlwaysAllow' ? 'always' : 'allow') as BandItem['cls'], flow: `${a.src} → ${a.dst}`, svc: a.svc, note: a.note?.text, sev: a.note?.sev }))];
    top.push(band({ id: 'sys-avnm', system: 'avnm', name: 'AVNM security admin rules', count: String(rows.length),
      text: rows.length ? `Evaluated before every NSG, from ${l.manager}.${warn ? ` ${warn} with a Rule warning.` : ''}` : `None ${inb ? 'inbound' : 'outbound'}.`, items: rows.length ? items : undefined }));
  }
  const nicItems: BandItem[] = l.nicNsgs.flatMap(n => [
    { k: n.name, head: true, prio: '', name: n.name, act: '', cls: 'allow' as const, flow: `on ${n.nics.length} of ${l.nicTotal} interfaces: ${n.nics.slice(0, 2).join(', ')}${n.nics.length > 2 ? ` +${n.nics.length - 2}` : ''}`, svc: '' },
    ...n.rules.filter(r => r.dir === dir).map(r => { const blocks = z.id === 'z0042-web' && n.name === 'nsg-nic-web-default' && r.name === 'DenyAllInBound';
      return { k: `${n.name}/${r.name}`, prio: String(r.priority), name: r.name, act: r.access, cls: (r.access === 'Deny' ? 'deny' : 'allow') as BandItem['cls'], flow: `${r.src} → ${r.dst}`, svc: r.svc,
        note: blocks ? 'Drops what “Web tier from Front Door” allows, on these 5 interfaces.' : r.dflt ? 'Azure default rule' : undefined, sev: blocks ? 'medium' as const : undefined }; })]);
  const nicCount = l.nicNsgs.reduce((a, n) => a + n.nics.length, 0);
  const nic: SysRow | null = l.nicNsgs.length ? band({ id: 'sys-nic', system: 'nic', name: 'NIC-level NSGs', count: String(l.nicNsgs.length),
    text: `${l.nicNsgs.length} ${l.nicNsgs.length === 1 ? 'NSG' : 'NSGs'} on ${nicCount} of ${l.nicTotal} interfaces. ${inb ? 'Traffic passes them after the Managed NSG.' : 'Traffic passes them before the Managed NSG.'}`, items: nicItems }) : null;
  if (!inb && nic) top.push(nic);
  top.push({ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: inb ? 'Azure Load Balancer health probes to this Zone are allowed, priority 100.' : 'None outbound.' });
  bottom.push({ id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: `Traffic inside ${z.name} is allowed.` });
  const mine = INH_PARTS.filter(p => parts.has(p) && (inb ? p.startsWith('inbound') : p.startsWith('outbound')));
  if (mine.length) bottom.push({ id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: `Kept from before onboarding: ${mine.join(', ')}.` });
  if (!inb && z.egress === 'dest') bottom.push({ id: 'sys-egress', system: 'egress', name: 'Egress posture', text: 'Outbound to the Internal address space is open. The destination Zone decides.' });
  bottom.push({ id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: inb ? 'Everything else to this Zone is denied, priority 4096.' : 'Everything else from this Zone is denied, priority 4096.' });
  bottom.push({ id: 'sys-az', system: 'azure', name: 'Azure default rules', text: 'Read-only and never reached.' });
  if (inb && nic) bottom.push(nic);
  if (l.user.length) bottom.push(band({ id: 'sys-avnmuser', system: 'avnmuser', name: 'AVNM security user rules', count: String(l.user.length), text: 'Microsoft does not document where they sit in this order. No Rule warnings.',
    items: l.user.map(a => ({ k: a.name, prio: String(a.priority), name: a.name, act: a.action, cls: 'allow' as const, flow: `${a.src} → ${a.dst}`, svc: a.svc })) }));
  return { top, bottom };
}

// ---------- Flow view
const WIN = { '24h': [1, '24 hours'], '7d': [6.4, '7 days'], '30d': [27, '30 days'] } as const;
type Win = keyof typeof WIN;
const FCHIPS: [string, string, (f: Flow) => boolean][] = [
  ['all', 'All', () => true], ['allow', 'Allowed', f => f.result === 'allow'], ['deny', 'Denied', f => f.result === 'deny'], ['rule', 'By a Rule', f => f.by.kind === 'rule'],
  ['inherited', 'By Inherited defaults', f => f.by.kind === 'band' && f.by.band === 'inherited'], ['egress', 'By the Egress posture', f => f.by.kind === 'band' && f.by.band === 'egress'],
  ['denyall', 'By the Deny-all rules', f => f.by.kind === 'band' && f.by.band === 'denyall'], ['layer', 'By a Security layer', f => f.by.kind === 'avnm' || f.by.kind === 'nic'],
];
// The Zone itself reads as "this Zone" on one line, so the other side stands out.
const PeerCell = ({ p, self }: { p: Peer; self: boolean }) => { const { t } = useT(); return self
  ? <div className="fpeer me"><span className="self">{t('this Zone')}</span><span className="mono">{p.ip}</span></div>
  : <div className="fpeer">{p.ref ? <Chip id={p.ref} /> : <span className="tok t-tag"><Glyph kind="tag" /><span className="tl">{t('Internet')}</span></span>}<span className="mono">{p.ip}</span></div>; };
export function DecidedBy({ d, ifaces, onRule }: { d: Decider; ifaces?: string; onRule: (id: string) => void }) {
  const { t } = useT(); const s = useStore();
  if (d.kind === 'rule') { const r = s.rules.find(x => x.id === d.id); return <a className="link dby" onClick={() => onRule(d.id)}>{t('Rule')} {s.numbers.get(d.id)}<b>{r?.name ?? d.id}</b>{ifaces && <span className="muted">{t('on')} {ifaces}</span>}</a>; }
  if (d.kind === 'band') return <span className={`dby band-tag b-${d.band}`}>{t(bandName[d.band])}{d.part && <span className="muted">{t(d.part)}</span>}</span>;
  if (d.kind === 'avnm') return <span className="dby layer"><LayerDiagonal16Regular />AVNM<b className="mono">{d.name}</b></span>;
  return <span className="dby layer"><LayerDiagonal16Regular />{t('NIC-level NSG')}<b className="mono">{d.nsg}</b><span className="muted">{d.rule}{ifaces ? `, ${ifaces}` : ''}</span></span>;
}
export function FlowRows({ rows, z, onRule, onNewRule, made, mult = 1, compactRows }: { rows: Flow[]; z: Zone; onRule: (id: string) => void; onNewRule: (f: Flow) => void; made: Set<string>; mult?: number; compactRows?: boolean }) {
  const { t } = useT(); const max = Math.max(1, ...rows.map(f => f.flows));
  const fixable = (f: Flow) => f.by.kind === 'band' && f.by.band !== 'pe' && f.by.band !== 'intra';
  return (
    <div className={`ftable ${compactRows ? 'compact' : ''}`} role="table">
      <div className="fr fh" role="row"><span>{t('Source')}</span><span /><span>{t('Destination')}</span><span>{t('Service')}</span>{!compactRows && <span>{t('Result')}</span>}<span>{t('Flows')}</span>{!compactRows && <><span>{t('Last seen')}</span><span>{t('Decided by')}</span></>}<span /></div>
      {rows.map(f => (
        <div key={f.id} className={`fr ${f.result}`} role="row">
          <PeerCell p={f.src} self={f.src.ref === `zone:${z.id}`} /><ArrowRight12Filled className="flow" /><PeerCell p={f.dst} self={f.dst.ref === `zone:${z.id}`} />
          <span className="mono">{f.svc}</span>
          {!compactRows && <span className={`act ${f.result}`}>{f.result === 'allow' ? <Checkmark12Filled /> : <Dismiss12Filled />}{t(f.result === 'allow' ? 'Allowed' : 'Denied')}</span>}
          <span className="hitc"><span>{compact(Math.round(f.flows * mult))}</span><i><b style={{ width: `${(Math.log10(f.flows + 1) / Math.log10(max + 1)) * 100}%` }} /></i></span>
          {!compactRows && <><span className="muted">{age(f.lastMin)} {t('ago')}</span><DecidedBy d={f.by} ifaces={f.ifaces} onRule={onRule} /></>}
          <span className="fact">{made.has(f.id) ? <span className="ok"><Checkmark12Filled />{t('Rule drafted')}</span>
            : fixable(f) ? <Button size="small" icon={<Add16Regular />} onClick={() => onNewRule(f)}>{t('New Rule')}</Button>
            : f.by.kind === 'avnm' || f.by.kind === 'nic' ? <span className="muted" title={t('Security layers are outside the tool. A Rule cannot change this.')}>{t('outside the tool')}</span> : null}</span>
        </div>))}
    </div>
  );
}

export function FlowView({ z, dir, here, onRule, onNewRule }: { z: Zone; dir: 'in' | 'out'; here: Rule[]; onRule: (id: string) => void; onNewRule: (f: Flow) => void }) {
  const { t } = useT(); const fs = flowState(z);
  const [chip, setChip] = useState('all'); const [q, setQ] = useState(''); const [win, setWin] = useState<Win>('24h'); const [made, setMade] = useState<Set<string>>(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => flowsOf(z, dir, here), [z.id, dir]);
  if (fs.kind === 'noaccess') return (
    <div className="sheet fempty"><div className="empty wide"><b>{t('No access to flow data')}</b>
      <p>{t('The nsgfw Reader cannot query the flow-data workspace of Non-production. Hits there show “no access” instead of 0, because an empty answer without the permission looks the same as no traffic.')}</p>
      <p className="muted">{t('Missing on the workspace')}:</p><ul className="mono">{fs.missing.map(m => <li key={m}>{m}</li>)}</ul>
      <Button size="small" icon={<ArrowSync16Regular />}>{t('Check permissions again')}</Button></div></div>);
  if (fs.kind === 'nolog') return (
    <div className="sheet fempty"><div className="empty wide"><b>{t('No flow data')}</b>
      <p>{t('No VNet flow log with Traffic Analytics covers')} <span className="mono">{fs.vnet}</span>. {t('Without it the Flow view stays empty and the hits column shows “—”.')}</p>
      <p><a className="link" href="https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview" target="_blank" rel="noreferrer"><BookOpen16Regular /> {t('How to enable VNet flow logs and Traffic Analytics')} <Open12Regular /></a></p>
      <p className="muted">{t('NSG flow logs are retired; nsgfw reads VNet flow logs only. New subnets can show as “Unknown” for up to 6 hours.')}</p></div></div>);
  const ql = q.trim().toLowerCase(); const f = FCHIPS.find(c => c[0] === chip)![2];
  const rows = all.filter(x => f(x) && (!ql || `${x.src.label} ${x.src.ip} ${x.dst.label} ${x.dst.ip} ${x.svc}`.toLowerCase().includes(ql)));
  const chips = FCHIPS.filter(c => dir === 'out' || c[0] !== 'egress').map(c => ({ k: c[0], label: c[1], n: all.filter(c[2]).length }));
  return (
    <>
      <div className="chipbar">
        {chips.map(c => <button key={c.k} className={`chip ${chip === c.k ? 'on' : ''} ${c.n ? '' : 'zero'} ${c.k === 'deny' || c.k === 'denyall' ? 'c-deny' : c.k === 'inherited' || c.k === 'egress' ? 'c-expiring' : c.k === 'layer' ? 'c-findings' : ''}`} disabled={!c.n && chip !== c.k} onClick={() => setChip(c.k)}>{t(c.label)}<i>{c.n}</i></button>)}
        <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Address, Zone or port')} value={q} onChange={(_, d) => setQ(d.value)} />
      </div>
      <div className="fstat">
        <span><Clock16Regular />{t('Newest flow')} <b>{age(fs.ageMin)}</b> {t('old')}. {t('Traffic Analytics processes every 60 minutes, and ingestion can take another hour.')}</span>
        <span className="sp" />
        <div className="seg2" role="group">{(Object.keys(WIN) as Win[]).map(k => <button key={k} className={win === k ? 'on' : ''} onClick={() => setWin(k)}>{t(WIN[k][1])}</button>)}</div>
      </div>
      <div className="fwarn"><Warning16Filled /><span>{t('Incomplete')}: {t('ICMP is never logged.')}{fs.deniedFiltered ? ` ${t('The flow log of this VNet filters out denied flows, so denied flows are missing.')}` : ''}</span></div>
      <div className="sheet fsheet">{rows.length ? <FlowRows rows={rows} z={z} onRule={onRule} mult={WIN[win][0]} made={made} onNewRule={x => { setMade(m => new Set(m).add(x.id)); onNewRule(x); }} />
        : <div className="empty"><b>{t('Nothing matches')}</b><p>{t('Try another chip or address.')}</p></div>}</div>
    </>
  );
}

// ---------- Settings
const ipv4 = (p: string) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(p.trim()); if (!m) return null; const n = m.slice(1, 5).map(Number); const bits = Number(m[5]); if (n.some(x => x > 255) || bits > 32) return null;
  const base = ((n[0] << 24) >>> 0) + (n[1] << 16) + (n[2] << 8) + n[3]; const size = 2 ** (32 - bits); const start = Math.floor(base / size) * size; return [start, start + size - 1] as const; };
const overlaps = (a: string, b: string) => { const x = ipv4(a), y = ipv4(b); return !!x && !!y && x[0] <= y[1] && y[0] <= x[1]; };
const isV6 = (p: string) => /^[0-9a-f:]+\/\d{1,3}$/i.test(p.trim()) && p.includes(':');

function Card({ title, sub, children, pending }: { title: string; sub?: string; children: React.ReactNode; pending?: boolean }) {
  const { t } = useT();
  return <section className={`zcard ${pending ? 'pending' : ''}`}><h3>{t(title)}{pending && <span className="tag amber">{t('in your Change set')}</span>}</h3>{sub && <p className="muted">{t(sub)}</p>}{children}</section>;
}

export function ZoneSettings({ z, here, onNewRule, onRule, onAddRule }: { z: Zone; here: Rule[]; onNewRule: (f: Flow) => void; onRule: (id: string) => void; onAddRule: (init: Partial<Rule>) => void }) {
  const s = useStore(); const { t } = useT(); const env = envs.find(e => e.id === z.env)!;
  const [made, setMade] = useState<Set<string>>(new Set()); const newRule = (f: Flow) => { setMade(m => new Set(m).add(f.id)); onNewRule(f); };
  const o = zOrig.get(z.id) ?? { egress: z.egress, extra: z.extra, inherited: z.inherited };
  const fieldPending = (f: string) => s.edits.some(e => e.ruleId === `zone:${z.id}` && e.field?.startsWith(f));
  const label = (e: Egress) => (e === 'strict' ? 'strict' : 'destination decides');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const egressFlows = useMemo(() => egressImpact(z, here), [z.id]);
  const asSource = useMemo(() => s.rules.filter(r => r.enabled && r.action === 'allow' && r.src.some(id => (id === 'any' ? false : id === `zone:${z.id}` || objById.get(id)?.cov.includes(z.id)))).length, [s.rules, z.id]);
  const setEgress = (e: Egress) => {
    if (e === z.egress) return; const orig = remember(z); z.egress = e;
    s.note({ kind: 'zone', ruleId: `zone:${z.id}`, field: 'Egress posture', before: label(orig.egress), after: label(e), covers: [z.id],
      write: e === 'strict' ? { name: 'nsgfw-egress-internal-v4/v6 (4094, 4095) removed', dir: 'out', priority: 4094 } : { name: 'nsgfw-egress-internal-v4/v6 (4094, 4095) added', dir: 'out', priority: 4094 } });
  };
  const parts = inhParts(z);
  const setPart = (p: InhPart, on: boolean) => {
    remember(z); const next = new Set(parts); if (on) next.add(p); else next.delete(p); inh.set(z.id, next); z.inherited = next.size > 0;
    s.note({ kind: 'zone', ruleId: `zone:${z.id}`, field: `Inherited defaults, ${p}`, before: 'kept', after: on ? 'kept' : 'removed', covers: [z.id], write: { name: `nsgfw-inherited-${p.replace(/ /g, '-').toLowerCase()}`, dir: p.startsWith('inbound') ? 'in' : 'out', priority: 4090 } });
  };
  const [px, setPx] = useState(''); const extra = z.extra ?? [];
  const pxCheck = (() => { const p = px.trim(); if (!p) return null;
    if (!ipv4(p) && !isV6(p)) return { level: 'red', text: 'Not an IPv4 or IPv6 prefix in CIDR notation.' };
    if (extra.includes(p)) return { level: 'red', text: 'Already an Extra prefix of this Zone.' };
    if (overlaps(p, z.prefix)) return { level: 'red', text: 'Already part of the subnet.' };
    const sub = zones.find(x => x.id !== z.id && overlaps(p, x.prefix)); const shared = zones.filter(x => x.id !== z.id && x.extra?.includes(p));
    if (sub) return { level: 'amber', text: `Overlaps the subnet of Zone ${sub.name}, for example a load balancer frontend there. Address objects that overlap it then cover both Zones, and the Intra-zone default of this Zone counts these addresses as its own.` };
    if (shared.length) return { level: 'info', text: `Also an Extra prefix of ${shared.length} other ${shared.length === 1 ? 'Zone' : 'Zones'}. Allowed, but a Rule between these Zones also allows each Zone's own copy of the range.` };
    return { level: 'ok', text: 'Objects that overlap this prefix will cover this Zone. The Preview lists the Rules that then land here.' }; })();
  const setExtra = (next: string[]) => { const orig = remember(z); z.extra = next.length ? next : undefined;
    s.note({ kind: 'zone', ruleId: `zone:${z.id}`, field: 'Extra prefixes', before: (orig.extra ?? []).join(', ') || 'none', after: next.join(', ') || 'none', covers: [z.id], write: { name: 'Coverage and Intra-zone default', dir: 'in', priority: 0 } }); };
  const dns = dnsOf(z.vnet); const dnsRule = dnsRuleFor(z, s.rules);
  return (
    <div className="zsettings">
      <Card title="Egress posture" sub="Who decides outbound traffic to the Internal address space." pending={fieldPending('Egress posture')}>
        <div className="egopt">
          {(['dest', 'strict'] as Egress[]).map(e => (
            <button key={e} className={`eg ${z.egress === e ? 'on' : ''}`} onClick={() => setEgress(e)}>
              <b>{t(e === 'dest' ? 'Destination decides' : 'Strict')}{o.egress === e && <span className="muted"> · {t('committed')}</span>}</b>
              <span>{t(e === 'dest' ? 'Outbound to internal addresses is open. The inbound Rules of the destination Zone decide. The default.' : 'Only what a Rule allows leaves this Zone, so both Zones decide.')}</span>
            </button>))}
        </div>
        {z.egress === 'strict' && o.egress === 'dest' && <div className="impact">
          <p><Warning16Filled className="b-amber" /> {egressFlows.length ? <><b>{egressFlows.length} {t('outbound flows')}</b> {t('of the last 30 days left this Zone only through the open posture. Strict denies them unless a Rule allows them.')}</> : t('No outbound flow of the last 30 days relied on the open posture.')}
            {' '}{asSource.toLocaleString()} {t('allow Rules with this Zone as source then also land on its Managed NSG.')}</p>
          {egressFlows.length > 0 && <FlowRows rows={egressFlows} z={z} onRule={onRule} onNewRule={newRule} made={made} mult={27} compactRows />}
        </div>}
        {z.egress === 'dest' && o.egress === 'strict' && <div className="impact"><p><Info16Regular /> {t('This opens outbound traffic to the Internal address space. The destination Zones decide. It needs Approval like any opening change.')}</p></div>}
        {z.egress === o.egress && z.egress === 'dest' && <p className="muted">{egressFlows.length} {t('outbound flows of the last 30 days rely on the open posture.')} <a className="link" onClick={() => setEgress('strict')}>{t('See what strict would deny')}</a></p>}
      </Card>

      {(o.inherited || parts.size > 0) && <Card title="Inherited defaults" sub="What the Azure default rules allowed before onboarding, each part on its own. Remove them when the Rules carry the traffic." pending={fieldPending('Inherited defaults')}>
        {INH_PARTS.map(p => { const flows = inheritedImpact(z, here, p); const on = parts.has(p); return (
          <div key={p} className="inh">
            <div className="inh-h"><Switch checked={on} onChange={(_, d) => setPart(p, d.checked)} label={t(p)} /><span className="sp" /><span className="muted">{flows.length ? `${flows.length} ${t(flows.length === 1 ? 'flow' : 'flows')} ${t('in 30 days rely on it')}` : t('no flow relies on it')}</span></div>
            {!on && flows.length > 0 && <div className="impact"><p><Warning16Filled className="b-amber" /> {t('Without this part, these flows hit the Deny-all rules. Give each one a Rule, or accept that it stops.')}</p>
              <FlowRows rows={flows} z={z} onRule={onRule} onNewRule={newRule} made={made} mult={27} compactRows /></div>}
          </div>); })}
      </Card>}

      <Card title="Extra prefixes" sub="Prefixes the Managed NSG sees although they are not in the subnet, such as an AKS pod range. They count as part of the Zone." pending={fieldPending('Extra prefixes')}>
        <div className="pxlist">{extra.length ? extra.map(p => <span key={p} className="tok t-cidr"><Glyph kind="cidr" /><span className="tl mono">{p}</span><button className="rmb on" title={t('Remove')} onClick={() => setExtra(extra.filter(x => x !== p))}><Dismiss12Regular /></button></span>) : <span className="muted">{t('None.')}</span>}</div>
        <div className="pxadd"><Input className="mono" placeholder="100.64.0.0/16" value={px} onChange={(_, d) => setPx(d.value)} onKeyDown={e => { if (e.key === 'Enter' && pxCheck && pxCheck.level !== 'red') { setExtra([...extra, px.trim()]); setPx(''); } }} />
          <Button icon={<Add16Regular />} disabled={!pxCheck || pxCheck.level === 'red'} onClick={() => { setExtra([...extra, px.trim()]); setPx(''); }}>{t('Add')}</Button></div>
        {pxCheck && <p className={`pxmsg ${pxCheck.level}`}>{t(pxCheck.text)}</p>}
      </Card>

      <Card title="DNS" sub="NSGs filter traffic to custom DNS servers, so the Zone needs a Rule for them. Azure-provided DNS at 168.63.129.16 is not filtered.">
        {!dns ? <p>{t('This VNet uses Azure-provided DNS. No Rule needed.')}</p> : <>
          <p>{t('Custom DNS servers')} <span className="mono">{dns.servers.join(', ')}</span>, {t(dns.where)}.</p>
          {dnsRule ? <p className="ok"><Checkmark12Filled /> <a className="link" onClick={() => onRule(dnsRule.id)}>{t('Rule')} {s.numbers.get(dnsRule.id)} “{dnsRule.name}”</a> {t('allows DNS from this Zone.')}</p>
            : <div className="impact"><p><Warning16Filled className="b-amber" /> {t('No Rule allows DNS from this Zone to these servers.')} {t(dns.zone ? 'It would land inbound on the DNS servers’ Zone.' : 'Today it writes nothing: the posture lets it out and the servers are in no Zone. It keeps name resolution working when this Zone turns strict.')}</p>
              <Button size="small" icon={<Add16Regular />} onClick={() => { const init = dnsRuleInit(z); if (init) onAddRule(init); }}>{t('Add the DNS Rule')}</Button></div>}
        </>}
      </Card>

      <Card title="Managed NSG">
        <dl className="zfacts">
          <dt>{t('Name')}</dt><dd className="mono">{z.nsg}</dd><dt>{t('Resource group')}</dt><dd className="mono">rg-network-{z.vnet.slice(5)}</dd>
          <dt>{t('Subscription')}</dt><dd className="mono">{z.sub}</dd><dt>{t('Region')}</dt><dd>{z.region}</dd>
          <dt>{t('Environment')}</dt><dd>{env.name}, {env.mode}, {t('Approval')} {t(env.level)}</dd>
          <dt>{t('NSG rules')}</dt><dd><Bar v={z.rules} max={LIMITS.rules} /></dd>
        </dl>
      </Card>
    </div>
  );
}
