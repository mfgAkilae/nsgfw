// PROTOTYPE, throwaway. Access (issue 38): a Scope tree with, per Scope, its Approval level and its Role assignments,
// a check "who holds which Role here", and every assignment as one flat list. Role assignments are direct settings:
// audited, not versioned, no Change set, no Approval (Grilling: Access, roles and audit, point 12). Changing them needs a fresh sign-in.
import { useMemo, useState } from 'react';
import { Button, Input } from '@fluentui/react-components';
import { Search16Regular, ChevronRight12Regular, ChevronDown12Regular, Delete16Regular, PersonAdd16Regular, Warning16Filled, Dismiss16Regular, Info16Regular } from '@fluentui/react-icons';
import { useSession, StepUpLock, PrincipalGlyph } from './session';
import { ScopeRef, INSTANCE, key, fromKey, childrenOf, pathOf, scopeName, kindLabel, zoneCount, principals, principalById, roleNames, RoleName, contains, instanceAdmins, levels, grantsOf, roleAt, subs } from './access';
import { zones, vnets, envs, Level } from './data';
import { Glyph } from './Glyph';
import { useT } from './i18n';

const levelText: Record<Level, string> = { none: 'An editor of the Zone commits directly.', approver: 'An approver of the Zone approves. An Author may approve.', 'four-eyes': 'An approver of the Zone who is not an Author approves.' };
const roleText: Record<RoleName, string> = { viewer: 'reads Rules, Zones and the audit log of this Scope', editor: 'also drafts edits; commits at the level none', approver: 'also approves Change sets for these Zones', admin: 'also assigns Roles and changes settings here' };
const KindMark = ({ s }: { s: ScopeRef }) => s.kind === 'zone' ? <Glyph kind="zone" /> : s.kind === 'vnet' ? <Glyph kind="vnet" /> : <span className={`skind k-${s.kind}`}>{s.kind === 'instance' ? 'I' : s.kind === 'env' ? 'E' : 'S'}</span>;

export function AccessPage() {
  const se = useSession(); const { t } = useT();
  const [tab, setTab] = useState<'scopes' | 'all'>('scopes');
  const start = se.instanceScope ? INSTANCE : se.grants.find(g => g.role === 'admin')?.scope ?? INSTANCE;
  const [sel, setSel] = useState<ScopeRef>(start);
  const [open, setOpen] = useState<Set<string>>(() => new Set(pathOf(start).map(key)));
  const select = (s: ScopeRef) => { setSel(s); setOpen(o => { const n = new Set(o); pathOf(s).slice(0, -1).forEach(p => n.add(key(p))); return n; }); setTab('scopes'); };
  return <>
    <header className="phead"><h1>{t('Access')}</h1><span className="sub">{t('Who may do what, per Scope. A Role holds in every Scope below it.')}</span><span className="sp" />
      <div className="seg2" role="tablist"><button className={tab === 'scopes' ? 'on' : ''} onClick={() => setTab('scopes')}>{t('By Scope')}</button><button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{t('All assignments')}<i className="cnt n">{se.assignments.length}</i></button></div></header>
    {tab === 'scopes' ? (
      <div className="sheet acc">
        <ScopeTree sel={sel} open={open} setOpen={setOpen} onSelect={select} />
        <ScopeDetail s={sel} onSelect={select} />
      </div>
    ) : <AllAssignments onScope={select} />}
  </>;
}

// ---------- The Scope tree: instance, Environments, subscriptions, VNets, Zones. Children render only when open (20,000 Zones).
function ScopeTree({ sel, open, setOpen, onSelect }: { sel: ScopeRef; open: Set<string>; setOpen: (f: (o: Set<string>) => Set<string>) => void; onSelect: (s: ScopeRef) => void }) {
  const se = useSession(); const { t } = useT(); const [q, setQ] = useState('');
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const a of se.assignments) m.set(key(a.scope), (m.get(key(a.scope)) ?? 0) + 1); return m; }, [se.assignments]);
  const hits = useMemo(() => {
    const ql = q.trim().toLowerCase(); if (ql.length < 2) return null; const out: ScopeRef[] = [];
    for (const e of envs) if (e.name.toLowerCase().includes(ql)) out.push({ kind: 'env', id: e.id });
    for (const s of subs) if (s.id.includes(ql)) out.push({ kind: 'sub', id: s.id });
    for (const v of vnets) { if (out.length > 60) break; if (v.name.includes(ql)) out.push({ kind: 'vnet', id: v.name }); }
    for (const z of zones) { if (out.length > 80) break; if (z.name.includes(ql)) out.push({ kind: 'zone', id: z.id }); }
    return out.filter(se.seesScope);
  }, [q, se.seesScope]);
  const toggle = (k: string) => setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const Node = ({ s, depth }: { s: ScopeRef; depth: number }): JSX.Element | null => {
    if (!se.seesScope(s)) return null;
    const k = key(s); const kids = s.kind === 'zone' ? [] : childrenOf(s); const isOpen = open.has(k); const lvl = se.levels[k]; const n = counts.get(k);
    return <>
      <div className={`tnode ${key(sel) === k ? 'on' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => onSelect(s)}>
        {kids.length ? <button className="tchev" onClick={e => { e.stopPropagation(); toggle(k); }}>{isOpen ? <ChevronDown12Regular /> : <ChevronRight12Regular />}</button> : <span className="tchev" />}
        <KindMark s={s} /><b>{t(scopeName(s))}</b>
        <span className="sp" />{n ? <span className="tcount" title={t('Role assignments here')}>{n}</span> : null}{lvl && s.kind !== 'instance' && <span className={`lvl l-${lvl}`} title={t('Approval level set here')}>{t(lvl)}</span>}
      </div>
      {isOpen && kids.slice(0, 200).map(c => <Node key={key(c)} s={c} depth={depth + 1} />)}
      {isOpen && kids.length > 200 && <div className="tmore" style={{ paddingLeft: 30 + depth * 16 }}>{kids.length - 200} {t('more: search to find them')}</div>}
    </>;
  };
  return (
    <div className="acc-l">
      <div className="acc-s"><Input className="search" size="small" contentBefore={<Search16Regular />} placeholder={t('Environment, subscription, VNet or Zone')} value={q} onChange={(_, d) => setQ(d.value)} /></div>
      <div className="acc-t">
        {hits ? (hits.length ? hits.map(s => <div key={key(s)} className={`tnode hit ${key(sel) === key(s) ? 'on' : ''}`} onClick={() => { onSelect(s); setQ(''); }}><KindMark s={s} /><b>{t(scopeName(s))}</b><span className="tpath">{pathOf(s).slice(1, -1).map(p => t(scopeName(p))).join(' › ')}</span></div>)
          : <div className="muted" style={{ padding: 12 }}>{t('No Scope matches.')}</div>) : <Node s={INSTANCE} depth={0} />}
      </div>
    </div>
  );
}

// ---------- One Scope: its Approval level, its Role assignments, and the access check.
function ScopeDetail({ s, onSelect }: { s: ScopeRef; onSelect: (s: ScopeRef) => void }) {
  const se = useSession(); const { t } = useT(); const [assign, setAssign] = useState(false);
  const path = pathOf(s); const admin = se.isAdminAt(s);
  const here = se.assignments.filter(a => key(a.scope) === key(s));
  const above = se.assignments.filter(a => key(a.scope) !== key(s) && contains(a.scope, s));
  const below = se.assignments.filter(a => key(a.scope) !== key(s) && contains(s, a.scope)).length;
  const zc = zoneCount(s);
  return (
    <section className="acc-d">
      <nav className="crumbs">{path.map((p, i) => <span key={key(p)}>{i > 0 && <ChevronRight12Regular />}<a className={i === path.length - 1 ? 'cur' : ''} onClick={() => onSelect(p)}>{t(scopeName(p))}</a></span>)}</nav>
      <div className="acc-title"><KindMark s={s} /><h2>{t(scopeName(s))}</h2><span className="muted">{t(kindLabel[s.kind])} · {zc.toLocaleString()} {t(zc === 1 ? 'Zone' : 'Zones')}</span>
        <span className="sp" /><span className={`myrole ${admin ? 'admin' : ''}`}>{t('You:')} {se.roleAtScope(s) ? t(se.roleAtScope(s)!.role) : t('no Role here')}</span></div>

      <ApprovalCard s={s} onSelect={onSelect} />

      <div className="card">
        <div className="card-h"><h3>{t('Role assignments')}</h3><span className="muted">{t('viewer, editor, approver, admin: each includes the ones before it')}</span><span className="sp" />
          {admin ? <Button size="small" appearance="primary" icon={<PersonAdd16Regular />} onClick={() => setAssign(true)}>{t('Assign Role')}<StepUpLock /></Button> : <span className="muted">{t('Only an admin of this Scope assigns Roles here.')}</span>}</div>
        <table className="mini assign"><thead><tr><th>{t('Principal')}</th><th>{t('Role')}</th><th>{t('Where')}</th><th>{t('Assigned')}</th><th></th></tr></thead><tbody>
          {s.kind === 'instance' && instanceAdmins.map(p => { const pr = principalById.get(p); return <tr key={p} className="entra"><td><span className="pr"><PrincipalGlyph kind="user" /><b>{pr?.name ?? t(p)}</b>{pr?.upn && <span className="muted">{pr.upn}</span>}</span></td><td><span className="role r-admin">admin</span></td><td colSpan={3} className="muted">{t('Entra app role InstanceAdmin. Maintained in Entra, not here, so nsgfw can never lock itself out.')}</td></tr>; })}
          {here.map(a => <AssignRow key={a.id} a={a} here canRemove={admin} />)}
          {above.map(a => <AssignRow key={a.id} a={a} onScope={onSelect} />)}
          {!here.length && !above.length && <tr><td colSpan={5} className="muted">{t('No Role assignment holds here.')}</td></tr>}
        </tbody></table>
        {below > 0 && <p className="muted foot">{below} {t(below === 1 ? 'more assignment in Scopes below this one.' : 'more assignments in Scopes below this one.')}</p>}
      </div>

      <CheckAccess s={s} />
      {assign && <AssignDialog s={s} onClose={() => setAssign(false)} />}
    </section>
  );
}

function AssignRow({ a, here, canRemove, onScope }: { a: import('./access').Assignment; here?: boolean; canRemove?: boolean; onScope?: (s: ScopeRef) => void }) {
  const se = useSession(); const { t } = useT(); const p = principalById.get(a.principal)!;
  return (
    <tr className={here ? '' : 'inh'}>
      <td><span className="pr"><PrincipalGlyph kind={p.kind} /><b>{p.name}</b><span className="muted">{p.upn ?? t({ group: 'group', sp: 'service principal', mi: 'managed identity', user: 'user' }[p.kind])}</span>
        {p.deleted && <span className="tag red" title={`${t('Deleted in Entra on')} ${p.deleted}`}>{t('deleted in Entra')}</span>}{p.hidden && <span className="tag amber" title={t('nsgfw cannot read the members of this group, so the assignment gives nobody access.')}>{t('hidden membership')}</span>}</span></td>
      <td><span className={`role r-${a.role}`}>{t(a.role)}</span></td>
      <td>{here ? <span>{t('here')}</span> : <a className="link" onClick={() => onScope?.(a.scope)}>{t('from')} {t(scopeName(a.scope))}</a>}</td>
      <td className="muted">{principalById.get(a.by)?.name ?? t(a.by)}, {a.at}</td>
      <td className="r">{here && canRemove && <button className="ib danger" title={t('Remove')} onClick={() => se.unassign(a.id)}><Delete16Regular /></button>}</td>
    </tr>
  );
}

// ---------- Approval level: tighten in place, loosen only from a Scope above (Grilling: Access, roles and audit, point 13).
function ApprovalCard({ s, onSelect }: { s: ScopeRef; onSelect: (s: ScopeRef) => void }) {
  const se = useSession(); const { t } = useT();
  const eff = se.levelOf(s); const setHere = se.levels[key(s)]; const parent = pathOf(s).at(-2);
  const below = Object.entries(se.levels).map(([k, l]) => ({ s: fromKey(k), l })).filter(x => key(x.s) !== key(s) && contains(s, x.s) && x.s.kind !== 'instance');
  const isInst = s.kind === 'instance';
  const opts: (Level | null)[] = isInst ? levels : [null, ...levels];
  const label = (o: Level | null) => (o ? t(o) : `${t('Inherit')} (${t(parent ? se.levelOf(parent).level : 'four-eyes')})`);
  const raiseOnly = !se.levelBlock(s, 'four-eyes') && levels.some(l => se.levelBlock(s, l));
  return (
    <div className="card">
      <div className="card-h"><h3>{t(isInst ? 'Instance default Approval level' : 'Approval level')}</h3><span className="muted">{t(isInst ? 'Applies wherever no Environment or Scope below sets its own.' : 'Each Affected Zone of a Change set needs the level of its Scope.')}</span></div>
      <div className="lvl-row">
        <div className="lvl-now"><span className={`lvl big l-${eff.level}`}>{t(eff.level)}</span>
          <div><b>{t(levelText[eff.level])}</b><div className="muted">{setHere ? t('Set here.') : <>{t('Inherited from')} <a className="link" onClick={() => onSelect(eff.from)}>{t(scopeName(eff.from))}</a>.</>}</div></div></div>
        <div className="seg2 lvl-seg" role="radiogroup">{opts.map(o => { const block = se.levelBlock(s, o); const on = (o ?? null) === (setHere ?? null) && (o !== null || !setHere);
          return <button key={o ?? 'inherit'} role="radio" aria-checked={on} className={on ? 'on' : ''} disabled={!!block && !on} title={block ? t(block) : undefined} onClick={() => !on && se.setLevel(s, o)}>{label(o)}</button>; })}</div>
      </div>
      {raiseOnly && <p className="muted foot"><Info16Regular /> {t('You can raise the level here. Lowering it needs an admin of a Scope above, so the admins of a Scope cannot switch off the control over themselves.')}</p>}
      {!se.isAdminAt(s) && <p className="muted foot">{t('Only an admin of this Scope changes its level.')}</p>}
      {below.length > 0 && <div className="lvl-below"><span className="muted">{t('Set below this Scope')}:</span>{below.slice(0, 6).map(x => <button key={key(x.s)} className="lvlchip" onClick={() => onSelect(x.s)}><KindMark s={x.s} />{t(scopeName(x.s))}<span className={`lvl l-${x.l}`}>{t(x.l)}</span></button>)}{below.length > 6 && <span className="muted">+{below.length - 6}</span>}</div>}
    </div>
  );
}

// ---------- Who holds which Role here, and why.
function CheckAccess({ s }: { s: ScopeRef }) {
  const se = useSession(); const { t } = useT(); const [q, setQ] = useState(''); const [pid, setPid] = useState<string | null>(null);
  const ql = q.trim().toLowerCase(); const list = ql ? principals.filter(p => p.name.toLowerCase().includes(ql) || p.upn?.includes(ql)).slice(0, 6) : [];
  const p = pid ? principalById.get(pid)! : null;
  const g = p ? roleAt(grantsOf(p.id, se.assignments, p.id === 'robin'), s) : null;
  return (
    <div className="card">
      <div className="card-h"><h3>{t('Check access')}</h3><span className="muted">{t('Pick a person, group or identity to see their Role in this Scope and where it comes from.')}</span></div>
      <div className="chk">
        <div className="chk-in"><Input size="small" contentBefore={<Search16Regular />} placeholder={t('Name or sign-in')} value={p && !q ? p.name : q} onChange={(_, d) => { setQ(d.value); setPid(null); }} />
          {list.length > 0 && <div className="chk-l">{list.map(x => <div key={x.id} className="pal-i" onClick={() => { setPid(x.id); setQ(''); }}><PrincipalGlyph kind={x.kind} /><b>{x.name}</b><span>{x.upn ?? x.kind}</span></div>)}</div>}</div>
        {p && <div className="chk-r">{g ? <><span className={`role r-${g.role}`}>{t(g.role)}</span><span><b>{p.name}</b> {t('holds')} {t(g.role)} {t('here')}: {g.entra ? t('Entra app role InstanceAdmin') : <>{t('assignment in')} <b>{t(scopeName(g.scope))}</b>{g.via !== 'direct' ? <> {t('through the group')} <b>{g.via}</b></> : <> ({t('direct')})</>}</>}. <span className="muted">{t(roleText[g.role])}.</span></span></>
          : <><span className="role r-none">{t('none')}</span><span><b>{p.name}</b> {t('holds no Role here, and sees no Rule that lands only on these Zones.')}{p.hidden ? ` ${t('Members of groups with hidden membership are never resolved.')}` : ''}</span></>}
          <button className="ib" onClick={() => setPid(null)}><Dismiss16Regular /></button></div>}
      </div>
    </div>
  );
}

function AssignDialog({ s, onClose }: { s: ScopeRef; onClose: () => void }) {
  const se = useSession(); const { t } = useT(); const [q, setQ] = useState(''); const [pid, setPid] = useState<string | null>(null); const [role, setRole] = useState<RoleName>('editor');
  const ql = q.trim().toLowerCase(); const list = principals.filter(p => !p.deleted && (!ql || p.name.toLowerCase().includes(ql) || p.upn?.includes(ql))).slice(0, 8);
  const p = pid ? principalById.get(pid) : null;
  return (
    <div className="modal-bg" onMouseDown={onClose}><div className="modal wide" role="dialog" aria-label={t('Assign Role')} onMouseDown={e => e.stopPropagation()}>
      <h2>{t('Assign a Role in')} {t(scopeName(s))}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{pathOf(s).map(x => t(scopeName(x))).join(' › ')}. {t('The Role holds here and in every Scope below.')}</p>
      <label className="flabel">{t('Who')}</label>
      <Input autoFocus contentBefore={<Search16Regular />} placeholder={t('User, group, service principal or managed identity in Entra')} value={q} onChange={(_, d) => { setQ(d.value); setPid(null); }} />
      <div className="pick-l">{list.map(x => <div key={x.id} className={`pal-i ${pid === x.id ? 'on' : ''}`} onClick={() => setPid(x.id)}><PrincipalGlyph kind={x.kind} /><b>{x.name}</b><span>{x.upn ?? t({ group: 'group', sp: 'service principal', mi: 'managed identity', user: 'user' }[x.kind])}{x.hidden ? ` · ${t('hidden membership')}` : ''}</span></div>)}</div>
      {p?.hidden && <p className="warnline"><Warning16Filled /> {t('nsgfw cannot read the members of this group. The assignment would give nobody access.')}</p>}
      <label className="flabel">{t('Role')}</label>
      <div className="role-pick">{roleNames.map(r => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}><span className={`role r-${r}`}>{t(r)}</span><span>{t(roleText[r])}</span></button>)}</div>
      <p className="muted">{t('Takes effect at once, for the person within 15 minutes. Not part of a Change set and needs no Approval. Recorded in the audit log.')}</p>
      <div className="modal-f"><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={!p} onClick={() => { se.assign(p!.id, role, s); onClose(); }}>{t('Assign')} {p ? `${t(role)} ${t('to')} ${p.name}` : ''}<StepUpLock /></Button></div>
    </div></div>
  );
}

// ---------- Every assignment as one list, filterable by kind and flag.
function AllAssignments({ onScope }: { onScope: (s: ScopeRef) => void }) {
  const se = useSession(); const { t } = useT(); const [f, setF] = useState('all'); const [q, setQ] = useState('');
  const visible = se.assignments.filter(a => se.seesScope(a.scope));
  const chips: [string, string, (a: import('./access').Assignment) => boolean][] = [
    ['all', 'All', () => true], ['user', 'Users', a => principalById.get(a.principal)!.kind === 'user'], ['group', 'Groups', a => principalById.get(a.principal)!.kind === 'group'],
    ['sp', 'Service principals', a => principalById.get(a.principal)!.kind === 'sp'], ['mi', 'Managed identities', a => principalById.get(a.principal)!.kind === 'mi'],
    ['admin', 'admin', a => a.role === 'admin'], ['deleted', 'Deleted in Entra', a => !!principalById.get(a.principal)!.deleted], ['hidden', 'Hidden membership', a => !!principalById.get(a.principal)!.hidden],
  ];
  const fn = chips.find(c => c[0] === f)![2]; const ql = q.toLowerCase();
  const rows = visible.filter(fn).filter(a => !ql || principalById.get(a.principal)!.name.toLowerCase().includes(ql) || scopeName(a.scope).toLowerCase().includes(ql))
    .sort((a, b) => pathOf(a.scope).length - pathOf(b.scope).length || scopeName(a.scope).localeCompare(scopeName(b.scope)));
  return <>
    <div className="chipbar">{chips.map(([k, l, c]) => { const n = visible.filter(c).length; return <button key={k} className={`chip ${f === k ? 'on' : ''} ${k === 'deleted' || k === 'hidden' ? 'c-findings' : ''} ${n ? '' : 'zero'}`} disabled={!n && f !== k} onClick={() => setF(k)}>{t(l)}<i>{n}</i></button>; })}
      <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Principal or Scope')} value={q} onChange={(_, d) => setQ(d.value)} /></div>
    <div className="sheet pad"><table className="mini assign wide"><thead><tr><th>{t('Principal')}</th><th>{t('Role')}</th><th>{t('Scope')}</th><th>{t('Assigned')}</th><th></th></tr></thead><tbody>
      {rows.map(a => { const p = principalById.get(a.principal)!; return (
        <tr key={a.id}><td><span className="pr"><PrincipalGlyph kind={p.kind} /><b>{p.name}</b><span className="muted">{p.upn ?? t({ group: 'group', sp: 'service principal', mi: 'managed identity', user: 'user' }[p.kind])}</span>{p.deleted && <span className="tag red">{t('deleted in Entra')}</span>}{p.hidden && <span className="tag amber">{t('hidden membership')}</span>}</span></td>
          <td><span className={`role r-${a.role}`}>{t(a.role)}</span></td>
          <td><a className="link scope-l" onClick={() => onScope(a.scope)}><KindMark s={a.scope} />{t(scopeName(a.scope))}</a> <span className="muted">{pathOf(a.scope).slice(1, -1).map(x => t(scopeName(x))).join(' › ')}</span></td>
          <td className="muted">{principalById.get(a.by)?.name ?? t(a.by)}, {a.at}</td>
          <td className="r">{se.isAdminAt(a.scope) && <button className="ib danger" title={t('Remove')} onClick={() => se.unassign(a.id)}><Delete16Regular /></button>}</td></tr>); })}
    </tbody></table></div>
  </>;
}
