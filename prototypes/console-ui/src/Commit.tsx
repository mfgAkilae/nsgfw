// PROTOTYPE, throwaway. Issue 36: the Commit dialog (now or at a chosen time, what changed since the Approval, Folder edits since the
// Approval, Tool paths, a waiting Re-translation), the Emergency Commit dialog with Pre-check waivers, and the buttons of the commit bar.
import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Field, Textarea, Input, Radio, RadioGroup, Checkbox, MessageBar, MessageBarBody, MessageBarTitle, Popover, PopoverTrigger, PopoverSurface } from '@fluentui/react-components';
import { Flash16Regular, Send16Regular, Warning16Filled, CalendarClock16Regular, PlugDisconnected16Regular, ArrowSync16Regular, ShieldError16Filled } from '@fluentui/react-icons';
import { useStore, Preview, placement } from './store';
import { envs, zoneById, entries as baseEntries } from './data';
import { useApproval, usePreview } from './ChangeViews';
import { useFindings } from './Policy';
import { useFlow, useCsId, CUR, CUR_NAME, TOOL_PATHS, nowLabel } from './flow';
import { useT } from './i18n';
import { useSession, useGate, StepUpLock } from './session';   // issue 38: step-up and the Commit gate per Affected Zone

// A Change set closes a Tool path when it adds or turns on a deny Rule, or removes or turns off an allow Rule, on the Zone a Tool path goes to.
export function useToolPaths() {
  const s = useStore(); const f = useFlow();
  return useMemo(() => {
    const hit = new Set<string>(); if (f.toolPath) hit.add('tp-dns');
    for (const [id, st] of s.status) {
      const r = s.rules.find(x => x.id === id) ?? s.base.get(id)?.rule; if (!r) continue;
      const closing = r.action === 'deny' ? !st.deleted && r.enabled : !!st.deleted || (!!st.changed?.has('enabled') && !r.enabled);
      if (!closing) continue; const p = placement(r);
      for (const tp of TOOL_PATHS) if (tp.zone && p.dst.includes(tp.zone)) hit.add(tp.id);
    }
    return TOOL_PATHS.filter(tp => hit.has(tp.id));
  }, [s.status, s.rules, f.toolPath]);
}
// An open Re-translation holds back Commits in the Environments where it changes something (here: Production). Folder-only Commits never wait.
// Decided 2026-11-10: a Commit behind an open Re-translation queues and runs right after it, like a scheduled Commit.
export const QUEUED = 'after the Re-translation';
export function useRetransWait(pv: Preview) { const f = useFlow(); return f.retrans && pv.nsgs.some(n => n.env === 'prod') ? ['Production'] : []; }

function ToolPathList({ paths }: { paths: typeof TOOL_PATHS }) {
  const { t } = useT();
  return <ul className="cd-l">{paths.map(p => <li key={p.id}><b>{t(p.name)}</b> <span className="muted">{p.to}, {p.port} ({t(p.from)})</span></li>)}</ul>;
}

export function CommitDialog({ pv, open, onClose, name }: { pv: Preview; open: boolean; onClose: () => void; name: string }) {
  const s = useStore(); const f = useFlow(); const cs = useCsId(); const { t } = useT(); const tps = useToolPaths(); const wait = useRetransWait(pv); const fx = useFindings(pv);
  const [when, setWhen] = useState<'now' | 'at'>('now'); const [date, setDate] = useState('2026-11-10'); const [time, setTime] = useState('22:00'); const [why, setWhy] = useState('');
  const folderOnly = !pv.nsgs.length; const snap = f.snaps[cs];
  const folderSince = snap ? s.edits.filter(e => e.kind === 'folder' && e.seq > snap.seq && !e.via) : [];
  const since = cs === CUR && snap && f.done?.kept ? f.done.since : [];
  const byEnv = envs.map(e => ({ e, n: pv.nsgs.filter(x => x.env === e.id).length })).filter(x => x.n);
  const waived = fx.all.filter(x => fx.waivers[x.key]);
  const queue = wait.length > 0 && !folderOnly;
  const blocked = tps.length > 0 && why.trim().length < 5;
  const go = () => {
    if (when === 'at') f.setSchedule(cs, `${date} ${time}`);
    else if (queue) f.setSchedule(cs, QUEUED);
    else { const n = s.version + 1; s.commit(); f.bumpLatest({ n, name, by: 'you', at: nowLabel(), kind: folderOnly ? 'folders' : 'normal', nsgs: pv.nsgs.length, edits: s.edits.length }); }
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 620 }}><DialogBody><DialogTitle>{t('Commit')} {name}</DialogTitle>
        <DialogContent className="cd">
          <section><h4>{t('What goes out')}</h4>
            {folderOnly ? <p className="cd-p">{t('Nothing changes in Azure. The Commit creates the next Version without a Deployment.')}{s.edits.length > 0 && s.edits.every(e => e.kind === 'folder') ? ` ${t('Only Folder edits: no Approval needed, any editor commits them.')}` : ''}</p>
              : <ul className="cd-l">{byEnv.map(({ e, n }) => <li key={e.id}><b>{e.name}</b> <span className="muted">({e.mode})</span>: {n} {t(n === 1 ? 'Managed NSG' : 'Managed NSGs')}, {e.mode === 'ARM' ? t('written directly in the write order') : `${t('through pull requests, one per write step')} (${Math.max(1, pv.steps.length)})`}</li>)}</ul>}
          </section>
          {wait.length > 0 && !folderOnly && <MessageBar intent="warning" layout="multiline"><MessageBarBody><MessageBarTitle>{t('Waits for the Re-translation')}</MessageBarTitle>
            {t('A Re-translation for engine 1.6.0 is open in Production. This Commit waits in line and runs right after the Re-translation is committed, with a Rebase, validation and the pre-check, like a scheduled Commit. If one of them fails, the Change set stays Approved.')} <a className="link" onClick={() => { onClose(); f.openCs('rt-1'); }}>{t('Open the Re-translation')}</a></MessageBarBody></MessageBar>}
          <section><h4>{t('When')}</h4>
            <RadioGroup value={when} onChange={(_, d) => setWhen(d.value as 'now' | 'at')} layout="horizontal">
              <Radio value="now" label={t(queue ? 'Right after the Re-translation' : 'Now')} /><Radio value="at" label={t('At a time I choose')} /></RadioGroup>
            {when === 'at' && <div className="cd-when"><Input type="date" value={date} onChange={(_, d) => setDate(d.value)} /><Input type="time" value={time} onChange={(_, d) => setTime(d.value)} /><span className="muted">{t('Instance time zone')}: Europe/Vienna</span>
              <p className="cd-p">{t('At that time the tool rebases, validates and runs the pre-check again. If one of them fails, the Change set stays Approved without a schedule, and you and the Change set owner are notified. Any edit that reopens the Change set clears the schedule.')}</p></div>}
          </section>
          {Object.keys(s.approvedBy).length > 0 && <section><h4>{t('Approvals')}</h4>
            <ul className="cd-l">{Object.entries(s.approvedBy).map(([env, by]) => <li key={env}>{envs.find(e => e.id === env)?.name}: {t('approved by')} <b>{by}</b>{snap ? ` ${t('at')} ${snap.at}, Version ${snap.version}` : ''}</li>)}</ul>
            {(since.length > 0 || folderSince.length > 0) ? <>
              {since.length > 0 && <><div className="cd-sub">{t('The Preview changed since the Approval')}</div><ul className="cd-l diffl">{since.map(x => <li key={x}>{x}</li>)}</ul></>}
              {folderSince.length > 0 && <><div className="cd-sub">{folderSince.length} {t(folderSince.length === 1 ? 'Folder edit since the Approval' : 'Folder edits since the Approval')}</div>
                <ul className="cd-l">{folderSince.map(e => <li key={e.seq}>{e.after}</li>)}</ul><p className="cd-p">{t('Folder edits keep the Approvals: no Managed NSG changes through them.')}</p></>}
            </> : snap ? <p className="cd-p">{t('Nothing changed since the Approval.')}</p> : null}
          </section>}
          {waived.length > 0 && <section><h4>{t('Pre-check waivers')}</h4><ul className="cd-l">{waived.map(x => <li key={x.key}>{x.assignment} {t('on')} <span className="mono">{x.resource}</span>: {t('waived by')} {fx.waivers[x.key].by}, “{fx.waivers[x.key].reason}”</li>)}</ul></section>}
          {tps.length > 0 && <section className="cd-tool"><h4><PlugDisconnected16Regular /> {t('This Commit closes a Tool path')}</h4>
            <ToolPathList paths={tps} /><p className="cd-p">{t('The tool may lose its way to Azure or to its database. Confirm with a reason; it goes into the audit log.')}</p>
            <Field label={t('Reason (required)')} required><Textarea value={why} onChange={(_, d) => setWhy(d.value)} /></Field></section>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button>
          <Button appearance="primary" icon={when === 'at' ? <CalendarClock16Regular /> : undefined} disabled={blocked} onClick={go}>{when === 'at' ? `${t('Schedule for')} ${time}` : queue ? t('Commit after the Re-translation') : t('Commit now')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

export function EmergencyDialog({ open, onClose, name = CUR_NAME }: { open: boolean; onClose: () => void; name?: string }) {
  const s = useStore(); const f = useFlow(); const cs = useCsId(); const { t } = useT(); const pv = usePreview(); const fx = useFindings(pv); const tps = useToolPaths();
  const [reason, setReason] = useState(''); const [tick, setTick] = useState<Record<string, boolean>>({}); const [own, setOwn] = useState<Record<string, string>>({});
  const [toolWhy, setToolWhy] = useState<string | null>(null); const [over, setOver] = useState(false);
  useEffect(() => { if (open) f.runCheck(cs, 'Emergency Commit', s.edits.length); }, [open]);
  const drift = useMemo(() => pv.nsgs.filter(n => [...zoneById.values()].some(z => z.nsg === n.nsg && z.flags.includes('drift'))), [pv]);
  const deny = fx.all.filter(x => x.effect === 'deny' && x.status === 'enforced' && !fx.waivers[x.key]);
  const wr = (k: string) => own[k] ?? reason; const tw = toolWhy ?? reason;
  const ok = reason.trim().length >= 5 && deny.every(d => tick[d.key] && wr(d.key).trim().length >= 5) && (!tps.length || tw.trim().length >= 5);
  const se = useSession();
  const run = () => { deny.forEach(d => f.waive(cs, d.key, wr(d.key).trim())); const n = s.version + 1; s.commit(reason); f.bumpLatest({ n, name, by: 'you', at: nowLabel(), kind: 'emergency', nsgs: pv.nsgs.length, edits: s.edits.length }); };
  const go = () => { onClose(); se.stepUp('Emergency Commit', run); };
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 640 }}><DialogBody><DialogTitle><Flash16Regular /> {t('Emergency Commit')}</DialogTitle>
        <DialogContent className="cd">
          <p className="cd-p">{t('This commits at once without the required Approval. It stays in every approver’s inbox until one of them approves it afterwards; a rejection makes the tool prepare a Revert. You sign in again before it runs.')}</p>
          <Field label={t('Reason (required)')} required><Textarea value={reason} onChange={(_, d) => setReason(d.value)} placeholder={t('For example: active scan from a partner network, incident INC-2211')} /></Field>
          {deny.length > 0 && <section className="cd-deny"><h4><ShieldError16Filled /> {deny.length} {t(deny.length === 1 ? 'deny Policy finding blocks this Commit' : 'deny Policy findings block this Commit')}</h4>
            <p className="cd-p">{t('Waive each one to commit anyway. Azure still decides: a deny there fails that write.')}</p>
            {deny.map(d => <div key={d.key} className="cd-w"><Checkbox checked={!!tick[d.key]} onChange={(_, v) => setTick(x => ({ ...x, [d.key]: !!v.checked }))} label={<span><b>{d.assignment}</b> {t('on')} <span className="mono">{d.resource}</span>{d.rule ? <> ({t('Rule')} <span className="mono">{d.rule}</span>)</> : null}</span>} />
              {tick[d.key] && <Input size="small" value={wr(d.key)} onChange={(_, v) => setOwn(x => ({ ...x, [d.key]: v.value }))} placeholder={t('Reason for this waiver')} />}</div>)}
          </section>}
          {fx.all.some(x => fx.waivers[x.key]) && <p className="cd-p">{fx.all.filter(x => fx.waivers[x.key]).length} {t('findings already waived.')}</p>}
          {tps.length > 0 && <section className="cd-tool"><h4><PlugDisconnected16Regular /> {t('This Commit closes a Tool path')}</h4><ToolPathList paths={tps} />
            <Field label={t('Reason for closing it (required)')}><Input value={tw} onChange={(_, d) => setToolWhy(d.value)} /></Field></section>}
          {drift.length > 0 && <section><h4>{t('Drift')}</h4><Checkbox checked={over} onChange={(_, v) => setOver(!!v.checked)} label={`${t('Overwrite the Drift on')} ${drift.length} ${t(drift.length === 1 ? 'Managed NSG' : 'Managed NSGs')}: ${drift.map(d => d.nsg).join(', ')}`} />
            {!over && <p className="cd-p">{t('Without it, the Deployment stops before its first write in those Environments.')}</p>}</section>}
          {f.retrans && <p className="cd-p pending">{t('The open Re-translation in Production goes out with this Commit. Its Affected Zones there need Approval afterwards.')}</p>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={!ok} onClick={go}>{t('Sign in again and commit')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

function SubmitConfirm({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: () => void }) {
  const { t } = useT(); const tps = useToolPaths(); const [why, setWhy] = useState('');
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 540 }}><DialogBody><DialogTitle>{t('This Change set closes a Tool path')}</DialogTitle>
        <DialogContent className="cd"><ToolPathList paths={tps} /><p className="cd-p">{t('The tool may lose its way to Azure or to its database. Submit and Commit each need a confirmation with a reason; both go into the audit log. It is not a validation error.')}</p>
          <Field label={t('Reason (required)')} required><Textarea value={why} onChange={(_, d) => setWhy(d.value)} /></Field></DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={why.trim().length < 5} onClick={() => { onSubmit(); onClose(); }}>{t('Submit for Approval')}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

// The action buttons, shared by the commit bar and the Review. The pre-check runs at Submit; a deny finding stops it.
export function CsButtons({ pv, name = CUR_NAME, onReview, onPolicy, emergency = true }: { pv: Preview; name?: string; onReview?: () => void; onPolicy?: () => void; emergency?: boolean }) {
  const s = useStore(); const f = useFlow(); const cs = useCsId(); const { t } = useT(); const a = useApproval(pv); const fx = useFindings(pv); const tps = useToolPaths(); const wait = useRetransWait(pv);
  const [dlg, setDlg] = useState<null | 'commit' | 'emergency' | 'submit'>(null);
  const need = a.byEnv.some(x => x.env.level !== 'none'); const rb = cs === CUR && !!f.pending; const sched = f.schedule[cs];
  const deny = fx.ran ? fx.blocking.length : 0; const stop = pv.unorderable || rb;
  // Discarding another Change set resets only its own store: the store's discard() also clears the current Change set's Zone and Object edits (issue 35).
  const discard = cs === CUR ? s.discard : () => s.rebaseOnto(s.version, () => baseEntries, () => [], false);
  const submit = () => { f.runCheck(cs, 'Submit', s.edits.length); if (fx.blocking.length) { onPolicy?.(); return; } if (tps.length) setDlg('submit'); else s.submit(); };
  const g = useGate(pv.affected, s.approvedBy);
  const commitReady = s.edits.length > 0 && a.done && !stop && !deny && !g.commit;
  return (
    <>
      {emergency && need && <Button size="small" appearance="subtle" icon={<Flash16Regular />} disabled={!s.edits.length || pv.unorderable || !!g.emergency} title={g.emergency ? t(g.emergency) : undefined} onClick={() => setDlg('emergency')}>{t('Emergency Commit')}<StepUpLock /></Button>}
      <Button size="small" appearance="subtle" onClick={discard} disabled={!s.edits.length}>{t('Discard')}</Button>
      {onReview && <Button size="small" onClick={onReview}>{t('Review')}</Button>}
      {s.state === 'Open' && need && <Button size="small" appearance="primary" icon={<Send16Regular />} disabled={!s.edits.length || stop || deny > 0} onClick={submit} title={rb ? t('Resolve the conflicts of the Rebase first') : undefined}>{t('Submit for Approval')}</Button>}
      {s.state === 'Submitted' && !a.done && cs === CUR && <Button size="small" className="proto" onClick={() => s.approveAs('kim', a.byEnv.map(x => x.env.id))}>{t('Approve as kim (prototype)')}</Button>}
      {(s.state !== 'Open' || !need) && (sched
        ? <><span className="sched"><CalendarClock16Regular />{sched === QUEUED ? t('Waits for the Re-translation') : `${t('Scheduled for')} ${sched}`}</span><Button size="small" appearance="subtle" onClick={() => setDlg('commit')}>{t('Move')}</Button>
            <Button size="small" appearance="subtle" onClick={() => f.setSchedule(cs, undefined)}>{t('Cancel schedule')}</Button>
            {sched !== QUEUED && <Button size="small" className="proto" onClick={() => { f.setSchedule(cs, undefined); const n = s.version + 1; s.commit(); f.bumpLatest({ n, name, by: 'you', at: sched, kind: 'scheduled', nsgs: pv.nsgs.length, edits: s.edits.length }); }}>{t('Run it now (prototype)')}</Button>}</>
        : <Button size="small" appearance="primary" disabled={!commitReady} onClick={() => setDlg('commit')} title={g.commit ? t(g.commit) : wait.length && pv.nsgs.length ? t('Commits after the Re-translation') : undefined}>{t('Commit…')}</Button>)}
      <CommitDialog pv={pv} name={name} open={dlg === 'commit'} onClose={() => setDlg(null)} />
      <EmergencyDialog name={name} open={dlg === 'emergency'} onClose={() => setDlg(null)} />
      <SubmitConfirm open={dlg === 'submit'} onClose={() => setDlg(null)} onSubmit={s.submit} />
    </>
  );
}

// Flags in the commit bar: a Rebase with conflicts, a Tool path, a waiting Re-translation.
export function BarFlags({ pv }: { pv: Preview }) {
  const f = useFlow(); const cs = useCsId(); const { t } = useT(); const tps = useToolPaths(); const wait = useRetransWait(pv);
  const n = f.pending ? (f.pending.mode === 'full' ? 3 : 1) : 0;
  return (<>
    {cs === CUR && f.pending && <button className="bad" onClick={() => f.setRebaseOpen(true)}><ArrowSync16Regular /><b>{n}</b>{t(n === 1 ? 'conflict after the Rebase' : 'conflicts after the Rebase')}</button>}
    {tps.length > 0 && <Popover positioning="above"><PopoverTrigger disableButtonEnhancement><button className="warnb"><PlugDisconnected16Regular />{t('Closes a Tool path')}</button></PopoverTrigger>
      <PopoverSurface style={{ maxWidth: 420, padding: '12px 16px' }}><div className="panel-h">{t('Tool paths this Change set closes')}</div><ToolPathList paths={tps} /><p className="muted" style={{ lineHeight: 1.45 }}>{t('Submit and Commit ask for a confirmation with a reason.')}</p></PopoverSurface></Popover>}
    {wait.length > 0 && <button className="warnb" onClick={() => f.openCs('rt-1')}><Warning16Filled />{t('Commit waits for the Re-translation in')} {wait.join(', ')}</button>}
  </>);
}
