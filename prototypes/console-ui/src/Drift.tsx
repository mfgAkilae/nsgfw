// PROTOTYPE, throwaway. Issue 37: the Drift tab of the Deployments page. The Drift items on the left; one item on the right: the Deployed
// state against Azure, the effect on traffic, who changed it and how it was found, what it blocks, and Overwrite or Adopt as its kind allows.
import { ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Input, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Spinner } from '@fluentui/react-components';
import { Search16Regular, ArrowSync16Regular, Warning16Filled, Bot16Regular, CheckmarkCircle16Filled, Clock16Regular, LockClosed16Regular, Info16Regular } from '@fluentui/react-icons';
import type { Item37 } from './DeployView';
import { envs, zoneById, vnets } from './data';
import { roleRank } from './access';
import { useSession } from './session';
import { useOps, go37 } from './ops37';
import { CUR_NAME } from './flow';
import { Glyph } from './Glyph';
import { useT } from './i18n';
import { SEED, PORTAL, LOOP, DriftItem, DState, Sev } from './driftdata';
import './drift.css';

// What people did in this session: Overwrite and Adopt change the state of items. The tab, the counts and the inbox share it.
interface Over { state: DState; cs?: string; how?: 'overwritten' | 'adopted' }
type Item = DriftItem & { how?: Over['how'] };
let over = new Map<string, Over>(); let nextCs = 5134;
const subs = new Set<() => void>();
const setOver = (ids: string[], o: Over) => { over = new Map(over); ids.forEach(id => over.set(id, o)); subs.forEach(f => f()); };
const useOver = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => over);

const zname = (id: string) => zoneById.get(id)?.name ?? id;
const zonesOf = (d: DriftItem) => (d.zones.length ? d.zones : vnets.find(v => v.name === d.vnet)?.zones ?? []);
const isOpen = (d: DriftItem) => d.state !== 'resolved';
const sevRank: Record<Sev, number> = { high: 3, medium: 2, low: 1 };
const sevWord: Record<Sev, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const sevWhy: Record<Sev, string> = { high: 'High: this Drift opens traffic.', medium: 'Medium: this Drift closes traffic.', low: 'Low: no effect on traffic.' };

/** Every Drift item the person sees: the seed, the scenario switches, the session's actions, and the read filter of issue 38. */
export function useDriftItems(): Item[] {
  const ops = useOps(); const o = useOver(); const my = useSession().myZones;
  return useMemo(() => {
    const all: Item[] = [...(ops.portalDrift ? [PORTAL] : []), ...(ops.autoOverwriteLoop ? [LOOP] : []), ...SEED].map(d => { const x = o.get(d.id); return x ? { ...d, ...x } : d; });
    return my ? all.filter(d => zonesOf(d).some(z => my.has(z))) : all;
  }, [ops.portalDrift, ops.autoOverwriteLoop, o, my]);
}

type Chip = 'open' | 'high' | 'medium' | 'low' | 'noadopt' | 'adopt' | 'auto';
const chips: [Chip, string, string, (d: DriftItem) => boolean][] = [
  ['open', 'Open', '', isOpen], ['high', 'High', 'c-deny', d => isOpen(d) && d.sev === 'high'], ['medium', 'Medium', 'c-expiring', d => isOpen(d) && d.sev === 'medium'],
  ['low', 'Low', 'c-disabled', d => isOpen(d) && d.sev === 'low'], ['noadopt', 'Not adoptable automatically', '', d => isOpen(d) && !!d.noAdopt],
  ['adopt', 'Adopt open', '', d => d.state === 'adopt'], ['auto', 'Resolved by the tool', 'c-ok', d => !!d.auto]];

export function DriftTab({ env, sel }: { env: string | null; sel?: string | null }) {
  const { t } = useT(); const all = useDriftItems();
  const [chip, setChip] = useState<Chip>('open'); const [q, setQ] = useState(''); const [cur, setCur] = useState<string | null>(sel ?? null);
  // An item someone just overwrote or adopted stays in the list it was in, so the result shows where the click was.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (!sel) return; setCur(sel); setChip('open'); setQ(''); requestAnimationFrame(() => document.getElementById(`drift-${sel}`)?.scrollIntoView({ block: 'nearest' })); }, [sel]);
  const inEnv = useMemo(() => all.filter(d => !env || d.env === env), [all, env]);
  const fn = chips.find(c => c[0] === chip)![3]; const ql = q.trim().toLowerCase();
  const list = inEnv.filter(d => (fn(d) || (kept.has(d.id) && chip !== 'adopt' && chip !== 'auto' && fn({ ...d, state: 'open' })))
      && (!ql || `${d.res} ${d.vnet} ${d.zones.map(zname).join(' ')} ${d.actor.who} ${d.actor.changedBy} ${d.actor.via} ${d.what}`.toLowerCase().includes(ql)))
    .sort((a, b) => (chip === 'auto' ? 0 : sevRank[b.sev] - sevRank[a.sev]));
  const d = list.find(x => x.id === cur) ?? (cur && cur === sel ? all.find(x => x.id === cur) : undefined) ?? list[0] ?? null;
  const showOff = !env || env === 'nonprod';
  return (
    <div className="drift">
      <div className="dr-poll"><span><ArrowSync16Regular />{t('Polled from Resource Graph every 5 minutes, last at 10:40; full reconcile daily at 02:00.')}</span>
        {showOff && <span className="dr-off"><Warning16Filled />{t('Non-production: polling is off since 2026-11-09 06:00, because the nsgfw Reader lacks a read. The daily reconcile still finds Drift there.')}</span>}</div>
      <div className="chipbar">{chips.map(([k, label, cls, f]) => { const n = inEnv.filter(f).length;
          return <button key={k} className={`chip ${cls} ${chip === k ? 'on' : ''} ${n || chip === k ? '' : 'zero'}`} aria-pressed={chip === k} disabled={!n && chip !== k} onClick={() => setChip(k)}>{t(label)}<i>{n}</i></button>; })}
        <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Resource, Zone or actor')} value={q} onChange={(_, v) => setQ(v.value)} /></div>
      <div className="sheet lib">
        <div className="lib-l">
          <div className="drow dhead"><span>{t('Severity')}</span><span>{t('What changed')}</span><span>{t('Changed by')}</span><span>{t('Detected')}</span><span>{t('State')}</span></div>
          {list.map(x => <div key={x.id} id={`drift-${x.id}`} className={`drow ${d?.id === x.id ? 'on' : ''} ${x.state === 'resolved' && !x.auto ? 'done' : ''}`} onClick={() => setCur(x.id)}>
            <span className={`sev ${x.sev}`}>{t(sevWord[x.sev])}</span>
            <span className="d2"><b>{t(x.what)}</b><span><span className="mono">{x.res}</span> · {x.zones.length ? x.zones.map(zname).join(', ') : x.vnet} · {t(envs.find(e => e.id === x.env)!.name)}</span></span>
            <span className="d2"><span>{x.actor.who}</span><span>{t('via')} {t(x.actor.via)}</span></span>
            <span className="d2"><span>{t(x.found.ago)}{x.found.by === 'reconcile' && <> · {t('reconcile')}</>}</span><span>{t('confirmed by GET')}</span></span>
            <StateTag d={x} /></div>)}
          {!list.length && <div className="empty dr-empty"><b>{t(chip === 'auto' ? 'The tool resolved nothing here in the last 30 days.' : 'No Drift here.')}</b><p>{t(ql ? 'Nothing matches the search.' : 'Azure matches the Deployed state of every resource you see.')}</p></div>}
          {chip === 'auto' && <p className="muted dr-foot">{t('Automatic Overwrite and automatic Adopt of the last 30 days, read-only. Older ones are in the audit log.')} <a className="link" onClick={() => go37({ to: 'audit' })}>{t('In the audit log')}</a></p>}
        </div>
        {d ? <DriftDetail d={d} all={all} onActed={ids => setKept(k => new Set([...k, ...ids]))} />
          : <aside className="lib-d vdet dr-d"><div className="empty"><b>{t('No Drift selected')}</b><p>{t('Click an item to see the difference, who made it and what you can do.')}</p></div></aside>}
      </div>
    </div>
  );
}

function StateTag({ d }: { d: Item }) {
  const { t } = useT();
  if (d.auto) return <span className="dst ok">{t(d.kind === 'assoc' || d.kind === 'tag' ? 'Overwritten by the tool' : 'Adopted by the tool')}</span>;
  if (d.state === 'resolved') return <span className="dst ok">{t(d.how === 'adopted' ? 'Adopted' : 'Overwritten')}</span>;
  if (d.state === 'overwriting') return <span className="dst amber">{t('Overwriting')}…</span>;
  if (d.state === 'adopt') return <span className="dst amber" title={`${t('Adopt open in')} ${d.cs}`}>{t('Adopt open in')} {d.cs}</span>;
  return <span className="dst">{t('Open')}</span>;
}

// ARM: one write of the Deployed state covers every Drift on that resource. Terraform: the apply reverts every Drift in the root module.
const groupOf = (d: Item, all: Item[]) => all.filter(x => x.overwrite && x.env === d.env && (x.id === d.id || (isOpen(x) && x.state !== 'overwriting' && (d.root ? x.root === d.root : x.res === d.res))));
const reverse = (d: DriftItem) => d.fx.map(f => ({ k: f.dir === 'opens' ? 'Closes' : 'Reopens', text: f.text }));

function useEditRole(d: DriftItem) {
  const se = useSession(); const { t } = useT();
  const onVnet = d.scope === 'vnet' || !d.zones.length; const where = onVnet ? d.vnet : zname(d.zones[0]);
  const role = onVnet ? se.roleAtScope({ kind: 'vnet', id: d.vnet })?.role ?? null : se.zoneRole(zoneById.get(d.zones[0])!);
  const ok = !!role && roleRank[role] >= roleRank.editor;
  return { ok, onVnet, why: ok ? null : `${t('Needs the editor Role in')} ${where}. ${role ? `${t('You are')} ${t(role)} ${t('there')}.` : t('You have no Role there.')}` };
}
function useApprovalText(d: DriftItem, waiting = false) {
  const se = useSession(); const { t } = useT();
  if (!d.adopt) return '';
  if (d.adopt.fx === 'closes') return t('Only closes traffic: the tool commits it on its own.');
  if (d.adopt.fx === 'none') return t('Changes no traffic: the tool commits it on its own.');
  const z = zname(d.zones[0]); const level = se.levelOf({ kind: 'zone', id: d.zones[0] }).level;
  if (level === 'none') return `${t('Opens traffic on')} ${z}. ${t('Its Approval level is none, so no Approval is needed.')}`;
  return waiting ? `${t('Waits for the Approval of')} ${z} (${t(level)}).` : `${t('Opens traffic on')} ${z}: ${t('needs the Approval of')} ${z} (${t(level)}).`;
}

const Opt = ({ btn, children }: { btn: ReactNode; children: ReactNode }) => <div className="dr-opt"><div>{btn}</div><div>{children}</div></div>;

function DriftDetail({ d, all, onActed }: { d: Item; all: Item[]; onActed: (ids: string[]) => void }) {
  const { t } = useT(); const e = envs.find(x => x.id === d.env)!; const tf = e.mode === 'Terraform';
  const role = useEditRole(d); const approval = useApprovalText(d); const waiting = useApprovalText(d, true);
  const [dlg, setDlg] = useState<'overwrite' | 'adopt' | null>(null); const [rz, setRz] = useState(false); const box = useRef<HTMLElement>(null);
  useEffect(() => { setDlg(null); setRz(false); box.current?.scrollTo(0, 0); }, [d.id]);
  const open = isOpen(d) && !d.auto; const nsgLevel = d.kind.startsWith('rule') || d.kind === 'tag';
  const where = d.zones.length ? d.zones.map(zname).join(', ') : d.vnet;
  const owText = tf ? `${t('A pull request that changes only the revision value. The apply reverts all Drift in the root module')} ${d.root}.`
    : d.kind === 'nsg-del' ? t('Creates the Managed NSG again with its Deployed state and associates it: one NSG write and one subnet write.')
    : d.kind === 'assoc' ? t('Associates the Managed NSG again: one subnet write.')
    : d.kind === 'member' ? t('Adds the network interface to the Managed ASG again: one write of the network interface.')
    : `${t('One write of the Deployed state of')} ${d.res}.`;
  const back = reverse(d);
  return (
    <aside ref={box} className="lib-d vdet dr-d">
      <div className="lib-k"><span className={`sev ${d.sev}`}>{t(sevWord[d.sev])}</span><span className="muted">·</span>{t(d.resKind)}<span className="muted">·</span>{t(e.name)} <span className="muted">({e.mode})</span></div>
      <h2>{t(d.what)}</h2>
      <div className="dr-where"><span className="mono">{d.res}</span>
        {d.zones.map(z => <button key={z} className="tok t-zone" title={t('Open the Zone')} onClick={() => go37({ to: 'zone', id: z })}><Glyph kind="zone" />{zname(z)}</button>)}
        {!d.zones.length && <span className="tok t-vnet"><Glyph kind="vnet" />{d.vnet}</span>}
        {d.root && <span className="muted">{t('root module')} <span className="mono">{d.root}</span></span>}
        {d.inventory && open && <span className="zflag amber">{t('Azure differs, Adopt open')}</span>}</div>

      {d.auto && <div className="bn ok"><Bot16Regular /><span><b>{t('Resolved by the tool')}, {t(d.found.ago)}.</b> {t(d.auto)}</span></div>}
      {d.loop && open && <div className="bn amber"><Warning16Filled /><span><b>{t('Overwritten automatically 3 times since 08:00, then stopped: svc-legacy-deploy keeps removing the association.')}</b>{' '}
        {t('Fix the writer first: its ARM template declares the subnet inline without the Managed NSG. Make the template reference nsg-app0921-wes-web, or stop declaring the subnet. Then re-associate once.')}{' '}
        <a className="link" onClick={() => go37({ to: 'env', env: 'sandbox' })}>{t('The switch is in Admin > Environments > Sandbox')}</a></span></div>}
      {d.state === 'adopt' && <div className="bn amber"><Clock16Regular /><span><b>{t('Adopt open in')} {d.cs}</b>{d.adoptBy ? `, ${t('started by')} ${d.adoptBy}` : ''}. {waiting} {t('Until it is committed, Azure differs from the Deployed state; Overwrite is still possible.')}</span></div>}
      {d.state === 'overwriting' && <div className="bn amber"><Spinner size="extra-tiny" /><span><b>{t('Overwriting')}…</b> {t('Started an Overwrite Deployment.')} <a className="link" onClick={() => go37({ to: 'deployments' })}>{t('Open the Deployments')}</a></span></div>}
      {d.state === 'resolved' && !d.auto && <div className="bn ok"><CheckmarkCircle16Filled /><span>{d.how === 'adopted'
        ? <><b>{t('Adopted.')}</b> {t('The tool committed')} {d.cs} {t('on its own. The Rule base matches Azure.')}</>
        : <><b>{t('Overwritten by you, just now.')}</b> {t('Azure matches the Deployed state again.')} <a className="link" onClick={() => go37({ to: 'deployments' })}>{t('Started an Overwrite Deployment')}</a> · <a className="link" onClick={() => go37({ to: 'audit' })}>{t('In the audit log')}</a></>}</span></div>}

      <h3>{t('Deployed state and Azure')}</h3>
      <table className="mini dr-diff"><thead><tr><th /><th>{t('Deployed state')}</th><th>{t('Azure')}</th></tr></thead>
        <tbody>{d.diff.map(([k, a, b]) => <tr key={k}><td>{t(k)}</td><td className="mono">{t(a)}</td><td className={`mono ${a !== b ? 'chg' : ''}`}>{t(b)}</td></tr>)}</tbody></table>

      <h3>{t('Effect on traffic')}</h3>
      {d.fx.map(f => <div key={f.text} className="dr-fx"><b className={f.dir}>{t(f.dir === 'opens' ? 'Opens' : 'Closes')}</b><span>{t(f.text)}</span></div>)}
      <p className="cd-p">{t(d.why ?? sevWhy[d.sev])}{open && <> {t('Admins and approvers of')} {where} {t('are notified; the Zone overview shows “Drift”.')}</>}</p>

      <h3>{t('Who changed it')}</h3>
      <dl className="facts"><dt>{t('Changed by')}</dt><dd>{d.actor.changedBy}</dd><dt>{t('Client')}</dt><dd>{t(d.actor.clientType)}</dd><dt>{t('Operation')}</dt><dd className="mono">{d.actor.op}</dd>
        <dt>{t('Caller')}</dt><dd>{d.actor.caller}</dd><dt>{t('Correlation ID')}</dt><dd className="mono">{d.actor.corr}</dd><dt>{t('When')}</dt><dd>{t(d.actor.at)}</dd></dl>
      <p className="muted dr-src">{t('From Resource Graph resourcechanges (changedBy, clientType) and the Activity Log (caller).')}</p>

      <h3>{t('How it was found')}</h3>
      <p className="cd-p">{t(d.found.by === 'poll' ? 'Found by the 5-minute poll' : 'Found by the daily reconcile')}: {t(d.found.at)}. {t(d.found.by === 'poll' ? 'A GET confirmed it.' : 'A GET confirmed it. Polling is off in Non-production.')}</p>

      {open && <><h3>{t('What it blocks')}</h3>
        <p className="cd-p">{d.inventory ? `${t('No Commit and no Deployment. The Preview marks')} ${where} “${t('Azure differs, Adopt open')}”.`
          : d.root ? `${t('A Commit that touches the root module')} ${d.root} ${t('asks you to overwrite it, because every apply there reverts all Drift in the module.')}`
          : `${t('A Commit that changes')} ${d.res} ${t('asks you to overwrite it. Without that confirmation, a Deployment to it stops before its first write.')}${nsgLevel ? ` ${t('An expiry Commit is not blocked as a whole: only this NSG fails.')}` : ''}`}</p></>}

      {open && d.state !== 'overwriting' && <><h3>{t('What you can do')}</h3>
        <div className="dr-opts">
          {d.overwrite && <Opt btn={<Button disabled={!role.ok} onClick={() => setDlg('overwrite')}>{t(d.overwrite)}</Button>}>
            {owText} {t('No Approval.')}{back.map(b => <span key={b.text}> {t(b.k)}: {t(b.text)}.</span>)}</Opt>}
          {d.adopt && d.state !== 'adopt' && <Opt btn={<Button disabled={!role.ok} onClick={() => setDlg('adopt')}>{t('Adopt')}</Button>}>{t(d.adopt.what)} {approval}</Opt>}
          {d.noAdopt && <Opt btn={<Button onClick={() => go37({ to: 'rule', id: d.rule! })}>{t('Open the Rule')}</Button>}>
            <b className="dr-na">{t('Not adoptable automatically.')}</b> {t(d.noAdopt)} {t('Overwrite it, or change the Rule base by hand.')}</Opt>}
          {d.removeZone && <Opt btn={<Button onClick={() => setRz(true)}>{t('Remove the Zone')}</Button>}>
            {rz ? <span className="dr-note"><Info16Regular />{t('Removing')} {where} {t('goes into the current Change set,')} {CUR_NAME}. {t('Prototype: nothing is added.')}</span> : t('Takes the Zone out of the Rule base, in the current Change set.')}</Opt>}
        </div>
        {d.overwriteOnly && <p className="muted">{t(d.overwriteOnly)}</p>}
        {role.why && <p className="dr-why"><LockClosed16Regular />{role.why}</p>}</>}
      {dlg === 'overwrite' && <OverwriteDialog d={d} group={groupOf(d, all)} onVnet={role.onVnet} onClose={() => setDlg(null)} onActed={onActed} />}
      {dlg === 'adopt' && <AdoptDialog d={d} approval={approval} onClose={() => setDlg(null)} onActed={onActed} />}
    </aside>
  );
}

function OverwriteDialog({ d, group, onVnet, onClose, onActed }: { d: Item; group: Item[]; onVnet: boolean; onClose: () => void; onActed: (ids: string[]) => void }) {
  const { t } = useT(); const se = useSession(); const tf = !!d.root;
  const flows = group.flatMap(reverse);
  const go = () => {
    const ids = group.map(x => x.id);
    se.log({ cat: 'drift', action: 'Overwrote Drift', object: [...new Set(group.map(x => x.res))].join(', '), scopes: [...new Set(group.flatMap(x => zonesOf(x).slice(0, 1)))].map(id => ({ kind: 'zone' as const, id })), result: 'ok',
      detail: tf ? `Pull request that changes only the revision value, root module ${d.root}` : 'One write of the Deployed state' });
    setOver(ids, { state: 'overwriting' }); setTimeout(() => setOver(ids, { state: 'resolved', how: 'overwritten' }), 2600);
    onActed(ids); onClose();
  };
  return (
    <Dialog open onOpenChange={(_, v) => !v.open && onClose()}>
      <DialogSurface className="dr-dlg" style={{ maxWidth: 600 }}><DialogBody><DialogTitle>{t(d.overwrite!)} <span className="mono">{d.res}</span></DialogTitle>
        <DialogContent className="cd">
          <section><h4>{t(tf ? 'One pull request' : 'One write')}</h4>
            <p className="cd-p">{tf ? <>{t('A pull request that changes only the revision value. The apply reverts ALL Drift in the root module')} <span className="mono">{d.root}</span>:</>
              : group.length > 1 ? t('One write of the Deployed state. It reverts every Drift on this resource:') : t('One write of the Deployed state:')}</p>
            <ul className="cd-l">{group.map(x => <li key={x.id}><span className="mono">{x.res}</span>: {t(x.what)}</li>)}</ul></section>
          <section><h4>{t('Flows')}</h4>
            {flows.length ? <ul className="cd-l">{flows.map(f => <li key={f.text}><b className={`dr-k ${f.k === 'Closes' ? 'closes' : 'opens'}`}>{t(f.k)}:</b> {t(f.text)}</li>)}</ul> : <p className="cd-p">{t('No flow reopens or closes.')}</p>}</section>
          <section><h4>{t('Approval')}</h4>
            <p className="cd-p">{t(onVnet ? 'No Approval needed. Needs the editor Role in the VNet. It goes into the audit log.' : 'No Approval needed. Needs the editor Role in the Zone. It goes into the audit log.')}</p></section>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" onClick={go}>{t(d.overwrite!)}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

function AdoptDialog({ d, approval, onClose, onActed }: { d: Item; approval: string; onClose: () => void; onActed: (ids: string[]) => void }) {
  const { t } = useT(); const opens = d.adopt!.fx === 'opens';
  const go = () => { const cs = `CHG-${nextCs++}`; setOver([d.id], opens ? { state: 'adopt', cs } : { state: 'resolved', how: 'adopted', cs }); onActed([d.id]); onClose(); };
  return (
    <Dialog open onOpenChange={(_, v) => !v.open && onClose()}>
      <DialogSurface className="dr-dlg" style={{ maxWidth: 560 }}><DialogBody><DialogTitle>{t('Adopt the change in Azure')}</DialogTitle>
        <DialogContent className="cd">
          <section><h4>{t('The Change set the tool prepares')}</h4><p className="cd-p">{t(d.adopt!.what)}</p>
            <p className="cd-p">{t('It changes the Rule base to match Azure. The tool prepares one Change set per cause and Object.')}</p></section>
          <section><h4>{t('Approval')}</h4><p className={`cd-p ${opens ? 'pending' : ''}`}>{approval}</p></section>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" onClick={go}>{t(opens ? 'Prepare the Change set' : 'Adopt')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

export interface DriftCounts { open: number; high: number; byEnv: Record<string, { open: number; high: number; worst: 'high' | 'medium' | 'low' | null }> }
export function useDriftCounts(): DriftCounts {
  const items = useDriftItems();
  return useMemo(() => {
    const open = items.filter(isOpen); const byEnv: DriftCounts['byEnv'] = {};
    for (const e of envs) { const o = open.filter(d => d.env === e.id); byEnv[e.id] = { open: o.length, high: o.filter(d => d.sev === 'high').length, worst: o.reduce<Sev | null>((w, d) => (!w || sevRank[d.sev] > sevRank[w] ? d.sev : w), null) }; }
    return { open: open.length, high: open.filter(d => d.sev === 'high').length, byEnv };
  }, [items]);
}
/** One inbox row per open high Drift, for the admins and approvers of its Zones. */
export function useDriftInbox(): Item37[] {
  const items = useDriftItems(); const se = useSession();
  return items.filter(d => d.state === 'open' && d.sev === 'high' && d.inbox && zonesOf(d).some(z => { const r = se.zoneRole(zoneById.get(z)!); return r === 'admin' || r === 'approver'; }))
    .map(d => ({ id: `drift-${d.id}`, kind: 'drift', tone: 'red', text: d.inbox!, when: d.found.ago, action: 'Open', go: () => go37({ to: 'drift', id: d.id }) }));
}
