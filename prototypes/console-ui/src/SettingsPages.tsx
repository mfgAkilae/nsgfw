// PROTOTYPE, throwaway. Settings and setup (issue 38): Environments with their settings and the onboarding step that shows the role
// assignments to create and checks them, the instance settings, and the alert channel. Settings are direct, audited changes; only the
// Internal address space is part of the Rule base and changes through a Change set.
import { StartRecovery } from './Recovery';   // issue 43
import { useState } from 'react';
import { DataContractSection } from './Deployments';   // issue 37
import { Button, Input, Switch, Textarea, Spinner } from '@fluentui/react-components';
import { Add16Regular, Dismiss12Regular, Checkmark16Filled, Dismiss16Filled, Warning16Filled, Copy16Regular, ArrowRight16Regular, ChevronLeft16Regular, Info16Regular, Send16Regular, LockClosed12Regular } from '@fluentui/react-icons';
import { useSession, AlertCfg, hhmm, now } from './session';
import { useStore } from './store';
import { envs, zones, Env } from './data';
import { permZones, toolPaths, destEnforced } from './access';
import { useT } from './i18n';

type Check = { role: string; at: string; state: 'ok' | 'bad' | 'off' | 'warn'; text: string; actions?: string[] };
const checksFor = (env: Env, pass = false): Check[] => env.id === 'prod' ? [
  { role: 'nsgfw Reader', at: 'mg-production', state: 'ok', text: '23 of 23 actions on 12 subscriptions' },
  { role: 'nsgfw Writer', at: 'mg-production', state: pass ? 'ok' : 'bad', text: pass ? '10 of 10 actions where Zones are' : `2 actions missing on the resource groups of ${permZones.filter(z => z.env === 'prod').length} Zones`, actions: pass ? undefined : ['Microsoft.Network/virtualNetworks/subnets/write', 'Microsoft.Network/networkSecurityGroups/join/action'] },
  { role: 'nsgfw ASG Writer', at: '—', state: 'off', text: 'Not assigned. Optional: only ASG objects with tool-written membership need it.' },
  { role: 'nsgfw Reader on the flow-data workspace', at: 'law-flowlogs-mgmt', state: 'ok', text: 'Reads NTANetAnalytics only, through a condition on the table' },
] : env.id === 'nonprod' ? [
  { role: 'nsgfw Reader', at: 'mg-nonproduction', state: pass ? 'ok' : 'warn', text: pass ? '23 of 23 actions' : '22 of 23 actions: the role definition is older than this version', actions: pass ? undefined : ['Microsoft.ResourceGraph/resourceChanges/read'] },
  { role: 'nsgfw Writer', at: '—', state: 'off', text: 'Not needed: in Terraform mode the repository pipeline writes to Azure.' },
  { role: 'nsgfw Reader on the flow-data workspace', at: 'law-flowlogs-mgmt', state: 'ok', text: 'Reads NTANetAnalytics only' },
] : [
  { role: 'nsgfw Reader', at: '12 subscriptions', state: 'ok', text: '23 of 23 actions' },
  { role: 'nsgfw Writer', at: '12 subscriptions', state: 'ok', text: '10 of 10 actions' },
  { role: 'nsgfw ASG Writer', at: '—', state: 'off', text: 'Not assigned. Optional.' },
];
const Mark = ({ s }: { s: Check['state'] }) => s === 'ok' ? <Checkmark16Filled className="b-green" /> : s === 'bad' ? <Dismiss16Filled className="b-red" /> : s === 'warn' ? <Warning16Filled className="b-amber" /> : <span className="offmark">–</span>;

function Snippet({ env, mode }: { env: string; mode: 'ARM' | 'Terraform' }) {
  const { t } = useT(); const [k, setK] = useState<'tf' | 'cli'>('tf'); const [copied, setCopied] = useState(false); const slug = env.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tf = `module "nsgfw_access_${slug.replace(/-/g, '_')}" {
  source         = "<nsgfw release>/infra/environment-access"
  environment    = "${env}"
  scope          = "/providers/Microsoft.Management/managementGroups/mg-${slug}"
  tool_identity  = "<principal ID of the Tool identity>"
  writer         = ${mode === 'ARM' ? 'true   # ARM mode: nsgfw writes NSGs' : 'false  # Terraform mode: your pipeline writes'}
  asg_writer     = false  # only for ASG objects with tool-written membership
  flow_workspace = "<resource ID of the Log Analytics workspace>"
}`;
  const cli = `SCOPE=/providers/Microsoft.Management/managementGroups/mg-${slug}
TOOL=<principal ID of the Tool identity>
az role assignment create --assignee-object-id $TOOL --assignee-principal-type ServicePrincipal \\
  --role "nsgfw Reader" --scope $SCOPE --condition-version 2.0 \\
  --condition "((!(ActionMatches{'Microsoft.OperationalInsights/workspaces/tables/data/read'})) OR (@Resource[Microsoft.OperationalInsights/workspaces/tables:name] StringEquals 'NTANetAnalytics'))"
${mode === 'ARM' ? 'az role assignment create --assignee-object-id $TOOL --assignee-principal-type ServicePrincipal \\\n  --role "nsgfw Writer" --scope $SCOPE' : '# Terraform mode: no Writer'}`;
  return (
    <div className="snip">
      <div className="snip-h"><div className="seg2"><button className={k === 'tf' ? 'on' : ''} onClick={() => setK('tf')}>Terraform</button><button className={k === 'cli' ? 'on' : ''} onClick={() => setK('cli')}>{t('Script')}</button></div>
        <span className="muted">{t('The owner of this management group runs it. nsgfw never assigns roles itself.')}</span><span className="sp" />
        <button className="ib" title={t('Copy')} onClick={() => { navigator.clipboard?.writeText(k === 'tf' ? tf : cli).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <Checkmark16Filled /> : <Copy16Regular />}</button></div>
      <pre>{k === 'tf' ? tf : cli}</pre>
    </div>
  );
}

function AccessChecks({ env, pass, onCheck, checking, at }: { env: Env; pass: boolean; onCheck: () => void; checking: boolean; at: string }) {
  const { t } = useT(); const list = checksFor(env, pass);
  return (
    <div>
      <table className="mini checks"><thead><tr><th></th><th>{t('Role')}</th><th>{t('Assigned at')}</th><th>{t('Result')}</th></tr></thead><tbody>
        {list.map(c => <tr key={c.role} className={`c-${c.state}`}><td><Mark s={c.state} /></td><td><b>{c.role}</b></td><td className="mono">{c.at}</td>
          <td>{t(c.text)}{c.actions && <div className="acts">{c.actions.map(a => <code key={a}>{a}</code>)}</div>}</td></tr>)}
      </tbody></table>
      <div className="check-f">{checking ? <Spinner size="tiny" label={t('Checking the effective permissions of the Tool identity…')} /> : <><Button size="small" onClick={onCheck}>{t('Check now')}</Button><span className="muted">{t('Last check')}: {at}. {t('Also runs daily, at Zone onboarding and before the first write of every Deployment.')}</span></>}</div>
    </div>
  );
}

// ---------- Environments
export function EnvironmentsPage({ onZones, initial }: { onZones: () => void; initial?: string }) {
  const se = useSession(); const { t } = useT(); const [sel, setSel] = useState<string | null>(initial ?? null); const [wizard, setWizard] = useState(false);
  const mine = envs.filter(e => se.seesScope({ kind: 'env', id: e.id }));
  if (wizard) return <AddEnvironment onClose={() => setWizard(false)} onZones={onZones} />;
  if (sel) return <EnvSettingsView env={envs.find(e => e.id === sel)!} onBack={() => setSel(null)} />;
  return <>
    <header className="phead"><h1>{t('Environments')}</h1><span className="sub">{t('Each Environment is a management group or a list of subscriptions, with its own settings.')}</span><span className="sp" />
      {se.instanceScope && se.isAdminAt({ kind: 'instance', id: 'instance' }) ? <Button appearance="primary" icon={<Add16Regular />} onClick={() => setWizard(true)}>{t('Add Environment')}</Button> : <span className="muted">{t('Only an instance admin adds Environments.')}</span>}</header>
    <div className="sheet pad"><table className="mini envs"><thead><tr><th>{t('Environment')}</th><th>{t('Defined by')}</th><th>{t('Deployment mode')}</th><th>{t('Zones')}</th><th>{t('Approval level')}</th><th>{t('Azure access')}</th><th>{t('Overwrite automatically')}</th><th>flushConnection</th><th></th></tr></thead><tbody>
      {mine.map(e => { const st = se.envSettings[e.id]; const cs = checksFor(e); const worst = cs.some(c => c.state === 'bad') ? 'bad' : cs.some(c => c.state === 'warn') ? 'warn' : 'ok';
        return <tr key={e.id} className="clickrow" onClick={() => setSel(e.id)}><td><b>{t(e.name)}</b></td><td className="muted">{t(st.def)}</td><td>{e.mode}</td><td>{zones.filter(z => z.env === e.id).length.toLocaleString()}</td>
          <td><span className={`lvl l-${se.levelOf({ kind: 'env', id: e.id }).level}`}>{t(se.levelOf({ kind: 'env', id: e.id }).level)}</span></td>
          <td><span className={`hst h-${worst}`}><Mark s={worst as Check['state']} />{t(worst === 'ok' ? 'complete' : worst === 'bad' ? 'actions missing' : 'outdated role')}</span></td>
          <td>{t(st.autoOverwrite ? 'On' : 'Off')}</td><td>{t(st.flush ? 'On' : 'Off')}</td><td className="r"><ArrowRight16Regular /></td></tr>; })}
    </tbody></table></div>
  </>;
}

function EnvSettingsView({ env, onBack }: { env: Env; onBack: () => void }) {
  const se = useSession(); const { t } = useT(); const st = se.envSettings[env.id]; const admin = se.isAdminAt({ kind: 'env', id: env.id });
  const [checking, setChecking] = useState(false); const [pass, setPass] = useState(false); const [at, setAt] = useState('today 06:00');
  const [draft, setDraft] = useState(st);
  const dirty = draft.naming !== st.naming || draft.rgPattern !== st.rgPattern || draft.hitsDays !== st.hitsDays || draft.repo !== st.repo || draft.branch !== st.branch || draft.pathPattern !== st.pathPattern || draft.applyTimeout !== st.applyTimeout;
  const lv = se.levelOf({ kind: 'env', id: env.id });
  return <>
    <header className="phead"><button className="lens-x" onClick={onBack}><ChevronLeft16Regular />{t('Environments')}</button><h1>{t(env.name)}</h1><span className="sub">{t(st.def)} · {env.mode} · {zones.filter(z => z.env === env.id).length.toLocaleString()} {t('Zones')}</span>
      <span className="sp" />{!admin && <span className="tag amber"><LockClosed12Regular /> {t('Read only: only an admin of this Environment changes its settings')}</span>}</header>
    <div className="sheet pad settings">
      <section className="set"><h3>{t('Azure access')}</h3><p className="muted">{t('The role assignments the Tool identity needs here. The operator creates them; nsgfw checks them.')}</p>
        <AccessChecks env={env} pass={pass} checking={checking} at={at} onCheck={() => { setChecking(true); setTimeout(() => { setChecking(false); setPass(true); setAt(`today ${hhmm(now())}`); }, 1500); }} />
        <details className="more"><summary>{t('Show what to run')}</summary><Snippet env={env.name} mode={env.mode} /></details></section>

      <section className="set"><h3>{t('Drift')}</h3>
        <div className="sw-row"><Switch disabled={!admin} checked={st.autoOverwrite} onChange={(_, d) => se.setEnv(env.id, { autoOverwrite: d.checked }, `Overwrite automatically ${d.checked ? 'on' : 'off'}`)} />
          <div><b>{t('Overwrite automatically')}</b><p className="muted">{t('Only two kinds of Drift: a subnet that lost its Managed NSG gets it back, and a Managed NSG whose marker tags were removed gets them back. Every other Drift waits for a person to Adopt or Overwrite it.')}</p></div></div></section>

      <section className="set"><h3>{t('Deployment')}</h3>
        <div className="sw-row"><Switch disabled={!admin} checked={st.flush} onChange={(_, d) => se.setEnv(env.id, { flush: d.checked }, `flushConnection ${d.checked ? 'on' : 'off'}`)} />
          <div><b>flushConnection</b> <span className="muted">{t('on every Managed NSG of this Environment')}</span>
            <p className="muted">{t(st.flush ? 'On: when a write closes a flow, Azure re-evaluates the connections that are already running, so they end at once. Switching it on re-evaluates every connection once.' : 'Off (default): a connection that a new NSG rule denies keeps running until it ends. The Review says so for every Change set that closes traffic here, because revoked access does not end running sessions.')}</p></div></div>
        <div className="frow"><label>{t('Deployment mode')}</label><div><b>{env.mode}</b> <span className="muted">{t('Fixed at onboarding.')}</span></div></div>
        <div className="frow"><label>{t('NSG naming pattern')}</label><Input disabled={!admin} value={draft.naming} onChange={(_, d) => setDraft({ ...draft, naming: d.value })} /></div>
        <div className="frow"><label>{t('Resource group pattern')}</label><Input disabled={!admin} value={draft.rgPattern} onChange={(_, d) => setDraft({ ...draft, rgPattern: d.value })} /></div>
        {env.mode === 'Terraform' && <>
          <div className="frow"><label>{t('Repository')}</label><Input disabled={!admin} value={draft.repo ?? ''} onChange={(_, d) => setDraft({ ...draft, repo: d.value })} /></div>
          <div className="frow"><label>{t('Base branch')}</label><Input disabled={!admin} value={draft.branch ?? ''} onChange={(_, d) => setDraft({ ...draft, branch: d.value })} /></div>
          <div className="frow"><label>{t('Path pattern')}</label><Input disabled={!admin} value={draft.pathPattern ?? ''} onChange={(_, d) => setDraft({ ...draft, pathPattern: d.value })} /></div>
          <div className="frow"><label>{t('Apply timeout')}</label><Input disabled={!admin} type="number" value={String(draft.applyTimeout ?? 120)} onChange={(_, d) => setDraft({ ...draft, applyTimeout: +d.value })} contentAfter={<span className="muted">min</span>} /></div>
          <div className="sw-row"><Switch disabled={!admin} checked={!!st.autoMerge} onChange={(_, d) => se.setEnv(env.id, { autoMerge: d.checked }, `Auto-merge ${d.checked ? 'on' : 'off'}`)} /><div><b>{t('Auto-merge')}</b><p className="muted">{t('nsgfw merges its approved pull requests under the branch protection of the repository.')}</p></div></div>
        </>}
      </section>

      {env.mode === 'Terraform' && <DataContractSection envId={env.id} />}

      <section className="set"><h3>{t('Flow data')}</h3>
        <div className="frow"><label>{t('Workspace')}</label><div className="mono">{st.workspace}</div></div>
        <div className="frow"><label>{t('Hits window')}</label><Input disabled={!admin} type="number" value={String(draft.hitsDays)} onChange={(_, d) => setDraft({ ...draft, hitsDays: +d.value })} contentAfter={<span className="muted">{t('days')}</span>} /></div></section>

      <section className="set"><h3>{t('Approval level')}</h3>
        <div className="frow"><label>{t('This Environment')}</label><div><span className={`lvl l-${lv.level}`}>{t(lv.level)}</span> <span className="muted">{t(lv.from.kind === 'env' ? 'set here' : 'the instance default')}. {t('Changed in Access, on the Scope tree.')}</span></div></div></section>

      {admin && dirty && <div className="savebar"><span>{t('Unsaved changes to the patterns or the hits window.')}</span><span className="sp" /><Button size="small" onClick={() => setDraft(st)}>{t('Undo')}</Button>
        <Button size="small" appearance="primary" onClick={() => se.setEnv(env.id, draft, 'Settings')}>{t('Save')}</Button></div>}
    </div>
  </>;
}

// ---------- Onboarding an Environment: an instance admin defines it; its owner creates the role assignments; nsgfw checks them.
function AddEnvironment({ onClose, onZones }: { onClose: () => void; onZones: () => void }) {
  const se = useSession(); const { t } = useT(); const [step, setStep] = useState(0);
  const [name, setName] = useState('Shared services'); const [def, setDef] = useState<'mg' | 'subs'>('mg'); const [mg, setMg] = useState('mg-shared'); const [mode, setMode] = useState<'ARM' | 'Terraform'>('ARM');
  const [checked, setChecked] = useState(0); const [checking, setChecking] = useState(false);
  const [auto, setAuto] = useState(true); const [flush, setFlush] = useState(false);
  const steps = ['Scope', 'Deployment mode', 'Azure access', 'Settings', 'Done'];
  const results: Check[] = [
    { role: 'nsgfw Reader', at: mg, state: checked ? 'ok' : 'off', text: checked ? '23 of 23 actions on 4 subscriptions' : 'not checked yet' },
    ...(mode === 'ARM' ? [{ role: 'nsgfw Writer', at: mg, state: (checked === 0 ? 'off' : checked === 1 ? 'bad' : 'ok') as Check['state'], text: checked === 0 ? 'not checked yet' : checked === 1 ? 'Missing on subscription sub-shared-04' : '10 of 10 actions on 4 subscriptions', actions: checked === 1 ? ['Microsoft.Network/networkSecurityGroups/write', 'Microsoft.Network/virtualNetworks/subnets/write'] : undefined }] : []),
  ];
  return <>
    <header className="phead"><button className="lens-x" onClick={onClose}><ChevronLeft16Regular />{t('Environments')}</button><h1>{t('Add Environment')}</h1><span className="sp" />
      <ol className="wsteps">{steps.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''}><i>{i < step ? '✓' : i + 1}</i>{t(s)}</li>)}</ol></header>
    <div className="sheet pad wizard">
      {step === 0 && <section className="set"><h3>{t('Name and Scope')}</h3>
        <div className="frow"><label>{t('Name')}</label><Input value={name} onChange={(_, d) => setName(d.value)} /></div>
        <div className="frow"><label>{t('Defined by')}</label><div className="seg2"><button className={def === 'mg' ? 'on' : ''} onClick={() => setDef('mg')}>{t('Management group')}</button><button className={def === 'subs' ? 'on' : ''} onClick={() => setDef('subs')}>{t('List of subscriptions')}</button></div></div>
        {def === 'mg' ? <div className="frow"><label>{t('Management group')}</label><Input value={mg} onChange={(_, d) => setMg(d.value)} /></div>
          : <div className="frow"><label>{t('Subscriptions')}</label><Textarea placeholder="sub-shared-01, sub-shared-02" /></div>}
        <p className="muted"><Info16Regular /> {t('Environments never share a subscription. A subscription that moves into this management group later joins this Environment; one that leaves it is flagged.')}</p></section>}
      {step === 1 && <section className="set"><h3>{t('Deployment mode')}</h3>
        <div className="role-pick two">{(['ARM', 'Terraform'] as const).map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}><b>{m}</b><span>{t(m === 'ARM' ? 'nsgfw writes NSGs, associations and ASGs through Azure Resource Manager.' : 'nsgfw writes a Data contract into your Terraform repository; your pipeline plans and applies.')}</span></button>)}</div>
        <p className="warnline"><Warning16Filled /> {t('The mode cannot change after onboarding.')}</p></section>}
      {step === 2 && <section className="set"><h3>{t('Create these role assignments')}</h3>
        <p className="muted">{t('Hand this to the owner of')} <b className="mono">{mg}</b>. {t('Then check them here. Zones can be onboarded only where the check passes.')}</p>
        <Snippet env={name} mode={mode} />
        <h3 style={{ marginTop: 18 }}>{t('Check')}</h3>
        <table className="mini checks"><tbody>{results.map(c => <tr key={c.role} className={`c-${c.state}`}><td><Mark s={c.state} /></td><td><b>{c.role}</b></td><td className="mono">{c.at}</td><td>{t(c.text)}{c.actions && <div className="acts">{c.actions.map(a => <code key={a}>{a}</code>)}</div>}</td></tr>)}</tbody></table>
        <div className="check-f">{checking ? <Spinner size="tiny" label={t('Checking…')} /> : <Button size="small" appearance={checked === 2 ? 'secondary' : 'primary'} onClick={() => { setChecking(true); setTimeout(() => { setChecking(false); setChecked(c => Math.min(2, c + 1)); }, 1300); }}>{t(checked ? 'Check again' : 'Check now')}</Button>}
          {checked === 1 && <span className="muted">{t('You can go on: Zones in sub-shared-04 cannot be onboarded until the Writer is there.')}</span>}</div></section>}
      {step === 3 && <section className="set"><h3>{t('Settings')}</h3>
        <div className="sw-row"><Switch checked={auto} onChange={(_, d) => setAuto(d.checked)} /><div><b>{t('Overwrite automatically')}</b> <span className="tag green">{t('proposed')}</span><p className="muted">{t('Lost subnet associations and marker tags only.')}</p></div></div>
        <div className="sw-row"><Switch checked={flush} onChange={(_, d) => setFlush(d.checked)} /><div><b>flushConnection</b><p className="muted">{t('Off by default: running connections end on their own.')}</p></div></div>
        <div className="frow"><label>{t('Approval level')}</label><div><span className="lvl l-four-eyes">{t('four-eyes')}</span> <span className="muted">{t('the instance default. Change it in Access after onboarding.')}</span></div></div></section>}
      {step === 4 && <section className="set done-step"><Checkmark16Filled className="b-green bigicon" /><h3>{name} {t('is an Environment')}</h3>
        <p className="muted">{t('Recorded in the audit log. Next: onboard its subnets as Zones, through a Change set.')}</p><Button appearance="primary" onClick={onZones}>{t('Onboard Zones')}</Button></section>}
      {step < 4 && <div className="wiz-f"><Button onClick={() => (step ? setStep(step - 1) : onClose())}>{t(step ? 'Back' : 'Cancel')}</Button><span className="sp" />
        <Button appearance="primary" disabled={step === 2 && !checked} onClick={() => { if (step === 3) se.log({ cat: 'setting', action: 'Added Environment', object: `${name} (${mode}, ${mg})`, scopes: [{ kind: 'instance', id: 'instance' }], result: 'ok' }); setStep(step + 1); }}>{t(step === 3 ? 'Add Environment' : 'Next')}</Button></div>}
      <p className="muted small">{t('Prototype: the check fails once on purpose, then passes.')}</p>
    </div>
  </>;
}

// ---------- Instance settings
export function InstanceSettings({ onReview }: { onReview: () => void }) {
  const se = useSession(); const s = useStore(); const { t } = useT(); const [add, setAdd] = useState(''); const [settle, setSettle] = useState(String(se.settle)); const [contact, setContact] = useState(se.contact);
  const admin = se.isAdminAt({ kind: 'instance', id: 'instance' }); const changed = s.edits.some(e => e.kind === 'setting' && e.ruleId === 'iasp');
  const valid = /^[0-9a-f:.]+\/\d{1,3}$/i.test(add.trim());
  return <>
    <header className="phead"><h1>{t('Instance')}</h1><span className="sub">{t('Settings for the whole instance.')}</span><span className="sp" />{!admin && <span className="tag amber"><LockClosed12Regular /> {t('Read only')}</span>}</header>
    <div className="sheet pad settings">
      <section className="set"><h3>{t('Internal address space')}</h3>
        <p className="muted">{t('The prefixes that count as internal. A Zone with the destination-enforced Egress posture lets outbound traffic to them pass, so the destination decides. It is part of the Rule base: a change goes into your Change set and needs Approval.')}</p>
        <div className="prefixes">{s.space.map(p => <span key={p} className="tok mono pfx">{p}{se.canEdit && <button title={t('Remove')} onClick={() => s.setSpace(s.space.filter(x => x !== p))}><Dismiss12Regular /></button>}</span>)}
          {se.canEdit && <span className="pfx-add"><Input size="small" placeholder="100.64.0.0/10" value={add} onChange={(_, d) => setAdd(d.value)} onKeyDown={e => { if (e.key === 'Enter' && valid) { s.setSpace([...s.space, add.trim()]); setAdd(''); } }} />
            <Button size="small" icon={<Add16Regular />} disabled={!valid} onClick={() => { s.setSpace([...s.space, add.trim()]); setAdd(''); }}>{t('Add')}</Button></span>}</div>
        <div className={`impact ${changed ? 'on' : ''}`}>{changed ? <><Warning16Filled /><span><b>{t('In Change set CHG-5120.')}</b> {t('It changes the egress allow of every destination-enforced Zone:')} {destEnforced.toLocaleString()} {t('Zones need their Approval. Translating it can take up to 60 seconds.')}</span><span className="sp" /><Button size="small" onClick={onReview}>{t('Review')}</Button></>
          : <span className="muted">{t('From Version')} {s.version}. {t('A change affects every destination-enforced Zone')} ({destEnforced.toLocaleString()}).</span>}</div></section>

      <section className="set"><h3>{t('Settle time')}</h3>
        <div className="frow"><label>{t('Wait after a write')}</label><Input disabled={!admin} type="number" value={settle} onChange={(_, d) => setSettle(d.value)} contentAfter={<span className="muted">s</span>} />
          {admin && +settle !== se.settle && <Button size="small" appearance="primary" onClick={() => se.setSettle(+settle)}>{t('Save')}</Button>}</div>
        <p className="muted">{t('Only writes ordered by a Crossing flow or by the ASG member steps wait this long after Azure reports the earlier write done. The nightly test fails when a measured lag exceeds half of it.')}</p></section>

      <section className="set"><h3>{t('Tool paths')}</h3><p className="muted">{t('Flows that nsgfw itself needs. A Change set that would close one asks the committer to confirm it with a reason.')}</p>
        <table className="mini"><thead><tr><th>{t('From')}</th><th>{t('What')}</th><th>{t('Destination')}</th><th>{t('Service')}</th><th></th></tr></thead><tbody>
          {toolPaths.map(p => <tr key={p.what}><td>{t(p.from === 'deployment' ? 'deployment' : 'added by an admin')}</td><td><b>{t(p.what)}</b></td><td className="mono">{p.dst}</td><td className="mono">{p.svc}</td><td className="muted">{p.reason ? t(p.reason) : ''}</td></tr>)}</tbody></table>
        {admin && <Button size="small" icon={<Add16Regular />} style={{ marginTop: 8 }}>{t('Add Tool path')}</Button>}</section>

      <section className="set"><h3>{t('Access contact')}</h3>
        <p className="muted">{t('Shown on the page for people without a Role, so they know whom to ask.')}</p>
        <div className="frow"><Textarea disabled={!admin} value={contact} onChange={(_, d) => setContact(d.value)} style={{ flex: 1 }} />{admin && contact !== se.contact && <Button size="small" appearance="primary" onClick={() => se.setContact(contact)}>{t('Save')}</Button>}</div></section>

      <section className="set"><h3>{t('Ingress')}</h3>
        <div className="frow"><label>{t('Exposure')}</label><div><b>{t('Public ingress with an IP filter')}</b> <span className="muted">· 198.51.100.0/24, 203.0.113.16/28, 192.0.2.10</span>
          <p className="muted">{t('Set in the instance Terraform module. nsgfw cannot change its own ingress; the default is private.')}</p></div></div></section>

      <StartRecovery />   {/* issue 43 */}
      <section className="set"><h3>{t('Identity')}</h3>
        <dl className="kv wide"><dt>{t('Instance ID')}</dt><dd className="mono">a1c4e9f2-63d0-4b7e-9e1a-5f0c2b8d7a31</dd>
          <dt>{t('Tool identity')}</dt><dd>{se.onPrem ? t('Service principal of the app registration, certificate from a PEM file') : t('User-assigned managed identity, also the federated credential of the app registration')} <span className="mono muted">· {t('object ID')} 5e7f…c03a</span></dd>
          <dt>{t('Runtime')}</dt><dd>{se.onPrem ? 'Docker Compose' : 'Azure Container Apps'} · nsgfw 1.0.3 · {t('schema')} 47</dd></dl></section>
    </div>
  </>;
}

// ---------- Alert channel
const deliveries = [{ at: '09:41', what: 'Deployment failed: Version 1289 to Production', ok: true }, { at: '06:00', what: 'Permission check: 2 actions missing in Production', ok: true }, { at: 'yesterday 22:13', what: 'Re-translation prepared for nsgfw 1.0.3', ok: true }, { at: 'yesterday 03:12', what: 'Audit chain verified', ok: true }];
export function AlertChannel() {
  const se = useSession(); const { t } = useT(); const [a, setA] = useState<AlertCfg>(se.alert); const [test, setTest] = useState<null | 'sending' | 'ok'>(null);
  const admin = se.isAdminAt({ kind: 'instance', id: 'instance' }); const dirty = JSON.stringify(a) !== JSON.stringify(se.alert);
  return <>
    <header className="phead"><h1>{t('Alert channel')}</h1><span className="sub">{t('Where nsgfw sends what must not wait for a sign-in: failed Deployments, missing permissions, a broken audit chain, Recovery mode.')}</span></header>
    <div className="sheet pad settings">
      <section className="set"><h3>{t('Channel')}</h3>
        <div className="seg2">{(['none', 'mail', 'webhook'] as const).map(k => <button key={k} disabled={!admin} className={a.kind === k ? 'on' : ''} onClick={() => setA({ ...a, kind: k })}>{t({ none: 'None', mail: 'E-mail', webhook: 'Webhook' }[k])}</button>)}</div>
        {a.kind === 'none' && <p className="warnline"><Warning16Filled /> {t('Without a channel, alerts reach only the in-app inbox. The health view warns until one is set up.')}</p>}
        {a.kind === 'mail' && <>
          <div className="frow"><label>{t('Send through')}</label><div className="seg2"><button className={a.mailVia === 'smtp' ? 'on' : ''} onClick={() => setA({ ...a, mailVia: 'smtp' })}>SMTP</button><button className={a.mailVia === 'graph' ? 'on' : ''} onClick={() => setA({ ...a, mailVia: 'graph' })}>Microsoft Graph</button></div></div>
          {a.mailVia === 'smtp' ? <><div className="frow"><label>{t('Server')}</label><Input value={a.smtpHost} onChange={(_, d) => setA({ ...a, smtpHost: d.value })} /></div>
            <div className="frow"><label>{t('Password')}</label><div><span className="mono">nsgfw-smtp-password</span> <span className="muted">{t('a secret in Key Vault; nsgfw reads it and never shows it')}</span></div></div></>
            : <div className="frow"><label>{t('Mailbox')}</label><div><Input value={a.mailbox} onChange={(_, d) => setA({ ...a, mailbox: d.value })} /><p className="muted">{t('An Exchange admin grants Mail.Send for this one mailbox through RBAC for Applications. Never a tenant-wide grant.')}</p></div></div>}
          <div className="frow"><label>{t('From')}</label><Input value={a.from} onChange={(_, d) => setA({ ...a, from: d.value })} /></div>
          <div className="frow"><label>{t('To')}</label><Input value={a.to} onChange={(_, d) => setA({ ...a, to: d.value })} /></div></>}
        {a.kind === 'webhook' && <>
          <div className="frow"><label>{t('Format')}</label><div className="seg2"><button className={a.format === 'teams' ? 'on' : ''} onClick={() => setA({ ...a, format: 'teams' })}>Teams Workflows</button><button className={a.format === 'json' ? 'on' : ''} onClick={() => setA({ ...a, format: 'json' })}>{t('Generic JSON')}</button></div></div>
          <div className="frow"><label>{t('URL')}</label><div><Input className="mono" value={a.secret} onChange={(_, d) => setA({ ...a, secret: d.value })} contentBefore={<span className="muted">Key Vault:</span>} />
            <p className="muted">{t('The URL is a secret: it carries its signature, and whoever has it can post. Store it in Key Vault under this name.')}</p></div></div>
          {a.format === 'teams' && <p className="muted"><Info16Regular /> {t('A workflow belongs to the person who made it and stops when that person leaves. Add a co-owner in Teams.')}</p>}</>}
        <div className="check-f">{a.kind !== 'none' && (test === 'sending' ? <Spinner size="tiny" label={t('Sending…')} /> : <Button size="small" icon={<Send16Regular />} onClick={() => { setTest('sending'); setTimeout(() => setTest('ok'), 1200); }}>{t('Send a test alert')}</Button>)}
          {test === 'ok' && <span className="okline"><Checkmark16Filled /> {t('Delivered at')} {hhmm(now())}. {t(a.kind === 'webhook' ? 'The webhook answered 202.' : 'The server accepted the message.')}</span>}
          <span className="sp" />{admin && dirty && <><Button size="small" onClick={() => setA(se.alert)}>{t('Undo')}</Button><Button size="small" appearance="primary" onClick={() => se.setAlert(a)}>{t('Save')}</Button></>}</div></section>
      <section className="set"><h3>{t('Last deliveries')}</h3>
        <table className="mini"><tbody>{deliveries.map(d => <tr key={d.at}><td className="mono">{t(d.at)}</td><td>{t(d.what)}</td><td>{d.ok ? <span className="okline"><Checkmark16Filled /> {t('delivered')}</span> : <span className="b-red">{t('failed')}</span>}</td></tr>)}</tbody></table></section>
    </div>
  </>;
}
