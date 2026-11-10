// PROTOTYPE, throwaway. Variant B, "Change set workspace": you always work inside a Change set. Left: your queue; centre: the Rule base with its diff;
// right: the live Preview. Without a Change set the Rule base is read-only.
import { useState } from 'react';
import { Button, Switch, MessageBar, MessageBarBody, Accordion, AccordionItem, AccordionHeader, AccordionPanel } from '@fluentui/react-components';
import { RuleGrid } from '../RuleGrid';
import { ZoneGrid } from '../ZoneGrid';
import { ObjectPicker } from '../ObjectPicker';
import { ChangesList, PreviewView, WriteOrderView, ApprovalView, PolicyView, CsActions, ChangeSetList, InboxButton, MoveDialog, usePreview, useApproval } from '../ChangeViews';
import { Brand, LangSwitch, Me, BulkBar, useDebounced, reportReady, HeaderNav } from '../bits';
import { useStore } from '../store';
import { useT } from '../i18n';

export const name = 'Change set workspace';
const stepsOf = ['Edit Rules', 'Submit', 'Approval', 'Commit'];
export default function VariantB() {
  const s = useStore(); const { t } = useT(); const pv = usePreview(); const ap = useApproval(pv);
  const [page, setPage] = useState('rules'); const [started, setStarted] = useState(s.edits.length > 0);
  const [sel, setSel] = useState<string[]>([]); const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [q, dq, setQ] = useDebounced(); const [only, setOnly] = useState(false); const [objSel, setObjSel] = useState<string[]>([]);
  const cur = s.state === 'Committed' ? 4 : ap.eff === 'Approved' ? 3 : s.state === 'Submitted' ? 2 : started ? 1 : 0;
  return (
    <div className="vb">
      <header className="hdr">
        <Brand />
        <HeaderNav items={[['rules', t('Rule base')], ['zones', t('Zones')], ['objects', t('Objects')]]} value={page} onChange={setPage} />
        <span style={{ flex: 1 }} /><span className="version">{t('Version')} {s.version}</span><InboxButton /><LangSwitch /><Me />
      </header>
      <div className="vb-body">
        <aside className="vb-left"><ChangeSetList /></aside>
        <main className="vb-main">
          {page === 'rules' && <>
            <ol className="stepper">{stepsOf.map((x, i) => <li key={x} className={i + 1 < cur ? 'done' : i + 1 === cur ? 'on' : ''}>{t(x)}</li>)}</ol>
            {!started ? (
              <MessageBar intent="info"><MessageBarBody>{t('Start a Change set to edit')}. <Button size="small" appearance="primary" onClick={() => setStarted(true)}>{t('Start Change set')}</Button></MessageBarBody></MessageBar>
            ) : (
              <BulkBar sel={sel} onMoveTo={setMoveIds} quick={q} setQuick={setQ}><Switch checked={only} onChange={(_, d) => setOnly(d.checked)} label={t('only changed')} /></BulkBar>
            )}
            <div className="gridwrap" style={{ flex: 1, minHeight: 0, height: 'auto' }}><RuleGrid rows={s.rules} quick={dq} readOnly={!started} onlyChanged={only} showCost compactCols onSelection={setSel} onMoveTo={setMoveIds} onReady={reportReady('Rule base, 10,000 Rules')} /></div>
          </>}
          {page === 'zones' && <div style={{ paddingTop: 10, height: '100%' }}><ZoneGrid /></div>}
          {page === 'objects' && <div style={{ maxWidth: 900, paddingTop: 14 }}><ObjectPicker value={objSel} onChange={setObjSel} mode="addr" /></div>}
        </main>
        <aside className="vb-right">
          <div className="vb-right-scroll">
            {!s.edits.length ? <div className="empty"><b>{t('Preview')}</b><p>Your Change set is empty. Edit a cell, drag a Rule or use the toolbar, and the Preview builds up here as you go: which Managed NSGs change, in which order they are written, and who has to approve.</p></div> :
            <Accordion multiple collapsible defaultOpenItems={['c', 'p', 'o', 'a']}>
              <AccordionItem value="c"><AccordionHeader size="small">{t('Changes')} ({s.edits.length})</AccordionHeader><AccordionPanel><ChangesList /></AccordionPanel></AccordionItem>
              <AccordionItem value="p"><AccordionHeader size="small">{t('Preview')}</AccordionHeader><AccordionPanel><PreviewView pv={pv} /></AccordionPanel></AccordionItem>
              <AccordionItem value="o"><AccordionHeader size="small">{t('Write order')}{pv.unorderable ? ' ⛔' : ''}</AccordionHeader><AccordionPanel><WriteOrderView pv={pv} /></AccordionPanel></AccordionItem>
              <AccordionItem value="a"><AccordionHeader size="small">{t('Approval')} ({pv.affected.length} {t('Affected Zones')})</AccordionHeader><AccordionPanel><ApprovalView pv={pv} /></AccordionPanel></AccordionItem>
              <AccordionItem value="f"><AccordionHeader size="small">{t('Policy findings')} ({pv.policy.length})</AccordionHeader><AccordionPanel><PolicyView pv={pv} /></AccordionPanel></AccordionItem>
            </Accordion>}
          </div>
          <div className="vb-right-foot"><CsActions pv={pv} /></div>
        </aside>
      </div>
      <MoveDialog ids={moveIds} onClose={() => setMoveIds(null)} />
    </div>
  );
}
