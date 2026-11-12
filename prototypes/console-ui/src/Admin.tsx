// PROTOTYPE, throwaway. One Admin entry in the rail (issue 38): Setup, Access, Audit log, Health and the settings, each shown only to the
// Roles that may use it. A viewer sees only the audit log of their Scopes, so their rail entry reads "Audit".
import { useState } from 'react';
import { Button } from '@fluentui/react-components';
import { Checkmark16Filled, Dismiss16Filled, Warning16Filled, Circle16Regular, ArrowRight16Regular, ChevronDown12Regular, ChevronRight12Regular, Copy16Regular } from '@fluentui/react-icons';
import { useSession } from './session';
import { problems, Health, Problem, INSTANCE, instanceAdmins, permZones } from './access';
import { zones } from './data';
import { AccessPage } from './AccessPage';
import { AuditPage } from './AuditPage';
import { EnvironmentsPage, InstanceSettings, AlertChannel } from './SettingsPages';
import { useT } from './i18n';
import './admin.css';
import { useRec, openCount } from './rec43';   // issue 43

export type AdminSec = 'setup' | 'access' | 'audit' | 'health' | 'envs' | 'instance' | 'alert';
export function useAdminNav() {
  const se = useSession(); const instAdmin = se.isAdminAt(INSTANCE);
  const secs: AdminSec[] = [];
  if (instAdmin && !se.setupHidden) secs.push('setup');
  if (se.anyAdmin) secs.push('access');
  secs.push('audit');
  if (se.instanceScope || se.anyAdmin) secs.push('health');
  if (se.anyAdmin) secs.push('envs');
  if (se.anyAdmin || se.instanceScope) secs.push('instance');
  if (instAdmin) secs.push('alert');
  const list = problems(se.onPrem, se.chainBroken, se.alert.kind === 'none').filter(p => se.instanceScope || (p.zones?.some(z => se.myZones?.has(z.id)) ?? false));
  const worst: Health = !secs.includes('health') ? 'ok' : list.some(p => p.level === 'bad') ? 'bad' : list.some(p => p.level === 'warn') ? 'warn' : 'ok';
  return { secs, label: secs.length === 1 ? 'Audit' : 'Admin', worst, list };
}
const secLabel: Record<AdminSec, string> = { setup: 'Setup', access: 'Access', audit: 'Audit log', health: 'Health', envs: 'Environments', instance: 'Instance', alert: 'Alert channel' };

export function AdminPage({ sec, setSec, onZones, onRule, onReview }: { sec: AdminSec; setSec: (s: AdminSec) => void; onZones: () => void; onRule: (id: string) => void; onReview: () => void }) {
  const { t } = useT(); const nav = useAdminNav(); const cur = nav.secs.includes(sec) ? sec : nav.secs[0];
  const [envSel, setEnvSel] = useState<string | undefined>();
  const go = (s: AdminSec, env?: string) => { setEnvSel(env); setSec(s); };
  return (
    <div className="adminpage">
      {nav.secs.length > 1 && <nav className="subnav" aria-label={t('Admin')}>
        {nav.secs.map(s => <button key={s} className={cur === s ? 'on' : ''} onClick={() => go(s)}>{t(secLabel[s])}{s === 'health' && nav.worst !== 'ok' && <i className={`hdot h-${nav.worst}`} />}{s === 'setup' && <SetupCount />}</button>)}
      </nav>}
      <div className="admin-b">
        {cur === 'setup' && <SetupPage go={go} onZones={onZones} />}
        {cur === 'access' && <AccessPage />}
        {cur === 'audit' && <AuditPage onRule={onRule} />}
        {cur === 'health' && <HealthPage go={go} list={nav.list} />}
        {cur === 'envs' && <EnvironmentsPage key={envSel ?? 'list'} initial={envSel} onZones={onZones} />}
        {cur === 'instance' && <InstanceSettings onReview={onReview} />}
        {cur === 'alert' && <AlertChannel />}
      </div>
    </div>
  );
}

// ---------- Setup: a checklist for a new instance, shown until everything is done. Each step opens the normal page for its setting.
type StepState = 'done' | 'open' | 'bad' | 'info';
function useSetup() {
  const se = useSession();
  const steps: { id: string; title: string; text: string; state: StepState; go?: [AdminSec, string?] | 'zones' }[] = [
    { id: 'signin', title: 'Sign in with the Entra app role InstanceAdmin', text: `${instanceAdmins.length} principals hold it in Entra. It can never be removed in nsgfw, so the instance cannot lock itself out.`, state: 'done' },
    { id: 'env', title: 'Onboard the first Environment', text: 'Production, ARM mode, management group mg-production.', state: 'done', go: ['envs'] },
    { id: 'roles', title: 'Check the Azure role assignments of the Tool identity', text: `The nsgfw Writer is missing on the resource groups of ${permZones.filter(z => z.env === 'prod').length} Zones in Production. Deployments there stop before their first write.`, state: 'bad', go: ['envs', 'prod'] },
    { id: 'level', title: 'Choose the Approval level', text: `Production: ${se.levelOf({ kind: 'env', id: 'prod' }).level}. The small profile offers none, so an editor of a Zone commits directly.`, state: 'done', go: ['access'] },
    { id: 'alert', title: 'Set up the alert channel', text: se.alert.kind === 'none' ? 'Not set up. Alerts reach only the in-app inbox.' : `${se.alert.kind === 'mail' ? 'E-mail' : se.alert.format === 'teams' ? 'Teams Workflows webhook' : 'JSON webhook'}, last test delivered.`, state: se.alert.kind === 'none' ? 'open' : 'done', go: ['alert'] },
    { id: 'overwrite', title: 'Overwrite lost subnet associations and marker tags automatically', text: se.envSettings.prod.autoOverwrite ? 'On in Production.' : 'Proposed for Production. Without it, a subnet that lost its Managed NSG stays open until someone overwrites the Drift.', state: se.envSettings.prod.autoOverwrite ? 'done' : 'open', go: ['envs', 'prod'] },
    { id: 'assign', title: 'Assign Roles to your teams', text: `${se.assignments.length} Role assignments in ${new Set(se.assignments.map(a => a.scope.kind)).size} kinds of Scope.`, state: 'done', go: ['access'] },
    { id: 'ingress', title: 'Ingress', text: 'Public ingress with an IP filter, 3 ranges. Set in the instance Terraform module; shown here only.', state: 'info', go: ['instance'] },
    { id: 'zones', title: 'Onboard the first Zones', text: `${zones.length.toLocaleString()} Zones are onboarded.`, state: 'done', go: 'zones' },
  ];
  return steps;
}
function SetupCount() { const steps = useSetup(); const left = steps.filter(s => s.state === 'open' || s.state === 'bad').length; return left ? <i className="scount">{left}</i> : null; }
function SetupPage({ go, onZones }: { go: (s: AdminSec, env?: string) => void; onZones: () => void }) {
  const se = useSession(); const { t } = useT(); const steps = useSetup(); const done = steps.filter(s => s.state === 'done' || s.state === 'info').length;
  return <>
    <header className="phead"><h1>{t('Setup')}</h1><span className="sub">{t('What a new instance needs before people work in it. This page stays until every step is done.')}</span></header>
    <div className="sheet pad setup">
      <div className="prog"><div className="prog-b"><b style={{ width: `${(done / steps.length) * 100}%` }} /></div><span><b>{done}</b> {t('of')} {steps.length} {t('done')}</span></div>
      <ol className="setup-steps">{steps.map((s, i) => (
        <li key={s.id} className={`st-${s.state}`}>
          <span className="st-i">{s.state === 'done' ? <Checkmark16Filled /> : s.state === 'bad' ? <Dismiss16Filled /> : s.state === 'info' ? <Checkmark16Filled /> : <Circle16Regular />}</span>
          <div><b>{i + 1}. {t(s.title)}</b><p>{t(s.text)}</p></div>
          {s.go && <Button size="small" appearance={s.state === 'open' || s.state === 'bad' ? 'primary' : 'subtle'} icon={<ArrowRight16Regular />} iconPosition="after" onClick={() => (s.go === 'zones' ? onZones() : go(s.go![0], s.go![1]))}>{t(s.state === 'open' || s.state === 'bad' ? 'Fix' : 'Open')}</Button>}
        </li>))}</ol>
      <div className="setup-f"><span className="muted">{t('Done, or a step not needed here? An instance admin can hide this page.')}</span><span className="sp" /><Button size="small" onClick={() => se.setSetupHidden(true)}>{t('Hide Setup')}</Button></div>
    </div>
  </>;
}

// ---------- Health: one status per check, then only the problems, grouped by what is missing.
function HealthPage({ go, list }: { go: (s: AdminSec, env?: string) => void; list: Problem[] }) {
  const se = useSession(); const { t } = useT(); const [open, setOpen] = useState<Set<string>>(new Set(['subnetwrite']));
  const lvl = (check: string): Health => list.some(p => p.check === check && p.level === 'bad') ? 'bad' : list.some(p => p.check === check && p.level === 'warn') ? 'warn' : 'ok';
  const rec = useRec();
  const checks: { id: string; name: string; state: Health; text: string; at: string }[] = [
    { id: 'azure', name: 'Azure permissions', state: lvl('azure'), text: lvl('azure') === 'ok' ? 'Complete in every Environment' : `${list.filter(p => p.check === 'azure').length} actions missing`, at: 'daily 06:00 and before each Deployment' },
    { id: 'graph', name: 'Microsoft Graph', state: lvl('graph'), text: '3 of 3 permissions granted', at: 'every 15 minutes' },
    { id: 'cert', name: 'Certificate', state: lvl('cert'), text: se.onPrem ? 'expires in 23 days' : 'none needed: managed identity', at: 'daily' },
    { id: 'alert', name: 'Alert channel', state: lvl('alert'), text: se.alert.kind === 'none' ? 'not set up' : 'last delivery 09:41', at: 'on every alert' },
    { id: 'schema', name: 'Database schema', state: 'ok', text: 'version 47, as the app expects', at: 'at start' },
    { id: 'chain', name: 'Audit chain', state: lvl('chain'), text: se.chainBroken ? 'broken at entry 1,284,977' : 'intact, verified 03:12', at: 'daily 03:00' },
    { id: 'recovery', name: 'Recovery mode', state: rec.on ? 'warn' : 'ok', text: rec.on ? `on since ${rec.since}, ${openCount(rec)} differences open` : 'off', at: 'at start and in the daily reconcile' },   // issue 43
  ];
  const toggle = (id: string) => setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <>
    <header className="phead"><h1>{t('Health')}</h1><span className="sub">{t('Whether nsgfw itself works: its permissions, its credentials, its alerts and its audit chain.')}</span></header>
    <div className="hstrip">{checks.map(c => (
      <button key={c.id} className={`hcheck h-${c.state}`} onClick={() => document.getElementById(`hp-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
        <span className="hc-h">{c.state === 'ok' ? <Checkmark16Filled /> : c.state === 'bad' ? <Dismiss16Filled /> : <Warning16Filled />}<b>{t(c.name)}</b></span><span className="hc-t">{t(c.text)}</span><span className="hc-a">{t(c.at)}</span></button>))}</div>
    {!se.instanceScope && <p className="muted" style={{ margin: '0 0 10px' }}>{t('You see the problems in your Scopes. Instance-wide checks are shown to Roles in the instance Scope.')}</p>}
    <div className="sheet pad hprob">
      {!list.length && <div className="empty"><Checkmark16Filled className="b-green" /><b>{t('Nothing to fix.')}</b></div>}
      {list.map(p => (
        <div key={p.id} id={`hp-${p.check}`} className={`prob p-${p.level}`}>
          <div className="prob-h" onClick={() => toggle(p.id)}>{p.zones?.length ? (open.has(p.id) ? <ChevronDown12Regular /> : <ChevronRight12Regular />) : <span style={{ width: 12 }} />}
            <span className="prob-i">{p.level === 'bad' ? <Dismiss16Filled /> : <Warning16Filled />}</span>
            <div className="prob-t"><b className={p.title.startsWith('Microsoft.') ? 'mono' : ''}>{t(p.title)}</b><span>{t(p.where)}</span></div>
            {p.link && <Button size="small" icon={<ArrowRight16Regular />} iconPosition="after" onClick={e => { e.stopPropagation(); go(p.link!, p.link === 'envs' ? (p.id === 'rgread' ? 'nonprod' : 'prod') : undefined); }}>{t(p.link === 'access' ? 'Open Access' : p.link === 'alert' ? 'Set up' : 'Open Environment')}</Button>}</div>
          <div className="prob-b"><p><b>{t('Effect')}:</b> {t(p.effect)}</p><p><b>{t('Fix')}:</b> {t(p.fix)}</p>
            {p.actions && p.actions.length > 1 && <div className="acts">{p.actions.map(a => <code key={a}>{a}</code>)}<button className="ib" title={t('Copy')} onClick={() => navigator.clipboard?.writeText(p.actions!.join('\n')).catch(() => {})}><Copy16Regular /></button></div>}
            {open.has(p.id) && p.zones && <div className="prob-z">{p.zones.filter(z => se.instanceScope || se.myZones?.has(z.id)).slice(0, 40).map(z => <span key={z.id} className="tok"><span className="tl">{z.name}</span><span className="muted mono">{z.sub}</span></span>)}{p.zones.length > 40 && <span className="muted">+{p.zones.length - 40}</span>}</div>}</div>
        </div>))}
      <p className="muted small" style={{ marginTop: 16 }}>{t('The same detail is in the API for every Role in the instance Scope, so a monitoring identity needs no admin rights. The health port itself answers only with a status code.')}</p>
    </div>
  </>;
}
