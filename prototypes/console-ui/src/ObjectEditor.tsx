// PROTOTYPE, throwaway (issue 35). The object editor: one editor in two places, the detail of the object library and the "Object" tab of the side panel.
// ASG objects: members picked by VM, network interface or private endpoint, one Managed ASG per VNet, Coverage live.
// External ASG objects: the Unmanaged ASG they read. IP and CIDR objects: the VNet binding and the Coverage that results.
// Every change is an edit in the current Change set, like a Rule edit.
import { useMemo, useState } from 'react';
import { Button, Input, Switch } from '@fluentui/react-components';
import { Search16Regular, Dismiss12Regular, Warning16Filled, Info16Regular, ArrowRight16Regular, Checkmark12Filled, Add12Regular, LockClosed12Regular } from '@fluentui/react-icons';
import { objById, zoneById, Obj, ref, versions } from './data';
import { useStore, onDiscard } from './store';
import { kindLabel } from './ObjectPicker';
import { Glyph } from './Glyph';
import { useT } from './i18n';
import { membersOf, nicById, searchInventory, managedAsgName, unmanagedAsgs, extAsgOf, asgWriterMissing, ASG_LIMITS, unboundCoverage, peersOf, inventoryOf, Vm, Nic, UnmanagedAsg } from './zonedata';
import './zone.css';

type OState = { members?: string[]; auto?: boolean; binding?: string[]; ext?: string };
const oState = new Map<string, OState>();
const oOrig = new Map<string, { cov: string[]; vnetBinding?: string; value: string }>();
onDiscard(() => { for (const [id, o] of oOrig) Object.assign(objById.get(id)!, o); oOrig.clear(); oState.clear(); });
const remember = (o: Obj) => { if (!oOrig.has(o.id)) oOrig.set(o.id, { cov: [...o.cov], vnetBinding: o.vnetBinding, value: o.value }); return oOrig.get(o.id)!; };
const uniq = <T,>(a: T[]) => [...new Set(a)];

export function ObjectEditor({ id, onZone, onShowRules }: { id: string; onZone: (zid: string) => void; onShowRules?: (name: string) => void }) {
  const s = useStore(); const { t } = useT();
  const o = id.startsWith('zone:') ? null : objById.get(id);
  const usage = useMemo(() => s.rules.filter(r => r.src.includes(id) || r.dst.includes(id) || r.svc.includes(id)).length, [s.rules, id]);
  if (!o) { const x = ref(id); return <div className="oed"><div className={`lib-k t-${x.kind}`}><Glyph kind={x.kind} />{kindLabel[x.kind]}</div><h2>{x.name}</h2><div className="mono lib-v">{x.value}</div></div>; }
  const st = oState.get(id) ?? {}; const put = (p: OState) => oState.set(id, { ...st, ...p });
  const pending = s.edits.some(e => e.ruleId === `obj:${id}`);
  return (
    <div className="oed">
      <div className={`lib-k t-${o.kind}`}><Glyph kind={o.kind} />{kindLabel[o.kind]}{pending && <span className="tag amber">{t('in your Change set')}</span>}</div>
      <h2>{o.name}</h2><div className="mono lib-v">{o.value}</div>
      <div className="usebox"><b>{usage.toLocaleString()}</b><span>{t('Rules use this object')}</span>
        {onShowRules && <Button size="small" appearance="primary" icon={<ArrowRight16Regular />} iconPosition="after" disabled={!usage} onClick={() => onShowRules(o.name)}>{t('Show these Rules')}</Button>}</div>
      {o.kind === 'asg' && <AsgMembers o={o} st={st} put={put} />}
      {o.kind === 'extasg' && <ExtAsg o={o} st={st} put={put} />}
      {(o.kind === 'ip' || o.kind === 'cidr') && <Binding o={o} st={st} put={put} onZone={onZone} />}
      {(o.kind === 'asg' || o.kind === 'extasg') && <AutoAdopt o={o} st={st} put={put} />}
      {o.members && <><h3>{t('Members')}</h3><div className="picker-sel">{o.members.map(m => <span key={m} className={`tok t-${ref(m).kind}`}><Glyph kind={ref(m).kind} /><span className="tl">{ref(m).name}</span></span>)}</div></>}
      {o.kind !== 'ip' && o.kind !== 'cidr' && <Coverage cov={o.cov} onZone={onZone} />}
    </div>
  );
}

function Coverage({ cov, onZone, before, far }: { cov: string[]; onZone: (zid: string) => void; before?: string[]; far?: Set<string> }) {
  const { t } = useT(); const added = before ? cov.filter(z => !before.includes(z)) : []; const gone = before ? before.filter(z => !cov.includes(z)) : [];
  return <>
    <h3>{t('Zones (Coverage)')}<span className="muted"> {cov.length.toLocaleString()}</span></h3>
    {(added.length > 0 || gone.length > 0) && <p className="covdiff">{added.length > 0 && <span className="add">+{added.length} {t(added.length === 1 ? 'Zone' : 'Zones')}</span>}{gone.length > 0 && <span className="del">−{gone.length} {t(gone.length === 1 ? 'Zone' : 'Zones')}</span>}<span className="muted">{t('than the committed Version')}</span></p>}
    {cov.length ? <>{[...cov.slice(0, 8), ...gone.slice(0, 3)].map(zid => { const z = zoneById.get(zid)!; const g = gone.includes(zid); return (
      <div key={zid} className={`orow t-zone ${g ? 'gone' : added.includes(zid) ? 'new' : ''}`}><Glyph kind="zone" /><b>{z.name}</b><span className="mono">{z.vnet}{far?.has(zid) ? ` · ${t('not connected')}` : ''}</span>{g ? <span className="cov">{t('leaves')}</span> : <a className="link" onClick={() => onZone(zid)}>{t('open Zone')}</a>}</div>); })}
      {cov.length > 8 && <p className="muted">{cov.length - 8} {t('more')}</p>}</>
      : <p className="muted" style={{ lineHeight: 1.5 }}>{t('Covers no Zone. A Rule with this object lands only on the other side.')}</p>}
  </>;
}

// ---------- ASG object: members by VM, network interface or private endpoint
function AsgMembers({ o, st, put }: { o: Obj; st: OState; put: (p: OState) => void }) {
  const s = useStore(); const { t } = useT(); const [q, setQ] = useState('');
  const base = membersOf(o.id); const members = st.members ?? base;
  const nics = members.map(m => nicById(m)).filter(Boolean) as Nic[];
  const byVnet = useMemo(() => { const m = new Map<string, Nic[]>(); nics.forEach(n => m.set(n.vnet, [...(m.get(n.vnet) ?? []), n])); return [...m]; }, [members.join()]);
  const results = useMemo(() => searchInventory(q), [q]);
  const setMembers = (next: string[]) => {
    const orig = remember(o); const cov = uniq(next.map(m => nicById(m)?.zone).filter(Boolean) as string[]);
    put({ members: next }); o.cov = cov; o.value = `${next.length} members`;
    const plus = next.filter(m => !base.includes(m)), minus = base.filter(m => !next.includes(m));
    s.note({ kind: 'object', ruleId: `obj:${o.id}`, field: 'ASG members', before: `${base.length} members`, after: plus.length || minus.length ? [...plus.map(m => `+ ${m}`), ...minus.map(m => `− ${m}`)].join(', ') : `${base.length} members`,
      covers: uniq([...orig.cov, ...cov]), write: { name: `Managed ASG membership (${uniq(next.map(m => nicById(m)?.vnet ?? '')).length} VNets) and member IPs elsewhere`, dir: 'in', priority: 0 } });
  };
  const toggle = (id: string) => setMembers(members.includes(id) ? members.filter(m => m !== id) : [...members, id]);
  const noWriter = uniq(nics.map(n => zoneById.get(n.zone ?? '')?.env).filter((e): e is string => !!e && asgWriterMissing.has(e)));
  return <>
    <h3>{t('Members by Managed ASG')}<span className="muted"> {members.length}</span></h3>
    <p className="muted small">{t('Azure keeps all members of one ASG in one VNet, so the tool writes one Managed ASG per VNet. NSGs in other VNets get the members’ IPs instead.')}</p>
    {byVnet.map(([vnet, list]) => (
      <div key={vnet} className="mgroup">
        <div className="mgroup-h"><Glyph kind="vnet" /><div className="mcell"><b>{vnet}</b><span className="mono"><ArrowRight16Regular /> {managedAsgName(o.name, vnet)}</span></div><span className="muted">{list.length}</span></div>
        {list.map(n => <div key={n.id} className={`mrow ${base.includes(n.id) ? '' : 'new'}`}><Glyph kind="ip" /><div className="mcell"><b className="mono">{n.name}</b><span className="muted"><span className="mono">{n.ip}</span> · {zoneById.get(n.zone ?? '')?.name ?? t('in no Zone')}</span></div>
          <button className="rmb on" title={t('Remove')} onClick={() => toggle(n.id)}><Dismiss12Regular /></button></div>)}
      </div>))}
    {base.filter(m => !members.includes(m)).map(m => <div key={m} className="mrow gone"><Glyph kind="ip" /><div className="mcell"><b className="mono">{m}</b><span className="muted">{t('leaves')}</span></div><button className="link" onClick={() => toggle(m)}>{t('Undo')}</button></div>)}
    {noWriter.length > 0 && <p className="owarn red"><Warning16Filled /><span>{t('The optional role nsgfw ASG Writer is missing in')} {noWriter.map(e => (e === 'nonprod' ? 'Non-production' : e)).join(', ')}. {t('The tool cannot write these members there, so Submit is blocked until the operator grants it.')}</span></p>}

    <div className="madd">
      <Input className="search" contentBefore={<Search16Regular />} placeholder={t('Add members: VM, network interface, private endpoint, IP or Zone')} value={q} onChange={(_, d) => setQ(d.value)} />
      {q.trim().length >= 2 && <div className="mres">
        {results.map(vm => <VmResult key={vm.id} vm={vm} members={members} toggle={toggle} addAll={ids => setMembers(uniq([...members, ...ids]))} />)}
        {!results.length && <p className="muted">{t('Nothing found. Try a VM name like vm-app0311-web, a Zone like app0042-pe or an IP prefix like 10.10.128.')}</p>}
      </div>}
      {q.trim().length < 2 && <p className="muted small">{t('Try “app0311-web”, “pe-sql” or “10.10.128.”.')}</p>}
    </div>
    <p className="muted small"><Info16Regular /> {t('Limits that block the Change set')}: {ASG_LIMITS.perIpConfig} {t('ASGs per IP configuration of a network interface')}, {ASG_LIMITS.perNsg} {t('ASGs across the rules of one NSG')}, {ASG_LIMITS.ipConfigsPerAsg.toLocaleString()} {t('IP configurations per ASG')}. {t('Highest now')}: <span className="mono">{nics[0]?.name ?? '—'}</span>, 4 {t('of')} {ASG_LIMITS.perIpConfig}.</p>
  </>;
}
function VmResult({ vm, members, toggle, addAll }: { vm: Vm; members: string[]; toggle: (id: string) => void; addAll: (ids: string[]) => void }) {
  const { t } = useT(); const z = zoneById.get(vm.zone ?? ''); const all = vm.nics.every(n => members.includes(n.id));
  const kind = vm.kind === 'pe' ? 'Private endpoint' : vm.kind === 'vmss' ? 'Scale set' : 'VM';
  return (
    <div className={`vmres ${vm.kind === 'vmss' ? 'off' : ''}`}>
      <div className="vmres-h"><span className="kind">{t(kind)}</span><b className="mono">{vm.name}</b><span className="muted">{z?.name}</span><span className="sp" />
        {vm.kind === 'vmss' ? <span className="muted small"><LockClosed12Regular /> {t('Scale-set interfaces: use an External ASG object')}</span>
          : vm.nics.length > 1 ? <button className="link" onClick={() => addAll(vm.nics.map(n => n.id))} disabled={all}>{all ? t('all added') : `${t('Add')} ${vm.nics.length} NICs`}</button> : null}</div>
      {vm.nics.map(n => <label key={n.id} className="vmnic"><input type="checkbox" disabled={vm.kind === 'vmss'} checked={members.includes(n.id)} onChange={() => toggle(n.id)} /><span className="mono">{n.name}</span><span className="mono muted">{n.ip}</span></label>)}
    </div>);
}

// ---------- External ASG object: the Unmanaged ASG it reads
function extOf(o: Obj, st: OState): UnmanagedAsg {
  const id = st.ext ?? extAsgOf.get(o.id); const hit = unmanagedAsgs.find(u => u.id === id); if (hit) return hit;
  const z = zoneById.get(o.cov[0] ?? '') ?? zoneById.get('z0042-aks')!;
  return { id: `uasg-${o.id}`, name: o.name.replace(/^ext-/, ''), rg: `MC_rg-${z.name}_${z.region}`, vnet: z.vnet, zone: z.id, owner: 'AKS node pool, written through the AKS API', members: inventoryOf(z).flatMap(v => v.nics) };
}
function ExtAsg({ o, st, put }: { o: Obj; st: OState; put: (p: OState) => void }) {
  const s = useStore(); const { t } = useT(); const [pick, setPick] = useState(false);
  const u = extOf(o, st); const base = extOf(o, {});
  const change = (nu: UnmanagedAsg) => { const orig = remember(o); put({ ext: nu.id }); o.cov = [nu.zone]; o.value = `${nu.members.length} members (read)`; setPick(false);
    s.note({ kind: 'object', ruleId: `obj:${o.id}`, field: 'Unmanaged ASG', before: base.name, after: nu.name, covers: uniq([...orig.cov, nu.zone]), write: { name: `ASG reference or member IPs of ${nu.name}`, dir: 'in', priority: 0 } }); };
  return <>
    <h3>{t('Unmanaged ASG')}</h3>
    <div className="extbox"><b className="mono">{u.name}</b><span className="mono muted">{u.rg} · {u.vnet}</span><span>{t('Owner')}: {t(u.owner)}. {t('The tool reads its members and never changes them or the ASG.')}</span>
      <button className="link" onClick={() => setPick(!pick)}>{t(pick ? 'Cancel' : 'Use another Unmanaged ASG…')}</button></div>
    {pick && <div className="mres">{unmanagedAsgs.filter(x => x.id !== u.id).map(x => <div key={x.id} className="vmres clickable" onClick={() => change(x)}><div className="vmres-h"><b className="mono">{x.name}</b><span className="muted">{x.vnet}</span><span className="sp" /><span className="muted">{x.members.length} {t('members')}</span></div><span className="muted small">{t(x.owner)}</span></div>)}</div>}
    <h3>{t('Members, read from Azure')}<span className="muted"> {u.members.length}</span></h3>
    {u.members.slice(0, 6).map(n => <div key={n.id} className="mrow"><Glyph kind="ip" /><div className="mcell"><b className="mono">{n.name}</b><span className="muted"><span className="mono">{n.ip}</span> · {zoneById.get(n.zone ?? '')?.name}</span></div><span /></div>)}
    {u.members.length > 6 && <p className="muted">{u.members.length - 6} {t('more')}</p>}
  </>;
}

// ---------- "Adopt member changes automatically" on ASG objects and External ASG objects
function AutoAdopt({ o, st, put }: { o: Obj; st: OState; put: (p: OState) => void }) {
  const s = useStore(); const { t } = useT(); const on = st.auto ?? false;
  const set = (v: boolean) => { put({ auto: v }); s.note({ kind: 'object', ruleId: `obj:${o.id}`, field: 'Adopt member changes automatically', before: 'off', after: v ? 'on' : 'off', covers: o.cov, write: { name: 'no NSG change now; future member changes adopt without Approval', dir: 'in', priority: 0 } }); };
  const ext = o.kind === 'extasg';
  return <section className={`autobox ${on ? 'on' : ''}`}>
    <Switch checked={on} onChange={(_, d) => set(d.checked)} label={t('Adopt member changes automatically')} />
    <p className="muted small">{t(ext ? 'New members of the Unmanaged ASG join the Rules of this object without a Change set. The Approval of this setting covers future members, like a dynamic address group on a firewall.'
      : 'Changes that someone makes to the members in Azure join this object without a Change set, instead of showing as Drift. The Approval of this setting covers them.')}</p>
    <p className="muted small">{t('Always on their own, whatever this says: a deleted member leaves, and a changed member IP replaces the old one.')}</p>
    {ext && !on && <p className="owarn amber"><Warning16Filled /><span>{t('2 new members since Version')} {versions.latest}: <span className="mono">aks-nodepool1-0042-vmss_3, _4</span>. {t('They wait in the Change set “Adopt ext-asg-aks-0042-nodes”, which the tool prepared for Approval.')}</span></p>}
    {on && <p className="ok small"><Checkmark12Filled /> {t('Turning this on needs the Approval of the Zones the object covers.')}</p>}
  </section>;
}

// ---------- VNet binding of an IP or CIDR object, and the Coverage that results
function Binding({ o, st, put, onZone }: { o: Obj; st: OState; put: (p: OState) => void; onZone: (zid: string) => void }) {
  const s = useStore(); const { t } = useT();
  const unbound = useMemo(() => uniq(unboundCoverage(o.id)), [o.id]);
  const baseBinding = oOrig.has(o.id) ? oOrig.get(o.id)!.vnetBinding : o.vnetBinding; const binding = st.binding ?? (baseBinding ? [baseBinding] : []);
  const home = zoneById.get(oOrig.get(o.id)?.cov[0] ?? o.cov[0] ?? '')?.vnet; const connected = new Set(home ? [home, ...peersOf(home)] : []);
  const effective = (b: string[]) => (b.length ? unbound.filter(z => b.includes(zoneById.get(z)!.vnet)) : unbound);
  const cov = effective(binding); const before = effective(baseBinding ? [baseBinding] : []);
  const far = new Set(unbound.filter(z => !connected.has(zoneById.get(z)!.vnet)));
  const choices = uniq([...(home ? [home, ...peersOf(home)] : []), ...unbound.map(z => zoneById.get(z)!.vnet)]);
  const setBinding = (b: string[]) => { const orig = remember(o); put({ binding: b }); o.vnetBinding = b[0]; o.cov = effective(b);
    s.note({ kind: 'object', ruleId: `obj:${o.id}`, field: 'VNet binding', before: baseBinding ?? 'none', after: b.join(', ') || 'none', covers: uniq([...orig.cov, ...o.cov]), write: { name: 'Rules with this object, on the Zones it covers', dir: 'in', priority: 0 } }); };
  if (!unbound.length) return <><h3>{t('VNet binding')}</h3><p className="muted small">{t('This address overlaps no Zone, so a binding changes nothing.')}</p><Coverage cov={[]} onZone={onZone} /></>;
  return <>
    <h3>{t('VNet binding')}</h3>
    <p className="muted small">{t('Without a binding the object covers every Zone its prefix overlaps, also in VNets that are not connected, where the same address is another host.')}</p>
    <div className="bindl">{choices.map(v => { const on = binding.includes(v); const n = unbound.filter(z => zoneById.get(z)!.vnet === v).length; return (
      <button key={v} className={`bchip ${on ? 'on' : ''}`} onClick={() => setBinding(on ? binding.filter(x => x !== v) : [...binding, v])}>{on ? <Checkmark12Filled /> : <Add12Regular />}<span className="mono">{v}</span>
        <i>{v === home ? t('own VNet') : connected.has(v) ? t('peered') : t('not connected')}{n ? `, ${n} ${t(n === 1 ? 'Zone' : 'Zones')}` : ''}</i></button>); })}</div>
    {!binding.length && [...far].length > 0 && <p className="owarn amber"><Warning16Filled /><span>{t('Unbound, this object also covers')} {[...far].length} {t([...far].length === 1 ? 'Zone' : 'Zones')} {t('in')} {uniq([...far].map(z => zoneById.get(z)!.vnet)).join(', ')}, {t('which is not connected to')} {home}. {t('Bind it to the VNets you mean.')}</span></p>}
    <Coverage cov={cov} before={before} far={far} onZone={onZone} />
  </>;
}
