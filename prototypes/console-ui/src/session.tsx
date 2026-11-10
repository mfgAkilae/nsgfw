// PROTOTYPE, throwaway. Who is signed in (issue 38): the persona, their Role grants, the read filter by Coverage, step-up
// re-authentication, session expiry, denied actions, and the direct settings of Access and administration. In memory only.
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Button, Popover, PopoverTrigger, PopoverSurface, Spinner } from '@fluentui/react-components';
import { LockClosed12Regular, LockClosed16Regular, ShieldError20Regular, Copy16Regular, SignOut20Regular, Checkmark16Regular, Person16Regular, People16Regular, Bot16Regular, Key16Regular } from '@fluentui/react-icons';
import { zones, zoneById, ref, Rule, Level, envs, Zone } from './data';
import {
  personas, principalById, initialAssignments, Assignment, grantsOf, roleAt, roleInZone, Grant, RoleName, roleRank, ScopeRef, INSTANCE, key, parentOf, contains, zoneIn,
  initialLevels, levelRank, initialEnvSettings, EnvSettings, auditEntries, AuditEntry, NOW, zoneByName, scopeName, internalSpace, PrincipalKind,
} from './access';
import { Brand } from './bits';
import { useT } from './i18n';

const t0 = Date.now();
export const now = () => new Date(NOW.getTime() + (Date.now() - t0));
const STEP_UP_MIN = 15, IDLE_MIN = 60, ABS_H = 8;
export const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
export type Signout = 'idle' | 'absolute' | 'manual' | null;
export interface Denied { what: string; need: string; have: string }
export interface AlertCfg { kind: 'none' | 'mail' | 'webhook'; mailVia: 'smtp' | 'graph'; smtpHost: string; from: string; to: string; mailbox: string; format: 'teams' | 'json'; secret: string }

function useSessionValue() {
  const [personaId, setPersonaId] = useState(() => { const a = new URLSearchParams(location.search).get('as'); return personas.some(p => p.id === a) ? a! : 'ia'; });
  const persona = personas.find(p => p.id === personaId)!;
  const user = principalById.get(persona.user)!;
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [lv, setLv] = useState<Record<string, Level>>(initialLevels);
  const [envSettings, setEnvSettings] = useState<Record<string, EnvSettings>>(initialEnvSettings);
  const [settle, setSettle] = useState(10);
  const [contact, setContact] = useState('Network security team: netsec-requests@example.org');
  const [alert, setAlert] = useState<AlertCfg>({ kind: 'webhook', mailVia: 'smtp', smtpHost: 'smtp.example.org:587', from: 'nsgfw@example.org', to: 'netsec-oncall@example.org', mailbox: 'nsgfw@example.org', format: 'teams', secret: 'nsgfw-alert-webhook' });
  const [onPrem, setOnPrem] = useState(false); const [chainBroken, setChainBroken] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>(auditEntries);
  const [setupHidden, setSetupHidden] = useState(false);

  // Sign-in and session. The prototype starts with a sign-in 47 minutes old, so the first Approval or Role change asks for a new one.
  const [signedInAt, setSignedInAt] = useState(() => new Date(NOW.getTime() - 47 * 60_000));
  const [signout, setSignout] = useState<Signout>(null);
  const [idleWarnAt, setIdleWarnAt] = useState<number | null>(null);   // ms timestamp when the forced sign-out happens
  const [endWarn, setEndWarn] = useState(false);
  const [pending, setPending] = useState<{ what: string; run: () => void; waiting?: boolean } | null>(null);
  const [denied, setDenied] = useState<Denied | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const tid = useRef(0);

  const grants = useMemo(() => grantsOf(user.id, assignments, persona.entraAdmin), [user.id, assignments, persona.entraAdmin]);
  const instanceScope = grants.some(g => g.scope.kind === 'instance');
  const canEdit = grants.some(g => roleRank[g.role] >= roleRank.editor);
  const anyAdmin = grants.some(g => g.role === 'admin');
  const roleAtScope = (s: ScopeRef) => roleAt(grants, s);
  const isAdminAt = (s: ScopeRef) => roleAt(grants, s)?.role === 'admin';
  const zoneRole = (z: Zone) => roleInZone(grants, z);
  // Zones in the person's Scopes: the basis of the read filter.
  const myZones = useMemo(() => { if (instanceScope) return null; const sc = grants.map(g => g.scope); return new Set(zones.filter(z => sc.some(s => zoneIn(z, s))).map(z => z.id)); }, [grants, instanceScope]);
  const seesScope = (s: ScopeRef) => instanceScope || grants.some(g => contains(g.scope, s) || contains(s, g.scope));

  const levelOf = (s: ScopeRef): { level: Level; from: ScopeRef } => { let c: ScopeRef | null = s; while (c) { const l = lv[key(c)]; if (l) return { level: l, from: c }; c = parentOf(c); } return { level: 'four-eyes', from: INSTANCE }; };
  /** Tighten in place, loosen only from above (Grilling: Access, roles and audit, point 13). null: allowed. */
  const levelBlock = (s: ScopeRef, to: Level | null): string | null => {
    if (!isAdminAt(s)) return `Needs the admin Role in ${scopeName(s)}.`;
    const cur = levelOf(s).level; const parent = parentOf(s); const next = to ?? (parent ? levelOf(parent).level : cur);
    if (s.kind === 'instance') return isAdminAt(INSTANCE) ? null : 'Only an instance admin changes the instance default.';
    if (levelRank[next] < levelRank[cur] && !(parent && isAdminAt(parent))) return `Lowering the level needs an admin of a Scope above ${scopeName(s)}.`;
    return null;
  };

  const toast = (text: string) => { const id = ++tid.current; setToasts(x => [...x, { id, text }]); setTimeout(() => setToasts(x => x.filter(y => y.id !== id)), 4200); };
  const log = (e: Omit<AuditEntry, 'seq' | 'at' | 'hash' | 'prev' | 'actor' | 'actorKind'> & { actor?: string }) => setAudit(a => [{ ...e, actor: e.actor ?? user.id, actorKind: 'user', seq: a[0].seq + 1, at: now(), hash: Math.random().toString(16).slice(2).padEnd(64, '0'), prev: a[0].hash }, ...a]);
  const ageMin = () => Math.round((now().getTime() - signedInAt.getTime()) / 60_000);
  const stale = () => ageMin() > STEP_UP_MIN;
  const stepUp = (what: string, run: () => void) => { if (!stale()) run(); else setPending({ what, run }); };
  const signInAgain = (then?: () => void) => { setTimeout(() => { setSignedInAt(now()); setSignout(null); setIdleWarnAt(null); setEndWarn(false); toast(`Signed in again at ${hhmm(now())}.`); then?.(); }, 1100); };

  const api = {
    persona, user, personaId, setPersona: (id: string) => { setPersonaId(id); setSignout(null); },
    grants, instanceScope, canEdit, readOnly: !canEdit, anyAdmin, roleAtScope, isAdminAt, zoneRole, myZones, seesScope,
    assignments, assign(principal: string, role: RoleName, scope: ScopeRef) {
      stepUp('Changing Role assignments', () => { setAssignments(a => [...a, { id: `ra-new-${Date.now()}`, principal, role, scope, by: user.id, at: hhmm(now()) + ' today' }]);
        log({ cat: 'role', action: 'Assigned Role', object: `${role} to ${principalById.get(principal)?.name ?? principal}`, scopes: [scope], result: 'ok' }); toast(`${role} assigned in ${scopeName(scope)}. Recorded in the audit log.`); });
    },
    unassign(id: string) {
      const a = assignments.find(x => x.id === id); if (!a) return;
      stepUp('Changing Role assignments', () => { setAssignments(x => x.filter(y => y.id !== id));
        log({ cat: 'role', action: 'Removed Role assignment', object: `${a.role} of ${principalById.get(a.principal)?.name ?? a.principal}`, scopes: [a.scope], result: 'ok' }); toast('Role assignment removed. Recorded in the audit log.'); });
    },
    levelOf, levelBlock, levels: lv,
    setLevel(s: ScopeRef, to: Level | null) {
      const b = levelBlock(s, to); if (b) { setDenied({ what: `Changing the Approval level of ${scopeName(s)}`, need: b, have: describe(roleAt(grants, s)) }); return; }
      const before = levelOf(s).level;
      setLv(x => { const n = { ...x }; if (to) n[key(s)] = to; else delete n[key(s)]; return n; });
      if (s.kind === 'env') { const e = envs.find(e => e.id === s.id); if (e) e.level = to ?? lv['instance:instance'] ?? 'four-eyes'; }   // the Change set views read the Environment level
      log({ cat: 'setting', action: 'Changed Approval level', object: `${scopeName(s)}: ${before} to ${to ?? 'inherited'}`, scopes: [s], result: 'ok' });
      toast(`Approval level of ${scopeName(s)} is now ${to ?? 'inherited'}.`);
    },
    envSettings, setEnv(env: string, patch: Partial<EnvSettings>, what: string) {
      setEnvSettings(x => ({ ...x, [env]: { ...x[env], ...patch } }));
      log({ cat: 'setting', action: 'Changed setting', object: `${what} of ${envs.find(e => e.id === env)?.name}`, scopes: [{ kind: 'env', id: env }], result: 'ok' }); toast('Saved. Recorded in the audit log.');
    },
    settle, setSettle(v: number) { log({ cat: 'setting', action: 'Changed setting', object: `Settle time: ${settle} s to ${v} s`, scopes: [INSTANCE], result: 'ok' }); setSettle(v); toast('Saved. Recorded in the audit log.'); },
    contact, setContact(v: string) { setContact(v); log({ cat: 'setting', action: 'Changed setting', object: 'Access contact', scopes: [INSTANCE], result: 'ok' }); toast('Saved.'); },
    alert, setAlert(a: AlertCfg) { setAlert(a); log({ cat: 'setting', action: 'Changed setting', object: `Alert channel: ${a.kind === 'none' ? 'none' : a.kind === 'mail' ? 'e-mail' : `webhook (${a.format === 'teams' ? 'Teams Workflows' : 'generic JSON'})`}`, scopes: [INSTANCE], result: 'ok' }); toast('Alert channel saved.'); },
    internalSpace,
    onPrem, setOnPrem, chainBroken, setChainBroken, audit, log, setupHidden, setSetupHidden,
    signedInAt, setSignInAge: (min: number) => setSignedInAt(new Date(now().getTime() - min * 60_000)), ageMin, stale, stepUp, pending, setPending, signInAgain, signout, setSignout, idleWarnAt, setIdleWarnAt, endWarn, setEndWarn,
    denied, setDenied, toasts, toast,
  };
  return api;
}
const describe = (g: Grant | null) => (g ? `${g.role} in ${scopeName(g.scope)}${g.via !== 'direct' ? ` through ${g.via}` : ''}` : 'no Role here');

export type Session = ReturnType<typeof useSessionValue>;
const Ctx = createContext<Session | null>(null);
export const SessionProvider = ({ children }: { children: ReactNode }) => <Ctx.Provider value={useSessionValue()}>{children}</Ctx.Provider>;
export const useSession = () => useContext(Ctx)!;

/** Reading follows Coverage (ADR 0012): a Rule whose source or destination Coverage touches the person's Scopes. An open Change set widens
 *  the view for its Authors and approvers to every Rule whose Coverage touches one of its Affected Zones. */
export function useReadFilter(rules: Rule[], affectedNames: string[], author: boolean) {
  const se = useSession();
  return useMemo(() => {
    if (!se.myZones) return { visible: null as Set<string> | null, through: new Set<string>(), seen: rules.length };
    const mine = se.myZones; const aff = new Set(author ? affectedNames.map(n => zoneByName.get(n)?.id).filter(Boolean) as string[] : []);
    const visible = new Set<string>(); const through = new Set<string>();
    for (const r of rules) {
      let own = false, wide = false;
      for (const id of [...r.src, ...r.dst]) { for (const z of ref(id).cov) { if (mine.has(z)) { own = true; break; } if (!wide && aff.has(z)) wide = true; } if (own) break; }
      if (own) visible.add(r.id); else if (wide) { visible.add(r.id); through.add(r.id); }
    }
    return { visible, through, seen: visible.size };
  }, [rules, se.myZones, affectedNames.join('|'), author]);
}

/** What the person may do with the current Change set, by Affected Zone (ADR 0012 and Grilling: Access, roles and audit, points 8 and 11). */
export function useGate(affected: { zone: string; env: string; level: Level }[], approvedBy: Record<string, string>) {
  const se = useSession();
  return useMemo(() => {
    const zs = affected.map(a => ({ a, z: zoneByName.get(a.zone)! })).filter(x => x.z);
    const lacksEditor = zs.filter(x => x.a.level === 'none' && (!se.zoneRole(x.z) || roleRank[se.zoneRole(x.z)!] < roleRank.editor));
    const needApproval = zs.filter(x => x.a.level !== 'none' && !approvedBy[x.a.env]);
    const lacksAdmin = needApproval.filter(x => se.zoneRole(x.z) !== 'admin');
    const names = (l: typeof zs) => l.slice(0, 3).map(x => x.z.name).join(', ') + (l.length > 3 ? ` +${l.length - 3}` : '');
    return {
      commit: lacksEditor.length ? `You cannot commit: at the level none you need the editor Role in every Affected Zone. Missing in ${lacksEditor.length}: ${names(lacksEditor)}.` : null,
      emergency: !needApproval.length ? null : lacksAdmin.length ? `Emergency Commit needs the admin Role in every Affected Zone whose Approval is missing. Missing in ${lacksAdmin.length}: ${names(lacksAdmin)}.` : null,
    };
  }, [affected, approvedBy, se.grants]);
}

// ---------- UI pieces

/** A small lock on buttons whose action asks for a sign-in from the last 15 minutes. */
export function StepUpLock() { const se = useSession(); const { t } = useT(); return se.stale() ? <span className="stepup-lock" title={t('Asks you to sign in again')}><LockClosed12Regular /></span> : null; }

export const PrincipalGlyph = ({ kind }: { kind: PrincipalKind }) => kind === 'group' ? <People16Regular className="pglyph" /> : kind === 'user' ? <Person16Regular className="pglyph" /> : kind === 'mi' ? <Key16Regular className="pglyph" /> : <Bot16Regular className="pglyph" />;
export const initials = (name: string) => name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

export function AccountButton({ onAccess }: { onAccess?: () => void }) {
  const se = useSession(); const { t } = useT(); const u = se.user;
  const ends = new Date(se.signedInAt.getTime() + ABS_H * 3600_000);
  return (
    <Popover positioning="after-bottom"><PopoverTrigger disableButtonEnhancement><button className="avatar" title={`${u.name}: ${t('your access')}`}>{initials(u.name)}</button></PopoverTrigger>
      <PopoverSurface className="acct">
        <div className="acct-h"><span className="avatar big">{initials(u.name)}</span><div><b>{u.name}</b><div className="muted">{u.upn}</div></div></div>
        <div className="acct-s">
          <div>{t('Signed in at')} <b>{hhmm(se.signedInAt)}</b>, {se.ageMin()} {t('minutes ago')}.{se.stale() && <> <LockClosed12Regular /> {t('Approvals, Emergency Commits and Role changes ask you to sign in again.')}</>}</div>
          <div className="muted">{t('Session ends at')} {hhmm(ends)} ({ABS_H} h), {t('or after 60 minutes without activity.')}</div>
        </div>
        <div className="panel-h">{t('Your Roles')}</div>
        {se.grants.length ? <table className="mini acct-r"><tbody>{se.grants.map((g, i) => <tr key={i}><td><span className={`role r-${g.role}`}>{t(g.role)}</span></td><td><b>{t(scopeName(g.scope))}</b> <span className="muted">{t(g.scope.kind === 'instance' ? '' : g.scope.kind === 'env' ? 'Environment' : g.scope.kind === 'sub' ? 'Subscription' : g.scope.kind === 'vnet' ? 'VNet' : 'Zone')}</span></td><td className="muted">{g.via === 'direct' ? t('direct') : g.entra ? g.via : `${t('through')} ${g.via}`}</td></tr>)}</tbody></table> : <p className="muted">{t('No Role.')}</p>}
        <p className="muted" style={{ margin: '8px 0 0' }}>{t('Group memberships are checked again every 15 minutes.')}</p>
        <div className="acct-f">{onAccess && <Button size="small" appearance="subtle" onClick={onAccess}>{t('Access')}</Button>}<span className="sp" />
          <Button size="small" onClick={() => se.signInAgain()}>{t('Sign in again')}</Button><Button size="small" icon={<SignOut20Regular />} onClick={() => se.setSignout('manual')}>{t('Sign out')}</Button></div>
      </PopoverSurface></Popover>
  );
}

/** Everything that sits above the console: step-up, denied actions, session warnings, sign-out and toasts. */
export function SessionLayer({ changeSet }: { changeSet: string }) {
  const se = useSession(); const { t } = useT(); const [, tick] = useState(0);
  useEffect(() => { const h = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(h); }, []);
  useEffect(() => { if (se.idleWarnAt && Date.now() >= se.idleWarnAt) { se.setIdleWarnAt(null); se.setSignout('idle'); } });
  const p = se.pending; const left = se.idleWarnAt ? Math.max(0, Math.round((se.idleWarnAt - Date.now()) / 1000)) : 0;
  const [waiting, setWaiting] = useState(false);
  return <>
    {p && (
      <div className="modal-bg"><div className="modal stepup" role="dialog" aria-label={t('Confirm your sign-in')}>
        <LockClosed16Regular className="mi" /><h2>{t('Confirm your sign-in')}</h2>
        <p><b>{t(p.what)}</b> {t('needs a sign-in from the last 15 minutes.')} {t('You signed in')} {se.ageMin()} {t('minutes ago.')}</p>
        <p className="muted">{t('Entra opens in a small window. Usually it only asks for your second factor. What you entered here stays, and the action continues after the sign-in.')}</p>
        <div className="modal-f">{waiting ? <Spinner size="tiny" label={t('Waiting for Entra…')} /> : <><Button onClick={() => se.setPending(null)}>{t('Cancel')}</Button>
          <Button appearance="primary" onClick={() => { setWaiting(true); se.signInAgain(() => { setWaiting(false); const run = p.run; se.setPending(null); run(); }); }}>{t('Sign in again')}</Button></>}</div>
      </div></div>
    )}
    {se.denied && (
      <div className="modal-bg" onMouseDown={() => se.setDenied(null)}><div className="modal denied" role="alertdialog" onMouseDown={e => e.stopPropagation()}>
        <ShieldError20Regular className="mi bad" /><h2>{t('Not allowed')}</h2>
        <p><b>{t(se.denied.what)}</b>: {t(se.denied.need)}</p>
        <p>{t('You hold')} {se.denied.have}.</p>
        <p className="muted">{t('If your Roles changed a moment ago: group memberships are checked again every 15 minutes. The attempt is recorded in the audit log.')}</p>
        <div className="modal-f"><Button appearance="primary" onClick={() => se.setDenied(null)}>{t('Close')}</Button></div>
      </div></div>
    )}
    {se.idleWarnAt && !se.signout && (
      <div className="sess-toast"><b>{t('You will be signed out in')} {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b>
        <span>{t('Nothing happened for 55 minutes. Your edits are safe in')} {changeSet}.</span>
        <Button size="small" appearance="primary" onClick={() => { se.setIdleWarnAt(null); se.toast(t('You stay signed in.')); }}>{t('Stay signed in')}</Button></div>
    )}
    {se.endWarn && !se.signout && (
      <div className="sess-toast"><b>{t('Your session ends at')} {hhmm(new Date(now().getTime() + 10 * 60_000))}</b>
        <span>{t('8 hours after your sign-in. Sign in again now to keep working without a break.')}</span>
        <div className="row"><Button size="small" appearance="subtle" onClick={() => se.setEndWarn(false)}>{t('Later')}</Button><Button size="small" appearance="primary" onClick={() => se.signInAgain()}>{t('Sign in again')}</Button></div></div>
    )}
    {se.signout && (
      <div className="signed-out"><div className="modal">
        <Brand /><h2>{t('Signed out')}</h2>
        <p>{t(se.signout === 'idle' ? 'After 60 minutes without activity.' : se.signout === 'absolute' ? '8 hours after your sign-in.' : 'You signed out.')}</p>
        {se.signout !== 'manual' && <p className="muted">{t('Nothing is lost: every edit is already in')} {changeSet}. {t('Signing in again usually needs no password.')}</p>}
        <div className="modal-f">{waiting ? <Spinner size="tiny" label={t('Waiting for Entra…')} /> : <Button appearance="primary" onClick={() => { setWaiting(true); se.signInAgain(() => setWaiting(false)); }}>{t('Sign in again')}</Button>}</div>
      </div></div>
    )}
    <div className="toasts">{se.toasts.map(x => <div key={x.id} className="toast"><Checkmark16Regular />{t(x.text)}</div>)}</div>
  </>;
}

/** The page for a principal without any Role: it says who is signed in and how to get access. */
export function NoAccessPage() {
  const se = useSession(); const { t } = useT(); const u = se.user; const [copied, setCopied] = useState('');
  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(what); setTimeout(() => setCopied(''), 1600); };
  const request = `Please assign me a Role in nsgfw.\nName: ${u.name}\nSign-in: ${u.upn}\nObject ID: ${u.oid}\nRole and Scope I need: `;
  return (
    <div className="noaccess">
      <div className="na-card">
        <Brand />
        <h1>{t('You have no access to nsgfw yet')}</h1>
        <p>{t('You are signed in as')} <b>{u.name}</b> ({u.upn}), {t('but you hold no Role in this instance.')} {t('Roles are assigned in nsgfw by its admins, not in Entra.')}</p>
        <div className="na-id"><span className="muted">{t('Your object ID')}</span><span className="mono">{u.oid}</span><button className="ib" title={t('Copy')} onClick={() => copy('oid', u.oid)}>{copied === 'oid' ? <Checkmark16Regular /> : <Copy16Regular />}</button></div>
        <div className="na-contact"><span className="muted">{t('Ask for access')}</span><span>{se.contact}</span></div>
        <div className="na-f"><Button appearance="primary" icon={copied === 'req' ? <Checkmark16Regular /> : <Copy16Regular />} onClick={() => copy('req', request)}>{t(copied === 'req' ? 'Copied' : 'Copy an access request')}</Button>
          <Button onClick={() => se.setSignout('manual')}>{t('Sign in with another account')}</Button></div>
        <p className="muted small">{t('This attempt is recorded in the audit log. Once an admin assigns you a Role, sign in again.')}</p>
      </div>
    </div>
  );
}
