// PROTOTYPE, throwaway. Variant A, "Classic console": left navigation, full-width Rule base, Commit button opens a large pending-changes drawer.
import { useRef, useState } from 'react';
import { Button, OverlayDrawer, DrawerHeader, DrawerHeaderTitle, DrawerBody, DrawerFooter, TabList, Tab, Switch, InlineDrawer, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components';
import { ChevronDown12Regular, Dismiss20Regular, TextBulletListSquare20Regular, Box20Regular, Grid20Regular, BranchFork20Regular, History20Regular, Library20Regular } from '@fluentui/react-icons';
import { RuleGrid, RuleGridHandle } from '../RuleGrid';
import { ZoneGrid } from '../ZoneGrid';
import { ObjectPicker } from '../ObjectPicker';
import { ChangesList, PreviewView, WriteOrderView, ApprovalView, PolicyView, CsActions, ChangeSetList, InboxButton, MoveDialog, usePreview, useApproval } from '../ChangeViews';
import { Brand, LangSwitch, Me, BulkBar, useDebounced, reportReady } from '../bits';
import { useStore } from '../store';
import { useT } from '../i18n';

export const name = 'Classic console';
export default function VariantA() {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv);
  const [page, setPage] = useState('rules'); const [drawer, setDrawer] = useState(false); const [tab, setTab] = useState('changes');
  const [sel, setSel] = useState<string[]>([]); const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [q, dq, setQ] = useDebounced(); const [sys, setSys] = useState(true); const [lib, setLib] = useState(false); const [libSel, setLibSel] = useState<string[]>([]);
  const grid = useRef<RuleGridHandle>(null);
  const counts: Record<string, string> = { rules: '10,000', objects: '9,742', zones: '20,000', sets: '5' };
  const nav = [['rules', 'Rule base', <TextBulletListSquare20Regular />], ['objects', 'Objects', <Box20Regular />], ['zones', 'Zones', <Grid20Regular />], ['sets', 'Change sets', <BranchFork20Regular />]] as const;
  return (
    <div className="va">
      <header className="hdr">
        <Brand />
        <Menu><MenuTrigger disableButtonEnhancement><button className="cs-pill"><span className={`dot ${ap.eff}`} />CHG-5120 Release app0042<span className="cnt">{s.edits.length} {t('Changes').toLowerCase()}</span><ChevronDown12Regular /></button></MenuTrigger>
          <MenuPopover><MenuList><MenuItem>CHG-5120 Release app0042</MenuItem><MenuItem onClick={() => setPage('sets')}>{t('Change sets')}…</MenuItem></MenuList></MenuPopover></Menu>
        <span style={{ flex: 1 }} />
        <span className="version">{t('Version')} {s.version}</span>
        <button className="commit-btn" onClick={() => { setDrawer(true); setTab(s.edits.length ? 'preview' : 'changes'); }}>{t('Review and commit')}{s.edits.length > 0 && <span className="n">{s.edits.length}</span>}</button>
        <InboxButton /><LangSwitch /><Me />
      </header>
      <div className="va-body">
        <nav className="va-nav">
          {nav.map(([k, label, icon]) => <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{icon}<span>{t(label)}</span><span className="cnt">{counts[k]}</span></button>)}
          <div className="va-nav-later"><History20Regular /><div>{t('Deployments, Drift, audit…')}</div><div>{t('later prototype')}</div></div>
        </nav>
        <main className="va-main">
          {page === 'rules' && <>
            <div className="pagehead"><h1>{t('Rule base')}</h1><span className="sub">{t('Rules are evaluated top-down. The first match wins.')}</span></div>
            <BulkBar sel={sel} onMoveTo={setMoveIds} quick={q} setQuick={setQ}>
              <Switch checked={sys} onChange={(_, d) => setSys(d.checked)} label={t('show system rows')} />
              <Button size="small" icon={<Library20Regular />} appearance={lib ? 'primary' : 'secondary'} onClick={() => setLib(!lib)}>{t('Object library')}</Button>
            </BulkBar>
            <div className="row" style={{ flex: 1, minHeight: 0 }}>
              <div className="gridwrap" style={{ flex: 1, minWidth: 0 }}><RuleGrid ref={grid} rows={s.rules} quick={dq} showSystem={sys} onSelection={setSel} onMoveTo={setMoveIds} onReady={reportReady('Rule base, 10,000 Rules')} /></div>
              <InlineDrawer open={lib} position="end" separator style={{ width: 360 }}>
                <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} onClick={() => setLib(false)} />}>{t('Object library')}</DrawerHeaderTitle></DrawerHeader>
                <DrawerBody><ObjectPicker value={libSel} onChange={setLibSel} mode="addr" /><p className="muted">Click a cell's Source or Destination to pick objects; the library is for browsing and search.</p></DrawerBody>
              </InlineDrawer>
            </div>
          </>}
          {page === 'zones' && <><div className="pagehead"><h1>{t('Zones')}</h1><span className="sub">{t('Every Managed NSG against its Azure limits.')}</span></div><ZoneGrid /></>}
          {page === 'objects' && <div style={{ maxWidth: 960 }}><div className="pagehead" style={{ paddingBottom: 12 }}><h1>{t('Objects')}</h1></div><ObjectPicker value={libSel} onChange={setLibSel} mode="addr" /></div>}
          {page === 'sets' && <div style={{ maxWidth: 720 }}><div className="pagehead"><h1>{t('Change sets')}</h1></div><ChangeSetList /></div>}
        </main>
      </div>
      <OverlayDrawer open={drawer} position="end" size="large" onOpenChange={(_, d) => setDrawer(d.open)}>
        <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} onClick={() => setDrawer(false)} />}>CHG-5120 Release app0042</DrawerHeaderTitle>
          <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))}>
            <Tab value="changes">{t('Changes')} ({s.edits.length})</Tab><Tab value="preview">{t('Preview')}</Tab><Tab value="order">{t('Write order')}{pv.unorderable ? ' ⛔' : pv.steps.length > 1 ? ` (${pv.steps.length})` : ''}</Tab>
            <Tab value="approval">{t('Approval')}</Tab><Tab value="policy">{t('Policy findings')} ({pv.policy.length})</Tab>
          </TabList>
        </DrawerHeader>
        <DrawerBody>
          {tab === 'changes' && <ChangesList onFocus={id => { setDrawer(false); const n = grid.current?.api()?.getRowNode(id); if (n) grid.current?.api()?.ensureNodeVisible(n, 'middle'); n?.setSelected(true); }} />}
          {tab === 'preview' && <PreviewView pv={pv} />}
          {tab === 'order' && <WriteOrderView pv={pv} />}
          {tab === 'approval' && <ApprovalView pv={pv} />}
          {tab === 'policy' && <PolicyView pv={pv} />}
        </DrawerBody>
        <DrawerFooter><CsActions pv={pv} /></DrawerFooter>
      </OverlayDrawer>
      <MoveDialog ids={moveIds} onClose={() => setMoveIds(null)} />
    </div>
  );
}
