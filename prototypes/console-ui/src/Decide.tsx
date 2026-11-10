// PROTOTYPE, throwaway. Issue 36: other Change sets on the Review screen. An approver decides there (approve or reject, with the
// Preview an earlier approver saw against the fresh one); a Revert, a Restore, a rejected Change set and a Re-translation open there too.
// Each one gets its own in-memory store, seeded step by step through the same API as the console.
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea, MessageBar, MessageBarBody, MessageBarTitle, Spinner } from '@fluentui/react-components';
import { CheckmarkCircle16Filled, Clock16Regular, PersonLock16Regular, Flash16Regular, ArrowUndo16Regular, History16Regular, Bot16Regular } from '@fluentui/react-icons';
import { useStoreValue, useStore as useCsStore, Ctx, Store, Preview } from './store';
import { envs, zones, rules as baseRules, entries, isFolder, Rule, Level } from './data';
import { useFlow, CsScope, useCsId, FlowWatch, nowLabel, Flow } from './flow';
import { usePreview, useApproval, WriteOrderView, ApprovalView, PolicyView } from './ChangeViews';
import { CsButtons } from './Commit';
import { RebaseScreen } from './Rebase';
import { Review } from './Review';
import { byN, restoreSteps, restoreFolders, fid } from './versions36';
import { useT } from './i18n';

type Kind = 'approval' | 'emergency' | 'rejected' | 'retranslation' | 'revert' | 'restore' | 'view';
type Step = (s: Store) => void;
interface Spec { id: string; name: string; owner: string; authors: string[]; kind: Kind; steps: Step[]; banner?: ReactNode; decide: boolean; base: number }
const ME_APPROVER = ['prod', 'nonprod'];   // "you" hold the approver Role in Production and Non-production; Sandbox needs none.

// The smallest Folder, so the Folder move in kim's Change set stays readable.
const smallFolder = (() => { const n = new Map<string, number>(); entries.forEach(e => { if (!isFolder(e) && (e as Rule).folder) n.set((e as Rule).folder!, (n.get((e as Rule).folder!) ?? 0) + 1); });
  return [...n].filter(([id]) => id > 'F04').sort((a, b) => a[1] - b[1])[0][0]; })();

function specFor(id: string, f: Flow, t: (k: string) => string): Spec {
  let nid = '';
  const shape = (fields: Partial<Rule>): Step => s => Object.entries(fields).forEach(([k, v]) => s.editField(nid, k as keyof Rule, v));
  const exp8 = baseRules.filter(r => r.expiry && r.action === 'allow').slice(0, 8).map(r => r.id);
  if (id === 'cs-2') return { id, name: 'Q4 cleanup of expired Rules', owner: 'kim', authors: ['kim'], kind: 'approval', decide: true, base: 1288,
    steps: [s => s.setEnabled([...exp8.slice(0, 5), 'R90003'], false), s => s.remove(baseRules.filter(r => r.hits === 0).slice(0, 2).map(r => r.id)),
      s => { nid = s.addRule('R90001', 'F01'); }, shape({ name: 'Block RDP to jump hosts', src: ['any'], dst: ['zone:z0001-jump'], svc: ['svc-rdp'], action: 'deny', enabled: true, ticket: 'CHG-5233', comment: 'Only the admin network may reach the jump hosts' }),
      s => s.renameFolder('F01', 'App0042 go-live'), s => s.move(['F01'], 'F02', 'after'), s => s.deleteFolder('F02'), s => s.submit(), s => s.approveAs('jo', ['nonprod'])] };
  if (id === 'cs-3') return { id, name: 'Partner VPN access', owner: 'sam', authors: ['sam', 'jo'], kind: 'view', decide: false, base: 1288,
    steps: [s => { nid = s.addRule('R90006'); }, shape({ name: 'Partner VPN to the API', src: ['n9'], dst: ['zone:z0042-api'], svc: ['svc-https'], action: 'allow', enabled: true, ticket: 'CHG-5240' }), s => s.submit(), s => s.approveAs('kim', ['prod', 'nonprod'])],
    banner: <div className="bn ok"><CheckmarkCircle16Filled /> {t('Approved. sam scheduled the Commit for today 22:00 in the instance time zone. An Author or an admin can move or cancel it.')}</div> };
  if (id === 'cs-4') return { id, name: 'Onboard vnet-app0107', owner: 'alex', authors: ['alex'], kind: 'view', decide: false, base: 1286,
    steps: [s => { nid = s.addRule(); }, shape({ name: 'app0107 web from Front Door', src: ['tag:AzureFrontDoor.Backend'], dst: ['zone:z0107-web'], svc: ['svc-https'], action: 'allow', enabled: true })],
    banner: <div className="bn amber"><Clock16Regular /> {t('Open, based on Version 1286, two Versions behind. Its Rebase has 2 conflicts that one of its Authors resolves.')}</div> };
  if (id === 'cs-5') return { id, name: 'Hotfix: block ext-partner-0339', owner: 'sam', authors: ['sam'], kind: 'emergency', decide: true, base: 1286,
    steps: [s => s.editField('R90001', 'src', ['n3', 'n339']), s => s.commit('Active scan from a partner network against the web tier, INC-2211')],
    banner: <div className="bn red"><Flash16Regular /> {t('Emergency Commit by sam, yesterday 09:41, Version 1287: “Active scan from a partner network against the web tier, INC-2211”. It is in Azure and needs an Approval afterwards. If you reject it, the tool prepares a Revert of Version 1287 for normal Approval; it never reverts on its own.')}</div> };
  if (id === 'cs-6') return { id, name: 'Open RDP for vendor', owner: 'you', authors: ['you'], kind: 'rejected', decide: false, base: 1288,
    steps: [s => { nid = s.addRule(); }, shape({ name: 'Open RDP for vendor', src: ['tag:Internet'], dst: ['zone:z0001-jump'], svc: ['svc-rdp'], action: 'allow', enabled: true, ticket: 'CHG-5301', comment: 'Vendor maintenance' })],
    banner: <div className="bn red"><PersonLock16Regular /> {t('jo rejected this on 2026-11-09 16:02: “Use the jump hosts, not RDP from the Internet.” It is Open again and keeps no Approvals.')}</div> };
  if (id === 'rt-1') return { id, name: 'Re-translation for engine 1.6.0', owner: 'nsgfw', authors: ['nsgfw'], kind: 'retranslation', decide: true, base: f.latest, steps: [s => s.submit()] };
  const c = f.created.find(x => x.id === id)!; const v = byN(c.of)!; const tool = c.author === 'nsgfw';
  if (c.kind === 'revert') return { id, name: `Revert Version ${v.n}`, owner: c.author, authors: [c.author], kind: tool ? 'approval' : 'revert', decide: tool, base: f.latest,
    steps: [...(v.conflict ? [] : v.revert ?? []), ...(tool ? [(s: Store) => s.submit()] : [])],
    banner: <div className={`bn ${v.conflict ? 'red' : 'info'}`}>{tool ? <Bot16Regular /> : <ArrowUndo16Regular />} <span>{tool ? t('The tool prepared this after the Emergency Commit was rejected. The tool is its Author, so any approver satisfies four-eyes. ') : ''}
      {t('Undoes the edits of Version')} {v.n} (“{v.name}”, {v.by}) {t('on top of Version')} {f.latest}{t(', Folder edits included.')}{v.conflict ? <><br /><b>{t('Conflict')}:</b> {t(v.conflict)}</> : null}</span></div> };
  return { id, name: `Restore to Version ${v.n}`, owner: c.author, authors: [c.author], kind: 'restore', decide: false, base: f.latest, steps: restoreSteps(v.n),
    banner: <div className="bn info"><History16Regular /> <span>{t('Returns the Rule base to Version')} {v.n}: {t('Rules, Objects, Zones, Folders and ASG members. Azure facts adopted since then stay. Folders created since then are removed; their Rules stay in place.')}
      {restoreFolders(v.n).length > 0 && <ul className="cd-l">{restoreFolders(v.n).map(x => <li key={x}>{x}</li>)}</ul>}</span></div> };
}

// What jo saw: the Preview stored with jo's Approval, against the fresh one after the clean Rebase onto Version 1288.
function ChangedSince({ pv }: { pv: Preview }) {
  const { t } = useT(); const [open, setOpen] = useState(false); const s = useCsStore();
  const by = s.approvedBy.nonprod; const n = pv.nsgs.find(x => x.env === 'nonprod');
  if (!by || by === 'you' || !n) return null;
  const ops = n.ops.slice(0, 3);
  const nr = ops.length === 1 ? 'NSG rule' : 'NSG rules';
  return (
    <div className="bn amber"><Clock16Regular /><span>{by} {t('approved Non-production at Version 1287. Since then the Change set rebased cleanly onto 1288, and the Preview changed in')} {ops.length} {t(nr)}. {t('The Approval stays.')} <a className="link" onClick={() => setOpen(!open)}>{t(open ? 'Hide' : 'Show what changed')}</a>
      {open && <table className="mini"><thead><tr><th>{t('Managed NSG')}</th><th>{t('NSG rule')}</th><th>{by} {t('saw')}</th><th>{t('Now')}</th></tr></thead>
        <tbody>{ops.map((o, i) => <tr key={i}><td className="mono">{n.nsg}</td><td className="mono">{o.name}</td><td>{t('priority')} {o.priority - 10}</td><td><b>{t('priority')} {o.priority}</b></td></tr>)}</tbody></table>}</span></div>
  );
}

function StepUp({ open, onDone, onClose }: { open: boolean; onDone: () => void; onClose: () => void }) {
  const { t } = useT(); const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 440 }}><DialogBody><DialogTitle>{t('Sign in again')}</DialogTitle>
        <DialogContent><p className="cd-p">{t('An Approval needs a sign-in that is at most 15 minutes old. You signed in 52 minutes ago. Entra ID applies your Conditional Access and MFA.')}</p></DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={busy} icon={busy ? <Spinner size="tiny" /> : undefined} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onDone(); }, 700); }}>{t('Sign in with Entra ID')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

// The approver's decision. One Approval counts for every Affected Zone in which the approver holds the approver Role.
function DecisionBlock({ pv, spec, rows }: { pv: Preview; spec: Spec; rows?: { env: (typeof envs)[number]; zones: { zone: string; env: string; level: Level }[] }[] }) {
  const s = useCsStore(); const f = useFlow(); const cs = useCsId(); const { t } = useT(); const a = useApproval(pv);
  const [dlg, setDlg] = useState<null | 'stepup' | 'reject'>(null); const [why, setWhy] = useState('');
  const byEnv = rows ?? a.byEnv; const dec = f.decisions[cs]; const author = spec.authors.includes('you');
  const mine = byEnv.filter(x => x.env.level !== 'none' && ME_APPROVER.includes(x.env.id) && !s.approvedBy[x.env.id] && !(author && x.env.level === 'four-eyes'));
  const zonesMine = mine.reduce((n, x) => n + x.zones.length, 0);
  const em = spec.kind === 'emergency';
  const approve = () => {
    s.approveAs('you', mine.map(x => x.env.id)); f.decide(cs, { kind: 'approved', at: nowLabel(), envs: mine.map(x => x.env.id) });
    const complete = byEnv.every(x => x.env.level === 'none' || s.approvedBy[x.env.id] || mine.includes(x));
    if (complete && (spec.kind === 'retranslation' || spec.owner === 'nsgfw')) { if (spec.kind === 'retranslation') f.finishRetrans(); f.bumpLatest({ n: f.latest + 1, name: spec.name, by: 'nsgfw', at: nowLabel(), kind: spec.kind === 'retranslation' ? 'retranslation' : 'revert', nsgs: pv.nsgs.length || 37, edits: s.edits.length }); }
    setDlg(null);
  };
  const reject = () => { s.reject(); f.decide(cs, { kind: 'rejected', comment: why.trim(), at: nowLabel() }); if (em) f.create({ kind: 'revert', of: 1287, author: 'nsgfw' }); setDlg(null); };
  const status = (env: string, level: Level) => s.approvedBy[env] ? <span className="ok"><CheckmarkCircle16Filled /> {t('approved by')} {s.approvedBy[env]}</span> : level === 'none' ? <span className="muted">{t('not required')}</span>
    : mine.some(x => x.env.id === env) ? <span className="accent">{t('covered by your Approval')}</span> : author && level === 'four-eyes' ? <span className="pending">{t('you are an Author: someone else approves')}</span> : <span className="pending">{t('needs another approver')}</span>;
  return (
    <div className="decide">
      <p className="cd-p" style={{ marginTop: 0 }}>{t('You hold the approver Role in Production and Non-production. One Approval from you counts for every Affected Zone there.')}</p>
      {byEnv.map(({ env, zones: zs }) => <details key={env.id} className="dz"><summary><b>{env.name}</b><span>{zs.length} {t(zs.length === 1 ? 'Zone' : 'Zones')}</span><span className="muted">{t(env.level)}</span>{status(env.id, env.level)}</summary>
        <div className="dz-l">{zs.slice(0, 12).map(z => <span key={z.zone} className="dz-z">{z.zone}</span>)}{zs.length > 12 && <span className="muted">{zs.length - 12} {t('more')}</span>}</div></details>)}
      {dec ? <MessageBar intent={dec.kind === 'approved' ? 'success' : 'warning'} layout="multiline"><MessageBarBody><MessageBarTitle>{t(dec.kind === 'approved' ? (em ? 'You approved it afterwards' : 'You approved') : 'You rejected')}</MessageBarTitle>
        <div>{dec.kind === 'rejected' ? <>“{dec.comment}” {em ? t('The tool prepared a Revert of Version 1287 for normal Approval.') : t('It is Open again; its Authors see your comment in their inbox.')}</>
          : a.byEnv.every(x => x.env.level === 'none' || s.approvedBy[x.env.id]) || rows ? (spec.owner === 'nsgfw' ? t('Approval complete: the tool commits it now.') : em ? t('The Emergency Commit is closed.') : `${t('Approval complete:')} ${spec.owner} ${t('can commit it now.')}`) : t('Other Affected Zones still wait for another approver.')}</div></MessageBarBody></MessageBar>
        : <div className="decide-a">
          <Button appearance="primary" disabled={!mine.length} onClick={() => setDlg('stepup')}>{mine.length ? `${t(em ? 'Approve afterwards' : 'Approve')}: ${zonesMine} ${t(zonesMine === 1 ? 'Zone' : 'Zones')}` : t('Nothing for you to approve')}</Button>
          {spec.kind !== 'retranslation' && <Button onClick={() => setDlg('reject')}>{t('Reject…')}</Button>}</div>}
      <StepUp open={dlg === 'stepup'} onClose={() => setDlg(null)} onDone={approve} />
      <Dialog open={dlg === 'reject'} onOpenChange={(_, d) => !d.open && setDlg(null)}>
        <DialogSurface style={{ maxWidth: 480 }}><DialogBody><DialogTitle>{t('Reject')} “{spec.name}”</DialogTitle>
          <DialogContent><p className="cd-p">{em ? t('The Commit stays in Azure. The tool prepares a Revert of Version 1287 that needs normal Approval.') : t('The Change set returns to Open and loses every Approval. Its Authors get your comment in their inbox.')}</p>
            <Field label={t('Comment (required)')} required><Textarea value={why} onChange={(_, d) => setWhy(d.value)} placeholder={t('What should change before you approve?')} /></Field></DialogContent>
          <DialogActions><Button onClick={() => setDlg(null)}>{t('Cancel')}</Button><Button appearance="primary" disabled={why.trim().length < 5} onClick={reject}>{t('Reject')}</Button></DialogActions>
        </DialogBody></DialogSurface>
      </Dialog>
    </div>
  );
}

// The Re-translation has no edits, only the new output of the engine.
const rtZones = zones.filter(z => z.env === 'prod').slice(0, 37);
function RetransMiddle() {
  const { t } = useT();
  return (<>
    <h3>{t('What changes in Azure')}</h3>
    <p className="cd-p" style={{ marginTop: 0 }}>{t('No edits. Engine 1.6.0 (before: 1.5.2) translates the unchanged Rule base into different NSG rules in Production. The Re-translation holds only this new output. Example: the engine now writes one NSG rule per address family for dual-stack service tags.')}</p>
    <div className="counts"><span><b>37</b>NSGs</span><span className="create"><b>61</b>{t('created')}</span><span className="change"><b>92</b>{t('changed')}</span><span className="delete"><b>61</b>{t('deleted')}</span></div>
    {rtZones.slice(0, 14).map((z, i) => <div key={z.id} className="w"><span className="mono">{z.nsg}</span><span className="why">+{1 + (i % 3)} ~{2 + (i % 4)} −{1 + (i % 3)}</span></div>)}
    <p className="muted">23 {t('more')}</p>
  </>);
}
function RetransLeft() {
  const { t } = useT();
  return (<><h3>{t('Engine upgrade')}</h3>
    <p className="cd-p" style={{ marginTop: 0 }}>{t('The operator installed engine 1.6.0 on 2026-11-10 at 06:00. The tool prepared this Change set and submitted it; the tool is its Author.')}</p>
    <h3>{t('While it is open')}</h3>
    <ul className="cd-l"><li>{t('Commits that change Production wait. Change sets there can still be edited, submitted and approved.')}</li>
      <li>{t('Commits that change only other Environments go ahead.')}</li>
      <li>{t('An Emergency Commit, a turned-off expired allow Rule and an automatic Adopt take it along; its Affected Zones there then need Approval afterwards.')}</li>
      <li>{t('Previews of other Change sets compare against the base Version as the new engine translates it.')}</li></ul></>);
}

export function ChangeSetScreen({ id, onClose, onRule }: { id: string; onClose: () => void; onRule: (id: string) => void }) {
  const f = useFlow(); const { t } = useT(); const spec = useMemo(() => specFor(id, f, t), [id]);
  const s = useStoreValue(); const [step, setStep] = useState(0);
  const steps = useMemo<Step[]>(() => [...spec.steps, st => {
    const d = f.decisions[id]; const cur = f.csState[id];
    if (d?.kind === 'approved' && d.envs?.length) st.approveAs('you', d.envs);
    if (d?.kind === 'rejected') st.reject();
    if (!spec.decide && (cur === 'Submitted' || cur === 'Approved')) st.submit();
    if (!spec.decide && cur === 'Committed') st.commit();
  }], [spec]);
  useEffect(() => { if (step < steps.length) { steps[step](s); setStep(step + 1); } }, [step]);
  const ready = step >= steps.length;
  useEffect(() => { if (ready && !spec.decide && spec.kind !== 'view') f.setCs(id, s.state); }, [s.state, ready]);
  return (
    <Ctx.Provider value={s}><CsScope value={id}>
      {ready ? <Screen spec={spec} onClose={onClose} onRule={onRule} /> : <div className="review"><div className="empty"><Spinner size="small" /> {t('Opening')} {spec.name}…</div></div>}
    </CsScope></Ctx.Provider>
  );
}

function Screen({ spec, onClose, onRule }: { spec: Spec; onClose: () => void; onRule: (id: string) => void }) {
  const s = useCsStore(); const f = useFlow(); const { t } = useT(); const pv = usePreview(); const a = useApproval(pv);
  const rt = spec.kind === 'retranslation';
  const rows = rt ? [{ env: envs[0], zones: rtZones.map(z => ({ zone: z.name, env: z.env, level: envs[0].level })) }] : undefined;
  const right = spec.decide ? <><h3>{t('Your decision')}</h3><DecisionBlock pv={pv} spec={spec} rows={rows} />
      <h3>{t('Policy findings')}</h3>{rt ? <p className="muted">{t('The pre-check ran at Submit: no findings.')}</p> : <PolicyView pv={pv} />}
      <h3>{t('Write order')}</h3>{rt ? <p className="muted">{t('No Crossing flows: every write can go in any order.')}</p> : <WriteOrderView pv={pv} />}</>
    : spec.kind === 'view' ? <><h3>{t('Write order')}</h3><WriteOrderView pv={pv} /><h3>{t('Approval')}</h3><ApprovalView pv={pv} /></>
    : <><h3>{t('Write order')}</h3><WriteOrderView pv={pv} /><h3>{t('Approval')}</h3><ApprovalView pv={pv} /><h3>{t('Policy findings')}</h3><PolicyView pv={pv} />
      <div className="rv-act"><div className="cs-actions"><CsButtons pv={pv} name={spec.name} /></div>{s.state === 'Committed' && <p className="ok">{t('Committed as Version')} {s.version}.</p>}
        <p className="muted">{t('To edit it, make it your current Change set (not in this prototype).')}</p></div></>;
  const sub = rt ? t('Submitted by the tool. 37 Managed NSGs change in Production; 37 Affected Zones need Approval.')
    : `${t(spec.kind === 'emergency' ? 'Committed by' : 'By')} ${spec.owner}${spec.authors.length > 1 ? ` ${t('with')} ${spec.authors.filter(x => x !== spec.owner).join(', ')}` : ''}, ${t('based on Version')} ${spec.base}${f.latest > spec.base ? ` (${f.latest - spec.base} ${t('behind')})` : ''}. ${s.edits.length} ${t(s.edits.length === 1 ? 'edit' : 'edits')}, ${pv.nsgs.length} ${t('Managed NSGs change')}, ${a.byEnv.length} ${t(a.byEnv.length === 1 ? 'Environment' : 'Environments')}.`;
  return <Review title={spec.name} summary={sub} banner={<>{spec.banner}{spec.id === 'cs-2' && <ChangedSince pv={pv} />}</>} right={right} onClose={onClose} onRule={onRule}
    left={rt ? <RetransLeft /> : undefined} middle={rt ? <RetransMiddle /> : undefined} track={spec.kind === 'emergency' ? 4 : rt ? (f.decisions[spec.id] ? 4 : 2) : undefined} warnAt={spec.kind === 'emergency' && f.decisions[spec.id]?.kind !== 'approved' ? 2 : undefined} readOnly={spec.kind !== 'rejected' && spec.kind !== 'revert' && spec.kind !== 'restore'} />;
}

// Mounted once in the console: the screens that ticket 36 adds, over the Rule base.
export function FlowScreens({ onRule }: { onRule: (id: string) => void }) {
  const f = useFlow();
  return (<>
    <FlowWatch />
    {f.open && <ChangeSetScreen key={f.open} id={f.open} onClose={() => f.openCs(null)} onRule={onRule} />}
    {f.rebaseOpen && f.pending && <RebaseScreen onClose={() => f.setRebaseOpen(false)} onRule={onRule} />}
  </>);
}
