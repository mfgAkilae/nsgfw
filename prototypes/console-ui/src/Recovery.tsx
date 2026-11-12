// PROTOTYPE, throwaway. Issue 43: Recovery mode (ADR 0019). The Recovery screen, the band on every page, the page that
// everyone without InstanceAdmin sees, and the dialogs that start and end the mode.
import { useMemo, useState } from 'react';
import { Button, Checkbox, Textarea } from '@fluentui/react-components';
import { DatabaseWarning20Regular, LockClosed12Regular, Pause16Regular, PlayCircle16Regular, Checkmark16Regular, Warning16Filled, ArrowRight16Regular,
  Fingerprint16Regular, Info16Regular, Copy16Regular, ArrowSwap16Regular } from '@fluentui/react-icons';
import { useRec, setRec, resolve, unresolve, diffsFor, openCount, tfBlocked, locked, groups, envName, envMode, copyEnvs, FACTS, startRec, type Diff, type Group, type How, type Rec } from './rec43';
import { useSession, StepUpLock } from './session';
import { Brand } from './bits';
import { nowLabel } from './flow';
import { useT } from './i18n';
import './rec.css';

const TRIGGER: Record<Rec['trigger'], { head: string; text: string }> = {
  marker: { head: 'Started by a restore marker', text: 'The instance module started nsgfw with a restore marker at 07:58, after a recovery from the backup of 2026-11-12 03:00. No job ran before this check.' },
  version: { head: 'Azure is newer than the database', text: 'At startup, Resource Graph showed Version tags up to 1297 under this Instance ID. The newest Version in the database is 1290.' },
  identity: { head: 'Another identity', text: 'nsgfw runs under another Tool identity than the one its database recorded. The database was moved or copied.' },
  manual: { head: 'Started by an admin', text: '' },
};

let csNo = 5300;
const label = (how: How, cs?: string) => ({ overwrite: 'Overwritten', recreate: 'Re-created', adopt: `Adopt prepared in ${cs}`, onboard: `Onboarding prepared in ${cs}`, confirm: 'Confirmed', leave: 'Left as Drift' }[how]);

// ---------- The Recovery screen: what happened and what is off on the left, the differences in the middle, one difference on the right.
export function RecoveryPage() {
  const r = useRec(); const { t } = useT(); const se = useSession();
  const all = diffsFor(r);
  const [g, setG] = useState<Group | 'all'>('all'); const [env, setEnv] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(all[0]?.id ?? '');
  const [end, setEnd] = useState(false);
  const list = all.filter(d => (g === 'all' || d.group === g) && (!env || d.env === env));
  const cur = all.find(d => d.id === sel) ?? list[0];
  const done = all.length - openCount(r); const lk = locked(r);
  const trig = TRIGGER[r.trigger];
  const envs = [...new Set(all.map(d => d.env))];
  return (
    <div className="rc">
      <header className="phead rc-h">
        <span className="rc-mark"><DatabaseWarning20Regular /></span>
        <div><h1>{t('Recovery mode')}</h1><p>{t(trig.head)} {t('at')} {r.since}. {t('Nothing reaches Azure except Overwrite. Only holders of InstanceAdmin can sign in.')}</p></div>
        <span className="sp" />
        <Button appearance="primary" onClick={() => setEnd(true)}>{t('End Recovery mode…')}<StepUpLock /></Button>
      </header>
      <div className="rc-b">
        <section className="rc-c rc-l">
          <h3>{t('What happened')}</h3>
          <p className="rc-trig">{r.trigger === 'manual' ? <>{r.by} {t('started it by hand:')} “{r.reason}”</> : t(trig.text)}</p>
          {r.trigger !== 'identity' && r.trigger !== 'manual' && <div className="rc-facts">
            <div><span>{t('Database')}</span><b>{t('Version')} {FACTS.dbVersion}</b><i>{t('backup of')} {FACTS.restorePoint}</i></div>
            <div className="hot"><span>Azure</span><b>{t('Version')} {FACTS.azureVersion}</b><i>{FACTS.azureVersion - FACTS.dbVersion} {t('Versions the database does not have')}</i></div>
          </div>}
          <h3>{t('Off while the mode lasts')}</h3>
          <ul className="rc-off">
            <li><Pause16Regular /><div><b>{t('Sign-in')}</b><span>{t('Only holders of the Entra app role InstanceAdmin.')} {FACTS.sessionsEnded} {t('sessions ended. Bearer tokens of everyone else are refused.')}</span></div></li>
            <li><Pause16Regular /><div><b>{t('Commits and Deployments')}</b><span>{t('Also Emergency Commits.')} {t('The Deployment of Version')} {FACTS.stopped.version} {t('in')} {t(FACTS.stopped.env)} {t('stopped after its writes in flight:')} {t(FACTS.stopped.writes)}.</span></div></li>
            <li><Pause16Regular /><div><b>{t('Schedules')}</b><span>{FACTS.cleared.length} {t('cleared, their Authors were told:')} {FACTS.cleared.map(c => `${c.cs} (${t(c.what)})`).join(', ')}.</span></div></li>
            <li><Pause16Regular /><div><b>{t('Expiry')}</b><span>{FACTS.expired} {t('allow Rules past their expiry stay on. Health lists them; their expiry Commits run when the mode ends.')}</span></div></li>
            <li><Pause16Regular /><div><b>{t('Automatic Overwrite and Adopt')}</b><span>{t('Adopt and onboarding still prepare Change sets. They wait until the mode ends.')}</span></div></li>
            <li><Pause16Regular /><div><b>{t('Pull requests')}</b><span>{t('Non-production gets none, and requests for auto-merge were withdrawn,')} {tfBlocked(r) ? <>{t('until every difference in tf-nonprod-ger is adopted or confirmed:')} <em className="amber">{tfBlocked(r)} {t('open')}</em></> : <em className="ok">{t('every difference there is adopted or confirmed')}</em>}.</span></div></li>
          </ul>
          <h3>{t('Still runs')}</h3>
          <ul className="rc-off on">
            <li><PlayCircle16Regular /><div><b>{t('Drift poll')}</b><span>{t('Resource Graph every 5 minutes. It found the differences in the middle.')}</span></div></li>
            <li><PlayCircle16Regular /><div><b>{t('Overwrite')}</b><span>{t('In ARM Environments, one resource at a time, written at once. After a Copy also the marker tags of a confirmed Handover.')}</span></div></li>
          </ul>
          <h3>{t('Kept in step')}</h3>
          <dl className="rc-kv">
            <dt>{t('IDs continue at')}</dt><dd>{t('Rule')} {FACTS.ids.rule.toLocaleString()}, {t('Zone')} {FACTS.ids.zone.toLocaleString()}, {t('Object')} {FACTS.ids.object.toLocaleString()}, {t('Version')} {FACTS.ids.version.toLocaleString()}<i>{t('the highest value in Azure plus 10,000, so no ID repeats one that reached only the audit export')}</i></dd>
            <dt>{t('Audit chain')}</dt><dd>{t('Recovery entry')} {FACTS.audit.seq}, {t('chained to the restored last entry')} {FACTS.audit.restoredLast}<i>{t('The export shows a fork there; the chain check accepts it.')}</i></dd>
          </dl>
        </section>

        <section className="rc-c rc-m">
          {r.trigger === 'identity' && <Identity />}
          {r.identity === 'copy' && <Handovers />}
          <div className={`rc-diffs ${lk ? 'lk' : ''}`}>
            <div className="rc-prog">
              <h3>{t('Differences between the database and Azure')}</h3>
              <span className="sp" /><b>{done}</b><span>{t('of')} {all.length} {t('resolved')}</span>
              <i className="rc-bar"><b style={{ width: `${all.length ? (done / all.length) * 100 : 100}%` }} /></i>
            </div>
            <p className="rc-lead">{t('Each one is resolved through the usual paths. You can end the mode at any time: what is still open stays ordinary Drift. The tool does not rebuild lost Rules; the audit export shows them.')}</p>
            <div className="chipbar rc-chips">
              <button className={`chip ${g === 'all' ? 'on' : ''}`} onClick={() => setG('all')}>{t('All')}<i>{all.length}</i></button>
              {groups.map(([k, l, hint]) => { const n = all.filter(d => d.group === k).length; return <button key={k} title={t(hint)} className={`chip rc-g-${k} ${g === k ? 'on' : ''} ${n ? '' : 'zero'}`} disabled={!n} onClick={() => setG(k)}>{t(l)}<i>{n}</i></button>; })}
              <span className="sp" />
              {envs.map(e => <button key={e} className={`chip ${env === e ? 'on' : ''}`} onClick={() => setEnv(env === e ? null : e)}>{t(envName[e])}<i>{all.filter(d => d.env === e).length}</i></button>)}
            </div>
            <div className="rc-list">
              {list.map(d => { const x = r.res[d.id]; return (
                <div key={d.id} className={`rc-row ${cur?.id === d.id ? 'on' : ''} ${x && x.how !== 'leave' ? 'done' : ''}`} onClick={() => setSel(d.id)}>
                  <span className={`rc-gm rc-g-${d.group}`} title={t(groups.find(y => y[0] === d.group)![1])} />
                  <div className="d2"><b>{t(d.title)}</b><span className="mono">{d.resource}</span></div>
                  <span className="rc-env">{t(envName[d.env])}<i>{envMode[d.env]}</i></span>
                  <span className="rc-tag">{d.tag ? `${t('tag')} ${d.tag}` : '—'}</span>
                  <span className={`dst ${x ? (x.how === 'leave' ? '' : 'ok') : 'amber'}`}>{x ? t(label(x.how, x.cs)) : t('Open')}</span>
                </div>); })}
              {!list.length && <div className="empty"><b>{t('Nothing here')}</b><p>{t('No difference of this kind.')}</p></div>}
            </div>
            {lk && <div className="rc-lockmsg"><LockClosed12Regular />{t('Choose Move or Copy first. Until then the Instance ID is not settled, and no difference can be resolved.')}</div>}
          </div>
        </section>

        <section className="rc-c rc-r">{cur ? <DiffDetail key={cur.id} d={cur} r={r} /> : <div className="empty"><b>{t('No differences')}</b><p>{t('The database and Azure agree.')}</p></div>}</section>
      </div>
      {end && <EndDialog onClose={() => setEnd(false)} />}
    </div>
  );
}

// ---------- One difference: what differs, why, what each way out does.
function DiffDetail({ d, r }: { d: Diff; r: Rec }) {
  const { t } = useT(); const [ask, setAsk] = useState<How | null>(null);
  const x = r.res[d.id]; const tf = envMode[d.env] === 'Terraform'; const lk = locked(r);
  const opts: { how: How; label: string; text: string; off?: string; primary?: boolean }[] = [];
  if (d.group === 'changed') {
    if (!tf) opts.push({ how: 'overwrite', label: 'Overwrite', text: 'Writes the database’s state into this one resource now. No Approval; the audit log records it.', primary: true });
    opts.push({ how: 'adopt', label: 'Adopt', text: d.adopt ? `${d.adopt} ${'The Change set waits until the mode ends.'}` : '', off: d.adopt === false ? d.adoptNo : undefined });
    if (tf) opts.push({ how: 'confirm', label: 'Confirm', text: 'You have seen it and keep the database’s state. It stays Drift until a Change set or the next apply settles it.' });
  }
  if (d.group === 'unknown') opts.push({ how: 'onboard', label: d.kind === 'Managed ASG' ? 'Onboard with its Zone' : 'Onboard again with Import', primary: true,
    text: d.kind === 'Managed ASG' ? 'Comes back with the onboarding of app0731-web: Import offers it as an External ASG object or adopted in place.' : `Prepares an onboarding Change set with Import. Its NSG rules become new Rules with new Rule IDs, from ${FACTS.ids.rule.toLocaleString()}. The Change set waits until the mode ends.` });
  if (d.group === 'missing') {
    if (!tf) opts.push({ how: 'recreate', label: 'Re-create', text: 'Writes the resource as the database has it, now. No Approval; the audit log records it.', primary: true });
    opts.push({ how: 'adopt', label: d.adopt === false ? 'Remove the Zone' : 'Adopt', text: d.adopt || '', off: d.adopt === false ? d.adoptNo : undefined });
    if (tf) opts.push({ how: 'confirm', label: 'Confirm', text: 'You have seen it. It stays Drift until a Change set or the next apply settles it.' });
  }
  if (!tf || d.group === 'unknown') opts.push({ how: 'leave', label: 'Leave as Drift', text: d.group === 'unknown' ? 'It stays an NSG of this Instance that the database does not know. Health keeps flagging it.' : 'Nothing is written. After the mode it is ordinary Drift.' });
  const go = (how: How) => { const cs = how === 'adopt' || how === 'onboard' ? `CHG-${++csNo}` : undefined; resolve(d.id, { how, at: nowLabel(), cs }); setAsk(null); };
  const writes = ask === 'overwrite' || ask === 'recreate';
  return (
    <>
      <div className="rc-kick"><span className={`rc-gm rc-g-${d.group}`} />{t(groups.find(y => y[0] === d.group)![1])}<span>·</span>{t(d.kind)}<span>·</span>{t(envName[d.env])} ({envMode[d.env]})</div>
      <h2 className="mono rc-res">{d.resource}</h2>
      <div className="rc-zone"><span className="tok t-zone">{d.zone}</span>{d.tag && <span className="rc-tag">nsgfw-version {d.tag}</span>}</div>
      <p className="rc-why">{t(d.why)}</p>
      {d.rows && <table className="mini rc-diff"><thead><tr><th>{t('What')}</th><th>{t('Database')}</th><th>Azure</th></tr></thead>
        <tbody>{d.rows.map(([w, a, b]) => <tr key={w}><td className="mono">{w}</td><td>{t(a)}</td><td className="hot">{t(b)}</td></tr>)}</tbody></table>}
      {d.lost && <div className="rc-lost"><Info16Regular /><div><b>{t('In the audit export')}</b><span>{t(d.lost)}</span></div></div>}
      {x ? (
        <div className={`rc-done ${x.how === 'leave' ? 'leave' : ''}`}>
          <Checkmark16Regular /><div><b>{t(label(x.how, x.cs))}</b><span>{t('by you at')} {x.at}. {x.how === 'overwrite' || x.how === 'recreate' ? t('Written to Azure; recorded in the audit log.') : x.how === 'adopt' || x.how === 'onboard' ? t('The Change set waits until the mode ends, then goes to Approval.') : x.how === 'confirm' ? t('Recorded in the audit log.') : t('Nothing written.')}</span></div>
          {(x.how === 'leave' || x.how === 'confirm') && <Button size="small" appearance="subtle" onClick={() => unresolve(d.id)}>{t('Choose again')}</Button>}
        </div>
      ) : (
        <>
          <h3>{t('Resolve')}</h3>
          <div className="rc-opts">
            {opts.map(o => (
              <div key={o.how} className={`rc-opt ${o.off ? 'off' : ''}`}>
                <Button size="small" appearance={o.primary ? 'primary' : 'secondary'} disabled={!!o.off || lk} onClick={() => (o.how === 'overwrite' || o.how === 'recreate' ? setAsk(o.how) : go(o.how))}>{t(o.label)}</Button>
                <span>{t(o.off ?? o.text)}</span>
              </div>))}
          </div>
          {tf && <p className="muted rc-tfnote">{t('Terraform Environment: in Recovery mode there is no single-resource Overwrite, because every write is a pull request. Non-production gets pull requests again once every difference in tf-nonprod-ger is adopted or confirmed.')}</p>}
        </>
      )}
      {writes && ask && (
        <div className="modal-bg" onMouseDown={() => setAsk(null)}><div className="modal" role="dialog" aria-label={t(ask === 'overwrite' ? 'Overwrite' : 'Re-create')} onMouseDown={e => e.stopPropagation()}>
          <h2>{t(ask === 'overwrite' ? 'Overwrite' : 'Re-create')} <span className="mono">{d.resource}</span></h2>
          <p>{t('One write of the database’s state, now. It is the one kind of write Recovery mode allows.')}</p>
          {d.overwrite?.closes && <div className="rc-eff bad"><b>{t('Closes')}</b>{d.overwrite.closes.map(c => <span key={c}>{t(c)}</span>)}</div>}
          {d.overwrite?.opens && <div className="rc-eff ok"><b>{t('Opens')}</b>{d.overwrite.opens.map(c => <span key={c}>{t(c)}</span>)}</div>}
          {d.overwrite?.none && <div className="rc-eff"><b>{t('Traffic')}</b><span>{t(d.overwrite.none)}</span></div>}
          <p className="muted">{t('It needs no Approval and goes into the audit log.')} {d.lost ? t('The lost Rule stays lost: create it again in a Change set if it is still needed.') : ''}</p>
          <div className="modal-f"><Button onClick={() => setAsk(null)}>{t('Cancel')}</Button><Button appearance="primary" onClick={() => go(ask)}>{t(ask === 'overwrite' ? 'Overwrite now' : 'Re-create now')}</Button></div>
        </div></div>
      )}
    </>
  );
}

// ---------- Another identity: Move keeps the Instance ID, Copy makes a new Instance.
function Identity() {
  const r = useRec(); const { t } = useT(); const se = useSession(); const [a, setA] = useState(false); const [b, setB] = useState(false);
  if (r.identity) return (
    <div className="rc-id done"><Fingerprint16Regular /><div><b>{t(r.identity === 'move' ? 'Move: the Instance keeps its ID' : 'Copy: this is a new Instance')}</b>
      <span>{t(r.identity === 'move' ? 'The database now records the running Tool identity. Every Zone stays this Instance’s.' : 'New Instance ID 7d41…e0c2. The Zones it holds still carry the old ID: confirm the Handover per Environment below.')}</span></div></div>
  );
  const choose = (k: 'move' | 'copy') => se.stepUp(k === 'move' ? 'Choosing Move' : 'Choosing Copy', () => setRec({ identity: k }));
  return (
    <div className="rc-id">
      <h3>{t('Move or Copy')}</h3>
      <table className="mini rc-ids"><thead><tr><th></th><th>{t('Recorded in the database')}</th><th>{t('Running now')}</th></tr></thead><tbody>
        <tr><td>{t('Tool identity')}</td><td className="mono">{FACTS.recorded.tool}</td><td className="mono hot">{FACTS.running.tool}</td></tr>
        <tr><td>{t('App registration')}</td><td className="mono">{FACTS.recorded.app}</td><td className="mono">{FACTS.running.app}</td></tr></tbody></table>
      <div className="rc-choice">
        <div className="rc-card">
          <b><ArrowSwap16Regular />{t('Moved')}</b>
          <p>{t('The same Instance in a new place, for example from on-premises to Azure. It keeps its Instance ID and every Zone.')}</p>
          <Checkbox checked={a} onChange={(_, x) => setA(!!x.checked)} label={t('The old installation is shut down: its container app or service is stopped or deleted.')} />
          <Checkbox checked={b} onChange={(_, x) => setB(!!x.checked)} label={t('Nobody starts it again with a copy of this database.')} />
          <Button appearance="primary" disabled={!a || !b} onClick={() => choose('move')}>{t('This is a Move')}<StepUpLock /></Button>
        </div>
        <div className="rc-card">
          <b><Copy16Regular />{t('Copied')}</b>
          <p>{t('Another Instance made from a copy, for example a test installation. It gets a new Instance ID. Its Zones get no Deployment and no automatic Overwrite until you confirm a Handover for their Environment.')}</p>
          <Button onClick={() => choose('copy')}>{t('This is a Copy')}<StepUpLock /></Button>
        </div>
      </div>
    </div>
  );
}

// ---------- After a Copy: one Handover per Environment.
function Handovers() {
  const r = useRec(); const { t } = useT(); const se = useSession(); const [ok, setOk] = useState<Record<string, boolean>>({});
  return (
    <div className="rc-ho">
      <h3>{t('Handover per Environment')}</h3>
      <p className="rc-lead">{t('The NSGs and ASGs of these Zones carry the old Instance ID. Confirm that the old Instance no longer writes there; the tool then rewrites their marker tags, the one write besides Overwrite that Recovery mode allows.')}</p>
      {copyEnvs.map(e => { const at = r.handover[e.id]; return (
        <div key={e.id} className={`rc-horow ${at ? 'done' : ''}`}>
          <div className="d2"><b>{t(envName[e.id])} <i className="rc-mode">{envMode[e.id]}</i></b><span>{e.zones} {t('Zones')}, {e.resources} {t('NSGs and ASGs with the old Instance ID')}</span></div>
          {at ? <span className="dst ok">{t('Handover confirmed at')} {at}, {e.resources} {t('tags rewritten')}</span> : <>
            <Checkbox checked={!!ok[e.id]} onChange={(_, x) => setOk(o => ({ ...o, [e.id]: !!x.checked }))} label={`${t('The old Instance is shut down or no longer writes in')} ${t(envName[e.id])}`} />
            <Button size="small" appearance="primary" disabled={!ok[e.id]} onClick={() => se.stepUp('Confirming a Handover', () => setRec({ handover: { ...r.handover, [e.id]: nowLabel() } }))}>{t('Confirm Handover')}</Button></>}
        </div>); })}
    </div>
  );
}

// ---------- Ending the mode: with a reason, at any time.
function EndDialog({ onClose }: { onClose: () => void }) {
  const r = useRec(); const { t } = useT(); const se = useSession(); const [why, setWhy] = useState('');
  const all = diffsFor(r); const open = all.filter(d => !r.res[d.id] || r.res[d.id].how === 'leave');
  const prepared = all.filter(d => r.res[d.id]?.cs).length; const tf = tfBlocked(r);
  const noHo = r.identity === 'copy' ? copyEnvs.filter(e => !r.handover[e.id]) : [];
  const end = () => se.stepUp('Ending Recovery mode', () => {
    setRec({ on: false, ended: { reason: why, at: nowLabel(), open: open.length } });
    se.log({ cat: 'recovery', action: 'Ended Recovery mode', object: 'Instance', scopes: [{ kind: 'instance', id: 'instance' }], result: 'ok', detail: `Reason: ${why}` });
    se.toast(`Recovery mode ended. ${open.length} differences stay ordinary Drift.`); onClose();
  });
  return (
    <div className="modal-bg" onMouseDown={onClose}><div className="modal wide rc-end" role="dialog" aria-label={t('End Recovery mode')} onMouseDown={e => e.stopPropagation()}>
      <h2>{t('End Recovery mode')}</h2>
      {r.trigger === 'identity' && !r.identity ? <p className="rc-warn"><Warning16Filled />{t('Move or Copy is not chosen yet. Until it is, nsgfw stays in Recovery mode: two installations must not write with one Instance ID.')}</p> : <>
      <div className="rc-endgrid">
        <div><b>{open.length ? `${open.length} ${t(open.length === 1 ? 'difference stays' : 'differences stay')} ${t('ordinary Drift')}` : t('Every difference is resolved')}</b>
          {open.length > 0 && <ul>{open.map(d => <li key={d.id}><span className="mono">{d.resource}</span>: {t(d.title)}</li>)}</ul>}</div>
        <div><b>{t('Starts again')}</b><ul>
          <li>{t('Sign-in for every Role, and bearer tokens.')}</li>
          <li>{t('Commits and Deployments.')} {FACTS.expired} {t('expiry Commits run now.')}</li>
          {prepared > 0 && <li>{prepared} {t(prepared === 1 ? 'prepared Change set goes to Approval.' : 'prepared Change sets go to Approval.')}</li>}
          <li>{t('Automatic Overwrite and Adopt.')}</li>
          <li>{t('Pull requests in Non-production.')} {tf > 0 && t('The Commit dialog asks to confirm that an apply overwrites the Drift in tf-nonprod-ger.')}</li>
        </ul></div>
      </div>
      <p className="muted">{t('The cleared schedules stay cleared:')} {FACTS.cleared.map(c => c.cs).join(', ')} {t('need a new one.')}</p>
      {noHo.length > 0 && <p className="rc-warn"><Warning16Filled />{noHo.map(e => t(envName[e.id])).join(', ')}: {t('no Handover confirmed. Their Zones keep the old Instance ID and get no Deployment until an InstanceAdmin confirms it in Admin > Environments.')}</p>}
      <label className="rc-lbl">{t('Reason')} <span className="muted">{t('(goes into the audit log)')}</span></label>
      <Textarea value={why} onChange={(_, x) => setWhy(x.value)} placeholder={t('For example: recovery from the backup of 03:00 checked, lost Rules re-created in CHG-5302')} resize="vertical" style={{ width: '100%' }} /></>}
      <div className="modal-f"><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={!why.trim() || (r.trigger === 'identity' && !r.identity)} onClick={end}>{t('End Recovery mode')}<StepUpLock /></Button></div>
    </div></div>
  );
}

// ---------- Starting the mode by hand: Admin > Instance.
export function StartRecovery() {
  const r = useRec(); const { t } = useT(); const se = useSession(); const [open, setOpen] = useState(false); const [why, setWhy] = useState('');
  const start = () => se.stepUp('Starting Recovery mode', () => { startRec('manual', { by: se.user.name, reason: why, since: nowLabel() }); setOpen(false); setWhy('');
    se.log({ cat: 'recovery', action: 'Started Recovery mode', object: 'Instance', scopes: [{ kind: 'instance', id: 'instance' }], result: 'ok', detail: `Reason: ${why}` }); });
  return (
    <section className="set rc-start"><h3>{t('Recovery mode')}</h3>
      <p className="muted">{r.on ? t('On. The Recovery screen is in the rail.') : r.ended ? `${t('Off. Last ended at')} ${r.ended.at}: “${r.ended.reason}”.` : t('Off. nsgfw starts it on its own after a recovery from backup, under another Tool identity, or with a restore marker.')}</p>
      <p>{t('Start it by hand when you suspect that the database does not match Azure, for example before you recover from a backup yourself.')}</p>
      {!r.on && <Button onClick={() => setOpen(true)}>{t('Start Recovery mode…')}<StepUpLock /></Button>}
      {open && <div className="modal-bg" onMouseDown={() => setOpen(false)}><div className="modal wide" role="dialog" aria-label={t('Start Recovery mode')} onMouseDown={e => e.stopPropagation()}>
        <h2>{t('Start Recovery mode')}</h2>
        <ul className="rc-conseq">
          <li>{t('Every session ends, except yours. Only holders of InstanceAdmin can sign in.')}</li>
          <li>{t('No Commits and no Deployments. A running Deployment stops after its writes in flight.')}</li>
          <li>{t('Scheduled and queued Commits are cleared; their Authors get a notice.')}</li>
          <li>{t('No automatic Overwrite or Adopt; Terraform Environments get no pull requests.')}</li>
          <li>{t('Every ID sequence jumps, and the audit chain gets a recovery entry.')}</li>
        </ul>
        <label className="rc-lbl">{t('Reason')} <span className="muted">{t('(goes into the audit log and onto the sign-in page)')}</span></label>
        <Textarea value={why} onChange={(_, x) => setWhy(x.value)} placeholder={t('For example: the database server is restored from backup at 21:00')} style={{ width: '100%' }} />
        <div className="modal-f"><Button onClick={() => setOpen(false)}>{t('Cancel')}</Button><Button appearance="primary" disabled={!why.trim()} onClick={start}>{t('Start Recovery mode')}<StepUpLock /></Button></div>
      </div></div>}
    </section>
  );
}

// ---------- The band on every other page while the mode lasts.
export function RecoveryBand({ onOpen }: { onOpen: () => void }) {
  const r = useRec(); const { t } = useT();
  if (!r.on) return null;
  const n = openCount(r); const all = diffsFor(r).length;
  return (
    <div className="rc-band" role="status">
      <DatabaseWarning20Regular /><b>{t('Recovery mode')}</b><span>{t('since')} {r.since}. {t('Nothing reaches Azure except Overwrite; Commits and Deployments wait.')}</span>
      {locked(r) ? <em>{t('Move or Copy not chosen')}</em> : <em>{n} {t('of')} {all} {t('differences open')}</em>}
      <span className="sp" /><button onClick={onOpen}>{t('Open Recovery')}<ArrowRight16Regular /></button>
    </div>
  );
}

// ---------- What everyone without InstanceAdmin sees while the mode lasts.
export function RecoverySignIn() {
  const r = useRec(); const se = useSession(); const { t } = useT();
  return (
    <div className="noaccess rc-signin">
      <div className="na-card">
        <Brand />
        <span className="rc-mark big"><DatabaseWarning20Regular /></span>
        <h1>{t('nsgfw is in Recovery mode')}</h1>
        <p>{t('Since')} {r.since} {t('an admin compares the database with Azure.')} {r.trigger === 'manual' ? <>{t('Reason:')} “{r.reason}”</> : t(r.trigger === 'identity' ? 'nsgfw was moved or copied.' : 'nsgfw was recovered from a backup.')}</p>
        <p>{t('Until the admin ends the mode, only holders of the Entra app role InstanceAdmin can sign in. Your session ended; nothing reaches Azure meanwhile.')}</p>
        {(r.trigger === 'marker' || r.trigger === 'version') && <p className="rc-warn"><Info16Regular />{t('The database holds the state of')} {FACTS.restorePoint}. {t('Edits, Approvals and Commits after that may be gone. Your Change sets show what is left once you are back.')}</p>}
        <p className="muted">{t('You are signed in as')} <b>{se.user.name}</b>. {t('Questions:')} {se.contact}</p>
        <div className="na-f"><Button appearance="primary" onClick={() => location.reload()}>{t('Try again')}</Button><Button onClick={() => se.setSignout('manual')}>{t('Sign in with another account')}</Button></div>
        <p className="muted small">{t('The attempt is recorded in the audit log.')}</p>
      </div>
    </div>
  );
}

export const useRecovery = () => { const r = useRec(); return useMemo(() => ({ on: r.on, open: openCount(r) }), [r]); };
