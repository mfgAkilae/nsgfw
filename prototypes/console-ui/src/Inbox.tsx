// PROTOTYPE, throwaway. Issue 36: the inbox in full. The bell in the rail leads to it on the Change sets page; every row has one action.
import { useState } from 'react';
import { Button } from '@fluentui/react-components';
import { Alert20Regular } from '@fluentui/react-icons';
import { useFlow, CUR_NAME } from './flow';
import { useT } from './i18n';

type Kind = 'approval' | 'emergency' | 'conflict' | 'rejected' | 'expiry' | 'retrans';
export interface Item { id: string; kind: Kind; text: string; when: string; action: string; go: () => void }
const kinds: [Kind | 'all', string, string][] = [['all', 'All', ''], ['approval', 'Approval requests', 'amber'], ['emergency', 'Emergency Commits', 'red'], ['conflict', 'Conflicts', 'red'],
  ['rejected', 'Rejections', ''], ['expiry', 'Expiring Rules', 'amber'], ['retrans', 'Re-translation', 'amber']];
export const toneOf = (k: Kind) => kinds.find(x => x[0] === k)![2];

export function useInbox(onFilter: (k: 'expiring') => void): Item[] {
  const f = useFlow(); const out: Item[] = [];
  if (f.pending) out.push({ id: 'conflict', kind: 'conflict', text: `Your Change set “${CUR_NAME}” needs a Rebase onto Version ${f.pending.version}: ${f.pending.mode === 'full' ? 3 : 1} ${f.pending.mode === 'full' ? 'conflicts' : 'conflict'}. ${f.pending.by} committed “${f.pending.set}”.`, when: 'just now', action: 'Resolve', go: () => f.setRebaseOpen(true) });
  if (!f.decisions['cs-2'] && f.latest < 1289) out.push({ id: 'cs-2', kind: 'approval', text: 'kim asks you to approve “Q4 cleanup of expired Rules”: 63 Affected Zones, Production at four-eyes. jo approved Non-production.', when: 'yesterday 16:20', action: 'Review', go: () => f.openCs('cs-2') });
  if (!f.decisions['cs-5']) out.push({ id: 'cs-5', kind: 'emergency', text: 'sam made an Emergency Commit, Version 1287 “Hotfix: block ext-partner-0339”. It is in Azure and needs an Approval afterwards.', when: 'yesterday 09:41', action: 'Review', go: () => f.openCs('cs-5') });
  f.created.filter(c => c.author === 'nsgfw' && !f.decisions[c.id]).forEach(c => out.push({ id: c.id, kind: 'approval', text: `The tool prepared “Revert Version ${c.of}” after the Emergency Commit was rejected. It needs Approval.`, when: 'just now', action: 'Review', go: () => f.openCs(c.id) }));
  if (f.retrans && !f.decisions['rt-1']) out.push({ id: 'rt-1', kind: 'retrans', text: 'Engine 1.6.0 translates the Rule base differently in Production. The Re-translation needs your Approval; Commits that change Production wait for it.', when: 'today 06:00', action: 'Review', go: () => f.openCs('rt-1') });
  if (f.csState['cs-6'] !== 'Submitted') out.push({ id: 'cs-6', kind: 'rejected', text: 'jo rejected your Change set “Open RDP for vendor”: “Use the jump hosts, not RDP from the Internet.”', when: 'yesterday 16:02', action: 'Open', go: () => f.openCs('cs-6') });
  out.push({ id: 'exp', kind: 'expiry', text: '14 of your Rules expire within 7 days. The tool turns expired allow Rules off without Approval; expired deny Rules get a Change set.', when: 'today 07:00', action: 'Show Rules', go: () => onFilter('expiring') });
  return out;
}

export function InboxList({ onFilter }: { onFilter: (k: 'expiring') => void }) {
  const { t } = useT(); const items = useInbox(onFilter); const [k, setK] = useState<Kind | 'all'>('all');
  const shown = items.filter(i => k === 'all' || i.kind === k);
  return (<>
    <div className="chipbar inbox-chips">{kinds.map(([key, label]) => { const n = key === 'all' ? items.length : items.filter(i => i.kind === key).length;
      return <button key={key} className={`chip ${k === key ? 'on' : ''} ${n ? '' : 'zero'}`} disabled={!n && k !== key} onClick={() => setK(key)}>{t(label)}<i>{n}</i></button>; })}</div>
    <div className="sheet todo">{shown.map(i => <div key={i.id} className="todo-r inbox-r"><span className={`tag ${toneOf(i.kind)}`}>{t(kinds.find(x => x[0] === i.kind)![1])}</span>
      <span>{t(i.text)}<span className="muted"> · {t(i.when)}</span></span><Button size="small" appearance={i.kind === 'conflict' || i.kind === 'approval' || i.kind === 'emergency' ? 'primary' : 'secondary'} onClick={i.go}>{t(i.action)}</Button></div>)}
      {!shown.length && <div className="empty" style={{ padding: 16 }}><b>{t('Nothing waits for you.')}</b></div>}</div>
  </>);
}

export function InboxBell({ onOpen }: { onOpen: () => void }) {
  const { t } = useT(); const n = useInbox(() => {}).length;
  return <button className="rail-i" aria-label={t('Inbox')} title={t('Inbox')} onClick={onOpen}><Alert20Regular />{n > 0 && <span className="pip">{n}</span>}</button>;
}
