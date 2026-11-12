// PROTOTYPE, throwaway. Issue 43: Change set management. The switcher in the commit bar, the Details tab of the Change set panel,
// the hand-over and co-editors, Take over and Dismiss for Change sets of the tool, and the list of all Change sets.
import { useMemo, useState } from 'react';
import { Button, Input, Textarea, Popover, PopoverTrigger, PopoverSurface } from '@fluentui/react-components';
import { ChevronDown12Regular, Add16Regular, Checkmark16Regular, Warning16Filled, PersonArrowRight16Regular, PeopleAdd16Regular, Dismiss12Regular, Search16Regular,
  TicketDiagonal16Regular, HandRight16Regular, LockClosed12Regular } from '@fluentui/react-icons';
import { useStore, otherSets, alsoChanged, type CsState } from './store';
import { useCs, setCs, patchMine, patchTool, curMeta, nameOf, who, initialsOf, openMine, getCs, type Mine, type ToolSet } from './cs43';
import { useFlow, setCurName, nowLabel } from './flow';
import { usePreview, useApproval } from './ChangeViews';
import { Track } from './Pages';
import { principals } from './access';
import { useSession } from './session';
import { useT } from './i18n';
import './cs43.css';

setCurName(nameOf(curMeta()));

// ---------- Switching: the current Change set goes to a snapshot, the chosen one comes back. Rules it changed carry "in another Change set".
export function useCsSwitch() {
  const s = useStore(); const se = useSession(); const { t } = useT();
  const park = () => {
    const c = getCs(); const m = curMeta(c); const snap = s.snapshot(); const label = nameOf(m);
    for (const e of snap.edits) if (!['folder', 'zone', 'object', 'setting'].includes(e.kind)) alsoChanged.set(e.ruleId, { set: label, by: 'you' });
    patchMine(m.id, { snap });
  };
  const bring = (id: string) => {
    const m = getCs().mine.find(x => x.id === id)!;
    for (const [k, v] of [...alsoChanged]) if (v.set.startsWith(id)) alsoChanged.delete(k);
    s.load(m.snap); setCs({ current: id }); setCurName(nameOf(m));
  };
  return {
    switchTo(id: string) { if (id === getCs().current) return; park(); bring(id); se.toast(`${id} is your current Change set. New edits land there.`); },
    newSet() {
      park(); const c = getCs(); const id = `CHG-${c.next}`;
      setCs({ next: c.next + 1, mine: [{ id, description: '', ticket: '', owner: 'you', coeditors: [], opened: `today ${nowLabel()}` }, ...getCs().mine] });
      bring(id); se.toast(`${id} is your new current Change set. The others keep their edits.`); return id;
    },
    // Discard ends the Change set (state Discarded). Your next edit starts a new one, unless another Change set of yours is still open.
    discard() {
      const c = getCs(); const m = curMeta(c); s.discard(); patchMine(m.id, { discarded: { by: 'you', at: `today ${nowLabel()}` }, snap: undefined });
      const next = openMine(getCs()).find(x => x.id !== m.id);
      if (next) bring(next.id); else { const id = `CHG-${getCs().next}`; setCs({ next: getCs().next + 1, mine: [{ id, description: '', ticket: '', owner: 'you', coeditors: [], opened: `today ${nowLabel()}` }, ...getCs().mine] }); bring(id); }
      se.toast(t('Change set discarded.'));
    },
  };
}

// The rules of the lifecycle table that the commit bar and the buttons need: the description before Submit, the owner submits.
export function useCsGate() {
  const c = useCs(); const m = curMeta(c); const se = useSession();
  const owner = m.owner === 'you';
  return { meta: m, missing: !m.description.trim(), owner, canSubmit: owner, canDiscard: owner || se.anyAdmin,
    submitWhy: !owner ? `Only the Change set owner, ${who(m.owner)}, submits.` : !m.description.trim() ? 'Add a description first. It goes into the Version and the audit log.' : null };
}

// ---------- The switcher: the name in the commit bar is a menu of the person's open Change sets.
export function CsSwitcher({ onAbout }: { onAbout: () => void }) {
  const c = useCs(); const s = useStore(); const { t } = useT(); const sw = useCsSwitch(); const [open, setOpen] = useState(false);
  const m = curMeta(c); const list = openMine(c);
  const edits = (x: Mine) => (x.id === c.current ? s.edits.length : x.snap?.edits.length ?? 0);
  const st = (x: Mine): CsState => (x.id === c.current ? s.state : x.snap?.state ?? 'Open');
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="above-start">
      <PopoverTrigger disableButtonEnhancement>
        <button className="cs-sw" title={t('Switch the current Change set')}><b>{m.id}</b>{m.description.trim() ? <span>{m.description}</span> : <span className="none">{t('no description')}</span>}<ChevronDown12Regular /></button>
      </PopoverTrigger>
      <PopoverSurface className="cs-swm">
        <div className="panel-h">{t('Your Change sets')}</div>
        <p className="muted">{t('New edits land in the current one. The others keep their edits and wait.')}</p>
        {list.map(x => (
          <button key={x.id} className={`cs-swi ${x.id === c.current ? 'on' : ''}`} onClick={() => { sw.switchTo(x.id); setOpen(false); }}>
            <span className="ck">{x.id === c.current && <Checkmark16Regular />}</span>
            <span className="nm"><b>{x.id}</b> {x.description.trim() || <i>{t('no description yet')}</i>}</span>
            <span className="mt">{t(st(x))}, {edits(x)} {t(edits(x) === 1 ? 'edit' : 'edits')}{x.owner !== 'you' && <>, {t('owner')} {who(x.owner)}</>}</span>
          </button>))}
        <div className="cs-swf">
          <Button size="small" icon={<Add16Regular />} onClick={() => { sw.newSet(); setOpen(false); onAbout(); }}>{t('New Change set')}</Button>
          <Button size="small" appearance="subtle" onClick={() => { setOpen(false); onAbout(); }}>{t('Details of')} {m.id}</Button>
        </div>
      </PopoverSurface>
    </Popover>
  );
}

// The commit bar names a missing description in amber; a click opens the Details tab.
export function DescFlag({ onOpen }: { onOpen: () => void }) {
  const g = useCsGate(); const { t } = useT(); const s = useStore();
  if (!g.missing || !s.edits.length) return null;
  return <button className="warnb" onClick={onOpen}><Warning16Filled />{t('Description missing')}</button>;
}

// ---------- The Details tab of the Change set panel.
export function CsAbout() {
  const c = useCs(); const s = useStore(); const se = useSession(); const { t } = useT(); const sw = useCsSwitch(); const pv = usePreview(); const ap = useApproval(pv);
  const m = curMeta(c); const g = useCsGate(); const [pick, setPick] = useState<null | 'co' | 'hand'>(null);
  const authors = useMemo(() => { const n = new Map<string, number>(); for (const e of s.edits) n.set(e.by, (n.get(e.by) ?? 0) + 1); return [...n]; }, [s.edits]);
  const editable = m.owner === 'you' || m.coeditors.includes('you');
  return (
    <div className="csa">
      <div className="csa-h"><b>{m.id}</b><span className="tag accent">{t('current')}</span><span className="muted">{t(s.state === 'Committed' ? 'Committed' : ap.eff)}, {t('opened')} {m.opened}</span></div>
      <label className="csa-l" htmlFor="csa-d">{t('Description')} <span className="req">{t('required before Submit')}</span></label>
      <Textarea id="csa-d" disabled={!editable} value={m.description} onChange={(_, d) => { patchMine(m.id, { description: d.value }); setCurName(nameOf({ ...m, description: d.value })); }}
        placeholder={t('What this Change set does and why')} resize="vertical" className={g.missing && s.edits.length ? 'need' : ''} />
      <p className="muted">{t('It names the Change set everywhere and goes into the Version and the audit log. Changing it resets no Approval.')}</p>
      <label className="csa-l" htmlFor="csa-t">{t('Ticket reference')} <span className="muted">{t('optional')}</span></label>
      <Input id="csa-t" disabled={!editable} value={m.ticket} onChange={(_, d) => patchMine(m.id, { ticket: d.value })} contentBefore={<TicketDiagonal16Regular />} placeholder="RFC-2291" />

      <h3>{t('People')}</h3>
      <div className="csa-p">
        <div className="csa-pr"><span className="who">{initialsOf(m.owner)}</span><div><b>{who(m.owner)}</b><span>{t('Change set owner: submits, commits, discards and adds co-editors')}</span></div>
          {(g.owner || se.anyAdmin) && <Button size="small" icon={<PersonArrowRight16Regular />} onClick={() => setPick('hand')}>{t('Hand over…')}</Button>}</div>
        {m.coeditors.map(p => (
          <div key={p} className="csa-pr"><span className="who">{initialsOf(p)}</span><div><b>{who(p)}</b><span>{t('Co-editor: edits, and commits once Approved')}{authors.some(([a]) => a === p) ? '' : `. ${t('No edit yet')}`}</span></div>
            {g.owner && <button className="ib" title={t('Remove')} onClick={() => patchMine(m.id, { coeditors: m.coeditors.filter(x => x !== p) })}><Dismiss12Regular /></button>}</div>))}
        {g.owner && <Button size="small" appearance="subtle" icon={<PeopleAdd16Regular />} onClick={() => setPick('co')}>{t('Add co-editor')}</Button>}
      </div>
      <p className="muted csa-auth">{t('Authors')}: {authors.length ? authors.map(([a, n]) => `${who(a)} (${n} ${t(n === 1 ? 'edit' : 'edits')})`).join(', ') : t('nobody yet')}. {t('Every person with an edit is an Author. Under four-eyes, an Author does not approve.')}</p>

      <h3>{t('Change set')}</h3>
      <dl className="kv"><dt>{t('Based on')}</dt><dd>{t('Version')} {s.version}</dd><dt>{t('Edits')}</dt><dd>{s.edits.length}</dd><dt>{t('Affected Zones')}</dt><dd>{pv.affected.length.toLocaleString()}</dd></dl>
      <div className="csa-f">
        <Button size="small" icon={<Add16Regular />} onClick={() => sw.newSet()}>{t('New Change set')}</Button>
        <span className="sp" />
        <Button size="small" appearance="subtle" className="danger" disabled={!g.canDiscard || s.state === 'Committed'} title={!g.canDiscard ? t('The Change set owner or an admin discards.') : undefined} onClick={() => sw.discard()}>{t('Discard Change set')}</Button>
      </div>
      {pick && <PersonPicker mode={pick} m={m} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- Picking a person: a co-editor, or the new Change set owner.
function PersonPicker({ mode, m, onClose }: { mode: 'co' | 'hand'; m: Mine; onClose: () => void }) {
  const { t } = useT(); const se = useSession(); const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null);
  const list = principals.filter(p => p.kind === 'user' && !p.deleted && p.id !== se.user.id && p.id !== m.owner && !(mode === 'co' && m.coeditors.includes(p.id)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const done = () => {
    if (!sel) return;
    if (mode === 'co') { patchMine(m.id, { coeditors: [...m.coeditors, sel] }); se.toast(`${who(sel)} is a co-editor of ${m.id}.`); }
    else { patchMine(m.id, { owner: sel, coeditors: [...new Set([...m.coeditors.filter(x => x !== sel), ...(m.owner === 'you' ? ['you'] : [m.owner])])], handedAt: nowLabel() }); se.toast(`${m.id} is handed over to ${who(sel)}. It is in their inbox; you stay a co-editor.`); }
    onClose();
  };
  return (
    <div className="modal-bg" onMouseDown={onClose}><div className="modal" role="dialog" aria-label={t(mode === 'co' ? 'Add co-editor' : 'Hand over')} onMouseDown={e => e.stopPropagation()}>
      <h2>{t(mode === 'co' ? 'Add a co-editor' : 'Hand over')} {m.id}</h2>
      <p>{t(mode === 'co' ? 'A co-editor edits this Change set like you and can commit it once it is Approved. Their edits make them an Author.' : 'The new Change set owner submits, commits and discards it, and adds co-editors. You stay a co-editor. The state and the Approvals stay.')}</p>
      <Input value={q} onChange={(_, d) => setQ(d.value)} contentBefore={<Search16Regular />} placeholder={t('Name in Entra')} autoFocus />
      <div className="pp-l">{list.map(p => <button key={p.id} className={`pp-i ${sel === p.id ? 'on' : ''}`} onClick={() => setSel(p.id)}><span className="who">{initialsOf(p.id)}</span><b>{p.name}</b><span className="muted">{p.upn}</span></button>)}</div>
      {mode === 'hand' && m.owner !== 'you' && <p className="muted">{t('You hand it over as an admin of one of its Affected Zones.')}</p>}
      <div className="modal-f"><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={!sel} onClick={done}>{t(mode === 'co' ? 'Add' : 'Hand over')}</Button></div>
    </div></div>
  );
}

// ---------- Change sets of the tool: Take over and Dismiss.
function ToolDialog({ x, mode, onClose }: { x: ToolSet; mode: 'take' | 'dismiss'; onClose: () => void }) {
  const { t } = useT(); const se = useSession(); const [why, setWhy] = useState('');
  const go = () => {
    if (mode === 'take') { patchTool(x.id, { owner: 'you' }); se.toast(`You are the Change set owner of ${x.id}. The tool no longer regenerates it.`); }
    else { patchTool(x.id, { dismissed: { by: 'you', at: `today ${nowLabel()}`, reason: why } }); se.log({ cat: 'cs', action: 'Dismissed a Change set of the tool', object: x.id, scopes: [{ kind: 'instance', id: 'instance' }], result: 'ok', detail: `Reason: ${why}` }); se.toast(`${x.id} is discarded. The tool does not prepare it again for this cause.`); }
    onClose();
  };
  return (
    <div className="modal-bg" onMouseDown={onClose}><div className="modal wide" role="dialog" aria-label={t(mode === 'take' ? 'Take over' : 'Dismiss')} onMouseDown={e => e.stopPropagation()}>
      <h2>{t(mode === 'take' ? 'Take over' : 'Dismiss')} {x.id}</h2>
      <p><b>{t(x.title)}</b></p>
      <p className="muted">{t('Cause')}: {t(x.cause)}{x.note && <> {t(x.note)}</>}</p>
      {mode === 'take' ? <ul className="tk-l">
        <li>{t('You become its Change set owner and an Author. Under four-eyes, you then do not approve it.')}</li>
        <li>{t('The tool stops regenerating it. If the cause changes again in Azure, the tool prepares a new Change set.')}</li>
        <li>{t('The rules for the Commit still apply: it needs the Approval of')} {x.zones.join(', ')} ({t(x.env)}, {t(x.level)}).</li>
      </ul> : <>
        <ul className="tk-l">
          <li>{t('It ends Discarded. Nothing of it reaches a Version.')}</li>
          <li>{t('The tool does not prepare it again for this cause. A new cause starts a new Change set.')}</li>
          <li>{t('The dismissal and its reason go into the audit log.')}</li>
        </ul>
        <label className="rc-lbl">{t('Reason')}</label>
        <Textarea value={why} onChange={(_, d) => setWhy(d.value)} placeholder={t('For example: the file server migration needs the deny Rule until 2026-12-15')} style={{ width: '100%' }} /></>}
      <div className="modal-f"><Button onClick={onClose}>{t('Cancel')}</Button><Button appearance="primary" disabled={mode === 'dismiss' && !why.trim()} onClick={go}>{t(mode === 'take' ? 'Take over' : 'Dismiss')}</Button></div>
    </div></div>
  );
}

// ---------- All Change sets: the person's own first, every state, with the actions each one allows.
type Row = { id: string; title: string; ticket?: string; owner: string; co: string[]; state: CsState | 'Discarded'; meta: string; tags?: JSX.Element | null; warnAt?: number;
  mine: boolean; tool?: ToolSet; current?: boolean; open?: () => void; make?: () => void };
const stepOf: Record<CsState, number> = { Open: 0, Submitted: 2, Approved: 3, Committed: 4 };
const filters: [string, string][] = [['mine', 'Yours'], ['all', 'All'], ['Open', 'Open'], ['Submitted', 'Submitted'], ['Approved', 'Approved'], ['Committed', 'Committed'], ['Discarded', 'Discarded'], ['tool', 'By the tool']];

export function AllSets({ onCurrent }: { onCurrent: () => void }) {
  const c = useCs(); const s = useStore(); const f = useFlow(); const se = useSession(); const { t } = useT(); const sw = useCsSwitch(); const pv = usePreview(); const ap = useApproval(pv);
  const [k, setK] = useState('mine'); const [q, setQ] = useState(''); const [dlg, setDlg] = useState<{ x: ToolSet; mode: 'take' | 'dismiss' } | null>(null);
  const n = (v: number, one: string, many: string) => `${v} ${t(v === 1 ? one : many)}`;
  const behind = (base: number) => (f.latest > base ? `, ${f.latest - base} ${t('behind')}` : '');
  const admin = se.anyAdmin;
  const rows: Row[] = [];
  for (const m of c.mine) {
    const cur = m.id === c.current; const st: CsState | 'Discarded' = m.discarded ? 'Discarded' : cur ? (s.state === 'Committed' ? 'Committed' : ap.eff) : m.snap?.state ?? 'Open';
    const ed = cur ? s.edits.length : m.snap?.edits.length ?? 0;
    rows.push({ id: m.id, title: m.description, ticket: m.ticket, owner: m.owner, co: m.coeditors, state: st, mine: true, current: cur,
      meta: m.discarded ? `${t('discarded by')} ${who(m.discarded.by)} ${m.discarded.at}` : `${n(ed, 'edit', 'edits')}${cur ? `, ${n(pv.affected.length, 'Zone', 'Zones')}` : ''}, ${t('opened')} ${m.opened}, ${t('based on Version')} ${cur ? s.version : m.snap?.version ?? s.version}${behind(cur ? s.version : m.snap?.version ?? s.version)}`,
      tags: <>{cur && <span className="tag accent">{t('current')}</span>}{!m.discarded && !m.description.trim() && <span className="tag amber">{t('Description missing')}</span>}{m.handedAt && <span className="tag">{t('handed over')} {m.handedAt}</span>}{cur && f.pending && <span className="tag red">{t('Rebase needed')}</span>}</>,
      open: cur ? onCurrent : undefined, make: !cur && !m.discarded ? () => sw.switchTo(m.id) : undefined });
  }
  rows.push({ id: 'cs-6', title: 'Open RDP for vendor', owner: 'you', co: [], state: f.csState['cs-6'] ?? 'Open', mine: true, meta: `1 ${t('edit')}, 1 ${t('Zone')}, ${t('based on Version')} 1290${behind(1290)}`,
    tags: f.csState['cs-6'] ? null : <span className="tag red">{t('Rejected')}</span>, open: () => f.openCs('cs-6') });
  f.created.forEach(x => rows.push({ id: x.id, title: `${x.kind === 'revert' ? 'Revert Version' : 'Restore to Version'} ${x.of}`, owner: x.author, co: [], mine: x.author === 'you',
    state: f.decisions[x.id]?.kind === 'approved' ? 'Committed' : f.csState[x.id] ?? (x.author === 'nsgfw' ? 'Submitted' : 'Open'), meta: `${t(x.kind === 'revert' ? 'Revert' : 'Restore')}, ${t('based on Version')} ${f.latest}`,
    tags: x.author === 'nsgfw' ? <span className="tag">{t('prepared by the tool')}</span> : null, open: () => f.openCs(x.id) }));
  if (f.retrans) rows.push({ id: 'rt-1', title: 'Re-translation for engine 1.6.0', owner: 'nsgfw', co: [], mine: false, state: f.decisions['rt-1'] ? 'Committed' : 'Submitted', meta: `${t('no edits')}, 37 ${t('Zones')}, Production`, tags: <span className="tag amber">{t('Commits in Production wait')}</span>, open: () => f.openCs('rt-1') });
  for (const x of c.tool) {
    const st = x.dismissed ? 'Discarded' : x.state;
    rows.push({ id: x.id, title: x.title, owner: x.owner ?? 'nsgfw', co: [], mine: x.owner === 'you', tool: x, state: st,
      meta: x.dismissed ? `${t('dismissed by')} ${who(x.dismissed.by)} ${x.dismissed.at}: “${x.dismissed.reason}”` : `${t(x.cause)}${x.note ? ` ${t(x.note)}` : ''}`,
      tags: <>{!x.owner && <span className="tag">{t('prepared by the tool')}</span>}{x.owner && <span className="tag accent">{t('taken over by you')}</span>}{x.flag === 'rejected' && !x.dismissed && <span className="tag red">{t('Rejected')}</span>}{x.flag === 'conflict' && !x.dismissed && <span className="tag red">{t('Conflict')}</span>}</> });
  }
  const dec = (id: string, st: CsState): CsState => (f.decisions[id]?.kind === 'rejected' ? 'Open' : f.decisions[id]?.kind === 'approved' && st === 'Submitted' ? 'Approved' : st);
  for (const x of otherSets) {
    const st = x.id === 'cs-2' && f.latest >= 1291 ? 'Committed' as CsState : dec(x.id, x.state);
    rows.push({ id: x.id, title: x.name, owner: x.owner, co: x.authors.filter(a => a !== x.owner), mine: false, state: st,
      meta: `${n(x.edits, 'edit', 'edits')}, ${n(x.affected, 'Zone', 'Zones')}, ${t('based on Version')} ${x.base}${st === 'Committed' ? '' : behind(x.base)}${x.scheduled ? `, ${t('Scheduled')} ${x.scheduled}` : ''}`,
      tags: <>{x.rebase && <span className="tag red">{t('Rebase needed')}</span>}{x.emergency && <span className="tag amber">{t('Emergency Commit')}</span>}</>,
      open: x.id === 'cs-2' && st === 'Committed' ? undefined : () => f.openCs(x.id), warnAt: x.emergency && !f.decisions['cs-5'] ? 2 : undefined });
  }
  const match = (r: Row) => (k === 'mine' ? r.mine : k === 'all' ? true : k === 'tool' ? !!r.tool || r.owner === 'nsgfw' : r.state === k);
  const ql = q.trim().toLowerCase();
  const shown = rows.filter(r => match(r) && (!ql || `${r.id} ${r.title} ${r.ticket ?? ''} ${who(r.owner)}`.toLowerCase().includes(ql)));
  return (
    <>
      <div className="chipbar cs-chips">
        {filters.map(([key, l]) => { const v = rows.filter(r => (key === 'mine' ? r.mine : key === 'all' ? true : key === 'tool' ? !!r.tool || r.owner === 'nsgfw' : r.state === key)).length;
          return <button key={key} className={`chip ${k === key ? 'on' : ''} ${v ? '' : 'zero'}`} disabled={!v && k !== key} onClick={() => setK(key)}>{t(l)}<i>{v}</i></button>; })}
        <span className="sp" /><Input className="search" contentBefore={<Search16Regular />} placeholder={t('Change set, description, ticket or person')} value={q} onChange={(_, d) => setQ(d.value)} />
      </div>
      <div className="sheet sets cs-list">
        {shown.map(r => {
          const x = r.tool; const late = x && (x.flag === 'rejected' || x.flag === 'conflict');
          const canTake = x && !x.owner && !x.dismissed && (late ? admin : se.canEdit); const canDismiss = x && !x.owner && !x.dismissed && late;
          return (
            <div key={r.id} className={`setrow cs-row ${r.current ? 'current' : ''} ${r.state === 'Discarded' ? 'gone' : ''} ${r.open ? '' : 'static'}`} onClick={r.open}>
              <span className="avs"><span className="who" title={who(r.owner)}>{initialsOf(r.owner)}</span>{r.co.slice(0, 2).map(p => <span key={p} className="who co" title={`${t('co-editor')}: ${who(p)}`}>{initialsOf(p)}</span>)}</span>
              <div className="set-n"><b><span className="cs-id">{r.id.startsWith('CHG-') ? r.id : ''}</span><span className="cs-ti">{r.title.trim() || <i className="none">{t('no description yet')}</i>}</span>{r.ticket && <span className="cs-tk"><TicketDiagonal16Regular />{r.ticket}</span>}{r.tags}</b><span className="muted">{r.meta}</span></div>
              {r.state === 'Discarded' ? <span className="cs-gone">{t('Discarded')}</span> : <Track at={stepOf[r.state]} labels warnAt={r.warnAt} />}
              <span className="cs-act" onClick={e => e.stopPropagation()}>
                {r.make && <Button size="small" onClick={r.make}>{t('Make current')}</Button>}
                {canTake && <Button size="small" icon={<HandRight16Regular />} onClick={() => setDlg({ x: x!, mode: 'take' })}>{t('Take over')}</Button>}
                {canDismiss && <Button size="small" appearance="subtle" onClick={() => setDlg({ x: x!, mode: 'dismiss' })}>{t('Dismiss…')}</Button>}
                {x && !x.owner && !x.dismissed && late && !admin && <span className="cs-lock" title={t('Once rejected or in conflict, only an admin of its Affected Zones takes it over or dismisses it.')}><LockClosed12Regular />{t('admins only')}</span>}
              </span>
            </div>); })}
        {!shown.length && <div className="empty"><b>{t('Nothing matches')}</b><p>{t('Try another filter.')}</p></div>}
      </div>
      {dlg && <ToolDialog x={dlg.x} mode={dlg.mode} onClose={() => setDlg(null)} />}
    </>
  );
}

// The inbox rows for Change sets of the tool that wait for an admin (rejected or with a conflict).
export function useToolInbox(go: () => void) {
  const c = useCs(); const se = useSession();
  if (!se.anyAdmin) return [];
  return c.tool.filter(x => x.flag && !x.owner && !x.dismissed).map(x => ({ id: x.id, kind: (x.flag === 'rejected' ? 'rejected' : 'conflict') as 'rejected' | 'conflict',
    text: `The tool’s Change set “${x.title}” waits for an admin: ${x.note} Take it over or dismiss it.`, when: x.flag === 'rejected' ? 'today 07:12' : 'today 06:30', action: 'Open', go }));
}

// ---------- The line under the title of the Review: the description in place when it is missing, else ticket and people.
export function CsLine() {
  const c = useCs(); const { t } = useT(); const m = curMeta(c); const [edit, setEdit] = useState(false);
  const set = (p: Partial<Mine>) => { patchMine(m.id, p); if (p.description !== undefined) setCurName(nameOf({ ...m, ...p })); };
  if (!m.description.trim() || edit) return (
    <div className="rv-csl need">
      <Input autoFocus={edit} value={m.description} onChange={(_, d) => set({ description: d.value })} placeholder={t('Describe this Change set: what it does and why')} className="d" />
      <Input value={m.ticket} onChange={(_, d) => set({ ticket: d.value })} placeholder={t('Ticket (optional)')} contentBefore={<TicketDiagonal16Regular />} className="tk" />
      {edit ? <Button size="small" onClick={() => setEdit(false)}>{t('Done')}</Button> : <span className="hint"><Warning16Filled />{t('Needed before Submit')}</span>}
    </div>);
  return (
    <div className="rv-csl">
      {m.ticket && <span className="cs-tk"><TicketDiagonal16Regular />{m.ticket}</span>}
      <span>{t('Change set owner')} <b>{who(m.owner)}</b></span>
      {m.coeditors.length > 0 && <span>{t(m.coeditors.length === 1 ? 'co-editor' : 'co-editors')} <b>{m.coeditors.map(who).join(', ')}</b></span>}
      <button className="link" onClick={() => setEdit(true)}>{t('Edit description')}</button>
    </div>);
}
