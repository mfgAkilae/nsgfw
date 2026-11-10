// PROTOTYPE, throwaway. The console shell: rail, Rule base with filter chips and Zone lens, right dock (Rule inspector, Change set),
// commit bar and jump palette. One design, light and dark.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Switch, Tooltip, Popover, PopoverTrigger, PopoverSurface } from '@fluentui/react-components';
import { Add16Regular, Search16Regular, Dismiss16Regular, PanelRight20Regular, TextBulletListSquare20Regular, Grid20Regular, Box20Regular, BranchFork20Regular,
  WeatherMoon20Regular, WeatherSunny20Regular, Copy16Regular, Delete16Regular, Eye16Regular, EyeOff16Regular, ArrowSort16Regular, Send16Regular, ArrowRight12Filled,
  Checkmark12Filled, Dismiss12Filled, Flash16Regular, ChevronDown12Regular, TextLineSpacing20Regular, Folder16Regular, FolderAdd16Regular, FolderArrowRight16Regular, ArrowMaximizeVertical20Regular, ArrowMinimizeVertical20Regular, LockClosed16Regular, Warning16Filled, ShieldError16Filled, PeopleSwap16Regular, LayerDiagonal16Regular, ShieldPerson20Regular, LockClosed12Regular } from '@fluentui/react-icons';
import { RuleGrid, RuleGridHandle, FilterKey, countFilters, systemTop, systemBottom, SysRow, compact } from './RuleGrid';
import { ZoneGrid, Bar, LIMITS, EgressBadge, Flags } from './ZoneGrid';
import { Glyph } from './Glyph';
import { ChangesList, PreviewView, WriteOrderView, ApprovalView, PolicyView, InboxButton, MoveDialog, EmergencyDialog, usePreview, useApproval } from './ChangeViews';
import { Brand, useDebounced, reportReady } from './bits';
import { ProtoButton } from './Proto';
import { RuleEditor } from './Editor';
import { Review } from './Review';
import { ObjectLibrary, ChangeSetsPage, Track } from './Pages';
import { useStore, placement, cost, alsoChanged } from './store';
import { zones, zoneById, envs, ref, svcById } from './data';
import { useT } from './i18n';
import { useMode } from './theme';
import { useSession, useReadFilter, useGate, AccountButton, SessionLayer, NoAccessPage, StepUpLock } from './session';
import { AdminPage, AdminSec, useAdminNav } from './Admin';

type Page = 'rules' | 'zones' | 'objects' | 'sets' | 'admin';
type CsTab = 'changes' | 'preview' | 'order' | 'approval' | 'policy';
const typing = () => { const el = document.activeElement as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest('.ag-root-wrapper')); };

export default function Console() {
  const s = useStore(); const { t, lang, setLang } = useT(); const { mode, toggle } = useMode(); const pv = usePreview(); const ap = useApproval(pv);
  // Issue 38: who is signed in decides what the Rule base shows (read filter by Coverage) and whether it can be edited.
  const se = useSession(); const adminNav = useAdminNav(); const [adminSec, setAdminSec] = useState<AdminSec>(() => (new URLSearchParams(location.search).get('sec') as AdminSec) || 'setup');
  const rf = useReadFilter(s.rules, pv.affected.map(a => a.zone), s.edits.length > 0); const ro = se.readOnly;
  const [page, setPage] = useState<Page>(() => (new URLSearchParams(location.search).get('page') as Page) || 'rules');
  const [lens, setLens] = useState<{ zid: string; dir: 'in' | 'out' } | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all'); const [q, dq, setQ] = useDebounced();
  const [dense, setDense] = useState(false); const [bands, setBands] = useState(true);
  const [sel, setSel] = useState<string[]>([]); const [focused, setFocused] = useState<string | null>(null);
  const [dock, setDock] = useState<{ open: boolean; tab: 'rule' | 'cs'; cs: CsTab; auto: boolean }>({ open: false, tab: 'rule', cs: 'preview', auto: true });
  const [palette, setPalette] = useState<false | 'all' | 'zone'>(false); const [moveIds, setMoveIds] = useState<string[] | null>(null);
  // Collapsing is a view setting of the person, not an edit to the Rule base.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(s.folders.slice(2).map(f => f.id)));
  const [folderFor, setFolderFor] = useState<string[] | null>(null); const [fresh, setFresh] = useState<string | null>(null); const [review, setReview] = useState(false);
  const toggleFolder = (id: string) => setCollapsed(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allCollapsed = s.folders.length > 0 && s.folders.every(f => collapsed.has(f.id));
  const unfold = (ruleId: string) => { const f = s.rules.find(r => r.id === ruleId)?.folder; if (f) setCollapsed(c => { if (!c.has(f)) return c; const n = new Set(c); n.delete(f); return n; }); };
  const grid = useRef<RuleGridHandle>(null); const search = useRef<HTMLInputElement>(null);

  const z = lens ? zoneById.get(lens.zid)! : null;
  const rows = useMemo(() => (!lens ? s.rules : s.rules.filter(r => { const p = placement(r); return lens.dir === 'in' ? p.dst.includes(lens.zid) : p.src.includes(lens.zid); })), [s.rules, lens]);
  const seen = useMemo(() => (rf.visible ? rows.filter(r => rf.visible!.has(r.id)) : rows), [rows, rf.visible]);
  const counts = useMemo(() => { const c = countFilters(seen, s.status); if (lens) c.changed = seen.filter(r => s.status.has(r.id)).length; return c; }, [seen, s.status, lens]);
  const bandRows = useMemo<{ top: SysRow[]; bottom: SysRow[] } | null>(() => {
    if (!bands) return null;
    if (!z || !lens) return { top: systemTop, bottom: systemBottom };
    const inb = lens.dir === 'in';
    return {
      top: [{ id: 'sys-pe', system: 'pe', name: 'Platform exceptions', text: inb ? 'Azure Load Balancer health probes to this Zone are allowed, priority 100.' : 'None outbound.' }],
      bottom: [
        { id: 'sys-intra', system: 'intra', name: 'Intra-zone default', text: `Traffic inside ${z.name} is allowed.` },
        ...(z.inherited ? [{ id: 'sys-inh', system: 'inherited', name: 'Inherited defaults', text: inb ? 'VirtualNetwork to this Zone is allowed, as before onboarding.' : 'This Zone to VirtualNetwork and Internet is allowed, as before onboarding.' } as SysRow] : []),
        ...(!inb && z.egress === 'dest' ? [{ id: 'sys-egress', system: 'egress', name: 'Egress posture', text: 'Outbound to the Internal address space is open. The destination Zone decides.' } as SysRow] : []),
        { id: 'sys-deny', system: 'denyall', name: 'Deny-all rules', text: inb ? 'Everything else to this Zone is denied, priority 4096.' : 'Everything else from this Zone is denied, priority 4096.' },
        { id: 'sys-az', system: 'azure', name: 'Azure default rules', text: 'Read-only and never reached.' },
      ],
    };
  }, [bands, z, lens]);

  const openDock = (tab: 'rule' | 'cs', cs?: CsTab) => setDock(d => ({ ...d, open: true, tab, cs: cs ?? d.cs }));
  const focusRule = (id: string) => { setFocused(id); setDock(d => (d.open && d.tab !== 'rule' ? d : d)); };
  const openRule = (id: string) => { setFocused(id); openDock('rule'); };
  const jumpToRule = (id: string) => { unfold(id); setPage('rules'); setLens(null); setFilter('all'); setQ(''); setTimeout(() => { grid.current?.reveal(id); openRule(id); }, 80); };
  const openZone = (zid: string) => { setPage('rules'); setLens({ zid, dir: 'in' }); setFilter('all'); setQ(''); };
  const newRule = () => { if (ro) return; setPage('rules'); if (focused) unfold(focused); const id = s.addRule(focused ?? undefined); setFresh(id); setTimeout(() => { grid.current?.reveal(id); openRule(id); }, 80); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => (p ? false : 'all')); return; }
      if (e.key === 'Escape') setPalette(false);
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPage('rules'); setTimeout(() => search.current?.focus(), 30); }
      if (e.key === 'n') { e.preventDefault(); newRule(); }
      if (e.key === 'p') setDock(d => (d.open && d.tab === 'cs' ? { ...d, open: false, auto: false } : { ...d, open: true, tab: 'cs' }));
      if (e.key === 'i') setDock(d => (d.open && d.tab === 'rule' ? { ...d, open: false, auto: false } : { ...d, open: true, tab: 'rule' }));
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const nav: [Page, string, JSX.Element][] = [['rules', 'Rules', <TextBulletListSquare20Regular />], ['zones', 'Zones', <Grid20Regular />], ['objects', 'Objects', <Box20Regular />], ['sets', 'Change sets', <BranchFork20Regular />], ['admin', adminNav.label, <ShieldPerson20Regular />]];
  const chips: [FilterKey, string][] = [['all', 'All'], ['deny', 'Deny'], ['disabled', 'Disabled'], ['expiring', 'Expiring'], ['findings', 'With findings'], ['unused', 'No hits']];
  const showBar = s.edits.length > 0 || s.state !== 'Open';

  // A principal without any Role sees only the no-access page (ADR 0013).
  if (se.persona.id === 'none') return <><NoAccessPage /><SessionLayer changeSet="CHG-5120" /><div className="na-proto"><ProtoButton /></div></>;

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <Brand />
        {nav.map(([k, label, icon]) => <button key={k} className={`rail-b ${page === k ? 'on' : ''}`} aria-current={page === k} onClick={() => setPage(k)}>{icon}<span>{k === 'sets' && lang === 'de' ? 'Pakete' : t(label)}</span>{k === 'admin' && adminNav.worst !== 'ok' && <i className={`hpip h-${adminNav.worst}`} />}</button>)}
        <span className="rail-sp" />
        <ProtoButton />
        <InboxButton />
        <Tooltip content={t(mode === 'dark' ? 'Light mode' : 'Dark mode')} relationship="label" positioning="after"><button className="rail-i" onClick={toggle}>{mode === 'dark' ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}</button></Tooltip>
        <Tooltip content={lang === 'en' ? 'Deutsch' : 'English'} relationship="label" positioning="after"><button className="rail-i rail-lang" onClick={() => setLang(lang === 'en' ? 'de' : 'en')}>{lang.toUpperCase()}</button></Tooltip>
        <Popover positioning="after-bottom"><PopoverTrigger disableButtonEnhancement><button className="rail-i rail-lang" title={t('Keyboard shortcuts')}>?</button></PopoverTrigger>
          <PopoverSurface style={{ width: 300, padding: '14px 18px' }}><div className="panel-h">{t('Keyboard shortcuts')}</div>
            <dl className="keys">{([['Ctrl K', 'Jump to a Rule, Zone or action'], ['/', 'Filter the Rules'], ['N', 'New Rule'], ['I', 'Rule editor'], ['P', 'Change set panel'], ['Esc', 'Close'], ['Double click', 'Edit a cell'], ['Right click', 'Everything for one Rule']] as const).map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{t(d)}</dd></div>)}</dl>
            <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>{t('The single-letter keys work while the table does not have the focus.')}</p></PopoverSurface></Popover>
        <AccountButton onAccess={se.anyAdmin ? () => { setPage('admin'); setAdminSec('access'); } : undefined} />
      </nav>

      <div className="main">
        <div className="work">
          <section className="content">
            {page === 'rules' && <>
              <header className="phead">
                <h1>{t('Rule base')}</h1><span className="ver" title={t('The committed Version your Change set is based on')}>{t('Version')} {s.version}</span>
                <button className={`lensbtn ${z ? 'on' : ''}`} onClick={() => setPalette('zone')} title={t('Show only the Rules that land on one Zone')}><Glyph kind="zone" />{z ? z.name : t('All Zones')}<ChevronDown12Regular /></button>
                <span className="sp" />
                <Input ref={search} className="search" contentBefore={<Search16Regular />} contentAfter={<kbd>/</kbd>} placeholder={t('Filter Rules by name, object, ID or ticket')} value={q} onChange={(_, d) => setQ(d.value)} />
                <button className="jump" onClick={() => setPalette('all')}>{t('Jump to')}<kbd>Ctrl K</kbd></button>
                <div className="vgroup">
                <Tooltip content={t(allCollapsed ? 'Open all Folders' : 'Close all Folders')} relationship="label"><button className="ib opt" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(s.folders.map(f => f.id)))}>{allCollapsed ? <ArrowMaximizeVertical20Regular /> : <ArrowMinimizeVertical20Regular />}</button></Tooltip>
                <Tooltip content={t(dense ? 'Comfortable rows' : 'Compact rows')} relationship="label"><button className={`ib opt ${dense ? 'on' : ''}`} onClick={() => setDense(!dense)}><TextLineSpacing20Regular /></button></Tooltip>
                <Tooltip content={t('Show what sits above and below the Rules')} relationship="label"><button className={`ib opt ${bands ? 'on' : ''}`} onClick={() => setBands(!bands)}><LockClosed16Regular /></button></Tooltip>
                <Tooltip content={t('Side panel')} relationship="label"><button className={`ib ${dock.open ? 'on' : ''}`} onClick={() => setDock(d => ({ ...d, open: !d.open, auto: false }))}><PanelRight20Regular /></button></Tooltip>
                </div>
                {ro ? <span className="readonly-b" title={t('You hold no editor Role in any Scope.')}><LockClosed12Regular />{t('Read only')}</span> : <>
                <Button icon={<FolderAdd16Regular />} onClick={() => setFolderFor(sel)} title={t('New Folder')}><span className="lbl">{t('Folder')}</span></Button>
                <Button appearance="primary" icon={<Add16Regular />} onClick={newRule}>{t('New Rule')}</Button></>}
              </header>

              {z && lens && (
                <div className="lens">
                  <div className="lens-top">
                    <span className="lens-name"><Glyph kind="zone" />{z.name}</span><span className="mono">{z.prefix}{z.extra ? ` + ${z.extra.join(', ')}` : ''}</span>
                    <span className="sp" />
                    <div className="seg2" role="group"><button className={lens.dir === 'in' ? 'on' : ''} onClick={() => setLens({ ...lens, dir: 'in' })}>{t('Inbound')}</button><button className={lens.dir === 'out' ? 'on' : ''} onClick={() => setLens({ ...lens, dir: 'out' })}>{t('Outbound')}</button></div>
                    <button className="lens-x" onClick={() => setLens(null)}><Dismiss16Regular />{t('All Rules')}</button>
                  </div>
                  <div className="lens-facts"><span>{z.vnet}</span><span>{envs.find(e => e.id === z.env)?.name}</span><EgressBadge e={z.egress} /><Flags z={z} /><span className="sp" />
                    <span>{t('NSG rules')}<Bar v={z.rules} max={LIMITS.rules} /></span><span>{t('Source addresses')}<Bar v={z.addrSrc} max={LIMITS.addr} /></span><span>{t('ASGs')}<Bar v={z.asgs} max={LIMITS.asgs} /></span></div>
                </div>
              )}

              {sel.length ? (
                <div className="chipbar selbar">
                  <b>{sel.length} {t('selected')}</b>
                  <button onClick={() => s.setEnabled(sel, true)}><Eye16Regular />{t('Enable')}</button><button onClick={() => s.setEnabled(sel, false)}><EyeOff16Regular />{t('Disable')}</button>
                  <button onClick={() => s.clone(sel)}><Copy16Regular />{t('Clone')}</button><button onClick={() => setMoveIds(sel)}><ArrowSort16Regular />{t('Move to…')}</button>
                  <button onClick={() => setFolderFor(sel)}><FolderArrowRight16Regular />{t('Move to Folder…')}</button>
                  <button className="danger" onClick={() => { s.remove(sel); grid.current?.clearSelection(); }}><Delete16Regular />{t('Delete')}</button>
                  <span className="sp" /><button onClick={() => grid.current?.clearSelection()}><Dismiss16Regular />{t('Clear selection')}</button>
                </div>
              ) : (
                <div className="chipbar">
                  {chips.map(([k, label]) => <button key={k} className={`chip ${filter === k ? 'on' : ''} c-${k} ${counts[k] ? '' : 'zero'}`} aria-pressed={filter === k} disabled={!counts[k] && filter !== k} onClick={() => setFilter(k)}>{t(label)}<i>{counts[k].toLocaleString()}</i></button>)}
                  {counts.changed > 0 && <button className={`chip c-changed ${filter === 'changed' ? 'on' : ''}`} aria-pressed={filter === 'changed'} onClick={() => setFilter('changed')}>{t('Changed')}<i>{counts.changed}</i></button>}
                  <span className="sp" /><span className="hint">{rf.visible ? <>{t('You see')} {rf.seen.toLocaleString()} {t('of')} {s.rules.length.toLocaleString()} {t('Rules: those that land on your Scopes.')}{rf.through.size > 0 && <> <span className="through">+{rf.through.size.toLocaleString()} {t('through your open Change set')}</span></>}</>
                    : lens ? `${seen.length} ${t('Rules')} ${t(lens.dir === 'in' ? 'land on this Zone inbound' : 'land on this Zone outbound')}` : t('Top-down, the first match wins. Flow data is about 70 minutes old.')}</span>
                </div>
              )}

              <div className="sheet"><RuleGrid key={lens ? `${lens.zid}-${lens.dir}` : 'all'} ref={grid} rows={rows} visible={rf.visible} through={rf.through} readOnly={ro} scoped={!!lens} collapsed={collapsed} onToggle={toggleFolder} onMoveToFolder={setFolderFor} quick={dq} filter={filter} bands={bandRows} dense={dense} focusedId={focused}
                onFocus={focusRule} onOpen={openRule} onQuick={setQ} onSelection={setSel} onMoveTo={setMoveIds} onReady={reportReady(lens ? `Zone lens, ${rows.length} Rules` : 'Rule base, 10,000 Rules')} /></div>
            </>}

            {page === 'zones' && <><header className="phead"><h1>{t('Zones')}</h1><span className="sub">{t('Every Managed NSG against its Azure limits. Click a Zone to see the Rules that land on it.')}</span></header><ZoneGrid onOpen={x => openZone(x.id)} /></>}
            {page === 'objects' && <><header className="phead"><h1>{t('Objects')}</h1><span className="sub">{t('Every object and where it is used.')}</span></header><ObjectLibrary onZone={openZone} onShowRules={name => { setPage('rules'); setLens(null); setFilter('all'); setQ(name); }} /></>}
            {page === 'admin' && <AdminPage sec={adminSec} setSec={setAdminSec} onZones={() => setPage('zones')} onRule={jumpToRule} onReview={() => setReview(true)} />}
            {page === 'sets' && <><header className="phead"><h1>{t('Change sets')}</h1><span className="sub">{t('What waits for you, and where every Change set stands.')}</span></header><ChangeSetsPage onFilter={k => { setPage('rules'); setLens(null); setFilter(k); }} onReview={() => { setPage('rules'); openDock('cs', 'preview'); }} /></>}
          </section>

          {dock.open && (
            <aside className="dock">
              <div className="dock-h">
                <div className="seg2" role="tablist"><button className={dock.tab === 'rule' ? 'on' : ''} onClick={() => setDock({ ...dock, tab: 'rule' })}>{t('Rule')}</button><button className={dock.tab === 'cs' ? 'on' : ''} onClick={() => setDock({ ...dock, tab: 'cs' })}>{t('Change set')}{s.edits.length > 0 && <i className="cnt">{s.edits.length}</i>}</button></div>
                <span className="sp" /><button className="ib" title={t('Close')} onClick={() => setDock({ ...dock, open: false, auto: false })}><Dismiss16Regular /></button>
              </div>
              {dock.tab === 'rule' ? <div className="dock-b"><RuleEditor id={focused} fresh={fresh} onMoveTo={setMoveIds} onMoveToFolder={setFolderFor} onZone={openZone} /></div> : <>
                <div className="subtabs">{(['changes', 'preview', 'order', 'approval', 'policy'] as CsTab[]).map(k => <button key={k} className={dock.cs === k ? 'on' : ''} onClick={() => setDock({ ...dock, cs: k })}>{k === 'order' && lang === 'de' ? 'Reihenfolge' : t({ changes: 'Changes', preview: 'Preview', order: 'Write order', approval: 'Approval', policy: 'Policy' }[k])}{k === 'order' && pv.unorderable ? <Warning16Filled className="b-red" /> : null}</button>)}</div>
                <div className="dock-b">
                  {dock.cs === 'changes' && <ChangesList onFocus={jumpToRule} />}{dock.cs === 'preview' && <PreviewView pv={pv} />}{dock.cs === 'order' && <WriteOrderView pv={pv} />}
                  {dock.cs === 'approval' && <ApprovalView pv={pv} />}{dock.cs === 'policy' && <PolicyView pv={pv} />}
                </div>
              </>}
            </aside>
          )}
        </div>

        {review && <Review onClose={() => setReview(false)} onRule={jumpToRule} />}
        {showBar && <CommitBar onOpen={cs => openDock('cs', cs)} onReview={() => setReview(true)} />}
      </div>

      {palette && <Palette mode={palette} onClose={() => setPalette(false)} run={{ all: () => { setPage('rules'); setLens(null); }, rule: jumpToRule, zone: openZone, page: setPage, newRule, review: () => setReview(true), theme: toggle, lang: () => setLang(lang === 'en' ? 'de' : 'en') }} />}
      <MoveDialog ids={moveIds} onClose={() => setMoveIds(null)} />
      <SessionLayer changeSet="CHG-5120" />
      {folderFor && <FolderPicker ids={folderFor} onClose={() => setFolderFor(null)} onDone={fid => { setCollapsed(c => { const n = new Set(c); n.delete(fid); return n; }); grid.current?.clearSelection(); }} />}
    </div>
  );
}

// ---------- Commit bar: what the pending edits mean, always visible, one click to submit.
function CommitBar({ onOpen, onReview }: { onOpen: (tab: CsTab) => void; onReview: () => void }) {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv); const [em, setEm] = useState(false);
  const g = useGate(pv.affected, s.approvedBy);   // issue 38: the Commit gate per Affected Zone, and who may make an Emergency Commit
  const need = ap.byEnv.filter(x => x.env.level !== 'none'); const got = need.filter(x => s.approvedBy[x.env.id]).length;
  const deny = pv.policy.filter(p => p.effect === 'deny').length;
  if (s.state === 'Committed') return (
    <footer className="cbar done"><Checkmark12Filled /><b>{t('Committed as Version')} {s.version}</b><span>{pv.nsgs.length ? <>{t('Deployments started')}: Production (ARM), Non-production (Terraform, {t('step')} 1 {t('of')} {Math.max(1, pv.steps.length)})</> : t('Nothing to deploy: no Managed NSG changes.')}</span>{s.emergency && <span className="tag amber">{t('Emergency Commit')}: {t('awaiting approval afterwards')}</span>}<span className="sp" /><Button size="small" className="proto" onClick={s.discard}>Reset prototype</Button></footer>
  );
  return (
    <footer className={`cbar ${pv.unorderable || deny ? 'blocked' : ''}`}>
      <b>CHG-5120</b>
      <Track at={ap.eff === 'Approved' ? 3 : s.state === 'Submitted' ? 2 : 0} />
      <button onClick={() => onOpen('changes')}><b>{s.edits.length}</b>{t(s.edits.length === 1 ? 'edit' : 'edits')}</button>
      <button onClick={() => onOpen('preview')}>{pv.nsgs.length ? <><b>{pv.nsgs.length}</b>{t('Managed NSGs change')}</> : t('Nothing changes in Azure')}</button>
      {pv.nsgs.length > 0 && <button onClick={() => onOpen('order')} className={pv.unorderable ? 'bad' : ''}>{pv.unorderable ? <><Warning16Filled />{t('Cannot be ordered')}</> : <><b>{Math.max(1, pv.steps.length)}</b>{t(pv.steps.length > 1 ? 'write steps' : 'write step')}</>}</button>}
      <button onClick={() => onOpen('approval')}>{need.length ? <><b>{got}/{need.length}</b>{t('Approvals')}</> : t('No Approval needed')}</button>
      {deny > 0 && <button className="bad" onClick={() => onOpen('policy')}><ShieldError16Filled /><b>{deny}</b>{t('Policy finding blocks')}</button>}
      <span className="sp" />
      {g.commit && <span className="commit-why"><LockClosed12Regular />{t(g.commit)}</span>}
      {need.length > 0 && <Button size="small" appearance="subtle" icon={<Flash16Regular />} disabled={pv.unorderable || !!g.emergency} title={g.emergency ? t(g.emergency) : undefined} onClick={() => setEm(true)}>{t('Emergency Commit')}<StepUpLock /></Button>}
      <Button size="small" appearance="subtle" onClick={s.discard}>{t('Discard')}</Button>
      <Button size="small" onClick={onReview}>{t('Review')}</Button>
      {s.state === 'Open' && need.length > 0 && <Button size="small" appearance="primary" icon={<Send16Regular />} disabled={pv.unorderable || deny > 0} onClick={s.submit}>{t('Submit for Approval')}</Button>}
      {s.state === 'Submitted' && !ap.done && <Button size="small" className="proto" onClick={() => s.approveAs('kim', ap.byEnv.map(x => x.env.id))}>{t('Approve as kim (prototype)')}</Button>}
      {(s.state !== 'Open' || !need.length) && <Button size="small" appearance="primary" disabled={!ap.done || pv.unorderable || deny > 0 || !!g.commit} onClick={() => s.commit()}>{t('Commit')}</Button>}
      <EmergencyDialog open={em} onClose={() => setEm(false)} />
    </footer>
  );
}

// ---------- Folder picker: put Rules into a Folder, or make a new one, from one field.
function FolderPicker({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: (folderId: string) => void }) {
  const s = useStore(); const { t } = useT(); const [q, setQ] = useState(''); const [i, setI] = useState(0);
  const ql = q.trim().toLowerCase(); const list = s.folders.filter(f => !ql || f.name.toLowerCase().includes(ql)).slice(0, 9);
  const canNew = !!q.trim() && !s.folders.some(f => f.name.toLowerCase() === ql); const n = list.length + (canNew ? 1 : 0);
  const pick = (k: number) => { if (k < list.length) { if (ids.length) s.moveToFolder(ids, list[k].id); onDone(list[k].id); } else if (canNew) onDone(s.newFolder(q.trim(), ids)); onClose(); };
  return (
    <div className="pal-bg" onMouseDown={onClose}>
      <div className="pal" role="dialog" aria-label={t('Folder')} onMouseDown={e => e.stopPropagation()}>
        <input autoFocus value={q} placeholder={t(ids.length ? 'Move to a Folder, or type a new name' : 'Name of the new Folder')} onChange={e => { setQ(e.target.value); setI(0); }}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(n - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter' && n) pick(ids.length ? i : list.length); if (e.key === 'Escape') onClose(); }} />
        <div className="pal-l">
          {ids.length > 0 && list.map((f, k) => <div key={f.id} className={`pal-i ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => pick(k)}><Folder16Regular /><b>{f.name}</b><span>{s.rules.filter(r => r.folder === f.id).length} {t('Rules')}</span></div>)}
          {canNew && <div className={`pal-i ${!ids.length || i === list.length ? 'on' : ''}`} onMouseEnter={() => setI(list.length)} onClick={() => pick(list.length)}><FolderAdd16Regular /><b>{t('New Folder')} “{q.trim()}”</b><span>{ids.length ? `${ids.length} ${t('Rules')}` : t('empty, at the top')}</span></div>}
          {!canNew && !ids.length && <div className="pal-e">{t('Type a name and press Enter. Tick Rules first to put them into the new Folder.')}</div>}
        </div>
        <div className="pal-f"><kbd>↑</kbd><kbd>↓</kbd> {t('choose')} <kbd>Enter</kbd> {t('open')} <kbd>Esc</kbd> {t('close')}</div>
      </div>
    </div>
  );
}

// ---------- Jump palette (Ctrl K): every Rule, Zone and action from one field.
type Run = { all: () => void; rule: (id: string) => void; zone: (zid: string) => void; page: (p: Page) => void; newRule: () => void; review: () => void; theme: () => void; lang: () => void };
function Palette({ onClose, run, mode }: { onClose: () => void; run: Run; mode: 'all' | 'zone' }) {
  const s = useStore(); const { t } = useT(); const [q, setQ] = useState(''); const [i, setI] = useState(0);
  const items = useMemo(() => {
    const ql = q.trim().toLowerCase(); const out: { group: string; label: string; sub?: string; kind?: string; go: () => void }[] = [];
    const cmds: [string, () => void][] = [['New Rule', run.newRule], ['Review Change set', run.review], ['Go to Rule base', () => run.page('rules')], ['Go to Zones', () => run.page('zones')],
      ['Go to Objects', () => run.page('objects')], ['Go to Change sets', () => run.page('sets')], ['Go to Admin', () => run.page('admin')], ['Switch light and dark mode', run.theme], ['Switch language', run.lang]];
    if (mode === 'zone') out.push({ group: 'Actions', label: t('All Zones: show the whole Rule base'), go: run.all });
    else cmds.filter(([l]) => !ql || t(l).toLowerCase().includes(ql)).slice(0, ql ? 4 : 8).forEach(([l, go]) => out.push({ group: 'Actions', label: t(l), go }));
    if (ql) {
      const num = mode === 'zone' ? null : /^#?(\d+)$/.exec(ql);
      if (num) { const r = s.rules.filter(x => !s.status.get(x.id)?.deleted)[Number(num[1]) - 1]; if (r) out.push({ group: 'Rules', label: r.name, sub: `${t('No.')} ${num[1]}`, go: () => run.rule(r.id) }); }
      let n = mode === 'zone' ? 6 : 0; for (const r of s.rules) { if (n >= 6) break; if (r.name.toLowerCase().includes(ql) || r.id.toLowerCase() === ql) { out.push({ group: 'Rules', label: r.name, sub: `${t('No.')} ${s.numbers.get(r.id)}`, go: () => run.rule(r.id) }); n++; } }
      n = 0; for (const z of zones) { if (n >= (mode === 'zone' ? 10 : 6)) break; if (z.name.includes(ql) || z.prefix.startsWith(ql)) { out.push({ group: 'Zones', label: z.name, sub: `${z.prefix}, ${z.vnet}`, kind: 'zone', go: () => run.zone(z.id) }); n++; } }
    }
    if (mode === 'zone' && !ql) zones.slice(0, 10).forEach(z => out.push({ group: 'Zones', label: z.name, sub: `${z.prefix}, ${z.vnet}`, kind: 'zone', go: () => run.zone(z.id) }));
    return out;
  }, [q]);
  useEffect(() => setI(0), [q]);
  const pick = (k: number) => { items[k]?.go(); onClose(); };
  return (
    <div className="pal-bg" onMouseDown={onClose}>
      <div className="pal" role="dialog" aria-label={t('Jump to')} onMouseDown={e => e.stopPropagation()}>
        <input autoFocus value={q} placeholder={t(mode === 'zone' ? 'Zone name or address prefix' : 'Rule name, number or ID, Zone, or an action')} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(items.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter') pick(i); if (e.key === 'Escape') onClose(); }} />
        <div className="pal-l">
          {items.map((it, k) => <div key={k}>{(k === 0 || items[k - 1].group !== it.group) && <div className="pal-g">{t(it.group)}</div>}
            <div className={`pal-i ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => pick(k)}>{it.kind && <Glyph kind="zone" />}<b>{it.label}</b>{it.sub && <span>{it.sub}</span>}</div></div>)}
          {!items.length && <div className="pal-e">{t('Nothing matches. Try a Rule number like 42, a Zone name or an address prefix.')}</div>}
        </div>
        <div className="pal-f"><kbd>↑</kbd><kbd>↓</kbd> {t('choose')} <kbd>Enter</kbd> {t('open')} <kbd>Esc</kbd> {t('close')}</div>
      </div>
    </div>
  );
}
